import subprocess
import json
import os

def run_d1_query(command):
    # Use shell=True for npx on Windows
    wrangler_cmd = f'npx wrangler d1 execute moody-d1-test --remote --command="{command}" --json --yes'
    try:
        result = subprocess.run(wrangler_cmd, capture_output=True, text=True, check=True, shell=True)
        return json.loads(result.stdout)
    except Exception as e:
        print(f"Error running query: {e}")
        if hasattr(e, 'stderr'):
            print(f"Stderr: {e.stderr}")
        return None

# 1. Count total songs with file_path
print("Counting total songs with valid file_path...")
res1 = run_d1_query("SELECT count(*) as count FROM songs WHERE file_path IS NOT NULL AND file_path != '';")
if res1:
    print(f"Total songs with paths: {res1[0]['results'][0]['count']}")

# 2. Check Jonathan Lee's songs specifically
print("\nChecking Jonathan Lee's (Artist 46) songs...")
res2 = run_d1_query("SELECT count(*) as count FROM songs WHERE artist_id = 46 AND (file_path IS NULL OR file_path = '');")
if res2:
    print(f"Lee's songs without paths: {res2[0]['results'][0]['count']}")

res3 = run_d1_query("SELECT count(*) as count FROM songs WHERE artist_id = 46 AND file_path IS NOT NULL AND file_path != '';")
if res3:
    print(f"Lee's songs WITH paths: {res3[0]['results'][0]['count']}")

# 3. Check Jay Chou's (Artist 120) songs for comparison
print("\nChecking Jay Chou's (Artist 120) songs...")
res4 = run_d1_query("SELECT count(*) as count FROM songs WHERE artist_id = 120 AND file_path IS NOT NULL AND file_path != '';")
if res4:
    print(f"Chou's songs WITH paths: {res4[0]['results'][0]['count']}")
