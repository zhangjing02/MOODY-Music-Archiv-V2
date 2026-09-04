import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

albums = {}
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "albums"'):
            parts = line.split('VALUES(')[1].split(',')
            alid = int(parts[0].strip())
            aid = int(parts[1].strip())
            if aid == 7:
                title = parts[2].strip().strip("'\"")
                year = parts[3].strip().strip("'\"") if len(parts) > 3 else ""
                albums[alid] = {'id': alid, 'title': title, 'year': year, 'songs': []}

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "songs"'):
            parts = line.split('VALUES(')[1].split(',')
            sid = int(parts[0].strip())
            aid = int(parts[1].strip())
            alid = int(parts[2].strip())
            if aid == 7 and alid in albums:
                title = parts[3].strip().strip("'\"")
                albums[alid]['songs'].append((sid, title))

for alid, a in sorted(albums.items(), key=lambda x: str(x[1]['year'])):
    print(f"ID {alid:4d} | 《{a['title']}》({a['year']}) - {len(a['songs'])} songs")
