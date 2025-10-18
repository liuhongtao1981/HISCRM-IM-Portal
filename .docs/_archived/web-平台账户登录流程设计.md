# Web 平台账户登录流程设计文档

## 📋 概述

Web 平台（Admin Web）的账户登录功能允许管理员通过浏览器界面触发账户登录流程，支持二维码扫码登录。

访问地址: `http://localhost:3001/accounts` 和 `http://localhost:3001/login`

## 🏗️ 整体架构

```
Admin Web (React)
    ↓ (Socket.IO /admin namespace)
Master Server (Node.js)
    ↓ (Socket.IO /worker namespace)
Worker (Node.js)
    ↓ (Playwright)
Platform Script (douyin/platform.js)
    ↓
DouyinLoginHandler
    ↓
Browser (Chromium)
```

## 📱 页面结构

### 1. 账户管理页面 (`/accounts`)

**文件**: `packages/admin-web/src/pages/AccountsPage.js`

**功能**:
- 显示所有账户列表
- 添加/编辑/删除账户
- **启动登录流程** 按钮

**关键代码**:
```javascript
// 启动登录
const handleStartLogin = (account) => {
  if (!account.assigned_worker_id) {
    message.error('该账户尚未分配 Worker');
    return;
  }

  Modal.confirm({
    title: '启动登录流程',
    content: `确定要为账户 "${account.account_name}" 启动登录流程吗？`,
    okText: '启动',
    cancelText: '取消',
    onOk: () => {
      startLogin(account.id, account.assigned_worker_id);
    },
  });
};
```

**表格列**:
- ID
- 平台（douyin/xiaohongshu）
- 账户名称
- 账户ID
- 状态（active/inactive）
- 分配的 Worker
- 操作（登录/编辑/删除按钮）

### 2. 登录管理页面 (`/login`)

**文件**: `packages/admin-web/src/pages/LoginManagementPage.js`

**功能**:
- 显示所有登录会话列表
- 实时监控登录状态
- 自动弹出二维码模态框

**表格列**:
- 会话 ID
- 账户名称
- 平台
- 状态（pending/scanning/success/failed/expired）
- 登录方法（qrcode/password/cookie）
- Worker
- 创建时间
- 过期时间
- 错误信息

**自动刷新**:
```javascript
// 每 5 秒刷新一次
useEffect(() => {
  if (connected) {
    requestLoginSessions();
    const interval = setInterval(() => {
      requestLoginSessions();
    }, 5000);
    return () => clearInterval(interval);
  }
}, [connected, requestLoginSessions]);
```

### 3. 二维码模态框

**文件**: `packages/admin-web/src/components/QRCodeModal.js`

**功能**:
- 显示二维码图片
- 倒计时显示（5 分钟）
- 进度条动态显示剩余时间
- 扫码提示

**特性**:
- 自动打开（收到 QR 码数据时）
- 自动关闭（登录成功/失败/过期）
- 倒计时结束时自动过期

## 🔄 完整登录流程

### 步骤 1: 用户发起登录

**位置**: `AccountsPage.js`

```javascript
// 用户点击"登录"按钮
startLogin(account.id, account.assigned_worker_id)
```

### 步骤 2: Socket.IO 发送登录请求

**位置**: `socketContext.js`

```javascript
const startLogin = useCallback((accountId, workerId) => {
  if (socket) {
    // 生成会话 ID
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 发送到 Master
    socket.emit('master:login:start', {
      account_id: accountId,
      worker_id: workerId,
      session_id: sessionId,
    });
    
    message.info('正在启动登录流程...');
    return sessionId;
  }
}, [socket]);
```

**Socket.IO 事件**: `master:login:start`

**参数**:
```javascript
{
  account_id: 'account-uuid',
  worker_id: 'worker1',
  session_id: 'session-1234567890-abc123'
}
```

### 步骤 3: Master 处理登录请求

**位置**: `packages/master/src/socket/admin-namespace.js`

**流程**:

1. **验证认证状态**
```javascript
if (!socket.authenticated) {
  socket.emit('admin:error', { error: 'Not authenticated' });
  return;
}
```

