import subprocess
import time

# Target IDs: 10069 to 10076 (8 tracks)
# Offset: 16190 (26259 - 10069)

for target_id in range(10069, 10077):
    source_id = target_id + 16190
    # This SQL has NO Chinese characters!
    sql = f"UPDATE songs SET file_path = (SELECT file_path FROM songs WHERE id = {source_id}) WHERE id = {target_id};"
    print(f"Syncing ID {target_id} from ID {source_id}...")
    cmd = ["npx", "wrangler", "d1", "execute", "DB", "--remote", "--command", sql]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, shell=True)
        if result.returncode == 0:
            print(f"Successfully synced ID {target_id}")
        else:
            print(f"Failed to sync ID {target_id}: {result.stderr}")
    except Exception as e:
        print(f"Error syncing ID {target_id}: {e}")
    
    time.sleep(2)
