-- HisCRM-IM Master Database Schema
-- Generated from current master.db
-- Generated at: 2025-11-03T03:57:29.251Z
-- Total tables: 18

-- ============================================================================
-- Table: accounts
-- ============================================================================
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_id TEXT NOT NULL,
  credentials TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  login_status TEXT DEFAULT 'not_logged_in',
  monitor_interval INTEGER DEFAULT 30,
  last_check_time INTEGER,
  last_login_time INTEGER,
  cookies_valid_until INTEGER,
  assigned_worker_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- 用户信息字段
  user_info TEXT,
  fingerprint TEXT,
  platform_user_id TEXT,
  platform_username TEXT,
  avatar TEXT,
  signature TEXT,
  verified BOOLEAN DEFAULT 0,

  -- 统计信息字段
  total_comments INTEGER DEFAULT 0,
  total_contents INTEGER DEFAULT 0,
  total_followers INTEGER DEFAULT 0,
  total_following INTEGER DEFAULT 0,
  recent_comments_count INTEGER DEFAULT 0,
  recent_contents_count INTEGER DEFAULT 0,

  -- Worker状态字段
  worker_status TEXT DEFAULT 'offline',
  last_crawl_time INTEGER,
  last_heartbeat_time INTEGER,
  error_count INTEGER DEFAULT 0,
  last_error_message TEXT,

  UNIQUE(platform, account_id)
);

CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_login_status ON accounts(login_status);
CREATE INDEX idx_accounts_worker ON accounts(assigned_worker_id);
CREATE INDEX idx_accounts_platform_account ON accounts(platform, account_id);
CREATE INDEX idx_accounts_platform_user ON accounts(platform_user_id);

-- ============================================================================
-- Table: cache_comments
-- ============================================================================
CREATE TABLE cache_comments (
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
, read_at INTEGER DEFAULT NULL, is_read INTEGER DEFAULT 0);

CREATE INDEX idx_cache_comments_account_id
  ON cache_comments(account_id);
CREATE INDEX idx_cache_comments_content_id
  ON cache_comments(content_id);
CREATE INDEX idx_cache_comments_created_at
  ON cache_comments(created_at DESC);
CREATE INDEX idx_cache_comments_persist_at
  ON cache_comments(persist_at DESC);
CREATE UNIQUE INDEX idx_cache_comments_unique
  ON cache_comments(account_id, id);
CREATE INDEX idx_cache_comments_account_created
  ON cache_comments(account_id, created_at DESC);
CREATE INDEX idx_cache_comments_unread ON cache_comments(account_id, is_read, created_at DESC);

