# Worker 通用平台脚本系统 - 快速参考

## 🎯 核心概念

### 三层架构
```
PlatformManager (管理层)
    ↓
PlatformBase (基础层)
    ↓
DouyinPlatform (实现层)
```

## 📋 关键文件速查

| 文件 | 路径 | 作用 |
|------|------|------|
| WorkerBridge | `platforms/base/worker-bridge.js` | Worker↔Master 通信 |
| PlatformBase | `platforms/base/platform-base.js` | 平台基类 |
| PlatformManager | `platform-manager.js` | 平台加载管理 |
| DouyinPlatform | `platforms/douyin/platform.js` | 抖音实现 |
| DouyinConfig | `platforms/douyin/config.json` | 抖音配置 |

## 🔧 常用 API

### PlatformManager

```javascript
// 加载所有平台
await platformManager.loadPlatforms();

// 获取平台实例
const platform = platformManager.getPlatform('douyin');

// 获取支持的平台列表
const platforms = platformManager.getSupportedPlatforms();
```

### PlatformBase（子类实现）

```javascript
// 启动登录
await platform.startLogin({
  accountId: '123',
  sessionId: 'abc',
  proxy: { server: 'http://...' }
});

// 爬取评论
const comments = await platform.crawlComments({
  accountId: '123'
});

// 爬取私信
const dms = await platform.crawlDirectMessages({
  accountId: '123'
});

// 登录成功回调
await platform.onLoginSuccess('123');
```

### WorkerBridge

```javascript
// 发送二维码
workerBridge.sendQRCode(accountId, sessionId, qrCodeBase64);

// 发送登录状态
workerBridge.sendLoginStatus(accountId, sessionId, 'success');

// 报告错误
workerBridge.reportError(accountId, error, { context: 'login' });

// 发送监控数据
workerBridge.sendMonitorData(accountId, { comments: [...], dms: [...] });
```

## 📁 账户数据路径

```javascript
// 获取账户上下文
const ctx = await this.getAccountContext(accountId);

// 账户数据路径
const accountDir = `data/browser/${workerId}/accounts/${accountId}/`;

// 指纹文件
const fingerprintPath = `${accountDir}fingerprint.json`;

// Cookie 文件
const cookiesPath = `${accountDir}cookies.json`;

// 状态文件
const statePath = `${accountDir}state.json`;
```

## 🎨 实现新平台模板

### 1. config.json
```json
{
  "platform": "platform_name",
  "name": "平台显示名",
  "version": "1.0.0",
  "urls": {
    "login": "https://...",
    "comments": "https://...",
    "messages": "https://..."
  },
  "selectors": {
    "qrCode": ".qr-code",
    "loginSuccess": ".user-info"
  },
  "timeouts": {
    "qrCodeWait": 30000,
    "loginWait": 60000,
    "pageLoad": 10000
  }
}
```

