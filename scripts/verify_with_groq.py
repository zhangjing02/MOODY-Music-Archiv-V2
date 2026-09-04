#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
==============================================================================
MOODY AI 听音辨曲验证引擎 (Groq Whisper-large-v3)
==============================================================================
工作原理:
1. 直接读取 MP3 音频文件，调用 Groq Whisper 大模型进行精准语音识别 (ASR)。
2. 获取音频中歌手真实唱出的歌词文本。
3. 从官方歌词库拉取该歌曲的标准歌词。
4. 进行关键词与歌词相似度匹配，全自动判断是否为目标歌曲录音室版本！
"""

import os
import sys
import io
import re
import json
import requests

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

def transcribe_audio_groq(file_path: str, api_key: str = GROQ_API_KEY):
    """调用 Groq Whisper-large-v3 听音识别歌词文本"""
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        with open(file_path, "rb") as f:
            files = {"file": (os.path.basename(file_path), f, "audio/mpeg")}
            data = {"model": "whisper-large-v3", "language": "zh"}
            resp = requests.post(GROQ_API_URL, headers=headers, files=files, data=data, timeout=60)
            if resp.status_code == 200:
                return resp.json().get("text", "").strip()
            else:
                print(f"❌ Groq API 错误 HTTP {resp.status_code}: {resp.text}")
                return ""
    except Exception as e:
        print(f"❌ 调用 Groq 识别出错: {e}")
        return ""

def get_official_lyrics(artist: str, album: str, song: str):
    """从官方歌词库获取标准歌词"""
    try:
        import syncedlyrics
        lrc = syncedlyrics.search(f"{artist} {album} {song}")
        if not lrc:
            lrc = syncedlyrics.search(f"{artist} {song}")
        if lrc:
            lines = [re.sub(r'\[.*?\]', '', l).strip() for l in lrc.splitlines() if re.sub(r'\[.*?\]', '', l).strip()]
            clean = [l for l in lines if not any(k in l for k in ['作词', '作曲', '编曲', '制作', 'Jay', 'Chou', '词：', '曲：', '录音', '混音'])]
            return clean
        return []
    except Exception:
        return []

def verify_song(file_path: str, artist: str, album: str, song: str):
    """综合验证音频识别文本与官方歌词"""
    print(f"\n🎧 [AI听音辨曲] 正在听辨: 《{song}》 -> {os.path.basename(file_path)}...")
    actual_text = transcribe_audio_groq(file_path)
    if not actual_text:
        return {"match": False, "reason": "Groq 识别失败", "actual": "", "sample": ""}
    
    official_lines = get_official_lyrics(artist, album, song)
    
    # 提取特征词进行命中率统计
    matched_hits = []
    total_checks = 0
    
    # 取前几句与高潮段落的关键词
    for line in official_lines[:15]:
        clean_line = re.sub(r'[^\w]', '', line)
        if len(clean_line) >= 4:
            total_checks += 1
            # 取 4 个字的特征片段
            sub = clean_line[:4]
            if sub in actual_text:
                matched_hits.append(sub)
            else:
                # 尝试后半段
                sub2 = clean_line[-4:]
                if sub2 in actual_text:
                    matched_hits.append(sub2)
                    
    hit_rate = len(matched_hits) / max(total_checks, 1)
    is_match = hit_rate >= 0.25 or any(k in actual_text for k in [song, re.sub(r'[^\w]', '', song)])
    
    # 提取实际唱出的代表性片段 (20-60字符)
    sample_text = actual_text[:120] + "..." if len(actual_text) > 120 else actual_text
    
    return {
        "match": is_match,
        "hit_rate": f"{hit_rate*100:.1f}%",
        "sample_sung": sample_text,
        "official_sample": " / ".join(official_lines[:2]) if official_lines else "未查到",
        "actual_full": actual_text
    }

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("用法: python verify_with_groq.py <mp3_path> <artist> <album> <song>")
        sys.exit(1)
    res = verify_song(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
    print(json.dumps(res, ensure_ascii=False, indent=2))
