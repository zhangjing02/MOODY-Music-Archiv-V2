import os
import sys
import io

# 确保 UTF-8 编码输出
if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.append(os.path.dirname(__file__))
from download_music import download_track, DEFAULT_DOWNLOAD_DIR

EP_LIST = [
    {
        "album": "寻找周杰伦 EP",
        "songs": ["轨迹", "断了的弦"]
    },
    {
        "album": "霍元甲 EP",
        "songs": ["霍元甲", "献世"]
    },
    {
        "album": "黄金甲 EP",
        "songs": ["黄金甲"]
    },
    {
        "album": "不能说的秘密电影原声带",
        "songs": ["不能说的秘密", "晴天娃娃"]
    },
    {
        "album": "经典特别单曲",
        "songs": ["圣诞星", "周大侠"]
    }
]

def main():
    print("=" * 90)
    print("🚀 开始下载周杰伦经典神级 EP、电影原声带与特别单曲")
    print("=" * 90)
    
    artist = "周杰伦"
    all_results = []
    
    for ep in EP_LIST:
        album_name = ep["album"]
        songs = ep["songs"]
        print(f"\n📦 【处理专辑/EP】: 《{album_name}》 (共 {len(songs)} 首: {', '.join(songs)})")
        
        for idx, song in enumerate(songs, 1):
            print(f"\n--- [{idx}/{len(songs)}] 处理歌曲: 《{song}》 ---")
            fpath, qa, lrc_info = download_track(song, artist, album_name, DEFAULT_DOWNLOAD_DIR)
            
            if fpath and os.path.exists(fpath):
                all_results.append({
                    "album": album_name,
                    "song": song,
                    "bitrate": qa.get("bitrate", "未知"),
                    "duration": qa.get("duration", "未知"),
                    "intro": lrc_info.get("intro", "")[:40],
                    "ai_heard": qa.get("ai_heard", "")[:45]
                })
            else:
                print(f"❌ 《{song}》下载失败")

    print("\n" + "=" * 90)
    print("📋 周杰伦经典 EP 与特别单曲 AI 听音对账清单 (Checklist)")
    print("=" * 90)
    print("| 序号 | 所属 EP / 原声带 | 歌名 | 规格码率 | 时长 | 官方歌词节选 | 🤖 AI实测听词 (Groq Whisper) | 本地状态 |")
    print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
    for i, r in enumerate(all_results, 1):
        print(f"| {i:02d} | 《{r['album']}》 | {r['song']} | {r['bitrate']} | {r['duration']} | {r['intro']} | {r['ai_heard']}... | 💾 本地完备 |")
    print("=" * 90)

if __name__ == "__main__":
    main()
