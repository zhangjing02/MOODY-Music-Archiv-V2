import os

sql_path = r"e:\Html-work\tmp\moody_clean.sql"
output_dir = r"e:\Html-work\tmp\batches_v2"
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

with open(sql_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

artists = []
albums = []
songs = []
others = []

for line in lines:
    if line.startswith('INSERT INTO "artists"'):
        artists.append(line)
    elif line.startswith('INSERT INTO "albums"'):
        albums.append(line)
    elif line.startswith('INSERT INTO "songs"'):
        songs.append(line)
    elif line.startswith('INSERT INTO'):
        others.append(line)

# Write core skeleton
with open(os.path.join(output_dir, '01_artists.sql'), 'w', encoding='utf-8') as f:
    f.writelines(artists)
with open(os.path.join(output_dir, '02_albums.sql'), 'w', encoding='utf-8') as f:
    f.writelines(albums)
with open(os.path.join(output_dir, '03_others.sql'), 'w', encoding='utf-8') as f:
    f.writelines(others)

# Split songs into chunks of 2000
chunk_size = 2000
for i in range(0, len(songs), chunk_size):
    chunk = songs[i:i + chunk_size]
    batch_num = i // chunk_size
    with open(os.path.join(output_dir, f'songs_batch_{batch_num:02d}.sql'), 'w', encoding='utf-8') as f:
        # Prepend FK off just in case, though with skeleton first it shouldn't be needed
        f.write("PRAGMA foreign_keys = OFF;\n")
        f.writelines(chunk)

print(f"Created {len(os.listdir(output_dir))} files in {output_dir}")
