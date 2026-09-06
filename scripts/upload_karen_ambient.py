#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MOODY MUSIC - Karen 音乐全景环境视频与封面批量上传至 Cloudflare R2
"""

import os
import sys
import glob
import time
import requests

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

API_UPLOAD_URL = "https://m-api.changgepd.ccwu.cc/api/admin/assets/upload"
R2_BASE_URL = "https://r2.changgepd.ccwu.cc/ambient"

PROXIES = {
    'http': 'http://127.0.0.1:7897',
    'https': 'http://127.0.0.1:7897'
}

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VIDEO_DIR = os.path.join(WORKSPACE_DIR, "backend", "frontend", "src", "assets", "video")
IMAGE_DIR = os.path.join(WORKSPACE_DIR, "backend", "frontend", "src", "assets", "images")


def upload_file(filepath: str, category: str = "ambient") -> bool:
    filename = os.path.basename(filepath)
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".mp4":
        mime = "video/mp4"
    elif ext == ".webm":
        mime = "video/webm"
    elif ext in [".jpg", ".jpeg"]:
        mime = "image/jpeg"
    elif ext == ".png":
        mime = "image/png"
    else:
        mime = "application/octet-stream"

    file_size = os.path.getsize(filepath)
    print(f"⏳ 正在上传 {filename} ({file_size/1024/1024:.2f} MB)...")

    # 先 HEAD 探测远端是否已存在且大小一致
    try:
        head_resp = requests.head(f"{R2_BASE_URL}/{filename}", proxies=PROXIES, timeout=8)
        if head_resp.status_code == 200 and int(head_resp.headers.get('content-length', 0)) == file_size:
            print(f"  ⚡ [秒传跳过] 远端已存在且大小一致: {filename}")
            return True
    except Exception:
        pass

    try:
        start_t = time.time()
        with open(filepath, 'rb') as f:
            files = {'file': (filename, f, mime)}
            data = {'category': category, 'filename': filename}
            resp = requests.post(API_UPLOAD_URL, files=files, data=data, proxies=PROXIES, timeout=120)
            
        dur = time.time() - start_t
        if resp.status_code == 200:
            print(f"  ✅ [上传成功] {filename} (耗时 {dur:.1f}s)")
            return True
        else:
            print(f"  ❌ [HTTP {resp.status_code}] {filename}: {resp.text[:100]}")
            return False
    except Exception as e:
        print(f"  ❌ [异常] {filename}: {e}")
        return False


def main():
    print("🚀 开始批量上传 Karen 音乐场景素材至 Cloudflare R2...")
    
    videos = sorted(glob.glob(os.path.join(VIDEO_DIR, "karen_*")))
    images = sorted(glob.glob(os.path.join(IMAGE_DIR, "karen_*")))

    total = len(videos) + len(images)
    print(f"共发现 {len(videos)} 个视频，{len(images)} 张封面图，总计 {total} 个文件。")

    success = 0
    for idx, f in enumerate(videos + images):
        print(f"\n[{idx+1}/{total}]", end=" ")
        if upload_file(f):
            success += 1

    print(f"\n🎉 上传全部完成！成功: {success}/{total}")


if __name__ == "__main__":
    main()
