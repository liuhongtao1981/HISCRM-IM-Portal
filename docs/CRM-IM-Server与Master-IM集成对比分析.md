# CRM IM Server 与 Master IM 集成对比分析

## 文档日期
2025-10-31

## 概述

本文档对比分析原有的 **CRM IM Server** ([`packages/crm-im-server/server.js`](../packages/crm-im-server/server.js)) 和已集成到 Master 的 **IM WebSocket Server** ([`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js)),识别功能差异并提出更新方案。

## 系统架构对比

### CRM IM Server (原版)

**架构**: 独立的 WebSocket 服务器
- **数据源**: JSON 文件存储 (channels.json, topics.json, messages.json)
- **端口**: 独立运行,默认 8080
- **依赖**: Express + Socket.IO
- **数据流**: 静态文件 → WebSocket → PC IM 客户端

### Master IM WebSocket Server (集成版)

**架构**: 集成到 Master 服务器
- **数据源**: DataStore (Worker 实时推送的内存数据)
- **端口**: Master 端口 (默认 3000)
- **依赖**: 使用 Master 的 Socket.IO 实例
- **数据流**: Worker → DataStore → IMWebSocketServer → PC IM 客户端

## WebSocket 事件对比

### ✅ 已实现的事件 (Master IM)

| 事件名称 | 方向 | 说明 | Master 实现 | CRM IM 实现 |
|---------|------|------|------------|-------------|
| `monitor:register` | Client → Server | 监控客户端注册 | ✅ | ✅ |
| `monitor:registered` | Server → Client | 注册成功响应 | ✅ | ✅ |
| `monitor:request_channels` | Client → Server | 请求频道列表 | ✅ | ✅ |
| `monitor:channels` | Server → Client | 返回频道列表 | ✅ | ✅ |
| `monitor:request_topics` | Client → Server | 请求主题列表 | ✅ | ✅ |
| `monitor:topics` | Server → Client | 返回主题列表 | ✅ | ✅ |
| `monitor:request_messages` | Client → Server | 请求消息列表 | ✅ | ✅ |
| `monitor:messages` | Server → Client | 返回消息列表 | ✅ | ✅ |
| `monitor:reply` | Client → Server | 发送回复 | ✅ | ✅ |
| `reply:success` | Server → Client | 回复成功确认 | ✅ | ✅ |
| `channel:message` | Server → Client | 广播新消息 | ✅ | ✅ |

### ❌ 未实现的事件 (仅 CRM IM)

| 事件名称 | 方向 | 说明 | 影响 |
|---------|------|------|------|
| `user:login` | Client → Server | 用户登录 | 低 - PC IM 不使用此功能 |
| `user:online` | Server → Client | 用户上线通知 | 低 - PC IM 不使用此功能 |
| `user:offline` | Server → Client | 用户下线通知 | 低 - PC IM 不使用此功能 |
| `message:send` | Client → Server | 发送普通消息 | 低 - PC IM 使用 `monitor:reply` |
| `message:new` | Server → Client | 新消息通知 | 低 - PC IM 使用 `channel:message` |
| `status:change` | Client → Server | 状态变更 | 低 - PC IM 不使用此功能 |

## PC IM 客户端代码分析

### 当前 PC IM 使用的事件

从 [`packages/crm-pc-im/src/pages/MonitorPage.tsx`](../packages/crm-pc-im/src/pages/MonitorPage.tsx) 和 [`packages/crm-pc-im/src/services/websocket.ts`](../packages/crm-pc-im/src/services/websocket.ts) 分析:

**发送的事件**:
1. `monitor:register` - 注册监控客户端
2. `monitor:request_channels` - 请求频道列表
3. `monitor:request_topics` - 请求主题列表
4. `monitor:request_messages` - 请求消息列表
5. `monitor:reply` - 发送回复

**监听的事件**:
1. `monitor:registered` - 注册成功
2. `monitor:channels` - 接收频道列表
3. `monitor:topics` - 接收主题列表
4. `monitor:messages` - 接收消息列表
5. `channel:message` - 接收新消息
6. `reply:success` - 回复成功
7. `connect` - 连接成功
8. `disconnect` - 断开连接
9. `error` - 错误事件

### PC IM 新增功能 (types-monitor.ts 的变化)

从 [`packages/crm-pc-im/src/shared/types-monitor.ts`](../packages/crm-pc-im/src/shared/types-monitor.ts) 发现以下新增字段:

#### Topic 接口新增字段:
```typescript
isPrivate?: boolean  // 是否为私信主题
```

#### Message 接口新增字段:
```typescript
type: 'text' | 'file' | 'image' | 'comment'     // 新增 'comment' 类型
messageCategory?: 'private' | 'comment'         // ✅ 新增: 消息分类
isHandled?: boolean                             // ✅ 新增: 是否已处理
```

#### ChannelMessage 接口新增字段:
```typescript
type: 'text' | 'file' | 'image' | 'comment'     // 新增 'comment' 类型
messageCategory?: 'private' | 'comment'         // ✅ 新增: 消息分类
isHandled?: boolean                             // ✅ 新增: 是否已处理
```

### PC IM MonitorPage 新增功能

从 [`packages/crm-pc-im/src/pages/MonitorPage.tsx`](../packages/crm-pc-im/src/pages/MonitorPage.tsx) 分析:

#### 新增 UI 功能:

1. **标签页切换** (行 61-62):
   ```typescript
   const [activeTab, setActiveTab] = useState<'private' | 'comment'>('comment')
   const [showCommentList, setShowCommentList] = useState(true)
   const [showPrivateList, setShowPrivateList] = useState(true)
   ```

2. **消息分类统计** (行 73-78):
   ```typescript
   const privateUnhandledCount = currentMessages.filter(msg =>
     msg.messageCategory === 'private' && !msg.isHandled
   ).length
   const commentUnhandledCount = currentMessages.filter(msg =>
     (msg.messageCategory === 'comment' || !msg.messageCategory) && !msg.isHandled
   ).length
   ```

3. **消息过滤** (行 81-88):
   ```typescript
   const filteredMessages = currentMessages.filter(msg => {
     if (activeTab === 'private') {
       return msg.messageCategory === 'private'
     } else {
       return msg.messageCategory === 'comment' || !msg.messageCategory
     }
   })
   ```

4. **未读评论列表** (行 91-125):
   - 按作品分组显示未读评论
   - 显示每个作品的未读数量
   - 显示最新未读消息

5. **私信列表** (行 128-150):
   - 按作品/会话分组显示私信
   - 显示最新消息时间
   - 按时间倒序排列

## 需要在 Master IM 中实现的功能

### 1. 消息分类支持 (messageCategory)

**优先级**: 🔴 高

**影响**: PC IM 依赖此字段区分私信和评论

**实现方案**:

在 [`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) 的 `getMessagesFromDataStore()` 方法中添加 `messageCategory` 字段:

```javascript
// 在 lines 358-381 (评论消息转换) 中添加:
messages.push({
  id: comment.commentId,
  channelId: accountId,
  topicId: topicId,
  fromName: isAuthorReply ? '客服' : (comment.authorName || '未知用户'),
  fromId: isAuthorReply ? 'monitor_client' : (comment.authorId || ''),
  content: comment.content || '',
  type: 'comment',  // ✅ 修改: 评论消息类型为 'comment'
  messageCategory: 'comment',  // ✅ 新增: 消息分类为 'comment'
  timestamp: comment.createdAt || Date.now(),
  serverTimestamp: comment.detectedAt || Date.now(),
  replyToId: comment.parentCommentId || null,
  replyToContent: null,
  direction: isAuthorReply ? 'outgoing' : 'incoming',
  isAuthorReply: isAuthorReply,
  isHandled: false  // ✅ 新增: 默认未处理
});

// 在 lines 383-408 (私信消息转换) 中添加:
messages.push({
  id: msg.messageId,
  channelId: accountId,
  topicId: topicId,
  fromName: isOutgoing ? '客服' : (msg.senderName || '未知用户'),
  fromId: isOutgoing ? 'monitor_client' : (msg.senderId || ''),
  content: msg.content || '',
  type: msg.messageType || 'text',
  messageCategory: 'private',  // ✅ 新增: 消息分类为 'private'
  timestamp: msg.createdAt || Date.now(),
  serverTimestamp: msg.detectedAt || Date.now(),
  replyToId: null,
  replyToContent: null,
  direction: msg.direction || 'incoming',
  recipientId: msg.recipientId || '',
  recipientName: msg.recipientName || '',
  isHandled: false  // ✅ 新增: 默认未处理
});
```

### 2. 主题私信标记 (isPrivate)

**优先级**: 🟡 中

**影响**: PC IM 使用此字段识别私信主题

**实现方案**:

在 [`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) 的 `getTopicsFromDataStore()` 方法中添加 `isPrivate` 字段:

```javascript
// 在 lines 266-318 (会话转换为主题) 中添加:
topics.push({
  id: conversation.conversationId,
  channelId: accountId,
  title: conversation.userName || '私信会话',
  description: conversation.lastMessageContent || '',
  createdTime: conversation.createdAt || Date.now(),
  lastMessageTime: conversation.lastMessageTime || Date.now(),
  messageCount: conversationMessageCount,
  unreadCount: 0,
  lastMessage: conversation.lastMessageContent || '',
  isPinned: false,
  isPrivate: true  // ✅ 新增: 标记为私信主题
});
```

### 3. 回复功能支持 messageCategory

**优先级**: 🟡 中

**影响**: PC IM 发送回复时需要指定消息分类

**实现方案**:

在 [`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) 的 `handleMonitorReply()` 方法中:

```javascript
handleMonitorReply(socket, data) {
  try {
    const { channelId, topicId, content, replyToId, replyToContent, messageCategory } = data;  // ✅ 接收 messageCategory
    logger.info(`[IM WS] Monitor reply:`, { channelId, topicId, content, messageCategory });

    const replyMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      channelId,
      topicId,
      fromName: '客服',
      fromId: 'monitor_client',
      content,
      type: messageCategory === 'private' ? 'text' : 'comment',  // ✅ 根据分类设置类型
      messageCategory: messageCategory || 'comment',  // ✅ 新增: 消息分类
      timestamp: Date.now(),
      serverTimestamp: Date.now(),
      replyToId,
      replyToContent,
      isHandled: false  // ✅ 新增: 默认未处理
    };

    this.broadcastToMonitors('channel:message', replyMessage);
    socket.emit('reply:success', { messageId: replyMessage.id });

    logger.info(`[IM WS] Reply sent: ${replyMessage.id}, category: ${messageCategory}`);
  } catch (error) {
    logger.error('[IM WS] Monitor reply error:', error);
  }
}
```

## HTTP API 对比

### CRM IM Server 提供的 HTTP API

| 端点 | 方法 | 说明 | Master 需要 |
|------|------|------|-------------|
| `/` | GET | 健康检查 | ❌ (Master 已有) |
| `/api/online-users` | GET | 获取在线用户 | ❌ (PC IM 不使用) |
| `/api/channels` | GET | 获取频道列表 | ❌ (PC IM 使用 WebSocket) |
| `/api/channels/:id` | GET | 获取单个频道 | ❌ (PC IM 使用 WebSocket) |
| `/api/channels` | POST | 创建频道 | ❌ (由 Admin Web 管理) |
| `/api/channels/:id` | PUT | 更新频道 | ❌ (由 Admin Web 管理) |
| `/api/channels/:id` | DELETE | 删除频道 | ❌ (由 Admin Web 管理) |
| `/api/topics` | GET | 获取主题列表 | ❌ (PC IM 使用 WebSocket) |
| `/api/topics` | POST | 创建主题 | ❌ (由 Worker 生成) |
| `/api/topics/:id` | PUT | 更新主题 | ❌ (由 Worker 更新) |
| `/api/topics/:id` | DELETE | 删除主题 | ❌ (由 Worker 管理) |
| `/api/messages/send` | POST | 发送测试消息 | ⚠️  (可选 - 用于测试) |
| `/api/sessions` | GET | 获取会话列表 | ❌ (PC IM 不使用) |
| `/api/sessions/:sessionId/replies` | GET | 获取会话回复 | ❌ (PC IM 不使用) |
| `/api/sessions` | POST | 创建会话 | ❌ (PC IM 不使用) |
| `/api/sessions/reply` | POST | 会话回复 | ❌ (PC IM 不使用) |

**结论**: Master 不需要实现额外的 HTTP API,PC IM 完全通过 WebSocket 通信。

## 总结

### ✅ 已完全兼容的功能

1. 核心 WebSocket 事件 (monitor:register, monitor:channels, monitor:topics, monitor:messages, monitor:reply)
2. 消息广播 (channel:message)
3. 客户端注册和管理 (monitor/admin clients)
4. 频道/主题/消息数据结构

### 🔴 需要立即实现的功能 (高优先级)

1. **消息分类支持** (messageCategory: 'private' | 'comment')
   - 在消息对象中添加 `messageCategory` 字段
   - 在回复处理中支持 `messageCategory` 参数
   - 添加 `isHandled` 字段用于未读状态管理

### 🟡 建议实现的功能 (中优先级)

2. **私信主题标记** (isPrivate)
   - 在主题对象中添加 `isPrivate` 字段
   - 区分评论主题和私信主题

### 📝 下一步行动

1. 更新 [`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) 添加 `messageCategory` 和 `isHandled` 字段
2. 更新 [`packages/master/src/communication/im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) 添加 `isPrivate` 字段
3. 测试 PC IM 的标签页切换功能
4. 测试消息分类过滤功能
5. 更新文档说明新增功能
