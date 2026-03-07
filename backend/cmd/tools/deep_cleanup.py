import os
import sqlite3
import json
from pathlib import Path

# 配置路径
PROJECT_ROOT = Path("e:/Html-work")
DB_PATH = PROJECT_ROOT / "storage" / "db" / "moody.db"
SKELETON_PATH = PROJECT_ROOT / "storage" / "metadata" / "skeleton.json"
MUSIC_DIR = PROJECT_ROOT / "storage" / "music"

def cleanup_song(target_title):
    print(f"=== Starting deep cleanup for: {target_title} ===")
    
    # 1. Clear Skeleton.json
    if SKELETON_PATH.exists():
        with open(SKELETON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        modified = False
        for artist in data.get('artists', []):
            for album in artist.get('albums', []):
                for song in album.get('songs', []):
                    if song.get('title') == target_title:
                        if song.get('path'):
                            print(f"[Skeleton] Clearing path: {song['path']}")
                            song['path'] = ""
                            modified = True
        
        if modified:
            with open(SKELETON_PATH, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print("[Skeleton] Successfully updated.")
        else:
            print("[Skeleton] No matching entries with paths found.")

    # 2. Delete Physical Files
    extensions = ['.mp3', '.flac', '.m4a', '.wav', '.lrc']
    for root, dirs, files in os.walk(MUSIC_DIR):
        for file in files:
            if target_title in file:
                file_path = Path(root) / file
                try:
                    os.remove(file_path)
                    print(f"[Disk] Deleted file: {file_path}")
                except Exception as e:
                    print(f"[Disk] Error deleting {file_path}: {e}")

    # 3. Delete from Database
    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # 先查一下
            cursor.execute("SELECT id, file_path FROM songs WHERE title LIKE ?", (f"%{target_title}%",))
            rows = cursor.fetchall()
            
            if rows:
                for row in rows:
                    print(f"[DB] Removing record: ID={row[0]}, Path={row[1]}")
                
                cursor.execute("DELETE FROM songs WHERE title LIKE ?", (f"%{target_title}%",))
                conn.commit()
                print(f"[DB] Successfully deleted {len(rows)} records.")
            else:
                print("[DB] No matching records found.")
            
            conn.close()
        except Exception as e:
            print(f"[DB] Error: {e}")

    print("=== Cleanup Complete ===")

if __name__ == "__main__":
    cleanup_song("星晴")
