# Phase 9: 消息回复 ID 重构实现计划

**计划日期**: 2025-10-20
**预计工期**: 1-2 天
**优先级**: 🔴 必需

---

## 📋 概述

当前的消息回复系统使用 `platform_message_id` 作为主标识来定位要回复的消息。由于 Phase 8 引入了会话管理系统 (`conversations` 表和 `conversation_id`)，我们需要重构回复逻辑以使用 `conversation_id` 作为主标识，因为：

1. **稳定性**: `conversation_id` 基于 `account_id + platform_user_id`，更加稳定
2. **清晰度**: `conversation_id` 明确标识是哪个会话，而非单条消息
3. **正确性**: 消息回复应该回到对话，而不是回复单条消息
4. **完整性**: 支持 `message_id` 为可选项用于精确定位消息

---

## 🔄 当前状态分析

### 现有调用流程

```
Master (API request)
  → 创建 reply_request 对象
    { reply_id, request_id, platform, account_id, target_type, target_id, reply_content, context }
      ↓
Worker (ReplyExecutor)
  → 执行 executeReply(replyRequest)
      ↓
Platform (Douyin)
  → replyToDirectMessage(accountId, { target_id, reply_content, context, browserManager })
    - 使用 findMessageItemInVirtualList(page, target_id, searchCriteria)
    - target_id = platform_message_id
      ↓
结果 → 回复执行成功/失败
```

### 现有参数结构

```javascript
replyRequest = {
  reply_id: 'reply-123',
  request_id: 'req-456',
  platform: 'douyin',
  account_id: 'acc-789',
  target_type: 'direct_message',
  target_id: 'msg-123',  // ❌ 当前是 platform_message_id
  reply_content: '回复内容',
  context: {
    sender_id: 'user-001',
    sender_name: 'Alice',
    conversation_title: '...',
    message_time: '...'
  }
}
```

### 问题

1. **概念混淆**: `target_id` 同时用于消息和会话
2. **不稳定**: 消息 ID 可能变化
3. **不清晰**: 不知道要回复哪个会话
4. **不完整**: 缺少会话关系信息

---

## 💡 设计方案

### 新的参数结构

```javascript
replyRequest = {
  reply_id: 'reply-123',
  request_id: 'req-456',
  platform: 'douyin',
  account_id: 'acc-789',
  target_type: 'direct_message',

  // Phase 9 变更
  conversation_id: 'conv_acc-789_user-001',    // ✅ 新增：会话 ID (主标识)
  platform_message_id: 'msg-123',               // ✅ 可选：消息 ID (精确定位)
  // 向后兼容：也保留 target_id 用于兼容旧代码
  target_id: 'conv_acc-789_user-001',           // 改为 conversation_id

  reply_content: '回复内容',
  context: {
    sender_id: 'user-001',
    sender_name: 'Alice',
    platform_user_id: 'user-001',        // ✅ 新增
    conversation_title: '...',
    message_time: '...'
  }
}
```

### 新的调用流程

```
Master (API request)
  → 创建 reply_request 对象
    { reply_id, request_id, platform, account_id,
      conversation_id, platform_message_id, reply_content, context }
      ↓
Worker (ReplyExecutor)
  → 执行 executeReply(replyRequest)
      ↓
Platform (Douyin)
  → replyToDirectMessage(accountId, {
      conversation_id,              // ✅ 新增
      platform_message_id,          // ✅ 新增 (可选)
      reply_content,
      context,
      browserManager
    })
    - 首先导航到会话: findConversationByUser(page, context.platform_user_id)
    - 然后定位消息 (如果 platform_message_id 提供): findMessageInConversation(...)
    - 或直接回复到会话 (如果只有 conversation_id)
      ↓
结果 → 回复执行成功/失败
```

---

## 🛠️ 实现步骤

### Step 1: 更新 ReplyExecutor 中的参数处理 (reply-executor.js)

**文件**: `packages/worker/src/handlers/reply-executor.js`

