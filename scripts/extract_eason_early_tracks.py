import sys
import os

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.append(os.path.dirname(__file__))
import inspect_eason_db as ied

target_titles = [
    '一滴眼淚', '醞釀', '我的快樂時代', '婚禮的祝福', '打得火熱',
    'The Easy Ride', '反正是我', '怎么样', 'Life Continues',
    'Stranger Under My Skin', '？', "C''mon in~", 'L.O.V.E.',
    '陳奕迅2010 Duo演唱會', "Eason''s Life 2013演唱會"
]

target_albums = []
for alid, a in sorted(ied.albums.items(), key=lambda x: str(x[1]['date'])):
    clean_t = a['title'].replace("''", "'")
    if any(t.replace("''", "'") in clean_t for t in target_titles):
        # Skip duplicate 90
        if alid == 90: continue
        target_albums.append(a)
        print(f"ID {alid:4d} | 《{a['title']}》({a['date']}) - {len(a['songs'])} songs")
        print("   ", [s[1] for s in a['songs']])
        print()
