-- 音乐专辑评论表 (基于 Supabase)
-- 建议在 Supabase SQL Editor 中执行

CREATE TABLE IF NOT EXISTS album_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    album_id VARCHAR NOT NULL,       -- 对应 D1 中的专辑 ID
    user_id UUID NOT NULL,          -- 对应 Supabase auth.users.id (D1 中的 supabase_uid)
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 索引优化
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_album_comments_album_id ON album_comments(album_id);
CREATE INDEX idx_album_comments_created_at ON album_comments(created_at DESC);

-- 启用行级安全 (RLS)
ALTER TABLE album_comments ENABLE ROW LEVEL SECURITY;

-- 策略 1: 所有人都可以查看评论
CREATE POLICY "Allow public read access" ON album_comments
    FOR SELECT USING (true);

-- 策略 2: 只有已认证用户可以发表评论
CREATE POLICY "Allow authenticated insert" ON album_comments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 策略 3: 只有用户自己可以删除自己的评论
CREATE POLICY "Allow individual delete" ON album_comments
    FOR DELETE USING (auth.uid() = user_id);
