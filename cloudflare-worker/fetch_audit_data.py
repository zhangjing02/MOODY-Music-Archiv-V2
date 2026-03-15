import subprocess
import json
import sys

def get_d1_data():
    cmd = [
        "npx", "wrangler", "d1", "execute", "moody-d1-test",
        "--command", "SELECT title, file_path FROM songs WHERE file_path IS NOT NULL AND file_path != ''",
        "--json"
    ]
    try:
        # Use shell=True for npx on Windows
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding='utf-8', shell=True)
        return json.loads(result.stdout)
    except Exception as e:
        print(f"Error executing wrangler: {e}")
        if hasattr(e, 'stderr'):
            print(f"Stderr: {e.stderr}")
        return None

def get_r2_data():
    # Since worker is running locally, we can try to fetch from it
    # But let's try to trust the previous fetch or try again with a cleaner method
    import urllib.request
    try:
        resp = urllib.request.urlopen('http://localhost:8787/api/debug/r2', timeout=10)
        return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"Error fetching R2 from worker: {e}")
        return None

if __name__ == "__main__":
    d1_data = get_d1_data()
    r2_data = get_r2_data()

    audit_result = {
        "d1": d1_data,
        "r2": r2_data
    }

    with open("audit_full_data.json", "w", encoding="utf-8") as f:
        json.dump(audit_result, f, ensure_ascii=False, indent=2)
    print("Audit data saved to audit_full_data.json")
