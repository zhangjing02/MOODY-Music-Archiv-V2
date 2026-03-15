import os

sql_path = r"e:\Html-work\tmp\moody_clean.sql"
output_dir = r"e:\Html-work\tmp\batches"
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

with open(sql_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

schema_lines = []
insert_lines = []

for line in lines:
    if line.startswith('CREATE TABLE') or line.startswith('CREATE INDEX') or line.startswith('CREATE UNIQUE INDEX'):
        schema_lines.append(line)
    elif line.startswith('INSERT INTO'):
        insert_lines.append(line)
    elif line.strip() == '' or line.startswith('--'):
        continue
    else:
        # Other statements (like DELETE, PRAGMA if missed)
        schema_lines.append(line)

# Write schema
with open(os.path.join(output_dir, 'schema.sql'), 'w', encoding='utf-8') as f:
    f.writelines(schema_lines)

# Split inserts into chunks of 2000
chunk_size = 2000
for i in range(0, len(insert_lines), chunk_size):
    chunk = insert_lines[i:i + chunk_size]
    batch_num = i // chunk_size
    with open(os.path.join(output_dir, f'batch_{batch_num}.sql'), 'w', encoding='utf-8') as f:
        f.writelines(chunk)

print(f"Created schema.sql and {len(os.listdir(output_dir))-1} batch files.")
