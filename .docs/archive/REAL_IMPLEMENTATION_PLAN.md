# 真实抖音监控系统实现方案

## 📋 需求分析

### 核心需求

1. **管理平台**: Web 管理界面用于创建和管理监控账户
2. **Worker 登录**:
   - 启动 Worker 时打开抖音扫码页面
   - 生成登录二维码并发送到管理平台
   - 管理员扫码登录
3. **上下文隔离**: 每个 Worker 有独立的 Playwright 浏览器上下文
4. **代理支持**: 每个 Worker 配置专有代理

---

## 🏗️ 架构设计

### 当前架构 (Mock)
```
管理员 → Master API → Worker (Mock 爬虫)
```

### 目标架构 (真实)
```
┌─────────────────────────────────────────────────────────┐
│                   Web 管理平台                           │
│  - 账户管理                                              │
│  - Worker 状态监控                                       │
│  - 登录二维码展示                                        │
│  - 代理配置                                              │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/WebSocket
                     ↓
┌─────────────────────────────────────────────────────────┐
│                  Master 服务                             │
│  - REST API                                              │
│  - Socket.IO (/worker, /client, /admin)                 │
│  - 账户分配逻辑                                          │
│  - 登录会话管理                                          │
│  - 二维码转发                                            │
└────────────────────┬────────────────────────────────────┘
                     │ Socket.IO /worker
                     ↓
┌─────────────────────────────────────────────────────────┐
│                  Worker 节点 (多个)                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Worker-1                                         │  │
│  │  - Playwright 浏览器上下文 #1                      │  │
│  │  - 账户A (dy-account-001)                         │  │
│  │  - 代理: proxy-server-1:8080                      │  │
│  │  - Cookies: /data/contexts/worker-1/cookies.json  │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Worker-2                                         │  │
│  │  - Playwright 浏览器上下文 #2                      │  │
│  │  - 账户B (dy-account-002)                         │  │
│  │  - 代理: proxy-server-2:8080                      │  │
│  │  - Cookies: /data/contexts/worker-2/cookies.json  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 数据模型扩展

### 新增表

#### 1. `login_sessions` - 登录会话表

```sql
CREATE TABLE login_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  qr_code_data TEXT,              -- Base64 二维码图片
  qr_code_url TEXT,                -- 抖音二维码 URL
  status TEXT NOT NULL,            -- pending | scanning | success | failed | expired
  login_method TEXT,               -- qrcode | password | cookie
  expires_at INTEGER,              -- 二维码过期时间
  logged_in_at INTEGER,            -- 登录成功时间
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE INDEX idx_login_sessions_status ON login_sessions(status);
CREATE INDEX idx_login_sessions_worker ON login_sessions(worker_id);
```

#### 2. `worker_contexts` - Worker 浏览器上下文表

```sql
CREATE TABLE worker_contexts (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL UNIQUE,
  account_id TEXT,
  browser_id TEXT,                 -- Playwright 浏览器实例 ID
  context_id TEXT,                 -- Playwright 上下文 ID
  cookies_path TEXT,               -- Cookies 存储路径
  storage_state_path TEXT,         -- localStorage/sessionStorage 路径
  user_agent TEXT,                 -- 浏览器 UA
  viewport TEXT,                   -- 视口大小 JSON
  proxy_config TEXT,               -- 代理配置 JSON
  is_logged_in BOOLEAN DEFAULT 0,
  last_activity INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX idx_worker_contexts_logged_in ON worker_contexts(is_logged_in);
```

#### 3. `proxies` - 代理配置表

```sql
CREATE TABLE proxies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  server TEXT NOT NULL,            -- proxy-server:8080
  protocol TEXT NOT NULL,          -- http | https | socks5
  username TEXT,
  password TEXT,                   -- 加密存储
  country TEXT,
  city TEXT,
  status TEXT NOT NULL,            -- active | inactive | failed
  assigned_worker_id TEXT,
  last_check_time INTEGER,
  success_rate REAL DEFAULT 1.0,
  created_at INTEGER NOT NULL,
  UNIQUE(server),
  FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL
);

CREATE INDEX idx_proxies_status ON proxies(status);
CREATE INDEX idx_proxies_worker ON proxies(assigned_worker_id);
```

### 修改现有表

#### `accounts` 表添加字段

```sql
ALTER TABLE accounts ADD COLUMN login_status TEXT DEFAULT 'not_logged_in';
-- login_status: not_logged_in | pending_login | logged_in | login_failed | expired

