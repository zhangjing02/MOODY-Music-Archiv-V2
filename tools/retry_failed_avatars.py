#!/usr/bin/env python3
"""
MoodyMusic Artist Avatar Retry Downloader
==========================================
Retries failed downloads using MediaWiki Action API (more reliable),
with proper rate limiting and multiple fallback strategies.
"""

import urllib.request
import urllib.parse
import json
import os
import sys
import time
import ssl
import re

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "downloaded_avatars")
EXISTING_AVATARS_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "src", "assets", "images", "avatars")
TARGET_SIZE = 300
DELAY = 2.0  # Longer delay to avoid 429
UA = "MoodyMusicBot/1.0 (personal music project; one-time avatar download)"

# ========================================
# Wikipedia search name overrides (more comprehensive)
# ========================================
WIKI_NAMES_ZH = {
    "JOLIN蔡依林": "蔡依林",
    "Jackie Chan": "成龍",
    "NINEONE赵馨玥": "赵馨玥",
    "Yang Kun": "杨坤",
    "A-Sun": "陈信宏",
    "羽·泉": "羽泉",
    "Beyond": "Beyond (乐队)",
    "飞儿乐团": "F.I.R.飛兒樂團",
    "信乐团": "信樂團",
    "南拳妈妈": "南拳媽媽",
    "动力火车": "動力火車",
    "苏打绿": "蘇打綠",
    "凤凰传奇": "鳳凰傳奇",
    "痛仰乐队": "痛仰乐队",
    "五月天": "五月天",
    "房东的猫": "房東的貓",
    "刀郎": "刀郎 (歌手)",
    "阿杜": "阿杜 (歌手)",
    "阿牛": "陈庆祥",
    "李健": "李健 (歌手)",
    "张杰": "张杰 (中国歌手)",
    "张磊": "张磊 (歌手)",
    "李琦": "李琦 (歌手)",
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
    "黎明": "黎明 (歌手)",
    "顺子": "順子",
    "林俊杰": "林俊杰",
    "李宗盛": "李宗盛",
    "罗大佑": "罗大佑",
    "王菲": "王菲",
    "王力宏": "王力宏",
    "孙燕姿": "孙燕姿",
    "莫文蔚": "莫文蔚",
    "伍佰": "伍佰",
    "周杰伦": "周杰伦",
    "陶喆": "陶喆",
    "陈奕迅": "陈奕迅",
    "邓紫棋": "邓紫棋",
    "刘德华": "劉德華",
    "齐秦": "齊秦",
    "齐豫": "齊豫",
    "潘玮柏": "潘瑋柏",
    "范玮琪": "范瑋琪",
    "田馥甄": "田馥甄",
    "彭羚": "彭羚",
    "曲婉婷": "曲婉婷",
    "任贤齐": "任賢齊",
    "徐佳瑩": "徐佳瑩",
    "鹿晗": "鹿晗",
    "李荣浩": "李荣浩",
    "薛之谦": "薛之谦",
    "汪峰": "汪峰",
    "许巍": "许巍",
    "朴树": "朴树 (歌手)",
    "吴莫愁": "吴莫愁",
    "张碧晨": "张碧晨",
    "单依纯": "单依纯",
    "周笔畅": "周笔畅",
    "周深": "周深",
    "杨宗纬": "杨宗纬",
    "韦礼安": "韋禮安",
    "魏如萱": "魏如萱",
    "尚雯婕": "尚雯婕",
    "许嵩": "许嵩",
    "梁静茹": "梁靜茹",
    "林宥嘉": "林宥嘉",
    "卢广仲": "盧廣仲",
    "张震岳": "張震嶽",
    "张信哲": "張信哲",
    "赵雷": "赵雷 (歌手)",
    "张靓颖": "张靓颖",
    "张雨生": "張雨生",
    "郁可唯": "郁可唯",
    "袁娅维": "袁娅维",
    "李玟": "李玟",
    "毛不易": "毛不易",
    "华晨宇": "华晨宇",
    "韩红": "韩红",
    "胡彦斌": "胡彦斌",
    "刘惜君": "刘惜君",
    "万芳": "万芳 (歌手)",
    "品冠": "品冠",
    "曹格": "曹格",
    "方大同": "方大同",
    "高胜美": "高勝美",
    "姜育恒": "姜育恒",
    "孟庭苇": "孟庭葦",
    "那英": "那英",
    "范晓萱": "范曉萱",
    "黄品源": "黃品源",
    "陈绮贞": "陈绮贞",
    "蔡健雅": "蔡健雅",
    "崔健": "崔健",
    "窦唯": "窦唯",
    "戴佩妮": "戴佩妮",
    "邓丽君": "鄧麗君",
    "庾澄庆": "庾澄慶",
    "袁惟仁": "袁惟仁",
    "腾格尔": "腾格尔",
    "田震": "田震",
    "黄小琥": "黄小琥",
    "霍尊": "霍尊",
    "游鸿明": "游鸿明",
    "李圣杰": "李聖傑",
    "白安": "白安",
    "陈粒": "陈粒",
}

