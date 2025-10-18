# 通用平台脚本系统设计方案

## 📋 设计目标

基于现有 Worker 架构，实现一个通用的平台脚本系统，支持：
- ✅ 动态加载不同平台脚本（抖音、小红书等）
- ✅ 统一的脚本接口和生命周期管理
- ✅ 公共工具方法（发送二维码、状态上报等）
- ✅ 最小化对现有架构的改动

## 🏗️ 系统架构

### 1. 目录结构
```
packages/worker/src/
├── platforms/                    # 平台脚本目录（新增）
│   ├── base/
│   │   ├── platform-base.js      # 平台基类
│   │   └── worker-bridge.js      # Worker 通信桥接
│   ├── douyin/
│   │   ├── platform.js           # 抖音平台脚本
│   │   ├── config.json           # 平台配置
│   │   └── crawler.js            # 抖音爬虫实现
│   └── xiaohongshu/
│       ├── platform.js           # 小红书平台脚本
│       ├── config.json           # 平台配置
│       └── crawler.js            # 小红书爬虫实现
├── platform-manager.js           # 平台管理器（新增）
└── index.js                      # Worker 入口（需修改）

# 账户独立数据存储结构
data/browser/worker-{workerId}/
├── fingerprints/                 # 指纹配置目录
│   ├── {accountId}_fingerprint.json
│   └── {accountId2}_fingerprint.json
├── storage-states/               # Cookie 和存储状态
│   ├── {accountId}_storage.json
│   └── {accountId2}_storage.json
├── contexts/                     # 浏览器上下文数据
│   ├── {accountId}/
│   │   ├── Local Storage/
│   │   ├── Session Storage/
│   │   └── IndexedDB/
│   └── {accountId2}/
└── screenshots/                  # 调试截图
    ├── {accountId}_login.png
    └── {accountId}_error.png
```

### 2. 核心组件

#### 2.1 Platform Manager（平台管理器）
负责自动发现、加载和管理平台脚本，并管理账户独立的数据存储：

```javascript
class PlatformManager {
  constructor(workerBridge, browserManager) {
    this.platforms = new Map();
    this.workerBridge = workerBridge;
    this.browserManager = browserManager; // 复用现有浏览器管理器
    this.accountContexts = new Map(); // accountId -> contextInfo
  }

  // 自动扫描并加载平台脚本
  async loadPlatforms();
  
  // 获取指定平台实例
  getPlatform(platformName);
  
  // 获取支持的平台列表
  getSupportedPlatforms();
  
  // 为账户创建独立的上下文环境
  async createAccountContext(accountId, platform);
  
  // 获取账户的上下文环境
  getAccountContext(accountId);
}
```

#### 2.2 Platform Base（平台基类）
提供统一的平台接口和公共功能，支持账户级别的独立数据管理：

```javascript
class PlatformBase {
  constructor(config, workerBridge, browserManager) {
    this.config = config;
    this.bridge = workerBridge;
    this.browserManager = browserManager;
    this.accountSessions = new Map(); // accountId -> sessionData
  }

  // 标准生命周期方法
  async initialize(account);
  async startLogin(accountId, sessionId, proxyConfig);
  async crawlComments(account);
  async crawlDirectMessages(account);
  async cleanup(accountId);

  // 账户独立数据管理
  async createAccountContext(accountId, proxyConfig);
  async loadAccountFingerprint(accountId);
  async saveAccountState(accountId);
  async loadAccountCookies(accountId);

  // 公共工具方法
  async sendQRCode(sessionId, qrCodeData);
  async sendLoginStatus(sessionId, status, data);
  async reportError(sessionId, error);
  async updateHeartbeat(stats);
  
  // 调试支持
  async takeScreenshot(accountId, filename);
}
```

#### 2.3 Account Context Manager（账户上下文管理器）
专门管理每个账户的独立数据，集成现有的指纹和 Cookie 系统：

