-- Migration: 012_update_composite_keys_triple_deduplication.sql
-- 目的：
-- 改变三张表的去重策略，使用三字段组合唯一约束
-- account_id + platform_user_id + platform_id (去重)
-- 这样可以支持：
-- 1. 同一账户多个平台用户的独立数据
-- 2. 同一平台用户在不同账户下的独立数据
-- 3. 完整的数据隔离和去重

-- ============================================
-- 1. COMMENTS 表迁移
-- ============================================

DROP TABLE IF EXISTS comments_new;

CREATE TABLE comments_new (
  id TEXT PRIMARY KEY,                -- UUID 主键
  account_id TEXT NOT NULL,
  platform_user_id TEXT,              -- 平台用户ID
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

  -- 三字段组合唯一约束：account_id + platform_user_id + platform_comment_id
  UNIQUE(account_id, platform_user_id, platform_comment_id),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 迁移数据
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
CREATE INDEX IF NOT EXISTS idx_comments_account_platform_user_platform_comment ON comments(account_id, platform_user_id, platform_comment_id);

-- ============================================
-- 2. DIRECT_MESSAGES 表迁移
-- ============================================

DROP TABLE IF EXISTS direct_messages_new;

CREATE TABLE direct_messages_new (
  id TEXT PRIMARY KEY,                -- UUID 主键
  account_id TEXT NOT NULL,
  platform_user_id TEXT,              -- 平台用户ID
  platform_message_id TEXT,
  content TEXT NOT NULL,
  sender_name TEXT,
  sender_id TEXT,
  direction TEXT NOT NULL,
  is_read BOOLEAN DEFAULT 0,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  conversation_id TEXT,

  -- 三字段组合唯一约束：account_id + platform_user_id + platform_message_id
  UNIQUE(account_id, platform_user_id, platform_message_id),

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
CREATE INDEX IF NOT EXISTS idx_dm_account_platform_user_platform_message ON direct_messages(account_id, platform_user_id, platform_message_id);

-- ============================================
-- 3. DOUYIN_VIDEOS 表迁移
-- ============================================

DROP TABLE IF EXISTS douyin_videos_new;

CREATE TABLE douyin_videos_new (
  id TEXT PRIMARY KEY,                -- UUID 主键
  platform_videos_id TEXT NOT NULL,   -- 平台视频ID (aweme_id)
  account_id TEXT NOT NULL,
  platform_user_id TEXT,              -- 平台用户ID

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

  -- 三字段组合唯一约束：account_id + platform_user_id + platform_videos_id
  UNIQUE(account_id, platform_user_id, platform_videos_id)
);

-- 迁移数据：生成新的 UUID
INSERT INTO douyin_videos_new (
  id, platform_videos_id, account_id, platform_user_id, title, cover, publish_time,
  total_comment_count, new_comment_count, like_count, share_count, play_count,
  last_crawl_time, crawl_status, crawl_error, created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))),  -- 生成新的 UUID
  platform_videos_id,
  account_id,
  platform_user_id,
  title, cover, publish_time,
  total_comment_count, new_comment_count, like_count, share_count, play_count,
  last_crawl_time, crawl_status, crawl_error, created_at, updated_at
FROM douyin_videos;

-- 删除旧表的索引和触发器
DROP TRIGGER IF EXISTS update_douyin_videos_timestamp;
DROP INDEX IF EXISTS idx_douyin_videos_account_id;
DROP INDEX IF EXISTS idx_douyin_videos_platform_videos_id;
DROP INDEX IF EXISTS idx_douyin_videos_id;
DROP INDEX IF EXISTS idx_douyin_videos_last_crawl_time;
DROP INDEX IF EXISTS idx_douyin_videos_platform_user_id;
DROP INDEX IF EXISTS idx_douyin_videos_account_platform_videos_id;

-- 删除旧表
DROP TABLE IF EXISTS douyin_videos;

-- 重命名新表
ALTER TABLE douyin_videos_new RENAME TO douyin_videos;

-- 创建新索引
CREATE INDEX IF NOT EXISTS idx_douyin_videos_account_id ON douyin_videos(account_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_platform_videos_id ON douyin_videos(platform_videos_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_last_crawl_time ON douyin_videos(last_crawl_time);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_platform_user_id ON douyin_videos(platform_user_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_account_platform_user_platform_videos ON douyin_videos(account_id, platform_user_id, platform_videos_id);

-- 创建触发器：自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS update_douyin_videos_timestamp
AFTER UPDATE ON douyin_videos
FOR EACH ROW
BEGIN
  UPDATE douyin_videos SET updated_at = strftime('%s', 'now')
  WHERE id = NEW.id;
END;
