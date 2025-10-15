# Worker 生命周期管理系统设计文档

> 版本: 1.0.0
> 日期: 2025-01-14
> 作者: System Architect

## 1. 概述

### 1.1 现状分析

**当前架构问题**：
- Worker 主动连接 Master，不受 Master 控制
- 无法远程启动/停止 Worker
- 无法集中管理 Worker 配置
- Worker 故障需要人工干预
- 缺少 Worker 资源调度能力

### 1.2 目标架构

**核心改进**：
- Master 成为 Worker 的生命周期管理者
- 支持远程启动、停止、重启 Worker
- 集中式配置管理
- 自动故障恢复
- 动态资源调度

## 2. 架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                      Master Service                      │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐          │
│  │  Worker Manager  │    │  Config Manager  │          │
│  │  - Create        │    │  - Store configs │          │
│  │  - Start/Stop    │    │  - Validate      │          │
│  │  - Monitor       │    │  - Distribute    │          │
│  └──────────────────┘    └──────────────────┘          │
│                                                          │
│  ┌──────────────────┐    ┌──────────────────┐          │
│  │ Process Manager  │    │   Scheduler      │          │
│  │  - Spawn process │    │  - Auto-scale    │          │
│  │  - Kill process  │    │  - Load balance  │          │
│  │  - Health check  │    │  - Failover      │          │
│  └──────────────────┘    └──────────────────┘          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │           Worker Agent                 │
        │  - Receive commands                    │
        │  - Report status                       │
        │  - Execute tasks                       │
        └───────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 Worker Manager (Master端)
负责 Worker 的完整生命周期管理：
- 创建 Worker 配置
- 启动/停止 Worker 进程
- 监控 Worker 状态
- 处理 Worker 故障

#### 2.2.2 Process Manager (Master端)
负责进程级别的管理：
- 本地进程：使用 Node.js child_process 模块
- 远程进程：通过 SSH 或 Worker Agent
- Docker 容器：通过 Docker API
- Kubernetes Pod：通过 K8s API

#### 2.2.3 Config Manager (Master端)
集中管理 Worker 配置：
- 存储 Worker 配置到数据库
- 配置版本控制
- 配置模板管理
- 环境变量管理

#### 2.2.4 Worker Agent (Worker端)
轻量级守护进程，负责：
- 接收 Master 命令
- 启动/停止实际的 Worker 进程
- 收集和上报状态
- 自动重启故障进程

## 3. 数据模型设计

### 3.1 Worker配置表 (worker_configs)

```sql
CREATE TABLE worker_configs (
    id TEXT PRIMARY KEY,
    worker_id TEXT UNIQUE NOT NULL,  -- 如 worker-1, worker-2
    name TEXT NOT NULL,               -- 友好名称
    description TEXT,

    -- 部署配置
    deployment_type TEXT NOT NULL,    -- 'local', 'remote', 'docker', 'k8s'
    host TEXT NOT NULL,               -- 运行主机 IP/域名
    port INTEGER DEFAULT 4001,        -- Worker 端口

    -- 进程配置
    max_accounts INTEGER DEFAULT 10,  -- 最大账户数
    max_memory_mb INTEGER DEFAULT 2048, -- 内存限制
    cpu_cores INTEGER DEFAULT 2,      -- CPU 核心数

    -- 环境配置
    env_variables TEXT,               -- JSON 格式环境变量
    command_args TEXT,                -- 启动参数
    working_directory TEXT,           -- 工作目录

    -- 代理配置
    proxy_id TEXT,                    -- 关联的代理 ID
    browser_config TEXT,              -- 浏览器配置 JSON

    -- 自动管理
    auto_start BOOLEAN DEFAULT true,  -- 自动启动
    auto_restart BOOLEAN DEFAULT true,-- 自动重启
    restart_delay_ms INTEGER DEFAULT 5000, -- 重启延迟
    max_restart_attempts INTEGER DEFAULT 3, -- 最大重启次数

    -- SSH配置 (远程部署)
    ssh_host TEXT,
    ssh_port INTEGER DEFAULT 22,
    ssh_user TEXT,
    ssh_key_path TEXT,                -- SSH 私钥路径
    ssh_password TEXT,                -- 或使用密码

    -- Docker配置
    docker_image TEXT,                -- Docker 镜像
    docker_network TEXT,              -- Docker 网络
    docker_volumes TEXT,              -- 挂载卷 JSON

    -- 状态
    enabled BOOLEAN DEFAULT true,     -- 是否启用
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,

    FOREIGN KEY (proxy_id) REFERENCES proxies(id) ON DELETE SET NULL
);
```

### 3.2 Worker运行时表 (worker_runtime)

```sql
CREATE TABLE worker_runtime (
    id TEXT PRIMARY KEY,
    worker_id TEXT UNIQUE NOT NULL,
    config_id TEXT NOT NULL,

    -- 进程信息
    process_id INTEGER,               -- 系统进程 ID
    container_id TEXT,                -- Docker 容器 ID
    pod_name TEXT,                    -- K8s Pod 名称

    -- 运行状态
    status TEXT NOT NULL,             -- 'stopped', 'starting', 'running', 'stopping', 'error', 'crashed'
    started_at INTEGER,
    stopped_at INTEGER,
    last_heartbeat INTEGER,

    -- 性能指标
    cpu_usage REAL,                   -- CPU 使用率
    memory_usage_mb INTEGER,          -- 内存使用
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
```

