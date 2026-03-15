import subprocess

db_name = "moody-d1-test"
# Single line
stmt = "CREATE TABLE artists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, region TEXT, bio TEXT, photo_url TEXT);"

print(f"Executing: {stmt}")
cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--command", stmt, "--yes"]
result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', shell=True)

print(f"Return code: {result.returncode}")
print(f"STDOUT: {result.stdout}")
print(f"STDERR: {result.stderr}")
