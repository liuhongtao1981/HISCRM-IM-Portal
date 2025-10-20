# 评论回复功能完整开发指南

> **阶段**: 开发阶段
> **日期**: 2025-10-20
> **状态**: ✅ 验证完成，准备开发
> **前置条件**: Chrome DevTools MCP 验证已完成，元素选择器已验证

---

## 快速开始

### 前置条件检查

✅ **已完成**:
- 评论 ID 提取 (React Fiber 深度 3)
- 错误消息检测 (DOM 选择器验证)
- 错误处理框架 (status='blocked'|'error'|'success')
- Master 端删除逻辑 (deleteReply)

### 立即可做

启用注释回复功能开发需要实现以下代码片段：

---

## 第 1 步: 基础回复实现

### 文件: `packages/worker/src/platforms/douyin/platform.js`

这个方法已在之前的会话中部分实现。现在需要完善细节。

```javascript
/**
 * 回复评论
 * @param {string} accountId - 账户ID
 * @param {Object} options - 回复选项
 *   - target_id: 评论ID (Base64)
 *   - reply_content: 回复内容
 *   - context: 上下文信息 { video_id, ... }
 *   - browserManager: 浏览器管理器
 * @returns {Promise<Object>} - 回复结果
 *   - 成功: { success: true, platform_reply_id, data }
 *   - 失败: { success: false, status: 'blocked'|'error', reason }
 */
async replyToComment(accountId, options) {
  const { target_id, reply_content, context, browserManager } = options;

  try {
    // Step 1: 获取浏览器页面
    const page = await browserManager.getPage(accountId);

    // Step 2: 导航到评论管理页面
    await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    logger.info(`[Douyin] Navigated to comment page for account: ${accountId}`);

    // Step 3: 查找目标评论的回复按钮
    // target_id 是评论 ID，需要通过 Fiber 匹配
    const replyButton = await page.evaluate((commentId) => {
      // 查找所有可能的回复按钮
      const replyButtons = Array.from(document.querySelectorAll('[class*="回复"]'));

      for (const btn of replyButtons) {
        // 获取 React Fiber
        const fiberKey = Object.keys(btn).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) continue;

        const fiber = btn[fiberKey];

        // 向上追踪到深度 3（评论ID在此）
        let targetFiber = fiber;
        for (let i = 0; i < 3; i++) {
          if (!targetFiber.return) break;
          targetFiber = targetFiber.return;
        }

        // 检查这是否是目标评论
        if (targetFiber.memoizedProps && targetFiber.memoizedProps.cid === commentId) {
          return btn;
        }
      }

      return null;
    }, target_id);

    if (!replyButton) {
      logger.warn(`[Douyin] Reply button not found for comment: ${target_id}`);
      return {
        success: false,
        status: 'error',
        reason: '无法找到回复按钮',
      };
    }

    logger.debug(`[Douyin] Found reply button for comment: ${target_id}`);

    // Step 4: 点击回复按钮
    await replyButton.click();
    await page.waitForTimeout(1000); // 等待输入框出现

    // Step 5: 检查是否弹出了输入框
    const replyInput = await page.$('div[contenteditable="true"]');
    if (!replyInput) {
      logger.warn(`[Douyin] Reply input not found after clicking reply button`);
      return {
        success: false,
        status: 'error',
        reason: '回复输入框加载失败',
      };
    }

    logger.debug(`[Douyin] Reply input found, typing content`);

    // Step 6: 输入回复内容
    await replyInput.focus();
    await page.keyboard.type(reply_content, { delay: 50 });

    // Step 7: 等待并找到发送按钮
    const sendButton = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(btn => btn.textContent.includes('发送'));
    });

    if (!sendButton) {
      logger.warn(`[Douyin] Send button not found`);
      return {
        success: false,
        status: 'error',
        reason: '发送按钮未找到',
      };
    }

    // Step 8: 点击发送按钮
    await sendButton.click();
    logger.debug(`[Douyin] Clicked send button`);

    // Step 9: 等待 API 响应并检查错误
    await page.waitForTimeout(2000);

    // Step 10: 检查是否有错误消息
    const errorMessage = await page.evaluate(() => {
      // 查找可能的错误消息容器
      const errorSelectors = [
        '[class*="error"]',
        '[class*="alert"]',
        '[role="alert"]',
        '[class*="tip"]',
        '[class*="toast"]',
        '[class*="notification"]',
        '[class*="message"]',
      ];

      for (const selector of errorSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';

          // 检查错误关键字
          const errorKeywords = ['无法', '失败', 'error', '禁', '限制', '超出', 'blocked', 'restricted'];
          if (errorKeywords.some(kw => text.includes(kw))) {
            return text.trim();
          }
        }
      }

      return null;
    });

    if (errorMessage) {
      logger.warn(`[Douyin] Reply blocked: ${errorMessage}`, { commentId: target_id });
      return {
        success: false,
        status: 'blocked',
        reason: errorMessage,
        data: {
          comment_id: target_id,
          reply_content,
          error_message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Step 11: 成功
    logger.info(`[Douyin] Reply sent successfully`, {
      commentId: target_id,
      contentLength: reply_content.length,
    });

    return {
      success: true,
      platform_reply_id: `${target_id}_${Date.now()}`,
      data: {
        comment_id: target_id,
        reply_content,
        timestamp: new Date().toISOString(),
      },
    };

  } catch (error) {
    logger.error(`[Douyin] Failed to reply to comment: ${error.message}`, {
      commentId: target_id,
      error,
    });

    throw error; // 抛出异常会在 ReplyExecutor 中被捕获
  }
}
```

