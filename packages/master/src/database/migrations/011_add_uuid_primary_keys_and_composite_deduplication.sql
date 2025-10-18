-- Migration: 011_add_uuid_primary_keys_and_composite_deduplication.sql
-- 目的：
-- 1. 改变三张表的主键策略：从平台ID改为UUID
-- 2. 添加组合唯一约束：(account_id + platform_id) 用于去重
-- 3. 这样主键稳定，去重考虑账户维度，支持重登录场景

-- ============================================
-- 1. COMMENTS 表迁移
-- ============================================

-- 创建新表结构
CREATE TABLE comments_new (
  id TEXT PRIMARY KEY,                -- 主键：UUID
  account_id TEXT NOT NULL,
  platform_comment_id TEXT,
  content TEXT NOT NULL,
  author_name TEXT,
  author_id TEXT,
  post_id TEXT,
  post_title TEXT,
  is_read BOOLEAN DEFAULT 0,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  is_new BOOLEAN DEFAULT 1,
  platform_user_id TEXT,

  -- 唯一约束：同一账户内，同一平台评论ID只能有一条
  UNIQUE(account_id, platform_comment_id),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 迁移数据：使用 id 作为 UUID（已有）
INSERT INTO comments_new
SELECT * FROM comments;

-- 删除旧索引
DROP INDEX IF EXISTS idx_comments_account;
DROP INDEX IF EXISTS idx_comments_read;
DROP INDEX IF EXISTS idx_comments_detected;
DROP INDEX IF EXISTS idx_comments_platform_user;
DROP INDEX IF EXISTS idx_comments_account_platform_user;

-- 删除旧表
DROP TABLE IF EXISTS comments;

-- 重命名新表
ALTER TABLE comments_new RENAME TO comments;

-- 创建新索引
CREATE INDEX IF NOT EXISTS idx_comments_account ON comments(account_id);
CREATE INDEX IF NOT EXISTS idx_comments_read ON comments(is_read);
CREATE INDEX IF NOT EXISTS idx_comments_detected ON comments(detected_at);
CREATE INDEX IF NOT EXISTS idx_comments_platform_user ON comments(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_comments_account_platform_user ON comments(account_id, platform_user_id);

-- ============================================
-- 2. DIRECT_MESSAGES 表迁移
-- ============================================

CREATE TABLE direct_messages_new (
  id TEXT PRIMARY KEY,                -- 主键：UUID
  account_id TEXT NOT NULL,
  platform_message_id TEXT,
  content TEXT NOT NULL,
  sender_name TEXT,
  sender_id TEXT,
  direction TEXT NOT NULL,
  is_read BOOLEAN DEFAULT 0,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  platform_user_id TEXT,
  conversation_id TEXT,

  -- 唯一约束：同一账户内，同一平台消息ID只能有一条
  UNIQUE(account_id, platform_message_id),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 迁移数据
INSERT INTO direct_messages_new
SELECT * FROM direct_messages;

-- 删除旧索引
DROP INDEX IF EXISTS idx_dm_account;
DROP INDEX IF EXISTS idx_dm_read;
DROP INDEX IF EXISTS idx_dm_detected;
DROP INDEX IF EXISTS idx_dm_platform_user;
DROP INDEX IF EXISTS idx_dm_conversation;
DROP INDEX IF EXISTS idx_dm_account_platform_user;

-- 删除旧表
DROP TABLE IF EXISTS direct_messages;

-- 重命名新表
ALTER TABLE direct_messages_new RENAME TO direct_messages;

-- 创建新索引
CREATE INDEX IF NOT EXISTS idx_dm_account ON direct_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_dm_read ON direct_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_dm_detected ON direct_messages(detected_at);
CREATE INDEX IF NOT EXISTS idx_dm_platform_user ON direct_messages(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_account_platform_user ON direct_messages(account_id, platform_user_id);

-- ============================================
-- 3. DOUYIN_VIDEOS 表迁移
-- ============================================

CREATE TABLE douyin_videos_new (
  id TEXT PRIMARY KEY,                -- 主键：UUID
  platform_videos_id TEXT NOT NULL,   -- 平台视频ID
  account_id TEXT NOT NULL,

  -- 作品信息
  title TEXT,
  cover TEXT,
  publish_time TEXT,

  -- 统计信息
  total_comment_count INTEGER DEFAULT 0,
  new_comment_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,

  -- 爬取状态
  last_crawl_time INTEGER,
  crawl_status TEXT DEFAULT 'pending',
  crawl_error TEXT,

  -- 时间戳
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  platform_user_id TEXT,

  -- 唯一约束：同一账户内，同一平台视频ID只能有一条
  UNIQUE(account_id, platform_videos_id)
);

-- 迁移数据：生成新的 UUID 作为主键
-- 这样老数据也会重新分配 UUID，确保无冲突
INSERT INTO douyin_videos_new (
  id, platform_videos_id, account_id, title, cover, publish_time,
  total_comment_count, new_comment_count, like_count, share_count, play_count,
  last_crawl_time, crawl_status, crawl_error, created_at, updated_at, platform_user_id
)
SELECT
  lower(hex(randomblob(16))),  -- 生成新的 UUID
  platform_videos_id,
  account_id, title, cover, publish_time,
  total_comment_count, new_comment_count, like_count, share_count, play_count,
  last_crawl_time, crawl_status, crawl_error, created_at, updated_at, platform_user_id
FROM douyin_videos;

-- 删除旧表的索引和触发器
DROP TRIGGER IF EXISTS update_douyin_videos_timestamp;
DROP INDEX IF EXISTS idx_douyin_videos_account_id;
DROP INDEX IF EXISTS idx_douyin_videos_platform_videos_id;
DROP INDEX IF EXISTS idx_douyin_videos_id;
DROP INDEX IF EXISTS idx_douyin_videos_last_crawl_time;
DROP INDEX IF EXISTS idx_douyin_videos_platform_user_id;

-- 删除旧表
DROP TABLE IF EXISTS douyin_videos;

-- 重命名新表
ALTER TABLE douyin_videos_new RENAME TO douyin_videos;

-- 创建新索引
CREATE INDEX IF NOT EXISTS idx_douyin_videos_account_id ON douyin_videos(account_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_platform_videos_id ON douyin_videos(platform_videos_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_last_crawl_time ON douyin_videos(last_crawl_time);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_platform_user_id ON douyin_videos(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_account_platform_videos_id ON douyin_videos(account_id, platform_videos_id);

-- 创建触发器：自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS update_douyin_videos_timestamp
AFTER UPDATE ON douyin_videos
FOR EACH ROW
BEGIN
  UPDATE douyin_videos SET updated_at = strftime('%s', 'now')
  WHERE id = NEW.id;
END;
