# Master 系统完整文档

**版本**: 1.0.0
**日期**: 2025-10-18
**模块**: Master Server (中央协调器)
**端口**: 3000
**数据库**: SQLite (packages/master/data/master.db)

---

## 目录

1. [系统概述](#系统概述)
2. [架构设计](#架构设计)
3. [核心模块](#核心模块)
4. [数据库设计](#数据库设计)
5. [Socket.IO 通信](#socketio-通信)
6. [HTTP API](#http-api)
7. [业务流程](#业务流程)
8. [部署说明](#部署说明)

---

## 系统概述

### 职责定位

Master 是整个系统的**中央协调器**，负责：

- ✅ **Worker 生命周期管理** - 注册、心跳监控、离线检测
- ✅ **账户分配** - 根据 Worker 能力分配账户
- ✅ **任务调度** - 定期调度监控任务给 Worker
- ✅ **登录会话管理** - 协调二维码登录流程
- ✅ **数据持久化** - 存储账户、Cookie、用户信息
- ✅ **实时通信** - Socket.IO 三向通信（Worker/Admin/Client）
- ✅ **通知管理** - 接收和转发实时通知

### 核心流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ Admin    │         │  Master  │         │  Worker  │
│  Web     │◄─────────►         │◄─────────►   1,2,N  │
└──────────┘ Socket  └──────────┘ Socket  └──────────┘
            /admin       /worker       /worker
                            │
                            ▼
                     ┌────────────┐
                     │ SQLite DB  │
                     └────────────┘
```

---

## 架构设计

### 内部架构

```
┌─────────────────────────────────────────────────────┐
│              Master Server (Node.js)                 │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────────────────────────────────────────┐  │
│  │        Socket.IO 服务器 (端口 3000)          │  │
│  ├────────────┬──────────────┬──────────────┐   │  │
│  │ /admin     │ /worker      │ /client      │   │  │
│  │ 命名空间   │ 命名空间     │ 命名空间     │   │  │
│  └────────────┴──────────────┴──────────────┘   │  │
│                      ▲                            │  │
│  ┌──────────────────┼──────────────────────┐   │  │
│  │   业务逻辑层     │                       │   │  │
│  ├──────────┬───────┴────────┬──────────┤   │  │
│  │ Worker   │ LoginHandler  │ Notif   │   │  │
│  │ Manager  │ TaskScheduler │ Manager │   │  │
│  └──────────┴────────────────┴──────────┘   │  │
│                      ▲                        │  │
│  ┌──────────────────┼─────────────────────┐ │  │
│  │    数据访问层    │                     │ │  │
│  ├──────┬──────┬────┴───┬──────┬────────┤ │  │
│  │Account│Worker│Login  │Comment│DAO... │ │  │
│  │DAO    │DAO  │DAO    │DAO   │       │ │  │
│  └──────┴──────┴────────┴──────┴────────┘ │  │
│                      ▲                        │  │
│         ┌────────────┴───────────┐          │  │
│         │    SQLite 数据库        │          │  │
│         │ (master.db)            │          │  │
│         └────────────────────────┘          │  │
│                                              │  │
└──────────────────────────────────────────────┘  │
```

### 目录结构

```
packages/master/
├── src/
│   ├── index.js                    # 入口文件
│   ├── api/routes/
│   │   ├── accounts.js             # 账户 API
│   │   ├── workers.js              # Worker API
│   │   ├── messages.js             # 消息 API
│   │   ├── proxies.js              # 代理 API
│   │   └── notifications.js        # 通知 API
│   ├── communication/
│   │   ├── socket-server.js        # Socket.IO 服务器
│   │   └── notification-broadcaster.js # 通知广播
│   ├── socket/
│   │   ├── worker-namespace.js     # Worker 命名空间
│   │   ├── admin-namespace.js      # Admin 命名空间
│   │   └── client-namespace.js     # Client 命名空间
│   ├── worker_manager/
│   │   ├── registration.js         # Worker 注册
│   │   ├── account-assigner.js     # 账户分配
│   │   └── lifecycle-manager.js    # 生命周期管理
│   ├── scheduler/
│   │   └── task-scheduler.js       # 任务调度
│   ├── monitor/
│   │   └── heartbeat.js            # 心跳监控
│   ├── login/
│   │   └── login-handler.js        # 登录处理
│   ├── notification/
│   │   └── notification-handler.js # 通知处理
│   └── database/
│       ├── init.js                 # 初始化
│       ├── migrations/             # 迁移脚本
│       ├── schema.sql              # 表结构
│       ├── accounts-dao.js         # 账户 DAO
│       ├── worker-dao.js           # Worker DAO
│       ├── login-session-dao.js    # 登录会话 DAO
│       ├── comment-dao.js          # 评论 DAO
│       ├── direct-message-dao.js   # 私信 DAO
│       └── notification-dao.js     # 通知 DAO
├── data/
│   └── master.db                   # SQLite 数据库
├── logs/
│   └── master.log                  # 日志文件
└── package.json
```

---

## 核心模块

### 1. Socket.IO 服务器 (`communication/socket-server.js`)

**职责**: 初始化 Socket.IO 并创建三个命名空间

```javascript
const io = require('socket.io')(server, {
  cors: {
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// 三个命名空间
const workerNamespace = io.of('/worker');    // Worker 连接
const adminNamespace = io.of('/admin');      // Admin Web 连接
const clientNamespace = io.of('/client');    // Client 连接
```

---

### 2. Worker 管理 (`worker_manager/`)

#### 2.1 注册管理 (`registration.js`)

```javascript
// Worker 注册流程
workerNamespace.on('connection', (socket) => {
  socket.on('worker:register', (data) => {
    // 1. 验证数据
    // 2. 保存到数据库 (workers 表)
    // 3. 缓存到内存
    // 4. 发送确认
  });
});
```

**保存的数据**:
```javascript
{
  id: 'worker-1',
  host: '127.0.0.1',
  port: 4000,
  status: 'connected',
  capabilities: ['douyin', 'xiaohongshu'],
  max_accounts: 10,
  assigned_accounts: 0,
  last_heartbeat: timestamp,
  started_at: timestamp,
  version: '1.0.0',
  metadata: JSON.stringify({...})
}
```

#### 2.2 账户分配 (`account-assigner.js`)

```javascript
class AccountAssigner {
  // 分配策略
  assignAccount(account) {
    // 1. 查找支持该平台的 Worker
    const capabilities = account.platform;

    // 2. 按负载排序（已分配账户数少的优先）
    const workers = findWorkersByCapability(capabilities)
      .sort((a, b) => a.assigned_accounts - b.assigned_accounts);

    // 3. 选择负载最低的
    const targetWorker = workers[0];

    // 4. 更新账户 assigned_worker_id
    updateAccount(account.id, {assigned_worker_id: targetWorker.id});

    // 5. 发送任务到 Worker
    const workerSocket = getWorkerSocket(targetWorker.id);
    workerSocket.emit('master:task:assign', {accounts: [account]});
  }
}
```

#### 2.3 生命周期管理 (`lifecycle-manager.js`)

```javascript
class LifecycleManager {
  // 启动 Worker 进程
  async startWorker(workerId) {
    const config = getWorkerConfig(workerId);
    const child = fork('packages/worker/src/index.js', [], {
      env: {WORKER_ID: workerId, ...config.env_vars}
    });
    return child;
  }

  // 停止 Worker 进程
  async stopWorker(workerId) {
    const process = getWorkerProcess(workerId);
    process.kill('SIGTERM');
  }

  // 重启 Worker 进程
  async restartWorker(workerId) {
    await this.stopWorker(workerId);
    await sleep(1000);
    return await this.startWorker(workerId);
  }
}
```

---

### 3. 登录处理 (`login/login-handler.js`)

```javascript
class LoginHandler {
  // 创建登录会话
  createLoginSession(accountId, workerId) {
    const sessionId = generateUUID();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 300; // 5分钟

    db.prepare(`
      INSERT INTO login_sessions
      (id, account_id, worker_id, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, accountId, workerId, 'pending', expiresAt, now);

    return sessionId;
  }

  // 处理二维码
  handleQRCodeReady(data) {
    const {session_id, qr_code_data} = data;

    // 更新会话状态
    db.prepare('UPDATE login_sessions SET status = ? WHERE id = ?')
      .run('scanning', session_id);

    // 广播到 Admin
    adminNamespace.emit('login:qrcode:ready', {
      session_id,
      qr_code_data,
      expires_at: ...
    });
  }

  // 处理登录成功
  handleLoginSuccess(data) {
    const {session_id, cookies, user_info, fingerprint} = data;
    const session = getLoginSession(session_id);

    // 更新会话
    db.prepare('UPDATE login_sessions SET status = ?, logged_in_at = ? WHERE id = ?')
      .run('success', Date.now(), session_id);

    // 更新账户
    db.prepare(`
      UPDATE accounts
      SET login_status = ?, credentials = ?, user_info = ?,
          fingerprint = ?, cookies_valid_until = ?,
          last_login_time = ?
      WHERE id = ?
    `).run('logged_in', JSON.stringify({cookies}),
           JSON.stringify(user_info), JSON.stringify(fingerprint),
           Math.floor(Date.now() / 1000) + 604800, // 7天
           Date.now(), session.account_id);

    // 广播到 Admin
    adminNamespace.emit('login:success', {session_id, user_info});
  }
}
```

---

### 4. 任务调度 (`scheduler/task-scheduler.js`)

```javascript
class TaskScheduler {
  constructor() {
    // 每30秒执行一次
    setInterval(() => this.scheduleTasks(), 30000);
  }

  scheduleTasks() {
    // 1. 查询需要监控的账户
    const accounts = db.prepare(`
      SELECT * FROM accounts
      WHERE login_status = 'logged_in'
        AND status = 'active'
        AND assigned_worker_id IS NOT NULL
    `).all();

    // 2. 按 Worker 分组
    const grouped = {};
    accounts.forEach(account => {
      if (!grouped[account.assigned_worker_id]) {
        grouped[account.assigned_worker_id] = [];
      }
      grouped[account.assigned_worker_id].push(account);
    });

    // 3. 向每个 Worker 发送任务
    Object.entries(grouped).forEach(([workerId, accounts]) => {
      const workerSocket = getWorkerSocket(workerId);
      if (workerSocket) {
        workerSocket.emit('master:task:assign', {accounts});
      }
    });
  }
}
```

---

### 5. 心跳监控 (`monitor/heartbeat.js`)

```javascript
class HeartbeatMonitor {
  constructor() {
    // 每15秒检查一次
    setInterval(() => this.checkHeartbeats(), 15000);
  }

  checkHeartbeats() {
    const now = Math.floor(Date.now() / 1000);

    // 查询超时的 Worker (30秒无心跳)
    const offlineWorkers = db.prepare(`
      SELECT * FROM workers
      WHERE last_heartbeat < ? AND status != 'offline'
    `).all(now - 30);

    offlineWorkers.forEach(worker => {
      // 1. 标记为 offline
      db.prepare('UPDATE workers SET status = ? WHERE id = ?')
        .run('offline', worker.id);

      // 2. 撤销所有任务
      db.prepare(`
        UPDATE accounts
        SET assigned_worker_id = NULL
        WHERE assigned_worker_id = ?
      `).run(worker.id);

      console.log(`Worker ${worker.id} marked as offline`);
    });
  }
}
```

---

## 数据库设计

### 核心表

#### accounts 表

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,                        -- douyin/xiaohongshu
  account_name TEXT NOT NULL,
  account_id TEXT,
  credentials TEXT,                              -- JSON: {cookies: [...]}
  user_info TEXT,                                -- JSON: {nickname, avatar, ...}
  fingerprint TEXT,                              -- JSON: {userAgent, viewport, ...}
  status TEXT DEFAULT 'active',                  -- active/inactive
  login_status TEXT DEFAULT 'not_logged_in',     -- not_logged_in/logging_in/logged_in/login_failed
  monitor_interval INTEGER DEFAULT 20,
  last_login_time INTEGER,
  cookies_valid_until INTEGER,
  assigned_worker_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (assigned_worker_id) REFERENCES workers(id)
);

CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_login_status ON accounts(login_status);
CREATE INDEX idx_accounts_worker ON accounts(assigned_worker_id);
```

#### workers 表

```sql
CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  status TEXT DEFAULT 'connected',               -- connected/disconnected/offline
  assigned_accounts INTEGER DEFAULT 0,
  last_heartbeat INTEGER,
  started_at INTEGER NOT NULL,
  version TEXT,
  metadata TEXT,                                 -- JSON: {capabilities, maxAccounts, ...}
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_workers_status ON workers(status);
```

#### login_sessions 表

```sql
CREATE TABLE login_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  worker_id TEXT,
  status TEXT DEFAULT 'pending',                 -- pending/scanning/success/failed/expired
  login_method TEXT DEFAULT 'qrcode',
  qr_code_data TEXT,                             -- Base64 encoded
  qr_code_url TEXT,
  error_message TEXT,
  expires_at INTEGER,
  logged_in_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE INDEX idx_login_sessions_status ON login_sessions(status);
CREATE INDEX idx_login_sessions_account ON login_sessions(account_id);
```

#### comments 表

```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform_comment_id TEXT,
  content TEXT,
  author_name TEXT,
  author_id TEXT,
  post_id TEXT,
  post_title TEXT,
  is_read BOOLEAN DEFAULT 0,
  detected_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_comments_account ON comments(account_id);
CREATE INDEX idx_comments_detected ON comments(detected_at DESC);
```

#### direct_messages 表

```sql
CREATE TABLE direct_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform_message_id TEXT,
  content TEXT,
  sender_name TEXT,
  sender_id TEXT,
  direction TEXT,                                -- inbound/outbound
  is_read BOOLEAN DEFAULT 0,
  detected_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_direct_messages_account ON direct_messages(account_id);
CREATE INDEX idx_direct_messages_detected ON direct_messages(detected_at DESC);
```

#### notifications 表

```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                            -- comment/direct_message/system/account_status
  account_id TEXT,
  related_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  data TEXT,                                     -- JSON: 附加数据
  priority TEXT DEFAULT 'normal',                -- low/normal/high/urgent
  is_sent BOOLEAN DEFAULT 0,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_account ON notifications(account_id);
CREATE INDEX idx_notifications_sent ON notifications(is_sent);
```

---

## Socket.IO 通信

### /worker 命名空间

**Worker → Master**:

```javascript
// 注册
socket.emit('worker:register', {
  workerId: 'worker-1',
  capabilities: ['douyin'],
  maxAccounts: 10,
  host: '127.0.0.1',
  port: 4000,
  version: '1.0.0'
});

// 心跳
socket.emit('worker:heartbeat', {
  workerId: 'worker-1',
  stats: {
    activeAccounts: 2,
    memoryUsage: 256,
    cpuUsage: 10
  },
  timestamp: Date.now()
});

// 二维码
socket.emit('worker:login:qrcode', {
  session_id: 'xxx',
  qr_code_data: 'data:image/png;base64,...',
  account_id: 'xxx'
});

// 登录状态
socket.emit('worker:login:status', {
  session_id: 'xxx',
  status: 'success',
  cookies: [...],
  user_info: {...},
  fingerprint: {...}
});

// 监控数据
socket.emit('worker:message:detected', {
  type: 'comment',
  account_id: 'xxx',
  messages: [...]
});
```

**Master → Worker**:

```javascript
// 任务分配
socket.emit('master:task:assign', {
  accounts: [
    {id: 'xxx', platform: 'douyin', ...}
  ]
});

// 任务撤销
socket.emit('master:task:revoke', {
  accountIds: ['xxx', 'yyy']
});

// 登录请求
socket.emit('master:login:start', {
  account_id: 'xxx',
  session_id: 'xxx',
  platform: 'douyin',
  proxy: {server, protocol, username, password}
});
```

---

### /admin 命名空间

**Admin → Master**:

```javascript
// 启动登录
socket.emit('master:login:start', {
  account_id: 'xxx',
  worker_id: 'worker-1'
});

// 请求登录会话
socket.emit('admin:request:login-sessions', {});
```

**Master → Admin**:

```javascript
// 二维码就绪
socket.emit('login:qrcode:ready', {
  session_id: 'xxx',
  account_id: 'xxx',
  qr_code_data: 'data:image/png;base64,...',
  expires_at: timestamp
});

// 登录成功
socket.emit('login:success', {
  session_id: 'xxx',
  account_id: 'xxx',
  user_info: {...}
});

// 登录失败
socket.emit('login:failed', {
  session_id: 'xxx',
  error_message: 'xxx'
});

// 新通知
socket.emit('notification:new', {
  id: 'xxx',
  type: 'comment',
  title: '新评论',
  content: '...',
  data: {...}
});
```

---

## HTTP API

### 账户管理

```javascript
// GET /api/v1/accounts
// 获取所有账户
{
  "success": true,
  "accounts": [
    {id, platform, account_name, account_id, login_status, ...}
  ]
}

// POST /api/v1/accounts
// 创建账户
{
  "platform": "douyin",
  "account_name": "我的账号",
  "account_id": "xxx",
  "monitor_interval": 20
}

// PUT /api/v1/accounts/:id
// 更新账户

// DELETE /api/v1/accounts/:id
// 删除账户
```

### Worker 管理

```javascript
// GET /api/v1/workers
// Worker 列表

// GET /api/v1/workers/:id
// Worker 详情

// POST /api/v1/workers/:id/lifecycle/start
// 启动 Worker

// POST /api/v1/workers/:id/lifecycle/stop
// 停止 Worker

// POST /api/v1/workers/:id/lifecycle/restart
// 重启 Worker
```

### 消息查询

```javascript
// GET /api/v1/comments?limit=20&offset=0&account_id=xxx
// 评论列表

// GET /api/v1/direct-messages?limit=20&offset=0&direction=inbound
// 私信列表

// GET /api/v1/notifications?limit=50&type=comment
// 通知列表
```

---

## 业务流程

### 流程 1: Worker 注册到上线

```
Worker 启动
    ↓
1. 连接 Socket.IO (/worker)
2. 发送 worker:register
   {workerId, capabilities, maxAccounts, ...}
    ↓
Master 处理
    ↓
3. 验证数据
4. 保存到 workers 表
5. 发送 worker:registered 确认
    ↓
Worker 继续
    ↓
6. 初始化浏览器管理器
7. 加载平台脚本
8. 定期发送心跳 (每10秒)
    ↓
Master 监控
    ↓
9. HeartbeatMonitor 记录 last_heartbeat
10. 如果 > 30秒无心跳 → 标记为 offline
11. 撤销所有任务给该 Worker
```

---

### 流程 2: 账户登录 (完整)

```
Admin 点击 [登录]
    ↓
1. Socket 发送: master:login:start
    {account_id, worker_id}
    ↓
Master 处理
    ↓
2. 创建 login_sessions 记录 (status: pending)
3. 查询 Worker 代理配置
4. 转发给 Worker: master:login:start
    {account_id, session_id, platform, proxy}
    ↓
Worker 处理
    ↓
5. 获取或创建 Browser (accountId 级别)
6. 加载指纹和 Cookie
7. 导航到登录页
8. 等待二维码加载
9. 提取二维码图片 (Base64)
    ↓
10. Socket 发送: worker:login:qrcode
    {session_id, qr_code_data}
    ↓
Master 处理
    ↓
11. 更新 login_sessions (status: scanning)
12. 广播给 Admin: login:qrcode:ready
    ↓
Admin 显示
    ↓
13. 显示二维码弹窗
14. 倒计时 5 分钟
    ↓
用户扫码
    ↓
Worker 检测
    ↓
15. 轮询登录状态 (每2秒)
16. 检测到登录成功
17. 提取 cookies + user_info
    ↓
18. 保存到本地:
    - data/browser/worker-1/{accountId}_storage.json
    - data/browser/worker-1/fingerprints/{accountId}_fingerprint.json
    ↓
19. Socket 发送: worker:login:status
    {session_id, status: success, cookies, user_info, fingerprint}
    ↓
Master 更新数据库
    ↓
20. 更新 login_sessions (status: success)
21. 更新 accounts:
    - login_status = logged_in
    - credentials = JSON.stringify({cookies})
    - user_info = JSON.stringify(userInfo)
    - fingerprint = JSON.stringify(fingerprint)
    - cookies_valid_until = now + 7天
    ↓
22. 广播给 Admin: login:success
    ↓
Admin 响应
    ↓
23. 关闭二维码弹窗
24. 显示成功提示
25. 刷新账户列表
```

---

## 部署说明

### 开发启动

```bash
cd packages/master
npm install
npm start
```

### 生产部署 (PM2)

```bash
# 启动
pm2 start packages/master/src/index.js --name "hiscrm-master"

# 查看日志
pm2 logs hiscrm-master

# 重启
pm2 restart hiscrm-master

# 停止
pm2 stop hiscrm-master
```

### 环境变量

```bash
# .env
PORT=3000
DB_PATH=./data/master.db
LOG_LEVEL=info
NODE_ENV=production
```

### 数据库初始化

```bash
# 首次启动自动初始化
# 数据库位置: packages/master/data/master.db

# 手动重置数据库
rm packages/master/data/master.db
npm start
```

---

## 监控和维护

### 查看日志

```bash
tail -f packages/master/logs/master.log
```

### 监控 Worker 连接

```sql
SELECT * FROM workers WHERE status = 'online';
SELECT COUNT(*) FROM accounts WHERE assigned_worker_id = 'worker-1';
```

### 清理过期数据

```sql
-- 清理过期登录会话 (超过7天)
DELETE FROM login_sessions
WHERE created_at < (strftime('%s', 'now') - 604800);

-- 清理旧通知 (保留30天)
DELETE FROM notifications
WHERE created_at < (strftime('%s', 'now') - 2592000);
```

---

**文档版本**: 1.0.0
**最后更新**: 2025-10-18
**维护者**: 开发团队
