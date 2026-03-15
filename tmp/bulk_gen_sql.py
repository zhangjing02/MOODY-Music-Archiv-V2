import os
import sqlite3

root = r'e:\Html-work\storage\music'
updates = []
count = 0

if os.path.exists(root):
    for artist in os.listdir(root):
        artist_path = os.path.join(root, artist)
        if not os.path.isdir(artist_path):
            continue
        for album in os.listdir(artist_path):
            album_path = os.path.join(artist_path, album)
            if not os.path.isdir(album_path):
                continue
            for file in os.listdir(album_path):
                if file.startswith('s_') and (file.endswith('.mp3') or file.endswith('.m4a')):
                    song_id = file[2:].split('.')[0]
                    if song_id.isdigit():
                        count += 1
                        file_path = f"{artist}/{album}/{file}"
                        updates.append(f"UPDATE songs SET file_path = '{file_path}' WHERE id = {song_id};")

with open(r'e:\Html-work\tmp\bulk_restore_paths.sql', 'w', encoding='utf-8') as f:
    for up in updates:
        f.write(up + '\n')

print(f"Scanned {count} files. Generated {len(updates)} updates in e:\\Html-work\\tmp\\bulk_restore_paths.sql")