### 3.3 Worker日志表 (worker_logs)

```sql
CREATE TABLE worker_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id TEXT NOT NULL,
    level TEXT NOT NULL,              -- 'info', 'warn', 'error', 'debug'
    category TEXT NOT NULL,           -- 'lifecycle', 'task', 'system', 'error'
    message TEXT NOT NULL,
    details TEXT,                     -- JSON 详细信息
    timestamp INTEGER NOT NULL,

    INDEX idx_worker_logs_worker_id (worker_id),
    INDEX idx_worker_logs_timestamp (timestamp)
);
```

## 4. API 接口设计

### 4.1 Worker配置管理

```typescript
// 创建 Worker 配置
POST /api/v1/worker-configs
{
    "worker_id": "worker-1",
    "name": "主Worker",
    "deployment_type": "local",
    "host": "localhost",
    "port": 4001,
    "max_accounts": 10,
    "proxy_id": "proxy-1",
    "auto_start": true,
    "auto_restart": true
}

// 获取所有 Worker 配置
GET /api/v1/worker-configs

// 获取单个 Worker 配置
GET /api/v1/worker-configs/:id

// 更新 Worker 配置
PATCH /api/v1/worker-configs/:id

// 删除 Worker 配置
DELETE /api/v1/worker-configs/:id
```

### 4.2 Worker生命周期控制

```typescript
// 启动 Worker
POST /api/v1/workers/:id/start
Response: {
    "success": true,
    "worker_id": "worker-1",
    "status": "starting",
    "process_id": 12345
}

// 停止 Worker
POST /api/v1/workers/:id/stop
{
    "graceful": true,    // 优雅关闭
    "timeout": 30000     // 超时时间(毫秒)
}

// 重启 Worker
POST /api/v1/workers/:id/restart
{
    "graceful": true
}

// 获取 Worker 运行状态
GET /api/v1/workers/:id/status
Response: {
    "worker_id": "worker-1",
    "status": "running",
    "uptime": 3600,
    "cpu_usage": 15.5,
    "memory_usage_mb": 512,
    "assigned_accounts": 5,
    "active_tasks": 3
}

// 获取 Worker 日志
GET /api/v1/workers/:id/logs?level=error&limit=100&since=timestamp

// 批量操作
POST /api/v1/workers/batch
{
    "action": "start",  // 'start', 'stop', 'restart'
    "worker_ids": ["worker-1", "worker-2"],
    "options": {
        "graceful": true
    }
}
```

### 4.3 Worker监控接口

```typescript
// 获取所有 Worker 状态概览
GET /api/v1/workers/overview
Response: {
    "total": 5,
    "running": 3,
    "stopped": 1,
    "error": 1,
    "total_accounts": 25,
    "total_capacity": 50,
    "cpu_usage_avg": 25.5,
    "memory_usage_total_mb": 2560
}

// 获取 Worker 性能指标
GET /api/v1/workers/:id/metrics?period=1h
Response: {
    "cpu_usage": [...],      // 时间序列数据
    "memory_usage": [...],
    "task_count": [...],
    "error_rate": [...]
}

// 健康检查
GET /api/v1/workers/:id/health
Response: {
    "healthy": true,
    "checks": {
        "heartbeat": "ok",
        "memory": "ok",
        "cpu": "ok",
        "tasks": "ok"
    }
}
```

## 5. 进程管理实现方案

### 5.1 本地进程管理

