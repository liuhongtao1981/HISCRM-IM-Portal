# Worker 私信昵称提取修复报告

## 修复日期
2025-10-31

## 问题描述

用户在 PC IM 中发现所有消息的发送者都显示为 "Unknown" 而不是实际用户名（如 "苏苏"、"金伟" 等）。

经过分析,问题的根本原因在于 Worker 数据收集层强制覆盖了昵称字段。

## 根本原因

在 [`packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js:191`](../packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js#L191) 中,DOM 提取的消息在发送到 DataManager 时,`sender_name` 字段被强制设置为 `'Unknown'`:

```javascript
// ❌ 问题代码（行 187-196）
const formattedMessages = messages.map(msg => ({
  message_id: msg.platform_message_id,
  conversation_id: msg.conversation_id,
  sender_id: msg.platform_sender_id || 'unknown',
  sender_name: 'Unknown', // ❌ 强制覆盖为 'Unknown'
  content: msg.content,
  type: msg.message_type || 'text',
  direction: msg.direction || 'incoming',
  created_at: msg.timestamp,
}));
```

**为什么这是错误的:**

1. **React Fiber 已经提取了昵称**: 在 [crawl-direct-messages-v2.js:876-882](../packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js#L876-L882) 中,`extractMessagesFromVirtualList()` 函数已经通过 React Fiber 提取了 `platform_sender_name` 和 `sender_nickname` 字段:

```javascript
// ✅ React Fiber 提取逻辑（行 876-882）
const message = {
  index: messages.length,
  platform_message_id: props.serverId || props.id || `msg_${messages.length}`,
  conversation_id: realConversationId,
  platform_user_id: props.conversationId,
  content: textContent.substring(0, 500) || (props.text || '').substring(0, 500),
  timestamp: props.timestamp || props.createdAt || new Date().toISOString(),
  message_type: props.type || 'text',
  // ✅ 已提取发送者昵称
  platform_sender_id: props.sender || props.senderId || (props.isFromMe ? 'self' : 'other'),
  platform_sender_name: props.nickname || props.senderName || (props.isFromMe ? 'Me' : 'Other'),
  sender_avatar: props.avatar || null,
  sender_nickname: props.nickname || null,
  direction: props.isFromMe ? 'outbound' : 'inbound',
  created_at: Math.floor(new Date(props.timestamp || props.createdAt).getTime() / 1000),
  is_read: props.isRead || false,
  status: props.status || 'sent'
};
```

2. **强制覆盖导致数据丢失**: 在 line 191 强制设置 `sender_name: 'Unknown'` 覆盖了 React Fiber 提取的 `msg.platform_sender_name` 和 `msg.sender_nickname`,导致真实昵称数据丢失。

3. **DataManager 使用了错误的值**: DouyinDataManager 在 [douyin-data-manager.js:77](../packages/worker/src/platforms/douyin/douyin-data-manager.js#L77) 中将此数据映射为标准格式:

```javascript
senderName: douyinData.sender_name || douyinData.from_nickname || 'Unknown',
```

由于 `sender_name` 已经是 `'Unknown'`,这个值就被直接使用了。

## 修复方案

修改 [crawl-direct-messages-v2.js:191](../packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js#L191),使用已从 React Fiber 提取的昵称字段:

```javascript
// ✅ 修复后的代码（行 187-196）
const formattedMessages = messages.map(msg => ({
  message_id: msg.platform_message_id,
  conversation_id: msg.conversation_id,
  sender_id: msg.platform_sender_id || 'unknown',
  sender_name: msg.platform_sender_name || msg.sender_nickname || 'Unknown', // ✅ 使用 React Fiber 提取的名称
  content: msg.content,
  type: msg.message_type || 'text',
  direction: msg.direction || 'incoming',
  created_at: msg.timestamp,
}));
```

**修复逻辑**:

1. 优先使用 `msg.platform_sender_name` (从 React Fiber `props.nickname` 或 `props.senderName` 提取)
2. 如果不存在,使用 `msg.sender_nickname` (从 React Fiber `props.nickname` 提取)
3. 只有在两者都不存在时,才后备使用 `'Unknown'`

## 数据流说明

完整的昵称数据流:

```
React Fiber (Douyin 前端)                Worker (crawl-direct-messages-v2.js)     Worker (DouyinDataManager)           Master (IMWebSocketServer)
┌────────────────────────┐               ┌────────────────────────────────┐        ┌──────────────────────┐             ┌──────────────────────┐
│ props.nickname         │               │ extractMessagesFromVirtualList │        │ mapMessageData       │             │ getMessagesFromData  │
│ props.senderName       │  ──────────►  │                                │  ────► │                      │  ─────────► │Store                 │
│                        │               │ platform_sender_name: props... │        │ senderName: data...  │             │                      │
│                        │               │ sender_nickname: props.nickname│        │                      │             │ fromName: senderName │
└────────────────────────┘               └────────────────────────────────┘        └──────────────────────┘             └──────────────────────┘
                                                      ↓
                                         ┌────────────────────────────────┐
                                         │ formattedMessages.map          │
                                         │                                │
                                         │ ❌ 旧: sender_name: 'Unknown'  │
                                         │ ✅ 新: sender_name: msg.plat...│
                                         └────────────────────────────────┘
```

**关键改进**:

- **修复前**: React Fiber 提取的昵称被 `'Unknown'` 覆盖 → DataManager 使用 `'Unknown'` → Master 使用 `'Unknown'` → PC IM 显示 `'Unknown'`
- **修复后**: React Fiber 提取的昵称被保留 → DataManager 使用真实昵称 → Master 使用真实昵称 → PC IM 显示真实昵称

## 相关文件

### 修改的文件
- [`packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`](../packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js) - 修复 line 191

### 相关参考文档
- [`docs/Master-IM-WebSocket数据转换修复报告.md`](./Master-IM-WebSocket数据转换修复报告.md) - Master 端的数据转换修复（方向和 fromId）
- [`docs/Worker-Master数据结构映射文档.md`](./Worker-Master数据结构映射文档.md) - Worker 数据模型完整定义
- [`packages/worker/src/platforms/base/data-models.js`](../packages/worker/src/platforms/base/data-models.js) - Worker 数据模型源码

### 测试脚本
- [`tests/验证昵称修复.js`](../tests/验证昵称修复.js) - 新增的验证测试脚本

## 测试验证

运行测试脚本验证修复效果:

```bash
# 1. 重启 Worker 以加载修改后的代码
cd packages/worker
npm start

# 2. 等待 Worker 连接到 Master

# 3. 运行验证脚本
node tests/验证昵称修复.js
```

### 预期结果

修复后应该看到:

1. **昵称正确显示**:
   - 客户消息显示真实用户名（如 "苏苏"、"金伟"）
   - 我们的回复显示为 "客服"
   - 不再有 "Unknown" 显示

2. **测试统计**:
   ```
   ✅ 消息统计:
      总消息数: 10
      有真实昵称: 8 (80.0%)
      显示"Unknown": 0 (0.0%)

   ✅ 唯一昵称列表:
      1. 苏苏
      2. 金伟
      3. 客服

   ✅ 修复验证:
      ✅✅✅ 昵称修复成功 - 所有消息都有真实昵称!
   ```

## 注意事项

1. **需要重启 Worker**: 修改的是 Worker 端代码,需要重启 Worker 进程才能生效
2. **无需重启 Master 或 IM**: 这是 Worker 端的修复,不影响 Master 和 IM 客户端
3. **历史数据不受影响**: 修复只影响新爬取的消息,已存储的历史消息保持不变
4. **React Fiber 依赖**: 昵称提取依赖 React Fiber 数据可用性,如果 Fiber 数据不完整,仍可能后备到 'Unknown'

## 总结

本次修复解决了 Worker 数据收集层强制覆盖昵称字段的问题,通过正确使用 React Fiber 提取的数据,实现了真实用户昵称的正确显示。

修复策略:
1. ✅ 保留 React Fiber 提取的 `platform_sender_name` 和 `sender_nickname` 字段
2. ✅ 在转换为 DataManager 格式时使用这些字段而不是强制 `'Unknown'`
3. ✅ 保持后备逻辑 (`|| 'Unknown'`) 以处理 React Fiber 数据不可用的情况

配合之前的 [Master-IM-WebSocket数据转换修复报告](./Master-IM-WebSocket数据转换修复报告.md) 中的修复,现在实现了完整的昵称和消息方向显示:

- ✅ 昵称从 "Unknown" 修复为实际用户名 (本次修复)
- ✅ 消息方向正确区分"我发的"和"客户回的" (之前的修复)
