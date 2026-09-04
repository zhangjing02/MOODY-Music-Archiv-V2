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

BEYOND_PIPELINE = [
    {
        "album": "樂與怒", "year": "1993",
        "tracks": ['海闊天空', '情人', '我是憤怒', '命運是你家', '爸爸媽媽', '和平與愛', '全是愛', '狂人山莊', '妄想', '完全地愛吧', '走不開的快樂', '無無謂']
    },
    {
        "album": "命運派對", "year": "1990",
        "tracks": ['光輝歲月', '俾面派對', '無淚的遺憾', '兩顆心', '懷念你', '可知道', '相依的心', '撒旦的咀咒', '送給不知怎去保護環境的人(包括我)', '戰勝心魔']
    },
    {
        "album": "繼續革命", "year": "1992",
        "tracks": ['長城', '農民', '遙望', '早班火車', '不可一世', 'Bye-Bye', '溫暖的家鄉', '可否衝破', '快樂王國', '繼續沉醉', '厭倦寂寞', '無語問蒼天']
    },
    {
        "album": "真的見証", "year": "1989",
        "tracks": ['歲月無聲', '無悔這一生', '午夜怨曲', '明日世界', '交織千個心', '誰是勇敢', '勇闖新世界', '又是黃昏', '千金一刻', '無名的歌']
    },
    {
        "album": "正東10X10我至愛唱片:- Beyond『秘密警察』", "year": "1988",
        "tracks": ['大地', '喜歡妳', '秘密警察', '衝開一切', '再見理想', '昨日的牽絆', '未知母親的淚水', '每段路', '心內心外', '灰色的心']
    },
    {
        "album": "復黑: 亞拉伯跳舞女郎", "year": "1987",
        "tracks": ['東方寶藏', '亞拉伯跳舞女郎', '沙丘魔女', '無聲的告別', '追憶', '隨意飄蕩', '過去與今天', '孤單一吻', '玻璃箱', '水晶球']
    },
    {
        "album": "Paradise", "year": "1994",
        "tracks": ['Paradise', '一輩子陪我走', '無名英雄', '情深依舊', '溫柔殺手', '和平世界', '因為有你有我', '對嗎', 'Dancing In The Rain', '祝您愉快']
    },
    {
        "album": "Sound", "year": "1995",
        "tracks": ['缺口', '聲音', '困獸鬥', '逼不得已', '門外看', '嘆息', '幻覺', '教壞細路', '阿博', 'Cryin']
    },
    {
        "album": "這裡那裡", "year": "1998",
        "tracks": ['忘記你', '想你', '緩慢', '管我', '候診室', '我的知己在街頭', '情人', '熱情過後', '十字路口', 'Amani', '命運是我家']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    print("\n" + "=" * 80)
    print(f"🎸 开始抓轨 Beyond 殿堂摇滚神专: 《{album}》({item['year']}) | 共 {len(tracks)} 首")
    print("=" * 80)
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: Beyond - 《{s}》...")
            target_path, qa, lrc_info = dm.download_track(s, "Beyond", album, dm.DEFAULT_DOWNLOAD_DIR)
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

def run_beyond_pipeline():
    print("=" * 80)
    print(f"🚀 Beyond 殿堂全碟流水线启动 | 共 {len(BEYOND_PIPELINE)} 张大碟")
    print("=" * 80)
    for idx, item in enumerate(BEYOND_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(BEYOND_PIPELINE)}]: Beyond 《{item['album']}》 <<<<<")
        try:
            process_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 异常: {e}")
        time.sleep(2)
    print("\n🎉 Beyond 核心录音室大碟抓轨全量收官！")

if __name__ == "__main__":
    run_beyond_pipeline()