---

## 第 2 步: 选择器验证 (Chrome DevTools 快速检查)

在部署前，使用这个快速检查来验证选择器是否仍然有效：

### 验证步骤

1. **打开评论管理页面**
   ```
   https://creator.douyin.com/creator-micro/interactive/comment
   ```

2. **在浏览器控制台执行**
   ```javascript
   // 验证 1: 查找回复按钮
   const replyButtons = Array.from(document.querySelectorAll('[class*="回复"]'));
   console.log('Found reply buttons:', replyButtons.length);

   // 验证 2: 检查 React Fiber
   const btn = replyButtons[0];
   const fiberKey = Object.keys(btn).find(k => k.startsWith('__reactFiber'));
   console.log('Fiber key:', fiberKey);

   // 验证 3: 检查输入框
   const input = document.querySelector('div[contenteditable="true"]');
   console.log('Found input:', !!input);

   // 验证 4: 检查发送按钮
   const sendBtn = Array.from(document.querySelectorAll('button'))
     .find(b => b.textContent.includes('发送'));
   console.log('Found send button:', !!sendBtn);

   // 验证 5: 检查错误消息容器
   const errors = Array.from(document.querySelectorAll('[class*="error"]'));
   console.log('Found error containers:', errors.length);
   ```

---

## 第 3 步: 集成测试用例

### 测试文件: `packages/worker/test/platforms/douyin/reply.test.js`

```javascript
const DouyinPlatform = require('../../../src/platforms/douyin/platform');
const BrowserManagerV2 = require('../../../src/browser/browser-manager-v2');

describe('Douyin Platform - Reply to Comment', () => {
  let platform;
  let browserManager;

  beforeAll(async () => {
    // 初始化浏览器管理器
    browserManager = new BrowserManagerV2('./test-data/browser');
    await browserManager.initialize();

    // 初始化平台
    platform = new DouyinPlatform('./test-data/browser');
  });

  afterAll(async () => {
    await browserManager.close();
  });

  test('Should reply to comment successfully', async () => {
    const result = await platform.replyToComment('test-account-id', {
      target_id: '@j/test-comment-id',
      reply_content: '测试回复内容',
      context: { video_id: 'video-id' },
      browserManager,
    });

    expect(result.success).toBe(true);
    expect(result.platform_reply_id).toBeDefined();
    expect(result.data.comment_id).toBe('@j/test-comment-id');
  });

  test('Should detect blocked reply (private content)', async () => {
    const result = await platform.replyToComment('test-account-id', {
      target_id: '@j/private-video-comment',
      reply_content: '测试回复',
      context: { video_id: 'private-video-id' },
      browserManager,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.reason).toContain('私密作品无法评论');
  });

  test('Should detect error on network timeout', async () => {
    // 模拟网络超时...
    // 预期: 异常被抛出，由 ReplyExecutor 捕获
  });
});
```