```javascript
// packages/master/src/worker_manager/process-manager.js

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

class LocalProcessManager {
    constructor() {
        this.processes = new Map();  // worker_id -> process
    }

    async startWorker(config) {
        const { worker_id, port, env_variables, working_directory } = config;

        // 准备环境变量
        const env = {
            ...process.env,
            ...JSON.parse(env_variables || '{}'),
            WORKER_ID: worker_id,
            MASTER_HOST: 'localhost',
            MASTER_PORT: process.env.PORT || 3000,
            PORT: port
        };

        // 启动进程
        const workerPath = path.resolve(__dirname, '../../../worker/src/index.js');
        const child = spawn('node', [workerPath], {
            cwd: working_directory || path.dirname(workerPath),
            env,
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // 保存进程引用
        this.processes.set(worker_id, {
            process: child,
            pid: child.pid,
            config,
            startTime: Date.now()
        });

        // 处理输出
        child.stdout.on('data', (data) => {
            this.handleWorkerOutput(worker_id, 'stdout', data.toString());
        });

        child.stderr.on('data', (data) => {
            this.handleWorkerOutput(worker_id, 'stderr', data.toString());
        });

        // 处理进程退出
        child.on('exit', (code, signal) => {
            this.handleWorkerExit(worker_id, code, signal);
        });

        return {
            success: true,
            pid: child.pid
        };
    }

    async stopWorker(worker_id, graceful = true, timeout = 30000) {
        const workerInfo = this.processes.get(worker_id);
        if (!workerInfo) {
            throw new Error(`Worker ${worker_id} not found in process map`);
        }

        const { process: child } = workerInfo;

        if (graceful) {
            // 发送优雅关闭信号
            child.kill('SIGTERM');

            // 等待进程退出
            await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    // 超时强制关闭
                    child.kill('SIGKILL');
                    resolve();
                }, timeout);

                child.once('exit', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        } else {
            // 强制关闭
            child.kill('SIGKILL');
        }

        this.processes.delete(worker_id);
        return { success: true };
    }

    async restartWorker(worker_id, graceful = true) {
        const workerInfo = this.processes.get(worker_id);
        if (!workerInfo) {
            throw new Error(`Worker ${worker_id} not found`);
        }

        const { config } = workerInfo;
        await this.stopWorker(worker_id, graceful);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 短暂延迟
        return await this.startWorker(config);
    }

    getWorkerStatus(worker_id) {
        const workerInfo = this.processes.get(worker_id);
        if (!workerInfo) {
            return { status: 'stopped' };
        }

        const { process: child, startTime } = workerInfo;

        return {
            status: 'running',
            pid: child.pid,
            uptime: Date.now() - startTime
        };
    }

    handleWorkerOutput(worker_id, stream, data) {
        // 记录日志到数据库
        const logger = require('../utils/logger');
        logger.info(`[Worker ${worker_id}] ${stream}: ${data}`);

        // 可以发送到前端实时日志
        this.emit('worker-log', {
            worker_id,
            stream,
            data,
            timestamp: Date.now()
        });
    }

    handleWorkerExit(worker_id, code, signal) {
        const logger = require('../utils/logger');
        logger.warn(`Worker ${worker_id} exited with code ${code}, signal ${signal}`);

        this.processes.delete(worker_id);

        // 触发自动重启逻辑
        this.emit('worker-exit', {
            worker_id,
            code,
            signal,
            timestamp: Date.now()
        });
    }
}
```

### 5.2 远程进程管理 (SSH)

```javascript
// packages/master/src/worker_manager/remote-process-manager.js

const { Client } = require('ssh2');
const path = require('path');

class RemoteProcessManager {
    constructor() {
        this.connections = new Map();  // host -> ssh connection
        this.processes = new Map();    // worker_id -> process info
    }

    async getConnection(config) {
        const { ssh_host, ssh_port, ssh_user, ssh_key_path, ssh_password } = config;
        const key = `${ssh_host}:${ssh_port}`;

        if (this.connections.has(key)) {
            return this.connections.get(key);
        }

        const conn = new Client();

        await new Promise((resolve, reject) => {
            conn.on('ready', () => {
                this.connections.set(key, conn);
                resolve();
            });

            conn.on('error', reject);

            const authConfig = {
                host: ssh_host,
                port: ssh_port || 22,
                username: ssh_user
            };

            if (ssh_key_path) {
                authConfig.privateKey = require('fs').readFileSync(ssh_key_path);
            } else {
                authConfig.password = ssh_password;
            }

            conn.connect(authConfig);
        });

        return conn;
    }

    async startWorker(config) {
        const conn = await this.getConnection(config);
        const { worker_id, port, env_variables } = config;

        // 构建启动命令
        const envVars = JSON.parse(env_variables || '{}');
        const envString = Object.entries(envVars)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');

        const command = `
            cd /opt/hiscrm-worker && \
            ${envString} \
            WORKER_ID="${worker_id}" \
            MASTER_HOST="${config.master_host}" \
            MASTER_PORT="${config.master_port}" \
            PORT="${port}" \
            nohup node src/index.js > logs/${worker_id}.log 2>&1 & \
            echo $!
        `;

        return new Promise((resolve, reject) => {
            conn.exec(command, (err, stream) => {
                if (err) return reject(err);

                let pid = '';
                stream.on('data', (data) => {
                    pid += data.toString().trim();
                });

                stream.on('close', () => {
                    if (pid) {
                        this.processes.set(worker_id, {
                            pid: parseInt(pid),
                            host: config.ssh_host,
                            config
                        });
                        resolve({ success: true, pid: parseInt(pid) });
                    } else {
                        reject(new Error('Failed to get process ID'));
                    }
                });
            });
        });
    }

    async stopWorker(worker_id, graceful = true) {
        const processInfo = this.processes.get(worker_id);
        if (!processInfo) {
            throw new Error(`Worker ${worker_id} not found`);
        }

        const conn = await this.getConnection(processInfo.config);
        const { pid } = processInfo;

        const signal = graceful ? 'TERM' : 'KILL';
        const command = `kill -${signal} ${pid}`;

        return new Promise((resolve, reject) => {
            conn.exec(command, (err) => {
                if (err) return reject(err);

                this.processes.delete(worker_id);
                resolve({ success: true });
            });
        });
    }

    async checkWorkerStatus(worker_id) {
        const processInfo = this.processes.get(worker_id);
        if (!processInfo) {
            return { status: 'stopped' };
        }

        const conn = await this.getConnection(processInfo.config);
        const { pid } = processInfo;

        const command = `ps -p ${pid} -o state=`;

        return new Promise((resolve) => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    resolve({ status: 'stopped' });
                    return;
                }

                let output = '';
                stream.on('data', (data) => {
                    output += data.toString();
                });

                stream.on('close', () => {
                    if (output.trim()) {
                        resolve({ status: 'running', pid });
                    } else {
                        resolve({ status: 'stopped' });
                    }
                });
            });
        });
    }
}
```

