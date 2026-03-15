import subprocess
import os
import time

db_name = "moody-d1-test"
batch_dir = r"e:\Html-work\tmp\batches_v2"
# Only import songs_batch files to avoid duplicate entry errors for artists/albums
batch_files = sorted([f for f in os.listdir(batch_dir) if f.startswith('songs_batch_')], key=lambda x: int(x.split('_')[2].split('.')[0]))

def run_file(file_path):
    print(f"Importing {file_path}...")
    cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--file", file_path, "--yes"]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', shell=True)
    return result

total_start = time.time()
success_files = []
failed_files = []

for bf in batch_files:
    path = os.path.join(batch_dir, bf)
    start_time = time.time()
    res = run_file(path)
    elapsed = time.time() - start_time
    
    if "success\": true" in res.stdout or res.returncode == 0:
        print(f"SUCCESS: {bf} in {elapsed:.2f}s")
        success_files.append(bf)
    else:
        print(f"FAILED: {bf} Error: {res.stderr[:500]}")
        failed_files.append(bf)
        # Try once more with a small delay for connectivity/timeout issues
        print("Retrying in 5 seconds...")
        time.sleep(5)
        res = run_file(path)
        if "success\": true" in res.stdout or res.returncode == 0:
            print(f"RETRY SUCCESS: {bf}")
            success_files.append(bf)
        else:
            print(f"PERMANENT FAILURE: {bf}")
            break # Stop sync on error

print(f"Process finished. Success: {len(success_files)}, Failed: {len(failed_files)}")
print(f"Total time: {time.time() - total_start:.2f}s")