ALTER TABLE accounts ADD COLUMN last_login_time INTEGER;
ALTER TABLE accounts ADD COLUMN cookies_valid_until INTEGER;
```

#### `workers` 表添加字段

```sql
ALTER TABLE workers ADD COLUMN proxy_id TEXT;
ALTER TABLE workers ADD COLUMN browser_type TEXT DEFAULT 'chromium';
-- browser_type: chromium | firefox | webkit

ALTER TABLE workers ADD COLUMN headless BOOLEAN DEFAULT 1;

FOREIGN KEY (proxy_id) REFERENCES proxies(id) ON DELETE SET NULL;
```

---

## 🔄 登录流程详细设计

### 流程图

```
┌──────────────┐
│ 1. 管理员    │
│ 创建账户     │
└──────┬───────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 2. 管理平台                                           │
│  POST /api/v1/accounts                               │
│  {                                                   │
│    platform: "douyin",                               │
│    account_name: "测试账户",                          │
│    account_id: "dy-001",                             │
│    login_method: "qrcode"  // 新增字段               │
│  }                                                   │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 3. Master 接收创建请求                                │
│  - 创建账户记录 (status: pending_login)              │
│  - 分配或启动 Worker                                 │
│  - 发送 Socket.IO 消息: master:account:login        │
│  {                                                   │
│    account_id: "acc-xxx",                            │
│    platform: "douyin",                               │
│    login_method: "qrcode"                            │
│  }                                                   │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 4. Worker 接收登录任务                                │
│  - 初始化 Playwright                                 │
│  - 创建浏览器上下文（带代理配置）                      │
│  - 打开抖音登录页面                                   │
│  - 等待二维码加载                                     │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 5. Worker 提取二维码                                  │
│  - 定位二维码元素                                     │
│  - 截图二维码区域                                     │
│  - 转换为 Base64                                     │
│  - 提取二维码 URL（如果可见）                         │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 6. Worker 上报二维码                                  │
│  发送 Socket.IO 消息: worker:login:qrcode           │
│  {                                                   │
│    account_id: "acc-xxx",                            │
│    worker_id: "worker-001",                          │
│    qr_code_data: "data:image/png;base64,...",        │
│    qr_code_url: "https://...",                       │
│    expires_in: 300  // 5分钟                         │
│  }                                                   │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 7. Master 处理二维码                                  │
│  - 创建 login_session 记录                           │
│  - 存储二维码数据                                     │
│  - 推送到管理平台（WebSocket /admin）                │
│  {                                                   │
│    event: "login:qrcode:ready",                      │
│    account_id: "acc-xxx",                            │
│    qr_code_data: "...",                              │
│    expires_at: timestamp                             │
│  }                                                   │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 8. 管理平台展示二维码                                 │
│  - 接收 WebSocket 消息                               │
│  - 显示二维码弹窗                                     │
│  - 显示倒计时（5分钟）                                │
│  - 提示：请使用抖音 APP 扫码登录                      │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 9. 管理员扫码                                         │
│  - 使用抖音 APP 扫描二维码                            │
│  - 在 APP 上确认登录                                 │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 10. Worker 检测登录状态                               │
│  - 轮询检查页面变化                                   │
│  - 检测登录成功标志：                                 │
│    * URL 变化（跳转到首页）                           │
│    * Cookies 包含登录凭证                             │
│    * localStorage 有用户信息                          │
│  - 等待页面完全加载                                   │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 11. Worker 保存登录状态                               │
│  - 提取 Cookies                                      │
│  - 提取 localStorage                                 │
│  - 提取 sessionStorage                               │
│  - 保存到本地文件                                     │
│    * /data/contexts/worker-001/cookies.json         │
│    * /data/contexts/worker-001/storage.json         │
│  - 获取用户信息（昵称、ID）                           │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 12. Worker 上报登录成功                               │
│  发送 Socket.IO 消息: worker:login:success          │
│  {                                                   │
│    account_id: "acc-xxx",                            │
│    worker_id: "worker-001",                          │
│    user_info: {                                      │
│      nickname: "用户昵称",                            │
│      user_id: "dy-123456",                           │
│      avatar: "https://..."                           │
│    },                                                │
│    cookies_path: "/data/contexts/worker-001/...",   │
│    valid_until: timestamp + 30days                   │
│  }                                                   │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 13. Master 更新状态                                   │
│  - 更新 accounts.login_status = 'logged_in'         │
│  - 更新 accounts.last_login_time                     │
│  - 更新 login_sessions.status = 'success'           │
│  - 更新 worker_contexts.is_logged_in = true         │
│  - 通知管理平台登录成功                               │
└──────┬───────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────┐
│ 14. Worker 开始监控任务                               │
│  - 使用已登录的浏览器上下文                           │
│  - 定期检查评论和私信                                 │
│  - 真实抓取数据（不再是 Mock）                        │
└──────────────────────────────────────────────────────┘
```

---

## 🔧 技术实现细节

### 1. Playwright 集成

#### Worker 端浏览器管理器

**文件**: `packages/worker/src/browser/browser-manager.js`

```javascript
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class BrowserManager {
  constructor(workerId, config = {}) {
    this.workerId = workerId;
    this.config = config;
    this.browser = null;
    this.context = null;
    this.contextPath = path.join('./data/contexts', workerId);
  }

  /**
   * 初始化浏览器和上下文
   */
  async initialize() {
    // 确保上下文目录存在
    await fs.mkdir(this.contextPath, { recursive: true });

    // 浏览器启动配置
    const launchOptions = {
      headless: this.config.headless !== false,
      proxy: this.config.proxy ? {
        server: this.config.proxy.server,
        username: this.config.proxy.username,
        password: this.config.proxy.password,
      } : undefined,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    };

    this.browser = await chromium.launch(launchOptions);

    // 上下文配置
    const contextOptions = {
      viewport: this.config.viewport || { width: 1920, height: 1080 },
      userAgent: this.config.userAgent || await this.generateRandomUA(),
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      // 加载已保存的状态
      storageState: await this.loadStorageState(),
    };

    this.context = await this.browser.newContext(contextOptions);

    // 反检测措施
    await this.setupAntiDetection();

    logger.info(`Browser initialized for worker ${this.workerId}`);
    return this.context;
  }

  /**
   * 反检测措施
   */
  async setupAntiDetection() {
    await this.context.addInitScript(() => {
      // 覆盖 navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // 覆盖 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // 覆盖 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });
    });
  }

  /**
   * 生成随机 User-Agent
   */
  async generateRandomUA() {
    const chrome_versions = ['120', '119', '118'];
    const version = chrome_versions[Math.floor(Math.random() * chrome_versions.length)];
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36`;
  }

  /**
   * 加载已保存的存储状态
   */
  async loadStorageState() {
    const statePath = path.join(this.contextPath, 'storage-state.json');
    try {
      const exists = await fs.access(statePath).then(() => true).catch(() => false);
      if (exists) {
        const state = await fs.readFile(statePath, 'utf-8');
        logger.info(`Loaded storage state from ${statePath}`);
        return JSON.parse(state);
      }
    } catch (error) {
      logger.warn(`Failed to load storage state: ${error.message}`);
    }
    return undefined;
  }

  /**
   * 保存存储状态
   */
  async saveStorageState() {
    if (!this.context) return;

    const statePath = path.join(this.contextPath, 'storage-state.json');
    const state = await this.context.storageState();
    await fs.writeFile(statePath, JSON.stringify(state, null, 2));
    logger.info(`Saved storage state to ${statePath}`);
    return statePath;
  }

  /**
   * 获取 Cookies
   */
  async getCookies() {
    if (!this.context) return [];
    return await this.context.cookies();
  }

  /**
   * 设置 Cookies
   */
  async setCookies(cookies) {
    if (!this.context) return;
    await this.context.addCookies(cookies);
    logger.info(`Set ${cookies.length} cookies`);
  }

  /**
   * 清理
   */
  async close() {
    if (this.context) {
      await this.saveStorageState();
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    logger.info(`Browser closed for worker ${this.workerId}`);
  }
}

module.exports = BrowserManager;
```

#### 抖音登录处理器

**文件**: `packages/worker/src/douyin/douyin-login-handler.js`

```javascript
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('douyin-login');

class DouyinLoginHandler {
  constructor(browserManager, socketClient) {
    this.browserManager = browserManager;
    this.socketClient = socketClient;
    this.page = null;
  }

  /**
   * 执行二维码登录
   */
  async loginWithQRCode(accountId) {
    try {
      logger.info(`Starting QR code login for account ${accountId}`);

      // 创建新页面
      const context = await this.browserManager.initialize();
      this.page = await context.newPage();

      // 访问抖音登录页面
      await this.page.goto('https://www.douyin.com/', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // 等待并点击登录按钮
      await this.page.click('text=登录', { timeout: 10000 }).catch(() => {
        logger.warn('Login button not found, may already be on login page');
      });

      // 等待二维码加载
      const qrCodeSelector = '.qrcode-img, .login-qrcode img, [class*="qrcode"]';
      await this.page.waitForSelector(qrCodeSelector, { timeout: 15000 });

      logger.info('QR code loaded, capturing...');

      // 截取二维码
      const qrElement = await this.page.$(qrCodeSelector);
      const qrCodeBuffer = await qrElement.screenshot();
      const qrCodeBase64 = `data:image/png;base64,${qrCodeBuffer.toString('base64')}`;

      // 尝试提取二维码 URL（如果页面有暴露）
      const qrCodeUrl = await this.page.evaluate(() => {
        const img = document.querySelector('.qrcode-img, .login-qrcode img');
        return img ? img.src : null;
      });

      // 发送二维码给 Master
      this.socketClient.send('worker:login:qrcode', {
        account_id: accountId,
        worker_id: this.socketClient.workerId,
        qr_code_data: qrCodeBase64,
        qr_code_url: qrCodeUrl,
        expires_in: 300, // 5分钟
      });

      logger.info('QR code sent to master, waiting for scan...');

      // 等待登录成功
      const loginSuccess = await this.waitForLoginSuccess();

      if (loginSuccess) {
        // 保存登录状态
        const storagePath = await this.browserManager.saveStorageState();
        const cookies = await this.browserManager.getCookies();

        // 获取用户信息
        const userInfo = await this.getUserInfo();

        // 上报登录成功
        this.socketClient.send('worker:login:success', {
          account_id: accountId,
          worker_id: this.socketClient.workerId,
          user_info: userInfo,
          storage_path: storagePath,
          cookies_count: cookies.length,
          valid_until: Math.floor(Date.now() / 1000) + 30 * 86400, // 30天
        });

        logger.info(`Login successful for account ${accountId}`, userInfo);
        return true;
      } else {
        throw new Error('Login timeout or failed');
      }

    } catch (error) {
      logger.error(`Login failed for account ${accountId}:`, error);

      // 上报登录失败
      this.socketClient.send('worker:login:failed', {
        account_id: accountId,
        worker_id: this.socketClient.workerId,
        error: error.message,
      });

      return false;
    } finally {
      if (this.page && !this.page.isClosed()) {
        // 不关闭页面，保持登录状态
        // await this.page.close();
      }
    }
  }

  /**
   * 等待登录成功
   */
  async waitForLoginSuccess(timeout = 300000) { // 5分钟
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // 方法1: 检查 URL 变化
        const url = this.page.url();
        if (url.includes('/home') || url.includes('/recommend')) {
          logger.info('Login detected: URL changed to home page');
          await this.page.waitForTimeout(2000); // 等待页面稳定
          return true;
        }

        // 方法2: 检查关键元素出现（登录后才有的元素）
        const loggedInElement = await this.page.$('.user-info, .avatar, [class*="user"]').catch(() => null);
        if (loggedInElement) {
          logger.info('Login detected: User element found');
          await this.page.waitForTimeout(2000);
          return true;
        }

        // 方法3: 检查 Cookies
        const cookies = await this.page.context().cookies();
        const hasAuthCookie = cookies.some(c =>
          c.name.includes('sessionid') ||
          c.name.includes('sid_guard') ||
          c.name.includes('passport_csrf_token')
        );
        if (hasAuthCookie) {
          logger.info('Login detected: Auth cookies found');
          await this.page.waitForTimeout(2000);
          return true;
        }

        // 等待1秒后重试
        await this.page.waitForTimeout(1000);

      } catch (error) {
        logger.debug('Login detection error:', error.message);
      }
    }

    logger.warn('Login timeout');
    return false;
  }

  /**
   * 获取用户信息
   */
  async getUserInfo() {
    try {
      // 尝试从页面提取用户信息
      const userInfo = await this.page.evaluate(() => {
        // 从全局变量或元素中提取
        const userElement = document.querySelector('.user-info, .user-name, [class*="user"]');

        return {
          nickname: userElement?.textContent?.trim() || '未知用户',
          user_id: null, // 需要从页面或 API 获取
          avatar: document.querySelector('.avatar img, [class*="avatar"] img')?.src || null,
        };
      });

      logger.info('User info extracted:', userInfo);
      return userInfo;

    } catch (error) {
      logger.warn('Failed to extract user info:', error.message);
      return {
        nickname: '未知用户',
        user_id: null,
        avatar: null,
      };
    }
  }

  /**
   * 检查登录状态是否有效
   */
  async checkLoginStatus() {
    try {
      if (!this.page || this.page.isClosed()) {
        const context = await this.browserManager.initialize();
        this.page = await context.newPage();
      }

      await this.page.goto('https://www.douyin.com/', { waitUntil: 'networkidle' });

      // 检查是否需要重新登录
      const needLogin = await this.page.$('text=登录') !== null;

      return !needLogin;
    } catch (error) {
      logger.error('Failed to check login status:', error);
      return false;
    }
  }
}

module.exports = DouyinLoginHandler;
```

---

### 2. 管理平台 (Web Admin)

#### 前端框架选择

**选项 A: React + Ant Design** (推荐)
- 已有桌面客户端使用 React，技术栈统一
- Ant Design Pro 提供完整的管理后台模板

**选项 B: Vue + Element Plus**
- 轻量级，学习曲线平缓

#### 核心页面

1. **账户管理页面** (`/admin/accounts`)
   - 账户列表
   - 创建账户（触发登录流程）
   - 编辑账户
   - 删除账户
   - 查看登录状态

2. **登录管理页面** (`/admin/login`)
   - 待登录账户列表
   - 二维码展示弹窗
   - 登录状态实时更新

3. **Worker 管理页面** (`/admin/workers`)
   - Worker 列表
   - Worker 状态监控
   - 分配账户
   - 配置代理

4. **代理管理页面** (`/admin/proxies`)
   - 代理列表
   - 添加代理
   - 测试代理
   - 代理状态监控

#### 二维码展示组件

**文件**: `packages/admin-web/src/components/QRCodeModal.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { Modal, Progress, Typography, Alert } from 'antd';
import QRCode from 'qrcode.react';

const { Text, Title } = Typography;

const QRCodeModal = ({ visible, onClose, qrCodeData, expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState(300); // 5分钟

  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const left = expiresAt - now;

      if (left <= 0) {
        clearInterval(interval);
        onClose('expired');
      } else {
        setTimeLeft(left);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, expiresAt]);

  const progress = (timeLeft / 300) * 100;

  return (
    <Modal
      open={visible}
      title="抖音账户登录"
      onCancel={() => onClose('cancelled')}
      footer={null}
      width={480}
    >
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <Title level={4}>请使用抖音 APP 扫码登录</Title>

        {qrCodeData && (
          <div style={{
            display: 'inline-block',
            padding: '20px',
            background: '#fff',
            border: '1px solid #d9d9d9',
            borderRadius: '8px',
            marginTop: '16px',
          }}>
            <img
              src={qrCodeData}
              alt="登录二维码"
              style={{ width: '200px', height: '200px' }}
            />
          </div>
        )}

        <div style={{ marginTop: '24px' }}>
          <Progress
            percent={Math.floor(progress)}
            status={progress < 20 ? 'exception' : 'active'}
            format={() => `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
          />
          <Text type="secondary" style={{ marginTop: '8px', display: 'block' }}>
            二维码有效期剩余 {Math.floor(timeLeft / 60)} 分 {timeLeft % 60} 秒
          </Text>
        </div>

        <Alert
          message="提示"
          description="打开抖音 APP，点击右下角「我」，点击右上角「≡」菜单，选择「扫一扫」扫描上方二维码"
          type="info"
          showIcon
          style={{ marginTop: '24px', textAlign: 'left' }}
        />
      </div>
    </Modal>
  );
};

