import os
import re

roots = [
    r'e:\Html-work\服务器上备份的资源\music',
    r'e:\Html-work\storage\music'
]

updates = []

for root in roots:
    if not os.path.exists(root):
        continue
    for artist in os.listdir(root):
        artist_path = os.path.join(root, artist)
        if not os.path.isdir(artist_path):
            continue
        for album in os.listdir(artist_path):
            album_path = os.path.join(artist_path, album)
            if not os.path.isdir(album_path):
                continue
            contents_file = os.path.join(album_path, '_contents.txt')
            if os.path.exists(contents_file):
                try:
                    with open(contents_file, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                        for line in lines:
                            # Match s_ID.mp3 -> Title or s_ID.m4a -> Title
                            match = re.search(r'(s_(\d+)\.(mp3|m4a|wav|flac))', line)
                            if match:
                                filename = match.group(1)
                                song_id = match.group(2)
                                # Path format: Artist/Album/filename
                                file_path = f"{artist}/{album}/{filename}"
                                updates.append(f"UPDATE songs SET file_path = '{file_path}' WHERE id = {song_id};")
                except Exception as e:
                    print(f"Error reading {contents_file}: {e}")

# Deduplicate updates based on song_id (prefer storage over backup maybe? Or just use the last one found)
final_updates = {}
for up in updates:
    # Use regex to extract id as key
    m = re.search(r'WHERE id = (\d+);', up)
    if m:
        final_updates[m.group(1)] = up

with open(r'e:\Html-work\tmp\restore_paths.sql', 'w', encoding='utf-8') as f:
    for up in final_updates.values():
        f.write(up + '\n')

print(f"Generated {len(final_updates)} update statements in e:\\Html-work\\tmp\\restore_paths.sql")
