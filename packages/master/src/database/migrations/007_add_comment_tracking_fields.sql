-- Migration: 007_add_comment_tracking_fields.sql
-- 为评论表添加增量抓取和追踪字段

-- 添加 is_new 字段（是否新评论）
ALTER TABLE comments ADD COLUMN is_new BOOLEAN DEFAULT 1;

-- 添加 first_detected_at 字段（首次发现时间）
ALTER TABLE comments ADD COLUMN first_detected_at INTEGER DEFAULT (strftime('%s', 'now'));

-- 添加 post_cover 字段（作品封面，方便展示）
ALTER TABLE comments ADD COLUMN post_cover TEXT;

-- 添加 like_count 字段（点赞数）
ALTER TABLE comments ADD COLUMN like_count INTEGER DEFAULT 0;

-- 添加 reply_to_comment_id 字段（回复的评论ID）
ALTER TABLE comments ADD COLUMN reply_to_comment_id TEXT;

-- 添加 ip_label 字段（IP属地）
ALTER TABLE comments ADD COLUMN ip_label TEXT;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_comments_is_new ON comments(is_new);
CREATE INDEX IF NOT EXISTS idx_comments_first_detected_at ON comments(first_detected_at);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
