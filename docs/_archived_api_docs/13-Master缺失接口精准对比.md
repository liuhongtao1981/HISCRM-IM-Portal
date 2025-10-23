# Master 缺失接口精准对比

**基础**: 基于 docs/12 概念对照，逐一比对缺口

**格式**: 原版 IM 接口 → Master 是否有对应实现

---

## 快速统计

| 接口分类 | 原版 IM 数量 | Master 已有 | Master 缺失 | 完整度 |
|---------|-----------|-----------|-----------|--------|
| 账户管理 | 6 | 6 | 0 | ✅ 100% |
| 会话查询 | 4 | 1 | 3 | ⚠️ 25% |
| 消息查询 | 6 | 2 | 4 | ⚠️ 33% |
| 消息操作 | 5 | 1 | 4 | ⚠️ 20% |
| 用户管理 | 3 | 0 | 3 | ❌ 0% |
| **总计** | **24** | **10** | **14** | **42%** |

---

## 一、账户管理接口 (6 个) ✅ 100% 完整

### 1. 获取账户列表 ✅

**原版 IM**: `GET /accounts` 或 `POST /v1/message/get_by_user_init`

**Master**: ✅ **已有**
- 接口: `GET /api/v1/accounts`
- 字段: id, account_name, avatar, login_status
- 返回: 账户列表

**现状**: 完全匹配，可直接用 ✅

---

### 2. 获取单个账户 ✅

**原版 IM**: `GET /accounts/{userId}`

**Master**: ✅ **已有**
- 接口: `GET /api/v1/accounts/:id`
- 返回: 单个账户详情

**现状**: 完全匹配 ✅

---

### 3. 创建账户 ✅

**原版 IM**: `POST /accounts`

**Master**: ✅ **已有**
- 接口: `POST /api/v1/accounts`
- 创建新账户

**现状**: 完全匹配 ✅

---

### 4. 更新账户 ✅

**原版 IM**: `PATCH /accounts/{userId}`

**Master**: ✅ **已有**
- 接口: `PATCH /api/v1/accounts/:id`
- 更新账户信息

**现状**: 完全匹配 ✅

---

### 5. 删除账户 ✅

**原版 IM**: `DELETE /accounts/{userId}`

**Master**: ✅ **已有**
- 接口: `DELETE /api/v1/accounts/:id`
- 删除账户

**现状**: 完全匹配 ✅

---

### 6. 获取账户状态 ✅

**原版 IM**: `GET /accounts/status`

**Master**: ✅ **已有**
- 接口: `GET /api/v1/accounts/status/all`
- 返回: 所有账户的状态

**现状**: 完全匹配 ✅

---

## 二、会话查询接口 (4 个) ⚠️ 25% 完整

### 7. 获取会话列表 ⚠️

**原版 IM**: `GET /conversations` 或 `POST /v1/im/conversation/list`

**请求**:
```json
{
  "cursor": 0,
  "count": 100,
  "sort_by": "last_message_time"
}
```

**返回**:
```json
{
  "conversations": [
    {
      "conversation_id": "topic_123",  // 视频评论或私信对话
      "title": "视频标题",             // 如果是视频评论
      "other_user": {...},             // 如果是私信
      "unread_count": 5,
      "last_message": "...",
      "last_message_time": 1697980000
    }
  ],
  "total": 150
}
```

**Master 现状**: ⚠️ **部分有**
- 接口: `GET /api/v1/conversations` (存在但功能不完整)
- 问题: 无 cursor 分页、无排序、无搜索

**需要完善**:
```javascript
// 修改现有接口支持:
GET /api/v1/conversations?
  cursor=0&
  count=100&
  sort_by=last_message_time&
  search=keyword

// 需要查询:
// 1. 视频评论话题: SELECT FROM comments
// 2. 私信对话: SELECT FROM conversations
// 并合并返回
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (修改)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/conversations-dao.js` (新增方法)

**工作量**: 6h

---