```javascript
async executeReply(replyRequest) {
  const {
    reply_id,
    request_id,
    platform,
    account_id,
    target_type,
    target_id,           // 向后兼容
    conversation_id,     // 新增 (优先使用)
    platform_message_id, // 新增 (可选)
    reply_content,
    context
  } = replyRequest;

  // Phase 9: 使用 conversation_id 或 target_id (向后兼容)
  const finalConversationId = conversation_id || target_id;
  const finalPlatformMessageId = platform_message_id;

  // 调用平台实现
  const platformInstance = this.platformManager.getPlatform(platform);
  const result = await platformInstance.replyToDirectMessage(account_id, {
    conversation_id: finalConversationId,          // 新增
    platform_message_id: finalPlatformMessageId,   // 新增
    reply_content,
    context,
    browserManager: this.browserManager,
  });
}
```

### Step 2: 更新 Platform 基类 (platform-base.js)

**文件**: `packages/worker/src/platforms/base/platform-base.js`

```javascript
/**
 * 回复私信 (Phase 9 改进版)
 * @param {string} accountId - 账户 ID
 * @param {Object} options - 回复选项
 * @param {string} options.conversation_id - 会话 ID (必需) - Phase 9 新增
 * @param {string} options.platform_message_id - 平台消息 ID (可选) - Phase 9 新增
 * @param {string} options.reply_content - 回复内容
 * @param {Object} options.context - 上下文信息
 * @param {Object} options.browserManager - 浏览器管理器
 * @throws {Error} 如果回复失败
 * @returns {Promise<Object>} 回复结果 { success, message, reply_id }
 */
async replyToDirectMessage(accountId, options) {
  throw new Error('Method not implemented');
}
```

### Step 3: 更新 Douyin 平台实现 (platform.js)

**文件**: `packages/worker/src/platforms/douyin/platform.js`

关键改动：

```javascript
async replyToDirectMessage(accountId, options) {
  const {
    conversation_id,      // 新增
    platform_message_id,  // 新增 (可选)
    reply_content,
    context = {},
    browserManager
  } = options;

  try {
    logger.info(`[Douyin] Replying to conversation: ${conversation_id}`, {
      accountId,
      platformMessageId: platform_message_id,
      replyContent: reply_content.substring(0, 50),
    });

    // 提取 platform_user_id 从 conversation_id 或 context
    const platform_user_id = context.platform_user_id ||
                             this.extractUserIdFromConversationId(conversation_id);

    // 1. 获取浏览器上下文
    const browserContext = await this.ensureAccountContext(accountId);
    const page = await browserContext.newPage();
    page.setDefaultTimeout(30000);

    // 2. 导航到私信管理页面
    const dmUrl = 'https://creator.douyin.com/creator-micro/data/following/chat';
    await page.goto(dmUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 3. 定位会话 (新的首要步骤)
    logger.info(`Locating conversation with user: ${platform_user_id}`);
    const targetConversation = await this.findConversationByPlatformUser(
      page,
      platform_user_id,
      context.sender_name  // 可选：用户名帮助定位
    );

    if (!targetConversation) {
      throw new Error(`Failed to locate conversation with user ${platform_user_id}`);
    }

    logger.debug('Located target conversation');

    // 4. 点击会话打开对话
    logger.info('Clicking conversation to open chat');
    await targetConversation.click();
    await page.waitForTimeout(1500);

    // 5. 如果提供了 platform_message_id，则定位具体消息 (可选)
    if (platform_message_id) {
      logger.info(`Locating specific message: ${platform_message_id}`);
      const targetMessage = await this.findMessageInConversation(
        page,
        platform_message_id,
        context
      );

      if (!targetMessage) {
        logger.warn(`Message ${platform_message_id} not found, will reply to conversation`);
      }
    }

    // 6-10. 输入回复内容并发送 (与现有逻辑相同)
    // ... (复用现有代码)

    return { success: true, message: 'Reply sent successfully' };
  } catch (error) {
    logger.error('Failed to reply to direct message:', error);
    throw error;
  }
}

/**
 * 从 conversation_id 提取 platform_user_id
 * conversation_id 格式: conv_account-123_user-001
 */
extractUserIdFromConversationId(conversationId) {
  const match = conversationId.match(/^conv_[^_]+_(.+)$/);
  return match ? match[1] : null;
}

/**
 * 在虚拟列表中定位会话 (新增方法)
 */
async findConversationByPlatformUser(page, platformUserId, userName) {
  logger.debug(`Finding conversation for platform user: ${platformUserId}`);

  // 获取虚拟列表中的所有会话项
  const conversations = await page.evaluate(() => {
    const items = document.querySelectorAll('[role="grid"] [role="listitem"]');
    return Array.from(items).map((item, index) => ({
      index,
      text: item.textContent,
      element: item,  // 不能直接返回 DOM 元素
    }));
  });

  // 在返回的虚拟列表中查找匹配的会话
  for (const conv of conversations) {
    // 使用 userName 或其他标识匹配
    if (conv.text.includes(userName) || conv.text.includes(platformUserId)) {
      // 返回 element 的引用以供点击
      return await page.locator('[role="grid"] [role="listitem"]').nth(conv.index);
    }
  }

  return null;
}

/**
 * 在已打开的对话中定位具体消息 (新增方法)
 */
async findMessageInConversation(page, platformMessageId, context) {
  logger.debug(`Finding message in conversation: ${platformMessageId}`);

  // 从虚拟列表中提取消息
  const messages = await page.evaluate(() => {
    const items = document.querySelectorAll('[role="list"] [role="listitem"]');
    return Array.from(items).map((item, index) => ({
      index,
      content: item.textContent,
      id: item.getAttribute('data-message-id'),
    }));
  });

  // 查找匹配的消息
  for (const msg of messages) {
    if (msg.id === platformMessageId || msg.content.includes(context.message_content)) {
      return await page.locator('[role="list"] [role="listitem"]').nth(msg.index);
    }
  }

  return null;
}
```

