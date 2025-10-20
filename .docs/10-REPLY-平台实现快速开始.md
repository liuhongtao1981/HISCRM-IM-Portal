# 回复功能 - 平台实现快速开始

## 🎯 目标

为抖音、小红书等平台实现回复功能（评论回复 + 私信回复）。

---

## 📋 快速检查清单

实现一个平台需要完成以下步骤：

- [ ] **步骤 1**: 在平台 `platform.js` 中实现 `replyToComment()` 方法
- [ ] **步骤 2**: 在平台 `platform.js` 中实现 `replyToDirectMessage()` 方法
- [ ] **步骤 3**: 本地测试回复流程
- [ ] **步骤 4**: 处理错误场景
- [ ] **步骤 5**: 优化性能和反爬虫对策

---

## 🚀 实现步骤

### 步骤 1: 理解回复方法的输入输出

#### 输入参数
```javascript
// accountId: string - 账户 ID
// options: {
//   target_id: string,        // 被回复的消息 ID (评论 ID 或私信 ID)
//   reply_content: string,    // 要发送的回复内容
//   context: {                // 平台特定的上下文
//     video_id?: string,      // 视频 ID (抖音)
//     user_id?: string,       // 用户 ID
//     platform_target_id?: string,  // 平台特定的目标 ID
//   },
//   browserManager: BrowserManager  // 浏览器管理器（用于获取浏览器上下文）
// }
```

#### 返回值
```javascript
// 返回: {
//   platform_reply_id?: string,  // 平台返回的回复 ID
//   data?: {                     // 其他平台特定的数据
//     reply_created_at?: number,
//     reply_author_id?: string,
//     // ... 其他字段
//   }
// }
```

---

### 步骤 2: 实现基本框架

#### 模板代码 (复制到你的 platform.js)
```javascript
/**
 * 回复评论
 */
async replyToComment(accountId, options) {
  const { target_id, reply_content, context, browserManager } = options;
  const logger = this.logger || console;

  try {
    logger.info(`[${this.config.platform}] Replying to comment: ${target_id}`);

    // 1. 获取或创建浏览器上下文
    const context = await this.getOrCreateAccountContext(accountId);
    const page = await context.newPage();

    try {
      // 2. 加载指纹配置（防反爬虫）
      await this.setupFingerprint(page, accountId);

      // 3. 导航到相应页面
      await this.navigateToCommentPage(page, target_id, context);

      // 4. 定位并打开回复框
      await this.openReplyBox(page, target_id);

      // 5. 输入回复内容
      await this.enterReplyContent(page, reply_content);

      // 6. 提交回复
      const platformReplyId = await this.submitReply(page, accountId);

      // 7. 关闭页面
      await page.close();

      return {
        platform_reply_id: platformReplyId,
        data: {
          reply_created_at: Date.now(),
          reply_author_id: accountId,
        },
      };
    } catch (error) {
      await page.close();
      throw error;
    }
  } catch (error) {
    logger.error(`[${this.config.platform}] Failed to reply to comment:`, error);
    throw error;
  }
}

/**
 * 回复私信
 */
async replyToDirectMessage(accountId, options) {
  const { target_id, reply_content, context, browserManager } = options;
  const logger = this.logger || console;

  try {
    logger.info(`[${this.config.platform}] Replying to direct message: ${target_id}`);

    // 类似的流程，针对私信

    // ... 实现代码 ...

    return {
      platform_reply_id: /* platform_message_id */,
      data: {
        message_sent_at: Date.now(),
        reply_author_id: accountId,
      },
    };
  } catch (error) {
    logger.error(`[${this.config.platform}] Failed to reply to direct message:`, error);
    throw error;
  }
}
```

---

### 步骤 3: 实现平台特定的细节方法

#### 抖音示例
```javascript
// 1. 导航到评论所在的视频页面
async navigateToCommentPage(page, targetId, context) {
  // 从 context 获取视频 ID
  const videoId = context.video_id;

  // 拼接抖音视频 URL
  const videoUrl = `https://www.douyin.com/video/${videoId}`;

  // 导航到页面
  await page.goto(videoUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // 等待评论区加载
  await page.waitForSelector('.comment-item', { timeout: 10000 });
}

// 2. 定位并打开回复框
async openReplyBox(page, targetCommentId) {
  // 找到要回复的评论元素
  const commentElement = await page.$(`[data-comment-id="${targetCommentId}"]`);

  if (!commentElement) {
    throw new Error(`Comment not found: ${targetCommentId}`);
  }

  // 鼠标悬停显示操作按钮
  await commentElement.hover();

  // 点击"回复"按钮
  const replyButton = await commentElement.$('.reply-btn');
  await replyButton.click();

  // 等待回复框出现
  await page.waitForSelector('.reply-input-box', { timeout: 5000 });
}

// 3. 输入回复内容
async enterReplyContent(page, replyContent) {
  // 获取回复框输入元素
  const replyInput = await page.$('.reply-input-box textarea');

  if (!replyInput) {
    throw new Error('Reply input not found');
  }

  // 清空原有内容
  await replyInput.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');

  // 输入回复内容（模拟人类输入）
  await page.type('.reply-input-box textarea', replyContent, {
    delay: 50, // 每字符延迟 50ms
  });
}

// 4. 提交回复
async submitReply(page, accountId) {
  // 拦截 API 请求获取回复 ID
  let replyId = null;

  page.on('response', (response) => {
    if (response.url().includes('/api/comment/reply')) {
      response.json().then((data) => {
        if (data.data?.reply_id) {
          replyId = data.data.reply_id;
        }
      });
    }
  });

  // 点击提交按钮
  const submitButton = await page.$('.reply-submit-btn');
  await submitButton.click();

  // 等待回复提交完成
  await page.waitForTimeout(3000);

  if (!replyId) {
    throw new Error('Failed to get reply ID from API');
  }

  return replyId;
}

