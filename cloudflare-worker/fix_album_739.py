import json
import re

def parse_wrangler_json(filename):
    # Try multiple encodings often used in Windows/PowerShell
    for encoding in ['utf-8', 'utf-16', 'utf-16-le', 'utf-16-be', 'gbk']:
        try:
            with open(filename, 'r', encoding=encoding) as f:
                content = f.read()
                # If it starts with some weird stuff, strip it
                content = content.strip()
                # Extract the JSON array from the wrangler output
                match = re.search(r'\[\s+\{.*\}\s+\]', content, re.DOTALL)
                if match:
                    data = json.loads(match.group(0))
                    return data[0]['results']
        except Exception:
            continue
    return []

# We actually concatenated them in songs_all.txt, let's just use the direct files
# But I missed the redirect in previous step? No, I did:
# npx wrangler ... > songs_739.json; npx wrangler ... > songs_1752.json;

# Let's assume they are valid JSONs now.
try:
    songs_739 = parse_wrangler_json('songs_739.json')
    songs_1752 = parse_wrangler_json('songs_1752.json')

    # Create a mapping from title -> file_path in the "rich" album
    # Note: Using titles as keys might be risky if there are duplicates, 
    # but for these 8 tracks it should be fine.
    path_map = {}
    for s in songs_1752:
        if s['file_path']:
            path_map[s['title']] = s['file_path']

    sql_updates = []
    matches = 0
    for s in songs_739:
        title = s['title']
        if title in path_map:
            sql_updates.append(f"UPDATE songs SET file_path = '{path_map[title]}' WHERE id = {s['id']};")
            matches += 1

    print(f"-- Found {matches} matches out of {len(songs_739)} songs in album 739")
    for sql in sql_updates:
        print(sql)

except Exception as e:
    print(f"Error: {e}")
