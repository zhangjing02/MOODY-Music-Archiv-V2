import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

artists = []
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "artists"'):
            parts = line.split('VALUES(')[1].split(',')
            aid = int(parts[0].strip())
            name = parts[1].strip().strip("'\"")
            artists.append((aid, name))

print(f"Total artists in project: {len(artists)}")
for a in artists[:40]:
    print(f"ID {a[0]:4d} | {a[1]}")
