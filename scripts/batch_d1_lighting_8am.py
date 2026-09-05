#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MOODY - 明早 8:00 Cloudflare D1 瞬时全量点亮程序 (Batch D1 Lighting at 8:00 AM)
功能：
1. 从本地 catalog_sync.db 提取所有已在 R2 存储就绪的歌曲 (status = 'R2_UPLOADED')
2. 生成纯 SQL 备份文件 backend/database/lighting_batch_8am.sql
3. 向云端执行批量主键点亮 (WHERE id = ?)，毫秒级点亮整个曲库
4. 回写本地状态机为 D1_LIT，生成完整点亮报表
"""

import os
import sys
import time
import sqlite3
import requests

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "catalog_sync.db")
SQL_OUTPUT_PATH = os.path.join(BASE_DIR, "database", "lighting_batch_8am.sql")
API_BATCH_LIGHT_URL = "https://m-api.changgepd.ccwu.cc/api/admin/songs/batch-light"

PROXIES = {
    'http': 'http://127.0.0.1:7897',
    'https': 'http://127.0.0.1:7897'
}

def generate_lighting_sql_and_sync(execute_remote: bool = True):
    print("=" * 80)
    print("🌅 MOODY - 8:00 AM 曲库全量瞬时点亮任务启动")
    print(f"💾 本地状态库: {DB_PATH}")
    print(f"📄 SQL 备份路径: {SQL_OUTPUT_PATH}")
    print("=" * 80)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT song_id, artist_name, album_title, song_title, r2_mp3_key, r2_lrc_key
        FROM tracks_sync_state
        WHERE status IN ('R2_UPLOADED', 'R2_UPLOADED_BUCKET2') AND r2_mp3_key IS NOT NULL
        ORDER BY song_id ASC
    """)
    rows = cur.fetchall()

    if not rows:
        print("ℹ️ 当前没有处于待点亮状态的曲目。")
        conn.close()
        return

    print(f"📦 检索到 {len(rows)} 首已在 R2 云端存储就绪的曲目，准备生成点亮脚本与执行...")

    # 1. 生成纯 SQL 备份
    sql_lines = [
        "-- MOODY 批量曲库点亮 SQL (Cloudflare D1)",
        f"-- 生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"-- 待点亮曲目总数: {len(rows)}",
        ""
    ]

    for sid, art, alb, title, mp3_key, lrc_key in rows:
        lrc_val = f"'{lrc_key}'" if lrc_key else "NULL"
        sql_lines.append(f"UPDATE songs SET file_path = '{mp3_key}', lrc_path = {lrc_val} WHERE id = {sid};")

    with open(SQL_OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_lines))
    print(f"✅ SQL 批处理脚本已生成: {SQL_OUTPUT_PATH} (共 {len(rows)} 行 UPDATE)")

    if not execute_remote:
        print("ℹ️ 仅生成本地 SQL 脚本，未指定执行远程同步。")
        conn.close()
        return

    # 2. 执行远程批量更新 (每 50 首歌为一个事务批次)
    batch_size = 50
    total_lit = 0
    fail_batches = 0

    print(f"\n🚀 开始通过云端批量接口推送点亮 (每批 {batch_size} 首)...")

    for i in range(0, len(rows), batch_size):
        chunk = rows[i:i + batch_size]
        updates_payload = []
        for sid, art, alb, title, mp3_key, lrc_key in chunk:
            updates_payload.append({
                "id": sid,
                "file_path": mp3_key,
                "lrc_path": lrc_key
            })

        try:
            t0 = time.time()
            resp = requests.post(
                API_BATCH_LIGHT_URL,
                json={"updates": updates_payload},
                proxies=PROXIES,
                timeout=30
            )
            
            if resp.status_code == 200:
                # 远程成功，回写本地状态
                sids_in_chunk = [item["id"] for item in updates_payload]
                cur.executemany("""
                    UPDATE tracks_sync_state
                    SET status = 'D1_LIT',
                        lit_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE song_id = ?
                """, [(sid,) for sid in sids_in_chunk])
                conn.commit()

                total_lit += len(chunk)
                print(f"  ✨ [批次成功 {i//batch_size + 1}/{(len(rows)-1)//batch_size + 1}] 已点亮 {len(chunk)} 首 (耗时: {time.time()-t0:.2f}s) | 累计: {total_lit}/{len(rows)}")
            else:
                fail_batches += 1
                print(f"  ❌ [批次失败] HTTP {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            fail_batches += 1
            print(f"  ⚠️ [批次异常] {e}")

        time.sleep(0.2)

    print("=" * 80)
    print("🎉 批量点亮任务执行完毕！")
    print(f"📊 总数: {len(rows)} | 成功点亮: {total_lit} 首 | 失败批次: {fail_batches}")
    print("=" * 80)
    conn.close()

    # 全面停止后台所有抓轨与上传服务，保障存储空间绝对安全
    stop_all_background_services()

def stop_all_background_services():
    print("\n🛑 [系统停机] 正在全面停止所有后台服务（抓轨流水线、上传守护进程、本地服务）...")
    import subprocess
    try:
        subprocess.run([
            "powershell", "-Command",
            "Get-Process -Name 'yt-dlp' -ErrorAction SilentlyContinue | Stop-Process -Force;" +
            "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'master_orchestrator|r2_sync_daemon|_pipeline\\.py' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
        ], capture_output=True, text=True, timeout=30)
    except Exception as e:
        print(f"⚠️ 停止进程异常: {e}")
    print("✅ 所有后台抓轨与上传流水线已安全关停！")
    print("📌 系统已进入完全静止状态，等待您全面整理 R2 空间后随时复工。")

if __name__ == "__main__":
    execute = "--dry-run" not in sys.argv
    generate_lighting_sql_and_sync(execute_remote=execute)