export default QRCodeModal;
```

---

### 3. Master 扩展

#### 新增 Socket.IO Namespace: `/admin`

**文件**: `packages/master/src/socket/admin-namespace.js`

```javascript
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('socket-admin');

function setupAdminNamespace(io, db) {
  const adminNamespace = io.of('/admin');

  adminNamespace.on('connection', (socket) => {
    logger.info(`Admin connected: ${socket.id}`);

    // 管理员身份验证
    socket.on('admin:auth', async (data) => {
      const { token } = data;

      // TODO: 验证管理员 token
      const isValid = true; // 简化处理

      if (isValid) {
        socket.data.authenticated = true;
        socket.emit('admin:auth:success');
        logger.info(`Admin authenticated: ${socket.id}`);
      } else {
        socket.emit('admin:auth:failed');
        socket.disconnect();
      }
    });

    // 请求系统状态
    socket.on('admin:status:request', async () => {
      if (!socket.data.authenticated) return;

      const status = await getSystemStatus(db);
      socket.emit('admin:status:response', status);
    });

    socket.on('disconnect', () => {
      logger.info(`Admin disconnected: ${socket.id}`);
    });
  });

  return adminNamespace;
}

async function getSystemStatus(db) {
  const workers = db.prepare('SELECT * FROM workers WHERE status = "online"').all();
  const accounts = db.prepare('SELECT * FROM accounts').all();
  const pendingLogins = db.prepare('SELECT * FROM login_sessions WHERE status = "pending"').all();

  return {
    workers: {
      total: workers.length,
      online: workers.filter(w => w.status === 'online').length,
    },
    accounts: {
      total: accounts.length,
      logged_in: accounts.filter(a => a.login_status === 'logged_in').length,
      pending_login: accounts.filter(a => a.login_status === 'pending_login').length,
    },
    pending_logins: pendingLogins.length,
  };
}

