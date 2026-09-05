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

FAYE_PIPELINE = [
    {
        "album": "天空", "year": "1994",
        "tracks": ['天空', '棋子', '天使', '影子', '天空 (Unplugged)', '眷戀', '不變', '矜持', '掙脫', '誓言']
    },
    {
        "album": "唱遊", "year": "1998",
        "tracks": ['感情生活', '臉', '色誡', '半途而廢', '飛', '祢', '小聰明', '醒不來', '紅豆', '童', '原諒自己', '償還', '情誡']
    },
    {
        "album": "只愛陌生人", "year": "1999",
        "tracks": ['開到荼蘼', '當時的月亮', '催眠', '只愛陌生人', '百年孤寂', '蝴蝶', '過眼雲煙', '嗶一聲之後', '推翻', '精彩', '守望麥田', '郵差']
    },
    {
        "album": "王菲97", "year": "1997",
        "tracks": ['麻醉', '你快樂 (所以我快樂)', '悶', '娛樂場', '人間', '我也不想這樣', '小題大做', '懷念', '撲火', '雲端']
    },
    {
        "album": "將愛", "year": "2003",
        "tracks": ['將愛', '空城', '不留', '美錯', '乘客', '陽寶', '旋木', '四月雪', '夜妝', '煙', '假愛之名', '花事了']
    },
    {
        "album": "菲靡靡之音", "year": "1995",
        "tracks": ['雪中蓮', '你在我心中', '但願人長久', '君心我心', '初戀的地方', '南海姑娘', '假如我是真的', '翠湖寒', '黃昏裡', '奈何', '一個小心願', '又見炊煙', '原鄉情濃']
    },
    {
        "album": "浮躁", "year": "1996",
        "tracks": ['無常', '浮躁', '想像', '分裂', '不安', '哪兒', '墮落', '掃興', '末日', '野三坡']
    },
    {
        "album": "Di-Dar", "year": "1995",
        "tracks": ['Di-Dar', '假期', '迷路', '曖昧', '或者', '我想', '享受', '一半', '流星']
    },
    {
        "album": "Coming Home", "year": "1992",
        "tracks": ['浪漫風暴', 'Miss You Night & Day', '容易受傷的女人', '不相識的約會', '把鎖匙投進信箱', '這些那些', '開心眼淚', '重燃', '兜兜轉', 'Kisses in the Wind']
    },
    {
        "album": "十萬個為什麼？", "year": "1993",
        "tracks": ['流非飛', '隔夜茶', '冷戰', '立體派', '若你真愛我', '動心', '雨天沒有你', '誘惑我', 'Do Do Da Da', 'Do We Really Care?']
    },
    {
        "album": "討好自己", "year": "1994",
        "tracks": ['討好自己', '蜜月期', '為非作歹', '我怕', '出路', '平凡最浪漫', '飄', '愛與痛的邊緣', '背影', '天不變地變']
    },
    {
        "album": "胡思亂想", "year": "1994",
        "tracks": ['胡思亂想', '誓言', '天與地', '夢中人', '知己知彼', '純情', '遊戲的終點', '夢遊', '藍色時份', '回憶是紅色天空']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    year = item.get('year', '')
    
    print("\n" + "=" * 80)
    print(f"👑 开始抓轨 王菲 (Faye Wong) 华语天后传世大碟: 《{album}》({year}) | 共 {len(tracks)} 首")
    print("=" * 80)
    
    success_count = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for song in tracks:
            f = executor.submit(dm.download_track, "王菲", album, song)
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
    print("🚀 王菲 (Faye Wong) 12 张传奇经典录音室大碟抓轨流水线启动")
    print("=" * 80)
    
    total_success = 0
    total_tracks = sum(len(a['tracks']) for a in FAYE_PIPELINE)
    
    for idx, album_info in enumerate(FAYE_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(FAYE_PIPELINE)}]: 王菲 《{album_info['album']}》 <<<<<")
        sc = process_album(album_info, max_workers=2)
        total_success += sc
        time.sleep(2)
        
    print("\n" + "=" * 80)
    print(f"🎉 王菲 全部大碟抓轨全量收官！成功下载并校验: {total_success}/{total_tracks}")
    print("=" * 80)

if __name__ == "__main__":
    main()
