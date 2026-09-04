#!/usr/bin/env python3
"""
MoodyMusic Artist Avatar Batch Downloader
==========================================
Downloads artist photos from Wikipedia/Wikimedia Commons,
resizes to 300x300 square, saves as artist_{id}.jpg.

Usage:
    python download_all_artist_avatars.py
"""

import urllib.request
import urllib.parse
import json
import os
import sys
import time
import ssl

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# ========================================
# Configuration
# ========================================
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloaded_avatars")
TARGET_SIZE = 300
RATE_LIMIT = 0.4  # seconds between Wikipedia API calls
UA = "MoodyMusicBot/1.0 (personal music app avatar downloader)"

# ========================================
# All 135 artists from D1 database
# ========================================
ARTISTS = [
    (1, "阿杜"), (2, "A-Sun"), (3, "阿牛"), (4, "Beyond"), (5, "白安"),
    (6, "陈奕迅"), (7, "JOLIN蔡依林"), (8, "陈绮贞"), (9, "蔡健雅"), (10, "崔健"),
    (11, "陈粒"), (12, "曹格"), (13, "Jackie Chan"), (14, "邓紫棋"), (15, "邓丽君"),
    (16, "窦唯"), (17, "戴佩妮"), (18, "动力火车"), (19, "刀郎"), (20, "费玉清"),
    (21, "范晓萱"), (22, "方大同"), (23, "凤凰传奇"), (24, "房东的猫"), (25, "范玮琪"),
    (26, "飞儿乐团"), (27, "郭富城"), (28, "古巨基"), (29, "高胜美"), (30, "葛东琪"),
    (31, "华晨宇"), (32, "韩红"), (33, "黄小琥"), (34, "胡彦斌"), (35, "黄龄"),
    (36, "霍尊"), (37, "黄品源"), (38, "黄义达"), (39, "姜育恒"), (40, "金志文"),
    (41, "吉克隽逸"), (42, "游鸿明"), (43, "庾澄庆"), (44, "袁惟仁"), (45, "林俊杰"),
    (46, "李宗盛"), (47, "罗大佑"), (48, "刘德华"), (49, "黎明"), (50, "梁静茹"),
    (51, "李玟"), (52, "李荣浩"), (53, "李健"), (54, "鹿晗"), (55, "林宥嘉"),
    (56, "卢广仲"), (57, "李圣杰"), (58, "梅艳芳"), (59, "莫文蔚"), (60, "毛不易"),
    (61, "孟庭苇"), (62, "那英"), (63, "NINEONE赵馨玥"), (64, "南拳妈妈"), (65, "朴树"),
    (66, "潘玮柏"), (67, "彭羚"), (68, "品冠"), (69, "齐秦"), (70, "齐豫"),
    (71, "曲婉婷"), (72, "任贤齐"), (73, "容祖儿"), (74, "孙燕姿"), (75, "苏打绿"),
    (76, "尚雯婕"), (77, "萨顶顶"), (78, "顺子"), (79, "苏慧伦"), (80, "陶喆"),
    (81, "田馥甄"), (82, "谭咏麟"), (83, "腾格尔"), (84, "痛仰乐队"), (85, "田震"),
    (86, "王菲"), (87, "王力宏"), (88, "五月天"), (89, "伍佰"), (90, "汪峰"),
    (91, "魏如萱"), (92, "韦礼安"), (93, "万晓利"), (94, "万芳"), (95, "许巍"),
    (96, "薛之谦"), (97, "萧敬腾"), (98, "许嵩"), (99, "徐佳瑩"), (100, "信乐团"),
    (101, "萧亚轩"), (102, "许志安"), (103, "杨丞琳"), (104, "杨千嬅"), (105, "郁可唯"),
    (106, "羽·泉"), (107, "袁娅维"), (108, "Yang Kun"), (109, "张学友"), (110, "张国荣"),
    (111, "张惠妹"), (112, "张信哲"), (113, "张震岳"), (114, "周华健"), (115, "赵雷"),
    (116, "张靓颖"), (117, "张杰"), (118, "张雨生"), (119, "周深"), (120, "周杰伦"),
    (121, "杨宗纬"), (122, "周笔畅"), (123, "刘惜君"), (124, "苏妙玲"), (125, "单依纯"),
    (126, "张碧晨"), (127, "梁博"), (128, "李琦"), (129, "张磊"), (130, "吴莫愁"),
    (131, "金池"), (132, "汪晨蕊"), (133, "中国好声音"), (134, "我是歌手"), (135, "蒙面唱将猜猜猜"),
]

