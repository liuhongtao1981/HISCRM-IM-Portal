# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 项目概述

HisCRM-IM 是一个基于 Master-Worker 架构的多平台社交媒体监控系统。支持实时监控抖音等平台的评论和私信，并通过桌面端（Electron）和移动端（React Native）客户端发送智能通知。

**核心创新**：每个被监控的账户都运行在独立的浏览器进程中，具有独特的浏览器指纹，实现 100% 隔离以避免平台检测。

## 系统架构

系统由三个主要层级组成：

1. **Master 主控服务器** (`packages/master`, 端口 3000)
   - 中央协调器，管理 Worker 生命周期、任务调度和客户端通信
   - SQLite 数据库持久化 (`packages/master/data/master.db`)
   - Socket.IO 服务器，三个命名空间：`/admin`、`/worker`、`/client`

2. **Worker 工作进程** (`packages/worker`, 端口 4000+)
   - 使用 Playwright 进行浏览器自动化（注意：不是 Puppeteer，尽管 package.json 中有相关依赖）
   - 平台特定爬虫位于 `src/platforms/`（抖音、小红书等）
   - 多浏览器隔离：每个账户 = 独立的浏览器进程
   - React Fiber 数据提取技术用于虚拟列表组件

3. **客户端层**
   - Admin Web UI (`packages/admin-web`, 端口 3001) - React 18 + Ant Design
   - CRM PC IM (`packages/crm-pc-im`) - Electron 桌面客户端 + Vite
   - CRM IM Server (`packages/crm-im-server`) - 传统 WebSocket 服务器，用于 PC/移动端

4. **共享代码** (`packages/shared`)
   - 协议定义位于 `protocol/messages.js` 和 `protocol/events.js`
   - 数据模型和工具函数

## 开发命令

### 初始化设置
```bash
# 安装所有依赖（根目录 + 所有 packages）
npm run install:all

# 或手动安装
npm install
npm run install:packages
```

### 运行服务

```bash
# 启动 Master 服务器（端口 3000）
npm run start:master
# 或：cd packages/master && npm start

# 启动 Worker 进程（端口 4000）
npm run start:worker
# 或：cd packages/worker && npm start

# 启动 Admin Web UI（端口 3001）
npm run start:admin
# 或：cd packages/admin-web && npm start

# 启动 CRM PC IM（Electron + Vite 开发服务器）
cd packages/crm-pc-im && npm run dev

# 并发启动所有服务
npm run dev        # Master + Worker
npm run dev:all    # Master + Worker + Admin
```

### 测试

```bash
# 运行所有工作区的测试
npm test

# 测试特定 package
npm run test --workspace=packages/master
npm run test --workspace=packages/worker
npm run test --workspace=packages/shared

# 或进入 package 目录
cd packages/master && npm test
cd packages/worker && npm test

# 开发时的监听模式
cd packages/master && npm test -- --watch

# 生成覆盖率报告
cd packages/master && npm test -- --coverage
```

### 数据库管理

```bash
# 清理/重置 Master 数据库
cd packages/master && npm run clean:db
```

### 生产部署

```bash
# 构建生产版本
npm run build

# 使用 PM2 部署
pm2 start packages/master/src/index.js --name hiscrm-master
pm2 start packages/worker/src/index.js --name hiscrm-worker-1 -- --worker-id worker-1 --port 4001

# 多个 Worker
pm2 start packages/worker/src/index.js --name hiscrm-worker-2 -- --worker-id worker-2 --port 4002
pm2 start packages/worker/src/index.js --name hiscrm-worker-3 -- --worker-id worker-3 --port 4003

# 监控
pm2 monit
pm2 logs
```

## 代码架构

### 通信协议

所有 Master-Worker 和 Master-Client 通信使用 Socket.IO，预定义的消息类型在 `packages/shared/protocol/messages.js` 中：

- **Worker → Master**：`WORKER_REGISTER`、`WORKER_HEARTBEAT`、`WORKER_MESSAGE_DETECTED`、`WORKER_ACCOUNT_STATUS`
- **Master → Worker**：`MASTER_TASK_ASSIGN`、`MASTER_TASK_REVOKE`、`MASTER_ACCOUNT_LOGOUT`
- **Client ↔ Master**：`CLIENT_CONNECT`、`CLIENT_SYNC_REQUEST`、`MASTER_NOTIFICATION_PUSH`

使用 `createMessage()` 辅助函数创建格式正确的消息。

### Master 服务器结构

```
packages/master/src/
├── index.js                    # 入口文件，初始化所有组件
├── api/routes/                 # HTTP REST API 端点
├── communication/              # Socket.IO 服务器和消息处理器
│   ├── socket-server.js        # Socket.IO 初始化
│   ├── message-receiver.js     # 处理 Worker 消息
│   └── notification-broadcaster.js
├── database/                   # 数据访问层
│   ├── init.js                 # 数据库初始化
│   ├── schema.sql              # 最终 schema（v1.0，无迁移）
│   ├── *-dao.js                # 每个表的数据访问对象
│   └── schema-validator.js     # Schema 完整性验证
├── worker_manager/             # Worker 生命周期管理
│   ├── registration.js         # Worker 注册
│   ├── account-assigner.js     # 将账户分配给 Worker
│   └── account-status-updater.js
├── scheduler/                  # 任务调度
├── monitor/                    # 心跳监控
└── login/                      # 二维码登录协调
```

