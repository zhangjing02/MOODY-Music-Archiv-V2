import sqlite3
import os

db_path = r'e:\Html-work\tmp\test_import.db'
sql_path = r'e:\Html-work\tmp\moody_clean.sql'

if os.path.exists(db_path):
    os.remove(db_path)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    with open(sql_path, 'r', encoding='utf-8') as f:
        sql = f.read()
        cursor.executescript(sql)
    conn.commit()
    conn.close()
    print("SQL is valid locally.")
except Exception as e:
    print(f"SQL Error locally: {e}")