```javascript
class AccountContextManager {
  constructor(dataDir, browserManager) {
    this.dataDir = dataDir;
    this.browserManager = browserManager;
    this.contexts = new Map(); // accountId -> contextInfo
  }

  // 创建账户专属的浏览器上下文
  async createContext(accountId, platform, proxyConfig) {
    // 1. 加载或生成指纹配置
    const fingerprint = await this.loadOrCreateFingerprint(accountId);
    
    // 2. 设置存储状态路径
    const storageStatePath = this.getStorageStatePath(accountId);
    
    // 3. 创建浏览器上下文（复用现有 BrowserManager）
    const context = await this.browserManager.createContext(accountId, {
      proxy: proxyConfig,
      storageState: storageStatePath,
      fingerprint: fingerprint
    });
    
    return context;
  }

  // 指纹管理
  async loadOrCreateFingerprint(accountId);
  async saveFingerprint(accountId, fingerprint);
  
  // Cookie 和存储状态管理
  async saveStorageState(accountId, context);
  async loadStorageState(accountId);
  getStorageStatePath(accountId);
  
  // 上下文数据目录管理
  getContextDataDir(accountId);
  ensureContextDir(accountId);
}
```

#### 2.3 Worker Bridge（通信桥接）
封装与 Worker 主进程的通信：

```javascript
class WorkerBridge {
  constructor(socketClient, workerId) {
    this.socketClient = socketClient;
    this.workerId = workerId;
  }

  // 发送二维码到 Master
  async sendQRCode(sessionId, qrCodeData);
  
  // 发送登录状态
  async sendLoginStatus(sessionId, status, data);
  
  // 上报错误
  async reportError(sessionId, error);
  
  // 发送监控数据
  async sendMonitorData(accountId, comments, directMessages);
}
```

## 📄 平台脚本规范

### 1. 配置文件格式（config.json）
```json
{
  "platform": "douyin",
  "displayName": "抖音",
  "version": "1.0.0",
  "capabilities": [
    "login",
    "comment_monitoring", 
    "dm_monitoring"
  ],
  "urls": {
    "home": "https://www.douyin.com/",
    "login": "https://www.douyin.com/passport/web/login/"
  },
  "selectors": {
    "qrCode": ".qrcode-img",
    "loginButton": ".login-button",
    "comments": ".comment-item"
  },
  "timeouts": {
    "qrCodeLoad": 30000,
    "loginCheck": 300000,
    "pageLoad": 15000
  }
}
```

