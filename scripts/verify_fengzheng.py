import os
import sys

sys.path.append(os.path.dirname(__file__))
from download_music import inspect_audio_quality, verify_with_groq_whisper, fetch_and_save_lyrics

album = '风筝'
artist = '孙燕姿'
tracks = ['绿光', '风筝', '任性', '逃亡', '不是真的爱我', '真的', '练习', '爱情字典', '随堂测验', '我是我']

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

print("==========================================================================================")
print(f"📋 孙燕姿《{album}》(2001) 全专 10 首 AI 听音歌词双重核验清单 (Checklist)")
print("==========================================================================================")
print("| 序号 | 歌名 | 规格码率 | 时长 | 官方歌词节选 | 🤖 AI实测听词 (Groq Whisper) | 本地状态 |")
print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")

for idx, t in enumerate(tracks, 1):
    f = f'backend/downloads/{t}-{artist}-{album}.mp3'
    if os.path.exists(f):
        qa = inspect_audio_quality(f)
        lrc = fetch_and_save_lyrics(artist, album, t, 'backend/downloads')
        heard, ok = verify_with_groq_whisper(f, t, lrc.get('intro',''), lrc.get('chorus',''))
        intro = lrc.get('intro', '无')[:25]
        clean_heard = heard.replace('\n', ' ')[:40]
        status = "💾 本地完备" if ok else "⚠️ 待人工确认"
        print(f"| {idx:02d} | {t} | {qa.get('bitrate')} | {qa.get('duration')} | {intro} | {clean_heard}... | {status} |")
    else:
        print(f"| {idx:02d} | {t} | MISSING | - | - | - | ❌ 缺失 |")

print("==========================================================================================")