-- ============================================================================
-- Table: cache_contents
-- ============================================================================
CREATE TABLE cache_contents (
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

CREATE INDEX idx_cache_contents_account_id
  ON cache_contents(account_id);
CREATE INDEX idx_cache_contents_publish_time
  ON cache_contents(publish_time DESC);
CREATE INDEX idx_cache_contents_persist_at
  ON cache_contents(persist_at DESC);
CREATE UNIQUE INDEX idx_cache_contents_unique
  ON cache_contents(account_id, id);
CREATE INDEX idx_cache_contents_account_publish
  ON cache_contents(account_id, publish_time DESC);

-- ============================================================================
-- Table: cache_conversations
-- ============================================================================
CREATE TABLE cache_conversations (
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

CREATE INDEX idx_cache_conversations_account_id
  ON cache_conversations(account_id);
CREATE INDEX idx_cache_conversations_user_id
  ON cache_conversations(user_id);
CREATE INDEX idx_cache_conversations_last_message_time
  ON cache_conversations(last_message_time DESC);
CREATE INDEX idx_cache_conversations_persist_at
  ON cache_conversations(persist_at DESC);
CREATE UNIQUE INDEX idx_cache_conversations_unique
  ON cache_conversations(account_id, id);
CREATE INDEX idx_cache_conversations_account_last_message
  ON cache_conversations(account_id, last_message_time DESC);

-- ============================================================================
-- Table: cache_messages
-- ============================================================================
CREATE TABLE cache_messages (
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
, read_at INTEGER DEFAULT NULL, is_read INTEGER DEFAULT 0);

CREATE INDEX idx_cache_messages_account_id
  ON cache_messages(account_id);
CREATE INDEX idx_cache_messages_conversation_id
  ON cache_messages(conversation_id);
CREATE INDEX idx_cache_messages_created_at
  ON cache_messages(created_at DESC);
CREATE INDEX idx_cache_messages_persist_at
  ON cache_messages(persist_at DESC);
CREATE UNIQUE INDEX idx_cache_messages_unique
  ON cache_messages(account_id, id);
CREATE INDEX idx_cache_messages_conversation_created
  ON cache_messages(conversation_id, created_at DESC);
CREATE INDEX idx_cache_messages_account_created
  ON cache_messages(account_id, created_at DESC);
CREATE INDEX idx_cache_messages_unread ON cache_messages(account_id, is_read, created_at DESC);

-- ============================================================================
-- Table: cache_metadata
-- ============================================================================
CREATE TABLE cache_metadata (
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

CREATE INDEX idx_cache_metadata_account_id
  ON cache_metadata(account_id);
CREATE INDEX idx_cache_metadata_last_persist
  ON cache_metadata(last_persist);
CREATE INDEX idx_cache_metadata_platform
  ON cache_metadata(platform);

-- ============================================================================
-- Table: cache_notifications
-- ============================================================================
CREATE TABLE cache_notifications (
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

CREATE INDEX idx_cache_notifications_account_id
  ON cache_notifications(account_id);
CREATE INDEX idx_cache_notifications_created_at
  ON cache_notifications(created_at DESC);
CREATE INDEX idx_cache_notifications_persist_at
  ON cache_notifications(persist_at DESC);
CREATE UNIQUE INDEX idx_cache_notifications_unique
  ON cache_notifications(account_id, id);
CREATE INDEX idx_cache_notifications_account_created
  ON cache_notifications(account_id, created_at DESC);

-- ============================================================================
-- Table: client_sessions
-- ============================================================================
CREATE TABLE client_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  device_type TEXT NOT NULL,
  device_name TEXT,
  socket_id TEXT,
  status TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  connected_at INTEGER NOT NULL,
  UNIQUE(device_id)
);

CREATE INDEX idx_sessions_status ON client_sessions(status);

-- ============================================================================
-- Table: login_sessions
-- ============================================================================
CREATE TABLE login_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  worker_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  login_method TEXT NOT NULL DEFAULT 'qrcode',
  qr_code_data TEXT,
  qr_code_url TEXT,
  error_message TEXT,
  expires_at INTEGER NOT NULL,
  logged_in_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_login_sessions_status ON login_sessions(status);
CREATE INDEX idx_login_sessions_account ON login_sessions(account_id);
CREATE INDEX idx_login_sessions_created ON login_sessions(created_at);

-- ============================================================================
-- Table: proxies
-- ============================================================================
CREATE TABLE proxies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  server TEXT NOT NULL,
  protocol TEXT NOT NULL,
  username TEXT,
  password TEXT,
  country TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  success_rate REAL DEFAULT 1.0,
  last_check_time INTEGER,
  response_time INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(server)
);

CREATE INDEX idx_proxies_status ON proxies(status);
CREATE INDEX idx_proxies_country ON proxies(country);
CREATE INDEX idx_proxies_protocol ON proxies(protocol);

-- ============================================================================
-- Table: replies
-- ============================================================================
CREATE TABLE replies (
  -- 主键和幂等性
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT,

  -- 身份信息（三维标识）
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  -- 平台特定字段
  platform_target_id TEXT,
  video_id TEXT,
  user_id TEXT,

  -- 回复内容
  reply_content TEXT NOT NULL,

  -- 状态管理
  reply_status TEXT NOT NULL DEFAULT 'pending',
  submitted_count INTEGER DEFAULT 1,

  -- Worker 追踪
  assigned_worker_id TEXT,
  worker_platform TEXT,

  -- 时间戳（防延迟关键）
  first_submitted_at INTEGER NOT NULL,
  last_submitted_at INTEGER NOT NULL,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- 错误信息
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- 结果
  platform_reply_id TEXT,
  reply_data TEXT,

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_replies_request_id ON replies(request_id);
CREATE INDEX idx_replies_idempotency_key ON replies(idempotency_key);
CREATE INDEX idx_replies_account ON replies(account_id);
CREATE INDEX idx_replies_worker ON replies(assigned_worker_id);
CREATE INDEX idx_replies_platform ON replies(platform);
CREATE INDEX idx_replies_status ON replies(reply_status);
CREATE INDEX idx_replies_target ON replies(target_type, target_id);
CREATE INDEX idx_replies_created ON replies(created_at);
CREATE INDEX idx_replies_executed ON replies(executed_at);

-- ============================================================================
-- Table: sqlite_sequence
-- ============================================================================
CREATE TABLE sqlite_sequence(name,seq);

-- ============================================================================
-- Table: sqlite_stat1
-- ============================================================================
CREATE TABLE sqlite_stat1(tbl,idx,stat);

-- ============================================================================
-- Table: sqlite_stat4
-- ============================================================================
CREATE TABLE sqlite_stat4(tbl,idx,neq,nlt,ndlt,sample);

-- ============================================================================
-- Table: worker_configs
-- ============================================================================
CREATE TABLE worker_configs (
    id TEXT PRIMARY KEY,
    worker_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,

    -- 部署配置
    deployment_type TEXT NOT NULL CHECK(deployment_type IN ('local', 'remote', 'docker', 'k8s')),
    host TEXT NOT NULL,
    port INTEGER DEFAULT 4001,

    -- 进程配置
    max_accounts INTEGER DEFAULT 10,
    max_memory_mb INTEGER DEFAULT 2048,
    cpu_cores INTEGER DEFAULT 2,

    -- 环境配置
    env_variables TEXT,
    command_args TEXT,
    working_directory TEXT,

    -- 代理配置
    proxy_id TEXT,
    browser_config TEXT,

    -- 自动管理
    auto_start BOOLEAN DEFAULT 1,
    auto_restart BOOLEAN DEFAULT 1,
    restart_delay_ms INTEGER DEFAULT 5000,
    max_restart_attempts INTEGER DEFAULT 3,

    -- SSH配置 (远程部署)
    ssh_host TEXT,
    ssh_port INTEGER DEFAULT 22,
    ssh_user TEXT,
    ssh_key_path TEXT,
    ssh_password TEXT,

    -- Docker配置
    docker_image TEXT,
    docker_network TEXT,
    docker_volumes TEXT,

    -- 状态
    enabled BOOLEAN DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (proxy_id) REFERENCES proxies(id) ON DELETE SET NULL
);

CREATE INDEX idx_worker_configs_worker_id ON worker_configs(worker_id);
CREATE INDEX idx_worker_configs_enabled ON worker_configs(enabled);
CREATE INDEX idx_worker_configs_deployment_type ON worker_configs(deployment_type);

-- ============================================================================
-- Table: worker_logs
-- ============================================================================
CREATE TABLE worker_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error', 'debug')),
    category TEXT NOT NULL CHECK(category IN ('lifecycle', 'task', 'system', 'error')),
    message TEXT NOT NULL,
    details TEXT,
    timestamp INTEGER NOT NULL
);

CREATE INDEX idx_worker_logs_worker_id ON worker_logs(worker_id);
CREATE INDEX idx_worker_logs_timestamp ON worker_logs(timestamp);
CREATE INDEX idx_worker_logs_level ON worker_logs(level);
CREATE INDEX idx_worker_logs_category ON worker_logs(category);

-- ============================================================================
-- Table: worker_runtime
-- ============================================================================
CREATE TABLE worker_runtime (
    id TEXT PRIMARY KEY,
    worker_id TEXT UNIQUE NOT NULL,
    config_id TEXT NOT NULL,

    -- 进程信息
    process_id INTEGER,
    container_id TEXT,
    pod_name TEXT,

    -- 运行状态
    status TEXT NOT NULL CHECK(status IN ('stopped', 'starting', 'running', 'stopping', 'error', 'crashed')),
    started_at INTEGER,
    stopped_at INTEGER,
    last_heartbeat INTEGER,

    -- 性能指标
    cpu_usage REAL DEFAULT 0,
    memory_usage_mb INTEGER DEFAULT 0,
    assigned_accounts INTEGER DEFAULT 0,
    active_tasks INTEGER DEFAULT 0,

    -- 错误处理
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    restart_count INTEGER DEFAULT 0,
    last_restart_at INTEGER,

    -- 版本信息
    worker_version TEXT,
    node_version TEXT,

    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (config_id) REFERENCES worker_configs(id) ON DELETE CASCADE
);

CREATE INDEX idx_worker_runtime_worker_id ON worker_runtime(worker_id);
CREATE INDEX idx_worker_runtime_status ON worker_runtime(status);
CREATE INDEX idx_worker_runtime_config_id ON worker_runtime(config_id);

-- ============================================================================
-- Table: workers
-- ============================================================================
CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  status TEXT NOT NULL,
  assigned_accounts INTEGER DEFAULT 0,
  last_heartbeat INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  version TEXT,
  metadata TEXT
);

CREATE INDEX idx_workers_status ON workers(status);

