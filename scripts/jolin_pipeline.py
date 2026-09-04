import os
import sys
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.append(os.path.dirname(__file__))
import download_music as dm

JOLIN_PIPELINE = [
    {
        "album": "看我72變", "year": "2003",
        "tracks": ['看我72變', '說愛你', '布拉格廣場', '騎士精神', '假面的告白', '奴隸船', '做一天的你', 'Prove it', '爆米花的氣味', '好東西', '捕手']
    },
    {
        "album": "城堡", "year": "2004",
        "tracks": ['愛情36計', '就是愛', '檸檬草的味道', '海盜', '始作俑者', 'Love Love Love', '消失的城堡', '乖貓', '第一優先', '倒帶']
    },
    {
        "album": "野蠻遊戲", "year": "2005",
        "tracks": ['野蠻遊戲', '天空', '許願池的希臘少女', '睜一隻眼閉一隻眼', '反覆記號', '酸甜', 'OH OH', '獨佔神話', '追殺丘比特', '好想你', '單身公害']
    },
    {
        "album": "舞孃", "year": "2006",
        "tracks": ['舞孃', '假裝', '唯舞獨尊', '馬德里不思議', '玩美', '心型圈', '乖乖牌', '開場白', '離人節', '唇唇欲動', '最終話']
    },
    {
        "album": "特務J", "year": "2007",
        "tracks": ['特務J', '日不落', '愛無赦', '冷·暴力', '非賣品', '桃花源', '節拍器', '金三角', '怕什麼', '桃花源', 'Let''s move it', '如果那天你說愛我']
    },
    {
        "album": "花蝴蝶", "year": "2009",
        "tracks": ['花蝴蝶', '妥協', '大丈夫', '降落傘', '愈慢愈美麗', '我的依賴', '愛引力', '影舞者', '熱冬', '你快樂我內傷']
    },
    {
        "album": "呸", "year": "2014",
        "tracks": ['Play我呸', '第三人稱', '美杜莎', '唇語', 'I''m Not Yours', '自愛自受', 'Miss Trouble', '電話皇后', '不一樣又怎樣', '第二性']
    },
    {
        "album": "Ugly Beauty", "year": "2018",
        "tracks": ['怪美的', '玫瑰少年', '紅衣女孩', '甜秘密', '惡之必要', '你也有今天', '腦公', '消極掰', '如果我沒有傷口', '愛的怪獸', 'Necessary Evil']
    },
    {
        "album": "1019", "year": "1999",
        "tracks": ['我知道你很難過', 'Because of You', '猜想', '怪我太年輕', '你為何', '快有愛', 'You Gotta Know', '空白', '和世界做鄰居', 'The Rose']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    print("\n" + "=" * 80)
    print(f"💃 开始抓轨 JOLIN 蔡依林流行神专: 《{album}》({item['year']}) | 共 {len(tracks)} 首")
    print("=" * 80)
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: 蔡依林 - 《{s}》...")
            target_path, qa, lrc_info = dm.download_track(s, "蔡依林", album, dm.DEFAULT_DOWNLOAD_DIR)
            if qa and target_path:
                return s, qa, True, None
            return s, None, False, "未找到可用音源"
        except Exception as e:
            return s, None, False, str(e)
            
    success_cnt = 0
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(worker, t): t for t in tracks}
        for fut in as_completed(futures):
            s, qa, ok, err = fut.result()
            if ok:
                success_cnt += 1
            else:
                print(f"⚠️ [跳过曲目] 《{s}》: {err}")
    print(f"📊 《{album}》完成: {success_cnt}/{len(tracks)}")

def run_jolin_pipeline():
    print("=" * 80)
    print(f"🚀 JOLIN 蔡依林流行巅峰大碟流水线启动 | 共 {len(JOLIN_PIPELINE)} 张大碟")
    print("=" * 80)
    for idx, item in enumerate(JOLIN_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(JOLIN_PIPELINE)}]: 蔡依林 《{item['album']}》 <<<<<")
        try:
            process_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 异常: {e}")
        time.sleep(2)
    print("\n🎉 JOLIN 蔡依林核心大碟抓轨全量收官！")

if __name__ == "__main__":
    run_jolin_pipeline()
