-- 用户系统迁移
-- 删除旧表（无生产数据）
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS users;

-- 用户资料表（密码由 Supabase 管理，D1 不存密码）
CREATE TABLE user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supabase_uid TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  level INTEGER DEFAULT 1,
  role TEXT DEFAULT 'user',
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_user_profiles_supabase_uid ON user_profiles(supabase_uid);
CREATE INDEX idx_user_profiles_username ON user_profiles(username);

-- 用户设置表
CREATE TABLE user_settings (
  user_id INTEGER PRIMARY KEY,
  last_volume REAL DEFAULT 0.5,
  theme_mode TEXT DEFAULT 'dark',
  auto_play INTEGER DEFAULT 1,
  FOREIGN KEY(user_id) REFERENCES user_profiles(id)
);
