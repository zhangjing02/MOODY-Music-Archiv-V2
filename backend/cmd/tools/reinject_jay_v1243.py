import json
import os

SKELETON_PATH = r'E:\Html-work\storage\metadata\skeleton.json'

# 定义周杰伦 14 张专辑的物理封面文件名 (与磁盘 jay_j*.jpg 保持一致)
JAY_ALBUMS_CONFIG = [
    {"title": "Jay", "cover": "jay_j1.jpg", "year": "2000"},
    {"title": "范特西", "cover": "jay_j2_fantasy.jpg", "year": "2001"},
    {"title": "八度空间", "cover": "jay_j3_octave.jpg", "year": "2002"},
    {"title": "叶惠美", "cover": "jay_j4_yehuimei.jpg", "year": "2003"},
    {"title": "七里香", "cover": "jay_j5_qilixiang.jpg", "year": "2004"},
    {"title": "十一月的萧邦", "cover": "jay_j6_november.jpg", "year": "2005"},
    {"title": "依然范特西", "cover": "jay_j7_still.jpg", "year": "2006"},
    {"title": "我很忙", "cover": "jay_j8_busy.jpg", "year": "2007"},
    {"title": "魔杰座", "cover": "jay_j9_capa.jpg", "year": "2008"},
    {"title": "跨时代", "cover": "jay_j10_era.jpg", "year": "2010"},
    {"title": "惊叹号", "cover": "jay_j11_exclamation.jpg", "year": "2011"},
    {"title": "十二新作", "cover": "jay_j12_new.jpg", "year": "2012"},
    {"title": "哎呦，不错哦", "cover": "jay_j13_aiyo.jpg", "year": "2014"},
    {"title": "周杰伦的床边故事", "cover": "jay_j14_bedtime.jpg", "year": "2016"}
]

def fix_skeleton():
    print("🚀 Re-injecting Jay Chou data into skeleton.json...")
    try:
        with open(SKELETON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Read failed: {e}")
        return

    # 1. 寻找或重建周杰伦条目
    jay_entry = None
    for artist in data['artists']:
        if artist['name'] in ['周杰伦', 'Jay Chou', 'Jay']:
            jay_entry = artist
            break
    
    if not jay_entry:
        print("➕ Creating Jay Chou entry from scratch...")
        jay_entry = {
            "id": "j1",
            "name": "周杰伦",
            "group": "Z",
            "category": "华语",
            "avatar": "/storage/covers/jay_j1.jpg",
            "albums": []
        }
        data['artists'].append(jay_entry)

    # 2. 强制对齐专辑路径
    jay_entry['albums'] = []
    for conf in JAY_ALBUMS_CONFIG:
        jay_entry['albums'].append({
            "title": conf['title'],
            "year": conf['year'],
            "cover": f"/storage/covers/{conf['cover']}",
            "songs": []
        })

    # 3. 写入文件 (确保 UTF-8)
    with open(SKELETON_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print("✅ Jay Chou data re-aligned successfully.")

if __name__ == "__main__":
    fix_skeleton()
