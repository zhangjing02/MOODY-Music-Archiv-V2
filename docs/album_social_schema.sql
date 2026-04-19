-- ============================================================
-- MOODY Music — Album Social Feature Schema
-- Target: Supabase (PostgreSQL)
-- Execute in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 确保 uuid 扩展已启用（Supabase 默认已启用）
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────
-- 1. 主表：专辑评论（主贴 + 回复统一存储）
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS album_comments (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    album_id   VARCHAR     NOT NULL,          -- 对应 D1 中 albums.id（字符串形式 "db_123"）
    user_id    UUID        NOT NULL,          -- 对应 Supabase Auth 的 uid（UUID）
    class_id   VARCHAR     NOT NULL,          -- 班级标识，来自 D1 student_roster.year_code
    content    TEXT        NOT NULL,
    parent_id  UUID        REFERENCES album_comments(id) ON DELETE CASCADE,
    root_id    UUID        REFERENCES album_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────
-- 2. 核心约束：每张专辑每个班级只允许一条根帖
--    条件唯一索引：仅对 parent_id IS NULL 的行生效
-- ──────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS one_root_post_per_class_idx
    ON album_comments (album_id, class_id)
    WHERE parent_id IS NULL;

-- ──────────────────────────────────────────
-- 3. 查询性能索引
-- ──────────────────────────────────────────

-- 按专辑 + 班级快速定位根帖
CREATE INDEX IF NOT EXISTS idx_album_comments_album_class
    ON album_comments (album_id, class_id);

-- 按 root_id 快速拉取某条主贴下的全部回复
CREATE INDEX IF NOT EXISTS idx_album_comments_root_id
    ON album_comments (root_id)
    WHERE root_id IS NOT NULL;

-- ──────────────────────────────────────────
-- 4. Row Level Security (RLS)
--    开启 RLS，使用 service_role key 绕过（Worker 已使用 service key）
--    公开读；写入需要 user_id 匹配当前 session 的 auth.uid()
-- ──────────────────────────────────────────
ALTER TABLE album_comments ENABLE ROW LEVEL SECURITY;

-- 所有人可读（含游客），因为 Worker 用 service_role 读，RLS 不影响 Worker
-- 若未来想让前端直接查询，可放开 SELECT
CREATE POLICY "public read" ON album_comments
    FOR SELECT USING (true);

-- 只有 user_id == auth.uid() 才能写（Worker 用 service_role 时绕过此策略）
CREATE POLICY "authenticated insert" ON album_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 只允许作者删除自己的评论
CREATE POLICY "author delete" ON album_comments
    FOR DELETE USING (auth.uid() = user_id);

-- ──────────────────────────────────────────
-- 5. 验证：确认索引和约束已生效
-- ──────────────────────────────────────────
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'album_comments';

-- ──────────────────────────────────────────
-- 回滚脚本（如需撤销）
-- ──────────────────────────────────────────
-- DROP TABLE IF EXISTS album_comments CASCADE;
