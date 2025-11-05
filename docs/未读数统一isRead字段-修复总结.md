# 未读数统一 isRead 字段 - 修复总结

## 问题描述

Tab 未读数跳动的根本原因是**未读数计算使用了两套不同的字段标准**：
- 一套使用 `isHandled` 字段
- 另一套使用 `isRead` 字段

导致同一条消息在不同场景下被判定为"已读"或"未读"，造成未读数在两个值之间跳动。

## 修复方案

**统一为 `isRead` 字段**，删除所有 `isHandled` 相关代码。

## 修改文件清单

### 1. 服务端 (Master)

**文件**: `packages/master/src/communication/im-websocket-server.js`

**修改 1**: Line 200-207 - 删除回复消息的 `isHandled` 字段
```javascript
// 修改前
{
  content,
  type: messageType,
  messageCategory: messageCategory || 'comment',
  timestamp: Date.now(),
  serverTimestamp: Date.now(),
  replyToId,
  replyToContent,
  isHandled: false  // ❌ 删除此行
}

// 修改后
{
  content,
  type: messageType,
  messageCategory: messageCategory || 'comment',
  timestamp: Date.now(),
  serverTimestamp: Date.now(),
  replyToId,
  replyToContent
}
```

**修改 2**: Line 1297-1304 - 统一使用 `isRead` 计算未读评论数
```javascript
// 修改前
calculateUnreadComments(dataObj) {
  const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);
  return commentsList.filter(c => c.isHandled === undefined || !c.isHandled).length;  // ❌ 使用 isHandled
}

// 修改后
calculateUnreadComments(dataObj) {
  const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);
  return commentsList.filter(c => !c.isRead).length;  // ✅ 改为使用 isRead
}
```

### 2. Worker 端

**文件**: `packages/worker/src/platforms/base/data-models.js`

**修改 1**: Line 163-167 - Message 模型添加 `isRead` 字段
```javascript
// 消息状态
this.direction = 'incoming';       // 方向：incoming/outgoing
this.status = 'delivered';         // 状态：sending/sent/delivered/read/failed
this.isRecalled = false;           // 是否已撤回
this.isRead = false;               // ✅ 新增：是否已读（用于未读数统计）
```

**修改 2**: Line 253-257 - Comment 模型添加 `isRead` 字段
```javascript
// 状态
this.isPinned = false;             // 是否置顶
this.isAuthorReply = false;        // 是否作者回复
this.isLiked = false;              // 当前账户是否点赞
this.isRead = false;               // ✅ 新增：是否已读（用于未读数统计）
```

## 数据流说明

### 完整的 isRead 数据流

```
1. Worker 爬取数据
   ↓
   创建 Comment/Message 对象
   └─ 初始值：isRead = false

2. Worker 从 cache 数据库加载已读状态
   ↓
   覆盖内存对象的 isRead 字段
   └─ 如果 cache_comments.is_read = 1，则 comment.isRead = true

3. Worker 推送数据到 Master DataStore
   ↓
   DataStore 保存内存对象（包含 isRead 字段）

4. Master 计算未读数
   ↓
   getTopicsFromDataStore():
   └─ commentsList.filter(c => !c.isRead).length

   calculateUnreadComments():
   └─ commentsList.filter(c => !c.isRead).length  ✅ 统一

5. IM 客户端接收 topics
   ↓
   显示未读数：
   └─ topic.unreadCount（服务端已计算好）

6. 用户标记已读
   ↓
   IM 客户端 → emit('monitor:mark_as_read', { type, id, channelId })
   ↓
   Master 处理：
   ├─ cacheDAO.markCommentAsRead(id, readAt)  ← 更新数据库
   └─ comment.isRead = true  ← 更新 DataStore 内存对象
   ↓
   下次计算未读数时生效
```

## 关键统一点

### 1. 数据模型统一

所有数据模型（Comment, Message, Notification）都有 `isRead` 字段，初始值为 `false`。

### 2. 计算逻辑统一

所有未读数计算都使用：
```javascript
list.filter(item => !item.isRead).length
```

### 3. 标记已读统一

客户端和服务端都使用 `monitor:mark_as_read` 事件，更新：
- 数据库的 `is_read` 字段（持久化）
- DataStore 内存对象的 `isRead` 字段（实时计算）

### 4. 字段命名统一

- **JavaScript/TypeScript**: `isRead` (驼峰命名)
- **数据库**: `is_read` (下划线命名)