**重要**：数据库使用最终 schema 方案（无迁移）。`schema.sql` 文件代表当前状态（v1.0）。如果需要修改 schema，直接更新 `schema.sql`，并使用 `schema-validator.js` 验证完整性。

### Worker 进程结构

```
packages/worker/src/
├── index.js                    # 入口文件
├── platforms/                  # 平台特定实现
│   ├── base/
│   │   ├── platform-base.js    # 平台的抽象基类
│   │   └── worker-bridge.js    # Worker 与 Platform 之间的桥接
│   ├── douyin/                 # 抖音（中国版 TikTok）实现
│   │   ├── platform.js         # 主平台类
│   │   ├── crawl-comments.js
│   │   ├── crawl-direct-messages-v2.js
│   │   └── send-reply-*.js     # 回复功能
│   └── xiaohongshu/            # 小红书平台
├── browser/                    # 多浏览器隔离管理器
├── handlers/                   # 任务执行处理器
│   ├── task-runner.js
│   ├── account-initializer.js
│   └── account-status-reporter.js
├── communication/              # Socket.IO 客户端
│   ├── socket-client.js
│   ├── registration.js
│   └── heartbeat.js
├── services/                   # 支持服务
│   └── cache-manager.js        # 本地 SQLite 缓存
└── debug/                      # 调试工具
    └── chrome-devtools-mcp.js  # Chrome DevTools 集成
```

**核心概念 - 多浏览器架构**：每个账户都有独立的浏览器进程，包含：
- 用户数据目录：`./data/browser/{worker-id}/browser_{account-id}/`
- 指纹配置：`./data/browser/{worker-id}/fingerprints/{account-id}_fingerprint.json`
- 存储状态（cookies）：`./data/browser/{worker-id}/storage-states/{account-id}_storage.json`

内存使用：每个账户约 200MB。推荐：每个 Worker ≤10 个账户。

### 平台系统

Worker 使用插件架构支持多平台。添加新平台的步骤：

1. 继承 `PlatformBase` 类（`packages/worker/src/platforms/base/platform-base.js`）
2. 实现必需方法：
   - `getName()` - 平台标识符（如 'douyin'）
   - `login(accountId)` - 处理登录流程
   - `startMonitoring(accountId)` - 启动周期性监控
   - `stopMonitoring(accountId)` - 停止监控
   - `crawlComments(accountId)` - 爬取评论数据
   - `crawlDirectMessages(accountId)` - 爬取私信

3. 在 `packages/worker/src/platform-manager.js` 中注册

详细说明请参见 `docs/04-WORKER-平台扩展指南.md`。

### React Fiber 数据提取

对于使用 React 虚拟列表的平台（如抖音），系统通过 React Fiber 内部机制提取数据：

```javascript
// 从 DOM 元素访问 Fiber 对象
const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));
const fiber = element[fiberKey];

// 遍历查找数据
const messageData = fiber.return.return.memoizedProps;
```

三层回退策略：API 拦截 → React Fiber → DOM 解析。实现细节请参见 `docs/05-DOUYIN-平台实现技术细节.md`。

### 数据库 Schema

Master 数据库（`packages/master/data/master.db`）包含 16 个表：

**核心表**：
- `accounts`（29 列）- 社交媒体账户凭证
- `workers`（9 列）- Worker 进程注册表
- `worker_configs`（30 列）- Worker 配置
- `worker_runtime`（22 列）- 运行时状态
- `comments`（14 列）- 爬取的评论数据
- `direct_messages`（18 列）- 爬取的私信数据
- `conversations`（12 列）- 会话元数据
- `replies`（26 列）- 回复任务记录
- `notifications`（10 列）- 通知队列
- `login_sessions`（11 列）- 登录会话跟踪

**关键特性**：
- UUID 主键（支持分布式）
- 复合唯一约束（platform + account_id + message_id）
- 外键关系，支持 CASCADE/SET NULL
- 针对常见查询优化的索引
- 启用 WAL 模式（并发读写）

通过 `packages/master/src/database/*-dao.js` 中的 DAO 类访问。永远不要在 DAO 之外编写原始 SQL 查询。

## 环境变量

在每个 package 目录中创建 `.env` 文件：

**Master** (`packages/master/.env`)：
```
PORT=3000
NODE_ENV=development
DB_PATH=./data/master.db
```

**Worker** (`packages/worker/.env`)：
```
WORKER_ID=worker-1
WORKER_PORT=4000
MASTER_HOST=localhost
MASTER_PORT=3000
```

**Admin Web** (`packages/admin-web/.env`)：
```
REACT_APP_API_URL=http://localhost:3000
REACT_APP_WS_URL=ws://localhost:3000
```

## 文档

`docs/` 目录包含全面的文档（8 份核心文档 176KB + 46 份归档）：

