#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MOODY MUSIC - 动态微动背景视频自动上传程序
将本地 4 个动态背景素材上传至 Cloudflare R2 / 生产服务端
上传目录分类: ambient
远端访问路径: 
- https://r2.changgepd.ccwu.cc/ambient/<filename>
- https://m-api.changgepd.ccwu.cc/storage/ambient/<filename>
"""

import os
import sys
import time
import requests

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# 配置
API_UPLOAD_URL = "https://m-api.changgepd.ccwu.cc/api/admin/assets/upload"
R2_BASE_URL = "https://r2.changgepd.ccwu.cc/ambient"
WORKER_STORAGE_URL = "https://m-api.changgepd.ccwu.cc/storage/ambient"

PROXIES = {
    'http': 'http://127.0.0.1:7897',
    'https': 'http://127.0.0.1:7897'
}

VIDEO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "src", "assets", "video"))

TARGET_VIDEOS = [
    {"name": "cozy_rain.webm", "desc": "极简雨窗", "mime": "video/webm"},
    {"name": "ocean.webm", "desc": "深海荧光", "mime": "video/webm"},
    {"name": "cafe_rain.webm", "desc": "街角咖啡", "mime": "video/webm"},
    {"name": "shinjuku.mp4", "desc": "新宿雨夜 (长镜头车水马龙)", "mime": "video/mp4"}
]

def format_size(bytes_num):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_num < 1024.0:
            return f"{bytes_num:.2f} {unit}"
        bytes_num /= 1024.0
    return f"{bytes_num:.2f} TB"

def verify_remote_url(filename: str) -> bool:
    """验证远端文件是否已成功可访问"""
    urls_to_test = [
        f"{R2_BASE_URL}/{filename}",
        f"{WORKER_STORAGE_URL}/{filename}"
    ]
    for url in urls_to_test:
        try:
            resp = requests.head(url, proxies=PROXIES, timeout=10)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
    return False

def upload_video(item: dict, max_retries: int = 3) -> bool:
    filename = item["name"]
    desc = item["desc"]
    mime = item["mime"]
    filepath = os.path.join(VIDEO_DIR, filename)

    if not os.path.exists(filepath):
        print(f"❌ [文件缺失] 本地未找到: {filepath}")
        return False

    file_size = os.path.getsize(filepath)
    print(f"\n🎬 准备上传: 《{desc}》 ({filename}) - 大小: {format_size(file_size)}")

    for attempt in range(1, max_retries + 1):
        try:
            start_t = time.time()
            with open(filepath, 'rb') as f:
                files = {
                    'file': (filename, f, mime)
                }
                data = {
                    'category': 'ambient',
                    'filename': filename
                }
                print(f"    ⏳ [上传中 {attempt}/{max_retries}] 正在推送到服务器...")
                resp = requests.post(
                    API_UPLOAD_URL,
                    files=files,
                    data=data,
                    proxies=PROXIES,
                    timeout=180
                )

            duration = time.time() - start_t
            speed = (file_size / 1024 / 1024) / duration if duration > 0 else 0

            if resp.status_code == 200:
                res_data = resp.json()
                if res_data.get('code') in [200, 0]:
                    print(f"    ✅ [上传成功] 耗时 {duration:.1f}s | 平均速度: {speed:.2f} MB/s")
                    print(f"    🔗 R2 直链: {R2_BASE_URL}/{filename}")
                    print(f"    🔗 Worker 代理: {WORKER_STORAGE_URL}/{filename}")
                    return True
                else:
                    print(f"    ⚠️ [服务端返回异常]: {res_data.get('message')}")
            else:
                print(f"    ❌ [HTTP 错误 {resp.status_code}]: {resp.text[:120]}")

        except Exception as e:
            print(f"    ⚠️ [异常重试 {attempt}/{max_retries}]: {e}")
            time.sleep(3)

    return False

def main():
    print("=" * 75)
    print("🚀 MOODY MUSIC - 动态微动背景视频全量上云任务")
    print(f"📂 本地素材目录: {VIDEO_DIR}")
    print(f"🌐 目标上传接口: {API_UPLOAD_URL}")
    print(f"🎯 远端存储空间: Cloudflare R2 (bucket: moody-music-asset/ambient)")
    print("=" * 75)

    success = 0
    failed = 0
    total_start = time.time()

    for idx, item in enumerate(TARGET_VIDEOS, 1):
        print(f"\n[{idx}/{len(TARGET_VIDEOS)}] 处理中...")
        if upload_video(item):
            success += 1
        else:
            failed += 1

    total_duration = time.time() - total_start
    print("\n" + "=" * 75)
    print("🎉 动态背景视频上传任务完成！")
    print(f"📊 汇总: 共 {len(TARGET_VIDEOS)} 个素材 | 成功: {success} | 失败: {failed} | 总耗时: {total_duration:.1f}s")
    print("=" * 75)

    # 打印前端配置示例
    print("\n💡 前端已配置自动引用：")
    print(f"   window.AMBIENT_VIDEO_BASE_URL = '{R2_BASE_URL}/';")

if __name__ == "__main__":
    main()
