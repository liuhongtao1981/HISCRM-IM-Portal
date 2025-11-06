# IM 标记已读功能实现

**创建时间**: 2025-11-06
**版本**: 1.0
**作者**: Claude Code

## 概述

实现了 IM 客户端点击会话后自动标记已读的功能，包括评论和私信两种类型的消息。

## 功能需求

用户在 IM 客户端中：
1. 点击作品评论列表中的某个作品 → 自动标记该作品的所有评论为已读
2. 点击私信列表中的某个会话 → 自动标记该会话的所有私信为已读
3. 标记已读后，未读数自动更新并同步到所有客户端

## 架构设计

### 数据流

```
IM 客户端                Master 服务器                 数据库
    │                         │                         │
    │  1. 点击会话              │                         │
    ├────────────────────────>│                         │
    │  monitor:mark_topic_as_read                       │
    │  或 monitor:mark_conversation_as_read             │
    │                         │                         │
    │                         │  2. 更新数据库          │
    │                         ├──────────────────────>│
    │                         │  UPDATE is_read = 1     │
    │                         │                         │
    │                         │  3. 更新内存            │
    │                         │  DataStore.isRead = true│
    │                         │                         │
    │  4. 推送更新的 topics    │                         │
    │<────────────────────────┤                         │
    │  monitor:topics          │                         │
    │  (包含新的未读数)        │                         │
```

## 技术实现

### 1. 服务端实现

#### 1.1 事件监听

