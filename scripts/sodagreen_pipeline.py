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

SODAGREEN_PIPELINE = [
    {
        "album": "小宇宙", "year": "2006",
        "tracks": ['You Are, You Will', '小宇宙', '小情歌', '符號', '暫時失控', '被雨困住的城市', '已經', '吵', '背著你', '墜落', '無言歌']
    },
    {
        "album": "你在煩惱什麼", "year": "2011",
        "tracks": ['片刻永恆 - Intro', '幸褔額度', '你被寫在我的歌裡 (feat. 陳嘉樺)', '如果凝結就是愛', '喜歡寂寞', '燕窩', '繭', '當我們一起走過', '浪漫派', '控制狂', '你在煩惱什麼']
    },
    {
        "album": "秋:故事", "year": "2013",
        "tracks": ['故事', '從一片落葉開始', '獨處的時候', '我好想你', '偷閒的翅膀', '天天晴朗', '說了再見以後', '我們走了一光年', '再遇見', '拾穗', '你心裡最後一個', '小星星']
    },
    {
        "album": "冬 未了", "year": "2015",
        "tracks": ['痛快的哀艷', '對殺人狂指控', '地平線', '我們不懂', '博物館', '回車諾比的夢', '下雨的夜晚', '他舉起右手點名', 'Everyone', '牆外的風景', '未了', 'Must Keep Singing']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    year = item.get('year', '')
    
    print("\n" + "=" * 80)
    print(f"🍀 开始抓轨 苏打绿 (Sodagreen) 诗性流行大碟: 《{album}》({year}) | 共 {len(tracks)} 首")
    print("=" * 80)
    
    success_count = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for song in tracks:
            f = executor.submit(dm.download_track, "苏打绿", album, song)
            futures[f] = song
            
        for future in as_completed(futures):
            song_name = futures[future]
            try:
                res = future.result()
                if res and res.get("status") in ("success", "exists"):
                    success_count += 1
            except Exception as e:
                print(f"❌ 《{song_name}》处理异常: {e}")
                
    print(f"📊 《{album}》完成: {success_count}/{len(tracks)}")
    return success_count

def main():
    print("=" * 80)
    print("🚀 苏打绿 (Sodagreen) 经典大碟抓轨流水线启动")
    print("=" * 80)
    
    total_success = 0
    total_tracks = sum(len(a['tracks']) for a in SODAGREEN_PIPELINE)
    
    for idx, album_info in enumerate(SODAGREEN_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(SODAGREEN_PIPELINE)}]: 苏打绿 《{album_info['album']}》 <<<<<")
        sc = process_album(album_info, max_workers=2)
        total_success += sc
        time.sleep(2)
        
    print("\n" + "=" * 80)
    print(f"🎉 苏打绿 全部大碟抓轨全量收官！成功下载并校验: {total_success}/{total_tracks}")
    print("=" * 80)

if __name__ == "__main__":
    main()
