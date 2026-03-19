-- 修复张学友《Smile》专辑数据
-- 问题：同一首歌有多条记录（一条有 path，一条没有 path），标题格式混乱，TrackIndex 全是 1
-- 解决方案：保留有 path 的记录，修正标题格式，删除重复记录

-- 步骤 1：查找张学友 Smile 专辑的 ID
-- SELECT id, title FROM albums WHERE artist_id IN (SELECT id FROM artists WHERE name = '张学友') AND title = 'Smile';
-- 假设专辑 ID 是 1562（根据 cover URL c_1562.jpg 推断）

-- 步骤 2：修正有 path 记录的标题格式和 TrackIndex
-- 格式：当前标题是 "歌名-张学友-Smile"，需要改为 "歌名"

UPDATE songs
SET title = '轻抚你的脸', track_index = 1
WHERE file_path = 'music/张学友/Smile/s_27661.mp3';

UPDATE songs
SET title = '爱的卡帮', track_index = 2
WHERE file_path = 'music/张学友/Smile/s_27657.mp3';

UPDATE songs
SET title = '丝丝记忆', track_index = 3
WHERE file_path = 'music/张学友/Smile/s_27663.mp3';

UPDATE songs
SET title = '局外人', track_index = 4
WHERE file_path = 'music/张学友/Smile/s_27660.mp3';

UPDATE songs
SET title = '怀抱的您', track_index = 5
WHERE file_path = 'music/张学友/Smile/s_27658.mp3';

UPDATE songs
SET title = '甜梦', track_index = 6
WHERE file_path = 'music/张学友/Smile/s_27664.mp3';

UPDATE songs
SET title = '情已逝', track_index = 7
WHERE file_path = 'music/张学友/Smile/s_27662.mp3';

UPDATE songs
SET title = '造梦者', track_index = 8
WHERE file_path = 'music/张学友/Smile/s_27666.mp3';

UPDATE songs
SET title = '温柔', track_index = 9
WHERE file_path = 'music/张学友/Smile/s_27665.mp3';

UPDATE songs
SET title = '交叉算了', track_index = 10
WHERE file_path = 'music/张学友/Smile/s_27659.mp3';

UPDATE songs
SET title = 'Smile Again 玛莉亚', track_index = 11
WHERE file_path = 'music/张学友/Smile/s_27656.mp3';

-- 步骤 3：删除没有 path 的重复记录
-- 这些记录的 file_path 为 NULL 或空字符串，且标题已经在上面被修正了

-- 找出张学友 Smile 专辑中 file_path 为 NULL 的记录并删除
DELETE FROM songs
WHERE album_id = (SELECT id FROM albums WHERE artist_id IN (SELECT id FROM artists WHERE name = '张学友') AND title = 'Smile')
AND (file_path IS NULL OR file_path = '' OR file_path = 'music/');

-- 验证：检查修复后的结果
-- SELECT id, title, file_path, track_index FROM songs WHERE album_id = (SELECT id FROM albums WHERE artist_id IN (SELECT id FROM artists WHERE name = '张学友') AND title = 'Smile') ORDER BY track_index;
