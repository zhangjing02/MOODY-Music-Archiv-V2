import sys
import os

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# 1. Check artist ID for 陈奕迅
aid = None
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "artists"') and '陈奕迅' in line:
            parts = line.split('VALUES(')[1].split(',')
            aid = int(parts[0].strip())
            print(f"Artist found: ID={aid} {parts[1].strip()}")
            break

if not aid:
    print("Artist 陈奕迅 not found in schema.sql")
    sys.exit(0)

# 2. Collect all albums for 陈奕迅
albums = {}
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "albums"'):
            parts = line.split('VALUES(')[1].split(',')
            alid = int(parts[0].strip())
            cur_aid = int(parts[1].strip())
            title = parts[2].strip().strip("'\"")
            date = parts[3].strip().strip("'\"") if len(parts) > 3 else ""
            if cur_aid == aid:
                albums[alid] = {'id': alid, 'title': title, 'date': date, 'songs': []}

print(f"Found {len(albums)} albums for 陈奕迅 (aid={aid})")

# 3. Collect songs for these albums
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "songs"'):
            parts = line.split('VALUES(')[1].split(',')
            sid = int(parts[0].strip())
            cur_aid = int(parts[1].strip())
            alid = int(parts[2].strip())
            title = parts[3].strip().strip("'\"") if len(parts) > 3 else ""
            if alid in albums:
                albums[alid]['songs'].append((sid, title))

for alid, a in sorted(albums.items(), key=lambda x: str(x[1]['date'])):
    print(f"Album {alid} | 《{a['title']}》({a['date']}) - {len(a['songs'])} songs")
