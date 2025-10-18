# Worker 系统完整文档 - 第一部分

**版本**: 1.0.0
**日期**: 2025-10-18
**模块**: Worker (浏览器自动化和爬虫)
**端口**: 4000-4099 (根据 WORKER_ID)
**数据存储**: packages/worker/data/browser/

---

## 目录 (第一部分)

1. [系统概述](#系统概述)
2. [架构设计](#架构设计)
3. [核心模块](#核心模块)
4. [多Browser架构](#多browser架构)
5. [平台系统](#平台系统)

---

## 系统概述

### 职责定位

Worker 是系统的**执行节点**，负责：

- ✅ **浏览器自动化** - 使用 Playwright 自动化浏览器
- ✅ **账户隔离** - 每个账户独立 Browser 进程
- ✅ **多平台支持** - 动态加载平台脚本（抖音、小红书等）
- ✅ **登录管理** - 执行二维码登录流程
- ✅ **数据爬取** - 爬取评论和私信数据
- ✅ **指纹管理** - 浏览器指纹隔离和持久化
- ✅ **代理支持** - 支持 HTTP/HTTPS/Socks5 代理
- ✅ **心跳上报** - 定期向 Master 发送心跳和数据

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 18.x LTS | 运行时 |
| Playwright | 1.40.x | 浏览器自动化 |
| Socket.IO | 4.x | 与 Master 通信 |
| Better-SQLite3 | 9.x | 本地数据库缓存 |
| Winston | 3.x | 日志 |

### 部署方式

- **开发**: 直接 `node packages/worker/src/index.js`
- **生产**: PM2 管理多个 Worker 进程
- **本地多 Worker**: 不同 WORKER_ID + 不同 PORT

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────┐
│       Worker Process (Node.js)       │
├─────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐ │
│  │  Socket.IO Client (Master通信) │ │
│  └────────────────────────────────┘ │
│                 ▲                    │
│  ┌──────────────┼──────────────────┐│
│  │              │                  ││
│  │  ┌───────────▼────────┐         ││
│  │  │ PlatformManager    │         ││
│  │  │ (平台动态加载)     │         ││
│  │  └──────────┬─────────┘         ││
│  │             │                   ││
│  │  ┌──────────▼──────────┐        ││
│  │  │  Douyin Platform   │        ││
│  │  │  Xiaohongshu       │        ││
│  │  │  ...其他平台       │        ││
│  │  └──────────┬─────────┘        ││
│  │             │                   ││
│  │  ┌──────────▼────────────────┐ ││
│  │  │  BrowserManager V2        │ ││
│  │  │ (多Browser架构)           │ ││
│  │  └──────────┬────────────────┘ ││
│  │             │                   ││
│  │  ┌──────────▼──────────────────┐││
│  │  │  账户独立数据存储          │││
│  │  │  - 指纹 (fingerprints/)   │││
│  │  │  - Cookie (storage-states)│││
│  │  │  - 上下文 (contexts/)     │││
│  │  └─────────────────────────────┘││
│  │                                   ││
│  │  ┌────────────────────────────┐ ││
│  │  │  Playwright Browsers       │ ││
│  │  │  Account A ├─ Browser 1    │ ││
│  │  │  Account B ├─ Browser 2    │ ││
│  │  │  Account N ├─ Browser N    │ ││
│  │  └────────────────────────────┘ ││
│  │                                   ││
│  └───────────────────────────────────┘│
│                                        │
└────────────────┬───────────────────────┘
                 │
        ┌────────▼────────┐
        │  Playwright     │
        │  (Chromium等)   │
        └─────────────────┘
```

### 目录结构

```
packages/worker/
├── src/
│   ├── index.js                      # 入口文件
│   ├── platform-manager.js           # 平台管理器
│   ├── platforms/                    # 平台脚本
│   │   ├── base/
│   │   │   ├── platform-base.js      # 平台基类
│   │   │   ├── worker-bridge.js      # Worker 通信桥接
│   │   │   └── account-context-manager.js  # 账户上下文
│   │   └── douyin/
│   │       ├── platform.js           # 抖音平台实现
│   │       ├── config.json           # 抖音配置
│   │       └── crawler.js            # 抖音爬虫
│   ├── browser/
│   │   └── browser-manager-v2.js     # 多Browser管理器
│   ├── handlers/
│   │   ├── task-runner.js            # 任务执行器
│   │   ├── monitor-task.js           # 监控任务
│   │   └── login-handler.js          # 登录处理
│   ├── communication/
│   │   ├── socket-client.js          # Socket 客户端
│   │   ├── registration.js           # Worker 注册
│   │   └── heartbeat.js              # 心跳管理
│   └── utils/
│       ├── logger.js                 # 日志工具
│       └── validators.js             # 数据验证
├── data/
│   └── browser/
│       └── worker-{id}/
│           ├── fingerprints/         # 指纹文件
│           ├── storage-states/       # Cookie 文件
│           ├── contexts/             # 浏览器上下文
│           └── screenshots/          # 调试截图
├── logs/
│   └── worker.log
└── package.json
```

---

## 核心模块

### 1. 入口文件 (`src/index.js`)

```javascript
// 初始化流程
async function initializeWorker() {
  // 1. 加载配置
  const workerId = process.env.WORKER_ID || 'worker-default';
  const port = process.env.PORT || 4000;

  // 2. 初始化日志
  const logger = createLogger('worker', './logs');

  // 3. 初始化浏览器管理器
  const browserManager = new BrowserManagerV2('./data/browser');
  await browserManager.initialize();

  // 4. 初始化平台管理器
  const platformManager = new PlatformManager(browserManager);
  await platformManager.loadPlatforms();

  // 5. 初始化 Socket 客户端
  const socketClient = new SocketClient(workerId, 'http://localhost:3000');
  await socketClient.connect();

  // 6. 注册 Worker
  await socketClient.register({
    workerId,
    capabilities: platformManager.getSupportedPlatforms(),
    maxAccounts: 10,
    port
  });

  // 7. 启动心跳
  startHeartbeat(socketClient);

  // 8. 监听 Master 事件
  setupEventListeners(socketClient, platformManager);

  logger.info(`Worker ${workerId} initialized successfully`);
}

initializeWorker().catch(err => {
  console.error('Failed to initialize worker:', err);
  process.exit(1);
});
```

---

### 2. Socket 客户端 (`communication/socket-client.js`)

```javascript
class SocketClient {
  constructor(workerId, masterUrl) {
    this.workerId = workerId;
    this.socket = io(masterUrl, {
      namespace: '/worker',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket.on('connect', () => {
        logger.info('Connected to Master');
        resolve();
      });

      this.socket.on('connect_error', reject);
      this.socket.on('disconnect', () => {
        logger.warn('Disconnected from Master');
      });
    });
  }

  // 注册 Worker
  async register(data) {
    return new Promise((resolve) => {
      this.socket.emit('worker:register', data, (response) => {
        logger.info('Worker registered:', response);
        resolve(response);
      });
    });
  }

  // 发送心跳
  sendHeartbeat(stats) {
    this.socket.emit('worker:heartbeat', {
      workerId: this.workerId,
      stats,
      timestamp: Date.now()
    });
  }

  // 发送二维码
  sendQRCode(sessionId, qrCodeData) {
    this.socket.emit('worker:login:qrcode', {
      session_id: sessionId,
      qr_code_data: qrCodeData
    });
  }

  // 发送登录状态
  sendLoginStatus(sessionId, status, data) {
    this.socket.emit('worker:login:status', {
      session_id: sessionId,
      status,
      ...data
    });
  }

  // 发送监控数据
  sendMonitorData(type, accountId, messages) {
    this.socket.emit('worker:message:detected', {
      type,
      account_id: accountId,
      messages
    });
  }

  // 监听 Master 事件
  on(eventName, handler) {
    this.socket.on(eventName, handler);
  }
}
```

---

### 3. Worker 注册 (`communication/registration.js`)

```javascript
// 注册流程
async function registerWorker(socketClient, platformManager) {
  const capabilities = platformManager.getSupportedPlatforms();

  return new Promise((resolve, reject) => {
    socketClient.socket.emit('worker:register', {
      workerId: process.env.WORKER_ID,
      host: 'localhost',
      port: process.env.PORT,
      capabilities,        // ['douyin', 'xiaohongshu', ...]
      maxAccounts: 10,
      version: '1.0.0'
    }, (response) => {
      if (response.success) {
        logger.info('Worker registered successfully');
        resolve(response);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

// Master 确认
socketClient.on('worker:registered', (data) => {
  logger.info('Registration confirmed by Master');
});
```

---

### 4. 心跳管理 (`communication/heartbeat.js`)

```javascript
class HeartbeatManager {
  constructor(socketClient) {
    this.socketClient = socketClient;
    this.interval = 10000; // 10秒
  }

  start() {
    setInterval(() => {
      const stats = {
        activeAccounts: this.getActiveAccountCount(),
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        cpuUsage: process.cpuUsage().user / 1000,
        timestamp: Date.now()
      };

      this.socketClient.sendHeartbeat(stats);
      logger.debug('Heartbeat sent:', stats);
    }, this.interval);
  }

  getActiveAccountCount() {
    // 从任务管理器获取活跃账户数
    return taskRunner.getActiveTasks().length;
  }
}
```

---

### 5. 事件监听 (`src/index.js`)

```javascript
function setupEventListeners(socketClient, platformManager) {
  // 登录请求
  socketClient.on('master:login:start', async (data) => {
    const {account_id, session_id, platform, proxy} = data;

    try {
      const platformInstance = platformManager.getPlatform(platform);
      await platformInstance.startLogin({
        accountId: account_id,
        sessionId: session_id,
        proxy
      });
    } catch (error) {
      logger.error('Login failed:', error);
      socketClient.sendLoginStatus(session_id, 'failed', {
        error_message: error.message
      });
    }
  });

  // 任务分配
  socketClient.on('master:task:assign', async (data) => {
    const {accounts} = data;

    for (const account of accounts) {
      const task = new MonitorTask(account, platformManager);
      taskRunner.addTask(account.id, task);
    }
  });

  // 任务撤销
  socketClient.on('master:task:revoke', (data) => {
    const {accountIds} = data;

    for (const accountId of accountIds) {
      taskRunner.removeTask(accountId);
    }
  });
}
```

---

## 多Browser架构

### 设计原则

```
每个账户 = 1 个独立的 Browser 进程

优势:
✅ 完全隔离 - 100% 指纹隔离，无关联风险
✅ 进程隔离 - 一个崩溃不影响其他
✅ 稳定性 - 持久化指纹和 Cookie
✅ 并发性 - 多账户同时爬取

劣势:
❌ 资源消耗 - 每个 Browser ~200MB 内存
❌ 启动时间 - 冷启动 ~5 秒
❌ 推荐上限 - 每 Worker 最多 10 个账户
```

### BrowserManager V2 核心

```javascript
class BrowserManagerV2 {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.browsers = new Map();      // accountId -> Browser
    this.contexts = new Map();      // accountId -> Context
    this.fingerprints = new Map();  // accountId -> fingerprint
  }

  // 为账户获取或创建 Browser
  async getOrCreateBrowser(accountId, proxyConfig) {
    if (this.browsers.has(accountId)) {
      return this.browsers.get(accountId);
    }

    // 1. 加载或生成指纹
    const fingerprint = await this.loadOrCreateFingerprint(accountId);

    // 2. 加载 Cookie 和存储状态
    const storageState = await this.loadStorageState(accountId);

    // 3. 启动 Browser (持久化上下文)
    const context = await chromium.launchPersistentContext(
      `${this.dataDir}/browser_${accountId}`,
      {
        // 代理配置
        proxy: proxyConfig ? {
          server: proxyConfig.server,
          username: proxyConfig.username,
          password: proxyConfig.password
        } : undefined,

        // 指纹配置
        userAgent: fingerprint.userAgent,
        viewport: fingerprint.viewport,
        timezoneId: fingerprint.timezone,
        locale: fingerprint.locale,
        deviceScaleFactor: fingerprint.deviceScaleFactor,
        isMobile: false,
        hasTouch: false,

        // Cookie 和存储状态
        storageState: storageState,

        // 其他配置
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage'
        ]
      }
    );

    this.browsers.set(accountId, context);
    return context;
  }

  // 加载或生成指纹
  async loadOrCreateFingerprint(accountId) {
    const fingerprintFile = `${this.dataDir}/fingerprints/${accountId}_fingerprint.json`;

    if (fs.existsSync(fingerprintFile)) {
      return JSON.parse(fs.readFileSync(fingerprintFile, 'utf8'));
    }

    // 生成新指纹
    const fingerprint = {
      userAgent: this.randomUserAgent(),
      viewport: this.randomViewport(),
      timezone: 'Asia/Shanghai',
      locale: 'zh-CN',
      deviceScaleFactor: 1,
      webgl: this.randomWebGL(),
      canvas: this.randomCanvas(),
      audio: this.randomAudio(),
      createdAt: new Date().toISOString()
    };

    // 保存指纹
    fs.writeFileSync(fingerprintFile, JSON.stringify(fingerprint, null, 2));
    return fingerprint;
  }

  // 保存 Cookie 和存储状态
  async saveStorageState(accountId) {
    const context = this.contexts.get(accountId);
    if (!context) return;

    const storageState = await context.storageState();
    const statePath = `${this.dataDir}/storage-states/${accountId}_storage.json`;

    fs.writeFileSync(statePath, JSON.stringify(storageState, null, 2));
  }

  // 关闭 Browser
  async closeBrowser(accountId) {
    const context = this.browsers.get(accountId);
    if (context) {
      await context.close();
      this.browsers.delete(accountId);
    }
  }

  // 清理所有 Browser
  async cleanup() {
    for (const [accountId, context] of this.browsers) {
      await context.close();
    }
    this.browsers.clear();
  }
}
```

---

## 平台系统

### PlatformManager 平台管理器

```javascript
class PlatformManager {
  constructor(browserManager) {
    this.platforms = new Map();
    this.browserManager = browserManager;
  }

  // 自动加载所有平台
  async loadPlatforms() {
    const platformDir = './src/platforms';
    const dirs = fs.readdirSync(platformDir);

    for (const dir of dirs) {
      if (dir === 'base') continue;

      try {
        const configPath = `${platformDir}/${dir}/config.json`;
        const platformPath = `${platformDir}/${dir}/platform.js`;

        const config = require(configPath);
        const PlatformClass = require(platformPath);

        const instance = new PlatformClass(
          config,
          this.workerBridge,
          this.browserManager
        );

        this.platforms.set(config.platform, instance);
        logger.info(`Platform loaded: ${config.platform}`);
      } catch (error) {
        logger.error(`Failed to load platform ${dir}:`, error);
      }
    }
  }

  // 获取平台实例
  getPlatform(platformName) {
    return this.platforms.get(platformName);
  }

  // 获取支持的平台列表
  getSupportedPlatforms() {
    return Array.from(this.platforms.keys());
  }
}
```

---

### PlatformBase 平台基类

```javascript
class PlatformBase {
  constructor(config, workerBridge, browserManager) {
    this.config = config;
    this.bridge = workerBridge;
    this.browserManager = browserManager;
  }

  // 初始化
  async initialize(account) {
    const fingerprint = await this.browserManager
      .loadOrCreateFingerprint(account.id);
    logger.info(`Platform initialized for account ${account.id}`);
  }

  // 启动登录 (子类实现)
  async startLogin(options) {
    throw new Error('startLogin() must be implemented');
  }

  // 爬取评论 (子类实现)
  async crawlComments(account) {
    throw new Error('crawlComments() must be implemented');
  }

  // 爬取私信 (子类实现)
  async crawlDirectMessages(account) {
    throw new Error('crawlDirectMessages() must be implemented');
  }

  // 获取账户上下文
  async getAccountContext(accountId, proxyConfig) {
    return await this.browserManager.getOrCreateBrowser(accountId, proxyConfig);
  }

  // 保存账户状态
  async saveAccountState(accountId) {
    await this.browserManager.saveStorageState(accountId);
  }

  // 发送二维码
  async sendQRCode(sessionId, qrCodeData) {
    await this.bridge.sendQRCode(sessionId, qrCodeData);
  }

  // 发送登录状态
  async sendLoginStatus(sessionId, status, data) {
    await this.bridge.sendLoginStatus(sessionId, status, data);
  }

  // 推送监控数据
  async sendMonitorData(accountId, comments, directMessages) {
    if (comments && comments.length > 0) {
      await this.bridge.sendMonitorData('comment', accountId, comments);
    }
    if (directMessages && directMessages.length > 0) {
      await this.bridge.sendMonitorData('direct_message', accountId, directMessages);
    }
  }

  // 推送通知
  async pushNotification(options) {
    await this.bridge.pushNotification(options);
  }

  // 截图 (调试)
  async takeScreenshot(accountId, filename) {
    const context = await this.getAccountContext(accountId);
    if (context && context.pages().length > 0) {
      const page = context.pages()[0];
      const path = `${this.browserManager.dataDir}/screenshots/${accountId}_${filename}`;
      await page.screenshot({path, fullPage: true});
    }
  }
}
```

---

### 抖音平台实现示例

```javascript
class DouyinPlatform extends PlatformBase {
  constructor(config, workerBridge, browserManager) {
    super(config, workerBridge, browserManager);
    this.loginTimeout = config.timeouts.loginCheck || 300000;
  }

  async startLogin({accountId, sessionId, proxy}) {
    try {
      // 1. 获取账户专属 Browser
      const context = await this.getAccountContext(accountId, proxy);
      const page = await context.newPage();

      // 2. 导航到登录页
      await page.goto(this.config.urls.login, {
        waitUntil: 'networkidle'
      });

      // 3. 等待二维码
      await page.waitForSelector(
        this.config.selectors.qrCode,
        {timeout: 30000}
      );

      // 4. 提取二维码
      const qrElement = await page.$(this.config.selectors.qrCode);
      const qrImage = await qrElement.screenshot();
      const qrBase64 = `data:image/png;base64,${qrImage.toString('base64')}`;

      // 5. 发送二维码
      await this.sendQRCode(sessionId, qrBase64);

      // 6. 等待登录
      await page.waitForSelector('.user-profile', {
        timeout: this.loginTimeout
      });

      // 7. 提取数据
      const cookies = await context.cookies();
      const userInfo = await this.extractUserInfo(page);

      // 8. 保存
      await this.saveAccountState(accountId);

      // 9. 上报成功
      await this.sendLoginStatus(sessionId, 'success', {
        cookies,
        user_info: userInfo,
        fingerprint: await this.browserManager
          .loadOrCreateFingerprint(accountId)
      });

    } catch (error) {
      logger.error(`Login failed for ${accountId}:`, error);
      await this.sendLoginStatus(sessionId, 'failed', {
        error_message: error.message
      });
    }
  }

  async crawlComments(account) {
    const context = await this.getAccountContext(account.id);
    const page = await context.newPage();

    try {
      await page.goto('https://www.douyin.com/');

      // 爬虫实现...
      const comments = [];

      return comments;
    } finally {
      await page.close();
    }
  }

  async extractUserInfo(page) {
    return {
      nickname: await page.evaluate(() =>
        document.querySelector('.user-name')?.textContent || ''
      ),
      avatar: await page.evaluate(() =>
        document.querySelector('.user-avatar')?.src || ''
      ),
      douyin_id: await page.evaluate(() =>
        document.querySelector('.user-id')?.textContent || ''
      )
    };
  }
}

module.exports = DouyinPlatform;
```

---

## 监控任务

### MonitorTask 监控任务

```javascript
class MonitorTask {
  constructor(account, platformManager) {
    this.account = account;
    this.platformManager = platformManager;
    this.interval = this.calculateRandomInterval(); // 15-30秒
  }

  calculateRandomInterval() {
    // 随机间隔 15-30 秒，防止反爬
    const min = 15000;
    const max = 30000;
    return Math.random() * (max - min) + min;
  }

  async run() {
    try {
      const platform = this.platformManager.getPlatform(this.account.platform);

      // 1. 爬取评论
      const comments = await platform.crawlComments(this.account);

      // 2. 爬取私信
      const directMessages = await platform.crawlDirectMessages(this.account);

      // 3. 发送数据
      await platform.sendMonitorData(
        this.account.id,
        comments,
        directMessages
      );

      // 4. 计算下次运行时间
      this.interval = this.calculateRandomInterval();

    } catch (error) {
      logger.error(`Monitor task failed for ${this.account.id}:`, error);
    }

    // 5. 定时重新运行
    setTimeout(() => this.run(), this.interval);
  }
}
```

---

**文档版本**: 1.0.0
**最后更新**: 2025-10-18
**维护者**: 开发团队

[继续查看第二部分: 任务管理、通信流程、部署说明]
