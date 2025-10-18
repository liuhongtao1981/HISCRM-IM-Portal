-- 社交媒体监控系统 - 主控数据库Schema
-- Database: master.db
-- Version: 1.0.0

-- ============================================
-- 1. accounts - 社交媒体账户表
-- ============================================
CREATE TABLE IF NOT EXISTS accounts (
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
  UNIQUE(platform, account_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_login_status ON accounts(login_status);
CREATE INDEX IF NOT EXISTS idx_accounts_worker ON accounts(assigned_worker_id);

-- ============================================
-- 2. comments - 评论表
-- ============================================
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
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
  push_count INTEGER DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_account ON comments(account_id);
CREATE INDEX IF NOT EXISTS idx_comments_read ON comments(is_read);
CREATE INDEX IF NOT EXISTS idx_comments_detected ON comments(detected_at);

-- ============================================
-- 3. direct_messages - 私信表
-- ============================================
CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform_message_id TEXT,
  content TEXT NOT NULL,
  sender_name TEXT,
  sender_id TEXT,
  direction TEXT NOT NULL,
  is_read BOOLEAN DEFAULT 0,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  is_new BOOLEAN DEFAULT 1,
  push_count INTEGER DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dm_account ON direct_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_dm_read ON direct_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_dm_detected ON direct_messages(detected_at);

-- ============================================
-- 4. notifications - 通知队列表
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
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

CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications(is_sent);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- ============================================
-- 5. workers - Worker节点注册表
-- ============================================
CREATE TABLE IF NOT EXISTS workers (
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

CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);

-- ============================================
-- 6. client_sessions - 客户端会话表
-- ============================================
CREATE TABLE IF NOT EXISTS client_sessions (
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

CREATE INDEX IF NOT EXISTS idx_sessions_status ON client_sessions(status);

-- ============================================
-- 7. notification_rules - 通知规则表
-- ============================================
CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  rule_type TEXT NOT NULL,
  config TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rules_enabled ON notification_rules(enabled);

-- ============================================
-- 8. login_sessions - 登录会话表
-- ============================================
CREATE TABLE IF NOT EXISTS login_sessions (
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

CREATE INDEX IF NOT EXISTS idx_login_sessions_status ON login_sessions(status);
CREATE INDEX IF NOT EXISTS idx_login_sessions_account ON login_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_created ON login_sessions(created_at);

-- ============================================
-- 9. proxies - 代理服务器表
-- ============================================
CREATE TABLE IF NOT EXISTS proxies (
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

CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
CREATE INDEX IF NOT EXISTS idx_proxies_country ON proxies(country);
CREATE INDEX IF NOT EXISTS idx_proxies_protocol ON proxies(protocol);
