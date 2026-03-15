import subprocess

db_name = "moody-d1-test"
# Force UTF-8 encoding for subprocess
cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--command", "SELECT 1;", "--yes"]
result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', shell=True)

print(f"Return code: {result.returncode}")
print(f"STDOUT: {result.stdout}")
print(f"STDERR: {result.stderr}")
