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

MAYDAY_PIPELINE = [
    {
        "album": "五月天第一張創作專輯", "year": "1999",
        "tracks": ['瘋狂世界', '擁抱', '透露', '生活', '愛情的模樣', '嘿我要走了', '軋車', '志明與春嬌', 'Hosee', '黑白講', 'I Love You 無望', '風若吹']
    },
    {
        "album": "愛情萬歲", "year": "2000",
        "tracks": ['為什麼', '終結孤單', '明白', '心中無別人', '有你的將來', '憨人', '叫我第一名', '雨眠', '羅密歐與茱麗葉', '溫柔', '愛情萬歲', '反而']
    },
    {
        "album": "人生海海", "year": "2001",
        "tracks": ['一顆蘋果', '能不能不要說', '好不好', '相信', 'OK啦', '借問眾神明', '永遠的永遠', '彩虹', '啾啾啾', '純真', '候鳥', '人生海海']
    },
    {
        "album": "時光機", "year": "2003",
        "tracks": ['輕功', '恒星的恒心', '雌雄同體', '阿姆斯壯', '而我知道', '賭神', '別惹我', '九號球', '武裝', '時光機', '我們', '在這一秒', '生命有一種絕對', '王子面', '小時候']
    },
    {
        "album": "神的孩子都在跳舞", "year": "2004",
        "tracks": ['孫悟空', '倔強', '亂世浮生', '小護士', '讓我照顧你', '約翰藍儂', '回來吧', '錯錯錯', '晚安 地球人', '超人', '神的孩子都在跳舞']
    },
    {
        "album": "知足 just my pride 最真傑作選", "year": "2005",
        "tracks": ['知足', '牙關', '戀愛ing', '聽不到', '金多蝦', '麥來亂', '鹹魚']
    },
    {
        "album": "為愛而生", "year": "2006",
        "tracks": ['前傳', '為愛而生', '天使', '我又初戀了', '香水', '摩托車日記', '最重要的小事', '快樂很偉大', '忘詞', '寵上天', '米老鼠', '一千個世紀']
    },
    {
        "album": "後青春期的詩", "year": "2008",
        "tracks": ['突然好想你', '生存以上 生活以下', '你不是真正的快樂', '爆肝', '噢買尬', '出頭天', '我心中尚未崩壞的地方', '春天的吶喊', '笑忘歌', '如煙', '后青春期的诗']
    },
    {
        "album": "第二人生", "year": "2011",
        "tracks": ['有些事現在不做 一輩子都不會做了', '我不願讓你一個人', '星空', '洗衣機', '三個傻瓜', '歪腰', '乾杯', '倉頡', '2012', '第二人生', '諾亞方舟', '明日', 'OAOA', 'T1213121']
    },
    {
        "album": "自傳", "year": "2016",
        "tracks": ['如果我們不曾相遇', '成名在望', '好好', '兄弟', '人生有限公司', '後來的我們', '頑固', '派對動物', '最好的一天', '少年他的奇幻漂流', '終於結束的起點', '任意門', '轉眼']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    print("\n" + "=" * 80)
    print(f"🎸 开始抓轨 五月天 (Mayday) 华语摇滚天团大碟: 《{album}》({item['year']}) | 共 {len(tracks)} 首")
    print("=" * 80)
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: 五月天 - 《{s}》...")
            target_path, qa, lrc_info = dm.download_track(s, "五月天", album, dm.DEFAULT_DOWNLOAD_DIR)
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

def run_mayday_pipeline():
    print("=" * 80)
    print(f"🚀 五月天 (Mayday) 摇滚青春全量大碟流水线启动 | 共 {len(MAYDAY_PIPELINE)} 张大碟")
    print("=" * 80)
    for idx, item in enumerate(MAYDAY_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(MAYDAY_PIPELINE)}]: 五月天 《{item['album']}》 <<<<<")
        try:
            process_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 异常: {e}")
        time.sleep(2)
    print("\n🎉 五月天 (Mayday) 全部大碟抓轨全量收官！")

if __name__ == "__main__":
    run_mayday_pipeline()

