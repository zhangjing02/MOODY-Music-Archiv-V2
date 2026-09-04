import time
import datetime
import os
import subprocess
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

now = datetime.datetime.now()
target = now.replace(hour=8, minute=0, second=0, microsecond=0)
if target <= now:
    target += datetime.timedelta(days=1)

diff_seconds = (target - now).total_seconds()
print(f"⏰ 定时上传监控已启动")
print(f"当前时间: {now.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"目标触发时间: {target.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"等待时长: {diff_seconds / 3600:.2f} 小时 ({int(diff_seconds)} 秒)")

time.sleep(diff_seconds)

print("\n🔔 时间已到 08:00 AM！Cloudflare 额度已自动清零，开始执行全量上云点亮！")
script_path = os.path.join(os.path.dirname(__file__), "batch_upload_all_local.py")
subprocess.run([sys.executable, script_path], check=True)
