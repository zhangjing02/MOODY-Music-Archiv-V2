import sys
import re

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

albums = {}
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "albums"'):
            # VALUES(id, artist_id, 'title', ...)
            parts = line.split("VALUES(")[1].split(",")
            alid = int(parts[0].strip())
            aid = int(parts[1].strip())
            title = parts[2].strip().strip("'\"")
            date = parts[3].strip().strip("'\"") if len(parts) > 3 else ""
            if aid == 45:
                albums[alid] = {'id': alid, 'title': title, 'date': date, 'songs': []}

print(f"Found {len(albums)} albums for 林俊杰 (aid=45)")

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "songs"'):
            # Check if this line belongs to artist 45 or one of albums
            # VALUES(id, artist_id, album_id, 'title', ...)
            parts = line.split("VALUES(")[1].split(",")
            sid = int(parts[0].strip())
            aid = int(parts[1].strip())
            alid = int(parts[2].strip())
            stitle = parts[3].strip().strip("'\"") if len(parts) > 3 else ""
            if alid in albums:
                albums[alid]['songs'].append((sid, stitle))
            elif aid == 45:
                print(f"Song with aid=45 but unknown album {alid}: {sid} {stitle}")

for alid, a in sorted(albums.items(), key=lambda x: str(x[1]['date'])):
    print(f"\nAlbum {alid} | 《{a['title']}》({a['date']}) - {len(a['songs'])} songs:")
    song_names = [s[1] for s in a['songs']]
    print(song_names)
