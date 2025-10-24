-- HisCRM-IM Master Database Schema
-- Generated from current master.db
-- Generated at: 2025-10-23T07:20:09.374Z
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
  total_works INTEGER DEFAULT 0,
  total_followers INTEGER DEFAULT 0,
  total_following INTEGER DEFAULT 0,
  recent_comments_count INTEGER DEFAULT 0,
  recent_works_count INTEGER DEFAULT 0,

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
-- Table: comments
-- ============================================================================
CREATE TABLE "comments" (
  id TEXT PRIMARY KEY,                -- UUID 主键
  account_id TEXT NOT NULL,
  platform_user_id TEXT,              -- 平台用户ID
  platform_comment_id TEXT,
  content TEXT NOT NULL,
  author_name TEXT,
  author_id TEXT,
  author_avatar TEXT,
  post_id TEXT,
  post_title TEXT,
  is_read BOOLEAN DEFAULT 0,
  is_new BOOLEAN DEFAULT 1,
  push_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,

  -- 三字段组合唯一约束：account_id + platform_user_id + platform_comment_id
  UNIQUE(account_id, platform_user_id, platform_comment_id),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_account ON comments(account_id);
CREATE INDEX idx_comments_read ON comments(is_read);
CREATE INDEX idx_comments_detected ON comments(detected_at);
CREATE INDEX idx_comments_platform_user ON comments(platform_user_id);
CREATE INDEX idx_comments_account_platform_user_platform_comment ON comments(account_id, platform_user_id, platform_comment_id);
CREATE INDEX idx_comments_like_count ON comments(like_count);

-- ============================================================================
-- Table: conversations
-- ============================================================================
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  platform_user_name TEXT,
  platform_user_avatar TEXT,
  is_group BOOLEAN DEFAULT 0,
  is_pinned BOOLEAN DEFAULT 0,
  is_muted BOOLEAN DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  platform_message_id TEXT,
  last_message_time INTEGER,
  last_message_content TEXT,
  last_message_type TEXT DEFAULT 'text',
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, platform_user_id)
);

CREATE INDEX idx_conversations_account ON conversations(account_id);
CREATE INDEX idx_conversations_user ON conversations(platform_user_id);
CREATE INDEX idx_conversations_updated ON conversations(updated_at);
CREATE INDEX idx_conversations_unread ON conversations(unread_count);
CREATE INDEX idx_conversations_pinned ON conversations(is_pinned);
CREATE INDEX idx_conversations_status ON conversations(status);

-- ============================================================================
-- Table: direct_messages
-- ============================================================================
CREATE TABLE "direct_messages" (
  id TEXT PRIMARY KEY,                -- UUID 主键
  account_id TEXT NOT NULL,
  platform_user_id TEXT,              -- 平台用户ID
  platform_message_id TEXT,
  content TEXT NOT NULL,
  platform_sender_id TEXT,
  platform_sender_name TEXT,
  platform_receiver_id TEXT,
  platform_receiver_name TEXT,
  sender_name TEXT DEFAULT NULL,
  -- ✅ 新增：发送者头像和昵称字段
  sender_avatar TEXT,                 -- 发送者头像URL
  sender_nickname TEXT,               -- 发送者昵称
  message_type TEXT DEFAULT 'text',
  direction TEXT NOT NULL,
  conversation_id TEXT,
  is_read BOOLEAN DEFAULT 0,
  is_new BOOLEAN DEFAULT 1,
  is_deleted BOOLEAN DEFAULT 0,
  is_recalled BOOLEAN DEFAULT 0,
  push_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'sent',
  reply_to_message_id TEXT,
  media_url TEXT,
  media_thumbnail TEXT,
  file_size INTEGER,
  file_name TEXT,
  duration INTEGER,
  recalled_at INTEGER,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,

  -- 三字段组合唯一约束：account_id + platform_user_id + platform_message_id
  UNIQUE(account_id, platform_user_id, platform_message_id),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_dm_account ON direct_messages(account_id);
CREATE INDEX idx_dm_conversation ON direct_messages(conversation_id);
CREATE INDEX idx_dm_read ON direct_messages(is_read);
CREATE INDEX idx_dm_detected ON direct_messages(detected_at);
CREATE INDEX idx_dm_created ON direct_messages(created_at);
CREATE INDEX idx_dm_platform_id ON direct_messages(platform_message_id);
CREATE INDEX idx_dm_platform_user ON direct_messages(platform_user_id);
CREATE INDEX idx_dm_account_platform_user_platform_message ON direct_messages(account_id, platform_user_id, platform_message_id);
CREATE INDEX idx_direct_messages_sender_name ON direct_messages(sender_name);
CREATE INDEX idx_dm_status ON direct_messages(status);
CREATE INDEX idx_dm_reply_to ON direct_messages(reply_to_message_id);
CREATE INDEX idx_dm_deleted ON direct_messages(is_deleted);

-- ============================================================================
-- Table: discussions
-- ============================================================================
CREATE TABLE discussions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_user_id TEXT,
        platform_discussion_id TEXT,

        -- 关联到父评论
        parent_comment_id TEXT NOT NULL,

        -- 讨论内容
        content TEXT NOT NULL,
        author_name TEXT,
        author_id TEXT,
        author_avatar TEXT,

        -- 关联作品信息
        work_id TEXT,
        post_id TEXT,
        post_title TEXT,

        -- 状态
        is_read BOOLEAN DEFAULT 0,
        is_new BOOLEAN DEFAULT 1,
        push_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,

        -- 时间戳
        detected_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,

        -- 三字段组合唯一约束
        UNIQUE(account_id, platform_user_id, platform_discussion_id),

        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE SET NULL
      );

