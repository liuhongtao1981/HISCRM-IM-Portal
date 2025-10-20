# Worker 平台扩展完整指南

**版本**: 1.0.0
**日期**: 2025-10-18
**主题**: 如何为 Worker 添加新的爬虫平台

---

## 📋 目录

1. [快速开始](#快速开始)
2. [平台系统设计](#平台系统设计)
3. [实现步骤](#实现步骤)
4. [回复功能支持](#回复功能支持)
5. [完整代码示例](#完整代码示例)
6. [测试和验证](#测试和验证)
7. [常见问题](#常见问题)

---

## 快速开始

### 5分钟快速添加新平台

```bash
# 1. 创建平台目录
mkdir -p packages/worker/src/platforms/xiaohongshu

# 2. 创建配置文件 (config.json)
# 3. 创建平台脚本 (platform.js) - 包含所有爬虫逻辑

# 4. 测试
WORKER_ID=worker-test PORT=4000 npm start
```

---

## 平台系统设计

### 目录结构

每个平台是一个独立的模块，结构如下：

```
packages/worker/src/platforms/
├── base/                          # 基础框架
│   ├── platform-base.js          # 平台基类
│   ├── worker-bridge.js          # 与 Master 通信
│   └── account-context-manager.js # 账户上下文管理
│
├── douyin/                        # 抖音平台 (现有)
│   ├── config.json              # 配置
│   └── platform.js              # 主实现（包含爬虫逻辑）
│
└── xiaohongshu/                 # 小红书平台 (新增)
    ├── config.json              # 配置
    └── platform.js              # 主实现（包含爬虫逻辑）
```

### 平台系统的工作原理

```
PlatformManager (平台管理器)
    │
    ├── 自动扫描 platforms/ 目录
    ├── 加载每个平台的 config.json
    ├── 加载平台脚本 (platform.js)
    └── 注册到内存中
         │
         ├─→ douyin → DouyinPlatform 实例
         ├─→ xiaohongshu → XiaohongshuPlatform 实例
         └─→ ...其他平台

当收到任务时:
    │
    ├── Worker 获取平台名称 (account.platform)
    ├── 从 PlatformManager 获取对应平台实例
    ├── 调用平台的方法 (startLogin, crawlComments, etc.)
    └── 平台执行相应操作
```

---

## 实现步骤

### 步骤 1: 创建平台配置文件

**文件**: `packages/worker/src/platforms/xiaohongshu/config.json`

```json
{
  "platform": "xiaohongshu",
  "displayName": "小红书",
  "version": "1.0.0",
  "capabilities": [
    "login",
    "comment_monitoring",
    "dm_monitoring"
  ],
  "urls": {
    "home": "https://www.xiaohongshu.com/",
    "login": "https://www.xiaohongshu.com/login",
    "creator": "https://www.xiaohongshu.com/user/creator"
  },
  "selectors": {
    "qrCode": ".qr-code-image img",
    "loginButton": "[class*='login-btn']",
    "comments": "[class*='comment-item']",
    "commentContent": "[class*='comment-text']",
    "userProfile": ".user-info",
    "userNickname": ".user-name",
    "userAvatar": ".user-avatar img"
  },
  "timeouts": {
    "qrCodeLoad": 30000,
    "loginCheck": 300000,
    "pageLoad": 15000,
    "commentLoad": 10000
  },
  "retryConfig": {
    "maxRetries": 3,
    "baseDelay": 1000,
    "backoff": 2
  }
}
```

### 步骤 2: 创建平台主实现

**文件**: `packages/worker/src/platforms/xiaohongshu/platform.js`

> ℹ️ **注意**: 爬虫逻辑直接写在 `platform.js` 中，不需要单独的 `crawler.js` 文件。这样做可以保持结构简洁，同时保留后期分离的灵活性。

```javascript
const PlatformBase = require('../base/platform-base');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

class XiaohongshuPlatform extends PlatformBase {
  constructor(config, workerBridge, browserManager) {
    super(config, workerBridge, browserManager);
    this.logger = createLogger('xiaohongshu', './logs');
  }

  /**
   * 初始化平台
   * @param {Object} account - 账户信息
   */
  async initialize(account) {
    try {
      this.logger.info(`Initializing Xiaohongshu for account ${account.id}`);

      // 1. 创建账户专属上下文
      await this.createAccountContext(account.id, null);

      // 2. 加载指纹
      const fingerprint = await this.loadAccountFingerprint(account.id);
      this.logger.info(`Loaded fingerprint for account ${account.id}`);

      this.logger.info(`Xiaohongshu initialized successfully for ${account.id}`);
    } catch (error) {
      this.logger.error(`Failed to initialize Xiaohongshu: ${error.message}`);
      throw error;
    }
  }

  /**
   * 启动登录流程 (二维码登录)
   * @param {Object} options - 选项 {accountId, sessionId, proxy}
   */
  async startLogin({ accountId, sessionId, proxy }) {
    try {
      this.logger.info(`Starting Xiaohongshu login for account ${accountId}`);

      // 1. 创建账户专属 Browser
      const context = await this.getAccountContext(accountId, proxy);
      const page = await context.newPage();

      try {
        // 2. 导航到登录页
        await page.goto(this.config.urls.login, { waitUntil: 'networkidle' });
        this.logger.debug(`Navigated to login page for ${accountId}`);

        // 3. 检测登录方式
        const loginMethod = await this.detectLoginMethod(page);
        this.logger.info(`Detected login method: ${loginMethod.type}`);

        // 4. 根据登录方式处理
        if (loginMethod.type === 'qrcode') {
          await this.handleQRCodeLogin(page, accountId, sessionId);
        } else if (loginMethod.type === 'phone') {
          await this.handlePhoneLogin(page, accountId, sessionId);
        } else {
          throw new Error(`Unsupported login method: ${loginMethod.type}`);
        }

      } finally {
        await page.close();
      }

    } catch (error) {
      this.logger.error(`Login failed for account ${accountId}: ${error.message}`);
      await this.sendLoginStatus(sessionId, 'failed', {
        error_message: error.message
      });
      throw error;
    }
  }

  /**
   * 检测登录方式
   */
  async detectLoginMethod(page) {
    try {
      // 检查二维码
      if (await page.$(this.config.selectors.qrCode)) {
        return { type: 'qrcode', selector: this.config.selectors.qrCode };
      }

      // 检查手机登录
      if (await page.$('input[placeholder*="手机"]')) {
        return { type: 'phone' };
      }

      throw new Error('No supported login method found');
    } catch (error) {
      throw new Error(`Failed to detect login method: ${error.message}`);
    }
  }

  /**
   * 处理二维码登录
   */
  async handleQRCodeLogin(page, accountId, sessionId) {
    try {
      // 等待二维码加载
      await page.waitForSelector(
        this.config.selectors.qrCode,
        { timeout: this.config.timeouts.qrCodeLoad }
      );

      // 提取二维码
      const qrElement = await page.$(this.config.selectors.qrCode);
      const qrImage = await qrElement.screenshot();
      const qrBase64 = `data:image/png;base64,${qrImage.toString('base64')}`;

      // 发送二维码给 Master
      await this.sendQRCode(sessionId, qrBase64);
      this.logger.info(`QR code sent for session ${sessionId}`);

      // 等待登录成功（轮询）
      await this.waitForLoginSuccess(page, sessionId, accountId);

    } catch (error) {
      throw new Error(`QR code login failed: ${error.message}`);
    }
  }

  /**
   * 等待登录成功（轮询）
   */
  async waitForLoginSuccess(page, sessionId, accountId) {
    const maxAttempts = this.config.timeouts.loginCheck / 2000;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        // 检查是否已登录 (根据特定元素判断)
        const isLoggedIn = await page.evaluate(() => {
          // 检查用户信息元素是否出现
          return !!document.querySelector('.user-info');
        });

        if (isLoggedIn) {
          this.logger.info(`Login successful for account ${accountId}`);

          // 提取用户信息
          const userInfo = await this.extractUserInfo(page);

          // 保存状态
          await this.saveAccountState(accountId);

          // 上报成功
          await this.sendLoginStatus(sessionId, 'success', {
            user_info: userInfo,
            fingerprint: await this.browserManager.loadOrCreateFingerprint(accountId)
          });

          return;
        }

        attempts++;
        await page.waitForTimeout(2000);

      } catch (error) {
        this.logger.debug(`Login check attempt ${attempts} failed: ${error.message}`);
        attempts++;
      }
    }

    throw new Error('Login timeout');
  }

  /**
   * 提取用户信息
   */
  async extractUserInfo(page) {
    try {
      const userInfo = await page.evaluate(() => {
        return {
          nickname: document.querySelector('.user-name')?.textContent || '',
          avatar: document.querySelector('.user-avatar img')?.src || '',
          userId: document.querySelector('[data-user-id]')?.getAttribute('data-user-id') || ''
        };
      });

      this.logger.info(`Extracted user info: ${userInfo.nickname}`);
      return userInfo;
    } catch (error) {
      throw new Error(`Failed to extract user info: ${error.message}`);
    }
  }

  /**
   * 爬取评论
   */
  async crawlComments(account) {
    try {
      this.logger.info(`Crawling comments for account ${account.id}`);

      const context = await this.getAccountContext(account.id);
      if (!context) {
        throw new Error(`No context found for account ${account.id}`);
      }

      // 爬取评论（内联实现）
      const comments = await this.extractComments(account, context);

      this.logger.info(`Crawled ${comments.length} comments for ${account.id}`);

      // 推送通知 (如果有新数据)
      if (comments.length > 0) {
        await this.pushNotification({
          type: 'comment',
          accountId: account.id,
          title: `发现 ${comments.length} 条新评论`,
          content: `账号 "${account.account_name}" 有新评论`,
          data: {
            comments,
            count: comments.length,
            preview: comments[0].content?.substring(0, 50)
          },
          relatedId: comments[0].id,
          priority: 'normal'
        });
      }

      return comments;
    } catch (error) {
      this.logger.error(`Failed to crawl comments: ${error.message}`);
      throw error;
    }
  }

  /**
   * 爬取私信
   */
  async crawlDirectMessages(account) {
    try {
      this.logger.info(`Crawling direct messages for account ${account.id}`);

      const context = await this.getAccountContext(account.id);
      if (!context) {
        throw new Error(`No context found for account ${account.id}`);
      }

      // 爬取私信（内联实现）
      const messages = await this.extractDirectMessages(account, context);

      this.logger.info(`Crawled ${messages.length} messages for ${account.id}`);

      // 推送通知
      if (messages.length > 0) {
        await this.pushNotification({
          type: 'direct_message',
          accountId: account.id,
          title: `发现 ${messages.length} 条新私信`,
          content: `账号 "${account.account_name}" 有新私信`,
          data: {
            messages,
            count: messages.length
          },
          relatedId: messages[0].id,
          priority: 'high'
        });
      }

      return messages;
    } catch (error) {
      this.logger.error(`Failed to crawl direct messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * 清理账户资源
   */
  async cleanup(accountId) {
    try {
      this.logger.info(`Cleaning up resources for account ${accountId}`);
      await this.browserManager.closeBrowser(accountId);
      this.logger.info(`Cleanup completed for account ${accountId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup: ${error.message}`);
    }
  }

  /**
   * 处理手机登录 (可选)
   */
  async handlePhoneLogin(page, accountId, sessionId) {
    throw new Error('Phone login not implemented yet');
  }
}

module.exports = XiaohongshuPlatform;
```

### 步骤 3: 实现必要的方法

在 `platform.js` 中，你需要在 `XiaohongshuPlatform` 类中实现以下**必要的抽象方法**和**可选的辅助方法**：

#### 🔴 必须实现的方法（继承自 PlatformBase）

| 方法名 | 返回类型 | 说明 | 示例 |
|--------|---------|------|------|
| `initialize(account)` | Promise\<void\> | 初始化平台和账户上下文 | 加载指纹、创建浏览器上下文 |
| `startLogin(options)` | Promise\<void\> | 启动登录流程 | 显示二维码、监听登录状态 |
| `crawlComments(account)` | Promise\<Array\> | 爬取评论 | 返回评论列表 |
| `crawlDirectMessages(account)` | Promise\<Array\> | 爬取私信 | 返回私信列表 |
| `cleanup(accountId)` | Promise\<void\> | 清理账户资源 | 关闭浏览器、清空缓存 |

#### 🔵 回复功能相关的方法（可选，如支持回复功能）

| 方法名 | 返回类型 | 说明 | 参数 |
|--------|---------|------|------|
| `replyToComment(options)` | Promise\<Object\> | 回复评论 | {accountId, commentId, targetId, content, replyType} |
| `replyToDirectMessage(options)` | Promise\<Object\> | 回复私信 | {accountId, messageId, senderId, content} |
| `canReply(accountId, type)` | Promise\<Boolean\> | 检查是否支持回复 | type: 'comment' \| 'message' |

**回复功能实现说明**:
```javascript
/**
 * 回复评论
 * @param {Object} options
 * @param {string} options.accountId - 账户ID
 * @param {string} options.commentId - 评论ID
 * @param {string} options.targetId - 目标ID (帖子/视频ID)
 * @param {string} options.content - 回复内容
 * @param {string} options.replyType - 回复类型 ('reply'|'mention'|'quote')
 * @returns {Promise<Object>} {success: boolean, replyId?: string, error?: string}
 */
async replyToComment({ accountId, commentId, targetId, content, replyType }) {
  try {
    this.logger.info(`Replying to comment ${commentId}`);

    const context = await this.getAccountContext(accountId);
    const page = await context.newPage();

    try {
      // 1. 导航到评论所在的帖子/视频页面
      await page.goto(`${this.config.urls.home}/post/${targetId}`);

      // 2. 找到并点击评论的回复按钮
      const replyButton = await page.$(`[data-comment-id="${commentId}"] [class*="reply-btn"]`);
      if (!replyButton) throw new Error('Reply button not found');

      await replyButton.click();

      // 3. 等待回复框出现
      await page.waitForSelector('[class*="reply-input"]', { timeout: 5000 });

      // 4. 输入回复内容
      const replyInput = await page.$('[class*="reply-input"]');
      await replyInput.type(content, { delay: 50 });

      // 5. 提交回复
      const submitBtn = await page.$('[class*="reply-submit"]');
      await submitBtn.click();

      // 6. 等待成功提示
      await page.waitForSelector('[class*="success-message"]', { timeout: 10000 });

      this.logger.info(`Successfully replied to comment ${commentId}`);
      return { success: true };

    } finally {
      await page.close();
    }

  } catch (error) {
    this.logger.error(`Failed to reply to comment: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 回复私信
 * @param {Object} options
 * @param {string} options.accountId - 账户ID
 * @param {string} options.messageId - 私信ID
 * @param {string} options.senderId - 发送者ID
 * @param {string} options.content - 回复内容
 * @returns {Promise<Object>} {success: boolean, messageId?: string, error?: string}
 */
async replyToDirectMessage({ accountId, messageId, senderId, content }) {
  try {
    this.logger.info(`Replying to message ${messageId} from ${senderId}`);

    const context = await this.getAccountContext(accountId);
    const page = await context.newPage();

    try {
      // 1. 导航到私信页面
      await page.goto(`${this.config.urls.home}/dm`);

      // 2. 找到对应的私信会话
      await page.click(`[data-user-id="${senderId}"]`);

      // 3. 等待消息输入框加载
      await page.waitForSelector('[class*="message-input"]', { timeout: 5000 });

      // 4. 输入回复内容
      const input = await page.$('[class*="message-input"]');
      await input.type(content, { delay: 50 });

      // 5. 发送消息
      const sendBtn = await page.$('[class*="message-send"]');
      await sendBtn.click();

      // 6. 验证消息已发送
      await page.waitForSelector('[class*="message-sent"]', { timeout: 10000 });

      this.logger.info(`Successfully replied to message ${messageId}`);
      return { success: true };

    } finally {
      await page.close();
    }

  } catch (error) {
    this.logger.error(`Failed to reply to message: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 检查是否支持某类型的回复
 */
async canReply(accountId, type) {
  try {
    // 检查账户是否已登录且有权限进行该操作
    const context = await this.getAccountContext(accountId);
    if (!context) return false;

    // type: 'comment' | 'message'
    return type === 'comment' || type === 'message';

  } catch (error) {
    this.logger.error(`Error checking reply capability: ${error.message}`);
    return false;
  }
}
```

#### 🟡 可选的辅助方法

| 方法名 | 返回类型 | 说明 |
|--------|---------|------|
| `extractComments(account, context)` | Promise\<Array\> | 从页面提取评论的内部实现 |
| `extractDirectMessages(account, context)` | Promise\<Array\> | 从页面提取私信的内部实现 |
| `detectLoginMethod(page)` | Promise\<Object\> | 检测登录方式（二维码/手机/邮箱） |
| `handleQRCodeLogin(page, ...)` | Promise\<void\> | 处理二维码登录流程 |
| `handlePhoneLogin(page, ...)` | Promise\<void\> | 处理手机验证码登录 |
| `extractUserInfo(page)` | Promise\<Object\> | 登录后提取用户信息 |

#### 🟢 继承自 PlatformBase 的公共方法（可直接使用）

**账户上下文管理**:
```javascript
this.getAccountContext(accountId)                    // 同步获取已存在的 context
await this.ensureAccountContext(accountId, proxy)    // 获取或创建 Browser context
await this.createAccountContext(accountId, proxy)    // 创建新的 context（覆盖旧的）
```

**指纹和状态管理**:
```javascript
await this.loadAccountFingerprint(accountId)         // 加载指纹（JSON）- 用于反爬虫识别
await this.saveAccountState(accountId)               // 保存账户状态（Cookies、认证信息等）
```

**登录帮助方法**:
```javascript
await this.detectLoginMethod(page)                   // 检测页面的登录方式（需子类实现）
await this.checkLoginStatus(page, method)            // 检查是否已登录（支持多种检测方法）
await this.waitForLogin(page, accountId, sessionId, options)  // 等待登录完成（通用方法）
await this.handleQRCodeLogin(page, accountId, sessionId, opts) // 二维码登录框架
await this.handleSMSLogin(page, accountId, sessionId, opts)    // 短信验证码登录框架
await this.waitForUserInput(sessionId, type, options)          // 等待用户输入（弹窗确认）
await this.saveLoginState(page, accountId)          // 保存登录后的状态
await this.extractUserInfo(page)                     // 登录后提取用户信息
```

**与 Master 通信**:
```javascript
await this.sendQRCode(sessionId, base64Image)        // 发送二维码给后端展示
await this.sendLoginStatus(sessionId, status, data)  // 发送登录状态（success/failed/timeout）
await this.reportError(sessionId, error)             // 报告错误给后端
await this.sendMonitorData(accountId, comments, dms) // 发送爬虫数据给后端
await this.pushNotification(data)                    // 推送通知给客户端（评论/私信）
await this.updateHeartbeat(stats)                    // 报告心跳数据给 Master
```

**调试工具**:
```javascript
await this.takeScreenshot(accountId, filename)       // 保存调试截图
this.log(message, level)                             // 打印日志（level: info/warn/error）
```

#### 完整方法实现示例

```javascript
// 必须实现：evaluateComments 内联爬虫
async extractComments(account, context) {
  const page = await context.newPage();
  try {
    await page.goto(this.config.urls.creator, { waitUntil: 'networkidle' });

    const comments = await page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).map(item => ({
        id: item.getAttribute('data-id'),
        content: item.querySelector('[class*="content"]')?.textContent,
        author_name: item.querySelector('[class*="author"]')?.textContent,
        author_id: item.getAttribute('data-author-id'),
        detected_at: Math.floor(Date.now() / 1000)
      }));
    }, this.config.selectors.comments);

    return comments;
  } finally {
    await page.close();
  }
}

// 必须实现：extractDirectMessages 内联爬虫
async extractDirectMessages(account, context) {
  const page = await context.newPage();
  try {
    await page.goto(`${this.config.urls.home}/dm`, { waitUntil: 'networkidle' });

    const messages = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="message-item"]')).map(item => ({
        id: item.getAttribute('data-id'),
        content: item.querySelector('[class*="content"]')?.textContent,
        sender_name: item.querySelector('[class*="sender"]')?.textContent,
        sender_id: item.getAttribute('data-sender-id'),
        direction: item.getAttribute('data-direction') || 'inbound',
        detected_at: Math.floor(Date.now() / 1000)
      }));
    });

    return messages;
  } finally {
    await page.close();
  }
}
```

---

## 回复功能支持

### 概述

如果你的平台想支持**自动回复**功能（回复评论或私信），需要实现以下三个方法。这些方法将由 Master 服务器中的 ReplyExecutor 调用。

### 工作流程

```
Master ReplyExecutor (packages/master/src/handlers/reply-executor.js)
    │
    ├─→ 检查回复任务 (reply_type, target_id, account_id)
    │
    ├─→ 从数据库获取回复详情
    │
    ├─→ 发送回复任务到 Worker (Socket: worker:execute_reply)
    │
    └─→ Worker 执行回复
            │
            ├─→ 调用 platform.replyToComment() 或 platform.replyToDirectMessage()
            │
            ├─→ 返回执行结果 (成功/失败 + 详情)
            │
            └─→ Master 更新回复状态 (成功/失败)
