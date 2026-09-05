#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
扫描本地 backend/downloads/ 目录下的所有 MP3 与 LRC 歌词
与本地数据库 catalog_sync.db 进行智能繁简模糊比对与登记
将就绪的歌曲状态更新为 DOWNLOADED，准备进行 R2 异步前置推送
"""

import os
import sys
import glob
import re
import sqlite3
import time

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "catalog_sync.db")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")

# 繁简与别名映射表
T2S_MAP = {
    '愛': '爱', '來': '来', '後': '后', '為': '为', '與': '与', '時': '时', '開': '开', '無': '无',
    '國': '国', '語': '语', '產': '产', '學': '学', '長': '长', '點': '点', '變': '变', '電': '电',
    '動': '动', '聽': '听', '這': '这', '過': '过', '寫': '写', '會': '会', '經': '经', '關': '关',
    '們': '们', '傳': '传', '錄': '录', '機': '机', '觀': '观', '場': '场', '實': '实', '驗': '验',
    '斷': '断', '種': '种', '類': '类', '難': '难', '優': '优', '態': '态', '響': '响', '應': '应',
    '繫': '续', '調': '调', '轉': '转', '遙': '遥', '麵': '面', '彎': '弯', '單': '单', '願': '愿',
    '義': '义', '務': '务', '標': '标', '遠': '远', '選': '选', '邊': '边', '處': '处', '風': '风',
    '頭': '头', '門': '门', '間': '间', '題': '题', '導': '导', '讓': '让', '識': '识', '設': '设',
    '屬': '属', '據': '据', '築': '筑', '緊': '紧', '陳': '陈', '蓋': '盖', '舉': '举', '壓': '压',
    '質': '质', '儘': '尽', '護': '护', '戲': '戏', '臺': '台', '鄉': '乡', '現': '现', '規': '规',
    '視': '视', '藝': '艺', '價': '价', '證': '证', '獨': '独', '劇': '剧', '歲': '岁', '備': '备',
    '敵': '敌', '繼': '继', '續': '续', '紅': '红', '幾': '几', '說': '说', '妳': '你', '葉': '叶',
    '惠': '惠', '美': '美', '傷': '伤', '懷': '怀', '樂': '乐', '發': '发', '現': '现', '夢': '梦'
}

ARTIST_ALIASES = {
    '蔡依林': 'JOLIN蔡依林',
    'JOLIN': 'JOLIN蔡依林',
    'G.E.M.邓紫棋': '邓紫棋',
    'G.E.M.': '邓紫棋',
    'David Tao': '陶喆',
    'Fish Leong': '梁静茹',
    'JJ Lin': '林俊杰',
    'Eason Chan': '陈奕迅',
    'Stefanie Sun': '孙燕姿',
    'Jay Chou': '周杰伦'
}

def normalize(text: str) -> str:
    if not text:
        return ""
    text = text.lower().strip()
    # 去除常见标点符号、空格、括号、点
    text = re.sub(r'[ \t\n\r\-_\—·、，,。．\.;:：:！!？?（\(\)\[\]【】《》〈〉\'\"’‘]', '', text)
    return ''.join(T2S_MAP.get(c, c) for c in text)

def scan_and_register():
    print("=" * 80)
    print(f"🔍 开始扫描本地音频并智能匹配登记: {DOWNLOADS_DIR}")
    print("=" * 80)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. 载入已知歌手与专辑
    known_artists_raw = cur.execute("SELECT id, name FROM artists").fetchall()
    artist_name_to_id = {row[1]: row[0] for row in known_artists_raw}
    norm_artist_to_raw = {normalize(row[1]): row[1] for row in known_artists_raw}

    for alias, canon in ARTIST_ALIASES.items():
        norm_artist_to_raw[normalize(alias)] = canon

    # 载入已有曲目字典
    # catalog[(norm_art, norm_alb, norm_title)] -> song_id
    rows = cur.execute("""
        SELECT song_id, artist_name, album_title, song_title, status, r2_mp3_key
        FROM tracks_sync_state
    """).fetchall()

    catalog_full = {}
    catalog_by_art_title = {} # (norm_art, norm_title) -> list of (norm_alb, song_id, status)
    max_song_id = 0

    for sid, art, alb, title, st, r2k in rows:
        if sid > max_song_id:
            max_song_id = sid
        na, nal, nt = normalize(art), normalize(alb), normalize(title)
        catalog_full[(na, nal, nt)] = (sid, art, alb, title, st, r2k)
        if (na, nt) not in catalog_by_art_title:
            catalog_by_art_title[(na, nt)] = []
        catalog_by_art_title[(na, nt)].append((nal, sid, art, alb, title, st, r2k))

    # 2. 遍历 downloads 下所有 MP3
    mp3_files = sorted(glob.glob(os.path.join(DOWNLOADS_DIR, "*.mp3")))
    total_files = len(mp3_files)
    print(f"📦 本地 downloads 目录共检索到 {total_files} 个 MP3 文件")

    matched_count = 0
    supplemented_count = 0
    unmatched = []

    for idx, mp3_path in enumerate(mp3_files, 1):
        filename = os.path.basename(mp3_path)
        base = filename[:-4]
        
        # 排除临时片段
        if base.startswith("temp_") or "snippet" in base:
            continue

        parts = base.split('-')
        s_title = ""
        art = ""
        alb = ""

        # 智能拆分文件名中的 歌名-歌手-专辑
        # 先寻找歌手名位置
        artist_idx = -1
        for i, p in enumerate(parts):
            if normalize(p) in norm_artist_to_raw:
                artist_idx = i
                break

        if artist_idx > 0 and artist_idx < len(parts) - 1:
            s_title = '-'.join(parts[:artist_idx]).strip()
            art = parts[artist_idx].strip()
            alb = '-'.join(parts[artist_idx+1:]).strip()
        elif len(parts) >= 3:
            s_title = parts[0].strip()
            art = parts[1].strip()
            alb = '-'.join(parts[2:]).strip()
        else:
            unmatched.append((filename, "无法解析为 歌名-歌手-专辑"))
            continue

        norm_art = normalize(art)
        if norm_art in norm_artist_to_raw:
            canon_art = norm_artist_to_raw[norm_art]
            norm_art = normalize(canon_art)
        else:
            canon_art = art

        norm_alb = normalize(alb)
        norm_title = normalize(s_title)

        matched_sid = None
        target_art = canon_art
        target_alb = alb
        target_title = s_title

        # 比对策略 1: 完整匹配 (歌手 + 专辑 + 歌名)
        if (norm_art, norm_alb, norm_title) in catalog_full:
            matched_sid, target_art, target_alb, target_title, _, _ = catalog_full[(norm_art, norm_alb, norm_title)]
        # 比对策略 2: 歌手 + 歌名 精确匹配（专辑可能有细微版本差异，如"18..." 与 "18"）
        elif (norm_art, norm_title) in catalog_by_art_title:
            candidates = catalog_by_art_title[(norm_art, norm_title)]
            # 优先挑专辑名归一化包含的
            best_cand = None
            for c in candidates:
                c_nalb = c[0]
                if c_nalb in norm_alb or norm_alb in c_nalb:
                    best_cand = c
                    break
            if not best_cand:
                best_cand = candidates[0]
            matched_sid, target_art, target_alb, target_title, _, _ = best_cand[1:]
        else:
            # 策略 3: 部分包含模糊比对
            for (c_na, c_nt), cand_list in catalog_by_art_title.items():
                if c_na == norm_art:
                    if (c_nt in norm_title or norm_title in c_nt) and len(c_nt) >= 2:
                        matched_sid, target_art, target_alb, target_title, _, _ = cand_list[0][1:]
                        break

        # 如果匹配到了已有骨架歌曲
        file_size = os.path.getsize(mp3_path)
        lrc_path = os.path.join(DOWNLOADS_DIR, f"{base}.lrc")
        has_lrc = os.path.exists(lrc_path)

        if matched_sid:
            r2_mp3_key = f"music/{target_art}/{target_alb}/s_{matched_sid}.mp3"
            r2_lrc_key = f"music/{target_art}/{target_alb}/s_{matched_sid}.lrc" if has_lrc else None

            cur.execute("""
                UPDATE tracks_sync_state
                SET local_mp3 = ?,
                    local_lrc = ?,
                    file_size = ?,
                    r2_mp3_key = ?,
                    r2_lrc_key = ?,
                    status = CASE WHEN status = 'R2_UPLOADED' THEN 'R2_UPLOADED' ELSE 'DOWNLOADED' END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE song_id = ?
            """, (mp3_path, lrc_path if has_lrc else None, file_size, r2_mp3_key, r2_lrc_key, matched_sid))
            matched_count += 1
        else:
            # 策略 4: 新歌/未收录骨架歌曲自动登记入库（例如《最伟大的作品》后续新增曲目）
            max_song_id += 1
            new_sid = max_song_id
            r2_mp3_key = f"music/{target_art}/{target_alb}/s_{new_sid}.mp3"
            r2_lrc_key = f"music/{target_art}/{target_alb}/s_{new_sid}.lrc" if has_lrc else None

            cur.execute("""
                INSERT OR REPLACE INTO tracks_sync_state (
                    song_id, artist_name, album_title, song_title,
                    local_mp3, local_lrc, file_size, r2_mp3_key, r2_lrc_key,
                    status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DOWNLOADED', CURRENT_TIMESTAMP)
            """, (new_sid, target_art, target_alb, target_title, mp3_path, lrc_path if has_lrc else None, file_size, r2_mp3_key, r2_lrc_key))
            supplemented_count += 1

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM tracks_sync_state WHERE status = 'DOWNLOADED'")
    total_downloaded = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM tracks_sync_state WHERE status = 'R2_UPLOADED'")
    total_uploaded = cur.fetchone()[0]

    print("=" * 80)
    print("✅ 本地音频扫描与状态登记完成！")
    print(f"📊 骨架精准匹配: {matched_count} 首 | 动态补登新歌: {supplemented_count} 首")
    print(f"🚀 待上传 R2 就绪总数 (DOWNLOADED): {total_downloaded} 首")
    print(f"☁️ 已上传 R2 存量数 (R2_UPLOADED): {total_uploaded} 首")
    if unmatched:
        print(f"⚠️ 无法解析文件数: {len(unmatched)}")
        for u in unmatched[:5]:
            print(f"  • {u[0]}: {u[1]}")
    print("=" * 80)
    conn.close()

if __name__ == "__main__":
    scan_and_register()
