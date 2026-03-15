import subprocess

db_name = "moody-d1-test"
tables_to_clear = [
    "client_errors",
    "entity_tags",
    "playback_history",
    "playlist_songs",
    "favorites",
    "songs"
]

def run_cmd(cmd_str):
    print(f"Executing: {cmd_str}")
    cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--command", cmd_str, "--yes"]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', shell=True)
    return result

for table in tables_to_clear:
    res = run_cmd(f"DELETE FROM {table};")
    if res.returncode == 0:
        print(f"Cleared {table}")
    else:
        print(f"Failed to clear {table}: {res.stderr}")

# Also reset sequence
run_cmd("DELETE FROM sqlite_sequence WHERE name='songs';")