# IDs to skip (variety shows — already have custom logo logic)
SKIP_IDS = {133, 134, 135}

# Map DB names to their correct Chinese Wikipedia article titles
WIKI_NAMES = {
    "JOLIN蔡依林": "蔡依林",
    "Jackie Chan": "成龍",
    "NINEONE赵馨玥": "赵馨玥",
    "Yang Kun": "杨坤",
    "A-Sun": "陈信宏",           # 阿信 (五月天主唱)
    "羽·泉": "羽泉",
    "Beyond": "Beyond",
    "飞儿乐团": "F.I.R.飛兒樂團",
    "信乐团": "信樂團",
    "南拳妈妈": "南拳媽媽",
    "动力火车": "動力火車",
    "苏打绿": "蘇打綠",
    "凤凰传奇": "鳳凰傳奇",
    "痛仰乐队": "痛仰乐队",
    "五月天": "五月天",
    "房东的猫": "房东的猫",
    "李玟": "李玟",
    "刀郎": "刀郎_(歌手)",
    "阿杜": "阿杜_(歌手)",
    "阿牛": "阿牛_(马来西亚歌手)",
    "李健": "李健_(歌手)",
    "张杰": "张杰_(中国歌手)",
    "张磊": "张磊_(歌手)",
    "李琦": "李琦_(歌手)",
    "梁博": "梁博",
    "曹格": "曹格",
    "徐佳瑩": "徐佳瑩",
    "杨千嬅": "楊千嬅",
    "谭咏麟": "譚詠麟",
    "容祖儿": "容祖兒",
    "郭富城": "郭富城",
    "古巨基": "古巨基",
    "周华健": "周華健",
    "张学友": "張學友",
    "张国荣": "張國榮",
    "张惠妹": "張惠妹",
    "萧敬腾": "蕭敬騰",
    "萧亚轩": "蕭亞軒",
    "许志安": "許志安",
    "梅艳芳": "梅艷芳",
    "杨丞琳": "楊丞琳",
    "费玉清": "費玉清",
    "黎明": "黎明_(歌手)",
    "黄龄": "黄龄",
    "顺子": "順子",
}

# Hardcoded fallback URLs for artists that might be hard to find on Wikipedia
# (from existing batch1/batch2 scripts + manually curated)
FALLBACK_URLS = {
    4:   "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Beyond_1991.jpg/440px-Beyond_1991.jpg",
    6:   "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/%E9%99%88%E5%A5%95%E8%BF%85_Eason_Chan.jpg/440px-%E9%99%88%E5%A5%95%E8%BF%85_Eason_Chan.jpg",
    7:   "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/%E8%94%A1%E4%BE%9D%E6%9E%97%2816483101995%29_%28cropped%29.jpg/440px-%E8%94%A1%E4%BE%9D%E6%9E%97%2816483101995%29_%28cropped%29.jpg",
    14:  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/G.E.M.%E9%82%93%E7%B4%AB%E6%A3%8B_2017-8-9_6.jpg/440px-G.E.M.%E9%82%93%E7%B4%AB%E6%A3%8B_2017-8-9_6.jpg",
    43:  "https://live.staticflickr.com/2877/13267543233_5c07cfd8d8_o.jpg",
    45:  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/%E6%9E%97%E4%BF%8A%E5%82%91.jpg/440px-%E6%9E%97%E4%BF%8A%E5%82%91.jpg",
    46:  "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Jonathan_Lee_2014_Nanking_cr.jpg/440px-Jonathan_Lee_2014_Nanking_cr.jpg",
    47:  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Lo_Ta-yu_%E7%BE%85%E5%A4%A7%E4%BD%91_2011_%28cropped%29.jpg/440px-Lo_Ta-yu_%E7%BE%85%E5%A4%A7%E4%BD%91_2011_%28cropped%29.jpg",
    48:  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Andy_Lau_%28cropped%29.jpg/440px-Andy_Lau_%28cropped%29.jpg",
    56:  "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Crowd_Lu_2020.jpg/440px-Crowd_Lu_2020.jpg",
    59:  "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Karen_Mok_2013-05-17.jpg/440px-Karen_Mok_2013-05-17.jpg",
    74:  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/2014_%E5%AD%AB%E7%87%95%E5%A7%BF.jpg/440px-2014_%E5%AD%AB%E7%87%95%E5%A7%BF.jpg",
    86:  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Faye_Wong_%28cropped%29.jpg/440px-Faye_Wong_%28cropped%29.jpg",
    87:  "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/%E4%B8%80%E4%BA%BA%C2%B7%E4%B8%80%E5%BC%A0%EF%BD%9CNO.150_%E7%8E%8B%E5%8A%9B%E5%AE%8F.jpg/440px-%E4%B8%80%E4%BA%BA%C2%B7%E4%B8%80%E5%BC%A0%EF%BD%9CNO.150_%E7%8E%8B%E5%8A%9B%E5%AE%8F.jpg",
    89:  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/201406%E4%BC%8D%E4%BD%B0.jpg/440px-201406%E4%BC%8D%E4%BD%B0.jpg",
    109: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Jacky_Cheung.jpg/440px-Jacky_Cheung.jpg",
    111: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/20110820%E5%BC%B5%E6%83%A0%E5%A6%B9.jpg/440px-20110820%E5%BC%B5%E6%83%A0%E5%A6%B9.jpg",
}


