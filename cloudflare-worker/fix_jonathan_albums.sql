-- MOODY Data Repair: Jonathan Lee Albums Normalization
-- Artist: 李宗盛 (ID: 46)

-- 1. 数据迁移：将冗余 ID 的歌曲关联到主记录
-- 合并 "不舍" (736) -> "不捨" (735)
UPDATE songs SET album_id = 735 WHERE album_id = 736;
-- 合并 ID 1752 -> "我(们)就是这样" (738)
UPDATE songs SET album_id = 738 WHERE album_id = 1752;

-- 2. 标题规范化
-- 统一繁体
UPDATE albums SET title = '不捨' WHERE id = 735;
-- 移除搜索干扰项（括号）
UPDATE albums SET title = '我们就是这样' WHERE id = 738;

-- 3. 清理冗余占位符
DELETE FROM albums WHERE id IN (736, 1752);

-- 4. 最终验证
SELECT 'Final Album List for Jonathan Lee:' as label;
SELECT id, title FROM albums WHERE artist_id = 46 ORDER BY id;
SELECT 'Song counts per album:' as label;
SELECT album_id, COUNT(*) FROM songs WHERE album_id IN (735, 738) GROUP BY album_id;
