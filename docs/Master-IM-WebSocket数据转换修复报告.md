# Master IM WebSocket 数据转换修复报告

## 修复日期
2025-10-31

## 问题描述

用户在 PC IM 中发现两个关键问题：

1. **昵称显示为 "Unknown"**：所有消息的发送者都显示为 "Unknown" 而不是实际用户名
2. **消息方向不正确**：无法区分"我发的"和"客户回的"两种消息

## 根本原因

经过分析，发现问题出在 [`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) 的数据转换逻辑中：

### 问题 1: 昵称显示

虽然之前修复了 snake_case → camelCase 的字段名映射问题，但还存在一个关键问题：**没有正确处理消息方向与发送者信息的关系**。

PC IM 客户端通过以下逻辑判断消息方向：
```typescript
const isReply = mainMsg.fromId === 'monitor_client' || mainMsg.fromName === '客服'
```

但是 Worker 数据中，消息的 `direction` 字段是用来标识消息方向的：
- `direction: 'incoming'` - 收到的消息（客户发的）
- `direction: 'outgoing'` - 发出的消息（我发的）

### 问题 2: 消息方向

Worker 数据模型中已经有 `direction` 字段和 `isAuthorReply` 字段：
- `Message.direction` - 私信消息方向（incoming/outgoing）
- `Comment.isAuthorReply` - 评论是否是作者回复

但 IMWebSocketServer 在转换数据时没有正确映射这些字段，导致 PC IM 无法识别消息方向。

## 修复方案

修改 [`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) 的 `getMessagesFromDataStore()` 方法，在转换数据时根据 `direction` 和 `isAuthorReply` 字段设置 `fromId` 和 `fromName`：

### 修复 1: 评论消息转换 (行 358-381)

```javascript
// 查找评论消息 (topicId = contentId，使用 camelCase)
if (dataObj.comments) {
  const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : dataObj.comments;
  const comments = commentsList.filter(c => c.contentId === topicId);
  for (const comment of comments) {
    // 如果是作者回复，fromId 设置为 'monitor_client'，fromName 设置为 '客服'
    const isAuthorReply = comment.isAuthorReply || false;
    messages.push({
      id: comment.commentId,
      channelId: accountId,
      topicId: topicId,
      fromName: isAuthorReply ? '客服' : (comment.authorName || '未知用户'),  // ✅ 修复
      fromId: isAuthorReply ? 'monitor_client' : (comment.authorId || ''),     // ✅ 修复
      content: comment.content || '',
      type: 'text',
      timestamp: comment.createdAt || Date.now(),
      serverTimestamp: comment.detectedAt || Date.now(),
      replyToId: comment.parentCommentId || null,
      replyToContent: null,
      direction: isAuthorReply ? 'outgoing' : 'incoming',                       // ✅ 新增
      isAuthorReply: isAuthorReply                                              // ✅ 新增
    });
  }
}
```

**关键修改**：
- 如果 `isAuthorReply === true`：
  - 设置 `fromName = '客服'`
  - 设置 `fromId = 'monitor_client'`
- 否则：
  - 使用原始的 `comment.authorName` 和 `comment.authorId`

### 修复 2: 私信消息转换 (行 383-408)

```javascript
// 查找私信消息 (topicId = conversationId，使用 camelCase)
if (dataObj.messages) {
  const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : dataObj.messages;
  const msgs = messagesList.filter(m => m.conversationId === topicId);
  for (const msg of msgs) {
    // 如果是 outgoing 消息（我发的），fromId 设置为 'monitor_client'，fromName 设置为 '客服'
    const isOutgoing = msg.direction === 'outgoing';
    messages.push({
      id: msg.messageId,
      channelId: accountId,
      topicId: topicId,
      fromName: isOutgoing ? '客服' : (msg.senderName || '未知用户'),          // ✅ 修复
      fromId: isOutgoing ? 'monitor_client' : (msg.senderId || ''),            // ✅ 修复
      content: msg.content || '',
      type: msg.messageType || 'text',
      timestamp: msg.createdAt || Date.now(),
      serverTimestamp: msg.detectedAt || Date.now(),
      replyToId: null,
      replyToContent: null,
      direction: msg.direction || 'incoming',                                   // ✅ 新增
      recipientId: msg.recipientId || '',                                       // ✅ 新增
      recipientName: msg.recipientName || ''                                    // ✅ 新增
    });
  }
}
```

**关键修改**：
- 如果 `direction === 'outgoing'`：
  - 设置 `fromName = '客服'`
  - 设置 `fromId = 'monitor_client'`
- 否则：
  - 使用原始的 `msg.senderName` 和 `msg.senderId`

### 修复 3: TypeScript 类型定义 (行 51-54)

更新 [`packages/crm-pc-im/src/shared/types-monitor.ts`](../packages/crm-pc-im/src/shared/types-monitor.ts) 添加新字段：

