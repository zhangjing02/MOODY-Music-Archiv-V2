-- 004_create_app_settings.sql
-- 应用全局配置表（用于动态首页切片流、系统全局参数等）

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);
