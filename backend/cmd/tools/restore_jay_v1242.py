import json
import re

SKELETON_PATH = r'E:\Html-work\storage\metadata\skeleton.json'

# 手动重建周杰伦条目 (基于 data.js 并校准物理封面路径)
JAY_ALBUMS = [
    {"title": "Jay", "year": "2000", "cover": "/storage/covers/jay_j1.jpg"},
    {"title": "范特西", "year": "2001", "cover": "/storage/covers/jay_j2_fantasy.jpg"},
    {"title": "八度空间", "year": "2002", "cover": "/storage/covers/jay_j3_octave.jpg"},
    {"title": "叶惠美", "year": "2003", "cover": "/storage/covers/jay_j4_yehuimei.jpg"},
    {"title": "七里香", "year": "2004", "cover": "/storage/covers/jay_j5_qilixiang.jpg"},
    {"title": "十一月的萧邦", "year": "2005", "cover": "/storage/covers/jay_j6_november.jpg"},
    {"title": "依然范特西", "year": "2006", "cover": "/storage/covers/jay_j7_still.jpg"},
    {"title": "我很忙", "year": "2007", "cover": "/storage/covers/jay_j8_busy.jpg"},
    {"title": "魔杰座", "year": "2008", "cover": "/storage/covers/jay_j9_capa.jpg"},
    {"title": "跨时代", "year": "2010", "cover": "/storage/covers/jay_j10_era.jpg"},
    {"title": "惊叹号", "year": "2011", "cover": "/storage/covers/jay_j11_exclamation.jpg"},
    {"title": "十二新作", "year": "2012", "cover": "/storage/covers/jay_j12_new.jpg"},
    {"title": "哎呦，不错哦", "year": "2014", "cover": "/storage/covers/jay_j13_aiyo.jpg"},
    {"title": "周杰伦的床边故事", "year": "2016", "cover": "/storage/covers/jay_j14_bedtime.jpg"}
]

JAY_CHOU_ENTRY = {
    "id": "j1",
    "name": "周杰伦",
    "group": "Z",
    "category": "Mandopop",
    "avatar": "/storage/covers/jay_j1.jpg",
    "albums": []
}

# 为每个专辑添加空歌曲列表 (稍后由 SyncMusic 自动补全)
for alb in JAY_ALBUMS:
    JAY_CHOU_ENTRY["albums"].append({
        "title": alb["title"],
        "year": alb["year"],
        "cover": alb["cover"],
        "songs": []
    })

def main():
    print("🚀 Restoring Jay Chou to skeleton.json...")
    with open(SKELETON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 检查是否已存在 (以防万一)
    exists = False
    for i, artist in enumerate(data['artists']):
        if artist['name'] in ['周杰伦', 'Jay Chou']:
            # 如果存在则直接替换
            data['artists'][i] = JAY_CHOU_ENTRY
            exists = True
            break
    
    if not exists:
        data['artists'].append(JAY_CHOU_ENTRY)
    
    # 按照 A-Z 重新排序艺术家 (可选，但为了整洁)
    # data['artists'].sort(key=lambda x: x.get('group', 'Z'))

    with open(SKELETON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("✨ Jay Chou restored and mapped to local /storage/covers/.")

if __name__ == "__main__":
    main()
