import os
import sqlite3
import glob

# Paths based on the root directory
PROJECT_ROOT = r"d:\PersonalProject\MoodyMusic"
DB_PATH = os.path.join(PROJECT_ROOT, "storage", "db", "moody.db.bak") # Updating the local backup first to avoid messing up local dev db
LYRICS_DIR = os.path.join(PROJECT_ROOT, "storage", "lyrics")

print(f"Connecting to database: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Find all .lrc files in the lyrics directory
lrc_files = glob.glob(os.path.join(LYRICS_DIR, "**", "*.lrc"), recursive=True)
updated_count = 0

for file_path in lrc_files:
    # Example: d:\...\storage\lyrics\周杰伦\Jay\l_23291.lrc
    filename = os.path.basename(file_path)
    if filename.startswith("l_") and filename.endswith(".lrc"):
        # Extract ID
        id_str = filename[2:-4]
        try:
            song_id = int(id_str)
            # Calculate relative path
            rel_path = os.path.relpath(file_path, LYRICS_DIR)
            rel_path_unix = rel_path.replace("\\", "/")
            
            # Check if song exists
            cursor.execute("SELECT id, title, lrc_path FROM songs WHERE id = ?", (song_id,))
            song = cursor.fetchone()
            if song:
                current_lrc = song[2]
                if current_lrc != rel_path_unix:
                    print(f"Updating song [{song_id}] - {song[1]}: {current_lrc} -> {rel_path_unix}")
                    cursor.execute("UPDATE songs SET lrc_path = ? WHERE id = ?", (rel_path_unix, song_id))
                    updated_count += 1
        except ValueError:
            print(f"Skipping invalid filename: {filename}")

conn.commit()
conn.close()
print(f"Successfully updated {updated_count} lyrics mappings in the database.")