在 [`im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) 中已经定义了事件监听器：

```javascript
// 按作品标记所有评论已读
socket.on('monitor:mark_topic_as_read', (data) => {
  this.handleMarkTopicAsRead(socket, data);
});

// 按会话标记所有私信已读
socket.on('monitor:mark_conversation_as_read', (data) => {
  this.handleMarkConversationAsRead(socket, data);
});
```

#### 1.2 标记评论已读

[`handleMarkTopicAsRead`](../packages/master/src/communication/im-websocket-server.js#L1035) 方法实现：

```javascript
handleMarkTopicAsRead(socket, data) {
  const { channelId, topicId } = data;
  const readAt = Math.floor(Date.now() / 1000);

  // 1. 更新数据库
  const count = this.cacheDAO.markTopicAsRead(topicId, channelId, readAt);

  // 2. 更新内存对象
  const accountData = this.dataStore.accounts.get(channelId);
  if (accountData) {
    for (const comment of accountData.data.comments.values()) {
      if (comment.contentId === topicId && !comment.isRead) {
        comment.isRead = true;
      }
    }
  }

  // 3. 响应客户端
  socket.emit('monitor:mark_topic_as_read_response', {
    success: true,
    count,
    topicId,
    channelId,
    read_at: readAt
  });

  // 4. 广播给所有客户端
  this.broadcastToMonitors('monitor:topic_read', {
    topicId,
    channelId,
    count,
    read_at: readAt
  });

  // ✅ 5. 重新推送更新后的 topics（包含新的未读数）
  const updatedTopics = this.getTopicsFromDataStore(channelId);
  this.broadcastToMonitors('monitor:topics', {
    channelId,
    topics: updatedTopics
  });
}
```

#### 1.3 标记私信已读

[`handleMarkConversationAsRead`](../packages/master/src/communication/im-websocket-server.js#L1094) 方法实现：

```javascript
handleMarkConversationAsRead(socket, data) {
  const { channelId, conversationId } = data;
  const readAt = Math.floor(Date.now() / 1000);

  // 1. 更新数据库
  const count = this.cacheDAO.markConversationAsRead(conversationId, channelId, readAt);

  // 2. 更新内存对象
  const accountData = this.dataStore.accounts.get(channelId);
  if (accountData) {
    for (const message of accountData.data.messages.values()) {
      if (message.conversationId === conversationId && !message.isRead) {
        message.isRead = true;
      }
    }
  }

  // 3. 响应客户端
  socket.emit('monitor:mark_conversation_as_read_response', {
    success: true,
    count,
    conversationId,
    channelId,
    read_at: readAt
  });

  // 4. 广播给所有客户端
  this.broadcastToMonitors('monitor:conversation_read', {
    conversationId,
    channelId,
    count,
    read_at: readAt
  });

  // ✅ 5. 重新推送更新后的 topics（包含新的未读数）
  const updatedTopics = this.getTopicsFromDataStore(channelId);
  this.broadcastToMonitors('monitor:topics', {
    channelId,
    topics: updatedTopics
  });
}
```

### 2. 客户端实现

#### 2.1 标记评论已读

在 [`MonitorPage.tsx`](../packages/crm-pc-im/src/pages/MonitorPage.tsx#L374) 中修改 `handleEnterTopicFromCommentList` 函数：

```typescript
const handleEnterTopicFromCommentList = (topicId: string) => {
  console.log('[从未读列表进入] topicId:', topicId)
  dispatch(selectTopic(topicId))
  websocketService.emit('monitor:request_messages', { topicId })
  setShowCommentList(false) // 切换到对话视图

  // ✅ 标记该作品的所有评论为已读
  if (selectedChannelId) {
    console.log('[标记已读] 作品评论 topicId:', topicId, 'channelId:', selectedChannelId)
    websocketService.emit('monitor:mark_topic_as_read', {
      channelId: selectedChannelId,
      topicId: topicId
    })
  }
}
```

#### 2.2 标记私信已读

在 [`MonitorPage.tsx`](../packages/crm-pc-im/src/pages/MonitorPage.tsx#L397) 中修改 `handleEnterTopicFromPrivateList` 函数：

```typescript
const handleEnterTopicFromPrivateList = (topicId: string) => {
  console.log('[从私信列表进入] topicId:', topicId)
  dispatch(selectTopic(topicId))
  websocketService.emit('monitor:request_messages', { topicId })
  setShowPrivateList(false) // 切换到对话视图

  // ✅ 标记该会话的所有私信为已读
  if (selectedChannelId) {
    console.log('[标记已读] 私信会话 conversationId:', topicId, 'channelId:', selectedChannelId)
    websocketService.emit('monitor:mark_conversation_as_read', {
      channelId: selectedChannelId,
      conversationId: topicId
    })
  }
}
```

## 数据库操作

### CacheDAO 方法

在 [`cache-dao.js`](../packages/master/src/persistence/cache-dao.js) 中已经实现了相关方法：

#### 标记作品评论已读

```javascript
markTopicAsRead(topicId, accountId, readAt) {
  const stmt = this.db.prepare(`
    UPDATE cache_comments
    SET is_read = 1, read_at = ?
    WHERE account_id = ? AND content_id = ? AND is_read = 0
  `);
  const result = stmt.run(readAt, accountId, topicId);
  return result.changes;
}
```

#### 标记会话私信已读

```javascript
markConversationAsRead(conversationId, accountId, readAt) {
  const stmt = this.db.prepare(`
    UPDATE cache_messages
    SET is_read = 1, read_at = ?
    WHERE account_id = ? AND conversation_id = ? AND is_read = 0
  `);
  const result = stmt.run(readAt, accountId, conversationId);
  return result.changes;
}
```

## 测试

### 测试脚本

创建了测试脚本 [`test-mark-as-read.js`](../tests/test-mark-as-read.js) 用于验证功能：

```bash
node tests/test-mark-as-read.js
```

### 测试步骤

1. 连接到 Master IM WebSocket 服务
2. 注册监控客户端
3. 获取频道和 topics 列表
4. 找到有未读的作品和私信
5. 测试标记作品评论已读
6. 测试标记私信会话已读
7. 验证未读数是否正确更新

### 预期结果

- 点击作品后，该作品的未读数变为 0
- 点击私信会话后，该会话的未读数变为 0
- 左侧账户徽章的未读数自动减少
- Tab 标签页的未读数自动减少
- 所有客户端同步更新

## 关键技术点

### 1. 双重更新机制

```javascript
// 1. 更新数据库（持久化）
const count = this.cacheDAO.markTopicAsRead(topicId, channelId, readAt);

// 2. 更新内存（DataStore）
const accountData = this.dataStore.accounts.get(channelId);
for (const comment of accountData.data.comments.values()) {
  if (comment.contentId === topicId) {
    comment.isRead = true;  // ✅ 同步更新内存
  }
}
```

### 2. 实时推送

```javascript
// 重新推送更新后的 topics（包含新的未读数）
const updatedTopics = this.getTopicsFromDataStore(channelId);
this.broadcastToMonitors('monitor:topics', {
  channelId,
  topics: updatedTopics
});
```

### 3. 客户端状态管理

客户端通过 Redux 的 `setTopics` action 接收更新：

```typescript
socket.on('monitor:topics', (data) => {
  dispatch(setTopics({ channelId: data.channelId, topics: data.topics }))
})
```

由于之前已经修改为**直接替换**而非合并，服务端推送的新 topics（包含更新后的未读数）会完全替换客户端的旧数据。

## 功能特点

### ✅ 已实现

1. **自动标记已读**: 点击会话自动触发标记已读
2. **数据库持久化**: 已读状态保存到 `cache_comments` 和 `cache_messages` 表
3. **内存同步更新**: DataStore 中的对象同步更新 `isRead` 字段
4. **实时推送**: 标记已读后自动推送更新的 topics
5. **多客户端同步**: 所有连接的客户端都会收到更新
6. **未读数统计**: 基于 `isRead` 字段统一计算

### ⏳ 未来扩展

1. **批量标记已读**: 一次标记多个会话已读
2. **全部标记已读**: 一键标记所有消息已读
3. **已读回执**: 显示消息的已读时间
4. **离线同步**: Worker 重启后加载已读状态

## 相关文件

### 服务端

- [`im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) - WebSocket 事件处理
- [`cache-dao.js`](../packages/master/src/persistence/cache-dao.js) - 数据库操作

### 客户端

- [`MonitorPage.tsx`](../packages/crm-pc-im/src/pages/MonitorPage.tsx) - 监控页面
- [`websocket.ts`](../packages/crm-pc-im/src/services/websocket.ts) - WebSocket 服务

### 测试

- [`test-mark-as-read.js`](../tests/test-mark-as-read.js) - 功能测试脚本

## 总结

标记已读功能已完整实现，包括：

1. ✅ 服务端事件处理和数据更新
2. ✅ 客户端自动发送标记已读请求
3. ✅ 实时推送更新后的 topics
4. ✅ 多客户端同步
5. ✅ 测试脚本验证

用户现在可以通过点击会话自动标记消息已读，未读数会实时更新。
