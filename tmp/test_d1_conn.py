import subprocess

db_name = "moody-d1-test"
cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--command", "SELECT 1;", "--yes"]
result = subprocess.run(cmd, capture_output=True, text=True, shell=True)

print(f"Return code: {result.returncode}")
print(f"STDOUT: {result.stdout}")
print(f"STDERR: {result.stderr}")