```

### 实现快速指南

#### 1. 在 PlatformBase 中声明回复方法

大多数平台共同的回复逻辑已在 PlatformBase 中，但平台特定的实现需要在你的平台类中重写：

```javascript
class MyPlatform extends PlatformBase {
  /**
   * 平台特定的回复实现
   * PlatformBase 会委托给这些方法
   */
  async _replyToCommentImpl(options) {
    // 你的平台特定的回复逻辑
  }

  async _replyToDirectMessageImpl(options) {
    // 你的平台特定的直消息回复逻辑
  }
}
```

#### 2. 处理不同的回复类型

```javascript
async replyToComment({ accountId, commentId, targetId, content, replyType = 'reply' }) {
  // replyType 可能的值:
  // - 'reply': 普通回复
  // - 'mention': @某人的回复
  // - 'quote': 引用回复

  if (replyType === 'mention') {
    // 处理 @mention 格式
  } else if (replyType === 'quote') {
    // 处理引用回复
  }
  // ...
}
```

#### 3. 错误处理和重试

```javascript
async replyToComment(options) {
  const maxRetries = 3;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // 执行回复
      return await this._executeReply(options);
    } catch (error) {
      lastError = error;
      this.logger.warn(`Reply attempt ${i + 1} failed: ${error.message}`);

      if (i < maxRetries - 1) {
        // 指数退避重试
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      }
    }
  }

  throw lastError;
}
```

#### 4. 幂等性保证

```javascript
async replyToComment({ accountId, commentId, targetId, content, replyId }) {
  // 使用 replyId 检查是否已经回复过
  const existingReply = await this.checkReplyExists(replyId);
  if (existingReply) {
    this.logger.info(`Reply ${replyId} already exists, skipping`);
    return { success: true, replyId, duplicate: true };
  }

  // 执行回复...
}
```

### 与 ReplyExecutor 的集成

Master 的 ReplyExecutor 会按以下方式调用你的平台方法：

```javascript
// packages/master/src/handlers/reply-executor.js
const result = await platform.replyToComment({
  accountId: reply.account_id,
  commentId: reply.comment_id,
  targetId: reply.target_id,
  content: reply.content,
  replyType: reply.reply_type,
  replyId: reply.id  // 用于幂等性检查
});

