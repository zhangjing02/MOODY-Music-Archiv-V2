import json
import os
import re

# 配置
SKELETON_PATH = r'E:\Html-work\storage\metadata\skeleton.json'
COVERS_DIR = r'E:\Html-work\storage\covers'

def sanitize_filename(name):
    return re.sub(r'[\\/:*?"<>|]', '_', name)

def main():
    print("🚀 Starting skeleton path refactoring...")
    
    with open(SKELETON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    updated_count = 0
    missing_count = 0

    for artist in data.get('artists', []):
        artist_name = artist.get('name', 'Unknown')
        for album in artist.get('albums', []):
            original_cover = album.get('cover')
            if original_cover and original_cover.startswith('http'):
                album_title = album.get('title', 'Unknown')
                filename = f"{sanitize_filename(artist_name)}_{sanitize_filename(album_title)}.jpg"
                local_path = f"/storage/covers/{filename}"
                
                # 核实物理文件是否存在 (可选，但建议)
                physical_path = os.path.join(COVERS_DIR, filename)
                if os.path.exists(physical_path):
                    album['cover'] = local_path
                    updated_count += 1
                else:
                    # 保持原样或记录缺失
                    missing_count += 1

    # 写入新文件 (先写临时文件确保安全)
    temp_path = SKELETON_PATH + '.tmp'
    with open(temp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    # 覆盖原文件
    os.replace(temp_path, SKELETON_PATH)
    
    print(f"✨ Refactoring completed.")
    print(f"✅ Updated: {updated_count}")
    print(f"⚠️ Missing physical files: {missing_count}")

if __name__ == "__main__":
    main()
