import sqlite3
import os

candidate_dbs = [
    r'e:\Html-work\服务器上备份的资源\db\moody.db',
    r'e:\Html-work\storage\db\moody_restore.db',
    r'e:\Html-work\backend\moody.db',
    r'e:\Html-work\storage\db\moody.db'
]

def check_db(db_path):
    if not os.path.exists(db_path):
        return None

    try:
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        
        cur.execute("PRAGMA table_info(songs)")
        cols = cur.fetchall()
        col_names = [c[1] for c in cols]
        
        path_col = None
        for c in ['file_path', 'FileId', 'path']:
            if c in col_names:
                path_col = c
                break
        
        if not path_col:
            return (db_path, "No path col", 0, 0)

        cur.execute("SELECT count(*) FROM songs")
        total = cur.fetchone()[0]
        
        cur.execute(f"SELECT count(*) FROM songs WHERE {path_col} IS NOT NULL AND {path_col} != ''")
        with_path = cur.fetchone()[0]
        
        con.close()
        return (db_path, path_col, total, with_path)
    except Exception as e:
        return (db_path, str(e), 0, 0)

if __name__ == "__main__":
    print(f"{'Path':<60} | {'Col':<10} | {'Total':<10} | {'With Path':<10}")
    print("-" * 100)
    for db in candidate_dbs:
        res = check_db(db)
        if res:
            print(f"{res[0]:<60} | {res[1]:<10} | {res[2]:<10} | {res[3]:<10}")