// 或者
const result = await platform.replyToDirectMessage({
  accountId: reply.account_id,
  messageId: reply.message_id,
  senderId: reply.sender_id,
  content: reply.content,
  replyId: reply.id
});
```

### 数据库信息

回复数据存储在 Master 的 `replies` 表中：

```sql
-- 回复表结构 (packages/master/src/database/migrations/015_add_replies_table.sql)
CREATE TABLE replies (
  id                TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL,          -- 回复者账户ID
  comment_id        TEXT,                   -- 评论ID (如果是回复评论)
  target_id         TEXT,                   -- 目标帖子/视频ID
  message_id        TEXT,                   -- 私信ID (如果是回复私信)
  sender_id         TEXT,                   -- 发送者ID (针对私信回复)
  content           TEXT NOT NULL,          -- 回复内容
  reply_type        TEXT DEFAULT 'reply',   -- reply|mention|quote
  platform          TEXT NOT NULL,          -- 平台名称
  status            TEXT DEFAULT 'pending', -- pending|success|failed
  created_at        INTEGER NOT NULL,       -- 创建时间戳
  executed_at       INTEGER,                -- 执行时间戳
  error_message     TEXT,                   -- 错误信息
  reply_id          TEXT,                   -- 平台返回的回复ID (用于幂等性)
  is_new            INTEGER DEFAULT 1       -- 是否为新数据 (用于增量检测)
);
```

### 测试回复功能

```bash
# 1. 启动 Master
npm run start:master

