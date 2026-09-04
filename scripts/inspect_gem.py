import re
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

# 邓紫棋 artist_id = 14
albums = re.findall(r"INSERT INTO \"albums\" VALUES\((\d+),14,'([^']+)',(?:'([^']*)'|NULL)", sql)
songs = re.findall(r"INSERT INTO \"songs\" VALUES\((\d+),14,(\d+),'([^']+)'", sql)

album_songs = {}
for sid, aid, title in songs:
    album_songs.setdefault(int(aid), []).append(title)

print(f"=== 邓紫棋 G.E.M. (Artist ID: 14) Albums ({len(albums)}) ===")
for aid, title, year in albums:
    aid = int(aid)
    track_list = album_songs.get(aid, [])
    print(f"ID {aid:4d} | 《{title}》({year}) - {len(track_list)} songs")
    if track_list:
        print(f"     {track_list}")
