import os

# Read the d1_list.txt which is UTF-16LE
d1_list_path = r"e:\Html-work\tmp\d1_list.txt"
if os.path.exists(d1_list_path):
    try:
        with open(d1_list_path, 'r', encoding='utf-16') as f:
            print("--- D1 List Content ---")
            print(f.read())
            print("-----------------------")
    except Exception as e:
        print(f"Error reading d1_list.txt: {e}")

# Check files
files = [
    r"e:\Html-work\tmp\moody_clean.sql",
    r"e:\Html-work\tmp\moody_dump.sql",
    r"e:\Html-work\storage\db\moody.db"
]

for f in files:
    if os.path.exists(f):
        size = os.path.getsize(f)
        print(f"File: {f}, Size: {size / (1024*1024):.2f} MB")
        if f.endswith(".sql"):
            # Check last 10 lines
            with open(f, 'rb') as sql_file:
                sql_file.seek(max(0, size - 1000))
                content = sql_file.read().decode('utf-8', errors='ignore')
                print(f"Tail of {f}:\n{content[-500:]}")
    else:
        print(f"File not found: {f}")