# 2. 启动 Worker
npm run start:worker

# 3. 创建测试回复 (在 Master 数据库中)
sqlite3 packages/master/data/master.db << EOF
INSERT INTO replies (id, account_id, comment_id, target_id, content, reply_type, platform, status, created_at)
VALUES ('reply-001', 'account-1', 'comment-123', 'post-456', '测试回复', 'reply', 'douyin', 'pending', $(date +%s));
EOF

# 4. 手动触发回复执行器 (在 Master 端)
# 或通过 Admin Web UI 创建回复任务

# 5. 查看回复执行结果
sqlite3 packages/master/data/master.db "SELECT id, status, error_message FROM replies WHERE id='reply-001';"
```

---

## 完整代码示例

### 最小化实现

如果你只想快速实现一个基本的平台，这个最小化模板足够了：

```javascript
// packages/worker/src/platforms/myplatform/platform.js
const PlatformBase = require('../base/platform-base');

class MyPlatform extends PlatformBase {
  constructor(config, workerBridge, browserManager) {
    super(config, workerBridge, browserManager);
  }

  async initialize(account) {
    // 初始化逻辑
  }

  async startLogin({ accountId, sessionId, proxy }) {
    // 登录逻辑
    // 必须调用: await this.sendLoginStatus(sessionId, 'success', {...})
  }