**必读文档**：
- `02-MASTER-系统文档.md` - Master 服务器完整设计
- `03-WORKER-系统文档.md` - Worker 架构和多浏览器设计
- `04-WORKER-平台扩展指南.md` - 平台扩展指南
- `05-DOUYIN-平台实现技术细节.md` - 抖音实现（React Fiber 等）
- `06-WORKER-爬虫调试指南.md` - 爬虫调试指南
- `07-DOUYIN-消息回复功能技术总结.md` - 回复功能实现

**API 文档**（用于 CRM-IM 集成）：
- `15-Master新增IM兼容层设计方案.md` - IM 兼容层设计
- `16-三种适配方案对比和决策表.md` - 适配方案对比
- `API对比总结-原版IM-vs-Master.md` - API 对比分析

修改核心组件或添加新平台时请参考文档。

## 反检测机制

系统实现了多种反检测策略：

1. **随机间隔**：15-30 秒随机监控间隔（相对于固定间隔）
2. **浏览器指纹**：每个账户随机化 15+ 种指纹属性：
   - User-Agent、视口、WebGL 供应商/渲染器
   - Canvas/AudioContext 指纹
   - 时区、语言、硬件并发数
   - 存储在 `{account-id}_fingerprint.json` 中以保持一致性
3. **人类行为模拟**：随机滚动、延迟、鼠标移动
4. **代理支持**：HTTP/HTTPS/SOCKS5 代理轮换
5. **Cookie 持久化**：跨重启维护登录会话

开发爬虫时，始终保留这些反检测措施。

## 常见工作流程

### 添加新平台

1. 创建新目录：`packages/worker/src/platforms/{平台名称}/`
2. 创建 `platform.js` 继承 `PlatformBase`
3. 实现登录、监控和爬取方法
4. 在 `platform-manager.js` 中注册
5. 更新 `accounts` 表以支持平台标识符
6. 添加测试和文档

### 修改数据库 Schema

1. 编辑 `packages/master/src/database/schema.sql`
2. 更新对应的 DAO 文件
3. 运行验证：`node packages/master/src/database/schema-validator.js`
4. 如需要，更新 `packages/shared/models/` 中的模型
5. 在提交消息中记录迁移步骤

### 调试 Worker 问题

```bash
# 在 Worker 中启用调试模式
cd packages/worker
export DEBUG=true
export DEBUG_PORT=9222  # Chrome DevTools 端口
npm run dev

# Worker 在端口 9222 暴露 Chrome DevTools
# 通过 chrome://inspect 或 Playwright Inspector 连接
```

使用 `packages/worker/src/debug/chrome-devtools-mcp.js` 进行基于 MCP 的调试。

## 测试说明

- Master 测试使用 `jest` + `supertest` 进行 API 测试
- Worker 测试模拟 Playwright 浏览器上下文
- Admin-Web 使用 `react-scripts test`（Jest + React Testing Library）
- Shared package 对协议和工具函数进行单元测试

添加新功能时：
1. 在同一 package 中添加单元测试
2. 如需要，在 `tests/` 目录中添加集成测试
3. 更新 package README 中的测试文档

## 性能考虑

- **Worker 内存**：每个账户浏览器约 200MB。使用 `pm2 monit` 监控
- **数据库**：SQLite WAL 模式处理约 1000 个并发操作。更高负载请考虑迁移到 PostgreSQL
- **Socket.IO**：保持消息负载 < 1MB。大数据应通过 HTTP API 获取
- **浏览器上下文**：尽可能重用上下文。关闭未使用的浏览器以释放内存

## 安全注意事项

- 凭证在存储前使用 AES-256 加密
- 生产环境中 Socket.IO 使用 WSS（而非 WS）
- 客户端认证使用 JWT 令牌（参见 `packages/master/src/api/auth/`）
- 永远不要记录敏感数据（密码、cookies、令牌）
- 代理凭证在 `proxies` 表中加密存储

## Package 依赖管理

这是一个 npm workspaces monorepo。添加依赖时：

```bash
# 添加到特定 package
npm install <package> --workspace=packages/master

# 添加到 shared（所有 package 都可访问）
npm install <package> --workspace=packages/shared

# 添加开发依赖到根目录
npm install -D <package>
```

共享依赖应放在 `packages/shared` 中以避免重复。

## 故障排除

**数据库锁定错误**：
- 检查僵尸进程：`lsof packages/master/data/master.db`（macOS/Linux）或使用任务管理器（Windows）
- 确保启用 WAL 模式：`db.pragma('journal_mode = WAL')`

**Worker 无法连接到 Master**：
- 验证 Master 在正确端口运行
- 检查 Worker .env 中的 MASTER_HOST 和 MASTER_PORT
- 查看日志中的 Socket.IO 连接错误

**Worker 上的浏览器崩溃**：
- 内存限制达到（>10 个账户）。使用更多 Worker 横向扩展
- 检查平台特定脚本是否有无限循环
- 启用调试模式以捕获浏览器控制台错误

**Admin UI 中没有显示数据**：
- 检查 Socket.IO 命名空间：Admin 连接到 `/admin`
- 验证 `notification-broadcaster.js` 中的通知广播
- 检查浏览器控制台的 WebSocket 连接状态
