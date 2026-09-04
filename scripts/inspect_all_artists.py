import re
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

artists = re.findall(r"INSERT INTO \"artists\" VALUES\((\d+),'([^']+)'", sql)
print(f"Total artists: {len(artists)}")

albums_raw = re.findall(r"INSERT INTO \"albums\" VALUES\((\d+),(\d+),'([^']+)'", sql)
songs_raw = re.findall(r"INSERT INTO \"songs\" VALUES\((\d+),(\d+),(\d+),'([^']+)'", sql)
print(f"Total songs: {len(songs_raw)}")

artist_album_count = {}
for aid, artist_id, title in albums_raw:
    artist_id = int(artist_id)
    artist_album_count[artist_id] = artist_album_count.get(artist_id, 0) + 1

artist_song_count = {}
for sid, artist_id, album_id, title in songs_raw:
    artist_id = int(artist_id)
    artist_song_count[artist_id] = artist_song_count.get(artist_id, 0) + 1

print("\nTop 40 artists by song count in skeleton:")
sorted_artists = sorted(artists, key=lambda x: artist_song_count.get(int(x[0]), 0), reverse=True)
for aid, name in sorted_artists[:40]:
    print(f"ID {int(aid):3d} | {name:16s} | {artist_album_count.get(int(aid), 0):2d} albums | {artist_song_count.get(int(aid), 0):3d} songs")
