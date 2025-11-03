/**
 * 数据库迁移: 添加 read_at 字段和未读查询索引
 * 版本: v1.1
 * 日期: 2025-11-03
 * 用途: Master 数据已读状态处理功能
 */

-- ============================================================================
-- 1. comments 表添加 read_at 字段
-- ============================================================================

-- 检查字段是否已存在
PRAGMA table_info(comments);

-- 添加已读时间戳字段
ALTER TABLE comments ADD COLUMN read_at INTEGER DEFAULT NULL;

-- 创建索引优化未读查询（复合索引）
CREATE INDEX IF NOT EXISTS idx_comments_unread
  ON comments(account_id, is_read, detected_at DESC);

-- 创建覆盖索引（包含 read_at）
CREATE INDEX IF NOT EXISTS idx_comments_read_status
  ON comments(account_id, is_read, read_at);

-- ============================================================================
-- 2. direct_messages 表添加 read_at 字段
-- ============================================================================

-- 检查字段是否已存在
PRAGMA table_info(direct_messages);

-- 添加已读时间戳字段
ALTER TABLE direct_messages ADD COLUMN read_at INTEGER DEFAULT NULL;

-- 创建索引优化未读查询（复合索引）
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON direct_messages(account_id, is_read, detected_at DESC);

-- 创建覆盖索引（包含 read_at）
CREATE INDEX IF NOT EXISTS idx_messages_read_status
  ON direct_messages(account_id, is_read, read_at);

-- ============================================================================
-- 3. 验证迁移结果
-- ============================================================================

-- 验证 comments 表
SELECT
  'comments' as table_name,
  COUNT(*) as column_count
FROM pragma_table_info('comments')
WHERE name = 'read_at';

-- 验证 direct_messages 表
SELECT
  'direct_messages' as table_name,
  COUNT(*) as column_count
FROM pragma_table_info('direct_messages')
WHERE name = 'read_at';

-- 验证索引
SELECT
  name,
  tbl_name,
  sql
FROM sqlite_master
WHERE type = 'index'
  AND (name LIKE '%unread%' OR name LIKE '%read_status%')
ORDER BY tbl_name, name;

-- ============================================================================
-- 4. 数据迁移（可选）
-- ============================================================================

-- 如果需要，可以将已标记为已读的旧数据设置一个默认时间戳
-- 注意：这会将所有已读消息的 read_at 设置为迁移时间

-- UPDATE comments
-- SET read_at = strftime('%s', 'now')
-- WHERE is_read = 1 AND read_at IS NULL;

-- UPDATE direct_messages
-- SET read_at = strftime('%s', 'now')
-- WHERE is_read = 1 AND read_at IS NULL;

-- ============================================================================
-- 迁移完成
-- ============================================================================
