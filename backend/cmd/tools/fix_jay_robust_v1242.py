import json
import os

SKELETON_PATH = r'E:\Html-work\storage\metadata\skeleton.json'

JAY_MAP = {
    "Jay": "jay_j1.jpg",
    "范特西": "jay_j2_fantasy.jpg",
    "八度空间": "jay_j3_octave.jpg",
    "叶惠美": "jay_j4_yehuimei.jpg",
    "七里香": "jay_j5_qilixiang.jpg",
    "十一月的萧邦": "jay_j6_november.jpg",
    "依然范特西": "jay_j7_still.jpg",
    "我很忙": "jay_j8_busy.jpg",
    "魔杰座": "jay_j9_capa.jpg",
    "跨时代": "jay_j10_era.jpg",
    "惊叹号": "jay_j11_exclamation.jpg",
    "十二新作": "jay_j12_new.jpg",
    "哎呦，不错哦": "jay_j13_aiyo.jpg",
    "周杰伦的床边故事": "jay_j14_bedtime.jpg"
}

def main():
    print("🚀 Precise Jay Chou mapping (Robust Version)...")
    with open(SKELETON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    updated = 0
    # 模糊匹配：只要名字里有“周杰伦”或者“Jay”
    for artist in data.get('artists', []):
        name = artist.get('name', '')
        if '周杰伦' in name or 'Jay' in name or 'Jay Chou' in name:
            print(f"Found artist: {name}")
            for album in artist.get('albums', []):
                title = album.get('title', '')
                matched = False
                for k, v in JAY_MAP.items():
                    if k in title:
                        album['cover'] = f"/storage/covers/{v}"
                        updated += 1
                        matched = True
                        break
                if not matched:
                    # 保底尝试
                    album['cover'] = f"/storage/covers/周杰伦_{title}.jpg"
                    updated += 1

    with open(SKELETON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✨ Total items processed/updated: {updated}")

if __name__ == "__main__":
    main()
