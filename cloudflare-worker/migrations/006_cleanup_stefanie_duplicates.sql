-- 006_cleanup_stefanie_duplicates.sql
-- 清洗孙燕姿《克卜勒》(1092) 与《跳舞的梵谷》(1090) 中的英文翻译名与繁简重复脏数据

-- 1. 清理《克卜勒》(1092) 的英文名与重复碎片条目
DELETE FROM songs WHERE id IN (
  14835, 14836, 14837, 14838, 14839, 14840, 14841, 14842, 14843, 14844, -- 英文名
  23770, 23771, 23772, 23773, 23774, 23775, 23776                        -- 重复简体碎片
);

-- 标准化保留的 10 首曲目名称与顺序 (14845 ~ 14854)
UPDATE songs SET title = '克卜勒', track_index = 1 WHERE id = 14845;
UPDATE songs SET title = '渴', track_index = 2 WHERE id = 14846;
UPDATE songs SET title = '无限大', track_index = 3 WHERE id = 14847;
UPDATE songs SET title = '尚好的青春', track_index = 4 WHERE id = 14848;
UPDATE songs SET title = '天使的指纹', track_index = 5 WHERE id = 14849;
UPDATE songs SET title = '银泰', track_index = 6 WHERE id = 14850;
UPDATE songs SET title = '围绕', track_index = 7 WHERE id = 14851;
UPDATE songs SET title = '错觉', track_index = 8 WHERE id = 14852;
UPDATE songs SET title = '比较幸福', track_index = 9 WHERE id = 14853;
UPDATE songs SET title = '雨还是不停地落下', track_index = 10 WHERE id = 14854;

-- 2. 清理《No.13 作品 : 跳舞的梵谷》(1090) 的繁简重复碎片
DELETE FROM songs WHERE id IN (
  23777, 23778, 23779, 23780, 23781, 23782 -- 重复简体碎片
);

-- 标准化保留的 10 首曲目名称与顺序 (14825 ~ 14834)
UPDATE songs SET title = '风衣', track_index = 1 WHERE id = 14825;
UPDATE songs SET title = '我很愉快', track_index = 2 WHERE id = 14826;
UPDATE songs SET title = '跳舞的梵谷', track_index = 3 WHERE id = 14827;
UPDATE songs SET title = '天越亮，夜越黑', track_index = 4 WHERE id = 14828;
UPDATE songs SET title = '天天年年', track_index = 5 WHERE id = 14829;
UPDATE songs SET title = '漂浮群岛', track_index = 6 WHERE id = 14830;
UPDATE songs SET title = '超人类', track_index = 7 WHERE id = 14831;
UPDATE songs SET title = '充氧期', track_index = 8 WHERE id = 14832;
UPDATE songs SET title = '平日快乐', track_index = 9 WHERE id = 14833;
UPDATE songs SET title = '极美', track_index = 10 WHERE id = 14834;

-- 3. 修正林俊杰《100天》(719) 第 11 轨歌名笔误: 爱的关键 -> 爱不会绝迹
UPDATE songs SET title = '爱不会绝迹' WHERE id = 26863;
