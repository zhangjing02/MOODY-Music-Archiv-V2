-- 1. 详细盘点李宗盛的所有专辑
SELECT al.id, al.title, al.release_date, COUNT(s.id) as song_count 
FROM albums al
LEFT JOIN songs s ON al.id = s.album_id
WHERE al.artist_id = 46
GROUP BY al.id, al.title, al.release_date;

-- 2. 检查《不捨》(735) 的所有歌曲详情（标题、原始路径）
-- 这样可以看出歌曲到底是哪些
SELECT id, title, track_index, file_path FROM songs WHERE album_id = 735;

-- 3. 搜索丢失的《生命中的精灵》
SELECT id, title, artist_id FROM albums WHERE title LIKE '%精灵%';

-- 4. 追踪那 21 首歌曲可能原本所属的专辑
-- 如果是通过 ID 736 合并过来的，看看 736 原本可能是什么（虽然已删除，但可以查 D1 的剩余记录）
SELECT artist_id, title FROM albums WHERE title LIKE '%Love%' LIMIT 5;
