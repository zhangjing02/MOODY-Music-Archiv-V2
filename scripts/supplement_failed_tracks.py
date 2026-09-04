import os
import sys
import subprocess
import json
import re

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.append(os.path.dirname(__file__))
import download_music as dm

DOWNLOAD_DIR = dm.DEFAULT_DOWNLOAD_DIR
NODE_PATH = r"D:\DevelopeTools\Node\node.exe"
JS_RUNTIME_ARG = f"node:{NODE_PATH}"

SUPPLEMENT_LIST = [
    {
        "artist": "林俊杰",
        "album": "100天",
        "song": "曙光",
        "queries": ["林俊杰 序 曙光", "林俊杰 曙光 100天", "JJ Lin Twilight Prologue"],
        "min_sec": 30, "max_sec": 180
    },
    {
        "artist": "林俊杰",
        "album": "100天",
        "song": "爱的关键",
        # 实际为《爱不会绝迹》或《爱的鼓励》
        "queries": ["林俊杰 爱不会绝迹 官方", "林俊杰 爱的鼓励 官方", "林俊杰 爱的关键"],
        "min_sec": 75, "max_sec": 360
    },
    {
        "artist": "林俊杰",
        "album": "编号89757",
        "song": "无尽的思念",
        "queries": ["林俊杰 无尽的思念 官方MV", "林俊杰 无尽的思念 高音质", "JJ Lin Endless Road"],
        "min_sec": 75, "max_sec": 360
    },
    {
        "artist": "林俊杰",
        "album": "编号89757",
        "song": "听不懂没关系",
        "queries": ["林俊杰 听不懂没关系 官方", "林俊杰 听不懂 没关系", "JJ Lin 听不懂没关系"],
        "min_sec": 75, "max_sec": 360
    },
    {
        "artist": "林俊杰",
        "album": "编号89757",
        "song": "来不及了...",
        "queries": ["林俊杰 来不及了 编号89757", "林俊杰 来不及了", "JJ Lin 来不及了"],
        "min_sec": 20, "max_sec": 180
    },
    {
        "artist": "林俊杰",
        "album": "西界",
        "song": "K.O.",
        "queries": ["林俊杰 KO 西界", "林俊杰 K.O.", "JJ Lin KO Official"],
        "min_sec": 75, "max_sec": 360
    },
    {
        "artist": "林俊杰",
        "album": "第二天堂",
        "song": "未完成",
        "queries": ["林俊杰 未完成 第二天堂", "林俊杰 to be continued", "JJ Lin 未完成"],
        "min_sec": 20, "max_sec": 180
    },
    {
        "artist": "孙燕姿",
        "album": "克卜勒",
        "song": "错觉",
        "queries": ["孙燕姿 错觉 官方", "孙燕姿 错觉 克卜勒", "Stefanie Sun 错觉"],
        "min_sec": 75, "max_sec": 360
    },
    {
        "artist": "孙燕姿",
        "album": "逆光",
        "song": "Intro",
        "queries": ["孙燕姿 逆光 Intro", "孙燕姿 逆光 前奏", "Stefanie Sun 逆光 Intro"],
        "min_sec": 20, "max_sec": 180
    },
    {
        "artist": "陶喆",
        "album": "Stupid Pop Songs",
        "song": "活该",
        "queries": ["陶喆 活该 官方", "陶喆 活该 Official", "David Tao 活该"],
        "min_sec": 75, "max_sec": 360
    }
]

def search_candidates_custom(queries, min_sec, max_sec):
    candidates = []
    seen_ids = set()
    for q in queries:
        cmd = [
            "yt-dlp",
            "--encoding", "utf-8",
            "--js-runtimes", JS_RUNTIME_ARG,
            "--print", "%(id)s | %(title)s | %(duration_string)s | %(channel)s",
            f"ytsearch5:{q}"
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace', check=True)
            for line in res.stdout.strip().splitlines():
                parts = [p.strip() for p in line.split("|")]
                if len(parts) >= 4:
                    vid, vtitle, vdur, vchannel = parts[0], parts[1], parts[2], parts[3]
                    if vid in seen_ids:
                        continue
                    seen_ids.add(vid)
                    sec = dm.parse_duration_sec(vdur)
                    if min_sec <= sec <= max_sec:
                        candidates.append({
                            "id": vid, "title": vtitle, "duration": vdur,
                            "channel": vchannel, "url": f"https://www.youtube.com/watch?v={vid}"
                        })
        except Exception as e:
            print(f"  ⚠️ 查询 [{q}] 异常: {e}")
    return candidates

def download_and_save(item):
    artist = item["artist"]
    album = item["album"]
    song = item["song"]
    min_sec = item.get("min_sec", 30)
    max_sec = item.get("max_sec", 420)
    
    print("\n" + "=" * 80)
    print(f"🔧 针对性渠道补齐: {artist} - 《{song}》 (所属大碟: 《{album}》)")
    print("=" * 80)
    
    candidates = search_candidates_custom(item["queries"], min_sec, max_sec)
    print(f"  🔍 聚合检索得到 {len(candidates)} 个候选资源")
    if not candidates:
        print(f"  ❌ 未找到符合时长范围 ({min_sec}s~{max_sec}s) 的候选音源")
        return False
        
    for idx, c in enumerate(candidates, 1):
        print(f"\n  🎯 [尝试渠道 {idx}/{len(candidates)}] {c['title']} ({c['duration']}) [{c['channel']}]")
        try:
            target_path, qa, lrc_info = dm.download_track(song, artist, album, DOWNLOAD_DIR, url=c['url'])
            if qa and target_path and os.path.exists(target_path):
                print(f"  🎉 【补全成功】{os.path.basename(target_path)} 校验通过！")
                return True
        except Exception as e:
            print(f"  ⚠️ 下载异常: {e}")
            
    print(f"  ❌ 所有候选音源尝试完毕，未能成功入库")
    return False

def run_supplement():
    print("=" * 80)
    print(f"🚀 启动历史遗漏/失败曲目专项定向补齐流程 | 共 {len(SUPPLEMENT_LIST)} 首")
    print("=" * 80)
    success = 0
    for it in SUPPLEMENT_LIST:
        ok = download_and_save(it)
        if ok:
            success += 1
    print("\n" + "=" * 80)
    print(f"📊 专项补齐结果: 成功 {success}/{len(SUPPLEMENT_LIST)} 首！")
    print("=" * 80)

if __name__ == "__main__":
    run_supplement()