# ========================================
# Core Functions
# ========================================

def make_request(url, timeout=15):
    """Make an HTTP request with proper headers"""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    ctx = ssl.create_default_context()
    return urllib.request.urlopen(req, context=ctx, timeout=timeout)


def get_wiki_image(name, lang="zh"):
    """
    Get artist image URL from Wikipedia REST API (page/summary endpoint).
    Returns the original image URL or None.
    """
    search_name = WIKI_NAMES.get(name, name)
    encoded = urllib.parse.quote(search_name)
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded}"

    try:
        with make_request(url) as resp:
            data = json.loads(resp.read())
            # Prefer original for quality, fallback to thumbnail
            if "originalimage" in data and data["originalimage"].get("source"):
                return data["originalimage"]["source"]
            if "thumbnail" in data and data["thumbnail"].get("source"):
                # Upscale the thumbnail URL by replacing size parameter
                thumb_url = data["thumbnail"]["source"]
                # Wikipedia thumbnails: .../thumb/.../300px-Filename.jpg
                # Replace Npx with 500px for better quality
                import re
                upscaled = re.sub(r'/\d+px-', '/500px-', thumb_url)
                return upscaled
    except urllib.error.HTTPError as e:
        if e.code == 404:
            pass  # Page not found, will try fallback
        else:
            print(f"    [WARN] Wikipedia API {lang} HTTP {e.code} for '{search_name}'")
    except Exception as e:
        print(f"    [WARN] Wikipedia API {lang} error for '{search_name}': {e}")

    return None


def download_image(url, output_path):
    """Download an image from URL to a local file. Returns file size in bytes."""
    # Make sure URL is properly encoded
    parsed = urllib.parse.urlsplit(url)
    # Only re-encode the path if it contains unencoded characters
    if not parsed.path.startswith('/') or any(ord(c) > 127 for c in parsed.path):
        encoded_path = urllib.parse.quote(parsed.path, safe="/%+")
        url = urllib.parse.urlunsplit((
            parsed.scheme, parsed.netloc, encoded_path, parsed.query, parsed.fragment
        ))

    with make_request(url, timeout=30) as resp:
        data = resp.read()

    with open(output_path, "wb") as f:
        f.write(data)

    return len(data)


def resize_to_square(input_path, output_path, size=300):
    """Resize and center-crop image to a square. Uses Pillow."""
    from PIL import Image

    img = Image.open(input_path)

    # Convert to RGB (handle RGBA, P mode, etc.)
    if img.mode not in ("RGB",):
        img = img.convert("RGB")

    w, h = img.size
    crop_size = min(w, h)
    left = (w - crop_size) // 2
    top = (h - crop_size) // 2
    img = img.crop((left, top, left + crop_size, top + crop_size))
    img = img.resize((size, size), Image.LANCZOS)
    img.save(output_path, "JPEG", quality=85)
    return os.path.getsize(output_path)


