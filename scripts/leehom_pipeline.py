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

LEEHOM_PIPELINE = [
    {
        "album": "公轉.自轉", "year": "1998",
        "tracks": ['公轉自轉', '夢想被冷凍', '愛你等於愛自己', 'One of These Days', '我的情歌', '信任', '不管怎樣', '2000年', '你以為我是誰']
    },
    {
        "album": "不可能錯過你", "year": "1999",
        "tracks": ['釣靈感', '不可能錯過你', '流淚手心', 'Julia', '感情副作用', '打開愛', '不降落的滑翔翼', '失去了你', '你愛過沒有', 'Mary Says']
    },
    {
        "album": "永遠的第一天", "year": "2000",
        "tracks": ['永遠的第一天', '龍的傳人', '不要害怕', '狂想世界', '感情是舞台', '傷口是愛的筆記', '歡喜城', '忘了時間忘了我', '這就是愛']
    },
    {
        "album": "唯一", "year": "2001",
        "tracks": ['唯一', '愛的就是你', '謝絕推銷你的愛', '安全感', '戒不了你', '不必問別人', '白狐狸', '變壞', '我要']
    },
    {
        "album": "不可思議", "year": "2003",
        "tracks": ['Ya Birthday', '此刻，你心裡想起誰', '你不在', 'Love Love Love', '女朋友', '不著地', 'Can You Feel My World', '愛無所不在']
    },
    {
        "album": "心中的日月", "year": "2004",
        "tracks": ['心中的日月', '竹林深處', 'Forever Love', '在那遙遠的地方', '一首簡單的歌', '星座', '過來', '愛錯', 'Follow Me', '放開你的心']
    },
    {
        "album": "蓋世英雄", "year": "2005",
        "tracks": ['蓋世英雄', '在梅邊', '花田錯', 'Kiss Goodbye', '完美的互動', '大城小愛', '第一個清晨', '哥兒們', '讓開']
    },
    {
        "album": "改變自己", "year": "2007",
        "tracks": ['改變自己', '落葉歸根', '我們的歌', '你是我心內的一首歌', '愛在哪裡', '不完整的旋律', '愛的鼓勵', '華人萬歲', '星期六的深夜']
    },
    {
        "album": "心跳", "year": "2008",
        "tracks": ['愛得得體', '心跳', '春雨裡洗過的太陽', 'Everything', '我完全沒有任何理由理你', '另一個天堂', '玩偶', '腳本', '競爭對手', '搖滾怎麼了']
    },
    {
        "album": "十八般武藝", "year": "2010",
        "tracks": ['龍騰虎躍', '你不知道的事', '伯牙絕弦', '柴米油鹽醬醋茶', '美', '需要人陪', '十八般武藝', '自己人']
    },
    {
        "album": "你的愛。", "year": "2015",
        "tracks": ['天翻地覆', '裂心', '忘我', '你的愛', '就是現在', '七十億分之一', 'In Your Eyes', '保護', '夢境', '微博控', '愛一點']
    },
    {
        "album": "A.I. 愛", "year": "2017",
        "tracks": ['沒有眼淚的世界', 'A.I. 愛', '千秋萬代', '無聲感情', 'Tonight Forever', '親愛的', '奇蹟', '為什麼', '聽愛', '緣分一道橋']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    print("\n" + "=" * 80)
    print(f"🎻 开始抓轨 王力宏 (Leehom Wang) 音乐才子大碟: 《{album}》({item['year']}) | 共 {len(tracks)} 首")
    print("=" * 80)
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: 王力宏 - 《{s}》...")
            target_path, qa, lrc_info = dm.download_track(s, "王力宏", album, dm.DEFAULT_DOWNLOAD_DIR)
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

def run_leehom_pipeline():
    print("=" * 80)
    print(f"🚀 王力宏 (Leehom Wang) 全量创作大碟流水线启动 | 共 {len(LEEHOM_PIPELINE)} 张大碟")
    print("=" * 80)
    for idx, item in enumerate(LEEHOM_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(LEEHOM_PIPELINE)}]: 王力宏 《{item['album']}》 <<<<<")
        try:
            process_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 异常: {e}")
        time.sleep(2)
    print("\n🎉 王力宏 全部大碟抓轨全量收官！")

if __name__ == "__main__":
    run_leehom_pipeline()

