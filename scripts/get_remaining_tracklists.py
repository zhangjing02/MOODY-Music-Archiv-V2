import requests
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

r = requests.get('https://m-api.changgepd.ccwu.cc/api/songs?artist=%E5%91%A8%E6%9D%B0%E4%BC%A6')
data = r.json().get('data', [])
if data:
    for a in data[0].get('albums', []):
        title = a.get('title')
        songs = [s.get('title') for s in a.get('songs', [])]
        lit = sum(1 for s in a.get('songs', []) if s.get('path'))
        print(f"《{title}》({len(songs)}首, 已点亮{lit}): {songs}")