### 5.3 Docker容器管理

```javascript
// packages/master/src/worker_manager/docker-manager.js

const Docker = require('dockerode');

class DockerManager {
    constructor() {
        this.docker = new Docker();
        this.containers = new Map();  // worker_id -> container
    }

    async startWorker(config) {
        const {
            worker_id,
            docker_image,
            docker_network,
            docker_volumes,
            env_variables,
            port,
            max_memory_mb,
            cpu_cores
        } = config;

        // 准备环境变量
        const env = [
            `WORKER_ID=${worker_id}`,
            `MASTER_HOST=master`,  // 使用容器名称
            `MASTER_PORT=3000`,
            `PORT=${port}`,
            ...Object.entries(JSON.parse(env_variables || '{}'))
                .map(([k, v]) => `${k}=${v}`)
        ];

        // 准备挂载卷
        const binds = JSON.parse(docker_volumes || '[]');

        // 创建容器
        const container = await this.docker.createContainer({
            Image: docker_image || 'hiscrm-worker:latest',
            name: `worker-${worker_id}`,
            Env: env,
            HostConfig: {
                NetworkMode: docker_network || 'hiscrm-network',
                Binds: binds,
                Memory: (max_memory_mb || 2048) * 1024 * 1024,
                CpuShares: (cpu_cores || 2) * 1024,
                RestartPolicy: {
                    Name: 'unless-stopped'
                }
            },
            ExposedPorts: {
                [`${port}/tcp`]: {}
            }
        });

        // 启动容器
        await container.start();

        // 保存容器引用
        this.containers.set(worker_id, container);

        // 获取容器信息
        const info = await container.inspect();

        return {
            success: true,
            container_id: info.Id,
            status: info.State.Status
        };
    }

    async stopWorker(worker_id, graceful = true) {
        const container = this.containers.get(worker_id);
        if (!container) {
            throw new Error(`Container for worker ${worker_id} not found`);
        }

        if (graceful) {
            await container.stop({ t: 30 });  // 30秒超时
        } else {
            await container.kill();
        }

        this.containers.delete(worker_id);
        return { success: true };
    }

    async restartWorker(worker_id) {
        const container = this.containers.get(worker_id);
        if (!container) {
            throw new Error(`Container for worker ${worker_id} not found`);
        }

        await container.restart();
        return { success: true };
    }

    async getWorkerStatus(worker_id) {
        const container = this.containers.get(worker_id);
        if (!container) {
            return { status: 'stopped' };
        }

        const info = await container.inspect();
        const stats = await container.stats({ stream: false });

        return {
            status: info.State.Status,
            container_id: info.Id,
            uptime: Date.now() - new Date(info.State.StartedAt).getTime(),
            cpu_usage: this.calculateCPUUsage(stats),
            memory_usage_mb: stats.memory_stats.usage / 1024 / 1024
        };
    }

    calculateCPUUsage(stats) {
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
                        stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage -
                           stats.precpu_stats.system_cpu_usage;
        const cpuCount = stats.cpu_stats.online_cpus || 1;

        return (cpuDelta / systemDelta) * cpuCount * 100;
    }

    async getWorkerLogs(worker_id, options = {}) {
        const container = this.containers.get(worker_id);
        if (!container) {
            throw new Error(`Container for worker ${worker_id} not found`);
        }

        const stream = await container.logs({
            stdout: true,
            stderr: true,
            tail: options.tail || 100,
            since: options.since || 0,
            timestamps: true
        });

        return stream.toString();
    }
}
```

## 6. Worker Agent 设计

### 6.1 Worker Agent 架构

Worker Agent 是一个轻量级守护进程，运行在 Worker 机器上，负责接收 Master 的命令并管理本地 Worker 进程。

