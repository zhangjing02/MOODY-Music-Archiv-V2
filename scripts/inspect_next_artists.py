import sys
import os

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.append(os.path.dirname(__file__))
import inspect_eason_db as ied

# Read all artists and count albums and songs
artist_map = {}
with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "artists"'):
            parts = line.split('VALUES(')[1].split(',')
            aid = int(parts[0].strip())
            name = parts[1].strip().strip("'\"")
            artist_map[aid] = {'id': aid, 'name': name, 'albums': {}}

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "albums"'):
            parts = line.split('VALUES(')[1].split(',')
            alid = int(parts[0].strip())
            aid = int(parts[1].strip())
            title = parts[2].strip().strip("'\"")
            year = parts[3].strip().strip("'\"") if len(parts) > 3 else ""
            if aid in artist_map:
                artist_map[aid]['albums'][alid] = {'id': alid, 'title': title, 'year': year, 'song_count': 0}

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "songs"'):
            parts = line.split('VALUES(')[1].split(',')
            aid = int(parts[1].strip())
            alid = int(parts[2].strip())
            if aid in artist_map and alid in artist_map[aid]['albums']:
                artist_map[aid]['albums'][alid]['song_count'] += 1

print(f"Total artists in schema: {len(artist_map)}")

# List the next priority artists with album counts
priority_targets = [
    'Beyond', 'JOLIN蔡依林', '蔡健雅', '邓紫棋', '五月天', '王力宏', '陶喆', '莫文蔚',
    '梁静茹', '张惠妹', '张学友', '刘德华', '李荣浩', '汪峰', '许巍', '朴树',
    '伍佰', '苏打绿', 'SHE', 'S.H.E', '田馥甄', '萧敬腾', '林宥嘉'
]

# Print summary
for aid, a in sorted(artist_map.items()):
    total_songs = sum(alb['song_count'] for alb in a['albums'].values())
    if any(p.lower() == a['name'].lower() or p in a['name'] for p in priority_targets):
        print(f"⭐ ID {aid:3d} | {a['name']:15s} : {len(a['albums']):2d} 张专辑, 共 {total_songs:3d} 首歌曲")
