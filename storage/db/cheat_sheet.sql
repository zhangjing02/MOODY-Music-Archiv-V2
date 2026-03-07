-- MOODY 数据库运维瑞士军刀 (SQLite Cheat Sheet)
-- 本文件用于记录常用的 MOODY 数据维护与对齐 SQL

-- 1. 数据概览统计
SELECT 'Artists' as TableName, COUNT(*) as Count FROM artists
UNION ALL
SELECT 'Albums', COUNT(*) FROM albums
UNION ALL
SELECT 'Songs', COUNT(*) FROM songs;

-- 2. 统计已点亮（有文件）与未点亮（仅名录）的歌曲
SELECT 
    CASE WHEN file_path IS NULL OR file_path = '' THEN '仅名录 (Placeholder)' ELSE '已点亮 (Local)' END as Status,
    COUNT(*) as Count
FROM songs
GROUP BY Status;

-- 3. 查找特定艺人的专辑完成度 (含歌曲总数 vs 已同步数)
SELECT 
    a.name as Artist,
    al.title as Album,
    COUNT(s.id) as TotalInCatalog,
    SUM(CASE WHEN s.file_path IS NOT NULL THEN 1 ELSE 0 END) as LocalFound
FROM artists a
JOIN albums al ON a.id = al.artist_id
JOIN songs s ON al.id = s.album_id
WHERE a.name LIKE '%周杰伦%'
GROUP BY al.id;

-- 4. 查找路径中存在反斜杠的异常记录 (Windows 遗留问题)
SELECT id, title, file_path FROM songs WHERE file_path LIKE '%\%';

-- 5. 查找同名歌曲在同专辑下的重复项
SELECT title, album_id, COUNT(*) 
FROM songs 
GROUP BY title, album_id 
HAVING COUNT(*) > 1;

-- 6. 查找 ID 化命名不一致的孤儿 (非 s_ID.mp3 格式)
SELECT id, title, file_path 
FROM songs 
WHERE file_path IS NOT NULL 
AND file_path NOT LIKE '%/s[_]%.%'
AND file_path NOT LIKE 's[_]%.%';

-- 7. 导出所有已点亮的歌曲路径 (用于外部备份)
-- SELECT file_path FROM songs WHERE file_path IS NOT NULL;

-- 8. 查找没有歌词的已点亮歌曲
SELECT s.id, s.title, a.name as artist, s.file_path
FROM songs s
JOIN albums al ON s.album_id = al.id
JOIN artists a ON al.artist_id = a.id
WHERE s.file_path IS NOT NULL 
AND (s.lyrics IS NULL OR s.lyrics = '');

-- 9. 查找时长异常的歌曲 (如为空或 0 的已下载歌曲)
SELECT id, title, duration_ms, file_path 
FROM songs 
WHERE file_path IS NOT NULL 
AND (duration_ms IS NULL OR duration_ms = 0);

-- 10. 删除孤立专辑 (该专辑下没有歌曲)
-- DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM songs);

-- 11. 删除孤立艺术家 (该艺术家下没有专辑)
-- DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM albums);

-- 12. 更新音乐文件的软链接后缀格式 (从原始转为标准化 s_xxx.mp3)
-- UPDATE songs SET file_path = 's_' || id || '.mp3' WHERE file_path IS NOT NULL AND file_path NOT LIKE 's_%';

-- 13. 重置艺人下所有名录状态（方便重新拉取）
-- UPDATE songs SET file_path = NULL, lyrics = NULL WHERE album_id IN (SELECT id FROM albums WHERE artist_id = 1);
