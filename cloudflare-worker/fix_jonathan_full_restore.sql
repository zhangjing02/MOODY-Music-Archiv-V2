-- ============================================================
-- MOODY Data Repair: Jonathan Lee Full Restore (2026-03-17)
-- 名录圣约合规：只移动 album_id，title 修改需用户授权
-- ============================================================

-- Step 1: 生命中的精灵 (736) ← 从 738 归还 13 首歌
-- 依据：file_path 明确指向 '生命中的精灵/' 目录
UPDATE songs
SET album_id = 736
WHERE album_id = 738
  AND file_path LIKE '%生命中的精灵%';

-- Step 2: 不捨 (735) ← 从 732 归还 11 首歌
-- 依据：file_path 明确指向 '不舍/' 目录，song id 10025-10035
UPDATE songs
SET album_id = 735
WHERE id BETWEEN 10025 AND 10035
  AND file_path LIKE '%不舍%';

-- Step 3: 我们就是这样 (738) ← 从 734 归还 10 首歌
-- 依据：file_path 明确指向 '我们就是这样/' 目录，song id 10036-10045
UPDATE songs
SET album_id = 738
WHERE id BETWEEN 10036 AND 10045
  AND file_path LIKE '%我们就是这样%';

-- ============================================================
-- 验证：执行后各专辑歌曲数量
-- ============================================================
SELECT album_id, COUNT(*) as song_count
FROM songs
WHERE album_id IN (732, 734, 735, 736, 738)
GROUP BY album_id
ORDER BY album_id;