# English Wikipedia names for fallback
WIKI_NAMES_EN = {
    "Jackie Chan": "Jackie Chan",
    "Beyond": "Beyond (band)",
    "A-Sun": "Ashin (singer)",
    "阿杜": "A-Do",
    "阿牛": "Ah Niu",
    "陈奕迅": "Eason Chan",
    "蔡依林": "Jolin Tsai",
    "邓紫棋": "G.E.M. (singer)",
    "邓丽君": "Teresa Teng",
    "林俊杰": "JJ Lin",
    "李宗盛": "Jonathan Lee (musician)",
    "罗大佑": "Lo Ta-yu",
    "刘德华": "Andy Lau",
    "张学友": "Jacky Cheung",
    "张国荣": "Leslie Cheung",
    "王菲": "Faye Wong",
    "王力宏": "Wang Leehom",
    "孙燕姿": "Stefanie Sun",
    "莫文蔚": "Karen Mok",
    "伍佰": "Wu Bai",
    "周杰伦": "Jay Chou",
    "梅艳芳": "Anita Mui",
    "陶喆": "David Tao",
    "梁静茹": "Fish Leong",
    "李玟": "CoCo Lee",
    "费玉清": "Fei Yu-ching",
    "谭咏麟": "Alan Tam",
    "张惠妹": "A-Mei",
    "郭富城": "Aaron Kwok",
    "古巨基": "Leo Ku",
    "黎明": "Leon Lai",
    "容祖儿": "Joey Yung",
    "杨千嬅": "Miriam Yeung",
    "萧敬腾": "Jam Hsiao",
    "萧亚轩": "Elva Hsiao",
    "许志安": "Andy Hui",
    "杨丞琳": "Rainie Yang",
    "潘玮柏": "Wilber Pan",
    "任贤齐": "Richie Jen",
    "齐秦": "Chyi Chin",
    "周华健": "Wakin Chau",
    "范玮琪": "Christine Fan",
    "林宥嘉": "Yoga Lin",
    "卢广仲": "Crowd Lu",
    "田馥甄": "Hebe Tien",
    "张震岳": "A-Yue",
    "徐佳瑩": "LaLa Hsu",
    "曹格": "Gary Cao",
    "品冠": "Victor Wong (singer)",
    "方大同": "Khalil Fong",
    "鹿晗": "Lu Han",
    "蔡健雅": "Tanya Chua",
    "陈绮贞": "Cheer Chen",
    "五月天": "Mayday (band)",
    "飞儿乐团": "F.I.R. (band)",
    "苏打绿": "Sodagreen",
    "凤凰传奇": "Phoenix Legend",
    "动力火车": "Power Station (band)",
    "彭羚": "Cass Phang",
    "汪峰": "Wang Feng (musician)",
    "韦礼安": "WeiBird",
    "魏如萱": "Waa Wei",
    "张碧晨": "Diamond Zhang",
    "薛之谦": "Joker Xue",
    "李荣浩": "Li Ronghao",
    "华晨宇": "Hua Chenyu",
    "韩红": "Han Hong",
    "曲婉婷": "Wanting Qu",
    "张靓颖": "Jane Zhang",
    "周深": "Charlie Zhou",
    "毛不易": "Mao Buyi",
    "崔健": "Cui Jian",
    "窦唯": "Dou Wei",
    "那英": "Na Ying",
    "朴树": "Pu Shu",
    "戴佩妮": "Penny Tai",
    "信乐团": "Shin (band)",
    "苏慧伦": "Tarcy Su",
    "吴莫愁": "Momo Wu",
    "孟庭苇": "Mai Meng",
    "范晓萱": "Mavis Fan",
    "尚雯婕": "Laure Shang",
    "庾澄庆": "Harlem Yu",
    "李健": "Li Jian (singer)",
    "胡彦斌": "Anson Hu",
    "黄品源": "Huang Pin-yuan",
    "高胜美": "Sammi Kao",
    "腾格尔": "Tengger (musician)",
    "杨宗纬": "Aska Yang",
    "周笔畅": "Bibi Zhou",
    "许嵩": "Xu Song",
    "张信哲": "Jeff Chang (singer)",
    "张杰": "Jason Zhang",
    "张雨生": "Chang Yu-sheng",
    "许巍": "Xu Wei",
    "吉克隽逸": "Jike Junyi",
    "单依纯": "Shan Yichun",
    "南拳妈妈": "Nan Quan Mama",
    "萨顶顶": "Sa Dingding",
    "赵雷": "Zhao Lei (musician)",
    "袁娅维": "Tia Ray",
    "郁可唯": "Yisa Yu",
}

