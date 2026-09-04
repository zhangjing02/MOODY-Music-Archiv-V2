import os
import sys
import subprocess
import json
import re

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

NODE_PATH = r"D:\DevelopeTools\Node\node.exe"
JS_RUNTIME_ARG = f"node:{NODE_PATH}"

sys.path.append(os.path.dirname(__file__))
import download_music as dm

failed_songs = [
    {"artist": "林俊杰", "album": "100天", "song": "曙光", "alias": "序：曙光"},
    {"artist": "林俊杰", "album": "100天", "song": "爱的关键", "alias": "爱不会绝迹"},
    {"artist": "林俊杰", "album": "编号89757", "song": "无尽的思念", "alias": "无尽的思念"},
    {"artist": "林俊杰", "album": "编号89757", "song": "听不懂没关系", "alias": "听不懂 没关系"},
    {"artist": "林俊杰", "album": "编号89757", "song": "来不及了...", "alias": "来不及了"},
    {"artist": "林俊杰", "album": "西界", "song": "K.O.", "alias": "KO"},
    {"artist": "林俊杰", "album": "第二天堂", "song": "未完成", "alias": "未完成 to be continued"},
    {"artist": "孙燕姿", "album": "克卜勒", "song": "错觉", "alias": "错觉"},
    {"artist": "陶喆", "album": "Stupid Pop Songs", "song": "活该", "alias": "活该"},
]

print(f"=== 诊断 {len(failed_songs)} 首历史跳过/失败曲目 ===")

for item in failed_songs:
    artist = item["artist"]
    album = item["album"]
    song = item["song"]
    alias = item["alias"]
    
    print(f"\n" + "-" * 60)
    print(f"🔍 测试: {artist} - 《{song}》 (别名/搜索词: {alias})")
    
    # 尝试直接使用 yt-dlp 搜索
    queries = [f"{artist} {song} 官方", f"{artist} {alias}", f"{artist} {song}"]
    found = False
    for q in queries:
        cmd = [
            "yt-dlp",
            "--encoding", "utf-8",
            "--js-runtimes", JS_RUNTIME_ARG,
            "--print", "%(id)s | %(title)s | %(duration_string)s | %(channel)s",
            f"ytsearch3:{q}"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if res.returncode == 0 and res.stdout.strip():
            lines = res.stdout.strip().splitlines()
            print(f"  Query [{q}] -> 匹配到 {len(lines)} 个结果:")
            for l in lines:
                print(f"    {l}")
            found = True
            break
    if not found:
        print(f"  ❌ 未搜到可用音源")
