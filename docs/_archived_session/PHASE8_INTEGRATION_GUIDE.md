# Phase 8 私信爬虫集成指南

**目标**: 将 Phase 8 的改进集成到现有的 platform.js 中

**当前状态**: 准备集成

**预计工作量**: 1-2 天

---

## 📋 集成概览

### 现状
- ✅ Phase 8 爬虫已实现: `crawl-direct-messages-v2.js`
- ✅ 会话 DAO 已实现: `conversations-dao.js`
- ✅ 消息持久化服务已实现: `message-persistence-service.js`
- ❌ **但还没有整合到 platform.js 中使用**

### 目标
- ✅ 将 Phase 8 爬虫集成到 `crawlDirectMessages()` 方法
- ✅ 提取会话和消息数据
- ✅ 通过 Master 保存到数据库

---

## 🔄 数据流

### 原来的流程 (单一消息)
```
Worker: crawlDirectMessages()
  ↓
  返回: { directMessages: [...], stats: {...} }
  ↓
Master: 保存到 direct_messages 表
  ↓
问题: ❌ 无法组织消息成会话
```

### Phase 8 的改进流程 (会话 + 消息)
```
Worker: crawlDirectMessagesV2()  ← Phase 8 改进
  ↓
  返回: {
    conversations: [...],       ✅ 新增: 会话列表
    directMessages: [...],      ✅ 改进: 带 conversation_id
    stats: {...}
  }
  ↓
Master:
  1. 保存会话到 conversations 表 ✅
  2. 保存消息到 direct_messages 表 ✅
  ↓
数据库: 清晰的会话-消息关系
```

---

## 📝 集成步骤

### 第1步: 更新 platform.js 中的 crawlDirectMessages 方法

**文件**: `packages/worker/src/platforms/douyin/platform.js`

**当前代码** (行 1001-1140):
```javascript
async crawlDirectMessages(account) {
  // 原来的实现: 单一API拦截 + 消息列表
  // 返回: { directMessages, stats }
}
```

**改进后的代码**:
```javascript
// 1. 在文件顶部导入 Phase 8 爬虫
const { crawlDirectMessagesV2 } = require('./crawl-direct-messages-v2');

// 2. 更新 crawlDirectMessages 方法
async crawlDirectMessages(account) {
  try {
    logger.info(`[DM Crawl] Starting for account ${account.id}`);

    // 获取或创建页面
    const page = await this.getOrCreatePage(account.id);

    // 使用 Phase 8 改进的爬虫
    const crawlResult = await crawlDirectMessagesV2(page, account);

    // crawlResult 包含:
    // {
    //   conversations: [...],      ✅ 会话列表
    //   directMessages: [...],     ✅ 消息列表 (含 conversation_id)
    //   stats: {...}
    // }

    // 发送到 Master
    await this.sendCrawlResultToMaster(account, crawlResult);

    // 缓存 (可选)
    this._cacheConversationsAndMessages(account.id, crawlResult);

    logger.info(`[DM Crawl] Completed: ${crawlResult.directMessages.length} messages`);

    return crawlResult;

  } catch (error) {
    logger.error(`[DM Crawl] Failed:`, error);
    throw error;
  }
}

// 3. 新增辅助方法
private _cacheConversationsAndMessages(accountId, crawlResult) {
  const { conversations, directMessages } = crawlResult;

  if (conversations) {
    conversations.forEach(conv => {
      cacheManager.addConversation(accountId, conv);
    });
  }

  if (directMessages) {
    directMessages.forEach(msg => {
      cacheManager.addMessage(accountId, msg);
    });
  }
}
```

### 第2步: 更新 message-reporter.js 报告会话数据

**文件**: `packages/worker/src/communication/message-reporter.js` (如果存在)

