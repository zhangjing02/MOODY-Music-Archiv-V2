-- ====================================================================
-- MOODY 数据库维护 SQL 瑞士军刀 (Standard Maintenance SQL)
-- 适用平台: Cloudflare D1 / SQLite
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. 路径自愈 (Path Self-Healing)
-- --------------------------------------------------------------------

-- 补全 R2 'music/' 前缀 (解决 R2 路径与 D1 记录不匹配导致的 404)
UPDATE songs 
SET file_path = 'music/' || file_path 
WHERE file_path NOT LIKE 'music/%' 
  AND file_path IS NOT NULL 
  AND file_path != '';

-- 清理路径中的异常后缀 (如 .temp 或 误传的原始文件名)
-- SELECT * FROM songs WHERE file_path LIKE '%.temp';

-- --------------------------------------------------------------------
-- 2. 冗余与冲突检查 (Duplicate & Conflict Detection)
-- --------------------------------------------------------------------

-- 查找完全同名的“影子专辑”及其所属艺术家
SELECT a.id, a.title, artist.name as artist_name, COUNT(s.id) as song_count
FROM albums a
JOIN artists artist ON a.artist_id = artist.id
LEFT JOIN songs s ON s.album_id = a.id
GROUP BY a.title, a.artist_id
HAVING COUNT(*) > 1;

-- 查找没有文件路径的“空壳歌曲”
SELECT s.id, s.title, artist.name 
FROM songs s
JOIN artists artist ON s.artist_id = artist.id
WHERE s.file_path IS NULL OR s.file_path = '';

-- 查找在数据库中存在但在 R2 中无法通过路径推导找到的记录 (提示：需结合 API Audit)
-- SELECT id, title, file_path FROM songs WHERE file_path NOT IN ( ... );

-- --------------------------------------------------------------------
-- 3. 数据完整性审计 (Integrity Audit)
-- --------------------------------------------------------------------

-- 统计没有任何歌曲的孤儿专辑 (Orphaned Albums)
SELECT id, title 
FROM albums 
WHERE id NOT IN (SELECT DISTINCT album_id FROM songs);

-- 统计没有任何专辑的艺术家
SELECT id, name 
FROM artists 
WHERE id NOT IN (SELECT DISTINCT artist_id FROM albums);

-- --------------------------------------------------------------------
-- 4. 批处理与修正 (Batch Correction)
-- --------------------------------------------------------------------

-- 将某个艺术家的所有歌曲 file_path 统一修正
-- UPDATE songs SET file_path = REPLACE(file_path, 'OldArtist/', 'NewArtist/') 
-- WHERE artist_id = (SELECT id FROM artists WHERE name = 'Target Artist');

-- 快速根据 ID 查找某首歌的所有元数据 (用于 Debug 播放失败)
SELECT s.id, s.title, s.file_path, a.title as album, art.name as artist
FROM songs s
JOIN albums a ON s.album_id = a.id
JOIN artists art ON s.artist_id = art.id
WHERE s.id = 'YOUR_SONG_ID';

-- --------------------------------------------------------------------
-- 5. 存储空间概览 (Storage Overview)
-- --------------------------------------------------------------------

-- 按艺术家统计歌曲数量 (Top 20)
SELECT art.name, COUNT(s.id) as total_songs
FROM songs s
JOIN artists art ON s.artist_id = art.id
GROUP BY art.id
ORDER BY total_songs DESC
LIMIT 20;

-- 统计 D1 数据表的行数
SELECT 
  (SELECT COUNT(*) FROM artists) as artists_count,
  (SELECT COUNT(*) FROM albums) as albums_count,
  (SELECT COUNT(*) FROM songs) as songs_count;