### 8. 获取单个会话详情 ❌

**原版 IM**: `GET /conversations/{conversationId}` 或 `POST /v1/im/query_conversation`

**请求**:
```json
{
  "conversation_id": "topic_123",
  "include_messages": true,
  "message_count": 50
}
```

**返回**:
```json
{
  "conversation": {
    "conversation_id": "topic_123",
    "title": "视频标题",
    "unread_count": 5,
    "message_count": 50,
    "messages": [
      {
        "message_id": "msg_001",
        "from_user": "user_456",
        "from_name": "李四",
        "content": "回复内容",
        "timestamp": 1697980000,
        "reply_to_message_id": "msg_000"
      }
    ]
  }
}
```

**Master 现状**: ❌ **无**
- 接口: 不存在

**需要实现**:
```javascript
GET /api/v1/conversations/:id?include_messages=true&message_count=50

// 查询:
// 1. comments 表获取视频信息
// 2. comments (reply) 或 direct_messages 获取消息
// 3. 合并返回
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/direct-messages-dao.js` (新增方法)

**工作量**: 8h

---

### 9. 搜索会话 ❌

**原版 IM**: `GET /conversations/search?q=keyword`

**请求**:
```json
{
  "query": "用户名或视频标题",
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "conversations": [
    {
      "conversation_id": "...",
      "title": "...",
      "relevance": 0.95
    }
  ],
  "total": 5
}
```

**Master 现状**: ❌ **无**
- 接口: 不存在

**需要实现**:
```javascript
GET /api/v1/conversations/search?q=keyword&cursor=0&count=50

// 搜索:
// 1. comments.content 搜索视频标题
// 2. conversations.other_user_name 搜索私信用户
// 3. 返回合并结果
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/conversations-dao.js` (新增方法)

**工作量**: 6h

---

### 10. 会话置顶/静音 ❌

**原版 IM**: `PATCH /conversations/{conversationId}/pin` + `PATCH /conversations/{conversationId}/mute`

**请求**:
```json
{
  "pin": true,
  "mute_until": 1697980000
}
```

**返回**:
```json
{
  "success": true
}
```

**Master 现状**: ❌ **无**
- 接口: 不存在

**需要实现**:
```javascript
PATCH /api/v1/comments/:id/pin
PATCH /api/v1/conversations/:id/pin
PATCH /api/v1/comments/:id/mute
PATCH /api/v1/conversations/:id/mute

// 修改表:
// ALTER TABLE comments ADD is_pinned, mute_until
// ALTER TABLE conversations ADD is_pinned, mute_until
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/database/init.js` (修改表)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/conversations-dao.js` (新增方法)

**工作量**: 4h

---

## 三、消息查询接口 (6 个) ⚠️ 33% 完整

### 11. 获取消息历史 ⚠️

**原版 IM**: `POST /v1/im/message/history`

**请求**:
```json
{
  "conversation_id": "topic_123",
  "cursor": 0,
  "count": 50,
  "direction": "backward"
}
```

**返回**:
```json
{
  "messages": [
    {
      "message_id": "msg_001",
      "conversation_id": "topic_123",
      "from_user": "user_456",
      "from_name": "李四",
      "content": "回复内容",
      "timestamp": 1697980000,
      "type": "text",
      "reply_to_message_id": "msg_000"
    }
  ],
  "cursor": "next_cursor",
  "has_more": true
}
```

**Master 现状**: ⚠️ **部分有**
- 接口: `GET /api/v1/direct-messages?conversation_id=xxx&limit=50&offset=0`
- 问题:
  - 使用 offset/limit，不是 cursor
  - 无 direction 参数
  - 无 has_more 返回

**需要完善**:
```javascript
GET /api/v1/messages/history?
  conversation_id=topic_123&
  cursor=0&
  count=50&
  direction=backward

// 返回:
{
  "messages": [...],
  "cursor": "next_cursor",
  "has_more": true
}

