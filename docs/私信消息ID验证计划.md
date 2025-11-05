# 私信消息ID验证计划

**目标**: 验证抖音私信页面的原始ID数据，确认所有加密ID（`MS4wLjABAAAA...`）是否都被正确保存

**日期**: 2025-11-04

---

## 📋 验证步骤

### 1. 准备工作

**前提条件**:
- ✅ Master 服务正在运行（端口 3000）
- ✅ Worker 已启动并完成私信爬取
- ✅ 浏览器实例仍在运行，并保持登录状态

**检查命令**:
```bash
# 检查 Master 是否运行
curl http://localhost:3000/api/health

# 检查 Worker 日志
cd packages/worker && npm run dev

# 检查数据库消息数
node tests/check-message-count.js
```

---

### 2. 运行验证脚本

**脚本**: `tests/verify-douyin-message-ids.js`

**执行方式**:
```bash
cd tests
node verify-douyin-message-ids.js
```

**脚本功能**:
1. 连接到 Worker 的浏览器实例（用户数据目录：`packages/worker/data/browser/worker-1/browser_acc-xxx`）
2. 导航到抖音私信页面
3. 提取会话列表数据（从React Fiber）
4. 点击第一个会话
5. 提取消息列表数据（从DOM）
6. 分析ID格式分布
7. 验证匹配情况

**预期输出**:
```
【步骤 4】提取会话列表数据（从API响应）

  找到会话数: 38

  会话列表前5个:

    1. 福康普惠-养老中心
       user_id: MS4wLjABAAAA00qt8pVrvdIGNBoyJ0kYOvA2Dys9Q-i0gn0h3PJN1-odUsdHTaedM2ZaEQeqBr3f
       conversation_id: (无)
       ID格式: Base64长ID

    2. 关怀
       user_id: MS4wLjABAAAAneilewB8AsN1Lawd3UG821NJ_9KeCiHZVK2KVBCqs9VlnNNDQ3DWXddb8kHVq5XN
       conversation_id: (无)
       ID格式: Base64长ID

【步骤 6】提取消息数据（从DOM）

  找到消息数: 10+

  消息列表前5条:

    1. 向阳而生
       message_id: 7568666231667689009
       conversation_id: 71206683390 (或 MS4wLjABAAAA...)
       sender_id: 71206683390
       ID格式: 纯数字ID 或 Base64长ID

【步骤 7】分析ID格式分布

  会话列表中的user_id格式:
    Base64长ID (MS4wLjABAAAA...): 38
    纯数字ID: 0
    其他格式: 0

  消息中的conversation_id格式:
    Base64长ID (MS4wLjABAAAA...): ?
    纯数字ID: ?
    其他格式: 0
```

---

### 3. 对比数据库数据

**查询脚本**: `tests/debug-im-websocket.js`

```bash
node tests/debug-im-websocket.js
```

**对比点**:

| 数据源 | 会话ID格式 | 消息conversation_id格式 |
|-------|----------|----------------------|
| **抖音页面原始数据** | ? | ? |
| **数据库 cache_conversations** | `MS4wLjABAAAA...` (38个) | - |
| **数据库 cache_messages** | - | 混合（20个Base64 + 23个纯数字） |

**关键问题**:
1. ✅ 抖音页面的会话列表是否全部是 `MS4wLjABAAAA...` 格式？
2. ❓ 抖音页面的消息 `conversation_id` 是什么格式？
3. ❓ 为什么数据库中有23条消息使用纯数字 `conversation_id`？
4. ❓ 是否有遗漏的 `conversation_id` 没有被保存？

---

### 4. 验证数据映射逻辑

**代码位置**: `packages/worker/src/platforms/douyin/douyin-data-manager.js`

**检查点**:

#### 会话映射 (行29-32)
```javascript
mapConversationData(douyinData) {
  return {
    conversationId: String(douyinData.user_id || douyinData.conversation_id),
    userId: String(douyinData.user_id),
    // ...
  };
}
```

**问题**:
- ✅ `user_id` 被正确保存到 `conversationId`
- ❓ 是否应该同时保存 `conversation_id`？

