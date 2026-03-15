import sys
import re

def clean_sql(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Tables in dependency order
    order = ['artists', 'albums', 'songs', 'lyrics']
    
    table_lines = {}
    other_lines = []
    current_table = None
    
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue
            
        # Skip PRAGMA
        if line_clean.upper().startswith("PRAGMA"):
            continue
            
        # Skip sqlite_sequence
        if "sqlite_sequence" in line_clean:
            continue
            
        # Skip TRANSACTION markers in file
        if line_clean.upper().startswith("BEGIN TRANSACTION") or line_clean.upper().startswith("COMMIT") or line_clean.upper().startswith("ROLLBACK"):
            continue

        # Detect CREATE TABLE
        create_match = re.match(r'CREATE TABLE "?(\w+)"?', line_clean, re.IGNORECASE)
        if create_match:
            current_table = create_match.group(1)
            if current_table not in table_lines:
                table_lines[current_table] = []
            table_lines[current_table].append(line)
            continue
            
        # Detect INSERT INTO
        insert_match = re.match(r'INSERT INTO "?(\w+)"?', line_clean, re.IGNORECASE)
        if insert_match:
            table_name = insert_match.group(1)
            if table_name not in table_lines:
                table_lines[table_name] = []
            table_lines[table_name].append(line)
            continue
            
        # Detect INDEX
        if "CREATE INDEX" in line_clean.upper() or "CREATE UNIQUE INDEX" in line_clean.upper():
            other_lines.append(line)
            continue
            
        # Multiline CREATE
        if current_table and line_clean and not insert_match:
            table_lines[current_table].append(line)
            if line_clean.endswith(");") or line_clean.endswith(");;"):
                current_table = None
            continue
            
        other_lines.append(line)

    with open(output_path, 'w', encoding='utf-8') as f_out:
        # 1. Write ordered tables
        for t in order:
            if t in table_lines:
                for row in table_lines[t]:
                    f_out.write(row)
                del table_lines[t]
                
        # 2. Write remaining tables
        for t in table_lines:
            for row in table_lines[t]:
                f_out.write(row)
                
        # 3. Write indices and others
        for row in other_lines:
            f_out.write(row)

if __name__ == "__main__":
    clean_sql(sys.argv[1], sys.argv[2])