## 验证方法

### 1. 重启服务

```bash
# 重启 Master
cd packages/master
npm start

# 重启 Worker
cd packages/worker
npm start
```

### 2. 运行验证脚本

```bash
cd tests
node debug-topic-unread-calculation.js
```

**预期结果**：
- 10 次请求都返回相同的未读数
- 评论未读数稳定
- 私信未读数稳定

### 3. 测试标记已读

1. 打开 IM 客户端
2. 点击某个会话
3. 观察未读数
4. （未来）点击某条消息标记已读
5. 观察未读数减少

## 后续工作

### 1. 实现客户端标记已读功能

**文件**: `packages/crm-pc-im/src/pages/MonitorPage.tsx`

```typescript
// 点击消息时标记已读
const handleMessageClick = (message: Message) => {
  websocketService.emit('monitor:mark_as_read', {
    type: message.messageCategory === 'private' ? 'message' : 'comment',
    id: message.id,
    channelId: selectedChannelId
  });
};

// 进入会话时标记整个会话已读
const handleEnterTopic = (topicId: string) => {
  if (selectedTopic?.isPrivate) {
    // 私信会话
    websocketService.emit('monitor:mark_conversation_as_read', {
      channelId: selectedChannelId,
      conversationId: topicId
    });
  } else {
    // 评论作品
    websocketService.emit('monitor:mark_topic_as_read', {
      channelId: selectedChannelId,
      topicId: topicId
    });
  }
};
```

### 2. Worker 从 cache 数据库加载 isRead 状态

**需要实现的逻辑**：

```javascript
// Worker 启动时或定期同步
async function syncReadStatusFromCache(accountId) {
  // 1. 从 cache 数据库读取已读状态
  const readComments = await cacheDB.query(`
    SELECT message_id FROM cache_comments
    WHERE account_id = ? AND is_read = 1
  `, [accountId]);

  const readMessages = await cacheDB.query(`
    SELECT message_id FROM cache_direct_messages
    WHERE account_id = ? AND is_read = 1
  `, [accountId]);

  // 2. 更新内存对象
  readComments.forEach(row => {
    const comment = dataManager.comments.get(row.message_id);
    if (comment) {
      comment.isRead = true;
    }
  });

  readMessages.forEach(row => {
    const message = dataManager.messages.get(row.message_id);
    if (message) {
      message.isRead = true;
    }
  });

  // 3. 推送更新到 Master
  dataPusher.pushIncremental(accountId);
}
```

### 3. 数据库迁移（如果需要）

如果 cache 表中存在 `is_handled` 字段，需要迁移：

```sql
-- 将 is_handled 的值复制到 is_read
UPDATE cache_comments SET is_read = is_handled WHERE is_handled IS NOT NULL;

-- 删除 is_handled 列（可选）
-- ALTER TABLE cache_comments DROP COLUMN is_handled;
```

## 性能考虑

### 1. 内存占用

每个 Comment/Message 对象新增一个布尔字段 `isRead`，内存占用增加约 1 byte/对象。

**评估**：
- 10,000 条消息 ≈ 10 KB
- 100,000 条消息 ≈ 100 KB
- 影响可忽略

### 2. 计算性能

未读数计算使用 `filter()`，时间复杂度 O(n)。

**优化建议**（未来）：
- 在 DataStore 中缓存未读数
- 只在 `isRead` 状态变化时重新计算
- 使用增量更新而非全量计算

## 总结

### 问题本质

**字段不统一**导致的未读数计算不一致。

### 解决方案

**统一使用 `isRead` 字段**，删除所有 `isHandled` 相关代码。

### 修改范围

- ✅ Master 服务端：`im-websocket-server.js`（2 处修改）
- ✅ Worker 数据模型：`data-models.js`（2 处新增）
- ⏳ Worker 数据加载：需要实现从 cache 加载 `isRead` 状态
- ⏳ 客户端标记已读：需要实现 UI 交互

### 验证状态

- ✅ 服务端未读数计算逻辑统一
- ✅ 数据模型字段统一
- ⏳ 需要测试端到端的标记已读功能

## 版本信息

- **修复日期**：2025-11-05
- **Master 版本**：1.0.0
- **Worker 版本**：1.0.0
- **影响范围**：未读数计算、标记已读功能
- **破坏性变更**：无（向后兼容）