module.exports = setupAdminNamespace;
```

#### 二维码转发处理

**文件**: `packages/master/src/handlers/login-handler.js`

```javascript
class LoginHandler {
  constructor(io, db) {
    this.io = io;
    this.db = db;
    this.adminNamespace = io.of('/admin');
  }

  /**
   * 处理 Worker 上报的二维码
   */
  async handleQRCode(data) {
    const { account_id, worker_id, qr_code_data, qr_code_url, expires_in } = data;

    try {
      // 创建登录会话
      const sessionId = `login-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

      this.db.prepare(`
        INSERT INTO login_sessions (
          id, account_id, worker_id, qr_code_data, qr_code_url,
          status, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId, account_id, worker_id, qr_code_data, qr_code_url,
        'pending', expiresAt, Math.floor(Date.now() / 1000)
      );

      // 更新账户状态
      this.db.prepare(`
        UPDATE accounts SET login_status = 'pending_login' WHERE id = ?
      `).run(account_id);

      // 推送到管理平台
      this.adminNamespace.emit('login:qrcode:ready', {
        session_id: sessionId,
        account_id: account_id,
        qr_code_data: qr_code_data,
        expires_at: expiresAt,
      });

      logger.info(`QR code ready for account ${account_id}, session ${sessionId}`);

    } catch (error) {
      logger.error('Failed to handle QR code:', error);
    }
  }

