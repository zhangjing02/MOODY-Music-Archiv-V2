-- 003_add_session_kickout.sql
-- 支持移动端互踢逻辑的数据库变更

-- 在 user_profiles 中增加字段记录最新的 Android 设备信息
-- last_android_device_id: 存储最近一次登录的 Android 设备唯一标识
-- last_android_session_at: 存储最近一次 Android 登录的时间

ALTER TABLE user_profiles ADD COLUMN last_android_device_id TEXT;
ALTER TABLE user_profiles ADD COLUMN last_android_session_at DATETIME;