### 2. 平台脚本接口（platform.js）
```javascript
const PlatformBase = require('../base/platform-base');

class DouyinPlatform extends PlatformBase {
  constructor(config, workerBridge, browserManager) {
    super(config, workerBridge, browserManager);
    this.crawler = new DouyinCrawler(config);
  }

  async initialize(account) {
    // 1. 创建账户独立的上下文环境
    await this.createAccountContext(account.id, null);
    
    // 2. 加载账户专属的指纹配置
    await this.loadAccountFingerprint(account.id);
    
    // 3. 平台特定的初始化逻辑
    await this.crawler.initialize(account);
    
    this.bridge.log(`Douyin platform initialized for ${account.id}`);
  }

  async startLogin(accountId, sessionId, proxyConfig) {
    try {
      // 1. 创建账户专属的浏览器上下文（带指纹和 Cookie）
      const context = await this.createAccountContext(accountId, proxyConfig);
      
      // 2. 创建新页面
      const page = await context.newPage();
      
      // 3. 导航到登录页面
      await page.goto(this.config.urls.login);
      
      // 4. 等待二维码加载
      const qrElement = await page.waitForSelector(
        this.config.selectors.qrCode, 
        { timeout: this.config.timeouts.qrCodeLoad }
      );
      
      // 5. 提取二维码数据
      const qrCodeData = await this.extractQRCode(qrElement);
      
      // 6. 发送二维码到 Master
      await this.bridge.sendQRCode(sessionId, qrCodeData);
      
      // 7. 开始轮询登录状态
      this.startLoginPolling(sessionId, page, accountId);
      
    } catch (error) {
      // 保存错误截图到账户专属目录
      await this.takeScreenshot(accountId, `login_error_${Date.now()}.png`);
      await this.bridge.reportError(sessionId, error);
    }
  }

  async crawlComments(account) {
    // 使用账户专属的上下文进行爬取
    const context = this.getAccountContext(account.id);
    return await this.crawler.crawlComments(account, context);
  }

  async crawlDirectMessages(account) {
    // 使用账户专属的上下文进行爬取
    const context = this.getAccountContext(account.id);
    return await this.crawler.crawlDirectMessages(account, context);
  }

  // 登录成功后保存 Cookie 和状态
  async onLoginSuccess(accountId, page) {
    const context = page.context();
    
    // 1. 保存 Cookie 和存储状态
    await this.saveAccountState(accountId);
    
    // 2. 保存成功登录的截图
    await this.takeScreenshot(accountId, `login_success_${Date.now()}.png`);
    
    // 3. 更新账户状态
    await this.bridge.sendLoginStatus(sessionId, 'success', {
      timestamp: Date.now(),
      fingerprint: await this.getAccountFingerprint(accountId)
    });
  }

  // 账户独立的数据管理方法
  async createAccountContext(accountId, proxyConfig) {
    return await this.browserManager.createContext(accountId, {
      proxy: proxyConfig,
      storageState: this.getStorageStatePath(accountId),
      fingerprint: await this.loadAccountFingerprint(accountId)
    });
  }

  async loadAccountFingerprint(accountId) {
    // 加载或生成账户专属的指纹配置
    return await this.browserManager.getOrCreateFingerprint(accountId);
  }

  async saveAccountState(accountId) {
    // 保存账户的 Cookie 和存储状态
    const context = this.getAccountContext(accountId);
    await this.browserManager.saveStorageState(accountId);
  }

  getStorageStatePath(accountId) {
    return `${this.browserManager.config.dataDir}/storage-states/${accountId}_storage.json`;
  }

  async takeScreenshot(accountId, filename) {
    const context = this.getAccountContext(accountId);
    if (context && context.pages().length > 0) {
      const page = context.pages()[0];
      const screenshotPath = `${this.browserManager.config.dataDir}/screenshots/${accountId}_${filename}`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      this.bridge.log(`Screenshot saved: ${screenshotPath}`);
    }
  }
}

module.exports = DouyinPlatform;
```

## 🗂️ 账户独立数据管理

### 1. 指纹文件管理
每个账户拥有独立的指纹配置文件：