  /**
   * 处理登录成功
   */
  async handleLoginSuccess(data) {
    const { account_id, worker_id, user_info, storage_path, valid_until } = data;

    try {
      // 更新账户状态
      this.db.prepare(`
        UPDATE accounts
        SET login_status = 'logged_in',
            last_login_time = ?,
            cookies_valid_until = ?
        WHERE id = ?
      `).run(Math.floor(Date.now() / 1000), valid_until, account_id);

      // 更新登录会话
      this.db.prepare(`
        UPDATE login_sessions
        SET status = 'success', logged_in_at = ?
        WHERE account_id = ? AND status = 'pending'
      `).run(Math.floor(Date.now() / 1000), account_id);

      // 更新 worker_contexts
      this.db.prepare(`
        UPDATE worker_contexts
        SET is_logged_in = 1,
            account_id = ?,
            storage_state_path = ?,
            last_activity = ?
        WHERE worker_id = ?
      `).run(account_id, storage_path, Math.floor(Date.now() / 1000), worker_id);

      // 推送到管理平台
      this.adminNamespace.emit('login:success', {
        account_id: account_id,
        worker_id: worker_id,
        user_info: user_info,
      });

      logger.info(`Login successful for account ${account_id}`);

    } catch (error) {
      logger.error('Failed to handle login success:', error);
    }
  }

