import re
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

artists = {}
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "artists"'):
            # VALUES(id, 'name', ...)
            parts = line.split("VALUES(")[1].split(",")
            aid = int(parts[0].strip())
            name = parts[1].strip().strip("'\"")
            if any(k in name for k in ['林俊杰', '陈奕迅', '孙燕姿']):
                artists[aid] = name

print('找到艺人:', artists)

albums = {}
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "albums"'):
            # VALUES(id, artist_id, 'title', 'release_date', ...)
            parts = line.split("VALUES(")[1].split(",")
            alid = int(parts[0].strip())
            aid = int(parts[1].strip())
            title = parts[2].strip().strip("'\"")
            rdate = parts[3].strip().strip("'\"") if len(parts) > 3 else ""
            if aid in artists:
                albums[alid] = {
                    'id': alid,
                    'artist': artists[aid],
                    'aid': aid,
                    'title': title,
                    'date': rdate,
                    'songs': []
                }

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "songs"'):
            # VALUES(id, artist_id, album_id, 'title', file_path, ...)
            # Use regex to handle commas inside titles
            m = re.search(r'VALUES\((\d+),\s*(\d+),\s*(\d+),\s*\'([^\']*)\',\s*([^,\)]*)', line)
            if m:
                sid = int(m.group(1))
                aid = int(m.group(2))
                alid = int(m.group(3))
                stitle = m.group(4)
                fpath = m.group(5).strip().strip("'\"")
                if alid in albums:
                    albums[alid]['songs'].append({'id': sid, 'title': stitle, 'file_path': fpath})

by_artist = {}
for alid, a in albums.items():
    art = a['artist']
    by_artist.setdefault(art, []).append(a)

for art in ['林俊杰', '孙燕姿']:
    alist = by_artist.get(art, [])
    alist.sort(key=lambda x: str(x['date']))
    print(f"\n========================================================")
    print(f"🎤 歌手: {art} (数据库共 {len(alist)} 张专辑)")
    print(f"========================================================")
    for al in alist:
        lit_count = sum(1 for s in al['songs'] if s['file_path'] and s['file_path'] != 'NULL' and s['file_path'] != '')
        song_names = [s['title'] for s in al['songs']]
        print(f"  • ID {al['id']} | 《{al['title']}》({al['date']}) - 共 {len(song_names)} 首 (已点亮 {lit_count}):")
        if song_names:
            print(f"    曲目: {song_names}")
        else:
            print(f"    ⚠️ 曲目为空！")
