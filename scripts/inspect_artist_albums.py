import re
import sys

if sys.platform.startswith('win'):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

show_tracks = "--tracks" in sys.argv
target_args = [x for x in sys.argv[1:] if not x.startswith("--")]
if target_args:
    artist_ids = [int(x) for x in target_args]

with open('backend/cloudflare-worker/schema.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

artists = dict(re.findall(r"INSERT INTO \"artists\" VALUES\((\d+),'([^']+)'", sql))

for target_id in artist_ids:
    name = artists.get(str(target_id), f"Unknown ({target_id})")
    albums = re.findall(rf"INSERT INTO \"albums\" VALUES\((\d+),{target_id},'([^']+)',(?:'([^']*)'|NULL)", sql)
    songs = re.findall(rf"INSERT INTO \"songs\" VALUES\((\d+),{target_id},(\d+),'([^']+)'", sql)

    album_songs = {}
    for sid, aid, title in songs:
        album_songs.setdefault(int(aid), []).append(title)

    print(f"\n=======================================================")
    print(f"🎤 {name} (Artist ID: {target_id}) - 共 {len(albums)} 张专辑, {len(songs)} 首歌曲")
    print(f"=======================================================")
    for aid, title, year in albums:
        aid = int(aid)
        track_list = album_songs.get(aid, [])
        status = f"{len(track_list)} 首" if track_list else "⚠️ 0 首 (空专辑/脏数据候选)"
        print(f"ID {aid:4d} | 《{title}》({year or '未知'}) - {status}")
        if show_tracks and track_list:
            print(f"       Tracks: {track_list}")
