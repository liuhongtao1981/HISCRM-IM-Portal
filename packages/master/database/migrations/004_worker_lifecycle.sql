-- Worker 生命周期管理系统数据库迁移
-- 版本: 004
-- 日期: 2025-01-14

-- ============================================
-- Worker 配置表
-- ============================================
CREATE TABLE IF NOT EXISTS worker_configs (
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

CREATE INDEX IF NOT EXISTS idx_worker_configs_worker_id ON worker_configs(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_configs_enabled ON worker_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_worker_configs_deployment_type ON worker_configs(deployment_type);

-- ============================================
-- Worker 运行时状态表
-- ============================================
CREATE TABLE IF NOT EXISTS worker_runtime (
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

CREATE INDEX IF NOT EXISTS idx_worker_runtime_worker_id ON worker_runtime(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_runtime_status ON worker_runtime(status);
CREATE INDEX IF NOT EXISTS idx_worker_runtime_config_id ON worker_runtime(config_id);

-- ============================================
-- Worker 日志表
-- ============================================
CREATE TABLE IF NOT EXISTS worker_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id TEXT NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error', 'debug')),
    category TEXT NOT NULL CHECK(category IN ('lifecycle', 'task', 'system', 'error')),
    message TEXT NOT NULL,
    details TEXT,
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_logs_worker_id ON worker_logs(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_logs_timestamp ON worker_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_worker_logs_level ON worker_logs(level);
CREATE INDEX IF NOT EXISTS idx_worker_logs_category ON worker_logs(category);

-- ============================================
-- 兼容性：更新现有 workers 表（如果需要）
-- ============================================
-- 注意：现有的 workers 表将继续用于 Worker 注册信息
-- worker_configs 表用于管理 Worker 配置
-- worker_runtime 表用于跟踪运行时状态