### 2. platform.js
```javascript
const PlatformBase = require('../base/platform-base');

class MyPlatform extends PlatformBase {
  /**
   * 启动登录流程
   * @param {Object} options
   * @param {string} options.accountId - 账户ID
   * @param {string} options.sessionId - 会话ID
   * @param {Object} [options.proxy] - 代理配置
   */
  async startLogin(options) {
    const { accountId, sessionId, proxy } = options;
    
    try {
      // 1. 获取账户上下文
      const context = await this.getAccountContext(accountId, proxy);
      
      // 2. 打开登录页
      const page = await context.newPage();
      await page.goto(this.config.urls.login);
      
      // 3. 获取二维码
      const qrElement = await page.waitForSelector(
        this.config.selectors.qrCode,
        { timeout: this.config.timeouts.qrCodeWait }
      );
      
      // 4. 截取二维码
      const qrImage = await qrElement.screenshot();
      const qrBase64 = qrImage.toString('base64');
      
      // 5. 发送二维码到 Master
      this.workerBridge.sendQRCode(accountId, sessionId, qrBase64);
      
      // 6. 等待登录成功
      await page.waitForSelector(
        this.config.selectors.loginSuccess,
        { timeout: this.config.timeouts.loginWait }
      );
      
      // 7. 保存登录状态
      await this.onLoginSuccess(accountId);
      
      // 8. 通知 Master
      this.workerBridge.sendLoginStatus(accountId, sessionId, 'success');
      
    } catch (error) {
      this.workerBridge.sendLoginStatus(
        accountId,
        sessionId,
        'failed',
        error.message
      );
      throw error;
    }
  }

  /**
   * 爬取评论
   */
  async crawlComments(options) {
    const { accountId } = options;
    
    // 1. 获取浏览器上下文
    const context = await this.getAccountContext(accountId);
    
    // 2. 实现爬取逻辑
    // ...
    
    return comments;
  }

  /**
   * 爬取私信
   */
  async crawlDirectMessages(options) {
    const { accountId } = options;
    
    // 实现私信爬取逻辑
    // ...
    
    return messages;
  }

  /**
   * 登录成功回调
   */
  async onLoginSuccess(accountId) {
    // 1. 保存 Cookie
    await this.saveAccountCookies(accountId);
    
    // 2. 保存状态
    await this.saveAccountState(accountId, {
      isLoggedIn: true,
      loginTime: Date.now(),
    });
  }
}

module.exports = MyPlatform;
```

## 🧪 测试命令

```bash
# 测试平台系统
cd packages/worker
node test-platform-system.js

# 启动 Worker
node src/index.js
```

## 📊 调试技巧

### 1. 查看平台加载日志
```javascript
// PlatformManager 会输出：
// ✓ Loaded platform: 抖音 (douyin) v1.0.0
// Platform manager initialized with 1 platforms
```

### 2. 截图调试
```javascript
// 在平台脚本中
await this.takeScreenshot(accountId, 'debug-login');
// 图片保存在: data/browser/${workerId}/accounts/${accountId}/screenshots/
```

### 3. 检查账户状态
```javascript
// 读取状态文件
const state = await this.loadAccountState(accountId);
console.log('Account state:', state);
```

### 4. 查看账户 Cookie
```javascript
// Cookie 自动保存在
// data/browser/${workerId}/accounts/${accountId}/cookies.json
```

## ⚠️ 常见问题

### Q: 平台脚本没有被加载？
**A**: 检查：
1. 目录名与 `config.json` 中的 `platform` 字段是否一致
2. `config.json` 和 `platform.js` 是否都存在
3. 查看 Worker 启动日志中的警告信息

### Q: 如何传递代理配置？
**A**: 在调用 `getAccountContext(accountId, proxy)` 时传入：
```javascript
const context = await this.getAccountContext(accountId, {
  server: 'http://proxy.example.com:8080',
  username: 'user',
  password: 'pass'
});
```

### Q: 如何处理登录失败？
**A**: 捕获异常并通知 Master：
```javascript
try {
  // 登录逻辑
} catch (error) {
  this.workerBridge.sendLoginStatus(
    accountId,
    sessionId,
    'failed',
    error.message
  );
  throw error;
}
```

### Q: 账户数据什么时候清理？
**A**: 
- Cookie 在每次登录成功后自动保存
- 状态文件需要手动调用 `saveAccountState()`
- 浏览器上下文由 `BrowserManagerV2` 管理，Worker 关闭时自动清理

## 🚀 性能优化建议

1. **复用浏览器上下文**: 同一账户的多次操作使用同一 context
2. **并发控制**: 使用队列限制同时爬取的账户数量
3. **请求缓存**: 缓存不常变化的数据（如用户信息）
4. **增量爬取**: 只爬取新增的评论/私信
5. **错误重试**: 实现指数退避的重试机制

## 📚 相关文档

- 设计方案: `.docs/worker-通用平台脚本系统设计方案.md`
- 实施总结: `.docs/worker-平台系统实施总结.md`
- 测试脚本: `packages/worker/test-platform-system.js`

---

**更新时间**: 2025-10-16  
**维护人员**: Development Team
