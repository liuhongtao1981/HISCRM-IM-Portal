-- Migration: 009_use_aweme_id_as_primary_key.sql
-- 修改 douyin_videos 表，使用 aweme_id 作为主键
-- 这样与 comments 和 direct_messages 表的设计保持一致
-- 确保每个平台视频在数据库中只有一条记录

-- 先删除旧的临时表（如果存在）
DROP TABLE IF EXISTS douyin_videos_new;

-- 创建临时表（新结构，aweme_id 作为主键）
CREATE TABLE douyin_videos_new (
  aweme_id TEXT PRIMARY KEY,          -- 抖音作品ID（主键）
  account_id TEXT NOT NULL,           -- 账户关联

  -- 作品信息
  title TEXT,                         -- 作品标题
  cover TEXT,                         -- 封面图URL
  publish_time TEXT,                  -- 发布时间（文本）

  -- 统计信息
  total_comment_count INTEGER DEFAULT 0,  -- 总评论数
  new_comment_count INTEGER DEFAULT 0,    -- 新评论数（自上次爬取）
  like_count INTEGER DEFAULT 0,           -- 点赞数
  share_count INTEGER DEFAULT 0,          -- 分享数
  play_count INTEGER DEFAULT 0,           -- 播放数

  -- 爬取状态
  last_crawl_time INTEGER,            -- 最后爬取时间（秒级时间戳）
  crawl_status TEXT DEFAULT 'pending', -- 爬取状态: pending/crawling/completed/failed
  crawl_error TEXT,                   -- 爬取错误信息

  -- 时间戳
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  platform_user_id TEXT               -- 平台用户ID
);

-- 迁移数据：从旧表复制到新表（保留每个 aweme_id 的最新记录）
INSERT OR IGNORE INTO douyin_videos_new (
  aweme_id, account_id, title, cover, publish_time,
  total_comment_count, new_comment_count, like_count, share_count, play_count,
  last_crawl_time, crawl_status, crawl_error, created_at, updated_at, platform_user_id
)
SELECT
  aweme_id, account_id, title, cover, publish_time,
  total_comment_count, new_comment_count, like_count, share_count, play_count,
  last_crawl_time, crawl_status, crawl_error, created_at, updated_at, platform_user_id
FROM douyin_videos;

-- 删除旧表的索引和触发器
DROP TRIGGER IF EXISTS update_douyin_videos_timestamp;
DROP INDEX IF EXISTS idx_douyin_videos_account_id;
DROP INDEX IF EXISTS idx_douyin_videos_aweme_id;
DROP INDEX IF EXISTS idx_douyin_videos_last_crawl_time;

-- 删除旧表
DROP TABLE IF EXISTS douyin_videos;

-- 重命名新表
ALTER TABLE douyin_videos_new RENAME TO douyin_videos;

-- 创建新的索引
CREATE INDEX IF NOT EXISTS idx_douyin_videos_account_id ON douyin_videos(account_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_aweme_id ON douyin_videos(aweme_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_last_crawl_time ON douyin_videos(last_crawl_time);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_platform_user_id ON douyin_videos(platform_user_id);

-- 创建新的触发器
CREATE TRIGGER IF NOT EXISTS update_douyin_videos_timestamp
AFTER UPDATE ON douyin_videos
FOR EACH ROW
BEGIN
  UPDATE douyin_videos SET updated_at = strftime('%s', 'now')
  WHERE aweme_id = NEW.aweme_id;
END;