**添加会话报告**:
```javascript
reportAll(accountId, data) {
  const { comments, conversations, directMessages } = data;

  // 报告会话数据
  if (conversations && conversations.length > 0) {
    this.socket.emit('worker:conversations', {
      account_id: accountId,
      conversations,
      timestamp: Date.now()
    });
  }

  // 报告消息数据 (现在包含 conversation_id)
  if (directMessages && directMessages.length > 0) {
    this.socket.emit('worker:direct-messages', {
      account_id: accountId,
      direct_messages: directMessages,
      timestamp: Date.now()
    });
  }

  // 报告评论数据 (保持不变)
  if (comments && comments.length > 0) {
    this.socket.emit('worker:comments', {
      account_id: accountId,
      comments,
      timestamp: Date.now()
    });
  }
}
```

### 第3步: 在 Master 中集成数据库保存

**文件**: `packages/master/src/communication/socket-server.js` 或相关消息处理器

**添加会话保存逻辑**:
```javascript
// 处理会话数据
socket.on('worker:conversations', async (data) => {
  const { account_id, conversations } = data;

  try {
    const conversationsDAO = new ConversationsDAO(db);

    // 使用 upsertMany 批量创建/更新
    const saved = conversationsDAO.upsertMany(
      conversations.map(conv => ({
        ...conv,
        account_id  // 确保账户ID正确
      }))
    );

    logger.info(`Saved ${saved} conversations for account ${account_id}`);

  } catch (error) {
    logger.error(`Failed to save conversations:`, error);
  }
});

// 处理消息数据 (改进版, 带 conversation_id)
socket.on('worker:direct-messages', async (data) => {
  const { account_id, direct_messages } = data;

  try {
    const messagesDAO = new DirectMessagesDAO(db);

    // 使用 bulkInsertV2 支持新字段
    const result = messagesDAO.bulkInsertV2(direct_messages);

    logger.info(`Saved ${result.inserted} messages for account ${account_id}`);

  } catch (error) {
    logger.error(`Failed to save direct messages:`, error);
  }
});
```

### 第4步: 更新 monitor-task.js

**文件**: `packages/worker/src/handlers/monitor-task.js`

**当前代码** (行 174-194):
```javascript
// 爬取私信
const dmResult = await this.platformInstance.crawlDirectMessages(this.account);
const rawDMs = dmResult.directMessages || dmResult;
const dmStats = dmResult.stats || {};

// 解析私信
const parsedDMs = this.dmParser.parse(rawDMs);
```

**改进后的代码**:
```javascript
// 爬取私信 (现在包含会话数据)
const dmResult = await this.platformInstance.crawlDirectMessages(this.account);

// dmResult 现在包含:
// {
//   conversations: [...],
//   directMessages: [...],  // 每条消息都有 conversation_id
//   stats: {...}
// }

const conversations = dmResult.conversations || [];
const rawDMs = dmResult.directMessages || [];
const dmStats = dmResult.stats || {};

// 发送会话和消息到 Master
if (conversations.length > 0 || rawDMs.length > 0) {
  this.messageReporter.reportAll(this.account.id, {
    comments: newComments,
    conversations,      // ✅ 新增: 发送会话
    directMessages: rawDMs,
  });
}
```

---

## 🧪 测试检查清单

### 单元测试
- [ ] `crawlDirectMessagesV2()` 返回正确的数据结构
- [ ] 会话和消息的关联正确 (conversation_id)
- [ ] 处理虚拟列表分页正确
- [ ] API 去重正确

### 集成测试
- [ ] Worker 爬虫 → Master 保存的完整流程
- [ ] 会话表和消息表的数据一致性
- [ ] 虚拟列表分页的完整消息加载
- [ ] 错误处理 (网络故障、超时等)

### 端到端测试
- [ ] 登录并开始监控
- [ ] 验证 conversations 表中是否有数据
- [ ] 验证 direct_messages 表中的 conversation_id 是否正确
- [ ] 验证消息回复功能能否使用 conversation_id

---

## 📊 修改影响范围