// 需要查询:
// 1. comments (reply) 如果是视频评论
// 2. direct_messages 如果是私信
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (修改)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/direct-messages-dao.js` (新增方法)

**工作量**: 6h

---

### 12. 获取单条消息 ✅

**原版 IM**: `GET /messages/{messageId}`

**Master 现状**: ✅ **已有**
- 接口: `GET /api/v1/messages/:id`

**现状**: 完全匹配 ✅

---

### 13. 按类型查询消息 ❌

**原版 IM**: `GET /messages?type=image&conversation_id=topic_123`

**请求**:
```json
{
  "conversation_id": "topic_123",
  "message_type": "text|image|file|video",
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "messages": [...]
}
```

**Master 现状**: ❌ **无**
- 缺少按 message_type 查询的接口

**需要实现**:
```javascript
GET /api/v1/messages?
  conversation_id=topic_123&
  message_type=image&
  cursor=0&
  count=50

// 查询:
// SELECT FROM comments/direct_messages WHERE type = 'image'
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (新增参数)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/direct-messages-dao.js` (新增方法)

**工作量**: 4h

---

### 14. 搜索消息 ❌

**原版 IM**: `GET /messages/search?q=keyword`

**请求**:
```json
{
  "query": "关键词",
  "conversation_id": "topic_123",
  "start_date": "2025-10-01",
  "end_date": "2025-10-22",
  "message_type": "text",
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "matches": [
    {
      "message_id": "msg_001",
      "content": "包含<mark>关键词</mark>的内容",
      "highlight": "...关键词..."
    }
  ],
  "total": 234
}
```

**Master 现状**: ❌ **无**
- 无全文搜索功能

**需要实现**:
```javascript
GET /api/v1/messages/search?
  q=keyword&
  conversation_id=topic_123&
  start_date=2025-10-01&
  end_date=2025-10-22&
  message_type=text&
  cursor=0&
  count=50

// 实现:
// 1. 创建 FTS5 虚拟表
// 2. 支持复杂查询 (AND/OR)
```

**涉及文件**:
- `packages/master/src/api/routes/search.js` (新建)
- `packages/master/src/database/init.js` (创建 FTS5)
- `packages/master/src/database/comments-dao.js` (新增搜索)
- `packages/master/src/database/direct-messages-dao.js` (新增搜索)

**工作量**: 8h

---

### 15. 消息统计 ❌

**原版 IM**: `GET /messages/stats`

**请求**:
```json
{
  "conversation_id": "topic_123"
}
```

**返回**:
```json
{
  "total_messages": 100,
  "unread_count": 5,
  "type_distribution": {
    "text": 80,
    "image": 15,
    "file": 5
  }
}
```

**Master 现状**: ❌ **无**
- 无消息统计接口

**需要实现**:
```javascript
GET /api/v1/messages/stats?conversation_id=topic_123

// 返回:
{
  "total_messages": 100,
  "unread_count": 5,
  "type_distribution": {...}
}
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/direct-messages-dao.js` (新增方法)

**工作量**: 3h

---

## 四、消息操作接口 (5 个) ⚠️ 20% 完整

### 16. 标记消息已读 ⚠️

**原版 IM**: `POST /messages/{messageId}/read` 或 `PATCH /messages/mark-read`

**请求**:
```json
{
  "message_ids": ["msg_001", "msg_002"],
  "conversation_id": "topic_123",
  "read_at": 1697980000
}
```

**返回**:
```json
{
  "updated_count": 2
}
```

**Master 现状**: ⚠️ **部分有**
- 接口: `POST /api/v1/messages/:id/read`
- 问题: 只能单条标记，无批量和对话级

**需要完善**:
```javascript
PATCH /api/v1/messages/mark-read
{
  "message_ids": ["msg_001", "msg_002"],  // 批量
  "conversation_id": "topic_123",          // 或对话级
  "read_at": 1697980000
}

