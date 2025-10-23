# Master 需要实现的功能清单

**目标**: crm-pc-im 客户端要拥有原版 IM 全部功能，Master 需要实现什么

**分析基础**: 基于 crm-pc-im 的实际需求反推

---

## 快速总结

| 优先级 | 数量 | 功能分类 | 工作量 |
|--------|------|---------|--------|
| 🔴 P1 必须 | 7 个 | 客户端管理 + 账户/作品/消息查询 + 推送 | 40h |
| 🟠 P2 重要 | 3 个 | 用户认证 + 状态推送 + 消息收发 | 20h |
| 🟡 P3 可选 | 7 个 | 文件/图片 + 编辑删除 + 搜索 + API 接口 | 30h+ |

**总工作量**: 90h+ (约 2-3 周)

---

## 🔴 P1 必须实现 (40h) - 核心功能

### 1. 客户端连接管理 (5h)

**现状**: ⚠️ 部分实现
- ✅ client:register 已实现
- ✅ client:heartbeat 已实现
- ✅ client:notification:ack 已实现

**需要完善**:
```
1. client:register 返回格式
   → { clientId, sessionId, timestamp }

2. client:register:success 推送
   → 返回给客户端，确认注册成功

3. 30 秒超时判断
   → 如果 30 秒内没收到 client:heartbeat，标记客户端离线

4. client:notification:ack 确认
   → 已实现
```

**涉及文件**:
- `packages/master/src/communication/socket-server.js`
- `packages/master/src/communication/session-manager.js`

---

### 2. Monitor 账户列表查询和推送 (8h)

**现状**: ❌ 不存在

**需要实现**:

**事件**: `monitor:request_channels`

**请求**:
```javascript
// crm-pc-im 发送
socket.emit('monitor:request_channels', {
  clientId: "device-xxx",
  timestamp: Date.now()
});
```

**响应**: `monitor:channels`
```javascript
{
  channels: [
    {
      id: "account-123",
      name: "抖音账户A",
      avatar: "https://...",
      platform: "douyin",
      enabled: true,
      isPinned: false,
      unreadCount: 5,
      lastMessage: "最后一条消息内容",
      lastMessageTime: 1697980123000,  // 毫秒
      topicCount: 10,
      isFlashing: false
    }
  ],
  timestamp: 1697980123000
}
```

**实时推送**: `monitor:channels`
- 当有新消息时，自动推送更新
- 包含最新的 unreadCount 和 lastMessage

**涉及文件**:
- `packages/master/src/communication/socket-server.js` (新增事件处理)
- `packages/master/src/database/accounts-dao.js` (新增查询方法)

---

### 3. Monitor 作品列表查询和推送 (8h)

**现状**: ❌ 不存在

**需要实现**:

**事件**: `monitor:request_topics`

**请求**:
```javascript
socket.emit('monitor:request_topics', {
  channelId: "account-123",
  clientId: "device-xxx",
  timestamp: Date.now()
});
```

**响应**: `monitor:topics`
```javascript
{
  channelId: "account-123",
  topics: [
    {
      id: "comment-456",
      title: "作品标题",
      description: "作品描述",
      createdTime: 1697900000000,
      messageCount: 10,
      unreadCount: 3,
      lastMessage: "最后一条消息",
      lastMessageTime: 1697980000000,
      isPinned: false
    }
  ],
  timestamp: 1697980123000
}
```

**实时推送**: `monitor:topics`
- 当有新评论/私信时推送更新
- 包含最新的 unreadCount 和 messageCount

**涉及文件**:
- `packages/master/src/communication/socket-server.js` (新增事件处理)
- `packages/master/src/database/comments-dao.js` (新增查询方法)
- `packages/master/src/database/direct-messages-dao.js` (新增查询方法)

---

### 4. Monitor 消息历史查询 (8h)

**现状**: ⚠️ 部分实现

**需要实现**:

**事件**: `monitor:request_messages`

**请求**:
```javascript
socket.emit('monitor:request_messages', {
  topicId: "comment-456",  // 作品/对话 ID
  accountId: "account-123",
  limit: 50,
  offset: 0,
  clientId: "device-xxx",
  timestamp: Date.now()
});
```

**响应**: `monitor:messages`
```javascript
{
  topicId: "comment-456",
  messages: [
    {
      id: "msg-001",
      topicId: "comment-456",
      accountId: "account-123",
      fromId: "user-456",
      fromName: "张三",
      content: "消息内容",
      type: "text",  // text, file, image
      timestamp: 1697980000000,  // 毫秒
      replyToId: "msg-000",  // 如果是回复
      replyToContent: "被回复的消息内容",
      fileUrl: null,  // 如果是文件
      fileName: null
    }
  ],
  total: 100,  // 总消息数
  hasMore: true,
  timestamp: 1697980123000
}
```