```javascript
// data/browser/worker-{workerId}/fingerprints/{accountId}_fingerprint.json
{
  "accountId": "account_001",
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
  "viewport": { "width": 1366, "height": 768 },
  "timezone": "Asia/Shanghai",
  "locale": "zh-CN",
  "platform": "Win32",
  "webgl": {
    "vendor": "Intel Inc.",
    "renderer": "Intel(R) HD Graphics 620"
  },
  "canvas": {
    "noise": "aB3dE",
    "fonts": ["Arial", "Times New Roman", "SimSun"]
  },
  "audio": {
    "noiseOffset": 0.0001234
  },
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

### 2. Cookie 和存储状态文件
每个账户的登录状态独立保存：

```javascript
// data/browser/worker-{workerId}/storage-states/{accountId}_storage.json
{
  "cookies": [
    {
      "name": "sessionid",
      "value": "abc123...",
      "domain": ".douyin.com",
      "path": "/",
      "expires": 1705123456,
      "httpOnly": true,
      "secure": true
    }
  ],
  "origins": [
    {
      "origin": "https://www.douyin.com",
      "localStorage": [
        {
          "name": "user_info",
          "value": "{\"uid\":\"123456\"}"
        }
      ],
      "sessionStorage": []
    }
  ]
}
```

### 3. 账户上下文隔离
每个账户在独立的目录中存储数据：

```
data/browser/worker-{workerId}/contexts/{accountId}/
├── Local Storage/              # 本地存储
├── Session Storage/            # 会话存储  
├── IndexedDB/                 # 索引数据库
├── WebSQL/                    # WebSQL 数据
├── Cache/                     # 缓存文件
└── Service Workers/           # Service Worker 状态
```

## 🔧 实现步骤

### Phase 1: 基础架构搭建
1. **创建基础组件**
   - [ ] `packages/worker/src/platforms/base/platform-base.js`
   - [ ] `packages/worker/src/platforms/base/worker-bridge.js`
   - [ ] `packages/worker/src/platforms/base/account-context-manager.js`
   - [ ] `packages/worker/src/platform-manager.js`

2. **修改 Worker 入口**
   - [ ] 修改 `packages/worker/src/index.js`
   - [ ] 集成 PlatformManager
   - [ ] **确保与现有 BrowserManagerV2 的无缝集成**

### Phase 2: 抖音平台脚本迁移
1. **创建抖音平台脚本**
   - [ ] `packages/worker/src/platforms/douyin/platform.js`
   - [ ] `packages/worker/src/platforms/douyin/config.json`
   - [ ] 迁移现有 DouyinLoginHandler 逻辑
   - [ ] **集成现有指纹和 Cookie 管理**

2. **测试抖音平台**
   - [ ] 验证登录流程（含指纹和 Cookie）
   - [ ] 验证监控功能
   - [ ] **验证账户间数据隔离**

### Phase 3: 小红书平台支持
1. **创建小红书平台脚本**
   - [ ] `packages/worker/src/platforms/xiaohongshu/platform.js`
   - [ ] `packages/worker/src/platforms/xiaohongshu/config.json`
   - [ ] `packages/worker/src/platforms/xiaohongshu/crawler.js`
   - [ ] **配置小红书专属的指纹策略**

2. **测试小红书平台**
   - [ ] 实现登录流程（含独立指纹）
   - [ ] 实现监控功能
   - [ ] **验证与抖音账户的完全隔离**

## 💡 设计优势

### 1. 最小化架构改动
- 保持现有 Socket 通信不变
- **完全复用现有浏览器管理器和指纹系统**
- 兼容现有数据库结构
- **无缝集成现有的 BrowserManagerV2**

### 2. 高度可扩展
- 新增平台只需添加对应目录和脚本
- 统一的接口规范
- 配置驱动的实现
- **自动继承指纹和 Cookie 管理能力**

### 3. 账户级别的完全隔离
- **每个账户独立的指纹配置文件**
- **每个账户独立的 Cookie 和存储状态**
- **独立的浏览器上下文和数据目录**
- **防止账户间数据泄露和指纹关联**

### 4. 代码复用
- 公共功能通过基类提供
- 通信逻辑统一封装
- 工具方法共享
- **复用现有的指纹随机化和存储管理**

### 5. 便于维护和调试
- 平台逻辑独立
- 配置与代码分离
- 清晰的目录结构
- **每个账户独立的截图和日志**

## 🔗 与现有系统集成

### 1. Worker 注册时上报能力
```javascript
// packages/worker/src/communication/registration.js
const capabilities = platformManager.getSupportedPlatforms();
// 发送给 Master: ['douyin', 'xiaohongshu']
```

### 2. 任务分配时选择平台
```javascript
// packages/worker/src/handlers/task-runner.js
async addTask(account) {
  const platform = platformManager.getPlatform(account.platform);
  const task = new MonitorTask(account, platform);
  // ...
}
```

### 3. 登录处理器动态选择
```javascript
// packages/worker/src/index.js
socketClient.socket.on('master:login:start', async (data) => {
  const platform = platformManager.getPlatform(account.platform);
  await platform.startLogin(data.account_id, data.session_id, data.proxy);
});
```

## 📋 工作量评估

- **Phase 1**: 2-3 天（基础架构）
- **Phase 2**: 1-2 天（抖音迁移）
- **Phase 3**: 2-3 天（小红书开发）
- **总计**: 5-8 天

## 🎯 下一步行动

1. 确认设计方案
2. 创建基础架构组件
3. 迁移抖音平台脚本
4. 开发小红书平台支持
5. 完善文档和测试

这个方案保持了现有架构的稳定性，同时提供了高度的可扩展性。您觉得这个设计方案如何？有什么需要调整的地方吗？