// 修改:
// 1. 支持批量 message_ids
// 2. 支持对话级标记
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (修改)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/direct-messages-dao.js` (新增方法)

**工作量**: 4h

---

### 17. 发送消息 ⚠️

**原版 IM**: `POST /messages/send`

**请求**:
```json
{
  "conversation_id": "topic_123",
  "content": "我的回复",
  "type": "text",
  "reply_to_message_id": "msg_000"
}
```

**返回**:
```json
{
  "message_id": "msg_new_001",
  "timestamp": 1697980000
}
```

**Master 现状**: ⚠️ **部分有**
- 接口: 通过 Socket.IO `monitor:reply` 实现
- 问题: 不是 HTTP 接口，需要完整的 HTTP API

**需要实现**:
```javascript
POST /api/v1/messages/send
{
  "conversation_id": "topic_123",
  "content": "回复内容",
  "type": "text",
  "reply_to_message_id": "msg_000"
}

// 流程:
// 1. 保存消息到数据库
// 2. 分配给 Worker 发送
// 3. 返回 message_id
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/communication/task-dispatcher.js` (修改)

**工作量**: 6h

---

### 18. 编辑消息 ❌

**原版 IM**: `PATCH /messages/{messageId}`

**请求**:
```json
{
  "content": "编辑后的内容"
}
```

**返回**:
```json
{
  "success": true,
  "edited_at": 1697980000
}
```

**Master 现状**: ❌ **无**
- 无消息编辑功能

**需要实现**:
```javascript
PATCH /api/v1/messages/:id
{
  "content": "编辑后的内容"
}

// 实现:
// 1. 创建 message_edits 表记录编辑历史
// 2. 更新原消息 content
// 3. 记录 edited_at
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/database/init.js` (创建表)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/direct-messages-dao.js` (新增方法)

**工作量**: 6h

---

### 19. 删除消息 ❌

**原版 IM**: `DELETE /messages/{messageId}`

**请求**:
```json
{
}
```

**返回**:
```json
{
  "success": true
}
```

**Master 现状**: ❌ **无**
- 无消息删除接口

**需要实现**:
```javascript
DELETE /api/v1/messages/:id

// 实现:
// 1. 软删除（保留审计）
// 2. 标记 deleted_at
// 3. 推送删除事件给客户端
```

**涉及文件**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/database/init.js` (添加字段)
- `packages/master/src/database/comments-dao.js` (新增方法)
- `packages/master/src/database/direct-messages-dao.js` (新增方法)

**工作量**: 4h

---

## 五、用户管理接口 (3 个) ❌ 0% 完整

### 20. 获取用户信息 ❌

**原版 IM**: `GET /users/{userId}`

**请求**:
```json
{
  "user_id": "user_456"
}
```

**返回**:
```json
{
  "user": {
    "user_id": "user_456",
    "user_name": "李四",
    "avatar": "https://...",
    "signature": "个人签名",
    "verified": false,
    "follower_count": 1000
  }
}
```

**Master 现状**: ❌ **完全无**
- 无独立的用户信息表
- 无用户查询接口

**需要实现**:
```javascript
GET /api/v1/users/:userId

// 创建 users 表:
// id, name, avatar, platform, platform_user_id, signature, verified
```

**涉及文件**:
- `packages/master/src/api/routes/users.js` (新建)
- `packages/master/src/database/init.js` (创建表)
- `packages/master/src/database/users-dao.js` (新建)

**工作量**: 6h

---

### 21. 搜索用户 ❌

**原版 IM**: `GET /users/search?q=keyword`

**请求**:
```json
{
  "query": "用户名",
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "users": [...]
}
```

**Master 现状**: ❌ **完全无**

**需要实现**:
```javascript
GET /api/v1/users/search?q=keyword&cursor=0&count=50

