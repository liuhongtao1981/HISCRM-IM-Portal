-- 社交媒体监控系统 - 主控数据库Schema (真实监控版本)
-- Database: master.db
-- Version: 2.0.0 (Real Implementation)
-- Changes: 添加登录管理、Worker上下文、代理支持

-- ============================================
-- 8. login_sessions - 登录会话表
-- ============================================
CREATE TABLE IF NOT EXISTS login_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  qr_code_data TEXT,              -- Base64 二维码图片
  qr_code_url TEXT,                -- 抖音二维码 URL
  status TEXT NOT NULL,            -- pending | scanning | success | failed | expired
  login_method TEXT DEFAULT 'qrcode',  -- qrcode | password | cookie
  expires_at INTEGER,              -- 二维码过期时间
  logged_in_at INTEGER,            -- 登录成功时间
  error_message TEXT,              -- 错误信息
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_status ON login_sessions(status);
CREATE INDEX IF NOT EXISTS idx_login_sessions_worker ON login_sessions(worker_id);
CREATE INDEX IF NOT EXISTS idx_login_sessions_account ON login_sessions(account_id);

-- ============================================
-- 9. worker_contexts - Worker 浏览器上下文表
-- ============================================
CREATE TABLE IF NOT EXISTS worker_contexts (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL UNIQUE,
  account_id TEXT,
  browser_id TEXT,                 -- Playwright 浏览器实例 ID
  context_id TEXT,                 -- Playwright 上下文 ID
  cookies_path TEXT,               -- Cookies 存储路径
  storage_state_path TEXT,         -- localStorage/sessionStorage 路径
  user_agent TEXT,                 -- 浏览器 UA
  viewport TEXT,                   -- 视口大小 JSON: {"width": 1920, "height": 1080}
  proxy_config TEXT,               -- 代理配置 JSON
  is_logged_in BOOLEAN DEFAULT 0,
  last_activity INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_contexts_logged_in ON worker_contexts(is_logged_in);
CREATE INDEX IF NOT EXISTS idx_worker_contexts_account ON worker_contexts(account_id);

-- ============================================
-- 10. proxies - 代理配置表
-- ============================================
CREATE TABLE IF NOT EXISTS proxies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  server TEXT NOT NULL,            -- proxy-server:port (例如: 127.0.0.1:8080)
  protocol TEXT NOT NULL,          -- http | https | socks5
  username TEXT,
  password TEXT,                   -- 加密存储
  country TEXT,                    -- 代理所在国家
  city TEXT,                       -- 代理所在城市
  status TEXT NOT NULL DEFAULT 'active',  -- active | inactive | failed
  assigned_worker_id TEXT,
  last_check_time INTEGER,         -- 最后健康检查时间
  success_rate REAL DEFAULT 1.0,   -- 成功率 (0.0 - 1.0)
  response_time INTEGER,           -- 平均响应时间 (ms)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(server),
  FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_proxies_status ON proxies(status);
CREATE INDEX IF NOT EXISTS idx_proxies_worker ON proxies(assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_proxies_country ON proxies(country);

-- ============================================
-- ALTER TABLE: accounts - 添加代理关联
-- ============================================
-- 说明：为 accounts 表添加 proxy_id 字段，关联到 proxies 表
-- 在现有数据库上执行：ALTER TABLE accounts ADD COLUMN proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL;

-- 在新数据库中，请在创建 accounts 表时包含此字段：
-- accounts 表应包含字段：proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL
