import os

root = r'e:\Html-work\服务器上备份的资源\music'
stats = {
    'total_artists': 0,
    'total_albums': 0,
    'total_files': 0,
    'governed_files': 0, # s_ID.mp3
    'other_files': 0
}

if os.path.exists(root):
    artists = [d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))]
    stats['total_artists'] = len(artists)
    
    for artist in artists:
        artist_path = os.path.join(root, artist)
        albums = [d for d in os.listdir(artist_path) if os.path.isdir(os.path.join(artist_path, d))]
        stats['total_albums'] += len(albums)
        
        for album in albums:
            album_path = os.path.join(artist_path, album)
            for f in os.listdir(album_path):
                if f.endswith(('.mp3', '.m4a', '.flac', '.wav')):
                    stats['total_files'] += 1
                    if f.startswith('s_') and f[2:].split('.')[0].isdigit():
                        stats['governed_files'] += 1
                    else:
                        stats['other_files'] += 1

print(f"Stats: {stats}")