# Mapping from existing avatar files to artist IDs
# (reconstructed from batch1/batch2 scripts + naming convention)
EXISTING_AVATAR_MAP = {
    # From batch1
    6:  "c1.jpg",   # 陈奕迅
    86: "w1.jpg",   # 王菲
    48: "l4.jpg",   # 刘德华
    46: "l2.jpg",   # 李宗盛
    47: "l3.jpg",   # 罗大佑
    109: "z1.jpg",  # 张学友
    4:  "b1.jpg",   # Beyond
    74: "s1.jpg",   # 孙燕姿
    45: "l1.jpg",   # 林俊杰
    111: "z10.jpg", # 张惠妹
    59: "m2.jpg",   # 莫文蔚
    # From batch2
    43: "y0_2.jpg", # 庾澄庆
    87: "w2.jpg",   # 王力宏
    89: "w4.jpg",   # 伍佰
    7:  "c2.jpg",   # 蔡依林
    14: "d1.jpg",   # 邓紫棋
    56: "l12.jpg",  # 卢广仲
    57: "l13.jpg",  # 李圣杰
}


def make_request(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    ctx = ssl.create_default_context()
    return urllib.request.urlopen(req, context=ctx, timeout=timeout)


def get_wiki_image_action_api(name, lang="zh"):
    """
    Use MediaWiki Action API (more reliable than REST API).
    Returns a direct thumbnail URL at 300px width.
    """
    search_name = WIKI_NAMES_ZH.get(name, name) if lang == "zh" else WIKI_NAMES_EN.get(name, name)
    params = urllib.parse.urlencode({
        "action": "query",
        "titles": search_name,
        "prop": "pageimages",
        "format": "json",
        "pithumbsize": 400,
        "redirects": 1,
        "formatversion": 2,
    })
    url = f"https://{lang}.wikipedia.org/w/api.php?{params}"

    try:
        with make_request(url) as resp:
            data = json.loads(resp.read())
            pages = data.get("query", {}).get("pages", [])
            if pages and not pages[0].get("missing"):
                thumb = pages[0].get("thumbnail", {})
                if thumb.get("source"):
                    return thumb["source"]
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print(f"    [429] Rate limited on {lang} wiki, waiting 10s...")
            time.sleep(10)
            return get_wiki_image_action_api(name, lang)  # Retry once
        print(f"    [HTTP {e.code}] {lang} wiki API error")
    except Exception as e:
        print(f"    [ERR] {lang} wiki: {e}")

    return None


def download_image(url, output_path):
    with make_request(url, timeout=30) as resp:
        data = resp.read()
    with open(output_path, "wb") as f:
        f.write(data)
    return len(data)


def resize_to_square(input_path, output_path, size=300):
    from PIL import Image
    img = Image.open(input_path)
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


def copy_existing_avatar(artist_id, output_path):
    """Try to copy from existing frontend avatar directory"""
    if artist_id in EXISTING_AVATAR_MAP:
        src = os.path.join(EXISTING_AVATARS_DIR, EXISTING_AVATAR_MAP[artist_id])
        if os.path.exists(src) and os.path.getsize(src) > 1000:
            from PIL import Image
            img = Image.open(src)
            if img.mode not in ("RGB",):
                img = img.convert("RGB")
            w, h = img.size
            crop_size = min(w, h)
            left = (w - crop_size) // 2
            top = (h - crop_size) // 2
            img = img.crop((left, top, left + crop_size, top + crop_size))
            img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
            img.save(output_path, "JPEG", quality=85)
            return True
    return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Load failed artists
    failed_path = os.path.join(OUTPUT_DIR, "failed_artists.json")
    with open(failed_path, "r", encoding="utf-8") as f:
        failed_artists = json.load(f)

    print(f"Retrying {len(failed_artists)} failed artists...")
    print(f"Using MediaWiki Action API with {DELAY}s delay\n")

    success = []
    still_failed = []
    total = len(failed_artists)

    for idx, artist in enumerate(failed_artists):
        aid = artist["id"]
        name = artist["name"]
        output_path = os.path.join(OUTPUT_DIR, f"artist_{aid}.jpg")

        # Skip if already downloaded (from first run)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 2000:
            success.append((aid, name, "already exists"))
            print(f"[{idx+1}/{total}] SKIP {name} (id={aid}) - already exists")
            continue

        print(f"[{idx+1}/{total}] Retrying {name} (id={aid})...")

        img_url = None

        # Strategy 1: Chinese Wikipedia (Action API)
        img_url = get_wiki_image_action_api(name, "zh")
        time.sleep(DELAY)

        # Strategy 2: English Wikipedia (Action API)
        if not img_url and name in WIKI_NAMES_EN:
            print(f"    Trying English Wikipedia...")
            img_url = get_wiki_image_action_api(name, "en")
            time.sleep(DELAY)

        # Strategy 3: Copy from existing frontend avatar files
        if not img_url and aid in EXISTING_AVATAR_MAP:
            print(f"    Trying existing avatar file: {EXISTING_AVATAR_MAP[aid]}")
            try:
                if copy_existing_avatar(aid, output_path):
                    final_size = os.path.getsize(output_path)
                    success.append((aid, name, f"existing:{final_size/1024:.1f}KB"))
                    print(f"    OK (from existing file) - {final_size/1024:.1f}KB")
                    continue
            except Exception as e:
                print(f"    Failed to copy existing: {e}")

        if img_url:
            try:
                raw_size = download_image(img_url, output_path)
                if raw_size < 500:
                    raise ValueError(f"Too small ({raw_size} bytes)")
                final_size = resize_to_square(output_path, output_path, TARGET_SIZE)
                success.append((aid, name, f"{final_size/1024:.1f}KB"))
                print(f"    OK - {final_size/1024:.1f}KB")
            except Exception as e:
                still_failed.append((aid, name, str(e)))
                print(f"    FAIL - {e}")
                if os.path.exists(output_path):
                    os.remove(output_path)
        else:
            still_failed.append((aid, name, "No image found"))
            print(f"    MISS - No image on Wikipedia")

    # ========================================
    # Summary
    # ========================================
    print(f"\n{'=' * 60}")
    print(f"RETRY COMPLETE")
    print(f"{'=' * 60}")
    print(f"  Recovered: {len(success)}")
    print(f"  Still failed: {len(still_failed)}")

    if still_failed:
        print(f"\nStill failed (need AI-generated avatars):")
        for aid, aname, reason in still_failed:
            print(f"  [{aid}] {aname}: {reason}")

    # Count total successes (first run + retry)
    all_downloaded = [f for f in os.listdir(OUTPUT_DIR) if f.startswith("artist_") and f.endswith(".jpg")]
    print(f"\nTotal downloaded avatars: {len(all_downloaded)}")

    # Update SQL and upload scripts with ALL successfully downloaded files
    sql_path = os.path.join(OUTPUT_DIR, "update_photo_urls.sql")
    upload_path = os.path.join(OUTPUT_DIR, "upload_to_r2.ps1")

    all_ids = sorted([int(f.replace("artist_", "").replace(".jpg", "")) for f in all_downloaded])

    with open(sql_path, "w", encoding="utf-8") as f:
        for aid in all_ids:
            f.write(f"UPDATE artists SET photo_url = 'avatars/artists/artist_{aid}.jpg' WHERE id = {aid};\n")

    with open(upload_path, "w", encoding="utf-8") as f:
        f.write("# Upload all artist avatars to Cloudflare R2\n")
        f.write("# Run from: backend/cloudflare-worker/\n\n")
        for aid in all_ids:
            f.write(f'wrangler r2 object put moody-music-asset/avatars/artists/artist_{aid}.jpg --file="../tools/downloaded_avatars/artist_{aid}.jpg" --content-type="image/jpeg"\n')

    print(f"Updated SQL: {sql_path} ({len(all_ids)} statements)")
    print(f"Updated upload script: {upload_path}")

    # Save still-failed list
    if still_failed:
        sf_path = os.path.join(OUTPUT_DIR, "still_failed.json")
        with open(sf_path, "w", encoding="utf-8") as f:
            json.dump([{"id": aid, "name": aname, "reason": reason}
                       for aid, aname, reason in still_failed], f, ensure_ascii=False, indent=2)
        print(f"Still-failed JSON: {sf_path}")


if __name__ == "__main__":
    main()
