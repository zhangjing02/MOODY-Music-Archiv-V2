#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
初始化本地音乐状态机同步数据库 (backend/database/catalog_sync.db)
从 backend/tmp/batches_v2/ 载入完整的歌手、专辑、歌曲骨架数据
建立状态表 tracks_sync_state，作为本地下载、R2前置上传与明早D1秒级点亮的核心底册。
"""

import os
import sys
import glob
import sqlite3
import time

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DB_PATH = os.path.join(BASE_DIR, "database", "catalog_sync.db")
BATCHES_DIR = os.path.join(BASE_DIR, "tmp", "batches_v2")

def init_db():
    print("=" * 80)
    print(f"🚀 开始初始化本地音乐目录与同步状态数据库: {DB_PATH}")
    print("=" * 80)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # 开启 WAL 模式提高并发性能与抗崩溃能力
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = NORMAL;")

    # 1. 基础骨架表
    cur.execute("""
    CREATE TABLE IF NOT EXISTS artists (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        genre TEXT,
        avatar_url TEXT,
        bio TEXT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY,
        artist_id INTEGER,
        title TEXT NOT NULL,
        release_date TEXT,
        genre TEXT,
        cover_url TEXT,
        storage_id TEXT DEFAULT 'primary'
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY,
        artist_id INTEGER,
        album_id INTEGER,
        title TEXT NOT NULL,
        duration INTEGER,
        file_path TEXT,
        lrc_path TEXT,
        format TEXT,
        bit_rate INTEGER,
        bpm FLOAT,
        mood TEXT,
        play_count INTEGER DEFAULT 0,
        created_at DATETIME,
        track_index INTEGER DEFAULT 0,
        storage_id TEXT DEFAULT 'primary'
    );
    """)

    # 2. 状态机同步底册表
    cur.execute("""
    CREATE TABLE IF NOT EXISTS tracks_sync_state (
        song_id INTEGER PRIMARY KEY,
        artist_name TEXT NOT NULL,
        album_title TEXT NOT NULL,
        song_title TEXT NOT NULL,
        track_index INTEGER DEFAULT 0,
        local_mp3 TEXT,
        local_lrc TEXT,
        file_size INTEGER DEFAULT 0,
        duration TEXT,
        bitrate TEXT,
        qa_status TEXT,
        r2_mp3_key TEXT,
        r2_lrc_key TEXT,
        status TEXT DEFAULT 'PENDING',  -- PENDING, DOWNLOADED, R2_UPLOADED, D1_LIT, FAILED
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        uploaded_at DATETIME,
        lit_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 建立高效索引
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sync_status ON tracks_sync_state(status);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sync_artist_album ON tracks_sync_state(artist_name, album_title);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sync_title ON tracks_sync_state(song_title);")

    conn.commit()

    # 3. 导入 batches_v2 SQL 文件
    sql_files = []
    
    f_art = os.path.join(BATCHES_DIR, "01_artists.sql")
    if os.path.exists(f_art): sql_files.append(f_art)
    
    f_alb = os.path.join(BATCHES_DIR, "02_albums.sql")
    if os.path.exists(f_alb): sql_files.append(f_alb)

    song_batches = sorted(glob.glob(os.path.join(BATCHES_DIR, "songs_batch_*.sql")))
    sql_files.extend(song_batches)

    # 检查是否已有数据
    cur.execute("SELECT COUNT(*) FROM songs")
    existing_songs = cur.fetchone()[0]

    if existing_songs == 0:
        print(f"📦 正在载入骨架 SQL 文件 (共 {len(sql_files)} 个)...")
        for f in sql_files:
            fname = os.path.basename(f)
            t0 = time.time()
            with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
                sql_content = fp.read()
                statements = [s.strip() for s in sql_content.split(';') if s.strip() and not s.strip().startswith('PRAGMA')]
                for stmt in statements:
                    try:
                        cur.execute(stmt)
                    except Exception as e:
                        pass
            conn.commit()
            print(f"  • 已载入: {fname} (耗时: {time.time() - t0:.2f}s)")
    else:
        print(f"ℹ️ 骨架表已有数据: {existing_songs} 首歌曲，跳过重复全量导入。")

    # 4. 同步骨架至 tracks_sync_state
    print("🔄 正在构建/同步 tracks_sync_state 状态表...")
    cur.execute("""
    INSERT OR IGNORE INTO tracks_sync_state (song_id, artist_name, album_title, song_title, track_index)
    SELECT 
        s.id,
        COALESCE(ar.name, 'Unknown Artist'),
        COALESCE(al.title, 'Unknown Album'),
        s.title,
        COALESCE(s.track_index, 0)
    FROM songs s
    LEFT JOIN artists ar ON s.artist_id = ar.id
    LEFT JOIN albums al ON s.album_id = al.id;
    """)
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM artists")
    art_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM albums")
    alb_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM tracks_sync_state")
    sync_cnt = cur.fetchone()[0]

    print("=" * 80)
    print("✅ 本地数据库初始化成功！")
    print(f"📊 统计: 歌手数: {art_cnt} | 专辑数: {alb_cnt} | 状态表歌曲数: {sync_cnt}")
    print("=" * 80)
    conn.close()

if __name__ == "__main__":
    init_db()