CREATE INDEX idx_discussions_account ON discussions(account_id);
CREATE INDEX idx_discussions_platform ON discussions(platform);
CREATE INDEX idx_discussions_parent_comment ON discussions(parent_comment_id);
CREATE INDEX idx_discussions_work ON discussions(work_id);
CREATE INDEX idx_discussions_read ON discussions(is_read);
CREATE INDEX idx_discussions_is_new ON discussions(is_new);
CREATE INDEX idx_discussions_detected ON discussions(detected_at);
CREATE INDEX idx_discussions_platform_user ON discussions(platform_user_id);
CREATE INDEX idx_discussions_account_platform_user_platform_discussion ON discussions(account_id, platform_user_id, platform_discussion_id);

-- ============================================================================
-- Table: douyin_videos
-- ============================================================================
CREATE TABLE "douyin_videos" (
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

  -- 状态标记
  is_new BOOLEAN DEFAULT 1,
  push_count INTEGER DEFAULT 0,

  -- 时间戳
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

  -- 三字段组合唯一约束：account_id + platform_user_id + platform_videos_id
  UNIQUE(account_id, platform_user_id, platform_videos_id)
);

CREATE INDEX idx_douyin_videos_account_id ON douyin_videos(account_id);
CREATE INDEX idx_douyin_videos_platform_videos_id ON douyin_videos(platform_videos_id);
CREATE INDEX idx_douyin_videos_last_crawl_time ON douyin_videos(last_crawl_time);
CREATE INDEX idx_douyin_videos_platform_user_id ON douyin_videos(platform_user_id);
CREATE INDEX idx_douyin_videos_account_platform_user_platform_videos ON douyin_videos(account_id, platform_user_id, platform_videos_id);

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
-- Table: notification_rules
-- ============================================================================
CREATE TABLE notification_rules (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  rule_type TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_rules_enabled ON notification_rules(enabled);

-- ============================================================================
-- Table: notifications
-- ============================================================================
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  account_id TEXT,
  related_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  data TEXT,
  is_sent BOOLEAN DEFAULT 0,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX idx_notifications_sent ON notifications(is_sent);
CREATE INDEX idx_notifications_created ON notifications(created_at);

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

-- ============================================================================
-- Table: works
-- ============================================================================
CREATE TABLE works (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_work_id TEXT NOT NULL,
        platform_user_id TEXT,

        -- 作品类型和信息
        work_type TEXT NOT NULL CHECK(work_type IN ('video', 'article', 'image', 'audio', 'text')),
        title TEXT,
        description TEXT,
        cover TEXT,
        url TEXT,
        publish_time INTEGER,

        -- 统计信息
        total_comment_count INTEGER DEFAULT 0,
        new_comment_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        view_count INTEGER DEFAULT 0,

        -- 爬取状态
        last_crawl_time INTEGER,
        crawl_status TEXT DEFAULT 'pending',
        crawl_error TEXT,

        -- 标记
        is_new BOOLEAN DEFAULT 1,
        push_count INTEGER DEFAULT 0,

        -- 时间戳
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,

        -- 三字段组合唯一约束
        UNIQUE(account_id, platform, platform_work_id),

        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

CREATE INDEX idx_works_account ON works(account_id);
CREATE INDEX idx_works_platform ON works(platform);
CREATE INDEX idx_works_platform_work ON works(platform_work_id);
CREATE INDEX idx_works_last_crawl ON works(last_crawl_time);
CREATE INDEX idx_works_platform_user ON works(platform_user_id);
CREATE INDEX idx_works_work_type ON works(work_type);
CREATE INDEX idx_works_is_new ON works(is_new);
CREATE INDEX idx_works_account_platform_work ON works(account_id, platform, platform_work_id);