```javascript
// packages/worker-agent/src/index.js

const express = require('express');
const { spawn } = require('child_process');
const pm2 = require('pm2');
const logger = require('./logger');

class WorkerAgent {
    constructor(config) {
        this.config = config;
        this.app = express();
        this.workers = new Map();  // worker_id -> process info

        this.setupRoutes();
        this.connectPM2();
    }

    connectPM2() {
        pm2.connect((err) => {
            if (err) {
                logger.error('Failed to connect to PM2', err);
                process.exit(2);
            }
            logger.info('Connected to PM2');
        });
    }

    setupRoutes() {
        this.app.use(express.json());

        // 启动 Worker
        this.app.post('/workers/:id/start', async (req, res) => {
            try {
                const result = await this.startWorker(req.params.id, req.body);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 停止 Worker
        this.app.post('/workers/:id/stop', async (req, res) => {
            try {
                const result = await this.stopWorker(req.params.id, req.body);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 重启 Worker
        this.app.post('/workers/:id/restart', async (req, res) => {
            try {
                const result = await this.restartWorker(req.params.id, req.body);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 获取状态
        this.app.get('/workers/:id/status', async (req, res) => {
            try {
                const status = await this.getWorkerStatus(req.params.id);
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 获取日志
        this.app.get('/workers/:id/logs', async (req, res) => {
            try {
                const logs = await this.getWorkerLogs(req.params.id, req.query);
                res.json({ logs });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 健康检查
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                uptime: process.uptime(),
                workers: Array.from(this.workers.keys())
            });
        });
    }

    async startWorker(worker_id, config) {
        return new Promise((resolve, reject) => {
            pm2.start({
                name: worker_id,
                script: config.script || './worker/src/index.js',
                cwd: config.working_directory || process.cwd(),
                env: {
                    ...config.env_variables,
                    WORKER_ID: worker_id,
                    MASTER_HOST: config.master_host,
                    MASTER_PORT: config.master_port
                },
                max_memory_restart: `${config.max_memory_mb || 2048}M`,
                instances: 1,
                autorestart: config.auto_restart !== false,
                max_restarts: config.max_restart_attempts || 3,
                min_uptime: '10s',
                error_file: `./logs/${worker_id}-error.log`,
                out_file: `./logs/${worker_id}-out.log`,
                merge_logs: true,
                time: true
            }, (err, apps) => {
                if (err) {
                    logger.error(`Failed to start worker ${worker_id}`, err);
                    return reject(err);
                }

                const app = apps[0];
                this.workers.set(worker_id, {
                    pm_id: app.pm_id,
                    pid: app.pid,
                    config
                });

                logger.info(`Started worker ${worker_id} with PID ${app.pid}`);
                resolve({
                    success: true,
                    worker_id,
                    pid: app.pid,
                    pm_id: app.pm_id
                });
            });
        });
    }

    async stopWorker(worker_id, options = {}) {
        return new Promise((resolve, reject) => {
            pm2.stop(worker_id, (err) => {
                if (err) {
                    logger.error(`Failed to stop worker ${worker_id}`, err);
                    return reject(err);
                }

                if (!options.keep_in_list) {
                    pm2.delete(worker_id, (err) => {
                        if (err) logger.warn(`Failed to delete worker ${worker_id}`, err);
                    });
                }

                this.workers.delete(worker_id);
                logger.info(`Stopped worker ${worker_id}`);
                resolve({ success: true });
            });
        });
    }

    async restartWorker(worker_id, options = {}) {
        return new Promise((resolve, reject) => {
            pm2.restart(worker_id, (err) => {
                if (err) {
                    logger.error(`Failed to restart worker ${worker_id}`, err);
                    return reject(err);
                }

                logger.info(`Restarted worker ${worker_id}`);
                resolve({ success: true });
            });
        });
    }

    async getWorkerStatus(worker_id) {
        return new Promise((resolve) => {
            pm2.describe(worker_id, (err, desc) => {
                if (err || !desc || desc.length === 0) {
                    resolve({ status: 'stopped' });
                    return;
                }

                const proc = desc[0];
                resolve({
                    status: proc.pm2_env.status,
                    pid: proc.pid,
                    uptime: Date.now() - proc.pm2_env.pm_uptime,
                    cpu: proc.monit.cpu,
                    memory: proc.monit.memory / 1024 / 1024,  // MB
                    restarts: proc.pm2_env.restart_time,
                    unstable_restarts: proc.pm2_env.unstable_restarts
                });
            });
        });
    }

    async getWorkerLogs(worker_id, options = {}) {
        const { tail = 100 } = options;

        return new Promise((resolve, reject) => {
            pm2.describe(worker_id, (err, desc) => {
                if (err || !desc || desc.length === 0) {
                    return reject(new Error('Worker not found'));
                }

                const proc = desc[0];
                const logFile = proc.pm2_env.pm_out_log_path;

                // 读取日志文件最后N行
                const { exec } = require('child_process');
                exec(`tail -n ${tail} "${logFile}"`, (err, stdout) => {
                    if (err) return reject(err);
                    resolve(stdout);
                });
            });
        });
    }

    start() {
        const port = this.config.port || 4100;
        this.app.listen(port, () => {
            logger.info(`Worker Agent listening on port ${port}`);
        });
    }
}

// 启动 Agent
const agent = new WorkerAgent({
    port: process.env.AGENT_PORT || 4100
});

agent.start();

// 优雅关闭
process.on('SIGINT', () => {
    logger.info('Shutting down Worker Agent...');
    pm2.disconnect();
    process.exit(0);
});
```

## 7. 前端管理界面设计

### 7.1 Worker配置管理页面