```typescript
export interface Message {
  id: string
  topicId: string
  channelId: string
  fromName?: string
  fromId?: string
  content: string
  type: 'text' | 'file' | 'image'
  timestamp: number
  serverTimestamp?: number
  fileUrl?: string
  fileName?: string
  replyToId?: string
  replyToContent?: string
  direction?: 'incoming' | 'outgoing'  // ✅ 新增
  isAuthorReply?: boolean             // ✅ 新增
  recipientId?: string                // ✅ 新增
  recipientName?: string              // ✅ 新增
}
```

## 数据流说明

完整的数据转换流程：

```
Worker (data-models.js)                  Master (IMWebSocketServer)              PC IM (MonitorPage.tsx)
┌──────────────────────┐                 ┌─────────────────────────┐             ┌──────────────────────┐
│ Comment Model        │                 │ getMessagesFromDataStore│             │ Message Display      │
│ - authorName         │                 │                         │             │                      │
│ - authorId           │  ───────────►   │ if (isAuthorReply)      │ ───────────► │ if (fromId ===       │
│ - isAuthorReply      │                 │   fromName = '客服'     │             │     'monitor_client')│
│                      │                 │   fromId = 'monitor_...'│             │   // 显示为右侧      │
│                      │                 │ else                    │             │ else                 │
│                      │                 │   fromName = authorName │             │   // 显示为左侧      │
└──────────────────────┘                 └─────────────────────────┘             └──────────────────────┘

Worker (data-models.js)                  Master (IMWebSocketServer)              PC IM (MonitorPage.tsx)
┌──────────────────────┐                 ┌─────────────────────────┐             ┌──────────────────────┐
│ Message Model        │                 │ getMessagesFromDataStore│             │ Message Display      │
│ - senderName         │                 │                         │             │                      │
│ - senderId           │  ───────────►   │ if (direction===out..)  │ ───────────► │ if (fromId ===       │
│ - direction          │                 │   fromName = '客服'     │             │     'monitor_client')│
│                      │                 │   fromId = 'monitor_...'│             │   // 显示为右侧      │
│                      │                 │ else                    │             │ else                 │
│                      │                 │   fromName = senderName │             │   // 显示为左侧      │
└──────────────────────┘                 └─────────────────────────┘             └──────────────────────┘
```

## 核心原则

**保持客户端代码不变，只修改 Master 数据转换层**

用户明确要求："尽量保持客户端代码不变，只改 master 的数据转换"

因此我们的修复策略是：
1. 不修改 PC IM 的判断逻辑 (`fromId === 'monitor_client' || fromName === '客服'`)
2. 在 Master 端将 Worker 数据正确转换为 PC IM 期望的格式
3. 让 Worker 的 `direction` 和 `isAuthorReply` 正确映射到 PC IM 的 `fromId`/`fromName`

## 测试验证

创建了测试脚本 [`tests/验证消息方向和昵称显示.js`](../tests/验证消息方向和昵称显示.js) 用于验证修复效果。

### 预期结果

修复后应该看到：

1. **昵称正确显示**：
   - 客户消息显示真实用户名（如 "苏苏"、"金伟"）
   - 我们的回复显示为 "客服"

2. **消息方向正确**：
   - 客户消息显示在左侧（incoming）
   - 我们的回复显示在右侧（outgoing）

## 相关文件

### 修改的文件
- [`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) - 修复 getMessagesFromDataStore() 方法
- [`packages/crm-pc-im/src/shared/types-monitor.ts`](../packages/crm-pc-im/src/shared/types-monitor.ts) - 添加新字段类型定义

### 相关参考文档
- [`docs/Worker-Master数据结构映射文档.md`](./Worker-Master数据结构映射文档.md) - Worker 数据模型完整定义
- [`docs/IMWebSocketServer字段名修复报告.md`](./IMWebSocketServer字段名修复报告.md) - 之前的 snake_case → camelCase 修复
- [`packages/worker/src/platforms/base/data-models.js`](../packages/worker/src/platforms/base/data-models.js) - Worker 数据模型源码

### 测试脚本
- [`tests/验证消息方向和昵称显示.js`](../tests/验证消息方向和昵称显示.js) - 新增的验证测试脚本

## 总结

本次修复解决了 Worker → Master → PC IM 数据流中的最后两个关键问题：

1. ✅ 昵称显示从 "未知用户" 修复为实际用户名
2. ✅ 消息方向正确区分"我发的"和"客户回的"

修复策略遵循用户要求：**只修改 Master 端数据转换，保持 PC IM 客户端代码不变**。

通过在 IMWebSocketServer 的 `getMessagesFromDataStore()` 方法中，根据 Worker 数据的 `direction` 和 `isAuthorReply` 字段，正确设置 `fromId` 和 `fromName`，使得 PC IM 能够通过其现有逻辑正确识别和显示消息方向。