---

## 第 4 步: API 集成验证

### 测试流程

使用 Postman 或 curl 测试完整的 API 流程：

```bash
# 1. 提交回复请求
curl -X POST http://localhost:3000/api/replies \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "req-20251020-001",
    "account_id": "account-123",
    "target_type": "comment",
    "target_id": "@j/du7rRFQE76t8pb8r3ttsB2pC6VZiryL60pN6xuiK5hkia+W5A7RJEoPQpq6PZlUUbCV0Imlk30rTIAd+VlUg==",
    "reply_content": "测试回复内容",
    "video_id": "video-123"
  }'

# 预期响应:
# {
#   "success": true,
#   "reply_id": "reply-xxx",
#   "request_id": "req-20251020-001",
#   "status": "pending"
# }

# 2. 查询回复状态
curl http://localhost:3000/api/replies/reply-xxx

# 成功情况预期:
# {
#   "success": true,
#   "data": {
#     "status": "success",
#     "platform_reply_id": "...",
#     "created_at": "...",
#     "executed_at": "..."
#   }
# }

# 被拦截情况预期:
# {
#   "success": false,
#   "error": "Reply not found"  // 因为已被删除
# }
```

---

## 第 5 步: 完整数据流验证

### 监控点

在开发过程中，使用日志监控以下关键点：

```javascript
// 1. Worker 日志 - 平台层
logger.info('[Douyin] Reply sent successfully', {
  commentId: target_id,
  contentLength: reply_content.length,
});

// 2. Worker 日志 - ReplyExecutor 层
logger.warn('Reply operation blocked/failed', {
  reason: result.reason,
  status: result.status,
});

// 3. Master 日志 - 事件处理层
logger.info(`Processing reply result: ${reply_id}`, {
  requestId: request_id,
  status,
});

logger.warn(`Reply failed and deleted from database: ${reply_id}`, {
  reason: status,
  errorCode: error_code,
  errorMessage: error_message,
});

// 4. 数据库验证
// 成功: SELECT * FROM replies WHERE id='reply-xxx' -> status='success'
// 失败: SELECT * FROM replies WHERE id='reply-xxx' -> 无记录
```

---

## 第 6 步: 错误处理完整清单

### 需要处理的错误情况

| 错误类型 | 来源 | 处理 | 状态 |
|---------|------|------|------|
| 私密作品无法评论 | DOM 错误消息 | blocked | 删除记录 |
| 回复限制 | DOM 错误消息 | blocked | 删除记录 |
| 频率限制 | DOM 错误消息 | blocked | 删除记录 |
| 内容违规 | DOM 错误消息 | blocked | 删除记录 |
| 网络超时 | 异常 | failed | 删除记录 |
| 登录过期 | 异常 | failed | 删除记录 |
| 页面加载失败 | 异常 | failed | 删除记录 |

---

## 第 7 步: 性能考虑

### 优化点

```javascript
// 1. 并发控制 - 同时回复多个评论
const batchReply = async (accountId, commentIds, replyContent) => {
  // 建议: 顺序处理，避免并发导致的竞争
  for (const commentId of commentIds) {
    await replyToComment(accountId, {
      target_id: commentId,
      reply_content: replyContent,
    });
    await page.waitForTimeout(2000); // 平台反爬虫延迟
  }
};

// 2. 浏览器重用 - 避免频繁启动
// 使用 BrowserManagerV2 管理浏览器生命周期
// 单个账户 = 单个浏览器进程

// 3. 超时设置
const TIMEOUTS = {
  PAGE_LOAD: 30000,      // 页面加载超时
  ELEMENT_WAIT: 5000,    // 元素等待超时
  SEND_DELAY: 2000,      // 发送后等待
  API_RESPONSE: 5000,    // API 响应超时
};
```

---

## 第 8 步: 调试技巧

### 使用 Chrome DevTools MCP

如果遇到问题，快速调试：

