-- ============================================================================
-- Master Cache Schema - 数据持久化缓存表
-- ============================================================================
-- 版本: v1.0
-- 创建时间: 2025-11-03
-- 说明: 用于持久化 DataStore 内存数据,结构与内存对象完全一致
--
-- 设计原则:
-- 1. 表名统一前缀: cache_
-- 2. 数据存储在 JSON 字段中,与内存对象完全一致,零转换
-- 3. 独立的元数据字段用于索引和查询
-- 4. 支持批量 UPSERT (INSERT OR REPLACE)
-- ============================================================================

-- ============================================================================
-- 元数据表
-- ============================================================================

-- cache_metadata: 账户元数据和统计信息
CREATE TABLE IF NOT EXISTS cache_metadata (
  -- 主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 账户信息
  account_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,

  -- 时间戳 (秒级 UNIX 时间戳)
  last_update INTEGER NOT NULL,           -- 内存最后更新时间
  last_persist INTEGER NOT NULL,          -- 最后持久化时间
  last_load INTEGER,                      -- 最后加载时间

  -- 数据统计
  comments_count INTEGER DEFAULT 0,
  contents_count INTEGER DEFAULT 0,
  conversations_count INTEGER DEFAULT 0,
  messages_count INTEGER DEFAULT 0,
  notifications_count INTEGER DEFAULT 0,

  -- 元数据
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cache_metadata_account_id
  ON cache_metadata(account_id);

CREATE INDEX IF NOT EXISTS idx_cache_metadata_last_persist
  ON cache_metadata(last_persist);

CREATE INDEX IF NOT EXISTS idx_cache_metadata_platform
  ON cache_metadata(platform);

-- 自动更新 updated_at 触发器
CREATE TRIGGER IF NOT EXISTS update_cache_metadata_timestamp
AFTER UPDATE ON cache_metadata
FOR EACH ROW
BEGIN
  UPDATE cache_metadata SET updated_at = strftime('%s', 'now')
  WHERE id = NEW.id;
END;

-- ============================================================================
-- 数据缓存表
-- ============================================================================

-- cache_comments: 评论缓存表
CREATE TABLE IF NOT EXISTS cache_comments (
  -- 主键 (与内存 Map key 一致)
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,
  content_id TEXT,

  -- 评论数据 (JSON - 与内存对象完全一致)
  -- 结构: { id, contentId, accountId, platform, authorId, authorName,
  --         authorAvatar, content, createdAt, isNew, status, ... }
  data TEXT NOT NULL,

  -- 元数据 (用于查询和过期清理)
  created_at INTEGER NOT NULL,            -- 评论创建时间 (业务时间,毫秒)
  updated_at INTEGER NOT NULL,            -- 记录更新时间 (毫秒)
  persist_at INTEGER NOT NULL             -- 持久化时间 (毫秒)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cache_comments_account_id
  ON cache_comments(account_id);

CREATE INDEX IF NOT EXISTS idx_cache_comments_content_id
  ON cache_comments(content_id);

CREATE INDEX IF NOT EXISTS idx_cache_comments_created_at
  ON cache_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cache_comments_persist_at
  ON cache_comments(persist_at DESC);

-- 唯一约束 (account_id + id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_comments_unique
  ON cache_comments(account_id, id);

-- 复合索引 (加速分页查询)
CREATE INDEX IF NOT EXISTS idx_cache_comments_account_created
  ON cache_comments(account_id, created_at DESC);

-- ============================================================================

-- cache_contents: 作品缓存表
CREATE TABLE IF NOT EXISTS cache_contents (
  -- 主键
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,

  -- 作品数据 (JSON)
  -- 结构: { id, accountId, platform, type, title, description, coverUrl,
  --         videoUrl, publishTime, viewCount, likeCount, commentCount,
  --         shareCount, status, ... }
  data TEXT NOT NULL,

  -- 元数据
  publish_time INTEGER NOT NULL,          -- 发布时间 (业务时间,毫秒)
  updated_at INTEGER NOT NULL,            -- 记录更新时间 (毫秒)
  persist_at INTEGER NOT NULL             -- 持久化时间 (毫秒)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cache_contents_account_id
  ON cache_contents(account_id);

CREATE INDEX IF NOT EXISTS idx_cache_contents_publish_time
  ON cache_contents(publish_time DESC);

CREATE INDEX IF NOT EXISTS idx_cache_contents_persist_at
  ON cache_contents(persist_at DESC);

-- 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_contents_unique
  ON cache_contents(account_id, id);

-- 复合索引
CREATE INDEX IF NOT EXISTS idx_cache_contents_account_publish
  ON cache_contents(account_id, publish_time DESC);

-- ============================================================================

-- cache_conversations: 会话缓存表
CREATE TABLE IF NOT EXISTS cache_conversations (
  -- 主键
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  -- 会话数据 (JSON)
  -- 结构: { id, conversationId, accountId, platform, type, userId, userName,
  --         userAvatar, unreadCount, lastMessageContent, lastMessageTime,
  --         lastMessageType, status, isPinned, isMuted, ... }
  data TEXT NOT NULL,

  -- 元数据
  last_message_time INTEGER,              -- 最后消息时间 (业务时间,毫秒)
  updated_at INTEGER NOT NULL,            -- 记录更新时间 (毫秒)
  persist_at INTEGER NOT NULL             -- 持久化时间 (毫秒)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cache_conversations_account_id
  ON cache_conversations(account_id);

CREATE INDEX IF NOT EXISTS idx_cache_conversations_user_id
  ON cache_conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_cache_conversations_last_message_time
  ON cache_conversations(last_message_time DESC);

CREATE INDEX IF NOT EXISTS idx_cache_conversations_persist_at
  ON cache_conversations(persist_at DESC);

-- 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_conversations_unique
  ON cache_conversations(account_id, id);

-- 复合索引
CREATE INDEX IF NOT EXISTS idx_cache_conversations_account_last_message
  ON cache_conversations(account_id, last_message_time DESC);

-- ============================================================================

-- cache_messages: 私信缓存表
CREATE TABLE IF NOT EXISTS cache_messages (
  -- 主键
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,

  -- 消息数据 (JSON)
  -- 结构: { id, conversationId, accountId, platform, senderId, senderName,
  --         senderAvatar, receiverId, content, messageType, createdAt,
  --         isNew, isRead, status, ... }
  data TEXT NOT NULL,

  -- 元数据
  created_at INTEGER NOT NULL,            -- 消息创建时间 (业务时间,毫秒)
  updated_at INTEGER NOT NULL,            -- 记录更新时间 (毫秒)
  persist_at INTEGER NOT NULL             -- 持久化时间 (毫秒)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cache_messages_account_id
  ON cache_messages(account_id);

CREATE INDEX IF NOT EXISTS idx_cache_messages_conversation_id
  ON cache_messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_cache_messages_created_at
  ON cache_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cache_messages_persist_at
  ON cache_messages(persist_at DESC);

-- 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_messages_unique
  ON cache_messages(account_id, id);

-- 复合索引 (加速会话消息查询)
CREATE INDEX IF NOT EXISTS idx_cache_messages_conversation_created
  ON cache_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cache_messages_account_created
  ON cache_messages(account_id, created_at DESC);

-- ============================================================================

-- cache_notifications: 通知缓存表
CREATE TABLE IF NOT EXISTS cache_notifications (
  -- 主键
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,

  -- 通知数据 (JSON)
  -- 结构: { id, accountId, platform, type, title, content, relatedId,
  --         relatedType, isRead, createdAt, ... }
  data TEXT NOT NULL,

  -- 元数据
  created_at INTEGER NOT NULL,            -- 通知创建时间 (业务时间,毫秒)
  updated_at INTEGER NOT NULL,            -- 记录更新时间 (毫秒)
  persist_at INTEGER NOT NULL             -- 持久化时间 (毫秒)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_cache_notifications_account_id
  ON cache_notifications(account_id);

CREATE INDEX IF NOT EXISTS idx_cache_notifications_created_at
  ON cache_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cache_notifications_persist_at
  ON cache_notifications(persist_at DESC);

-- 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_notifications_unique
  ON cache_notifications(account_id, id);

-- 复合索引
CREATE INDEX IF NOT EXISTS idx_cache_notifications_account_created
  ON cache_notifications(account_id, created_at DESC);

-- ============================================================================
-- 性能优化
-- ============================================================================

-- WAL 模式 (Write-Ahead Logging) - 提升并发性能
PRAGMA journal_mode = WAL;

-- 同步模式 - 平衡安全性和性能
PRAGMA synchronous = NORMAL;

-- 缓存大小 - 增加内存缓存 (默认 -2000 = 2MB, 设置为 -20000 = 20MB)
PRAGMA cache_size = -20000;

-- 临时文件存储在内存中
PRAGMA temp_store = MEMORY;

-- 页面大小 (4KB,适合现代文件系统)
PRAGMA page_size = 4096;

-- ============================================================================
-- 统计信息
-- ============================================================================

-- 分析表,优化查询计划
ANALYZE;

-- ============================================================================
-- 版本记录
-- ============================================================================

-- v1.0 (2025-11-03)
-- - 初始版本
-- - 6 个缓存表: metadata, comments, contents, conversations, messages, notifications
-- - 完整的索引优化
-- - 与内存结构完全一致的 JSON 存储
