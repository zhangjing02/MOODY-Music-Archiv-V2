import sqlite3
import sys
import os

def dump_db(db_path, sql_path):
    if not os.path.exists(db_path):
        print(f"Error: Database {db_path} not found.")
        sys.exit(1)
        
    try:
        con = sqlite3.connect(db_path)
        with open(sql_path, 'w', encoding='utf-8') as f:
            for line in con.iterdump():
                if line.startswith("BEGIN") or line.startswith("COMMIT"):
                    continue
                # D1 requires pure SQL, standard iterdump format works fine.
                f.write(f"{line}\n")
        con.close()
        print(f"Successfully exported {db_path} to {sql_path}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python dump_db.py <input.db> <output.sql>")
        sys.exit(1)
    dump_db(sys.argv[1], sys.argv[2])
