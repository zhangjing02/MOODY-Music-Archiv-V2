#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MOODY MUSIC - 明早 08:00 定时执行上云程序
目标时间: 明日早晨 08:00:00 (北京时间 UTC+8)
执行内容:
1. 优先自动上传 4 个动态背景素材 (shinjuku.mp4, ocean.webm, cozy_rain.webm, cafe_rain.webm) 到云端 R2 存储
2. 随后自动触发音频批量点亮入库程序 (batch_upload_all_local.py)
"""

import os
import sys
import time
import datetime
import subprocess

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_AMBIENT_SCRIPT = os.path.join(SCRIPTS_DIR, "upload_ambient_videos.py")
BATCH_UPLOAD_SCRIPT = os.path.join(SCRIPTS_DIR, "batch_upload_all_local.py")

def get_target_time() -> datetime.datetime:
    now = datetime.datetime.now()
    target = now.replace(hour=8, minute=0, second=0, microsecond=0)
    if target <= now:
        target += datetime.timedelta(days=1)
    return target

def wait_until_8am():
    target = get_target_time()
    now = datetime.datetime.now()
    diff = (target - now).total_seconds()

    print("=" * 75)
    print("⏰ MOODY MUSIC - 明早 08:00 自动上云监控守护进程已启动")
    print(f"当前时间: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"目标触发: {target.strftime('%Y-%m-%d %H:%M:%S')} (Cloudflare 每日免费额度重置时点)")
    print(f"等待时长: {diff / 3600:.2f} 小时 ({int(diff // 60)} 分钟 / {int(diff)} 秒)")
    print("=" * 75)
    print("💡 保持此窗口开启，明早 08:00:00 将自动执行动态背景视频上云与曲目点亮！\n")

    # 循环心跳等待（每 60 秒打印一次倒计时提示）
    last_print = time.time()
    while True:
        now = datetime.datetime.now()
        remaining = (target - now).total_seconds()
        if remaining <= 0:
            break

        # 每隔 30 分钟或剩余 5 分钟以内每分钟输出一次心跳
        if time.time() - last_print >= 1800 or (remaining <= 300 and time.time() - last_print >= 60):
            hours = int(remaining // 3600)
            minutes = int((remaining % 3600) // 60)
            seconds = int(remaining % 60)
            print(f"[{now.strftime('%H:%M:%S')}] ⏳ 距离明早 08:00 触发还剩: {hours}小时 {minutes}分 {seconds}秒...")
            last_print = time.time()

        # 睡眠步长（接近目标时缩小步长）
        sleep_step = min(remaining, 10 if remaining > 60 else 1)
        time.sleep(sleep_step)

    print("\n" + "#" * 75)
    print(f"🔔 时间已到 08:00:00 AM！({datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")
    print("Cloudflare 免费额度已正式刷新，启动自动化全量上云任务！")
    print("#" * 75)

    # 任务 1: 上传动态微动背景视频
    print("\n🎬 【第一步】开始上传动态微动背景图到云端 R2...")
    try:
        subprocess.run([sys.executable, UPLOAD_AMBIENT_SCRIPT], check=True)
        print("✅ 动态微动背景图已成功上传并点亮！")
    except Exception as e:
        print(f"❌ 动态微动背景图上传异常: {e}")

    # 任务 2: 上传并点亮所有本地歌曲
    if os.path.exists(BATCH_UPLOAD_SCRIPT):
        print("\n🎵 【第二步】开始执行本地曲目全量上云点亮 (batch_upload_all_local.py)...")
        try:
            subprocess.run([sys.executable, BATCH_UPLOAD_SCRIPT], check=True)
            print("✅ 本地曲目全量上云点亮完毕！")
        except Exception as e:
            print(f"❌ 曲目批量上云异常: {e}")

    print("\n" + "=" * 75)
    print("🎉 明早 08:00 全套上云任务执行完毕！")
    print("=" * 75)

if __name__ == "__main__":
    wait_until_8am()
