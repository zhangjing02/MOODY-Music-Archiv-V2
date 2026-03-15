import subprocess
import os

sql_path = r"e:\Html-work\tmp\batches\schema.sql"
db_name = "moody-d1-test"

# Function to run a single statement
def run_stmt(stmt):
    cmd = ["npx", "wrangler", "d1", "execute", db_name, "--remote", "--command", stmt, "--yes"]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', shell=True)
    return result

with open(sql_path, 'r', encoding='utf-8') as f:
    # Read the whole file and join multi-line statements into single lines
    content = f.read()

# Split by semicolon but preserve content
raw_statements = content.split(';')
statements = []
for s in raw_statements:
    clean_s = " ".join(s.split()).strip()
    if clean_s:
        statements.append(clean_s + ";")

print(f"Total schema statements: {len(statements)}")

success_count = 0
fail_count = 0

for i, stmt in enumerate(statements):
    print(f"[{i+1}/{len(statements)}] Executing: {stmt[:50]}...")
    res = run_stmt(stmt)
    if "success\": true" in res.stdout or res.returncode == 0:
        print("Success")
        success_count += 1
    else:
        print(f"FAILED: {res.stderr}")
        fail_count += 1

print(f"Summary: {success_count} success, {fail_count} failed.")
