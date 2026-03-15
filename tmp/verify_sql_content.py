import os

sql_path = r"e:\Html-work\tmp\moody_clean.sql"
if os.path.exists(sql_path):
    with open(sql_path, 'r', encoding='utf-8') as f:
        content = f.readlines()
        
    song_inserts = [line for line in content if line.startswith('INSERT INTO "songs"')]
    artist_inserts = [line for line in content if line.startswith('INSERT INTO "artists"')]
    album_inserts = [line for line in content if line.startswith('INSERT INTO "albums"')]
    
    print(f"Total lines: {len(content)}")
    print(f"Song inserts: {len(song_inserts)}")
    print(f"Artist inserts: {len(artist_inserts)}")
    print(f"Album inserts: {len(album_inserts)}")
    
    # Check for Jonathan Lee (id 44 likely based on previous context or name search)
    # Let's find Jonathan Lee's ID
    jonathan_lee_lines = [l for l in artist_inserts if '李宗盛' in l]
    print(f"Jonathan Lee records: {jonathan_lee_lines}")
    
    if jonathan_lee_lines:
        # Assuming ID is the first value in the insert
        # INSERT INTO "artists" VALUES(1,'...')
        import re
        match = re.search(r'VALUES\((\d+)', jonathan_lee_lines[0])
        if match:
            artist_id = match.group(1)
            songs_for_artist = [l for l in song_inserts if f',{artist_id},' in l]
            print(f"Songs for Jonathan Lee (ID {artist_id}) in SQL: {len(songs_for_artist)}")
    
    # Check for Jay Chou
    jay_chou_lines = [l for l in artist_inserts if '周杰伦' in l]
    if jay_chou_lines:
        match = re.search(r'VALUES\((\d+)', jay_chou_lines[0])
        if match:
            artist_id = match.group(1)
            songs_for_artist = [l for l in song_inserts if f',{artist_id},' in l]
            print(f"Songs for Jay Chou (ID {artist_id}) in SQL: {len(songs_for_artist)}")
else:
    print("SQL file not found")
