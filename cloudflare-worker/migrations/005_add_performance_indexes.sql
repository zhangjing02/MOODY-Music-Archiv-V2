-- 005_add_performance_indexes.sql
-- 核心性能索引：彻底解决批量上传/歌曲查询时的大规模全表扫描与 D1 读数超限瓶颈

-- 1. 艺人表索引 (按艺人名极速检索，由 O(N) 降至 O(log N))
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);

-- 2. 专辑表外键与联合索引 (按艺人查找专辑，避免遍历数千张专辑)
CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums(artist_id);
CREATE INDEX IF NOT EXISTS idx_albums_artist_title ON albums(artist_id, title);
CREATE INDEX IF NOT EXISTS idx_albums_title ON albums(title);

-- 3. 歌曲表核心索引 (按专辑查找歌曲，避免全表扫描数万首歌曲)
CREATE INDEX IF NOT EXISTS idx_songs_album_id ON songs(album_id);
CREATE INDEX IF NOT EXISTS idx_songs_album_title ON songs(album_id, title);
CREATE INDEX IF NOT EXISTS idx_songs_file_path ON songs(file_path);
