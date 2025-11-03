-- ============================================================================
-- 迁移脚本: 为 cache_comments 和 cache_messages 表添加已读状态字段
-- ============================================================================
-- 版本: v1.0
-- 创建时间: 2025-11-03
-- 说明: 添加 is_read 和 read_at 字段以支持已读状态处理
-- ============================================================================

-- 为 cache_comments 表添加已读字段
ALTER TABLE cache_comments ADD COLUMN is_read INTEGER DEFAULT 0;
ALTER TABLE cache_comments ADD COLUMN read_at INTEGER DEFAULT NULL;

-- 为 cache_messages 表添加已读字段
ALTER TABLE cache_messages ADD COLUMN is_read INTEGER DEFAULT 0;
ALTER TABLE cache_messages ADD COLUMN read_at INTEGER DEFAULT NULL;

-- 创建索引优化未读查询
CREATE INDEX IF NOT EXISTS idx_cache_comments_unread
  ON cache_comments(account_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cache_messages_unread
  ON cache_messages(account_id, is_read, created_at DESC);

-- ============================================================================
-- 验证
-- ============================================================================
-- 执行后验证:
-- PRAGMA table_info(cache_comments);
-- PRAGMA table_info(cache_messages);
-- 应该看到 is_read 和 read_at 字段
