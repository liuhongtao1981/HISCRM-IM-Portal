# Master 端设计方案

**版本**: 2.0.0
**日期**: 2025-10-16
**负责模块**: 主控服务器 (Master Server)

---

## 📋 目录

1. [概述](#概述)
2. [架构设计](#架构设计)
3. [核心模块](#核心模块)
4. [数据库设计](#数据库设计)
5. [通信协议](#通信协议)
6. [核心流程](#核心流程)
7. [部署说明](#部署说明)

---

## 🎯 概述

### 职责定位

Master 是整个系统的**中央协调器**，负责：
- ✅ Worker 注册与生命周期管理
- ✅ 账户分配与任务调度
- ✅ 登录会话管理（二维码登录协调）
- ✅ 数据持久化（账户凭据、监控数据）
- ✅ Admin Web 通信（实时状态推送）

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 18.x LTS | 运行时 |
| Express | 4.x | HTTP 服务器 |
| Socket.IO | 4.x | WebSocket 通信 |
| SQLite | 3.x (better-sqlite3) | 数据库 |
| Winston | 3.x | 日志 |

### 端口配置

- **HTTP/Socket.IO**: 3000 (默认)
- **环境变量**: `PORT`, `DB_PATH`

---

## 🏗️ 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Master Server (端口 3000)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  HTTP API    │  │  Socket.IO   │  │   Database   │      │
│  │  (Express)   │  │   Server     │  │   (SQLite)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │              │
│  ┌──────▼─────────────────▼──────────────────▼────────┐    │
│  │              核心业务逻辑层                        │    │
│  ├───────────────────────────────────────────────────┤    │
│  │ WorkerManager │ LoginHandler │ TaskScheduler     │    │
│  │ HeartbeatMonitor │ AccountAssigner │ ...         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
              ▲                           ▲
              │                           │
    ┌─────────┴─────────┐       ┌────────┴────────┐
    │   Admin Web       │       │   Workers       │
    │   /admin          │       │   /worker       │
    └───────────────────┘       └─────────────────┘
```

### 目录结构

```
packages/master/
├── src/
│   ├── index.js                     # 入口文件
│   ├── api/routes/                  # HTTP API
│   │   ├── accounts.js              # 账户管理
│   │   ├── workers.js               # Worker 管理
│   │   ├── worker-lifecycle.js      # Worker 生命周期
│   │   ├── proxies.js               # 代理管理
│   │   └── messages.js              # 消息查询
│   ├── communication/               # 通信层
│   │   ├── socket-server.js         # Socket.IO 服务器
│   │   ├── session-manager.js       # 会话管理
│   │   └── notification-broadcaster.js  # 通知广播
│   ├── socket/                      # Socket 命名空间
│   │   └── admin-namespace.js       # Admin 命名空间
│   ├── worker_manager/              # Worker 管理
│   │   ├── registration.js          # Worker 注册
│   │   ├── account-assigner.js      # 账户分配
│   │   ├── lifecycle-manager.js     # 生命周期管理
│   │   └── local-process-manager.js # 本地进程管理
│   ├── scheduler/                   # 调度器
│   │   └── task-scheduler.js        # 任务调度
│   ├── monitor/                     # 监控
│   │   └── heartbeat.js             # 心跳监控
│   ├── login/                       # 登录管理
│   │   └── login-handler.js         # 登录会话处理
│   └── database/                    # 数据库
│       ├── init.js                  # 初始化
│       ├── schema.sql               # 表结构
│       ├── migrations/              # 迁移脚本
│       └── *-dao.js                 # 数据访问对象
├── data/                            # 数据目录
│   └── master.db                    # SQLite 数据库
└── logs/                            # 日志目录
```

---

## 🧩 核心模块

### 1. Socket.IO 服务器

**文件**: `src/communication/socket-server.js`

**功能**:
- 初始化 Socket.IO 服务器
- 创建三个命名空间：`/worker`, `/admin`, `/client`
- 配置 CORS 和传输方式

**命名空间职责**:
- `/worker` - Worker 连接，接收心跳、登录数据、监控数据
- `/admin` - Admin Web 连接，发送登录请求、接收状态更新
- `/client` - Desktop/Mobile 客户端连接，推送通知

---

### 2. Worker 管理器

**文件**: `src/worker_manager/`

#### 2.1 注册管理 (`registration.js`)

**职责**:
- Worker 注册验证
- 存储到 `workers` 表
- 维护内存中的 Worker 缓存
- Worker 下线处理

#### 2.2 账户分配器 (`account-assigner.js`)

**职责**:
- 根据 Worker 能力（capabilities）分配账户
- 负载均衡（按 `assigned_accounts` 排序）
- 发送任务分配消息到 Worker

**分配策略**:
1. 查找支持该平台的 Worker
2. 按负载排序（assigned_accounts ASC）
3. 选择负载最低的 Worker
4. 更新数据库并发送任务

#### 2.3 生命周期管理器 (`lifecycle-manager.js`)

**职责**:
- 启动 Worker 进程（fork）
- 停止 Worker 进程（SIGTERM）
- 重启 Worker 进程
- 管理 Worker 配置

**支持操作**:
- `startWorker(workerId)` - 从配置启动 Worker
- `stopWorker(workerId)` - 优雅停止 Worker
- `restartWorker(workerId)` - 重启 Worker

---

### 3. 登录处理器

**文件**: `src/login/login-handler.js`

**职责**: 协调账户登录流程（二维码登录）

**核心方法**:
- `createLoginSession()` - 创建登录会话（5分钟有效期）
- `handleQRCodeReady()` - 接收二维码并广播给 Admin
- `handleLoginSuccess()` - 保存 Cookie、用户信息、指纹到数据库
- `handleLoginFailed()` - 处理登录失败
- `handleQRCodeRefreshed()` - 处理二维码刷新
- `cleanupExpiredSessions()` - 定时清理过期会话

**登录成功时保存的数据**:
- `accounts.credentials` - Cookie 数组（JSON）
- `accounts.user_info` - 用户信息（昵称、头像、抖音号等）
- `accounts.fingerprint` - 浏览器指纹配置
- `accounts.login_status` - 更新为 `logged_in`
- `accounts.last_login_time` - 登录时间
- `accounts.cookies_valid_until` - Cookie 有效期（默认7天）

---

### 4. 任务调度器

**文件**: `src/scheduler/task-scheduler.js`

**职责**: 定期检查并分配监控任务

**调度逻辑**:
1. 每 30 秒执行一次
2. 查询需要监控的账户：
   - `login_status = 'logged_in'`
   - `status = 'active'`
   - `assigned_worker_id IS NOT NULL`
3. 按 Worker 分组
4. 向每个 Worker 发送 `master:task:assign` 消息

---

### 5. 心跳监控

**文件**: `src/monitor/heartbeat.js`

**职责**: 监控 Worker 心跳，标记离线 Worker

**监控逻辑**:
1. 每 15 秒检查一次
2. 查询超过 30 秒未发送心跳的 Worker
3. 标记为 `offline`
4. 撤销该 Worker 的所有任务（`assigned_worker_id = NULL`）

---

## 💾 数据库设计

### 核心表结构

#### 1. accounts - 账户表

**用途**: 存储社交媒体账户信息和登录凭据

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| platform | TEXT | 平台名称（douyin, xiaohongshu） |
| account_name | TEXT | 账户名称 |
| account_id | TEXT | 平台账户ID（如抖音号） |
| credentials | TEXT | JSON: {cookies: [...]} |
| user_info | TEXT | JSON: {nickname, avatar, douyin_id, ...} |
| fingerprint | TEXT | JSON: 浏览器指纹配置 |
| status | TEXT | active/inactive |
| login_status | TEXT | not_logged_in/logging_in/logged_in/login_failed |
| monitor_interval | INTEGER | 监控间隔（秒） |
| last_login_time | INTEGER | 最后登录时间 |
| cookies_valid_until | INTEGER | Cookie 有效期 |
| assigned_worker_id | TEXT | 分配的 Worker ID |

**索引**:
- `idx_accounts_status`
- `idx_accounts_login_status`
- `idx_accounts_worker`
- `idx_accounts_platform_account`

#### 2. workers - Worker 节点表

**用途**: 存储 Worker 注册信息和状态

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | Worker ID |
| host | TEXT | 主机地址 |
| port | INTEGER | 端口 |
| status | TEXT | connected/disconnected/offline |
| assigned_accounts | INTEGER | 已分配账户数 |
| last_heartbeat | INTEGER | 最后心跳时间 |
| started_at | INTEGER | 启动时间 |
| version | TEXT | Worker 版本 |
| metadata | TEXT | JSON: 扩展信息 |

#### 3. login_sessions - 登录会话表

**用途**: 跟踪登录过程（临时数据）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 会话 ID (UUID) |
| account_id | TEXT | 关联账户 |
| worker_id | TEXT | 执行 Worker |
| status | TEXT | pending/scanning/success/failed/expired |
| login_method | TEXT | qrcode/password/cookie |
| qr_code_data | TEXT | 二维码 Base64 |
| qr_code_url | TEXT | 二维码 URL |
| error_message | TEXT | 错误信息 |
| expires_at | INTEGER | 过期时间（5分钟） |
| logged_in_at | INTEGER | 登录成功时间 |
| created_at | INTEGER | 创建时间 |

#### 4. comments - 评论表

**用途**: 存储监控到的评论

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| account_id | TEXT | 关联账户 |
| platform_comment_id | TEXT | 平台评论 ID |
| content | TEXT | 评论内容 |
| author_name | TEXT | 作者名称 |
| author_id | TEXT | 作者 ID |
| post_id | TEXT | 帖子 ID |
| post_title | TEXT | 帖子标题 |
| is_read | BOOLEAN | 是否已读 |
| detected_at | INTEGER | 检测时间 |
| created_at | INTEGER | 创建时间 |

#### 5. direct_messages - 私信表

**用途**: 存储监控到的私信

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| account_id | TEXT | 关联账户 |
| platform_message_id | TEXT | 平台消息 ID |
| content | TEXT | 消息内容 |
| sender_name | TEXT | 发送者名称 |
| sender_id | TEXT | 发送者 ID |
| direction | TEXT | inbound/outbound |
| is_read | BOOLEAN | 是否已读 |
| detected_at | INTEGER | 检测时间 |
| created_at | INTEGER | 创建时间 |

#### 6. worker_configs - Worker 配置表

**用途**: 存储 Worker 配置信息

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | Worker ID |
| max_accounts | INTEGER | 最大账户数 |
| headless | BOOLEAN | 无头模式 |
| env_vars | TEXT | JSON: 环境变量 |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

#### 7. worker_runtime - Worker 运行时状态表

**用途**: 存储 Worker 运行时状态

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | Worker ID |
| process_id | INTEGER | 进程 PID |
| status | TEXT | running/stopped/error |
| started_at | INTEGER | 启动时间 |
| stopped_at | INTEGER | 停止时间 |
| error_message | TEXT | 错误信息 |
| updated_at | INTEGER | 更新时间 |

#### 8. proxies - 代理服务器表

**用途**: 存储代理服务器配置

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | UUID |
| name | TEXT | 代理名称 |
| server | TEXT | host:port |
| protocol | TEXT | http/https/socks5 |
| username | TEXT | 用户名 |
| password | TEXT | 密码 |
| country | TEXT | 国家 |
| city | TEXT | 城市 |
| status | TEXT | active/inactive |
| success_rate | REAL | 成功率 |
| last_check_time | INTEGER | 最后检查时间 |
| response_time | INTEGER | 响应时间（毫秒） |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

---

## 🔌 通信协议

### Socket.IO 消息格式

#### Worker → Master 消息

| 消息类型 | 说明 | 数据字段 |
|---------|------|---------|
| `worker:register` | Worker 注册 | workerId, host, port, capabilities, maxAccounts, version |
| `worker:heartbeat` | 心跳 | workerId, stats, timestamp |
| `worker:login:qrcode` | 二维码就绪 | session_id, qr_code_data, qr_code_url |
| `worker:login:status` | 登录状态更新 | session_id, status, cookies, user_info, fingerprint |
| `worker:message:detected` | 监控数据 | type, account_id, messages |

#### Master → Worker 消息

| 消息类型 | 说明 | 数据字段 |
|---------|------|---------|
| `master:task:assign` | 任务分配 | accounts[] |
| `master:task:revoke` | 任务撤销 | accountIds[] |
| `master:login:start` | 登录请求 | sessionId, accountId, platform, proxy |

#### Admin Web ↔ Master 消息

**Admin → Master**:
| 消息类型 | 说明 | 数据字段 |
|---------|------|---------|
| `admin:login:start` | 发起登录 | accountId, workerId |
| `admin:request:login-sessions` | 请求登录会话列表 | - |

**Master → Admin**:
| 消息类型 | 说明 | 数据字段 |
|---------|------|---------|
| `login:qrcode:ready` | 二维码就绪 | session_id, account_id, qr_code_data, expires_at |
| `login:success` | 登录成功 | session_id, account_id, user_info, logged_in_at |
| `login:failed` | 登录失败 | session_id, error_message, error_type |
| `login:qrcode:refreshed` | 二维码刷新 | session_id, qr_code_data |
| `login:qrcode:expired` | 二维码过期 | session_id |

---

## 🔄 核心流程

### 流程 1: Worker 注册与心跳

```
┌─────────┐                           ┌─────────┐
│ Worker  │                           │ Master  │
└────┬────┘                           └────┬────┘
     │                                     │
     │  1. 连接 Socket.IO (/worker)       │
     ├────────────────────────────────────>│
     │                                     │
     │  2. worker:register                 │
     │     {workerId, capabilities, ...}   │
     ├────────────────────────────────────>│
     │                                     │
     │                             3. 存储到 workers 表
     │                             4. 缓存到内存
     │                                     │
     │  5. worker:registered               │
     │<────────────────────────────────────┤
     │                                     │
     │  6. worker:heartbeat (每10秒)       │
     ├────────────────────────────────────>│
     │                                     │
     │                             7. 更新 last_heartbeat
     │                                     │
     │                             8. HeartbeatMonitor 检查 (每15秒)
     │                                - 超过30秒无心跳 → offline
     │                                - 撤销该Worker的任务
     │                                     │
```

---

### 流程 2: 账户登录流程（完整）

```
┌─────────┐         ┌─────────┐         ┌─────────┐
│Admin Web│         │ Master  │         │ Worker  │
└────┬────┘         └────┬────┘         └────┬────┘
     │                   │                   │
     │ 1. admin:login:start                 │
     ├──────────────────>│                   │
     │                   │                   │
     │           2. 创建 login_sessions      │
     │              (status: pending)        │
     │                   │                   │
     │                   │ 3. master:login:start
     │                   ├──────────────────>│
     │                   │                   │
     │                   │           4. 启动 Browser
     │                   │           5. 访问登录页
     │                   │           6. 检测登录方式
     │                   │           7. 提取二维码
     │                   │                   │
     │                   │ 8. worker:login:qrcode
     │                   │<──────────────────┤
     │                   │   {qr_code_data}  │
     │           9. 更新 login_sessions      │
     │              (status: scanning)       │
     │                   │                   │
     │ 10. login:qrcode:ready                │
     │<──────────────────┤                   │
     │                   │                   │
     │ 11. 显示二维码    │                   │
     │                   │                   │
     │                   │           12. 轮询登录状态
     │                   │               (每2秒)
     │                   │                   │
     │ [用户扫码]        │                   │
     │                   │                   │
     │                   │           13. 检测到登录成功
     │                   │           14. 提取数据:
     │                   │               - cookies
     │                   │               - user_info
     │                   │               - fingerprint
     │                   │                   │
     │                   │ 15. worker:login:status
     │                   │<──────────────────┤
     │                   │   {status: success,
     │                   │    cookies, user_info,
     │                   │    fingerprint}
     │           16. 更新数据库:             │
     │               a. login_sessions       │
     │                  (status: success)    │
     │               b. accounts             │
     │                  - login_status       │
     │                  - credentials        │
     │                  - user_info          │
     │                  - fingerprint        │
     │                  - cookies_valid_until│
     │                   │                   │
     │ 17. login:success │                   │
     │<──────────────────┤                   │
     │   {user_info}     │                   │
     │                   │                   │
     │ 18. 关闭弹窗      │                   │
     │     刷新账户列表  │                   │
     │                   │                   │
```

---

### 流程 3: 任务调度与监控

```
┌─────────────┐              ┌─────────┐              ┌─────────┐
│TaskScheduler│              │ Master  │              │ Worker  │
└──────┬──────┘              └────┬────┘              └────┬────┘
       │                          │                        │
       │ 1. 定时器触发 (每30秒)   │                        │
       │                          │                        │
       │ 2. 查询需要监控的账户    │                        │
       │    (login_status=logged_in,                      │
       │     status=active)       │                        │
       │                          │                        │
       │ 3. 按 Worker 分组        │                        │
       │                          │                        │
       │ 4. 发送任务              │                        │
       ├─────────────────────────>│                        │
       │                          │                        │
       │                          │ 5. master:task:assign  │
       │                          ├───────────────────────>│
       │                          │   {accounts: [...]}    │
       │                          │                        │
       │                          │                 6. 创建 MonitorTask
       │                          │                 7. 计算随机间隔
       │                          │                    (15-30秒)
       │                          │                        │
       │                          │                 8. 执行监控:
       │                          │                    - 获取 Browser
       │                          │                    - 爬取评论
       │                          │                    - 爬取私信
       │                          │                        │
       │                          │ 9. worker:message:detected
       │                          │<───────────────────────┤
       │                          │   {type, account_id,   │
       │                          │    messages: [...]}    │
       │                  10. 存储到数据库:                │
       │                      - comments 表                │
       │                      - direct_messages 表         │
       │                          │                        │
       │                  11. 检查通知规则                │
       │                  12. 推送通知 (如需要)           │
       │                          │                        │
       │                          │                 13. 计算下次间隔
       │                          │                 14. 循环执行
       │                          │                        │
```

---

### 流程 4: Worker 离线处理

```
┌──────────────┐              ┌─────────┐
│HeartbeatMonitor              │ Master  │
└──────┬───────┘              └────┬────┘
       │                           │
       │ 1. 定时器触发 (每15秒)    │
       │                           │
       │ 2. 查询超时 Worker        │
       │    (last_heartbeat < now-30s)
       │                           │
       │ 3. 发现 worker-1 超时     │
       │                           │
       │ 4. 标记为 offline         │
       ├──────────────────────────>│
       │                           │
       │                    5. UPDATE workers
       │                       SET status='offline'
       │                           │
       │ 6. 撤销任务               │
       ├──────────────────────────>│
       │                           │
       │                    7. UPDATE accounts
       │                       SET assigned_worker_id=NULL
       │                       WHERE assigned_worker_id='worker-1'
       │                           │
       │ 8. 记录日志               │
       │    "Worker worker-1 marked as offline"
       │                           │
       │ 9. 等待下次调度重新分配   │
       │                           │
```

---

## 🚀 部署说明

### 环境变量

```bash
# .env 文件
PORT=3000
DB_PATH=./data/master.db
LOG_LEVEL=info
NODE_ENV=production
```

### 启动命令

**开发环境**:
```bash
npm run dev
# 或
node src/index.js
```

**生产环境 (PM2)**:
```bash
pm2 start src/index.js --name "hiscrm-master"
pm2 logs hiscrm-master
pm2 restart hiscrm-master
```

### 数据库初始化

- 首次启动会自动创建数据库和表
- 数据库位置: `packages/master/data/master.db`
- 迁移脚本自动执行: `src/database/migrations/`

### 日志

- 日志位置: `packages/master/logs/master.log`
- 查看日志: `tail -f packages/master/logs/master.log`

---

## 📊 HTTP API 端点

### 账户管理
- `GET /api/v1/accounts` - 获取账户列表
- `POST /api/v1/accounts` - 创建账户
- `PUT /api/v1/accounts/:id` - 更新账户
- `DELETE /api/v1/accounts/:id` - 删除账户

### Worker 管理
- `GET /api/v1/workers` - 获取 Worker 列表
- `GET /api/v1/workers/:id` - 获取 Worker 详情
- `POST /api/v1/workers/:id/lifecycle/start` - 启动 Worker
- `POST /api/v1/workers/:id/lifecycle/stop` - 停止 Worker
- `POST /api/v1/workers/:id/lifecycle/restart` - 重启 Worker

### 消息查询
- `GET /api/v1/messages/comments` - 获取评论列表
- `GET /api/v1/messages/direct-messages` - 获取私信列表

### 统计信息
- `GET /api/v1/statistics` - 获取系统统计
- `GET /api/v1/status` - 获取系统状态
- `GET /health` - 健康检查

---

## 🔐 安全性考虑

### 数据加密（待实现）
- Cookie 使用 AES-256 加密存储
- 敏感配置加密

### Socket.IO 认证（待实现）
- Token 验证
- 命名空间权限控制

### API 权限控制（待实现）
- JWT Token 认证
- 角色权限管理

---

## 📚 相关文档

- [Worker 端设计方案](./Worker端设计方案.md)
- [Admin Web 设计方案](./AdminWeb设计方案.md)
- [Shared 模块说明](./shared-模块说明.md)
- [快速开始指南](./QUICKSTART.md)

---

**文档版本**: 2.0.0
**最后更新**: 2025-10-16
**维护者**: 开发团队