#### 消息映射 (行86-101)
```javascript
mapMessageData(douyinData) {
  let conversationId = douyinData.conversation_id;

  if (!conversationId || conversationId === 'undefined') {
    conversationId = senderId !== 'unknown' ? senderId : recipientId;
  }

  return {
    conversationId: String(conversationId),
    // ...
  };
}
```

**问题**:
- ✅ 优先使用 `conversation_id`
- ❓ 为什么会回退到 `senderId` 或 `recipientId`？
- ❓ 这些回退ID是否与会话的 `user_id` 匹配？

---

### 5. 分析问题根源

**假设 A**: 抖音消息中的 `conversation_id` 确实有两种格式

**验证**:
- 运行 `verify-douyin-message-ids.js`
- 检查输出中的消息ID格式分布

**如果是真**:
- 需要建立 `user_id` ↔ `conversation_id`（纯数字）的映射关系
- 可能需要额外的API来获取这个映射

**假设 B**: 数据提取代码遗漏了某些 `conversation_id`

**验证**:
- 检查 `crawl-direct-messages-v2.js` 中的DOM提取逻辑
- 对比页面原始数据和数据库数据

**如果是真**:
- 修复提取逻辑，确保所有 `conversation_id` 都被正确提取

**假设 C**: 回退逻辑导致使用了错误的ID

**验证**:
- 查看23条纯数字消息的 `senderId` 和 `recipientId`
- 检查这些ID是否与会话的 `user_id` 相关

**如果是真**:
- 修改回退逻辑，确保使用正确的ID

---

### 6. 修复方案（待验证后确定）

**方案 A: 双ID存储**
```javascript
// douyin-data-manager.js
mapConversationData(douyinData) {
  return {
    conversationId: String(douyinData.conversation_id || douyinData.user_id),
    userId: String(douyinData.user_id),
    platformConversationId: douyinData.conversation_id,  // 新增
    platformUserId: douyinData.user_id,                  // 新增
    // ...
  };
}
```

**方案 B: 建立ID映射表**
```sql
-- 新增映射表
CREATE TABLE conversation_id_mapping (
  user_id TEXT PRIMARY KEY,
  conversation_id TEXT,
  account_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**方案 C: 修改查询逻辑**
```javascript
// im-websocket-server.js
// 支持多种ID格式查询
const msgs = messagesList.filter(m =>
  m.conversationId === topicId ||      // 精确匹配
  m.senderId === topicId ||            // 匹配user_id (发送者)
  m.recipientId === topicId            // 匹配user_id (接收者)
);
```

---

## 🎯 验证目标

**核心问题**:
> 我觉得最起码加密的ID都应该有存的，你在启动 chrome devtools mcp 工具验证下

**验证内容**:
1. ✅ 确认抖音页面上的所有会话都有 `user_id` (Base64长ID)
2. ✅ 确认这些 `user_id` 是否都被保存到数据库的 `cache_conversations` 表
3. ✅ 确认消息的 `conversation_id` 格式分布（Base64 vs 纯数字）
4. ✅ 确认消息的 `conversation_id` 是否与会话的 `user_id` 匹配
5. ✅ 找出无法匹配的原因

**预期结果**:
- 所有会话的 `user_id` (加密ID) 都应该被保存 ✅
- 如果消息使用纯数字 `conversation_id`，需要建立与 `user_id` 的映射关系

---

## 📊 数据对比表（待填写）

| 数据项 | 抖音页面原始值 | 数据库存储值 | 是否匹配 |
|-------|--------------|-----------|---------|
| 会话总数 | ? | 38 | ? |
| 会话user_id格式 | ? | 100% Base64 | ? |
| 消息总数 | ? | 43 | ? |
| 消息conversation_id (Base64) | ? | 20 | ? |
| 消息conversation_id (纯数字) | ? | 23 | ? |
| 能成功匹配的消息 | ? | 10 | ? |

---

**下一步**: 运行验证脚本 `node tests/verify-douyin-message-ids.js`