```jsx
// packages/admin-web/src/pages/WorkerConfigPage.js

import React, { useState, useEffect } from 'react';
import {
    Card, Table, Button, Modal, Form, Input, Select, Switch,
    Space, Tag, Tooltip, message, Popconfirm, InputNumber,
    Tabs, Row, Col, Statistic, Alert, Drawer
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined,
    PlayCircleOutlined, PauseCircleOutlined,
    ReloadOutlined, SettingOutlined, CloudOutlined,
    DockerOutlined, ClusterOutlined, DesktopOutlined,
    ExclamationCircleOutlined, CheckCircleOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { TabPane } = Tabs;
const { TextArea } = Input;

const WorkerConfigPage = () => {
    const [configs, setConfigs] = useState([]);
    const [runtime, setRuntime] = useState({});
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingConfig, setEditingConfig] = useState(null);
    const [selectedWorker, setSelectedWorker] = useState(null);
    const [logDrawerVisible, setLogDrawerVisible] = useState(false);
    const [logs, setLogs] = useState([]);
    const [form] = Form.useForm();

    // 获取配置列表
    const fetchConfigs = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/v1/worker-configs');
            const data = await response.json();
            setConfigs(data);

            // 获取运行时状态
            const runtimeData = {};
            for (const config of data) {
                const statusRes = await fetch(`/api/v1/workers/${config.worker_id}/status`);
                if (statusRes.ok) {
                    runtimeData[config.worker_id] = await statusRes.json();
                }
            }
            setRuntime(runtimeData);
        } catch (error) {
            message.error('获取配置失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfigs();
        const interval = setInterval(fetchConfigs, 5000);
        return () => clearInterval(interval);
    }, []);

    // 启动 Worker
    const handleStart = async (worker_id) => {
        try {
            const response = await fetch(`/api/v1/workers/${worker_id}/start`, {
                method: 'POST'
            });

            if (response.ok) {
                message.success(`Worker ${worker_id} 启动成功`);
                fetchConfigs();
            } else {
                const error = await response.json();
                message.error(`启动失败: ${error.message}`);
            }
        } catch (error) {
            message.error('启动失败: ' + error.message);
        }
    };

    // 停止 Worker
    const handleStop = async (worker_id) => {
        try {
            const response = await fetch(`/api/v1/workers/${worker_id}/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ graceful: true })
            });

            if (response.ok) {
                message.success(`Worker ${worker_id} 已停止`);
                fetchConfigs();
            } else {
                const error = await response.json();
                message.error(`停止失败: ${error.message}`);
            }
        } catch (error) {
            message.error('停止失败: ' + error.message);
        }
    };

    // 重启 Worker
    const handleRestart = async (worker_id) => {
        try {
            const response = await fetch(`/api/v1/workers/${worker_id}/restart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ graceful: true })
            });

            if (response.ok) {
                message.success(`Worker ${worker_id} 重启成功`);
                fetchConfigs();
            } else {
                const error = await response.json();
                message.error(`重启失败: ${error.message}`);
            }
        } catch (error) {
            message.error('重启失败: ' + error.message);
        }
    };

    // 查看日志
    const handleViewLogs = async (worker_id) => {
        setSelectedWorker(worker_id);
        setLogDrawerVisible(true);

        try {
            const response = await fetch(`/api/v1/workers/${worker_id}/logs?limit=200`);
            const data = await response.json();
            setLogs(data.logs || []);
        } catch (error) {
            message.error('获取日志失败: ' + error.message);
        }
    };

    // 保存配置
    const handleSave = async (values) => {
        try {
            const url = editingConfig
                ? `/api/v1/worker-configs/${editingConfig.id}`
                : '/api/v1/worker-configs';

            const method = editingConfig ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });

            if (response.ok) {
                message.success('保存成功');
                setModalVisible(false);
                form.resetFields();
                setEditingConfig(null);
                fetchConfigs();
            } else {
                const error = await response.json();
                message.error(`保存失败: ${error.message}`);
            }
        } catch (error) {
            message.error('保存失败: ' + error.message);
        }
    };

    // 删除配置
    const handleDelete = async (id) => {
        try {
            const response = await fetch(`/api/v1/worker-configs/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                message.success('删除成功');
                fetchConfigs();
            } else {
                const error = await response.json();
                message.error(`删除失败: ${error.message}`);
            }
        } catch (error) {
            message.error('删除失败: ' + error.message);
        }
    };

    // 获取状态标签
    const getStatusTag = (worker_id) => {
        const status = runtime[worker_id]?.status || 'stopped';
        const statusConfig = {
            running: { color: 'green', icon: <CheckCircleOutlined /> },
            stopped: { color: 'default', icon: <PauseCircleOutlined /> },
            starting: { color: 'blue', icon: <ReloadOutlined spin /> },
            stopping: { color: 'orange', icon: <ReloadOutlined spin /> },
            error: { color: 'red', icon: <ExclamationCircleOutlined /> },
            crashed: { color: 'red', icon: <ExclamationCircleOutlined /> }
        };

        const config = statusConfig[status] || statusConfig.stopped;

        return (
            <Tag color={config.color}>
                {config.icon} {status.toUpperCase()}
            </Tag>
        );
    };

    // 获取部署类型图标
    const getDeploymentIcon = (type) => {
        const icons = {
            local: <DesktopOutlined />,
            remote: <CloudOutlined />,
            docker: <DockerOutlined />,
            k8s: <ClusterOutlined />
        };
        return icons[type] || <DesktopOutlined />;
    };

    const columns = [
        {
            title: 'Worker ID',
            dataIndex: 'worker_id',
            key: 'worker_id',
            width: 150,
            fixed: 'left'
        },
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            width: 150
        },
        {
            title: '部署类型',
            dataIndex: 'deployment_type',
            key: 'deployment_type',
            width: 120,
            render: (type) => (
                <Space>
                    {getDeploymentIcon(type)}
                    {type}
                </Space>
            )
        },
        {
            title: '主机',
            dataIndex: 'host',
            key: 'host',
            width: 150,
            render: (host, record) => `${host}:${record.port}`
        },
        {
            title: '状态',
            key: 'status',
            width: 120,
            render: (_, record) => getStatusTag(record.worker_id)
        },
        {
            title: '账户容量',
            key: 'capacity',
            width: 120,
            render: (_, record) => {
                const current = runtime[record.worker_id]?.assigned_accounts || 0;
                const max = record.max_accounts;
                return `${current}/${max}`;
            }
        },
        {
            title: '资源使用',
            key: 'resources',
            width: 200,
            render: (_, record) => {
                const stats = runtime[record.worker_id];
                if (!stats || stats.status !== 'running') {
                    return '-';
                }
                return (
                    <Space direction="vertical" size="small">
                        <span>CPU: {stats.cpu_usage?.toFixed(1)}%</span>
                        <span>内存: {stats.memory_usage_mb?.toFixed(0)}MB</span>
                    </Space>
                );
            }
        },
        {
            title: '自动管理',
            key: 'auto',
            width: 150,
            render: (_, record) => (
                <Space>
                    {record.auto_start && <Tag color="blue">自动启动</Tag>}
                    {record.auto_restart && <Tag color="green">自动重启</Tag>}
                </Space>
            )
        },
        {
            title: '操作',
            key: 'actions',
            fixed: 'right',
            width: 250,
            render: (_, record) => {
                const status = runtime[record.worker_id]?.status || 'stopped';
                const isRunning = status === 'running';
                const isStopped = status === 'stopped';

                return (
                    <Space size="small">
                        <Tooltip title="启动">
                            <Button
                                type="text"
                                icon={<PlayCircleOutlined />}
                                disabled={!isStopped}
                                onClick={() => handleStart(record.worker_id)}
                            />
                        </Tooltip>
                        <Tooltip title="停止">
                            <Button
                                type="text"
                                icon={<PauseCircleOutlined />}
                                disabled={isStopped}
                                onClick={() => handleStop(record.worker_id)}
                            />
                        </Tooltip>
                        <Tooltip title="重启">
                            <Button
                                type="text"
                                icon={<ReloadOutlined />}
                                disabled={isStopped}
                                onClick={() => handleRestart(record.worker_id)}
                            />
                        </Tooltip>
                        <Tooltip title="查看日志">
                            <Button
                                type="text"
                                icon={<FileTextOutlined />}
                                onClick={() => handleViewLogs(record.worker_id)}
                            />
                        </Tooltip>
                        <Tooltip title="编辑配置">
                            <Button
                                type="text"
                                icon={<EditOutlined />}
                                onClick={() => {
                                    setEditingConfig(record);
                                    form.setFieldsValue(record);
                                    setModalVisible(true);
                                }}
                            />
                        </Tooltip>
                        <Popconfirm
                            title="确定删除此配置？"
                            onConfirm={() => handleDelete(record.id)}
                        >
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                            />
                        </Popconfirm>
                    </Space>
                );
            }
        }
    ];

    return (
        <div style={{ padding: 24 }}>
            {/* 统计卡片 */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="配置总数"
                            value={configs.length}
                            prefix={<SettingOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="运行中"
                            value={Object.values(runtime).filter(r => r.status === 'running').length}
                            valueStyle={{ color: '#3f8600' }}
                            prefix={<CheckCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="已停止"
                            value={configs.length - Object.values(runtime).filter(r => r.status === 'running').length}
                            valueStyle={{ color: '#999' }}
                            prefix={<PauseCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card>
                        <Statistic
                            title="总容量"
                            value={configs.reduce((sum, c) => sum + c.max_accounts, 0)}
                            suffix="账户"
                        />
                    </Card>
                </Col>
            </Row>

            {/* 工具栏 */}
            <Card
                title="Worker 配置管理"
                extra={
                    <Space>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => {
                                setEditingConfig(null);
                                form.resetFields();
                                setModalVisible(true);
                            }}
                        >
                            新建配置
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={fetchConfigs}
                        >
                            刷新
                        </Button>
                    </Space>
                }
            >
                <Table
                    columns={columns}
                    dataSource={configs}
                    rowKey="id"
                    loading={loading}
                    scroll={{ x: 1500 }}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        showTotal: (total) => `共 ${total} 条`
                    }}
                />
            </Card>

            {/* 配置编辑弹窗 */}
            <Modal
                title={editingConfig ? '编辑配置' : '新建配置'}
                visible={modalVisible}
                onCancel={() => {
                    setModalVisible(false);
                    form.resetFields();
                    setEditingConfig(null);
                }}
                width={800}
                footer={null}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                >
                    <Tabs defaultActiveKey="basic">
                        <TabPane tab="基础配置" key="basic">
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="worker_id"
                                        label="Worker ID"
                                        rules={[{ required: true, message: '请输入Worker ID' }]}
                                    >
                                        <Input placeholder="例如: worker-1" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="name"
                                        label="名称"
                                        rules={[{ required: true, message: '请输入名称' }]}
                                    >
                                        <Input placeholder="友好名称" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="deployment_type"
                                        label="部署类型"
                                        rules={[{ required: true, message: '请选择部署类型' }]}
                                    >
                                        <Select>
                                            <Option value="local">本地进程</Option>
                                            <Option value="remote">远程SSH</Option>
                                            <Option value="docker">Docker容器</Option>
                                            <Option value="k8s">Kubernetes</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="host"
                                        label="主机地址"
                                        rules={[{ required: true, message: '请输入主机地址' }]}
                                    >
                                        <Input placeholder="localhost 或 IP地址" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col span={8}>
                                    <Form.Item
                                        name="port"
                                        label="端口"
                                        rules={[{ required: true }]}
                                    >
                                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        name="max_accounts"
                                        label="最大账户数"
                                    >
                                        <InputNumber min={1} max={100} style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        name="proxy_id"
                                        label="代理配置"
                                    >
                                        <Select placeholder="选择代理">
                                            <Option value="">不使用代理</Option>
                                            {/* 动态加载代理列表 */}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item
                                name="description"
                                label="描述"
                            >
                                <TextArea rows={3} placeholder="可选的描述信息" />
                            </Form.Item>
                        </TabPane>

                        <TabPane tab="资源限制" key="resources">
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="max_memory_mb"
                                        label="内存限制 (MB)"
                                    >
                                        <InputNumber
                                            min={512}
                                            max={16384}
                                            step={512}
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="cpu_cores"
                                        label="CPU 核心数"
                                    >
                                        <InputNumber
                                            min={1}
                                            max={16}
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </TabPane>

                        <TabPane tab="自动管理" key="auto">
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="auto_start"
                                        label="自动启动"
                                        valuePropName="checked"
                                    >
                                        <Switch />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="auto_restart"
                                        label="故障自动重启"
                                        valuePropName="checked"
                                    >
                                        <Switch />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item
                                        name="restart_delay_ms"
                                        label="重启延迟 (毫秒)"
                                    >
                                        <InputNumber
                                            min={1000}
                                            max={60000}
                                            step={1000}
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        name="max_restart_attempts"
                                        label="最大重启次数"
                                    >
                                        <InputNumber
                                            min={1}
                                            max={10}
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        </TabPane>

                        <TabPane tab="环境变量" key="env">
                            <Form.Item
                                name="env_variables"
                                label="环境变量 (JSON格式)"
                            >
                                <TextArea
                                    rows={10}
                                    placeholder={`{
  "NODE_ENV": "production",
  "DEBUG": "false"
}`}
                                />
                            </Form.Item>
                        </TabPane>
                    </Tabs>

                    <Form.Item>
                        <Space>
                            <Button type="primary" htmlType="submit">
                                保存
                            </Button>
                            <Button onClick={() => setModalVisible(false)}>
                                取消
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>

            {/* 日志查看抽屉 */}
            <Drawer
                title={`Worker ${selectedWorker} 日志`}
                placement="right"
                width={800}
                visible={logDrawerVisible}
                onClose={() => setLogDrawerVisible(false)}
            >
                <div style={{
                    background: '#1f1f1f',
                    color: '#d4d4d4',
                    padding: 16,
                    borderRadius: 4,
                    fontFamily: 'monospace',
                    fontSize: 12,
                    lineHeight: '1.5',
                    maxHeight: 'calc(100vh - 200px)',
                    overflow: 'auto'
                }}>
                    <pre>{logs}</pre>
                </div>
            </Drawer>
        </div>
    );
};