### Step 4: 更新 Master 端的回复请求生成逻辑

**文件**: `packages/master/src/api/routes/reply.js` (或相关的回复 API)

```javascript
// 当 Master 创建回复请求时，应该包含 conversation_id

async createReplyRequest(req, res) {
  const {
    account_id,
    target_type,
    target_id,           // 向后兼容：可以是 conversation_id 或 platform_message_id
    conversation_id,     // 新增：优先使用
    platform_message_id, // 新增：可选
    reply_content,
    context
  } = req.body;

  const replyRequest = {
    reply_id: uuidv4(),
    request_id: uuidv4(),
    platform: 'douyin',  // 从 account 推断
    account_id,
    target_type,

    // Phase 9: 使用 conversation_id 作为主标识
    conversation_id: conversation_id || target_id,
    platform_message_id: platform_message_id,

    reply_content,
    context: {
      ...context,
      platform_user_id: this.extractUserIdFromConversationId(conversation_id || target_id),
    }
  };

  // 发送到 Worker
  await this.sendToWorker(replyRequest);
}
```

### Step 5: 创建迁移/兼容性层

创建一个辅助函数处理向后兼容性：

```javascript
/**
 * 规范化回复请求参数 (兼容 Phase 8 和 Phase 9)
 */
function normalizeReplyRequest(request) {
  const {
    target_id,           // Phase 8: 是 platform_message_id
    conversation_id,     // Phase 9: 新增
    platform_message_id,
    ...rest
  } = request;

  // Phase 9 优先级: conversation_id > target_id
  const finalConversationId = conversation_id || target_id;
  const finalPlatformMessageId = platform_message_id ||
                                (conversation_id ? null : target_id);

  return {
    ...rest,
    conversation_id: finalConversationId,
    platform_message_id: finalPlatformMessageId,
  };
}
```

---

## 📝 修改影响分析

### 直接修改的文件

