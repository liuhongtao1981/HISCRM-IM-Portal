-- Migration: 008_add_platform_user_id.sql
-- 为所有表添加平台用户ID，用于区分同一账号登录的不同平台用户

-- ============================================
-- 1. 更新 accounts 表
-- ============================================
-- 添加平台用户ID和昵称（用于当前登录的平台账号）
ALTER TABLE accounts ADD COLUMN platform_user_id TEXT;
ALTER TABLE accounts ADD COLUMN platform_username TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_accounts_platform_user ON accounts(platform_user_id);

-- ============================================
-- 2. 更新 comments 表
-- ============================================
-- 添加平台用户ID（该评论属于哪个平台账号）
ALTER TABLE comments ADD COLUMN platform_user_id TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_comments_platform_user ON comments(platform_user_id);

-- 创建复合索引（账号+平台用户）
CREATE INDEX IF NOT EXISTS idx_comments_account_platform_user ON comments(account_id, platform_user_id);

-- ============================================
-- 3. 更新 direct_messages 表
-- ============================================
-- 添加平台用户ID（该私信属于哪个平台账号）
ALTER TABLE direct_messages ADD COLUMN platform_user_id TEXT;

-- 添加会话ID（用于关联会话）
ALTER TABLE direct_messages ADD COLUMN conversation_id TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_dm_platform_user ON direct_messages(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(conversation_id);

-- 创建复合索引
CREATE INDEX IF NOT EXISTS idx_dm_account_platform_user ON direct_messages(account_id, platform_user_id);

-- ============================================
-- 4. 更新 douyin_videos 表
-- ============================================
-- 添加平台用户ID（该作品属于哪个平台账号）
ALTER TABLE douyin_videos ADD COLUMN platform_user_id TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_videos_platform_user ON douyin_videos(platform_user_id);

-- 创建复合索引
CREATE INDEX IF NOT EXISTS idx_videos_account_platform_user ON douyin_videos(account_id, platform_user_id);

-- 更新唯一约束（aweme_id 应该在 platform_user_id 范围内唯一）
-- 注意：SQLite 不支持删除约束，所以我们创建一个新的复合唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_platform_aweme ON douyin_videos(platform_user_id, aweme_id);

-- ============================================
-- 5. 更新 notifications 表
-- ============================================
-- 添加平台用户ID（该通知属于哪个平台账号）
ALTER TABLE notifications ADD COLUMN platform_user_id TEXT;
ALTER TABLE notifications ADD COLUMN priority TEXT DEFAULT 'normal';

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_notifications_platform_user ON notifications(platform_user_id);
