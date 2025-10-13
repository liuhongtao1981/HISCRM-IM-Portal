-- 代理支持迁移脚本
-- 执行命令: sqlite3 data/master.db < src/database/migrate-proxy.sql

-- 1. 创建 proxies 表（如果不存在）
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

-- 2. 为 accounts 表添加 proxy_id 字段
-- 注意：SQLite 不支持 ALTER TABLE ADD COLUMN WITH FOREIGN KEY，所以我们分两步
-- 首先添加列
ALTER TABLE accounts ADD COLUMN proxy_id TEXT;

-- 然后我们需要在应用层处理外键约束

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_accounts_proxy ON accounts(proxy_id);

-- 4. 插入测试代理数据（可选）
INSERT OR IGNORE INTO proxies (
  id, name, server, protocol, status,
  created_at, updated_at
) VALUES (
  'proxy-test-001',
  'Test HTTP Proxy',
  '127.0.0.1:8080',
  'http',
  'active',
  strftime('%s', 'now'),
  strftime('%s', 'now')
);

-- 完成
SELECT 'Migration completed successfully.' AS result;