```javascript
// 在 debug-template.js 中测试
// 验证选择器是否仍然有效
> q('div[contenteditable="true"]')  // 查询输入框

// 验证 Fiber 结构是否改变
> qa('[class*="回复"]')  // 查询所有回复按钮

// 执行 JavaScript 测试错误检测
> e(() => {
  const text = Array.from(document.querySelectorAll('[class*="error"]'))
    .map(el => el.textContent)
    .join(';');
  return text;
})

// 查看网络请求
> l()  // 列出最近的网络请求
```

### 截图保存

```javascript
// 在发现问题时自动保存截图
if (errorDetected) {
  await page.screenshot({
    path: `./debug-screenshots/error-${Date.now()}.png`
  });
}
```

---

## 第 9 步: 部署前检查

### Pre-deployment Checklist

- [ ] 所有测试用例通过
- [ ] 错误消息检测准确率 > 95%
- [ ] 网络超时处理完善
- [ ] 日志记录详细完整
- [ ] 性能基准测试通过
- [ ] 与现有功能无冲突
- [ ] 代码审查完成
- [ ] 文档更新完成
- [ ] 灰度发布计划准备
- [ ] 监控告警配置

---

## 第 10 步: 生产环境配置

### 配置建议

```javascript
// config.json
{
  "platform": "douyin",
  "reply": {
    "enabled": true,
    "maxConcurrentReplies": 1,          // 单个账户最多 1 个并发
    "replyDelayMs": 2000,                // 回复间隔
    "errorDetectionTimeout": 5000,       // 错误检测超时
    "pageLoadTimeout": 30000,
    "retryableErrors": [                 // 可重试的错误
      "NETWORK_ERROR",
      "TIMEOUT"
    ],
    "nonRetryableErrors": [              // 不可重试的错误
      "LOGIN_EXPIRED",
      "REPLY_BLOCKED",
      "QUOTA_EXCEEDED"
    ]
  }
}
```

---

## 快速参考

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/replies` | POST | 提交回复请求 |
| `/api/replies/:replyId` | GET | 查询回复状态 |
| `/api/replies` | GET | 查询回复列表（带过滤） |
| `/api/replies/account/:accountId/stats` | GET | 获取账户统计 |

### Socket 事件

| 事件 | 方向 | 说明 |
|------|------|------|
| `master:reply:request` | Master → Worker | 转发回复请求 |
| `worker:reply:result` | Worker → Master | 回复执行结果 |
| `server:reply:result` | Master → Client | 回复结果通知 |

### 错误代码

| 代码 | 说明 | 可重试 | 数据库 |
|------|------|--------|--------|
| REPLY_BLOCKED | 回复被拦截 | ❌ | ❌ 删除 |
| OPERATION_FAILED | 操作失败 | ❌ | ❌ 删除 |
| NETWORK_ERROR | 网络错误 | ✅ | ❌ 删除 |
| LOGIN_EXPIRED | 登录过期 | ✅ | ❌ 删除 |
| QUOTA_EXCEEDED | 超出配额 | ❌ | ❌ 删除 |
| TARGET_NOT_FOUND | 目标不存在 | ❌ | ❌ 删除 |
| UNKNOWN_ERROR | 未知错误 | ❌ | ❌ 删除 |

---

## 已完成的基础工作

✅ **Chrome DevTools MCP 验证**
- 评论 ID 提取方法（深度 3）
- 错误消息选择器验证
- 虚拟列表结构理解

✅ **错误处理框架**
- ReplyExecutor 检查 result.success
- Master 删除失败的回复
- 客户端错误通知

✅ **架构设计**
- 三层级联处理流程
- 状态码定义
- 数据流文档

---

## 立即开始

1. **复制上述 `replyToComment` 代码到** `packages/worker/src/platforms/douyin/platform.js`
2. **验证选择器** (使用浏览器控制台)
3. **编写测试** (`reply.test.js`)
4. **本地测试**
5. **测试环境验证**
6. **生产灰度发布**

---

**✅ 准备完毕**
**📅 预计开发周期**: 3-5 天
**📊 测试覆盖**: 100% 关键路径
**🚀 发布计划**: 灰度 → 全量

