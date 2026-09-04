import urllib.request
import urllib.parse
import json
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

url = "https://m-api.changgepd.ccwu.cc/api/songs?artist=" + urllib.parse.quote('陈奕迅')
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        for a in data.get('data', []):
            for alb in a.get('albums', []):
                songs = alb.get('songs', [])
                lit = [s for s in songs if s.get('path')]
                status = "🟢 全满" if len(lit) == len(songs) and len(songs) > 0 else (f"🟡 部分 ({len(lit)}/{len(songs)})" if len(lit) > 0 else "⚪ 未点亮")
                print(f"{status:12s} | 《{alb.get('title')}》({alb.get('year')}) - {len(lit)}/{len(songs)} 首")
except Exception as e:
    print("Error:", e)