2. **创建登录会话记录**
```javascript
const now = Math.floor(Date.now() / 1000);
const expiresAt = now + 300; // 5 分钟后过期

db.prepare(`
  INSERT INTO login_sessions (
    id, account_id, worker_id, status, expires_at, created_at, login_method
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(session_id, account_id, worker_id, 'pending', expiresAt, now, 'qrcode');
```

3. **更新账户状态**
```javascript
db.prepare('UPDATE accounts SET login_status = ? WHERE id = ?')
  .run('pending_login', account_id);
```

4. **查询 Worker 代理配置**
```javascript
const workerConfig = db.prepare(`
  SELECT wc.proxy_id, p.server, p.protocol, p.username, p.password, p.name
  FROM worker_configs wc
  LEFT JOIN proxies p ON wc.proxy_id = p.id
  WHERE wc.worker_id = ?
`).get(worker_id);

let proxyConfig = null;
if (workerConfig && workerConfig.server) {
  proxyConfig = {
    server: workerConfig.server,
    protocol: workerConfig.protocol,
    username: workerConfig.username || undefined,
    password: workerConfig.password || undefined,
  };
}
```

5. **转发请求到 Worker**
```javascript
const workerNamespace = io.of('/worker');
const workerSockets = await workerNamespace.fetchSockets();

// 找到对应的 Worker
for (const workerSocket of workerSockets) {
  if (workerSocket.workerId === worker_id) {
    workerSocket.emit('master:login:start', {
      account_id,
      session_id,
      platform,  // 平台标识（douyin/xiaohongshu）
      proxy: proxyConfig,  // 代理配置
    });
    sent = true;
    break;
  }
}
```

6. **发送确认给 Admin**
```javascript
socket.emit('admin:login:start:ack', {
  account_id,
  worker_id,
  session_id,
  status: 'sent',
  timestamp: Date.now(),
});
```

### 步骤 4: Worker 接收登录请求

**位置**: `packages/worker/src/index.js`

```javascript
// 监听登录请求
socketClient.socket.on('master:login:start', (data) => {
  handleLoginRequest(data);
});

async function handleLoginRequest(data) {
  const { account_id, session_id, platform, proxy } = data;
  
  try {
    logger.info(`Received login request for account ${account_id}, platform ${platform}, session ${session_id}`);
    
    // 获取对应平台实例
    const platformInstance = platformManager.getPlatform(platform);
    if (!platformInstance) {
      throw new Error(`Platform ${platform} not supported or not loaded`);
    }
    
    // 启动登录流程（传递代理配置）
    await platformInstance.startLogin({
      accountId: account_id,
      sessionId: session_id,
      proxy,
    });
    
    logger.info(`Login process started for account ${account_id} on platform ${platform}`);
  } catch (error) {
    logger.error(`Failed to handle login request for account ${account_id}:`, error);
    // 发送登录失败事件
    workerBridge.sendLoginStatus(account_id, session_id, 'failed', error.message);
  }
}
```

### 步骤 5: 平台脚本执行登录

**位置**: `packages/worker/src/platforms/douyin/platform.js`

```javascript
async startLogin(options) {
  const { accountId, sessionId, proxy } = options;
  
  try {
    logger.info(`Starting Douyin login for account ${accountId}`);
    
    // 使用现有的 DouyinLoginHandler
    await this.loginHandler.startLogin(accountId, sessionId, proxy);
    
  } catch (error) {
    logger.error(`Douyin login failed for account ${accountId}:`, error);
    this.workerBridge.sendLoginStatus(accountId, sessionId, 'failed', error.message);
    throw error;
  }
}
```

### 步骤 6: DouyinLoginHandler 执行实际登录

**位置**: `packages/worker/src/browser/douyin-login-handler.js`

**流程**:

1. **获取浏览器上下文**
```javascript
const context = await this.browserManager.getContextForAccount(accountId, {
  proxy: proxyConfig,
});
```

2. **打开登录页面**
```javascript
const page = await context.newPage();
await page.goto('https://www.douyin.com/', { 
  waitUntil: 'networkidle' 
});
```

3. **等待二维码元素**
```javascript
await page.waitForSelector('.qrcode-img', { 
  timeout: 30000 
});
```

4. **截取二维码**
```javascript
const qrElement = await page.$('.qrcode-img');
const qrImage = await qrElement.screenshot();
const qrBase64 = qrImage.toString('base64');
```

5. **发送二维码到 Master**
```javascript
this.socketClient.sendMessage(WORKER_MESSAGE, {
  type: 'login:qrcode:ready',
  account_id: accountId,
  session_id: sessionId,
  qr_code_data: `data:image/png;base64,${qrBase64}`,
  expires_at: Math.floor(Date.now() / 1000) + 300,
});
```

6. **等待登录成功**
```javascript
await page.waitForSelector('.user-info', { 
  timeout: 300000 // 5 分钟
});
```

7. **保存登录状态**
```javascript
// 保存 Cookies
await this.browserManager.saveStorageState(accountId);

// 发送登录成功消息
this.socketClient.sendMessage(WORKER_MESSAGE, {
  type: 'login:success',
  account_id: accountId,
  session_id: sessionId,
  timestamp: Date.now(),
});
```

### 步骤 7: Master 转发消息到 Admin

**位置**: `packages/master/src/socket/worker-namespace.js`

```javascript
// Worker 发送二维码
socket.on('worker:message', (data) => {
  if (data.type === 'login:qrcode:ready') {
    // 更新登录会话状态
    db.prepare('UPDATE login_sessions SET status = ? WHERE id = ?')
      .run('scanning', data.session_id);
    
    // 广播到所有 Admin 客户端
    adminNamespace.emit('login:qrcode:ready', {
      account_id: data.account_id,
      session_id: data.session_id,
      qr_code_data: data.qr_code_data,
      expires_at: data.expires_at,
    });
  }
  
  if (data.type === 'login:success') {
    // 更新登录会话状态
    db.prepare('UPDATE login_sessions SET status = ?, completed_at = ? WHERE id = ?')
      .run('success', Math.floor(Date.now() / 1000), data.session_id);
    
    // 更新账户状态
    db.prepare('UPDATE accounts SET login_status = ? WHERE id = ?')
      .run('logged_in', data.account_id);
    
    // 广播到所有 Admin 客户端
    adminNamespace.emit('login:success', {
      account_id: data.account_id,
      session_id: data.session_id,
      timestamp: data.timestamp,
    });
  }
});
```

### 步骤 8: Admin Web 显示二维码

**位置**: `socketContext.js`

```javascript
// 监听 QR 码事件
socketInstance.on('login:qrcode:ready', (data) => {
  console.log('QR code ready:', data);
  setQRCodeData(data);
  message.success(`账户 ${data.account_id} 的 QR 码已准备就绪`);
});
```

**位置**: `LoginManagementPage.js`

```javascript
// 当收到 QR 码数据时自动打开模态框
useEffect(() => {
  if (qrCodeData) {
    setQRModalVisible(true);
  }
}, [qrCodeData]);
```

**位置**: `QRCodeModal.js`

```javascript
// 显示二维码和倒计时
<Image
  src={qrCodeData.qr_code_data}
  alt="QR Code"
  style={{ maxWidth: '300px' }}
/>

<Progress
  percent={progress}
  strokeColor={getProgressColor()}
  showInfo={false}
/>
```

### 步骤 9: 用户扫码登录

1. 用户使用抖音 App 扫描二维码
2. 用户在手机上确认登录
3. 浏览器页面自动登录
4. Worker 检测到登录成功
5. 发送登录成功消息

### 步骤 10: 登录完成

**Admin Web 显示成功消息**:
```javascript
socketInstance.on('login:success', (data) => {
  console.log('Login success:', data);
  message.success(`账户 ${data.account_id} 登录成功`);
  setQRCodeData(null); // 关闭二维码模态框
});
```

**登录会话状态更新为 success**

**账户登录状态更新为 logged_in**

**开始监控任务**（如果已配置）

## 📊 数据库表结构

### login_sessions 表

```sql
CREATE TABLE IF NOT EXISTS login_sessions (
  id TEXT PRIMARY KEY,                    -- 会话ID
  account_id TEXT NOT NULL,               -- 账户ID
  worker_id TEXT,                         -- Worker ID
  status TEXT NOT NULL DEFAULT 'pending', -- pending/scanning/success/failed/expired
  login_method TEXT DEFAULT 'qrcode',     -- qrcode/password/cookie
  created_at INTEGER NOT NULL,            -- 创建时间戳
  completed_at INTEGER,                   -- 完成时间戳
  expires_at INTEGER,                     -- 过期时间戳
  error_message TEXT,                     -- 错误信息
  qr_code_url TEXT,                       -- 二维码 URL（可选）
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

### accounts 表 - login_status 字段

```sql
login_status TEXT DEFAULT 'not_logged_in', 
-- not_logged_in: 未登录
-- pending_login: 登录中
-- logged_in: 已登录
-- login_failed: 登录失败
```

## 🔌 Socket.IO 事件总览

### Admin → Master

| 事件 | 方向 | 数据 | 说明 |
|------|------|------|------|
| `master:login:start` | → | `{account_id, worker_id, session_id}` | 启动登录 |
| `admin:login_sessions:list` | → | - | 请求登录会话列表 |

### Master → Admin

| 事件 | 方向 | 数据 | 说明 |
|------|------|------|------|
| `admin:login:start:ack` | ← | `{account_id, worker_id, session_id, status}` | 登录请求已发送 |
| `login:qrcode:ready` | ← | `{account_id, session_id, qr_code_data, expires_at}` | 二维码已准备 |
| `login:success` | ← | `{account_id, session_id}` | 登录成功 |
| `login:failed` | ← | `{account_id, session_id, error_message}` | 登录失败 |
| `login:qrcode:expired` | ← | `{account_id, session_id}` | 二维码过期 |
| `admin:login_sessions:list:response` | ← | `{sessions: [...]}` | 登录会话列表 |

### Master → Worker

| 事件 | 方向 | 数据 | 说明 |
|------|------|------|------|
| `master:login:start` | → | `{account_id, session_id, platform, proxy}` | 启动登录 |

### Worker → Master

| 事件 | 方向 | 数据 | 说明 |
|------|------|------|------|
| `worker:message` (type: login:qrcode:ready) | → | `{account_id, session_id, qr_code_data, expires_at}` | 二维码已准备 |
| `worker:message` (type: login:success) | → | `{account_id, session_id}` | 登录成功 |
| `worker:message` (type: login:failed) | → | `{account_id, session_id, error_message}` | 登录失败 |

## 🎯 关键特性

### 1. 代理支持

登录流程支持配置代理：

```javascript
// Master 查询 Worker 的代理配置
const workerConfig = db.prepare(`
  SELECT wc.proxy_id, p.server, p.protocol, p.username, p.password
  FROM worker_configs wc
  LEFT JOIN proxies p ON wc.proxy_id = p.id
  WHERE wc.worker_id = ?
`).get(worker_id);

// 传递给 Worker
workerSocket.emit('master:login:start', {
  account_id,
  session_id,
  platform,
  proxy: proxyConfig,  // 代理配置
});
```

### 2. 会话过期机制

- 会话有效期: 5 分钟（300 秒）
- 倒计时显示在二维码模态框
- 过期后自动清理

### 3. 实时状态更新

- Admin Web 每 5 秒自动刷新登录会话列表
- Socket.IO 实时推送状态变化
- 二维码模态框自动打开/关闭

### 4. 错误处理

- Worker 不在线 → 显示错误消息
- 登录超时 → 会话标记为 expired
- 登录失败 → 记录错误信息

### 5. 多平台支持

通过平台系统支持多个平台：
- 抖音（douyin）
- 小红书（xiaohongshu）
- ...其他平台

## 🐛 已知问题

### 1. 平台参数缺失

**问题**: Master 转发登录请求时没有传递 `platform` 参数

**位置**: `packages/master/src/socket/admin-namespace.js:217`

**当前代码**:
```javascript
workerSocket.emit('master:login:start', {
  account_id,
  session_id,
  proxy: proxyConfig,
  // ❌ 缺少 platform 参数！
});
```

**需要修复**:
```javascript
// 从数据库查询账户的平台信息
const account = db.prepare('SELECT platform FROM accounts WHERE id = ?').get(account_id);

workerSocket.emit('master:login:start', {
  account_id,
  session_id,
  platform: account.platform,  // ✅ 添加平台参数
  proxy: proxyConfig,
});
```

### 2. 二维码数据格式

**问题**: 需要确保二维码数据是 Base64 格式，包含 `data:image/png;base64,` 前缀

**位置**: `packages/worker/src/browser/douyin-login-handler.js`

### 3. 登录状态同步

**问题**: 登录成功后，需要确保：
- 登录会话状态更新
- 账户登录状态更新
- Cookie 正确保存
- 浏览器上下文保持

## 🚀 优化建议

### 1. 添加重试机制

登录失败后允许重试：
```javascript
const handleRetry = (sessionId) => {
  // 使用相同的 session_id 重试
  startLogin(account.id, account.assigned_worker_id, sessionId);
};
```

### 2. 添加登录历史

记录每个账户的登录历史：
```sql
CREATE TABLE login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  login_method TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_message TEXT
);
```

### 3. 支持批量登录

允许一次性启动多个账户的登录流程

### 4. 添加登录进度提示

显示详细的登录步骤：
1. 正在打开登录页面...
2. 正在加载二维码...
3. 等待扫码...
4. 正在验证登录...
5. 登录成功！

### 5. Cookie 自动刷新

定期检查 Cookie 有效性，过期时自动触发重新登录

## 📝 总结

Web 平台的账户登录功能是一个完整的、基于 Socket.IO 的实时通信系统，支持：

✅ **多平台支持** - 通过平台脚本系统支持不同平台  
✅ **实时通信** - Socket.IO 实时推送状态  
✅ **代理支持** - 支持配置代理进行登录  
✅ **会话管理** - 完整的会话创建、跟踪、过期机制  
✅ **用户友好** - 自动弹出二维码、倒计时显示、实时状态更新  
✅ **错误处理** - 完善的错误处理和消息提示  

需要修复的关键问题：
⚠️ **平台参数传递** - Master 需要传递 platform 参数给 Worker

---

**文档创建时间**: 2025-10-16  
**维护人员**: Development Team