// 5. 加载指纹配置
async setupFingerprint(page, accountId) {
  const fingerprint = this.browserManager.getOrCreateFingerprintConfig(accountId);

  // 注入指纹脚本
  await page.evaluateOnNewDocument((fp) => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // ... 注入更多反爬虫对策 ...
  }, fingerprint);
}
```

---

## ⚠️ 常见问题和解决方案

### 问题 1: 评论框定位困难
**原因**: DOM 结构可能变化
**解决**:
```javascript
// 方案 A: 使用多个选择器尝试
const selectors = [
  '.reply-btn',
  '[data-action="reply"]',
  'button[aria-label*="Reply"]',
];

for (const selector of selectors) {
  const element = await page.$(selector);
  if (element) {
    await element.click();
    break;
  }
}

// 方案 B: 使用 XPath
const button = await page.$('xpath=//button[contains(text(), "Reply")]');
await button.click();
```

### 问题 2: 回复内容包含 @ 或 表情符号
**解决**:
```javascript
// 分段发送，处理特殊字符
async enterReplyContent(page, replyContent) {
  const textarea = await page.$('textarea');

  // 逐字符发送，处理特殊字符
  for (const char of replyContent) {
    if (char === '@') {
      // 触发 @ 提及弹窗
      await page.keyboard.type(char);
      await page.waitForTimeout(500);
      // ... 处理提及逻辑
    } else {
      await page.keyboard.type(char, { delay: 50 });
    }
  }
}
```

### 问题 3: 反爬虫检测（提交失败）
**解决**:
```javascript
// 添加随机延迟
await page.waitForTimeout(Math.random() * 2000 + 1000);

// 模拟真实操作
await page.mouse.move(100, 100);
await page.mouse.move(200, 200);

// 使用 Cookie 和 Session 维持状态
const cookies = await page.context().cookies();
// ... 保存并重用 cookies
```

### 问题 4: 登录过期
**捕获并处理**:
```javascript
async replyToComment(accountId, options) {
  try {
    // ... 回复逻辑 ...
  } catch (error) {
    // 检查是否是登录过期错误
    if (error.message.includes('login') || error.message.includes('auth')) {
      throw new Error('LOGIN_EXPIRED: ' + error.message);
    }
    throw error;
  }
}
```

---

## 🧪 本地测试

### 测试脚本模板
```javascript
// test-reply-douyin.js
const path = require('path');
const { initDatabase } = require('./database/init');
const AccountsDAO = require('./database/accounts-dao');
const DouyinPlatform = require('./platforms/douyin/platform');
const { getBrowserManager } = require('./config/browser-config');

async function testReply() {
  try {
    // 1. 初始化
    const db = initDatabase();
    const accountsDAO = new AccountsDAO(db);
    const browserManager = getBrowserManager('test-worker', {
      headless: false, // 显示浏览器
    });

    // 2. 获取测试账户
    const account = accountsDAO.findAll({ platform: 'douyin' })[0];
    if (!account) {
      console.error('No Douyin account found');
      return;
    }

    // 3. 初始化平台
    const platform = new DouyinPlatform({}, null, browserManager);
    await platform.initialize(account);

    // 4. 测试回复
    const result = await platform.replyToComment(account.id, {
      target_id: 'test-comment-id',
      reply_content: '这是一条测试回复',
      context: { video_id: 'test-video-id' },
      browserManager,
    });

    console.log('✅ Reply successful:', result);
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testReply();
```

### 运行测试
```bash
cd packages/worker
node test-reply-douyin.js
```

---

## 📊 实现进度追踪

创建一个进度表来追踪各平台的实现：

| 平台 | 评论回复 | 私信回复 | 测试 | 完成度 |
|------|--------|--------|------|--------|
| 抖音 | ⏳ | ⏳ | ⏳ | 0% |
| 小红书 | ⏳ | ⏳ | ⏳ | 0% |

---

## 📚 参考资源

### 抖音平台
- [抖音 DOM 结构分析](#) (待补充)
- [抖音 API 端点](#) (待补充)
- [反爬虫对策](#) (待补充)

### 小红书平台
- [小红书 DOM 结构分析](#) (待补充)
- [小红书 API 端点](#) (待补充)
- [反爬虫对策](#) (待补充)

### 通用资源
- [Playwright 文档](https://playwright.dev)
- [PlatformBase 接口](./worker-通用平台脚本系统设计方案.md)
- [完整设计文档](./08-REPLY-回复功能设计文档.md)

---

## 💡 最佳实践

1. **使用 DEBUG 模式开发**
   ```bash
   HEADLESS=false npm run dev:worker
   ```

2. **保存截图便于调试**
   ```javascript
   await page.screenshot({ path: `debug-${Date.now()}.png` });
   ```

3. **添加详细日志**
   ```javascript
   logger.debug(`Step: Opened reply box for comment ${targetId}`);
   ```

4. **错误恢复**
   - 总是关闭页面（使用 try/finally）
   - 记录失败原因用于调试
   - 返回有意义的错误码

5. **性能优化**
   - 设置合理的超时时间
   - 避免不必要的等待
   - 并发处理多个请求时要控制并发数

---

**准备好开始实现了吗？** 🚀

选择一个平台，按照上述步骤实现，然后测试！
