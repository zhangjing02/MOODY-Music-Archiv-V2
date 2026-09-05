#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MOODY - 云端存量历史音频智能冷备、码率分流与安全同步引擎 (V2)
设计原则：
1. 绝对防丢保障 (Zero Data Loss): 云端原文件首先完整拉取至本地 backend/r2_recovered_320k/ 永久冷备
2. 智能码率分流 (Smart Bitrate Gating):
   - 若原音频为高码率 (码率 > 170kbps，如 320k 母带)：执行 160kbps CBR 紧凑转码并上传覆盖 R2，透明瘦身 50%~60%
   - 若原音频已为紧凑码率 (码率 <= 170kbps，如原存量 128k/144k)：保持云端原文件，坚决拒绝向高码率反向膨胀 (+30% bloat) 且避免二次有损转码
3. 状态机全量纳管: 本地 catalog_sync.db 统一点亮为 R2_UPLOADED, is_compressed=1, 确保明晨 8 点全量曲库无缝点亮
"""

import os
import sys
import json
import time
import urllib.parse
import sqlite3
import requests
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = r"e:\Workspace\AI-Project\MoodyMusic-Workspace\backend"
RECOVERED_DIR = os.path.join(BASE_DIR, "r2_recovered_320k")
OPTIMIZED_DIR = os.path.join(BASE_DIR, "downloads_optimized")
DB_PATH = os.path.join(BASE_DIR, "database", "catalog_sync.db")

API_BASE = "https://m-api.changgepd.ccwu.cc"
UPLOAD_URL = f"{API_BASE}/api/admin/assets/upload"

PROXIES = {
    'http': 'http://127.0.0.1:7897',
    'https': 'http://127.0.0.1:7897'
}

sys.path.append(os.path.join(BASE_DIR, "scripts"))
from compress_engine import transcode_to_160k, inspect_audio_details

def download_original(r2_key: str, local_save_path: str) -> bool:
    """拉取 R2 历史音频至本地永久冷备"""
    if os.path.exists(local_save_path) and os.path.getsize(local_save_path) > 100 * 1024:
        return True

    os.makedirs(os.path.dirname(local_save_path), exist_ok=True)
    temp_save = local_save_path + ".download.tmp"
    url = f"{API_BASE}/storage/{urllib.parse.quote(r2_key)}"

    try:
        resp = requests.get(url, proxies=PROXIES, stream=True, timeout=60)
        if resp.status_code != 200:
            print(f"  ❌ 下载失败: HTTP {resp.status_code} ({url})", flush=True)
            return False

        with open(temp_save, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=128 * 1024):
                if chunk:
                    f.write(chunk)

        if os.path.exists(temp_save) and os.path.getsize(temp_save) > 100 * 1024:
            if os.path.exists(local_save_path):
                os.remove(local_save_path)
            os.rename(temp_save, local_save_path)
            return True
        else:
            if os.path.exists(temp_save):
                os.remove(temp_save)
            return False
    except Exception as e:
        print(f"  ❌ 下载异常: {e}", flush=True)
        if os.path.exists(temp_save):
            os.remove(temp_save)
        return False

def upload_160k_overwrite(local_file: str, r2_key: str) -> bool:
    """上传 160k 转码音频至 R2，同名覆盖原始对象"""
    parts = r2_key.split('/')
    if len(parts) < 2:
        return False

    category = "/".join(parts[:-1])
    filename = parts[-1]

    try:
        with open(local_file, 'rb') as f:
            files = {
                'file': (filename, f, 'audio/mpeg')
            }
            data = {
                'category': category,
                'filename': filename
            }
            resp = requests.post(UPLOAD_URL, data=data, files=files, proxies=PROXIES, timeout=60)

        if resp.status_code == 200:
            res_json = resp.json()
            if res_json.get('code') == 200:
                return True
            else:
                print(f"  ❌ 上传接口返回错误: {res_json}", flush=True)
                return False
        else:
            print(f"  ❌ 上传 HTTP 错误: {resp.status_code}", flush=True)
            return False
    except Exception as e:
        print(f"  ❌ 上传异常: {e}", flush=True)
        return False

def update_db(song_id: int, local_mp3: str, r2_mp3_key: str, bitrate: int, file_size: int):
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        UPDATE tracks_sync_state
        SET status = 'R2_UPLOADED',
            is_compressed = 1,
            bitrate_kbps = ?,
            file_size = ?,
            local_mp3 = ?,
            r2_mp3_key = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE song_id = ?
    """, (bitrate, file_size, local_mp3, r2_mp3_key, song_id))
    conn.commit()
    conn.close()

