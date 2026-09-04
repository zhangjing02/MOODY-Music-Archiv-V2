import re
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('INSERT INTO "songs"'):
            m = re.search(r'VALUES\((\d+),\s*(\d+),\s*(\d+),\s*\'([^\']*)\'', line)
            if m:
                sid, aid, alid, title = int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4)
                if alid in [1092, 1090]:
                    print(f'album={alid}, id={sid}, title={title}')
