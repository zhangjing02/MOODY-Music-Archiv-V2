import subprocess
import os

sql_path = r"e:\Html-work\tmp\batches\schema.sql"
db_name = "moody-d1-test"

with open(sql_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

statements = []
current_stmt = []
for line in lines:
    if line.strip().startswith('--'): continue
    current_stmt.append(line)
    if ';' in line:
        statements.append(" ".join(current_stmt).strip())
        current_stmt = []

success_count = 0
fail_count = 0

for stmt in statements:
    # Escape quotes for shell if needed, but easier to use subprocess list
    print(f"Executing: {stmt[:50]}...")
    cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--command", stmt, "--yes"]
    result = subprocess.run(cmd, capture_output=True, text=True, shell=True)
    
    if result.returncode == 0:
        print("Success")
        success_count += 1
    else:
        print(f"FAILED: {result.stderr}")
        fail_count += 1

print(f"Finished: {success_count} success, {fail_count} failed.")