// 搜索 users 表的 name 字段
```

**涉及文件**:
- `packages/master/src/api/routes/users.js` (新增)
- `packages/master/src/database/users-dao.js` (新增方法)

**工作量**: 3h

---

### 22. 用户黑名单 ❌

**原版 IM**: `POST /users/{userId}/block`

**请求**:
```json
{
  "reason": "骚扰"
}
```

**返回**:
```json
{
  "success": true
}
```

**Master 现状**: ❌ **完全无**

**需要实现**:
```javascript
POST /api/v1/users/:userId/block
{
  "reason": "原因"
}

DELETE /api/v1/users/:userId/block  // 解除黑名单

GET /api/v1/blocked-users  // 查看黑名单

// 创建 user_blocks 表
```

**涉及文件**:
- `packages/master/src/api/routes/users.js` (新增)
- `packages/master/src/database/init.js` (创建表)
- `packages/master/src/database/user-blocks-dao.js` (新建)

**工作量**: 4h

---

## 总结表格

| # | 接口 | IM API | Master | 缺口 | 工作量 |
|----|------|--------|--------|------|--------|
| **账户 (6)** |
| 1 | 获取账户列表 | ✅ | ✅ | - | - |
| 2 | 获取单个账户 | ✅ | ✅ | - | - |
| 3 | 创建账户 | ✅ | ✅ | - | - |
| 4 | 更新账户 | ✅ | ✅ | - | - |
| 5 | 删除账户 | ✅ | ✅ | - | - |
| 6 | 获取账户状态 | ✅ | ✅ | - | - |
| **会话 (4)** |
| 7 | 获取会话列表 | ✅ | ⚠️ | 完善 | 6h |
| 8 | 获取会话详情 | ✅ | ❌ | 新增 | 8h |
| 9 | 搜索会话 | ✅ | ❌ | 新增 | 6h |
| 10 | 会话置顶/静音 | ✅ | ❌ | 新增 | 4h |
| **消息 (6)** |
| 11 | 获取消息历史 | ✅ | ⚠️ | 完善 | 6h |
| 12 | 获取单条消息 | ✅ | ✅ | - | - |
| 13 | 按类型查询 | ✅ | ❌ | 新增 | 4h |
| 14 | 消息搜索 | ✅ | ❌ | 新增 | 8h |
| 15 | 消息统计 | ✅ | ❌ | 新增 | 3h |
| **操作 (5)** |
| 16 | 标记已读 | ✅ | ⚠️ | 完善 | 4h |
| 17 | 发送消息 | ✅ | ⚠️ | 完善 | 6h |
| 18 | 编辑消息 | ✅ | ❌ | 新增 | 6h |
| 19 | 删除消息 | ✅ | ❌ | 新增 | 4h |
| **用户 (3)** |
| 20 | 获取用户信息 | ✅ | ❌ | 新增 | 6h |
| 21 | 搜索用户 | ✅ | ❌ | 新增 | 3h |
| 22 | 用户黑名单 | ✅ | ❌ | 新增 | 4h |

---

## 按优先级分组

### 🔴 P1 必须 (完善已有 + 新增核心)

```
完善现有:
- 会话列表 (6h)
- 消息历史 (6h)
- 标记已读 (4h)
- 发送消息 (6h)

新增核心:
- 会话详情 (8h)
- 搜索会话 (6h)
- 搜索消息 (8h)
- 用户信息 (6h)

小计: 14 个接口, 50 小时
```

### 🟠 P2 重要

```
- 会话置顶/静音 (4h)
- 编辑消息 (6h)
- 删除消息 (4h)
- 搜索用户 (3h)
- 用户黑名单 (4h)

小计: 5 个接口, 21 小时
```

### 🟡 P3 可选

```
- 消息统计 (3h)
- 按类型查询 (4h)

小计: 2 个接口, 7 小时
```

---

## 最终结论

**Master 现在**: 42% 完整 (10/24 接口)

**缺失**: 14 个接口

**P1 必须**: 14 个接口, 50 小时 → 完整度 42% → 100%

**建议**: 优先完成 P1，即可100% 兼容原版 IM API
