import subprocess
import time

updates = [
    (10069, 'music/李宗盛/生命中的精灵/s_26259.mp3'),
    (10070, 'music/李宗盛/生命中的精灵/s_26260.mp3'),
    (10071, 'music/李宗盛/生命中的精灵/s_26261.mp3'),
    (10072, 'music/李宗盛/生命中的精灵/s_26262.mp3'),
    (10073, 'music/李宗盛/生命中的精灵/s_26263.mp3'),
    (10074, 'music/李宗盛/生命中的精灵/s_26264.mp3'),
    (10075, 'music/李宗盛/生命中的精灵/s_26265.mp3'),
    (10076, 'music/李宗盛/生命中的精灵/s_26266.mp3'),
]

for song_id, path in updates:
    sql = f"UPDATE songs SET file_path = '{path}' WHERE id = {song_id};"
    print(f"Updating ID {song_id} with {path}...")
    cmd = ["npx", "wrangler", "d1", "execute", "DB", "--remote", "--command", sql]
    
    success = False
    retries = 3
    while not success and retries > 0:
        try:
            # Use shell=True for Windows to find npx.cmd correctly
            result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', shell=True)
            if result.returncode == 0:
                print(f"Successfully updated ID {song_id}")
                success = True
            else:
                print(f"Failed to update ID {song_id}: {result.stderr}")
                retries -= 1
                if retries > 0:
                    print(f"Retrying in 5 seconds... ({retries} retries left)")
                    time.sleep(5)
        except Exception as e:
            print(f"Error updating ID {song_id}: {e}")
            retries -= 1
            time.sleep(5)
            
    time.sleep(3) # Increase pause to avoid rate limits