export default WorkerConfigPage;
```

## 8. 实施计划

### 第一阶段：基础架构（Week 1）
- [ ] 创建数据库表结构
- [ ] 实现 Worker Manager 核心类
- [ ] 实现本地进程管理器
- [ ] 创建基础 API 接口

### 第二阶段：进程管理（Week 2）
- [ ] 实现 SSH 远程管理
- [ ] 实现 Docker 容器管理
- [ ] 实现 Worker Agent
- [ ] 添加自动重启机制

### 第三阶段：前端界面（Week 3）
- [ ] 创建配置管理页面
- [ ] 实现实时监控面板
- [ ] 添加日志查看功能
- [ ] 实现批量操作

### 第四阶段：高级特性（Week 4）
- [ ] 实现自动扩缩容
- [ ] 添加负载均衡策略
- [ ] 实现故障转移
- [ ] 添加告警通知

## 9. 关键技术点

### 9.1 进程管理
- 使用 PM2 进行进程守护
- child_process 进行本地进程控制
- SSH2 库进行远程管理
- Dockerode 进行容器管理

### 9.2 状态同步
- 使用 Socket.IO 实时推送状态
- 定期心跳检测
- 数据库持久化状态

### 9.3 故障恢复
- 自动重启机制
- 指数退避算法
- 健康检查探针
- 故障转移策略

### 9.4 安全考虑
- SSH 密钥管理
- API 认证授权
- 进程隔离
- 资源限制

## 10. 总结

这个设计将 Worker 管理从被动模式转变为主动管理模式，Master 完全掌控 Worker 的生命周期：

**核心优势**：
1. **集中管理**：所有 Worker 配置和状态集中管理
2. **远程控制**：支持本地、SSH、Docker 多种部署方式
3. **自动化**：自动启动、重启、故障恢复
4. **可视化**：完整的 Web 管理界面
5. **可扩展**：易于添加 Kubernetes 等新的部署方式

**技术亮点**：
- PM2 进程守护确保稳定性
- 多种部署方式满足不同场景
- 实时监控和日志查看
- 完善的错误处理和恢复机制

这个架构设计可以让您的系统更加健壮、易管理，并且具有很好的扩展性。