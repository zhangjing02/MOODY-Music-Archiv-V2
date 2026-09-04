import subprocess
import json
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

songs_to_test = [
    ("林俊杰", "100天", "曙光"),
    ("林俊杰", "100天", "爱的关键"),
    ("林俊杰", "100天", "爱不会绝迹"),
    ("林俊杰", "100天", "爱的鼓励"),
    ("林俊杰", "编号89757", "无尽的思念"),
    ("林俊杰", "编号89757", "听不懂没关系"),
    ("林俊杰", "编号89757", "来不及了..."),
    ("林俊杰", "西界", "K.O."),
    ("林俊杰", "第二天堂", "未完成"),
    ("孙燕姿", "克卜勒", "错觉"),
    ("陶喆", "Stupid Pop Songs", "活该"),
]

for artist, album, song in songs_to_test:
    query = f"{artist} {song}"
    cmd = [
        "yt-dlp",
        "--print", "%(id)s | %(title)s | %(duration_string)s | %(channel)s",
        f"ytsearch5:{query}"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    print(f"\n=== Query: {query} ===")
    if res.returncode == 0:
        for line in res.stdout.strip().splitlines()[:3]:
            print("  ", line)
    else:
        print("  Error:", res.stderr.strip()[:100])
