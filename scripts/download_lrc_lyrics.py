import os
import sqlite3
import time
import requests
import urllib.parse
from pathlib import Path

# ----------------- Configuration -----------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "storage", "db", "moody.db")
LYRICS_DIR = os.path.join(BASE_DIR, "storage", "lyrics")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://music.163.com/',
    'Cookie': 'TARGET_REGION=CN;'
}

def search_song_id(keyword):
    """Search for a song and return its Netease ID"""
    url = f"http://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s={urllib.parse.quote(keyword)}&type=1&offset=0&total=true&limit=1"
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        data = response.json()
        if data.get('code') == 200:
            songs = data.get('result', {}).get('songs')
            if songs and len(songs) > 0:
                return songs[0]['id']
    except Exception as e:
        print(f"    [!] Search error for {keyword}: {e}")
    return None

def fetch_lyric(song_id):
    """Fetch LRC lyric content by Netease ID"""
    url = f"https://music.163.com/api/song/lyric?os=pc&id={song_id}&lv=-1&kv=-1&tv=-1"
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        data = response.json()
        if data.get('code') == 200:
            lrc_content = data.get('lrc', {}).get('lyric')
            return lrc_content
    except Exception as e:
        print(f"    [!] Lyric fetch error for ID {song_id}: {e}")
    return None

def main():
    print(f"🚀 Starting Auto LRC Downloader...")
    print(f"📂 DB Path: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print("❌ Database not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Query all songs with missing or invalid lyrics
    # file_path format is usually "Artist/Album/s_123.mp3"
    query = """
    SELECT s.id, s.title, s.file_path, s.lrc_path, a.name as artist
    FROM songs s
    LEFT JOIN artists a ON s.artist_id = a.id
    WHERE s.file_path IS NOT NULL AND s.file_path != ''
    ORDER BY a.name, s.id
    """
    
    cursor.execute(query)
    songs = cursor.fetchall()

    success_count = 0
    skip_count = 0

    for idx, row in enumerate(songs):
        song_id, title, file_path, lrc_path, artist = row
        
        # Determine relative directory from file_path
        # file_path is like "周杰伦/范特西/s_12.mp3"
        # We want rel_dir = "周杰伦/范特西"
        rel_dir = os.path.dirname(file_path)
        
        # Expected lyric path: storage/lyrics/Artist/Album/l_{id}.lrc
        lrc_new_name = f"l_{song_id}.lrc"
        lrc_target_dir = os.path.join(LYRICS_DIR, rel_dir)
        lrc_target_path = os.path.join(lrc_target_dir, lrc_new_name)
        
        # Verify if an existing valid lrc file exists
        if os.path.exists(lrc_target_path) and os.path.getsize(lrc_target_path) > 10:
            # Maybe the database link is missing, fix it if needed
            lrc_rel_path = os.path.join(rel_dir, lrc_new_name).replace("\\", "/")
            if lrc_path != lrc_rel_path:
                cursor.execute("UPDATE songs SET lrc_path = ? WHERE id = ?", (lrc_rel_path, song_id))
                conn.commit()
            skip_count += 1
            print(f"[{idx+1}/{len(songs)}] ⏭️  [SKIP] {artist} - {title} (LRC exists)")
            continue
            
        print(f"[{idx+1}/{len(songs)}] ⏳ [DOWNLOAD] {artist} - {title}...")
        
        # Netease search
        # Strip some prefixes if title looks like "01. SongName"
        import re
        clean_title = re.sub(r"^\d+\s*[-.]*\s*", "", title)
        keyword = f"{artist} {clean_title}"
        
        net_id = search_song_id(keyword)
        if not net_id:
            print(f"    ❌ [FAIL] Cannot find song on Netease")
            continue
            
        lyrics_text = fetch_lyric(net_id)
        if lyrics_text and len(lyrics_text.strip()) > 0:
            # Ensure folder exists
            os.makedirs(lrc_target_dir, exist_ok=True)
            
            # Write ti metadata tag to be consistent with music.go logic
            if "[ti:" not in lyrics_text:
                lyrics_text = f"[ti:{title}]\n{lyrics_text}"
                
            # Write file
            with open(lrc_target_path, "w", encoding="utf-8") as f:
                f.write(lyrics_text)
                
            # Update database
            lrc_rel_path = os.path.join(rel_dir, lrc_new_name).replace("\\", "/")
            cursor.execute("UPDATE songs SET lrc_path = ? WHERE id = ?", (lrc_rel_path, song_id))
            conn.commit()
            
            # Update _contents.txt
            contents_txt_path = os.path.join(lrc_target_dir, "_contents.txt")
            contents_line = f"l_{song_id}.lrc -> {title}\n"
            try:
                if os.path.exists(contents_txt_path):
                    with open(contents_txt_path, "r", encoding="utf-8") as f:
                        contents = f.read()
                    if contents_line.strip() not in contents:
                        with open(contents_txt_path, "a", encoding="utf-8") as f:
                            f.write(contents_line)
                else:
                    with open(contents_txt_path, "w", encoding="utf-8") as f:
                        f.write(f"MOODY 歌词物理 ID 映射表\n==========================\n{contents_line}\n* 说明：请勿手动重命名 l_ID.lrc 文件，否则会导致数据库索引失效。\n")
            except Exception as e:
                print(f"    ⚠️ Warning: Could not update _contents.txt: {e}")
                
            print(f"    ✅ [SAVED] {lrc_target_path}")
            success_count += 1
        else:
            print(f"    ❌ [FAIL] No lyrics returned from API")
            
        time.sleep(1.0) # Rate limit

    print("\n" + "="*50)
    print(f"🎉 Process completed!")
    print(f"Total Songs: {len(songs)} | Downloaded: {success_count} | Skipped: {skip_count}")
    print("="*50)
    
    conn.close()

if __name__ == "__main__":
    main()
