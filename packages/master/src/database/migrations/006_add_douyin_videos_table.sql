-- Migration: 006_add_douyin_videos_table.sql
-- 创建抖音作品表，用于追踪作品和评论关系，实现增量抓取

CREATE TABLE IF NOT EXISTS douyin_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 账户关联
  account_id TEXT NOT NULL,

  -- 作品信息
  aweme_id TEXT NOT NULL UNIQUE,          -- 抖音作品ID（唯一）
  title TEXT,                              -- 作品标题
  cover TEXT,                              -- 封面图URL
  publish_time TEXT,                       -- 发布时间（文本，如"2025年10月16日 21:03"）

  -- 统计信息
  total_comment_count INTEGER DEFAULT 0,  -- 总评论数
  new_comment_count INTEGER DEFAULT 0,    -- 新评论数（自上次爬取）
  like_count INTEGER DEFAULT 0,           -- 点赞数
  share_count INTEGER DEFAULT 0,          -- 分享数
  play_count INTEGER DEFAULT 0,           -- 播放数

  -- 爬取状态
  last_crawl_time INTEGER,                -- 最后爬取时间（秒级时间戳）
  crawl_status TEXT DEFAULT 'pending',    -- 爬取状态: pending/crawling/completed/failed
  crawl_error TEXT,                       -- 爬取错误信息

  -- 时间戳
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_douyin_videos_account_id ON douyin_videos(account_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_aweme_id ON douyin_videos(aweme_id);
CREATE INDEX IF NOT EXISTS idx_douyin_videos_last_crawl_time ON douyin_videos(last_crawl_time);

-- 创建触发器，自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS update_douyin_videos_timestamp
AFTER UPDATE ON douyin_videos
FOR EACH ROW
BEGIN
  UPDATE douyin_videos SET updated_at = strftime('%s', 'now')
  WHERE id = NEW.id;
END;
