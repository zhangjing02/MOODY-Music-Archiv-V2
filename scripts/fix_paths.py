import re
import os

data_path = r'e:\Html-work\frontend\src\js\data.js'
with open(data_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_j1 = False

for line in lines:
    # Handle Jay Chou block start/end
    if "id: 'j1'" in line:
        skip_j1 = True
    
    if skip_j1:
        new_lines.append(line)
        if line.strip().endswith('},') and 'albums:' not in line and 'id:' not in line:
            # This is a bit weak but J1 ends with a closing brace for the artist object
            pass
        # Actually searching for line 82: '    },'
        if line.strip() == '},':
            skip_j1 = False
        continue

    # Process other artists
    match_artist = re.search(r"id: '([^']+)'", line)
    if match_artist:
        artist_id = match_artist.group(1)
        
        # Fix Avatar
        # Replace avatar: '...' with src/assets/images/avatars/{id}.jpg
        line = re.sub(r"avatar: '([^']+)'", f"avatar: 'src/assets/images/avatars/{artist_id}.jpg'", line)
        
        # Fix Covers
        # Find all albums and replace their covers
        # We assume for these single-line artists there might be multiple albums.
        # We'll use a count to index them: _0, _1, _2
        def replace_cover(match):
            global album_idx
            res = f"cover: 'src/assets/images/covers/{artist_id}_{album_idx}.jpg'"
            album_idx += 1
            return res
        
        global album_idx
        album_idx = 0
        line = re.sub(r"cover: '([^']+)'", replace_cover, line)

    new_lines.append(line)

with open(data_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Path fixing complete.")
