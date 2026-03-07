import json
import os

SKELETON_PATH = r'E:\Html-work\storage\metadata\skeleton.json'

# 高精确映射表 (根据 jay_final_check.txt 的物理存在)
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
    print("🚀 Precise Jay Chou mapping...")
    with open(SKELETON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    updated = 0
    for artist in data['artists']:
        if artist['name'] == '周杰伦' or artist['name'] == 'Jay Chou':
            for album in artist.get('albums', []):
                title = album.get('title')
                if title in JAY_MAP:
                    album['cover'] = f"/storage/covers/{JAY_MAP[title]}"
                    updated += 1
                else:
                    # 兜底：如果是其他专辑，尝试用常规命名
                    # album['cover'] = f"/storage/covers/周杰伦_{title}.jpg"
                    pass

    with open(SKELETON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"✨ Updated {updated} Jay Chou albums.")

if __name__ == "__main__":
    main()