**涉及文件**:
- `packages/master/src/communication/socket-server.js` (增强事件处理)
- `packages/master/src/database/comments-dao.js` (新增查询方法)
- `packages/master/src/database/direct-messages-dao.js` (新增查询方法)

---

### 5. 新消息实时推送 (6h)

**现状**: ⚠️ 部分实现

**需要实现**:

**事件**: `channel:message` (推送新消息)

**推送格式**:
```javascript
// 监听者收到新消息时，自动推送
socket.emit('channel:message', {
  id: "msg-001",
  topicId: "comment-456",
  accountId: "account-123",
  fromId: "user-456",
  fromName: "张三",
  content: "新消息内容",
  type: "text",
  timestamp: 1697980123000,
  replyToId: null
});
```

**触发时机**:
- 有新评论时推送
- 有新私信时推送
- 有新回复时推送

**需要修改**:
- `packages/worker/src/platforms/douyin/platform.js`
  - 检测到新消息时，发送到 Master
- `packages/master/src/communication/socket-server.js`
  - 接收 Worker 的消息，转推给所有监听客户端

---

### 6. Monitor 消息回复处理 (5h)

**现状**: ❌ 不存在

**需要实现**:

**事件**: `monitor:reply`

**请求**:
```javascript
socket.emit('monitor:reply', {
  accountId: "account-123",
  topicId: "comment-456",
  content: "我的回复内容",
  replyToId: "msg-000",  // 如果是嵌套回复
  clientId: "device-xxx",
  timestamp: Date.now()
});
```

**处理流程**:
1. Master 接收回复请求
2. 分配给对应 Worker
3. Worker 通过浏览器自动化发送回复
4. 返回结果给客户端

**响应**:
```javascript
// 成功
{ success: true, messageId: "msg-new-001", timestamp: ... }

// 失败
{ success: false, error: "登录已过期", timestamp: ... }
```

**涉及文件**:
- `packages/master/src/communication/socket-server.js` (新增事件处理)
- `packages/master/src/communication/task-dispatcher.js` (分配任务给 Worker)

---

## 🟠 P2 重要 (20h) - 增强功能

### 7. 用户认证 (6h)

**现状**: ❌ 不存在

**需要实现**:

**事件**: `user:login`

**请求**:
```javascript
socket.emit('user:login', {
  userId: "user-123",
  name: "用户名",
  avatar: "https://...",
  status: "online"
});
```

**响应**: `user:login:success`
```javascript
{
  userId: "user-123",
  sessionId: "session-xxx",
  timestamp: 1697980123000
}
```

**相关**:
- 记录用户登入时间
- 更新用户在线状态

---

### 8. 用户状态推送 (4h)

**现状**: ❌ 不存在

**需要实现**:

**事件**: `user:status_change`

**推送格式**:
```javascript
socket.emit('user:status_change', {
  userId: "user-123",
  status: "online|offline|away",
  timestamp: 1697980123000
});
```

**触发时机**:
- 用户登入
- 用户登出
- 用户离线

---

### 9. 消息收发管理 (10h)

**现状**: ⚠️ 部分实现

**需要完善**:

**事件**: `message`

**发送**:
```javascript
socket.emit('message', {
  type: "user_message|group_message",
  fromId: "user-123",
  toId: "user-456",  // 或 groupId
  content: "消息内容",
  timestamp: Date.now()
});
```

**接收**:
```javascript
socket.on('message', (msg) => {
  // { fromId, toId, content, timestamp }
});
```

**需要**:
- 消息持久化
- 消息路由
- 离线消息存储
- 消息确认

---

## 🟡 P3 可选 (30h+) - 高级功能

### 10. 文件和图片消息支持 (8h)

**需要实现**:

**消息类型**:
```javascript
{
  type: "file",
  fileUrl: "https://...",
  fileName: "document.pdf",
  fileSize: 1024000
}

{
  type: "image",
  imageUrl: "https://...",
  thumbUrl: "https://...(缩略图)",
  width: 800,
  height: 600
}
```

**需要**:
- 文件上传接口: `POST /api/v1/files/upload`
- 文件下载接口: `GET /api/v1/files/:fileId`
- 图片缩略图生成
- 病毒扫描（可选）

---

### 11. 消息编辑和删除 (8h)

**需要实现**:

**编辑**:
```javascript
socket.emit('message:edit', {
  messageId: "msg-001",
  newContent: "编辑后的内容",
  timestamp: Date.now()
});
```

**删除**:
```javascript
socket.emit('message:delete', {
  messageId: "msg-001",
  timestamp: Date.now()
});
```

