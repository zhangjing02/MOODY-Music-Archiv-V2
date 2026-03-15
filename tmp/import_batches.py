import subprocess
import os
import time

db_name = "moody-d1-test"
batch_dir = r"e:\Html-work\tmp\batches"
batch_files = sorted([f for f in os.listdir(batch_dir) if f.startswith('batch_')], key=lambda x: int(x.split('_')[1].split('.')[0]))

# Function to run a file
def run_file(file_path):
    print(f"Importing {file_path}...")
    cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--file", file_path, "--yes"]
    # We use a larger timeout since some batches might be slow
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', shell=True)
    return result

for bf in batch_files:
    path = os.path.join(batch_dir, bf)
    start_time = time.time()
    res = run_file(path)
    elapsed = time.time() - start_time
    
    if "success\": true" in res.stdout or res.returncode == 0:
        print(f"SUCCESS: {bf} in {elapsed:.2f}s")
    else:
        print(f"FAILED: {bf} Errors: {res.stderr}")
        # If it failed, let's try reading the first few lines to see if it's a schema issue
        with open(path, 'r', encoding='utf-8') as f:
            print(f"First line of failed batch: {f.readline()}")
        
        # Stop on failure to avoid cascade
        break

print("Batch import process finished.")
