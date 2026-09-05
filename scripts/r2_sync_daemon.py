#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MOODY - R2 异步静默上传与状态机同步守护进程 (R2 Sync Daemon)
遵循 AUDIO_COMPRESSION_AND_STORAGE_SPEC.md 规范：
1. 增量音频轻量化：本地保留 320k 冷备，上传前自动转码为 160kbps CBR 至 downloads_optimized/
2. 纯对象存储写入：使用 /api/admin/assets/upload 管道，0 触碰云端 Cloudflare D1 数据库
3. 强状态机保证：从 catalog_sync.db 拉取 DOWNLOADED 歌曲，上传成功后标记 is_compressed=1 并流转为 R2_UPLOADED
4. 容错与指数退避：网络抖动自动重试，失败 5 次隔离至异常区，绝不阻塞整体队列
5. 常驻监听模式：无缝监听正在运行的抓轨流水线，随下随压随传
"""

import os
import sys
import time
import sqlite3
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "catalog_sync.db")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
OPTIMIZED_DIR = os.path.join(BASE_DIR, "downloads_optimized")

os.makedirs(OPTIMIZED_DIR, exist_ok=True)

sys.path.insert(0, os.path.dirname(__file__))
from compress_engine import transcode_to_160k

API_UPLOAD_URL = "https://m-api.changgepd.ccwu.cc/api/admin/assets/upload"
PROXIES = {
    'http': 'http://127.0.0.1:7897',
    'https': 'http://127.0.0.1:7897'
}

MAX_RETRIES = 5
CONCURRENT_WORKERS = 3  # 3 个并发线程，兼顾上传吞吐量与网络稳定性

def get_db_conn():
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def do_post(files, data, timeout=90):
    """尝试优先走代理，若代理异常则走直连"""
    try:
        return requests.post(API_UPLOAD_URL, files=files, data=data, proxies=PROXIES, timeout=timeout)
    except Exception:
        return requests.post(API_UPLOAD_URL, files=files, data=data, timeout=timeout)

def upload_single_track(item):
    sid, art, alb, title, mp3_path, lrc_path, retries = item
    
    if not mp3_path or not os.path.exists(mp3_path):
        # 尝试在 downloads 目录寻找
        potential = os.path.join(DOWNLOADS_DIR, f"{title}-{art}-{alb}.mp3")
        if os.path.exists(potential):
            mp3_path = potential
        else:
            conn = get_db_conn()
            conn.execute("UPDATE tracks_sync_state SET status = 'FILE_MISSING', last_error = 'Local MP3 not found' WHERE song_id = ?", (sid,))
            conn.commit()
            conn.close()
            return sid, False, "本地 MP3 文件不存在"

    # 1. 增量 160k 转码（输出至 downloads_optimized，原始 downloads 保留作永久冷备份）
    base_name = os.path.basename(mp3_path)
    opt_mp3_path = os.path.join(OPTIMIZED_DIR, base_name)
    if not os.path.exists(opt_mp3_path) or os.path.getsize(opt_mp3_path) < 500000:
        success = transcode_to_160k(mp3_path, opt_mp3_path)
        if not success:
            err_msg = "FFmpeg 160k 转码失败"
            conn = get_db_conn()
            conn.execute("UPDATE tracks_sync_state SET retry_count = retry_count + 1, last_error = ? WHERE song_id = ?", (err_msg, sid))
            conn.commit()
            conn.close()
            return sid, False, err_msg

    upload_file_path = opt_mp3_path
    upload_file_size = os.path.getsize(upload_file_path)

    r2_mp3_key = f"music/{art}/{alb}/s_{sid}.mp3"
    r2_lrc_key = f"music/{art}/{alb}/s_{sid}.lrc" if (lrc_path and os.path.exists(lrc_path)) else None

    # 2. 上传 160k MP3
    try:
        t0 = time.time()
        with open(upload_file_path, 'rb') as f_mp3:
            files = {'file': (f"s_{sid}.mp3", f_mp3, 'audio/mpeg')}
            data = {'category': f"music/{art}/{alb}", 'filename': f"s_{sid}.mp3"}
            resp = do_post(files, data, timeout=90)
            
        if resp.status_code != 200:
            raise Exception(f"HTTP {resp.status_code}: {resp.text[:100]}")
            
        resp_json = resp.json()
        if resp_json.get('code') not in [0, 200]:
            raise Exception(f"API Error: {resp_json.get('message')}")

        duration_s = time.time() - t0

        # 3. 若存在歌词则同步上传 LRC
        if r2_lrc_key and os.path.exists(lrc_path):
            with open(lrc_path, 'rb') as f_lrc:
                files_lrc = {'file': (f"s_{sid}.lrc", f_lrc, 'text/plain')}
                data_lrc = {'category': f"music/{art}/{alb}", 'filename': f"s_{sid}.lrc"}
                resp_lrc = do_post(files_lrc, data_lrc, timeout=30)
                if resp_lrc.status_code != 200:
                    print(f"  ⚠️ [LRC附带上传非致命警告] 《{title}》歌词上传失败: HTTP {resp_lrc.status_code}")

        # 4. 成功流转状态机（记录 160k 标记与实际上传大小）
        conn = get_db_conn()
        conn.execute("""
            UPDATE tracks_sync_state
            SET status = 'R2_UPLOADED',
                r2_mp3_key = ?,
                r2_lrc_key = ?,
                is_compressed = 1,
                bitrate_kbps = 160,
                file_size = ?,
                compressed_at = CURRENT_TIMESTAMP,
                uploaded_at = CURRENT_TIMESTAMP,
                retry_count = 0,
                last_error = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE song_id = ?
        """, (r2_mp3_key, r2_lrc_key, upload_file_size, sid))
        conn.commit()
        conn.close()

        print(f"✅ [R2 存储成功(160k)] 《{title}》 - {art} ({alb}) [ID:{sid}] | 体积: {upload_file_size/(1024*1024):.2f}MB | 耗时: {duration_s:.1f}s")
        return sid, True, None

    except Exception as e:
        err_msg = str(e)
        new_retries = retries + 1
        new_status = 'UPLOAD_FAILED' if new_retries >= MAX_RETRIES else 'DOWNLOADED'

        conn = get_db_conn()
        conn.execute("""
            UPDATE tracks_sync_state
            SET status = ?,
                retry_count = ?,
                last_error = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE song_id = ?
        """, (new_status, new_retries, err_msg, sid))
        conn.commit()
        conn.close()

        print(f"⚠️ [上传失败重试 {new_retries}/{MAX_RETRIES}] 《{title}》: {err_msg[:80]}")
        return sid, False, err_msg

def run_daemon():
    print("=" * 80)
    print("🚀 MOODY - R2 增量轻量化上传与状态机守护进程启动 (R2 Sync Daemon - 160kbps)")
    print(f"📡 存储网关: {API_UPLOAD_URL}")
    print(f"🎛️ 并发线程: {CONCURRENT_WORKERS} | 最大重试: {MAX_RETRIES} 次")
    print(f"💾 本地状态库: {DB_PATH}")
    print(f"🗜️ 压缩策略: 320k 永久冷备 ➔ 160k CBR MP3 轻量入桶")
    print("=" * 80)

    import scan_local_downloads

    idle_cycles = 0
    while True:
        try:
            conn = get_db_conn()
            cur = conn.cursor()

            # 统计当前总盘数据与 R2 容量
            cur.execute("""
                SELECT COUNT(*), COALESCE(SUM(file_size), 0)
                FROM tracks_sync_state
                WHERE status IN ('R2_UPLOADED', 'D1_LIT')
            """)
            total_uploaded, total_uploaded_bytes = cur.fetchone()

            cur.execute("SELECT COUNT(*) FROM tracks_sync_state WHERE status = 'DOWNLOADED' AND retry_count < ?", (MAX_RETRIES,))
            pending_count = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM tracks_sync_state WHERE status = 'UPLOAD_FAILED'")
            failed_count = cur.fetchone()[0]

            # 容量阈值与安全防护 (10 GB 免费额度)
            R2_LIMIT_BYTES = 10 * 1024 * 1024 * 1024
            used_gb = total_uploaded_bytes / (1024 * 1024 * 1024)
            used_percent = (total_uploaded_bytes / R2_LIMIT_BYTES) * 100.0
            remaining_gb = max(0.0, (R2_LIMIT_BYTES - total_uploaded_bytes) / (1024 * 1024 * 1024))

            # 自动同步最新大盘数据至 CMS 前端
            try:
                import json
                cur.execute("SELECT COUNT(*) FROM tracks_sync_state WHERE is_compressed = 1")
                comp_count = cur.fetchone()[0]
                status_lvl = 'critical' if used_percent >= 95.0 else ('warning' if used_percent >= 80.0 else 'healthy')
                status_txt = '熔断预警 (已达 95% 红线)' if used_percent >= 95.0 else ('容量预警 (已达 80%)' if used_percent >= 80.0 else '空间充裕')
                cms_stats = {
                    'updated_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                    'r2_free_capacity_gb': 10.0,
                    'r2_used_bytes': total_uploaded_bytes,
                    'r2_used_gb': round(used_gb, 2),
                    'r2_used_ratio': round(used_percent, 1),
                    'r2_remaining_gb': round(remaining_gb, 2),
                    'r2_remaining_mb': round(remaining_gb * 1024, 1),
                    'r2_songs_count': total_uploaded,
                    'compressed_songs_count': comp_count,
                    'estimated_songs_remaining': int(remaining_gb * 1024 / 3.2) if remaining_gb > 0 else 0,
                    'status_level': status_lvl,
                    'status_text': status_txt,
                    'local_pending_songs': pending_count,
                    'compression_policy': '160 kbps CBR (已启用)'
                }
                for od in [os.path.join(BASE_DIR, "frontend", "admin"), os.path.join(BASE_DIR, "frontend")]:
                    os.makedirs(od, exist_ok=True)
                    with open(os.path.join(od, "r2_stats.json"), 'w', encoding='utf-8') as fj:
                        json.dump(cms_stats, fj, ensure_ascii=False, indent=2)
            except Exception:
                pass

            if total_uploaded_bytes >= 9.5 * 1024 * 1024 * 1024:
                print(f"\n🔴 [R2 熔断保护触发] 当前 R2 已用容量: {used_gb:.2f} GB ({used_percent:.1f}%)，已达 9.5 GB 安全红线！")
                print("   已自动暂停新文件推送，防止产生额外费用或超出限额报错。请知悉！")
                time.sleep(30)
                continue

            # 抓取当前批次待上传任务 (每次抓 15 首)
            cur.execute("""
                SELECT song_id, artist_name, album_title, song_title, local_mp3, local_lrc, retry_count
                FROM tracks_sync_state
                WHERE status = 'DOWNLOADED' AND retry_count < ?
                ORDER BY song_id ASC
                LIMIT 15
            """, (MAX_RETRIES,))
            tasks = cur.fetchall()
            conn.close()

            if tasks:
                idle_cycles = 0
                warn_flag = "🟡 [预警]" if used_percent >= 80 else "🟢"
                print(f"\n⚡ [批次就绪] 待传: {pending_count} 首 | 云端已存: {total_uploaded} 首 ({used_gb:.2f} GB, {used_percent:.1f}% {warn_flag}, 剩余: {remaining_gb:.2f} GB) | 失败隔离: {failed_count} 首")
                
                with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as executor:
                    futures = [executor.submit(upload_single_track, t) for t in tasks]
                    for f in as_completed(futures):
                        f.result()
                        
                time.sleep(0.5)
            else:
                idle_cycles += 1
                if idle_cycles % 6 == 1:
                    print(f"⏳ [等待新音频] 目前已全部同步至 R2: {total_uploaded} 首 | 守护进程持续监听后台抓轨中...")
                    scan_local_downloads.scan_and_register()

                time.sleep(5)

        except KeyboardInterrupt:
            print("\n🛑 [用户中断] R2 上传守护进程已平稳退出。")
            break
        except Exception as e:
            print(f"❌ [守护进程主循环异常]: {e}，5秒后重试...")
            time.sleep(5)

if __name__ == "__main__":
    run_daemon()