**需要**:
- 消息编辑历史表
- 消息软删除（保留审计）
- 实时推送编辑/删除事件

---

### 12. 已读状态管理 (4h)

**需要实现**:

```javascript
socket.emit('message:mark_as_read', {
  messageIds: ["msg-001", "msg-002"],
  timestamp: Date.now()
});
```

**需要**:
- 批量标记已读
- 未读计数统计
- 实时推送未读变化

---

### 13. 消息搜索 (6h)

**HTTP API**:
```javascript
GET /api/v1/messages/search?q=keyword&limit=50
```

**返回**:
```javascript
{
  matches: [
    { id, content, timestamp, highlight: "...关键词..." }
  ],
  total: 123
}
```

**需要**:
- FTS5 全文索引
- 搜索优化

---

### 14. 会话管理接口 (2h)

**HTTP API**:
```javascript
GET /api/v1/conversations  // 获取所有会话
GET /api/v1/conversations/:id  // 获取单个会话
POST /api/v1/conversations/search?q=keyword  // 搜索会话
```

---

### 15. 用户信息接口 (2h)

**HTTP API**:
```javascript
GET /api/v1/users/:userId  // 获取用户信息
GET /api/v1/friends  // 获取好友列表
POST /api/v1/users/:userId/block  // 拉黑用户
```

---

## 现在的实现状态

### ✅ 已实现 (4 个)
1. ✅ Client 连接管理 (基础)
2. ✅ Notification ACK
3. ✅ Worker 消息推送 (部分)
4. ✅ Message 接收 (基础)

### ⚠️ 部分实现 (3 个)
1. ⚠️ Client 连接 (需完善)
2. ⚠️ Message 推送 (需完善)
3. ⚠️ Message 历史 (需完善)

### ❌ 未实现 (8 个)
1. ❌ Monitor 账户查询
2. ❌ Monitor 作品查询
3. ❌ Monitor 消息推送
4. ❌ Monitor 消息回复
5. ❌ 用户认证
6. ❌ 用户状态推送
7. ❌ 文件/图片支持
8. ❌ 消息编辑/删除

---

## 建议实施顺序

### 第 1 周 (P1 必须, 40h)

```
Day 1: Client 连接管理完善 (5h)
Day 2: Monitor 账户查询 + 推送 (8h)
Day 3: Monitor 作品查询 + 推送 (8h)
Day 4: Monitor 消息历史查询 (8h)
Day 5: 新消息实时推送 (6h)
Day 6: Monitor 消息回复 (5h)
```

### 第 2 周 (P2 重要, 20h)

```
Day 1-2: 用户认证 + 状态推送 (10h)
Day 3-4: 消息收发管理完善 (10h)
```

### 之后 (P3 可选, 30h+)

```
按需选择实现：文件/图片、编辑删除、搜索等
```

---

## 数据库需要的修改

### 新增表

```sql
-- 用户表（如果没有）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT,
  avatar TEXT,
  platform TEXT,
  status TEXT,  -- online, offline, away
  last_login INTEGER,
  created_at INTEGER
);

-- 会话表（如果没有）
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id_1 TEXT,
  user_id_2 TEXT,
  last_message TEXT,
  last_message_time INTEGER,
  created_at INTEGER
);

-- 文件存储表
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  url TEXT,
  filename TEXT,
  size INTEGER,
  mime_type TEXT,
  uploaded_at INTEGER
);
```

### 修改现有表

```sql
-- direct_messages 表增加
ALTER TABLE direct_messages ADD COLUMN file_url TEXT;
ALTER TABLE direct_messages ADD COLUMN file_name TEXT;
ALTER TABLE direct_messages ADD COLUMN edited_at INTEGER;
ALTER TABLE direct_messages ADD COLUMN deleted_at INTEGER;

-- comments 表增加
ALTER TABLE comments ADD COLUMN file_url TEXT;
ALTER TABLE comments ADD COLUMN file_name TEXT;
```

---

## 总结

| 项目 | 数值 |
|------|------|
| P1 必须功能 | 6 个 (已实现 0 个) |
| P1 工作量 | 40 小时 |
| P2 重要功能 | 3 个 (已实现 0 个) |
| P2 工作量 | 20 小时 |
| P3 可选功能 | 6 个 |
| P3 工作量 | 30+ 小时 |
| **总工作量** | **90+ 小时 (2-3 周)** |

**关键要点**:
- P1 必须完整实现，否则 crm-pc-im 无法正常工作
- P2 推荐尽快实现，提升用户体验
- P3 可根据时间选择实现

**建议**: 立即开始 P1，预计 1 周内完成，即可支持 crm-pc-im 的核心功能。
