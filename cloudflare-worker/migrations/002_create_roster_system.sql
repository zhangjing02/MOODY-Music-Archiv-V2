-- ================================================
-- 002_create_roster_system.sql
-- 同学录认领系统 — 数据库变更
-- ================================================

-- 1. 升级 user_profiles：role 现在支持 master / admin / user
-- （直接 ALTER 添加 CHECK 约束在 SQLite 里不支持，role 字段已存在，无需变更结构）

-- 2. 创建名录表
CREATE TABLE IF NOT EXISTS student_roster (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  real_name     TEXT    NOT NULL,          -- 真实姓名
  year_code     TEXT    NOT NULL,          -- 入学年份代码，如 2006
  seat_code     TEXT    NOT NULL,          -- 座位代码，如 0301（03班01号）
  is_claimed    INTEGER DEFAULT 0,         -- 0=未认领, 1=已认领
  profile_id    INTEGER,                   -- 关联 user_profiles.id（认领后填入）
  bound_email   TEXT,                      -- 认领时可绑定的邮箱（用于找回密码）
  status        TEXT    DEFAULT 'normal',  -- normal / reset_pending
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES user_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_roster_seat ON student_roster(year_code, seat_code);
CREATE INDEX IF NOT EXISTS idx_roster_profile ON student_roster(profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roster_name_code ON student_roster(year_code, real_name, seat_code);

-- 3. 创建临时认领令牌表（用于 claim/verify → claim/finalize 的中间状态）
CREATE TABLE IF NOT EXISTS claim_tokens (
  token         TEXT    PRIMARY KEY,
  roster_id     INTEGER NOT NULL,
  expires_at    DATETIME NOT NULL,         -- 10 分钟有效期
  used          INTEGER DEFAULT 0,
  FOREIGN KEY(roster_id) REFERENCES student_roster(id)
);

-- 4. 预填名录数据（基于 HTML 名单，共 40 人）
-- year_code=2006 (2006届), seat_code=MM NN (班号+座位号)
-- 这里使用示例数据结构，实际名字需替换为真实班级名单

INSERT OR IGNORE INTO student_roster (real_name, year_code, seat_code) VALUES
  ('张伟',   '2006', '0301'),
  ('王芳',   '2006', '0302'),
  ('李明',   '2006', '0303'),
  ('刘洋',   '2006', '0304'),
  ('陈静',   '2006', '0305'),
  ('杨磊',   '2006', '0306'),
  ('赵丽',   '2006', '0307'),
  ('黄鑫',   '2006', '0308'),
  ('周娟',   '2006', '0309'),
  ('吴强',   '2006', '0310'),
  ('徐丹',   '2006', '0311'),
  ('孙超',   '2006', '0312'),
  ('马燕',   '2006', '0313'),
  ('朱波',   '2006', '0314'),
  ('胡婷',   '2006', '0315'),
  ('郭辉',   '2006', '0316'),
  ('何雪',   '2006', '0317'),
  ('高峰',   '2006', '0318'),
  ('梁琳',   '2006', '0319'),
  ('郑刚',   '2006', '0320'),
  ('谢颖',   '2006', '0321'),
  ('宋涛',   '2006', '0322'),
  ('唐雨',   '2006', '0323'),
  ('许浩',   '2006', '0324'),
  ('邓霞',   '2006', '0325'),
  ('冯阳',   '2006', '0326'),
  ('曹敏',   '2006', '0327'),
  ('彭宇',   '2006', '0328'),
  ('蒋蕾',   '2006', '0329'),
  ('韩军',   '2006', '0330'),
  ('秦云',   '2006', '0331'),
  ('程华',   '2006', '0332'),
  ('沈晨',   '2006', '0333'),
  ('卢倩',   '2006', '0334'),
  ('叶凯',   '2006', '0335'),
  ('方莉',   '2006', '0336'),
  ('宁博',   '2006', '0337'),
  ('魏玲',   '2006', '0338'),
  ('薛鹏',   '2006', '0339'),
  ('江雅',   '2006', '0340');

-- 5. 安全问题配置表（统一三道题）
CREATE TABLE IF NOT EXISTS security_questions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  question  TEXT NOT NULL,                -- 问题文本
  answer_hash TEXT NOT NULL,             -- SHA-256 of 答案（全小写，去首尾空格）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 预填三道统一安全问题（答案需由管理员在 Dashboard 直接更新 answer_hash 字段）
-- 此处 answer_hash 为占位符，管理员需在部署后手动更新
INSERT OR IGNORE INTO security_questions (id, question, answer_hash) VALUES
  (1, '我们的班主任叫什么名字？',   'REPLACE_WITH_SHA256_OF_TEACHER_NAME'),
  (2, '我们的数学老师叫什么名字？', 'REPLACE_WITH_SHA256_OF_MATH_TEACHER'),
  (3, '我们的班级在几楼？',         'REPLACE_WITH_SHA256_OF_FLOOR_NUMBER');
