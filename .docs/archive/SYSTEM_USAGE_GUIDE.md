# HisCrm-IM 系统使用说明

**版本**: 1.0.0
**日期**: 2025-10-12
**适用人员**: 系统管理员、开发人员、运维人员

---

## 目录

1. [系统架构](#系统架构)
2. [快速启动](#快速启动)
3. [账号登录流程](#账号登录流程)
4. [代理配置](#代理配置)
5. [监控和运维](#监控和运维)
6. [错误处理](#错误处理)
7. [API 文档](#api-文档)
8. [故障排查](#故障排查)

---

## 系统架构

### 组件说明

```
┌─────────────┐
│  Admin Web  │ (管理后台 - 浏览器)
└──────┬──────┘
       │ Socket.IO (/admin)
       │
┌──────▼──────┐
│   Master    │ (主控服务器 - 端口3000)
│  - 任务调度  │
│  - 账号管理  │
│  - 登录管理  │
└──────┬──────┘
       │ Socket.IO (/worker)
       │
┌──────▼──────┐
│   Worker    │ (工作节点 - 可多个)
│  - 浏览器   │
│  - 爬虫    │
│  - 登录    │
└─────────────┘
```

### 数据库

- **Master**: `data/master.db` (SQLite)
  - accounts (账号表)
  - workers (Worker节点表)
  - login_sessions (登录会话表)
  - comments (评论表)
  - direct_messages (私信表)
  - notifications (通知队列表)
  - proxies (代理服务器表)

- **Worker**: 无数据库,状态保存在文件
  - `data/browser/账号ID_state.json` (浏览器状态)

---

## 快速启动

### 1. 环境要求

- **Node.js**: 18.x LTS
- **操作系统**: Windows 11 / Linux / macOS
- **浏览器**: Chromium (Playwright 自动下载)

### 2. 安装依赖

```bash
# 根目录安装
npm install

# 或分别安装
cd packages/master && npm install
cd packages/worker && npm install
cd packages/shared && npm install
```

### 3. 启动服务

#### 方式一: 分别启动 (推荐用于开发)

```bash
# 终端 1: 启动 Master
cd packages/master
npm start

# 终端 2: 启动 Worker
cd packages/worker
npm start
```

#### 方式二: 使用 PM2 (推荐用于生产)

```bash
# 安装 PM2
npm install -g pm2

# 启动 Master
pm2 start packages/master/src/index.js --name "hiscrm-master"

# 启动 Worker (可启动多个)
pm2 start packages/worker/src/index.js --name "hiscrm-worker-1"
pm2 start packages/worker/src/index.js --name "hiscrm-worker-2"

# 查看状态
pm2 list

# 查看日志
pm2 logs

# 保存配置
pm2 save
pm2 startup
```

### 4. 验证启动

**Master 启动成功标志**:
```
╔═══════════════════════════════════════════╗
║  Master Server Started                    ║
╠═══════════════════════════════════════════╣
║  Port: 3000                               ║
║  Environment: development                 ║
║  Namespaces: /worker, /client, /admin     ║
╚═══════════════════════════════════════════╝
```

**Worker 启动成功标志**:
```
╔═══════════════════════════════════════════╗
║  Worker Ready                             ║
╚═══════════════════════════════════════════╝
✓ Connected to master
✓ Registered with master (X accounts assigned)
```

---

## 账号登录流程

### 1. 添加账号

使用 API 或数据库添加账号:

```bash
# 使用 curl 添加账号
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "douyin",
    "account_name": "测试账号",
    "account_id": "test-account-001",
    "login_status": "not_logged_in",
    "monitor_interval": 30
  }'
```

或直接插入数据库:

```sql
INSERT INTO accounts (
  id, platform, account_name, account_id,
  credentials, status, login_status,
  monitor_interval, created_at, updated_at
) VALUES (
  'acc-' || lower(hex(randomblob(16))),
  'douyin',
  '测试账号',
  'test-account-001',
  '{}',
  'active',
  'not_logged_in',
  30,
  unixepoch(),
  unixepoch()
);
```

### 2. 通过 Admin Web 发起登录

**前端代码示例**:

```javascript
// 连接到 Master
const socket = io('http://localhost:3000/admin');

// 认证
socket.emit('admin:auth', {
  username: 'admin',
  password: 'admin123'
});

// 发起登录
socket.emit('admin:login:start', {
  account_id: 'acc-8eac7c30-1fc2-4036-81f9-dcf605b132f8',
  session_id: `session-${Date.now()}`
});

// 监听二维码
socket.on('login:qrcode:ready', (data) => {
  console.log('收到二维码:', data);
  // data.qr_code_data 是 Base64 编码的图片
  // 显示给用户扫描
  const img = document.createElement('img');
  img.src = `data:image/png;base64,${data.qr_code_data}`;
  document.body.appendChild(img);
});

// 监听二维码刷新
socket.on('login:qrcode:refreshed', (data) => {
  console.log('二维码已刷新:', data);
  // 更新显示的二维码
  const img = document.querySelector('img');
  img.src = `data:image/png;base64,${data.qr_code_data}`;
});

// 监听登录成功
socket.on('login:success', (data) => {
  console.log('登录成功:', data);
  alert('登录成功!');
});

// 监听登录失败
socket.on('login:failed', (data) => {
  console.error('登录失败:', data);
  alert(`登录失败: ${data.error_message} (${data.error_type})`);
});
```

### 3. 登录流程说明

```
用户操作              系统响应
───────────────────────────────────────────────
1. 点击"登录"
                    → Master 创建登录会话
                    → Master 分配 Worker
                    → Worker 打开浏览器
                    → Worker 访问抖音首页

2. 等待二维码
                    → Worker 截取二维码
                    → Worker 发送到 Master
                    → Master 推送到 Admin Web

3. 显示二维码
   用户扫描二维码
                    → Worker 轮询登录状态

4a. 扫码成功
                    → Worker 检测到登录
                    → Worker 保存 Cookies
                    → Worker 通知 Master
                    → Master 更新数据库
                    → Master 推送成功消息

4b. 二维码过期 (150秒)
                    → Worker 检测过期
                    → Worker 刷新页面
                    → Worker 重新截取二维码
                    → Worker 发送新二维码
                    → Master 推送刷新消息
                    (最多刷新 3 次)

4c. 登录超时 (5分钟)
                    → Worker 停止轮询
                    → Worker 通知失败
                    → Master 推送失败消息
```

### 4. 登录状态说明

| 状态 | 说明 |
|------|------|
| `not_logged_in` | 未登录 |
| `logging_in` | 登录中 |
| `logged_in` | 已登录 |
| `login_failed` | 登录失败 |
| `cookies_expired` | Cookies 过期 |

---

## 代理配置

### 1. 添加代理

```sql
-- 添加主代理
INSERT INTO proxies (
  id, name, server, protocol,
  username, password, status,
  success_rate, created_at, updated_at
) VALUES (
  'proxy-001',
  '主代理服务器',
  '127.0.0.1:8080',
  'http',
  'proxy_user',
  'proxy_password',
  'active',
  1.0,
  unixepoch(),
  unixepoch()
);

-- 绑定代理到账号
UPDATE accounts
SET proxy_id = 'proxy-001'
WHERE id = 'acc-8eac7c30-1fc2-4036-81f9-dcf605b132f8';
```

### 2. 代理协议支持

- **HTTP**: `http://proxy-server:port`
- **HTTPS**: `https://proxy-server:port`
- **SOCKS5**: `socks5://proxy-server:port`

### 3. 代理降级策略

系统会自动按以下顺序尝试:

1. **主代理** (accounts.proxy_id)
   - 健康检查: 10秒超时
   - 缓存: 5分钟

2. **备用代理** (proxies.fallback_server)
   - 主代理失败时自动切换
   - 同样进行健康检查

3. **直连** (无代理)
   - 所有代理失败时降级
   - 可通过配置禁用

### 4. 代理健康监控

```javascript
// 手动触发健康检查 (Worker 端)
const proxyManager = loginHandler.proxyManager;

// 检查单个代理
const health = await proxyManager.checkProxyHealth({
  server: '127.0.0.1:8080',
  username: 'user',
  password: 'pass'
});
console.log('代理健康状态:', health);

// 获取所有代理健康状态
const allStatus = proxyManager.getAllHealthStatus();
console.log('所有代理状态:', allStatus);

// 清除缓存
proxyManager.clearHealthCache('127.0.0.1:8080');
```

---

## 监控和运维

### 1. 日志查看

**Master 日志**:
```bash
cd packages/master
npm start | tee master.log
```

**Worker 日志**:
```bash
cd packages/worker
npm start | tee worker.log
```

**PM2 日志**:
```bash
pm2 logs hiscrm-master
pm2 logs hiscrm-worker-1
```

### 2. 日志级别

系统使用以下日志级别:

- `debug`: 详细调试信息
- `info`: 一般信息
- `warn`: 警告信息
- `error`: 错误信息

### 3. 关键监控指标

#### Master 监控

```bash
# Worker 在线数量
curl http://localhost:3000/api/workers | jq '.[] | select(.status=="online") | .id'

# 账号状态分布
curl http://localhost:3000/api/accounts | jq 'group_by(.login_status) | map({status: .[0].login_status, count: length})'

# 登录会话状态
curl http://localhost:3000/api/login-sessions
```

#### Worker 监控

观察日志中的以下信息:

- CPU 使用率: `"cpu_usage": 14.53`
- 内存使用: `"memory_usage": 23`
- 活跃任务数: `"active_tasks": 2`
- 心跳时间: `Heartbeat received from worker-xxx`

### 4. 数据库备份

```bash
# 备份 Master 数据库
cp packages/master/data/master.db packages/master/data/master.db.backup-$(date +%Y%m%d-%H%M%S)

# 定时备份 (crontab)
0 2 * * * /path/to/backup-script.sh
```

### 5. 清理过期数据

```sql
-- 清理 7 天前的通知
DELETE FROM notifications
WHERE is_sent = 1
AND sent_at < unixepoch() - 7*24*3600;

-- 清理失败的登录会话
DELETE FROM login_sessions
WHERE status = 'failed'
AND created_at < unixepoch() - 24*3600;

-- 清理过期的评论 (已读且超过30天)
DELETE FROM comments
WHERE is_read = 1
AND detected_at < unixepoch() - 30*24*3600;
```

---

## 错误处理

### 1. 错误类型

系统定义了 18 种错误类型:

| 错误类型 | 说明 | 是否重试 |
|---------|------|---------|
| `network_error` | 网络连接失败 | ✅ 是 |
| `network_timeout` | 网络超时 | ✅ 是 |
| `proxy_error` | 代理连接失败 | ✅ 是 (降级) |
| `proxy_timeout` | 代理超时 | ✅ 是 (降级) |
| `timeout_error` | 操作超时 | ✅ 是 |
| `page_load_timeout` | 页面加载超时 | ✅ 是 |
| `navigation_timeout` | 导航超时 | ✅ 是 |
| `qr_code_expired` | 二维码过期 | ✅ 是 (刷新) |
| `qr_code_not_found` | 二维码未找到 | ✅ 是 |
| `page_error` | 页面错误 | ⚠️ 视情况 |
| `page_crashed` | 页面崩溃 | ❌ 否 |
| `browser_crashed` | 浏览器崩溃 | ❌ 否 |
| `login_timeout` | 登录超时 | ❌ 否 |
| `login_cancelled` | 登录取消 | ❌ 否 |

### 2. 重试策略

系统使用指数退避 + 随机抖动:

```javascript
// 延迟计算公式
delay = baseDelay × 2^(attempt - 1) × (1 ± 20% random jitter)

// 预定义策略
network:       3次重试, 基础延迟 1秒,  最大延迟 10秒
pageLoad:      3次重试, 基础延迟 2秒,  最大延迟 15秒
elementSearch: 5次重试, 基础延迟 500ms, 最大延迟 3秒
```

**重试示例**:
```
尝试 1: 立即执行
尝试 2: 延迟 ~1秒 (0.8-1.2秒)
尝试 3: 延迟 ~2秒 (1.6-2.4秒)
尝试 4: 延迟 ~4秒 (3.2-4.8秒)
```

### 3. 二维码刷新机制

- **检测周期**: 每 2 秒检查一次
- **过期时间**: 150 秒 (2分30秒)
- **最大刷新次数**: 3 次
- **刷新流程**:
  1. 检测到过期
  2. 停止当前轮询
  3. 刷新页面
  4. 重新截取二维码
  5. 发送新二维码
  6. 重新开始轮询

### 4. 错误处理流程

```
错误发生
    ↓
ErrorClassifier 分类
    ↓
判断是否可重试
    ↓
┌─────────┬─────────┐
│  可重试  │  不可重试 │
└────┬────┴────┬────┘
     ↓         ↓
应用重试策略   记录错误
     ↓         ↓
重新执行      通知用户
     ↓         ↓
成功/失败    清理资源
```

---

## API 文档

### 1. 账号管理 API

#### 获取所有账号

```http
GET /api/accounts
```

**响应**:
```json
[
  {
    "id": "acc-8eac7c30-1fc2-4036-81f9-dcf605b132f8",
    "platform": "douyin",
    "account_name": "测试账号",
    "account_id": "test-001",
    "status": "active",
    "login_status": "logged_in",
    "monitor_interval": 30,
    "assigned_worker_id": "worker-f94d0db2",
    "proxy_id": "proxy-001",
    "created_at": 1760213005,
    "updated_at": 1760213005
  }
]
```

#### 添加账号

```http
POST /api/accounts
Content-Type: application/json

{
  "platform": "douyin",
  "account_name": "新账号",
  "account_id": "new-account-001",
  "monitor_interval": 30
}
```

#### 更新账号

```http
PUT /api/accounts/:id
Content-Type: application/json

{
  "account_name": "更新的名称",
  "status": "active",
  "monitor_interval": 60
}
```

#### 删除账号

```http
DELETE /api/accounts/:id
```

### 2. Worker 管理 API

#### 获取所有 Worker

```http
GET /api/workers
```

**响应**:
```json
[
  {
    "id": "worker-f94d0db2",
    "host": "127.0.0.1",
    "port": 4000,
    "status": "online",
    "assigned_accounts": 1,
    "last_heartbeat": 1760213023,
    "started_at": 1760213023,
    "version": "1.0.0",
    "metadata": {
      "capabilities": ["douyin"],
      "max_accounts": 10,
      "active_tasks": 1,
      "memory_usage": 23,
      "cpu_usage": 14.53
    }
  }
]
```

### 3. 登录会话 API

#### 获取登录会话

```http
GET /api/login-sessions/:session_id
```

**响应**:
```json
{
  "id": "session-1760213024496",
  "account_id": "acc-8eac7c30-1fc2-4036-81f9-dcf605b132f8",
  "worker_id": "worker-f94d0db2",
  "status": "scanning",
  "login_method": "qrcode",
  "qr_code_data": "data:image/png;base64,...",
  "expires_at": 1760213324,
  "created_at": 1760213024
}
```

### 4. Socket.IO 事件

#### Admin Namespace (`/admin`)

**客户端 → 服务器**:
```javascript
// 认证
socket.emit('admin:auth', {
  username: 'admin',
  password: 'admin123'
});

// 发起登录
socket.emit('admin:login:start', {
  account_id: 'acc-xxx',
  session_id: 'session-xxx'
});
```

**服务器 → 客户端**:
```javascript
// 认证结果
socket.on('admin:auth:success', (data) => {});
socket.on('admin:auth:failed', (data) => {});

// 二维码就绪
socket.on('login:qrcode:ready', (data) => {
  // data.session_id
  // data.qr_code_data (Base64)
  // data.qr_code_url (可选)
});

// 二维码刷新
socket.on('login:qrcode:refreshed', (data) => {
  // data.session_id
  // data.qr_code_data (Base64)
  // data.refresh_count
});

// 登录成功
socket.on('login:success', (data) => {
  // data.session_id
  // data.account_id
  // data.cookies_valid_until
});

// 登录失败
socket.on('login:failed', (data) => {
  // data.session_id
  // data.error_message
  // data.error_type
});
```

---

## 故障排查

### 1. Master 无法启动

**症状**: Master 启动失败或崩溃

**可能原因**:
- 端口 3000 被占用
- 数据库文件损坏
- 权限不足

**解决方法**:
```bash
# 检查端口占用
netstat -ano | findstr 3000

# 修改端口 (packages/master/src/config.js)
PORT: process.env.PORT || 3001

# 检查数据库
sqlite3 packages/master/data/master.db "PRAGMA integrity_check;"

# 备份并重建数据库
mv packages/master/data/master.db packages/master/data/master.db.old
npm start  # 会自动创建新数据库
```

### 2. Worker 无法连接 Master

**症状**: Worker 显示 "Connection failed" 或 "Connected" 后立即断开

**可能原因**:
- Master 未启动
- 网络配置错误
- 防火墙阻止

**解决方法**:
```bash
# 检查 Master 是否运行
curl http://localhost:3000/api/workers

# 检查 Worker 配置 (packages/worker/src/config.js)
MASTER_URL: process.env.MASTER_URL || 'http://localhost:3000'

# 测试连接
telnet localhost 3000

# 检查防火墙
# Windows
netsh advfirewall firewall add rule name="HisCrm-IM" dir=in action=allow protocol=TCP localport=3000

# Linux
sudo ufw allow 3000/tcp
```

### 3. 浏览器启动失败

**症状**: Worker 日志显示 "Failed to launch browser"

**可能原因**:
- Playwright 浏览器未安装
- 系统依赖缺失
- 权限不足

**解决方法**:
```bash
# 安装 Playwright 浏览器
npx playwright install chromium

# Linux 安装系统依赖
npx playwright install-deps

# 检查浏览器
npx playwright open https://www.baidu.com

# 使用系统 Chrome (packages/worker/src/browser/browser-manager.js)
channel: 'chrome'  # 或 'msedge'
```

### 4. 二维码无法显示

**症状**: 登录时没有收到二维码

**可能原因**:
- 页面加载失败
- 元素选择器变化
- 网络问题

**解决方法**:
```javascript
// 1. 开启 headless: false 查看浏览器
// packages/worker/src/browser/browser-manager.js
headless: false

// 2. 截取整个页面调试
await page.screenshot({ path: 'debug.png', fullPage: true });

// 3. 检查元素选择器
const qrElement = await page.$('img[aria-label="二维码"]');
console.log('QR元素:', qrElement);

// 4. 增加等待时间
this.POPUP_WAIT_TIME = 10000;  // 从5秒增加到10秒
```

### 5. 登录后立即失效

**症状**: 显示登录成功,但 Cookies 立即过期

**可能原因**:
- Cookies 未正确保存
- 浏览器上下文被销毁
- 抖音检测到自动化

**解决方法**:
```javascript
// 1. 检查 Cookies 保存
const cookies = await context.cookies();
console.log('保存的 Cookies:', cookies);

// 2. 确保上下文不被销毁
// 不要在登录成功后立即关闭上下文

// 3. 添加更多浏览器伪装
const context = await browser.newContext({
  userAgent: '...',  // 真实的 User Agent
  viewport: { width: 1920, height: 1080 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  permissions: ['geolocation'],
});
```

### 6. 代理连接失败

**症状**: 日志显示 "Proxy connection failed"

**可能原因**:
- 代理服务器不可用
- 代理认证失败
- 协议不匹配

**解决方法**:
```bash
# 1. 测试代理连接
curl -x http://proxy_user:proxy_pass@127.0.0.1:8080 https://www.baidu.com

# 2. 检查代理配置
# 确保格式正确: protocol://server:port

# 3. 查看代理健康状态
# Worker 日志中搜索 "Proxy health check"

# 4. 清除代理缓存
proxyManager.clearHealthCache();

# 5. 禁用代理测试
# 临时将 allowDirectConnection 设为 true
```

### 7. 内存泄漏

**症状**: Worker 内存持续增长

**可能原因**:
- 浏览器上下文未关闭
- 页面未关闭
- 监听器未移除

**解决方法**:
```javascript
// 1. 确保清理资源
async cleanupSession(accountId, closeContext = true) {
  const session = this.loginSessions.get(accountId);
  if (!session) return;

  // 清理定时器
  if (session.pollInterval) {
    clearInterval(session.pollInterval);
  }

  // 关闭页面
  if (session.page) {
    await session.page.close().catch(() => {});
  }

  // 关闭上下文 (可选)
  if (closeContext) {
    await this.browserManager.closeContext(accountId);
  }

  // 删除会话
  this.loginSessions.delete(accountId);
}

// 2. 定期重启 Worker
pm2 restart hiscrm-worker-1 --cron "0 4 * * *"  # 每天凌晨4点重启

// 3. 监控内存使用
pm2 start src/index.js --name worker --max-memory-restart 500M
```

### 8. 高 CPU 使用率

**症状**: Worker CPU 使用率持续很高

**可能原因**:
- 轮询间隔太短
- 监控任务太多
- 浏览器渲染负载高

**解决方法**:
```javascript
// 1. 增加轮询间隔
this.LOGIN_CHECK_INTERVAL = 3000;  // 从2秒增加到3秒

// 2. 减少监控频率
monitor_interval: 60  // 从30秒增加到60秒

// 3. 启用 headless 模式
headless: true

// 4. 限制 Worker 账号数量
max_accounts: 5  // 每个 Worker 最多5个账号
```

---

## 配置文件

### Master 配置 (`packages/master/src/config.js`)

```javascript
module.exports = {
  // 服务器配置
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',

  // 数据库配置
  DATABASE_PATH: process.env.DB_PATH || './data/master.db',

  // Worker 配置
  WORKER_HEARTBEAT_TIMEOUT: 30000,  // 30秒
  WORKER_MAX_ACCOUNTS: 10,

  // 登录配置
  LOGIN_SESSION_TIMEOUT: 300000,  // 5分钟
  QR_CODE_LIFETIME: 150000,  // 2分30秒

  // Admin 配置
  ADMIN_USERNAME: process.env.ADMIN_USER || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASS || 'admin123',
};
```

### Worker 配置 (`packages/worker/src/config.js`)

```javascript
module.exports = {
  // Master 连接
  MASTER_URL: process.env.MASTER_URL || 'http://localhost:3000',

  // Worker 信息
  WORKER_ID: process.env.WORKER_ID || `worker-${randomId()}`,
  WORKER_HOST: process.env.WORKER_HOST || '127.0.0.1',
  WORKER_PORT: process.env.WORKER_PORT || 4000,

  // 浏览器配置
  BROWSER_HEADLESS: process.env.HEADLESS !== 'false',
  BROWSER_CHANNEL: process.env.BROWSER_CHANNEL || 'chromium',

  // 心跳配置
  HEARTBEAT_INTERVAL: 10000,  // 10秒

  // 重试配置
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_BASE_DELAY: 1000,
};
```

---

## 常见问题 FAQ

### Q1: 如何部署多个 Worker?

**A**:
```bash
# 方式 1: 使用不同的 WORKER_ID
WORKER_ID=worker-1 npm start &
WORKER_ID=worker-2 npm start &

# 方式 2: 使用 PM2
pm2 start src/index.js --name worker-1 -i 1
pm2 start src/index.js --name worker-2 -i 1
```

### Q2: 如何查看某个账号的登录状态?

**A**:
```bash
# 使用 API
curl http://localhost:3000/api/accounts/acc-xxx | jq '.login_status'

# 使用数据库
sqlite3 data/master.db "SELECT account_name, login_status FROM accounts WHERE id='acc-xxx';"
```

### Q3: 如何手动触发账号重新登录?

**A**:
```bash
# 1. 更新账号状态
curl -X PUT http://localhost:3000/api/accounts/acc-xxx \
  -H "Content-Type: application/json" \
  -d '{"login_status": "not_logged_in"}'

# 2. 通过 Admin Web 发起登录
# 或使用 Socket.IO 客户端发送登录请求
```

### Q4: 系统支持哪些社交媒体平台?

**A**: 当前版本支持:
- ✅ 抖音 (Douyin)
- ⏸️ 其他平台待开发 (小红书、微博、B站等)

### Q5: 如何备份和恢复数据?

**A**:
```bash
# 备份
tar -czf hiscrm-backup-$(date +%Y%m%d).tar.gz \
  packages/master/data/ \
  packages/worker/data/

# 恢复
tar -xzf hiscrm-backup-20251012.tar.gz
```

### Q6: 如何更新系统?

**A**:
```bash
# 1. 停止服务
pm2 stop all

# 2. 备份数据
./backup.sh

# 3. 拉取更新
git pull origin main

# 4. 安装依赖
npm install

# 5. 重启服务
pm2 restart all
```

### Q7: 如何开启调试模式?

**A**:
```bash
# 方式 1: 环境变量
DEBUG=* npm start

# 方式 2: 修改日志级别
# packages/shared/utils/logger.js
level: 'debug'

# 方式 3: 浏览器可见模式
# packages/worker/src/browser/browser-manager.js
headless: false
```

---

## 性能优化建议

### 1. 数据库优化

```sql
-- 创建索引
CREATE INDEX IF NOT EXISTS idx_comments_account_detected
  ON comments(account_id, detected_at);

CREATE INDEX IF NOT EXISTS idx_notifications_sent_created
  ON notifications(is_sent, created_at);

-- 定期 VACUUM
VACUUM;

-- 分析查询
EXPLAIN QUERY PLAN
SELECT * FROM accounts WHERE status = 'active';
```

### 2. Worker 负载均衡

```javascript
// 根据 Worker 负载分配账号
const workers = await getWorkers();
workers.sort((a, b) => a.assigned_accounts - b.assigned_accounts);
const assignedWorker = workers[0];  // 分配给负载最低的 Worker
```

### 3. 连接池配置

```javascript
// Socket.IO 优化
const io = new Server(httpServer, {
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e8,  // 100MB
  transports: ['websocket', 'polling'],
});
```

### 4. 缓存策略

```javascript
// 代理健康状态缓存
this.CACHE_DURATION = 5 * 60 * 1000;  // 5分钟

// 账号状态缓存
const accountCache = new Map();
setInterval(() => accountCache.clear(), 60000);  // 每分钟清理
```

---

## 安全建议

### 1. 密码管理

```bash
# 使用环境变量
export ADMIN_PASSWORD=$(openssl rand -base64 32)

# 或使用配置文件 (.env)
echo "ADMIN_PASSWORD=your-secure-password" > .env
```

### 2. 数据库加密

```bash
# 使用 SQLCipher
npm install @journeyapps/sqlcipher

# 设置密钥
PRAGMA key = 'your-encryption-key';
```

### 3. HTTPS 配置

```javascript
// Master HTTPS
const https = require('https');
const fs = require('fs');

const httpsServer = https.createServer({
  key: fs.readFileSync('ssl/private-key.pem'),
  cert: fs.readFileSync('ssl/certificate.pem'),
}, app);
```

### 4. IP 白名单

```javascript
// packages/master/src/middleware/ip-filter.js
const allowedIPs = ['127.0.0.1', '192.168.1.100'];

app.use((req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  if (!allowedIPs.includes(clientIP)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});
```

---

## 联系支持

- **文档**: 查看 `README.md` 和本文档
- **问题反馈**: [GitHub Issues](https://github.com/your-org/hiscrm-im/issues)
- **技术支持**: support@your-company.com

---

**文档版本**: 1.0.0
**最后更新**: 2025-10-12
**维护者**: 开发团队
