-- 迁移脚本: 从 Mock 版本升级到真实实现版本
-- Version: 1.0.0 -> 2.0.0
-- Date: 2025-10-11

-- ============================================
-- Step 1: 修改 accounts 表 - 添加登录相关字段
-- ============================================

-- 添加登录状态字段
-- 可选值: not_logged_in | pending_login | logged_in | login_failed | expired
ALTER TABLE accounts ADD COLUMN login_status TEXT DEFAULT 'not_logged_in';

-- 添加最后登录时间
ALTER TABLE accounts ADD COLUMN last_login_time INTEGER;

-- 添加 Cookies 有效期
ALTER TABLE accounts ADD COLUMN cookies_valid_until INTEGER;

-- 添加登录方法
ALTER TABLE accounts ADD COLUMN login_method TEXT DEFAULT 'qrcode';

-- ============================================
-- Step 2: 修改 workers 表 - 添加代理和浏览器配置
-- ============================================

-- 添加代理ID字段
ALTER TABLE workers ADD COLUMN proxy_id TEXT;

-- 添加浏览器类型
ALTER TABLE workers ADD COLUMN browser_type TEXT DEFAULT 'chromium';

-- 添加是否无头模式
ALTER TABLE workers ADD COLUMN headless BOOLEAN DEFAULT 1;

-- 添加Worker能力标签 (JSON)
ALTER TABLE workers ADD COLUMN capabilities TEXT DEFAULT '["douyin"]';

-- 添加最大并发账户数
ALTER TABLE workers ADD COLUMN max_accounts INTEGER DEFAULT 5;

-- ============================================
-- Step 3: 创建新表 (通过执行 schema-v2.sql 创建)
-- ============================================

-- 这些表将通过 schema-v2.sql 文件创建：
-- - login_sessions
-- - worker_contexts
-- - proxies

-- ============================================
-- Step 4: 创建索引
-- ============================================

CREATE INDEX IF NOT EXISTS idx_accounts_login_status ON accounts(login_status);
CREATE INDEX IF NOT EXISTS idx_workers_proxy ON workers(proxy_id);

-- ============================================
-- Step 5: 数据迁移
-- ============================================

-- 更新所有现有账户的登录状态为 not_logged_in
UPDATE accounts
SET login_status = 'not_logged_in',
    login_method = 'qrcode'
WHERE login_status IS NULL;

-- 更新所有现有 Worker 的浏览器配置
UPDATE workers
SET browser_type = 'chromium',
    headless = 1,
    capabilities = '["douyin"]',
    max_accounts = 5
WHERE browser_type IS NULL;

-- ============================================
-- Step 6: 插入测试数据 (可选)
-- ============================================

-- 插入示例代理配置
-- INSERT INTO proxies (id, name, server, protocol, status, created_at, updated_at)
-- VALUES (
--   'proxy-001',
--   'Test Proxy',
--   '127.0.0.1:8080',
--   'http',
--   'active',
--   strftime('%s', 'now'),
--   strftime('%s', 'now')
-- );
