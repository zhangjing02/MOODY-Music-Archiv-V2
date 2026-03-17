
import requests
import json

API_BASE = "https://moody-worker.changgepd.workers.dev"

def batch_update_songs(updates):
    url = f"{API_BASE}/api/admin/songs/batch-update"
    headers = {"Content-Type": "application/json"}
    payload = {"updates": updates}
    
    # 使用 json.dumps 确保 UTF-8 序列化，且不带 ASCII 转义
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    
    print(f"Sending batch update for {len(updates)} songs...")
    response = requests.post(url, data=data, headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")

# 1. 修复 735 (不捨) - 恢复中文标题
updates_735 = [
    {"id": 10025, "title": "我是真的爱你"},
    {"id": 10026, "title": "不舍的牵绊"},
    {"id": 10027, "title": "因为寂寞"},
    {"id": 10028, "title": "生命中的精灵"},
    {"id": 10029, "title": "如果你要离去"},
    {"id": 10030, "title": "爱的代价"},
    {"id": 10031, "title": "这样爱你对不对"},
    {"id": 10032, "title": "你像个孩子"},
    {"id": 10033, "title": "听看见有人叫你宝贝"},
    {"id": 10034, "title": "由衷的感谢"},
    {"id": 10035, "title": "飞"}
]

# 2. 修复 738 (我(们)就是这样)
# 策略：修正 10036-10045 的标题，这批是带有正确 track_index 的占位符
updates_738 = [
    {"id": 10036, "title": "往事"},
    {"id": 10037, "title": "希望"},
    {"id": 10038, "title": "山丘"},
    {"id": 10039, "title": "你是我生命中的所有"},
    {"id": 10040, "title": "鬼迷心窍"},
    {"id": 10041, "title": "我对自己无话可说"},
    {"id": 10042, "title": "凡人歌"},
    {"id": 10043, "title": "生命中的精灵"},
    {"id": 10044, "title": "寂寞难耐"},
    {"id": 10045, "title": "远行"}
]

if __name__ == "__main__":
    batch_update_songs(updates_735)
    batch_update_songs(updates_738)
