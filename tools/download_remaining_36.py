#!/usr/bin/env python3
"""
MoodyMusic - Download Remaining 36 Artists
Using QQ Music & Netease Music APIs to get official high-res square artist avatars.
"""

import urllib.request
import urllib.parse
import json
import os
import sys
import time
from PIL import Image

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "downloaded_avatars")
TARGET_SIZE = 300

REMAINING_ARTISTS = [
  (1, "阿杜"),
  (5, "白安"),
  (11, "陈粒"),
  (19, "刀郎"),
  (21, "范晓萱"),
  (23, "凤凰传奇"),
  (26, "飞儿乐团"),
  (29, "高胜美"),
  (30, "葛东琪"),
  (33, "黄小琥"),
  (36, "霍尊"),
  (39, "姜育恒"),
  (40, "金志文"),
  (41, "吉克隽逸"),
  (42, "游鸿明"),
  (44, "袁惟仁"),
  (58, "梅艳芳"),
  (60, "毛不易"),
  (61, "孟庭苇"),
  (64, "南拳妈妈"),
  (65, "朴树"),
  (69, "齐秦"),
  (71, "曲婉婷"),
  (83, "腾格尔"),
  (84, "痛仰乐队"),
  (85, "田震"),
  (93, "万晓利"),
  (94, "万芳"),
  (98, "许嵩"),
  (100, "信乐团"),
  (107, "袁娅维"),
  (108, "杨坤"),
  (124, "苏妙玲"),
  (127, "梁博"),
  (129, "张磊"),
  (132, "汪晨蕊"),
]

def get_qq_music_avatar(name):
    q = name
    if q == "飞儿乐团": q = "FIR"
    url = 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=' + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': 'https://y.qq.com/'})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            d = json.loads(resp.read().decode('utf-8'))
            singers = d.get('data', {}).get('singer', {}).get('itemlist', [])
            if singers:
                s = singers[0]
                pic = s.get('pic', '').replace('150x150', '300x300')
                if pic.startswith('http://'):
                    pic = 'https://' + pic[7:]
                return pic
    except Exception as e:
        print(f"    QQ Music search error for {name}: {e}")
    return None

def get_netease_music_avatar(name):
    url = f"https://music.163.com/api/search/get/web?s={urllib.parse.quote(name)}&type=100&limit=1"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            artists = data.get('result', {}).get('artists', [])
            if artists:
                a = artists[0]
                return a.get('img1v1Url') or a.get('picUrl')
    except Exception as e:
        print(f"    Netease search error for {name}: {e}")
    return None

def download_and_crop(url, output_path):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read()
    
    with open(output_path, "wb") as f:
        f.write(content)
        
    img = Image.open(output_path)
    if img.mode != "RGB":
        img = img.convert("RGB")
    w, h = img.size
    crop_size = min(w, h)
    left = (w - crop_size) // 2
    top = (h - crop_size) // 2
    img = img.crop((left, top, left + crop_size, top + crop_size))
    img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    img.save(output_path, "JPEG", quality=88)
    return os.path.getsize(output_path)

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    success = []
    failed = []

    print(f"Starting download of remaining {len(REMAINING_ARTISTS)} artists...")

    for aid, name in REMAINING_ARTISTS:
        output_path = os.path.join(OUTPUT_DIR, f"artist_{aid}.jpg")
        print(f"[{aid}] {name}...", end=" ", flush=True)

        img_url = None
        # Special preferences
        if name in ["霍尊", "白安"]:
            img_url = get_netease_music_avatar(name)
        else:
            img_url = get_qq_music_avatar(name)
            if not img_url:
                img_url = get_netease_music_avatar(name)

        if img_url:
            try:
                sz = download_and_crop(img_url, output_path)
                print(f"OK ({sz/1024:.1f} KB)")
                success.append((aid, name))
            except Exception as e:
                print(f"Download FAIL: {e}")
                failed.append((aid, name, str(e)))
        else:
            print("URL NOT FOUND")
            failed.append((aid, name, "URL not found"))
            
        time.sleep(0.2)

    print("\n" + "="*50)
    print(f"Batch completed: {len(success)} success, {len(failed)} failed")
    print("="*50)

    # Regenerate master SQL and Upload script for all 135 artists
    all_files = [f for f in os.listdir(OUTPUT_DIR) if f.startswith("artist_") and f.endswith(".jpg")]
    all_ids = sorted([int(f.replace("artist_", "").replace(".jpg", "")) for f in all_files])
    
    sql_path = os.path.join(OUTPUT_DIR, "update_photo_urls.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("-- Batch update artist photo_url\n")
        for a_id in all_ids:
            f.write(f"UPDATE artists SET photo_url = 'avatars/artists/artist_{a_id}.jpg' WHERE id = {a_id};\n")

    ps1_path = os.path.join(OUTPUT_DIR, "upload_to_r2.ps1")
    with open(ps1_path, "w", encoding="utf-8") as f:
        f.write("# Upload all artist avatars to Cloudflare R2\n")
        f.write("# Bucket: moody-music-asset\n\n")
        for a_id in all_ids:
            f.write(f'npx wrangler r2 object put moody-music-asset/avatars/artists/artist_{a_id}.jpg --file="../tools/downloaded_avatars/artist_{a_id}.jpg" --content-type="image/jpeg" --remote\n')

    print(f"Total downloaded files now: {len(all_files)}")
    print(f"Generated SQL: {sql_path} ({len(all_ids)} updates)")
    print(f"Generated R2 Upload: {ps1_path}")

if __name__ == "__main__":
    main()
