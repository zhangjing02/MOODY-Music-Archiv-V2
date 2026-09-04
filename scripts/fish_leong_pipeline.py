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

FISH_LEONG_PIPELINE = [
    {
        "album": "一夜长大", "year": "1999",
        "tracks": ['对不起我爱你', '一夜长大', '彩虹', '迷路', '快乐一整天', '只能抱着你', '转圈圈', '纯情艳阳天', '橡皮筋', '纸条']
    },
    {
        "album": "勇气", "year": "2000",
        "tracks": ['勇气', '如果有一天', '半个月亮', '没有水的游泳池', '最烂的理由', '爱你不是两三天', '爱计较', '昨天', '多数是晴天', '最后']
    },
    {
        "album": "闪亮的星", "year": "2001",
        "tracks": ['无条件为你', '闪亮的星', '最想环游的世界', '明天的微笑', '在晴朗的一天出发', '看海计划', '我是爱你的', '这一天', '我不快乐', '这是你吗', '为你而:P']
    },
    {
        "album": "Sunrise 我喜欢", "year": "2002",
        "tracks": ['Sunrise', '分手快乐', '我喜欢', '有你在', '我和自己的约会', '幸福的预感', '喜悦', '怎么说', '小小的爱情', '无解']
    },
    {
        "album": "美丽人生", "year": "2003",
        "tracks": ['Beautiful', '为我好', '第三者', '美丽人生', '我不害怕', '你还在不在', '恶性循环', '最快乐那一年', '向左转向右转', '眼泪的地图', '旅程']
    },
    {
        "album": "燕尾蝶", "year": "2004",
        "tracks": ['宁夏', '给从前的爱', '燕尾蝶', '接受', '我都知道', '我是幸福的', '别人的天长地久', '茉莉花', '中间', '纯真']
    },
    {
        "album": "丝路", "year": "2005",
        "tracks": ['丝路', '我还记得', '瘦瘦的', '路', '一对一', '可惜不是你', '下一秒钟', '很久以后', '因为还是会', '好夜晚']
    },
    {
        "album": "亲亲", "year": "2006",
        "tracks": ['四季', '暖暖', '可乐戒指', '失忆', '亲亲', '幸福洋菓子店', '小手拉大手', '飞鱼', '不是我不明白', '小心眼', '憨过头']
    },
    {
        "album": "崇拜", "year": "2007",
        "tracks": ['崇拜', '每天第一件事', '会呼吸的痛', '101', '一秒的天堂', '给未来的自己', '知多少', '生命中不可承受之轻', '三吋日光', '原来你也唱过我的歌']
    },
    {
        "album": "今天情人节", "year": "2008",
        "tracks": ['今天情人节', '如果能在一起', '我们就到这', '我决定', '昨日情书', '满满的都是爱']
    },
    {
        "album": "别再为他流泪", "year": "2009",
        "tracks": ['别再为他流泪', '没有如果', '用力抱着', 'PK', '情歌', '天灯', '不敢当', '爱情之所以为爱情', '属于', '找个人', '风笛手', '儿歌']
    },
    {
        "album": "情歌沒有告訴你", "year": "2010",
        "tracks": ['情歌沒有告訴你', '給還沒有遇見的你', '你會不會', '不為失戀說抱歉', '我就知道那是愛', '一家一', '如果冰箱會說話', '直覺', '慢慢來 比較快']
    },
    {
        "album": "爱久见人心", "year": "2012",
        "tracks": ['爱久见人心', '小爱情', '偶阵雨', '会过去的', '至少爱', '一路两个人', '没有人像你', '她', 'Bonjour!', '心电感应', '环游四季的爱']
    },
    {
        "album": "麋鹿", "year": "2023",
        "tracks": ['第六感', '大人', '麋鹿', '恰好', '时间会告诉我们会过去的', '天气预报', '关于爱，我们都还在期待', '时间悄悄过', '叮当', '终点以后']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    print("\n" + "=" * 80)
    print(f"🌸 开始抓轨 梁静茹 (Fish Leong) 疗愈情歌大碟: 《{album}》({item['year']}) | 共 {len(tracks)} 首")
    print("=" * 80)
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: 梁静茹 - 《{s}》...")
            target_path, qa, lrc_info = dm.download_track(s, "梁静茹", album, dm.DEFAULT_DOWNLOAD_DIR)
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

def run_fish_leong_pipeline():
    print("=" * 80)
    print(f"🚀 梁静茹 (Fish Leong) 情歌天后大碟流水线启动 | 共 {len(FISH_LEONG_PIPELINE)} 张大碟")
    print("=" * 80)
    for idx, item in enumerate(FISH_LEONG_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(FISH_LEONG_PIPELINE)}]: 梁静茹 《{item['album']}》 <<<<<")
        try:
            process_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 异常: {e}")
        time.sleep(2)
    print("\n🎉 梁静茹 (Fish Leong) 全部大碟抓轨全量收官！")

if __name__ == "__main__":
    run_fish_leong_pipeline()