| 文件 | 修改类型 | 影响 |
|------|--------|------|
| `platform.js` | 核心方法修改 | 高 - 改变返回值结构 |
| `message-reporter.js` | 新增事件 | 中 - 新增会话报告 |
| `socket-server.js` | 新增事件处理 | 中 - 新增会话保存逻辑 |
| `monitor-task.js` | 调用调整 | 中 - 调整参数传递 |
| `direct-message-dao.js` | 已有新方法 | 低 - 使用 bulkInsertV2 |
| `conversations-dao.js` | 新增 DAO | 低 - 新增不影响旧代码 |

---

## ⚠️ 向后兼容性考虑

### 可能的兼容性问题

**问题 1**: `crawlDirectMessages` 的返回值结构改变
```javascript
// 原来: { directMessages, stats }
// 现在: { conversations, directMessages, stats }
```

**解决方案**:
- 检查所有调用 `crawlDirectMessages` 的地方
- 确保它们能处理新的返回结构
- 可以使用版本化的方法名 (e.g., `crawlDirectMessagesV2`)

**问题 2**: 消息数据结构改变
```javascript
// 原来的消息:
{
  id, account_id, platform_user_id, platform_message_id,
  content, sender_name, sender_id, direction, is_read, ...
}

// 现在的消息:
{
  id, account_id, conversation_id,  // ✅ 新增 conversation_id
  platform_message_id,
  content,
  platform_sender_id,      // ✅ 改名为 platform_ 前缀
  platform_sender_name,    // ✅ 改名为 platform_ 前缀
  platform_receiver_id,    // ✅ 新增
  platform_receiver_name,  // ✅ 新增
  direction, is_read, ...
}
```

**解决方案**:
- 字段向后兼容 (旧字段仍支持)
- DAO 使用 bulkInsertV2 而非 bulkInsert
- 缓存系统支持新字段

---

## 📋 完整集成检查清单

### 准备阶段
- [ ] 审查 Phase 8 爬虫代码
- [ ] 确认所有依赖项已实现
- [ ] 备份原来的 crawlDirectMessages 方法

### 实现阶段
- [ ] 在 platform.js 中导入 crawlDirectMessagesV2
- [ ] 实现新的 crawlDirectMessages 方法
- [ ] 更新 message-reporter.js
- [ ] 更新 Master 的消息处理
- [ ] 更新 monitor-task.js

### 测试阶段
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动测试完整流程
- [ ] 验证数据库中的数据正确性

### 验证阶段
- [ ] 会话表中有正确的会话数据
- [ ] 消息表中有正确的 conversation_id
- [ ] 消息回复功能正常
- [ ] 监控任务正常运行

### 部署阶段
- [ ] 代码审查
- [ ] 灰度部署 (可选)
- [ ] 监控运行状态
- [ ] 收集反馈

---

## 🎯 预期成果

完成集成后：

✅ **Worker 端**:
- crawlDirectMessages 返回完整的会话和消息数据
- 支持虚拟列表分页加载完整消息历史

✅ **Master 端**:
- conversations 表中有完整的会话数据
- direct_messages 表中每条消息都关联到会话

✅ **功能层面**:
- 消息回复可以使用 conversation_id (更稳定)
- 可以快速查询某个对话的所有消息
- 可以管理未读会话数

---

## ⏱️ 时间估算

| 任务 | 预计时间 |
|------|--------|
| 代码实现 | 4-6 小时 |
| 单元测试 | 2-3 小时 |
| 集成测试 | 2-3 小时 |
| 手动测试和验证 | 2-3 小时 |
| **总计** | **10-15 小时 (1-2 天)** |

---

## 📞 联系和支持

如有问题或需要帮助，请参考：
- `crawl-direct-messages-v2.js` - Phase 8 爬虫实现
- `conversations-dao.js` - 会话 DAO
- `PHASE8_IMPLEMENTATION_COMPLETE.md` - Phase 8 完整报告
- `crawl-direct-messages-integration.js` - 集成示例代码

---

**创建时间**: 2024年12月

**目的**: 指导 Phase 8 的私信爬虫集成

**下一步**: 按照清单逐步实施集成