  /**
   * 处理登录失败
   */
  async handleLoginFailed(data) {
    const { account_id, worker_id, error } = data;

    try {
      // 更新账户状态
      this.db.prepare(`
        UPDATE accounts
        SET login_status = 'login_failed'
        WHERE id = ?
      `).run(account_id);

      // 更新登录会话
      this.db.prepare(`
        UPDATE login_sessions
        SET status = 'failed'
        WHERE account_id = ? AND status = 'pending'
      `).run(account_id);

      // 推送到管理平台
      this.adminNamespace.emit('login:failed', {
        account_id: account_id,
        error: error,
      });

      logger.error(`Login failed for account ${account_id}: ${error}`);

    } catch (error) {
      logger.error('Failed to handle login failure:', error);
    }
  }
}

module.exports = LoginHandler;
```

---

## 📦 依赖包

### Worker 新增依赖

```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "playwright-chromium": "^1.40.0"
  }
}
```

### Admin Web 新增依赖

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "antd": "^5.12.0",
    "@ant-design/pro-components": "^2.6.0",
    "socket.io-client": "^4.5.0",
    "qrcode.react": "^3.1.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

---

## 📅 实施计划

### Phase Real-1: 数据模型和基础架构 (2天)

**任务**:
- [ ] T-R001: 创建新数据库表 (login_sessions, worker_contexts, proxies)
- [ ] T-R002: 修改现有表结构 (accounts, workers)
- [ ] T-R003: 数据库迁移脚本
- [ ] T-R004: 新增 Socket.IO `/admin` namespace
- [ ] T-R005: LoginHandler 类实现

---

### Phase Real-2: Worker Playwright 集成 (3天)

**任务**:
- [ ] T-R006: BrowserManager 实现
- [ ] T-R007: DouyinLoginHandler 实现
- [ ] T-R008: 二维码提取和上报
- [ ] T-R009: 登录状态检测
- [ ] T-R010: 存储状态持久化
- [ ] T-R011: 反检测措施

---

### Phase Real-3: 管理平台 Web UI (3天)

**任务**:
- [ ] T-R012: 创建 admin-web 项目结构
- [ ] T-R013: 账户管理页面
- [ ] T-R014: 登录管理页面
- [ ] T-R015: QRCodeModal 组件
- [ ] T-R016: Worker 管理页面
- [ ] T-R017: 代理管理页面
- [ ] T-R018: WebSocket 集成

---

### Phase Real-4: 真实爬虫实现 (4天)

**任务**:
- [ ] T-R019: 抖音评论爬取（真实）
- [ ] T-R020: 抖音私信爬取（真实）
- [ ] T-R021: 数据解析和清洗
- [ ] T-R022: 反爬虫对抗
- [ ] T-R023: 错误处理和重试

---

### Phase Real-5: 代理支持 (2天)

**任务**:
- [ ] T-R024: 代理配置管理
- [ ] T-R025: 代理健康检查
- [ ] T-R026: 代理轮换机制
- [ ] T-R027: Worker-代理绑定

---

### Phase Real-6: 测试和优化 (2天)

**任务**:
- [ ] T-R028: 登录流程端到端测试
- [ ] T-R029: 爬虫稳定性测试
- [ ] T-R030: 性能优化
- [ ] T-R031: 文档完善

---

## 🎯 总计

- **总天数**: 约 16 天
- **总任务数**: 31 个任务
- **难度**: 高
- **风险**:
  - 抖音反爬虫机制变化
  - 登录流程变化
  - Playwright 性能和稳定性

---

## 🚀 快速启动指南（完成后）

### 1. 启动顺序

```bash
# 1. 启动 Master
cd packages/master && npm start

# 2. 启动 Worker (支持多个)
cd packages/worker && npm start

# 3. 启动管理平台
cd packages/admin-web && npm run dev
```

### 2. 创建账户并登录

1. 访问管理平台: http://localhost:5173
2. 进入"账户管理"
3. 点击"创建账户"，选择"二维码登录"
4. 弹出二维码窗口
5. 使用抖音 APP 扫码
6. 等待登录成功提示
7. 账户自动开始监控

---

## 📝 注意事项

1. **法律合规**: 确保爬取行为符合抖音用户协议和当地法律
2. **频率控制**: 避免过于频繁的请求，防止被封禁
3. **数据安全**: 妥善保护用户登录凭证和个人信息
4. **错误处理**: 完善的错误恢复机制
5. **监控告警**: 及时发现和处理异常情况

---

**准备好开始实施了吗？**

建议从 **Phase Real-1** 开始，逐步构建完整的真实监控系统。