# ========================================
# Main
# ========================================

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    success = []
    failed = []
    skipped = []

    total = len([a for a in ARTISTS if a[0] not in SKIP_IDS])
    count = 0

    for artist_id, name in ARTISTS:
        if artist_id in SKIP_IDS:
            skipped.append((artist_id, name, "Variety show (custom logo)"))
            continue

        count += 1
        output_path = os.path.join(OUTPUT_DIR, f"artist_{artist_id}.jpg")

        # Skip if already successfully downloaded
        if os.path.exists(output_path) and os.path.getsize(output_path) > 2000:
            success.append((artist_id, name, "cached"))
            print(f"[{count}/{total}] SKIP {name} (id={artist_id}) - already downloaded")
            continue

        print(f"[{count}/{total}] Processing {name} (id={artist_id})...")

        img_url = None

        # Strategy 1: Chinese Wikipedia
        img_url = get_wiki_image(name, "zh")

        # Strategy 2: English Wikipedia (especially for English-named artists)
        if not img_url:
            img_url = get_wiki_image(name, "en")

        # Strategy 3: Hardcoded fallback URLs
        if not img_url and artist_id in FALLBACK_URLS:
            img_url = FALLBACK_URLS[artist_id]
            print(f"    Using hardcoded fallback URL")

        if img_url:
            try:
                raw_size = download_image(img_url, output_path)
                if raw_size < 500:
                    raise ValueError(f"Image too small ({raw_size} bytes), likely an error page")

                # Resize to 300x300 square
                final_size = resize_to_square(output_path, output_path, TARGET_SIZE)
                success.append((artist_id, name, f"{final_size/1024:.1f}KB"))
                print(f"    OK - {final_size/1024:.1f}KB")
            except Exception as e:
                failed.append((artist_id, name, str(e)))
                print(f"    FAIL - {e}")
                if os.path.exists(output_path):
                    os.remove(output_path)
        else:
            failed.append((artist_id, name, "No image source found"))
            print(f"    MISS - No image found on Wikipedia")

        time.sleep(RATE_LIMIT)

    # ========================================
    # Summary Report
    # ========================================
    print(f"\n{'=' * 60}")
    print(f"DOWNLOAD COMPLETE")
    print(f"{'=' * 60}")
    print(f"  Success: {len(success)}")
    print(f"  Failed:  {len(failed)}")
    print(f"  Skipped: {len(skipped)}")
    print(f"{'=' * 60}")

    if failed:
        print(f"\nFailed artists (need manual intervention):")
        for aid, aname, reason in failed:
            print(f"  [{aid}] {aname}: {reason}")

    # ========================================
    # Generate SQL update file
    # ========================================
    sql_path = os.path.join(OUTPUT_DIR, "update_photo_urls.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        for aid, aname, _ in success:
            f.write(f"UPDATE artists SET photo_url = 'avatars/artists/artist_{aid}.jpg' WHERE id = {aid};\n")
    print(f"\nSQL update file: {sql_path}")
    print(f"Contains {len(success)} UPDATE statements")

    # ========================================
    # Generate R2 upload script
    # ========================================
    upload_path = os.path.join(OUTPUT_DIR, "upload_to_r2.ps1")
    with open(upload_path, "w", encoding="utf-8") as f:
        f.write("# Upload all artist avatars to Cloudflare R2\n")
        f.write("# Run from: backend/cloudflare-worker/\n\n")
        for aid, aname, _ in success:
            f.write(f'wrangler r2 object put moody-music-asset/avatars/artists/artist_{aid}.jpg --file="../tools/downloaded_avatars/artist_{aid}.jpg" --content-type="image/jpeg"\n')
    print(f"R2 upload script: {upload_path}")

    # Also write a list of failed IDs for follow-up
    if failed:
        failed_path = os.path.join(OUTPUT_DIR, "failed_artists.json")
        with open(failed_path, "w", encoding="utf-8") as f:
            json.dump([{"id": aid, "name": aname, "reason": reason} for aid, aname, reason in failed], f, ensure_ascii=False, indent=2)
        print(f"Failed artists JSON: {failed_path}")


if __name__ == "__main__":
    main()