| 文件 | 修改内容 | 影响范围 |
|------|---------|---------|
| platform-base.js | 更新方法签名和文档 | 所有平台实现 |
| douyin/platform.js | 新增两个方法，修改 replyToDirectMessage | 抖音平台 |
| reply-executor.js | 处理新参数，向后兼容 | Worker 回复流程 |
| Master API | 生成回复请求时包含 conversation_id | API 调用方 |

### 向后兼容策略

1. **旧代码继续工作**: 如果只提供 `target_id`，系统自动识别为 `conversation_id`
2. **参数自适应**: `normalizeReplyRequest()` 函数处理参数转换
3. **渐进式迁移**: Master 端可以逐步迁移，不需要一次性更新所有调用

---

## ✅ 测试计划

### Unit Tests (单元测试)

```javascript
describe('Phase 9: Message Reply ID Refactoring', () => {
  test('replyToDirectMessage 使用 conversation_id', async () => {
    // 验证 conversation_id 被正确使用
  });

  test('向后兼容：target_id 自动转换为 conversation_id', async () => {
    // 验证旧参数结构仍然工作
  });

  test('platform_message_id 可选参数', async () => {
    // 验证没有 platform_message_id 时仍能回复
  });

  test('findConversationByPlatformUser 正确定位会话', async () => {
    // 验证会话查找逻辑
  });

  test('extractUserIdFromConversationId 正确提取 user_id', async () => {
    // 验证 user_id 提取
  });
});
```

### Integration Tests (集成测试)

```javascript
describe('Phase 9: End-to-End Reply Workflow', () => {
  test('完整的会话回复流程', async () => {
    // 1. 创建会话
    // 2. 生成回复请求 (带 conversation_id)
    // 3. 执行回复
    // 4. 验证回复成功
  });

  test('带精确消息 ID 的回复', async () => {
    // 1. 创建会话和消息
    // 2. 生成回复请求 (带 conversation_id 和 platform_message_id)
    // 3. 执行回复
    // 4. 验证回复到正确的消息
  });
});
```

---

## 📋 实现检查清单

- [ ] 更新 platform-base.js 方法签名
- [ ] 实现 Douyin 平台的新方法
  - [ ] `extractUserIdFromConversationId()`
  - [ ] `findConversationByPlatformUser()`
  - [ ] `findMessageInConversation()`
  - [ ] 修改 `replyToDirectMessage()`
- [ ] 更新 ReplyExecutor 参数处理
- [ ] 创建兼容性辅助函数
- [ ] 更新 Master API 回复请求生成
- [ ] 创建单元测试 (至少 5 个)
- [ ] 创建集成测试 (至少 2 个)
- [ ] 更新文档和方法注释
- [ ] 手动测试完整流程
- [ ] 验证向后兼容性

---

## 🎯 预期成果

### 改进点

1. **更清晰的 API**: 明确使用 `conversation_id` 标识会话
2. **更稳定的定位**: 基于 account+user 的会话关系
3. **可选的精确定位**: 支持 `platform_message_id` 定位具体消息
4. **完全向后兼容**: 旧代码继续工作，无需立即迁移
5. **与 Phase 8 一致**: 充分利用新的会话管理系统

### 测试覆盖

- ✅ 单元测试: 5+ 个测试
- ✅ 集成测试: 2+ 个测试
- ✅ 端到端测试: 完整流程验证
- ✅ 向后兼容性测试

---

## 📚 相关文档

- [MESSAGE_REPLY_ID_REFACTORING.md](MESSAGE_REPLY_ID_REFACTORING.md) - 详细分析
- [PRIVATE_MESSAGE_ID_ANALYSIS.md](PRIVATE_MESSAGE_ID_ANALYSIS.md) - ID 类型分析
- [PHASE8_INTEGRATION_COMPLETE.md](PHASE8_INTEGRATION_COMPLETE.md) - Phase 8 完成情况

---

**状态**: 📋 规划完成，准备开始实现
**下一步**: 开始 Step 1 的实现
