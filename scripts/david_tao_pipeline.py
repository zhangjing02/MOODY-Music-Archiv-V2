import os
import sys
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

if "GROQ_API_KEY" not in os.environ or not os.environ["GROQ_API_KEY"]:
    os.environ["GROQ_API_KEY"] = os.environ.get("GROQ_API_KEY", "")

sys.path.append(os.path.dirname(__file__))
import download_music as dm

DAVID_TAO_PIPELINE = [
    {
        "album": "陶喆同名專輯", "year": "1997",
        "tracks": ['Airport Take Off', '飛機場的10:30', 'Airport Arrival', '愛，很簡單', '沙灘', '十七歲', '望春風', '王八蛋', '是是非非', '流沙', 'Take 6 Minus 3', '心亂飛', '再見以前先說再見', '沙灘 (鋼琴版)', 'Answering Machine']
    },
    {
        "album": "I'm OK", "year": "1999",
        "tracks": ['Doxology', '找自己', '小鎮姑娘', '夜來香', '普通朋友', "I'm OK", '說走就走', '多謝你', '馬戲團', '天天', 'ANGELINE', 'amen']
    },
    {
        "album": "黑色柳丁", "year": "2002",
        "tracks": ['黑色柳丁', 'Dear God', 'Angel', '討厭紅樓夢', '蝴蝶', '宮保雞丁', 'Melody', '月亮代表我的心', '二十二', 'My Anata', '搖籃曲', 'Katrina']
    },
    {
        "album": "太平盛世", "year": "2005",
        "tracks": ['鬼(Overture)', '鬼', 'Catherine', '就是爱你', '孙子兵法', '爱我还是他', 'Susan说', '无缘', 'Sula与Lampa的寓言', '2Night藏爱', '她的歌', '爱是个什么东西', '祷告良辰歌']
    },
    {
        "album": "太美麗", "year": "2006",
        "tracks": ['太美丽广播电台', '忘不了', '太美丽', '追', '那一瞬间', 'Walk On', '自导自演的悲剧', '祝你幸福', '似曾相识', '今天你要嫁给我', '每一面都美', '不爱', 'Olia']
    },
    {
        "album": "69樂章", "year": "2009",
        "tracks": ['愿主怜悯', '乱七∞糟', '暗恋', 'Play', '火鸟功', '雪豹', '关于陶喆', '我太傻', '请继续，任性', '中国姑娘', '谁的奥斯卡', '应征爱', '你的歌', '桂冠英雄']
    },
    {
        "album": "再見你好嗎", "year": "2013",
        "tracks": ['Hello', '勿忘我', '一念之间', '逗阵兄弟', '真爱等一下', '好好说再见', '上爱唱的歌', '那个女孩', 'The Promise', '因为爱', '小小的你', 'All for Joy']
    },
    {
        "album": "Stupid Pop Songs", "year": "2025",
        "tracks": ['Stupid Pop Song', 'Moonchild', '星心', '一点点', '路上', '半晴天', '活该', 'In the Morning', '微尘', '千言万语', 'Lonely is the Night', '陪你', '让爱再继续', '全世界会唱的歌曲']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    print("\n" + "=" * 80)
    print(f"🎸 开始抓轨 陶喆 (David Tao) 经典大碟: 《{album}》({item['year']}) | 共 {len(tracks)} 首")
    print("=" * 80)
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: 陶喆 - 《{s}》...")
            target_path, qa, lrc_info = dm.download_track(s, "陶喆", album, dm.DEFAULT_DOWNLOAD_DIR)
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

def run_david_tao_pipeline():
    print("=" * 80)
    print(f"🚀 陶喆 (David Tao) 华语 R&B 教父大碟流水线启动 | 共 {len(DAVID_TAO_PIPELINE)} 张大碟")
    print("=" * 80)
    for idx, item in enumerate(DAVID_TAO_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(DAVID_TAO_PIPELINE)}]: 陶喆 《{item['album']}》 <<<<<")
        try:
            process_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 异常: {e}")
        time.sleep(2)
    print("\n🎉 陶喆 (David Tao) 全部大碟抓轨全量收官！")

if __name__ == "__main__":
    run_david_tao_pipeline()

