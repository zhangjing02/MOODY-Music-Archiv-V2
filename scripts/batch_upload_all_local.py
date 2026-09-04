import os
import sys
import glob
import time
import requests

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

UPLOAD_URL = "https://m-api.changgepd.ccwu.cc/api/admin/upload"
DOWNLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "downloads")

def upload_single_track(mp3_path: str, max_retries: int = 3) -> bool:
    """上传单个本地 MP3 及其 LRC 到 MOODY Cloudflare Worker 执行入库点亮"""
    filename = os.path.basename(mp3_path)
    base_name = filename[:-4]
    parts = base_name.split('-')
    if len(parts) < 3:
        print(f"⚠️ [跳过] 文件名格式不符: {filename}")
        return False
    
    song_title = parts[0]
    artist_name = parts[1]
    album_title = parts[2]
    
    lrc_path = os.path.join(DOWNLOADS_DIR, f"{base_name}.lrc")
    
    for attempt in range(1, max_retries + 1):
        try:
            with open(mp3_path, 'rb') as f_mp3:
                files = {'files': (filename, f_mp3, 'audio/mpeg')}
                data = {
                    'artistOverride': artist_name,
                    'albumOverride': album_title,
                    'titleOverride': song_title
                }
                
                # 若存在同名歌词则同步上传
                if os.path.exists(lrc_path):
                    with open(lrc_path, 'rb') as f_lrc:
                        files['lrc'] = (os.path.basename(lrc_path), f_lrc, 'text/plain')
                        resp = requests.post(UPLOAD_URL, files=files, data=data, timeout=30)
                else:
                    resp = requests.post(UPLOAD_URL, files=files, data=data, timeout=30)
                
                if resp.status_code == 200:
                    res_json = resp.json()
                    if res_json.get('code') in [0, 200]:
                        print(f"✅ [点亮成功] 《{song_title}》 - {artist_name} ({album_title})")
                        return True
                    else:
                        print(f"⚠️ [入库提示] 《{song_title}》: {res_json.get('message')}")
                        return False
                elif resp.status_code == 500:
                    err_text = resp.text
                    if "limit" in err_text.lower() or "exceeded" in err_text.lower():
                        print(f"🛑 [云端限流拦截] D1 配额仍未重置或超限: {err_text[:120]}")
                        return False
                    else:
                        print(f"❌ [重试 {attempt}/{max_retries}] 500 错误: {err_text[:120]}")
                else:
                    print(f"❌ [重试 {attempt}/{max_retries}] HTTP {resp.status_code}")
        except Exception as e:
            print(f"⚠️ [异常重试 {attempt}/{max_retries}] 《{song_title}》: {e}")
            time.sleep(2)
            
    return False

def upload_all_downloaded_songs():
    """遍历本地 downloads 目录，全量上云点亮"""
    mp3_files = glob.glob(os.path.join(DOWNLOADS_DIR, "*.mp3"))
    total = len(mp3_files)
    print("=" * 80)
    print(f"🚀 开始执行本地音频全量上云点亮任务 | 总文件数: {total}")
    print(f"目标接口: {UPLOAD_URL}")
    print("=" * 80)
    
    success_count = 0
    fail_count = 0
    
    start_time = time.time()
    for idx, f in enumerate(sorted(mp3_files), 1):
        print(f"[{idx}/{total}] 正在同步: {os.path.basename(f)}...")
        if upload_single_track(f):
            success_count += 1
        else:
            fail_count += 1
        # 轻微休眠避免触发接口并发抖动
        time.sleep(0.3)
        
    elapsed = time.time() - start_time
    print("=" * 80)
    print(f"🎉 批量点亮任务执行完毕！")
    print(f"📊 总数: {total} | 成功点亮: {success_count} | 失败/跳过: {fail_count} | 耗时: {elapsed:.1f} 秒")
    print("=" * 80)

if __name__ == "__main__":
    upload_all_downloaded_songs()