  async crawlComments(account) {
    // 爬取评论逻辑
    return [];
  }

  async crawlDirectMessages(account) {
    // 爬取私信逻辑
    return [];
  }

  async cleanup(accountId) {
    // 清理资源
  }
}

module.exports = MyPlatform;
```

---

## 测试和验证

### 1. 验证平台被正确加载

```bash
# 启动 Worker
WORKER_ID=worker-test PORT=4000 npm start

# 查看日志，应该看到:
# [info] Platform loaded: xiaohongshu
```

### 2. 测试登录流程

```bash
# 使用 curl 或 PostMan 模拟 Master 的登录请求

curl -X POST http://localhost:4000/login \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "test-123",
    "session_id": "session-456",
    "platform": "xiaohongshu",
    "proxy": null
  }'
```

### 3. 测试爬虫功能

```javascript
// packages/worker/test-platform.js
const PlatformManager = require('./src/platform-manager');
const BrowserManagerV2 = require('./src/browser/browser-manager-v2');

(async () => {
  const browserManager = new BrowserManagerV2('./data/browser');
  const platformManager = new PlatformManager(browserManager);

  await platformManager.loadPlatforms();

  const platform = platformManager.getPlatform('xiaohongshu');
  if (!platform) {
    console.error('Platform not found!');
    return;
  }

  console.log('✅ Platform loaded successfully');
  console.log('✅ Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(platform)));
})();
```

---

## 常见问题

### Q1: 如何处理平台的反爬虫检测？

**A**: 使用以下策略：
- 使用浏览器指纹隔离 (每账户独立)
- 随机延迟 (15-30 秒)
- 使用代理
- 模拟真实用户行为

### Q2: 如何处理登录失败？

**A**: 实现重试机制：
```javascript
const RetryManager = require('@hiscrm-im/shared/utils/retry-manager');

await RetryManager.retry(
  () => this.handleQRCodeLogin(page, accountId, sessionId),
  { maxRetries: 3, delay: 2000, backoff: 2 }
);
```

### Q3: 如何在平台间共享代码？

**A**: 创建共享工具类：
```
packages/worker/src/platforms/base/
├── platform-base.js          # 所有平台继承
├── worker-bridge.js          # 通信工具
├── account-context-manager.js # 账户管理
└── extractors/               # 提取器工具
    ├── comment-extractor.js
    └── message-extractor.js
```

### Q4: 如何调试选择器问题？

**A**: 使用调试模式：
```bash
# 无头模式关闭
HEADLESS=false npm start

# 查看截图
ls -la data/browser/worker-test/screenshots/
```

### Q5: 如何支持多种登录方式？

**A**: 在 `startLogin` 中检测并处理：
```javascript
async startLogin({ accountId, sessionId, proxy }) {
  const loginMethod = await this.detectLoginMethod(page);

  switch (loginMethod.type) {
    case 'qrcode':
      return await this.handleQRCodeLogin(page, ...);
    case 'phone':
      return await this.handlePhoneLogin(page, ...);
    case 'password':
      return await this.handlePasswordLogin(page, ...);
    default:
      throw new Error(`Unknown login method: ${loginMethod.type}`);
  }
}
```

---

## 性能优化建议

### 1. 缓存页面结构

```javascript
class PlatformCache {
  constructor() {
    this.selectors = {};
    this.structures = {};
  }

  async cachePageStructure(page, platform) {
    const structure = await page.evaluate(() => {
      return {
        hasComments: !!document.querySelector('[class*="comment"]'),
        hasMessages: !!document.querySelector('[class*="message"]'),
        loadTime: performance.now()
      };
    });
    this.structures[platform] = structure;
  }
}
```

### 2. 实现增量爬取

```javascript
async crawlComments(account, context) {
  // 获取上次爬取的时间戳
  const lastCrawl = account.last_crawl_time;

  // 只爬取新数据
  const comments = await this.getNewComments(context, lastCrawl);

  // 更新时间戳
  await updateAccountLastCrawl(account.id);

  return comments;
}
```

### 3. 连接池管理

```javascript
class ConnectionPool {
  constructor(maxConnections = 5) {
    this.maxConnections = maxConnections;
    this.activeConnections = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.activeConnections < this.maxConnections) {
      this.activeConnections++;
      return;
    }

    // 等待可用连接
    await new Promise(resolve => this.queue.push(resolve));
  }

  release() {
    this.activeConnections--;
    const resolve = this.queue.shift();
    if (resolve) resolve();
  }
}
```

---

## 检查清单

在发布新平台前，确保完成以下检查：

**步骤 1-2（必须）**:
- [ ] 创建 `config.json` 文件，包含所有必要的 URLs 和选择器
- [ ] 创建 `platform.js` 继承 `PlatformBase`（爬虫逻辑直接写在这里）

**核心方法实现（必须）**:
- [ ] 实现 `initialize(account)` 方法
- [ ] 实现 `startLogin({accountId, sessionId, proxy})` 方法，支持二维码登录
- [ ] 实现 `crawlComments(account)` 方法，返回评论数组
- [ ] 实现 `crawlDirectMessages(account)` 方法，返回私信数组
- [ ] 实现 `cleanup(accountId)` 方法

**辅助方法实现（推荐）**:
- [ ] 实现 `detectLoginMethod(page)` 方法，检测登录方式
- [ ] 实现 `handleQRCodeLogin(page, ...)` 方法，处理二维码登录
- [ ] 实现 `extractComments()` 或 `extractDirectMessages()` 辅助方法
- [ ] 实现 `extractUserInfo(page)` 方法，登录后提取用户信息

**回复功能实现（可选，支持自动回复）**:
- [ ] 实现 `replyToComment({accountId, commentId, targetId, content, replyType})` 方法
- [ ] 实现 `replyToDirectMessage({accountId, messageId, senderId, content})` 方法
- [ ] 实现 `canReply(accountId, type)` 方法，检查是否支持回复
- [ ] 处理不同的回复类型 (reply|mention|quote)
- [ ] 实现错误处理和重试机制
- [ ] 实现幂等性保证（避免重复回复）

**质量保证（必须）**:
- [ ] 添加完整的错误处理和重试机制
- [ ] 添加详细的日志记录（使用 `this.logger`）
- [ ] 添加选择器的容错处理（使用可选链 `?.`）
- [ ] 测试所有主要功能（登录、爬评论、爬私信）
- [ ] 验证 PlatformManager 能正确加载平台（检查日志输出）
- [ ] 测试在 Master 分配任务时能正确执行监控任务
- [ ] 测试代理配置（如果需要）
- [ ] 测试多账户同时运行（资源隔离）

---

## 下一步

1. **测试你的平台**
   - 启动 Worker 验证平台加载
   - 测试登录流程
   - 测试数据爬取

2. **性能优化**
   - 优化选择器
   - 实现缓存机制
   - 调整超时时间

3. **生产部署**
   - 配置代理
   - 配置监控告警
   - 准备故障恢复方案

---

**文档版本**: 1.0.0
**最后更新**: 2025-10-18
**维护者**: 开发团队
