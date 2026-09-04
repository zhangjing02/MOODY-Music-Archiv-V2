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

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)
SKIPPED_LOG_MD = os.path.join(REPORTS_DIR, "skipped_albums_log.md")

# 陈奕迅全量待补充录音室专辑 + 经典 Live 现场大碟
EASON_PIPELINE = [
    # --- 1. 早期出道录音室正规大碟 (1997 - 2001) ---
    {
        "album": "醞釀", "year": "1997",
        "tracks": ["La'mour", "Taipei City", "愛的傀儡", "寵愛", "感動", "好聚好散", "換季", "攤開雙手", "預感", "預感 (Karaoke Version)", "醞釀", "我終於放開了他"]
    },
    {
        "album": "一滴眼淚", "year": "1997",
        "tracks": ["一滴眼淚", "拜訪", "愛到瘋狂", "情深意重", "地獄", "我終於放開了她", "感情約", "最好的禮物", "像一隻貓", "Style"]
    },
    {
        "album": "我的快樂時代", "year": "1998",
        "tracks": ["我的快樂时代", "我什麼都沒有", "黃金時代", "反高潮", "新曲+精選", "相信相依", "多一點", "兩名男子夜談", "天下無雙", "如果是還有你", "五年"]
    },
    {
        "album": "婚禮的祝福", "year": "1999",
        "tracks": ["1個2個3個4個", "Just Between The Two Of Us", "My Girl", "拔河", "存在", "婚禮的祝福", "傷心證明書", "掏空", "我的開始在這裏", "轉機"]
    },
    {
        "album": "打得火熱", "year": "2000",
        "tracks": ["K歌之王", "打得火熱", "新廣告歌", "低等動物", "綿綿", "美麗謊言", "吹微風", "溫室效應", "活躍症", "下週同樣時間(再見)"]
    },
    {
        "album": "The Easy Ride", "year": "2001",
        "tracks": ["打回原形", "阿士匹灵", "阳性反应", "冲口而出", "大开眼戒", "我不好爱", "热带雨林", "人工智能", "结束开始"]
    },
    {
        "album": "反正是我", "year": "2001",
        "tracks": ["Because You're Good To Me", "低等动物", "不如这样", "爱是怀疑", "我也不会那么做", "K歌之王", "没有你", "冤家", "全世界失眠", "Good Times"]
    },
    
    # --- 2. 中后期录音室正式大碟 / 核心 EP ---
    {
        "album": "怎么样", "year": "2005",
        "tracks": ["不能再等待", "对不起谢谢", "Hippie", "不然你要我怎么样", "不睡", "一夜销魂", "浮城", "早开的长途班", "听听", "人神斗"]
    },
    {
        "album": "Life Continues", "year": "2006",
        "tracks": ["低調", "人車誌", "最佳損友", "暴殄天物", "落花流水", "大得太快", "想聽"]
    },
    {
        "album": "Stranger Under My Skin", "year": "2011",
        "tracks": ["六月飞霜", "最后派对", "苦瓜", "因为爱情 (feat. 王菲)", "等你爱我", "乐园"]
    },
    {
        "album": "？", "year": "2011",
        "tracks": ["看穿", "哎呀噢唔", "孤独患者", "内疚", "吟游诗人", "张氏桂兰", "Baby Song", "听一千遍后"]
    },
    {
        "album": "C'mon in~", "year": "2017",
        "tracks": ["放", "收信快乐", "海胆", "谁来剪月光", "之外", "傅科摆", "右手边"]
    },
    {
        "album": "L.O.V.E.", "year": "2018",
        "tracks": ["破坏王", "海里睡人", "渐渐", "从此以后", "我们万岁", "与你常在", "可一可再"]
    },
    
    # --- 3. 殿堂级 Live 演唱会 ---
    {
        "album": "陳奕迅2010 Duo演唱會", "year": "2010",
        "tracks": [
            "今天等我來 (Live)", "好歌獻給你 (Live)", "落花流水 (Live)", "囍帖街 (Live)", "七百年後 (Live)", "約定 (Live)",
            "寂寞夜晚 (Live)", "浮誇 (Live)", "禁色 (Live)", "無人之境 (Live)", "破曉 (Live)", "夕陽無限好 (Live)",
            "人車誌 (Live)", "裙下之臣 (Live)", "陀飛輪 (Live)", "沙龍 (Live)", "葡萄成熟時 (Live)",
            "芳華絕代 (Live)", "不來也不去 (Live)", "富士山下 (Live)", "與我常在 (Live)", "我的快樂時代 (Live)",
            "歌.頌 (Live)", "反高潮 (Live)", "一絲不掛 (Live)", "等 (Live)", "Mr. Lonely (Live)", "我甚麼都沒有 (Live)",
            "抱擁這分鐘 (Live)", "The End of the World (Live)", "我的世界末日 (Live)", "每一個明天 (Live)"
        ]
    }
]

def process_single_album(album_info: dict, max_workers: int = 2):
    artist = "陈奕迅"
    album = album_info["album"]
    tracks = album_info["tracks"]
    
    print("\n" + "=" * 80)
    print(f"🎤 开始执行陈奕迅大碟: 《{album}》({album_info.get('year')}) | 共 {len(tracks)} 首")
    print("=" * 80)
    
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: 《{s}》- {artist}...")
            target_path, qa, lrc_info = dm.download_track(s, artist, album, dm.DEFAULT_DOWNLOAD_DIR)
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
                
    print(f"📊 《{album}》抓取完成: 成功 {success_cnt}/{len(tracks)}")

def run_eason_pipeline():
    print("=" * 80)
    print(f"🚀 陈奕迅全量补充流水线启动 | 共 {len(EASON_PIPELINE)} 张待抓大碟/Live")
    print("=" * 80)
    for idx, item in enumerate(EASON_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(EASON_PIPELINE)}]: 陈奕迅 《{item['album']}》 <<<<<")
        try:
            process_single_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 处理异常: {e}")
        time.sleep(2)
        
    print("\n🎉 陈奕迅全量大碟及演唱会抓轨流水线全部收官！")

if __name__ == "__main__":
    run_eason_pipeline()
