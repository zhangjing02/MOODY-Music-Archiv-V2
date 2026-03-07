import json
import os
import requests
import re
import time
from concurrent.futures import ThreadPoolExecutor

# 配置
SKELETON_PATH = r'E:\Html-work\storage\metadata\skeleton.json'
COVERS_DIR = r'E:\Html-work\storage\covers'

def sanitize_filename(name):
    return re.sub(r'[\\/:*?"<>|]', '_', name)

def download_cover(url, artist, album):
    if not url or not url.startswith('http'):
        return None
    
    filename = f"{sanitize_filename(artist)}_{sanitize_filename(album)}.jpg"
    filepath = os.path.join(COVERS_DIR, filename)
    
    # 如果已存在则跳过
    if os.path.exists(filepath):
        return filename

    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            with open(filepath, 'wb') as f:
                f.write(response.content)
            print(f"✅ Downloaded: {filename}")
            return filename
        else:
            print(f"❌ Failed ({response.status_code}): {url}")
    except Exception as e:
        print(f"⚠️ Error: {e}")
    
    return None

def main():
    if not os.path.exists(COVERS_DIR):
        os.makedirs(COVERS_DIR)

    with open(SKELETON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    tasks = []
    for artist in data.get('artists', []):
        artist_name = artist.get('name', 'Unknown')
        for album in artist.get('albums', []):
            cover_url = album.get('cover')
            album_title = album.get('title', 'Unknown')
            if cover_url:
                tasks.append((cover_url, artist_name, album_title))

    print(f"🚀 Total covers found: {len(tasks)}")
    
    # 更新后的专辑映射
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(lambda x: download_cover(*x), tasks))

    # 更新 skeleton.json 指向本地
    # 我们不在下载脚本里更新，另写一个脚本确保安全
    print("✨ Download phase completed.")

if __name__ == "__main__":
    main()
