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

RONGHAO_PIPELINE = [
    {
        "album": "模特", "year": "2013",
        "tracks": ['李白', '模特', '两个人', '太坦白', '老伴', '演员和歌手', '都一样', '有一个姑娘', '蓝绿', '拜拜']
    },
    {
        "album": "李荣浩", "year": "2014",
        "tracks": ['喜剧之王', '落俗', '作曲家', '不搭', '自拍', '哎呀', '快让我在雪地上撒点儿野', '男女', '天生', '二三十']
    },
    {
        "album": "有理想", "year": "2016",
        "tracks": ['野生动物', '满座', '有理想', '爸爸妈妈', '流行歌曲', '优点', '不将就', '心里面', '女孩', '宛若新生', '大太阳']
    },
    {
        "album": "嗯", "year": "2017",
        "tracks": ['嗯', '就这样', '裙姊', '歌谣', '我看着你的时候', '祝你幸福', '后羿', '戒烟', '少年', '不说']
    },
    {
        "album": "耳朵", "year": "2018",
        "tracks": ['王牌冤家', '念念又不忘', '贫穷或富有', '乐团', '我知道是你', '耳朵', '年少有为', '成长之重量', '张家明和婉君', '贝贝']
    },
    {
        "album": "麻雀", "year": "2020",
        "tracks": ['麻雀', '老友记', '等着等着就老了', '两个普普通通小青年', '同根', '我爱你', '花样年华', '在一起嘛好不好', '爱我还是你', '要我怎么办']
    },
    {
        "album": "纵横四海", "year": "2022",
        "tracks": ['纵横四海', '我们好好的', '山川', '情人', '对等关系', '脱胎换骨', '习惯晚睡', '获奖人', '乌梅子酱', '也许是爱情']
    },
    {
        "album": "黑马", "year": "2024",
        "tracks": ['名字', '黑马', '另一端', '一百', '恋人', '走走', '轻轻田园系', '海陆风', '鸿门宴', '假面']
    }
]

def process_album(item, max_workers=2):
    album = item['album']
    tracks = item['tracks']
    print("\n" + "=" * 80)
    print(f"🎸 开始抓轨 李荣浩 经典创作大碟: 《{album}》({item['year']}) | 共 {len(tracks)} 首")
    print("=" * 80)
    dm.LOCAL_ALBUM_TRACKLISTS[album] = tracks
    
    def worker(s):
        try:
            print(f"⏳ 正在抓取: 李荣浩 - 《{s}》...")
            target_path, qa, lrc_info = dm.download_track(s, "李荣浩", album, dm.DEFAULT_DOWNLOAD_DIR)
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

def run_ronghao_pipeline():
    print("=" * 80)
    print(f"🚀 李荣浩 唱作才子全量大碟流水线启动 | 共 {len(RONGHAO_PIPELINE)} 张大碟")
    print("=" * 80)
    for idx, item in enumerate(RONGHAO_PIPELINE, 1):
        print(f"\n>>>>> 推进进度 [{idx}/{len(RONGHAO_PIPELINE)}]: 李荣浩 《{item['album']}》 <<<<<")
        try:
            process_album(item, max_workers=2)
        except Exception as e:
            print(f"❌ 异常: {e}")
        time.sleep(2)
    print("\n🎉 李荣浩 全部大碟抓轨全量收官！")

if __name__ == "__main__":
    run_ronghao_pipeline()