def process_single_track(item: dict, force_160k: bool = False) -> dict:
    sid = item['song_id']
    art = item['artist']
    alb = item['album']
    title = item['title']
    r2_key = item['r2_key']

    rel_key_path = r2_key.replace("music/", "")
    parts = [p.replace(':', '_').replace('?', '_').replace('*', '_').replace('"', '_') for p in rel_key_path.split('/')]
    safe_rel_path = os.sep.join(parts)
    local_cold = os.path.join(RECOVERED_DIR, safe_rel_path)
    local_opt = os.path.join(OPTIMIZED_DIR, safe_rel_path)

    # 1. 下载原音频冷备
    ok_dl = download_original(r2_key, local_cold)
    if not ok_dl:
        return {'status': 'FAILED_DOWNLOAD', 'item': item}

    orig_sz = os.path.getsize(local_cold)
    audio_info = inspect_audio_details(local_cold)
    orig_br = audio_info.get('bitrate_kbps') or 128

    # 2. 判断是否需要转码
    needs_transcode = force_160k or (orig_br > 170)

    if needs_transcode:
        # 高码率曲目：转码 160k 并覆盖云端
        ok_trans = transcode_to_160k(local_cold, local_opt)
        if not ok_trans:
            return {'status': 'FAILED_TRANSCODE', 'item': item}

        opt_sz = os.path.getsize(local_opt)
        ok_up = upload_160k_overwrite(local_opt, r2_key)
        if not ok_up:
            return {'status': 'FAILED_UPLOAD', 'item': item}

        update_db(sid, local_cold, r2_key, 160, opt_sz)
        return {
            'status': 'TRANSCODED_AND_OVERWRITTEN',
            'item': item,
            'orig_br': orig_br,
            'orig_sz': orig_sz,
            'new_sz': opt_sz,
            'saved_bytes': orig_sz - opt_sz
        }
    else:
        # 已为紧凑码率：保留原文件，避免反向膨胀，更新数据库状态机纳管
        update_db(sid, local_cold, r2_key, orig_br, orig_sz)
        return {
            'status': 'PRESERVED_COMPACT',
            'item': item,
            'orig_br': orig_br,
            'orig_sz': orig_sz,
            'new_sz': orig_sz,
            'saved_bytes': 0
        }

def run_pipeline(limit: int = None, force_160k: bool = False, workers: int = 4):
    print("=" * 80, flush=True)
    print("💎 MOODY - 存量历史音频智能冷备、分流与曲库状态同步引擎 (V2)", flush=True)
    print(f"⚙️ 运行参数: 并发数={workers}, 强制160k={force_160k}, 处理上限={limit or '全量'}", flush=True)
    print("=" * 80, flush=True)

    input_json = os.path.join(BASE_DIR, "r2_historical_pending_found.json")
    if not os.path.exists(input_json):
        print(f"❌ 未找到待处理清单: {input_json}", flush=True)
        return

    with open(input_json, 'r', encoding='utf-8') as f:
        tracks = json.load(f)

    # 排除已是 R2_UPLOADED 且 is_compressed=1 的曲目
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT song_id FROM tracks_sync_state WHERE status = 'R2_UPLOADED' AND is_compressed = 1")
    done_sids = set(r[0] for r in cur.fetchall())
    conn.close()

    pending = [t for t in tracks if t['song_id'] not in done_sids]
    print(f"📋 历史曲目总数: {len(tracks)} 首 | 已经处理完成: {len(done_sids)} 首 | 本次待处理: {len(pending)} 首", flush=True)

    if not pending:
        print("🎉 所有历史存量音频已 100% 纳管并就绪！", flush=True)
        return

    if limit and limit > 0:
        pending = pending[:limit]
        print(f"⚡ 本批次计划处理: {len(pending)} 首", flush=True)

    t_start = time.time()
    results = []

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(process_single_track, item, force_160k): item for item in pending}
        done_count = 0
        for fut in as_completed(futures):
            res = fut.result()
            results.append(res)
            done_count += 1
            item = res['item']
            st = res['status']

            if st == 'TRANSCODED_AND_OVERWRITTEN':
                saved = res['saved_bytes'] / (1024 * 1024)
                print(f"[{done_count}/{len(pending)}] 🗜️ 转码覆盖: {item['artist']} - 《{item['album']}》 - {item['title']} ({res['orig_br']}k->160k, 瘦身 {saved:.2f}MB)", flush=True)
            elif st == 'PRESERVED_COMPACT':
                print(f"[{done_count}/{len(pending)}] 🛡️ 保持紧凑: {item['artist']} - 《{item['album']}》 - {item['title']} (原码率 {res['orig_br']}k, 体积 {res['orig_sz']/(1024*1024):.2f}MB, 避免反向膨胀, 状态已纳管)", flush=True)
            else:
                print(f"[{done_count}/{len(pending)}] ❌ 处理失败 ({st}): {item['artist']} - {item['title']}", flush=True)

    t_elapsed = time.time() - t_start
    print("\n" + "=" * 80, flush=True)
    print("🏁 批次执行汇报：", flush=True)
    transcoded = sum(1 for r in results if r['status'] == 'TRANSCODED_AND_OVERWRITTEN')
    preserved = sum(1 for r in results if r['status'] == 'PRESERVED_COMPACT')
    failed = sum(1 for r in results if 'FAILED' in r['status'])
    total_saved = sum(r.get('saved_bytes', 0) for r in results) / (1024 * 1024)

    print(f"  ✨ 高码率转码覆盖: {transcoded} 首 (净瘦身: {total_saved:.2f} MB)", flush=True)
    print(f"  🛡️ 原生紧凑保留纳管: {preserved} 首 (零反向膨胀，母带已永久冷备至本地)", flush=True)
    print(f"  ❌ 异常失败: {failed} 首", flush=True)
    print(f"  ⏱️ 耗时: {t_elapsed:.1f} 秒", flush=True)
    print("=" * 80, flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force-160k", action="store_true")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    run_pipeline(limit=args.limit, force_160k=args.force_160k, workers=args.workers)
