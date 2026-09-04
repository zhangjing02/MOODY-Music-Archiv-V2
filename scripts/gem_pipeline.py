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

GEM_PIPELINE = [
    {
        "album": "G.E.M.", "year": "2008",
        "tracks": ['睡公主', 'Where Did You Go', '回忆的沙漏', '爱现在的我', '塞纳河']
    },
    {
        "album": "18...", "year": "2009",
        "tracks": ['All About U', 'Game Over', '想讲你知', 'A.I.N.Y.', 'Mascara', '我不懂爱', '塞纳河', '意式恋爱', 'Get Everybody Moving', '18', 'Where Did You Go 2.0', '写不完的温柔']
    },
    {
        "album": "MySecret", "year": "2010",
        "tracks": ['One Button', 'Good to be Bad', 'Get Over You', '美好的旧时光', '寂寞星球的玫瑰', 'The Voice Within', '我的秘密', '末日', 'Twinkle II', 'Say It Loud']
    },
    {
        "album": "Xposed", "year": "2012",
        "tracks": ['What Have U Done', '下一秒', 'Someday I', '泡沫', '潜意识的残酷', 'OH BOY', 'After Tonight', '失真', '奇迹', '不存在的存在']
    },
    {
        "album": "新的心跳", "year": "2015",
        "tracks": ['多远都要在一起', '再见', '新的心跳', '来自天堂的魔鬼', '盲点', '单行的轨道', '一路逆风', '于是', '瞬间', '查克靠近']
    },
    {
        "album": "摩天动物园", "year": "2019",
        "tracks": ['摩天动物园', 'Fly Away', '透明', '很久以后', 'WALK ON WATER', '萤火', '灰狼', '差不多姑娘', '好想好想你', '别勉强', '多美丽', '句号', '依然睡公主']
    },
    {
        "album": "启示录", "year": "2022",
        "tracks": ['少年与海', 'HELL', '只有我和你的地方', '你不是第一个离开的人', '不想回家', '冰河时代', '受难曲', 'GLORIA', '老人与海', 'FIND YOU', '离心力', '让世界暂停一分钟', '夜的尽头', '天空没有极限']
    },
    {
        "album": "I AM GLORIA", "year": "2025",
        "tracks": ['光年之外', '画', '红蔷薇白玫瑰', '喜欢你', '后会无期', '倒数', '平凡天使', '句号', '再见', '来自天堂的魔鬼']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    print("\n" + "=" * 80)
    print(f"💎 开始抓轨 邓紫棋 (G.E.M.) 经典大碟: 《{album}》({item['year']}) | 共 {len(tracks)} 首")
    print("=" * 80)
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: 邓紫棋 - 《{s}》...")
            target_path, qa, lrc_info = dm.download_track(s, "邓紫棋", album, dm.DEFAULT_DOWNLOAD_DIR)
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

def run_gem_pipeline():
    print("=" * 80)
    print(f"🚀 邓紫棋 (G.E.M.) 巨肺天后大碟流水线启动 | 共 {len(GEM_PIPELINE)} 张大碟")
    print("=" * 80)
    for idx, item in enumerate(GEM_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(GEM_PIPELINE)}]: 邓紫棋 《{item['album']}》 <<<<<")
        try:
            process_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 异常: {e}")
        time.sleep(2)
    print("\n🎉 邓紫棋 (G.E.M.) 全部大碟抓轨全量收官！")

if __name__ == "__main__":
    run_gem_pipeline()

