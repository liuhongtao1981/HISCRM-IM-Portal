# Master vs 抖音 IM - API 对比清单

**日期**: 2025-10-23
**目的**: 列出原版抖音 IM 的所有 API，对比 Master 中的类似接口，便于调整和补充
**文档级别**: 对接指南，用于开发决策

---

## 📋 使用说明

本文档采用表格形式，每个原版 IM API 都对应：

1. **IM API 端点**: 原版抖音 IM 的完整信息（功能、参数、响应）
2. **对应的 Master 接口**: Master 中是否有类似功能
3. **调整建议**: 需要如何修改 Master 来适配

**图例**:
- ✅ Master 已有完全相同的功能
- ⚠️ Master 有类似但不完全相同的功能，需要调整
- ❌ Master 完全缺失，需要新增

---

## 一、会话/对话类 API (7 个)

### 1.1 获取私信初始列表 ✅ 部分支持

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/message/get_by_user_init` |
| **状态** | ✅ 已验证存在 |
| **用途** | 获取账户的所有会话列表（分页） |
| **优先级** | 🔴 必需 |

**请求参数**:
```json
{
  "cursor": 0,              // 分页游标
  "count": 20,              // 单页数量（建议 20-50）
  "source": "im_msg_list",  // 来源标识
  "imei": "...",           // 设备 ID
  "idfa": "...",           // 广告 ID
  "device_id": "..."       // 设备标识
}
```

**返回格式**:
```json
{
  "data": {
    "conversations": [
      {
        "conversation_id": "123456_abcdef",   // 对话 ID
        "other_user_id": "123456",             // 对话方用户 ID
        "other_user_name": "张三",             // 对话方用户名
        "last_message": {...},                 // 最后一条消息
        "unread_count": 3,                     // 未读数
        "last_message_time": 1635012345,       // 最后消息时间
        "is_group": false                      // 是否群组
      }
    ],
    "cursor": "next_cursor",
    "has_more": true
  },
  "status_code": 0,
  "message": "success"
}
```

**Master 对应接口** (✅ 有，但需调整):
```
GET /api/v1/conversations
```

**Master 当前状态**:
- ✅ 端点存在
- ✅ 返回对话列表
- ❌ 无分页支持（cursor/has_more）
- ⚠️ 返回字段不完全匹配
- ❌ 无 unread_count 字段

**调整建议**:
```javascript
// 1. 修改 GET /api/v1/conversations 返回格式
GET /api/v1/conversations?cursor=0&count=20

// 2. 修改返回结构
{
  "data": {
    "conversations": [
      {
        "conversation_id": "...",
        "other_user_id": "...",
        "other_user_name": "...",
        "unread_count": 3,        // ✅ 新增
        "last_message_time": "...", // ✅ 新增
        "last_message": {...},      // ✅ 新增
        "is_group": false           // ✅ 新增
      }
    ],
    "cursor": "next_cursor",     // ✅ 新增
    "has_more": true             // ✅ 新增
  }
}

// 3. 修改 conversations-dao.js
getConversations(cursor = 0, count = 20) {
  // 按时间倒序，实现分页
  // cursor 用 offset 或 id 实现
}
```

**涉及文件修改**:
- `packages/master/src/api/routes/messages.js` (GET /api/v1/conversations)
- `packages/master/src/database/conversations-dao.js` (getConversations)

---

### 1.2 查询单个会话详情 ⚠️ 部分支持

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/query_conversation` |
| **状态** | ❓ 待验证 |
| **用途** | 获取单个会话的完整信息（含消息） |
| **优先级** | 🔴 必需 |

**请求参数**:
```json
{
  "conversation_id": "123456_abcdef",  // 对话 ID
  "include_messages": true,             // 是否包含消息
  "message_count": 50                   // 返回消息数
}
```

**返回格式**:
```json
{
  "data": {
    "conversation_id": "123456_abcdef",
    "other_user_id": "123456",
    "other_user_name": "张三",
    "other_user_avatar": "https://...",
    "is_group": false,
    "unread_count": 3,
    "messages": [
      {
        "platform_message_id": "msg_001",
        "conversation_id": "123456_abcdef",
        "content": "消息内容",
        "sender_id": "123456",
        "sender_name": "张三",
        "receiver_id": "my_user_id",
        "created_at": 1635012345,
        "type": "text",
        "is_read": true,
        "direction": "inbound"
      }
    ]
  },
  "status_code": 0
}
```

**Master 对应接口** (⚠️ 有，但不完整):
```
GET /api/v1/conversations/:id
GET /api/v1/direct-messages?conversation_id=xxx
```

**Master 当前状态**:
- ✅ 有获取单个对话信息的接口
- ✅ 有获取对话消息的接口
- ❌ 两个接口分开，需要分别请求
- ❌ 无法一次性获取对话 + 消息
- ⚠️ 参数结构不同

**调整建议**:
```javascript
// 方案 A: 创建新的合并端点 (推荐)
GET /api/v1/conversations/:id/full?include_messages=true&message_count=50

Response: {
  "data": {
    "conversation_id": "...",
    "other_user_id": "...",
    ...
    "messages": [...]  // ✅ 包含消息
  }
}

// 方案 B: 增强现有端点
GET /api/v1/conversations/:id?include_messages=true&message_count=50
```

**涉及文件修改**:
- `packages/master/src/api/routes/messages.js` (新增或增强)
- `packages/master/src/database/conversations-dao.js` (新增方法)

---

### 1.3 获取会话列表（增强版） ⚠️ 类似但不完整

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/conversation/list` |
| **状态** | ❓ 待验证 |
| **用途** | 获取所有会话（支持排序、过滤） |
| **优先级** | 🟠 重要 |

**请求参数**:
```json
{
  "cursor": 0,
  "count": 100,
  "sort_by": "last_message_time",      // 排序字段
  "include_unread_only": false,          // 只显示未读
  "status": "active|archived|blocked"    // 状态过滤
}
```

**返回格式**:
```json
{
  "data": {
    "conversations": [...],
    "total_count": 150,
    "cursor": "next_cursor",
    "has_more": true
  },
  "status_code": 0
}
```

**Master 对应接口** (⚠️ 有，但缺少功能):
```
GET /api/v1/conversations
```

**Master 当前状态**:
- ✅ 端点存在
- ❌ 无排序功能
- ❌ 无分页（cursor）
- ❌ 无过滤（unread_only, status）
- ⚠️ 返回总数不清楚

**调整建议**:
```javascript
// 增强现有端点
GET /api/v1/conversations?
  cursor=0&
  count=100&
  sort_by=last_message_time&  // ✅ 新增
  status=active&               // ✅ 新增
  unread_only=false           // ✅ 新增

Response: {
  "data": {
    "conversations": [...],
    "total_count": 150,        // ✅ 新增
    "cursor": "...",           // ✅ 新增
    "has_more": true           // ✅ 新增
  }
}

// 修改 conversations-dao.js
getConversationsByStatus(status, sortBy, limit, offset) {
  // status: 'active', 'archived', 'blocked'
  // sortBy: 'last_message_time', 'created_at', 'unread_count'
}
```

**涉及文件修改**:
- `packages/master/src/api/routes/messages.js`
- `packages/master/src/database/conversations-dao.js` (+增强)

---

### 1.4 获取会话未读统计 ⚠️ 缺失核心参数

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/conversation/unread` |
| **状态** | ❓ 待验证 |
| **用途** | 获取各会话的未读消息数 |
| **优先级** | 🟡 可选 |

**请求参数**:
```json
{
  "conversation_ids": ["123456_abcdef", "234567_bcdefg"]
}
```

**返回格式**:
```json
{
  "data": {
    "unread_stats": [
      {
        "conversation_id": "123456_abcdef",
        "unread_count": 5,
        "last_unread_message_id": "msg_xxx"
      }
    ]
  },
  "status_code": 0
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**Master 当前状态**:
- ❌ 无专门的未读统计接口
- ✅ 可以通过其他接口查询，但需要多次调用

**调整建议**:
```javascript
// 新增接口
GET /api/v1/unread-summary

Response: {
  "data": {
    "unread_stats": [
      {
        "conversation_id": "...",
        "unread_count": 5,
        "last_unread_message_id": "..."
      }
    ]
  }
}

// 或按 conversation_ids 查询
POST /api/v1/conversations/unread
{
  "conversation_ids": ["conv-1", "conv-2"]
}
```

**涉及文件修改**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/database/conversations-dao.js` (新增方法)

---

### 1.5 搜索会话 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/conversation/search` (推断) |
| **状态** | ❓ 不确定是否存在 |
| **用途** | 按用户名、备注等搜索会话 |
| **优先级** | 🟠 重要 |

**预期请求参数**:
```json
{
  "query": "用户名或备注",
  "cursor": 0,
  "count": 50
}
```

**预期返回格式**:
```json
{
  "data": {
    "conversations": [
      {
        "conversation_id": "...",
        "other_user_name": "用户名",
        "similarity_score": 0.95
      }
    ],
    "cursor": "...",
    "has_more": true
  }
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**Master 当前状态**:
- ❌ 无会话搜索功能
- ❌ 无全文搜索能力

**调整建议**:
```javascript
// 新增接口
POST /api/v1/conversations/search
{
  "query": "关键词",
  "cursor": 0,
  "count": 50
}

Response: {
  "data": {
    "conversations": [...]
  }
}

// 或
GET /api/v1/conversations/search?q=keyword&cursor=0
```

**涉及文件修改**:
- `packages/master/src/api/routes/messages.js` (新增)
- `packages/master/src/database/conversations-dao.js` (新增查询方法)

---

---

## 二、消息历史类 API (6 个)

### 2.1 获取消息历史 ⚠️ 类似但参数不同

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/history` |
| **状态** | ❓ 待验证 |
| **用途** | 分页加载会话的历史消息 |
| **优先级** | 🔴 必需 |

**请求参数**:
```json
{
  "conversation_id": "123456_abcdef",
  "cursor": 0,
  "count": 50,
  "direction": "backward"  // 向后加载（更早消息）
}
```

**返回格式**:
```json
{
  "data": {
    "messages": [
      {
        "platform_message_id": "msg_050",
        "conversation_id": "123456_abcdef",
        "content": "最早的消息",
        "sender_id": "123456",
        "sender_name": "张三",
        "receiver_id": "my_user_id",
        "created_at": 1634012345,
        "type": "text",
        "direction": "inbound"
      }
    ],
    "cursor": "next_cursor_for_older_messages",
    "has_more": true
  },
  "status_code": 0
}
```

**Master 对应接口** (⚠️ 有，但不完全匹配):
```
GET /api/v1/direct-messages?conversation_id=xxx&limit=50&offset=0
GET /api/v1/messages
```

**Master 当前状态**:
- ✅ 可以查询消息
- ❌ 使用 offset/limit，不是 cursor
- ❌ 无 direction 参数（都是默认顺序）
- ⚠️ 没有 has_more 返回值
- ⚠️ 消息字段不完全匹配

**调整建议**:
```javascript
// 方案：支持 cursor 分页（兼容 IM）
GET /api/v1/messages/history?
  conversation_id=123456_abcdef&
  cursor=0&
  count=50&
  direction=backward

// 或保持现有 offset 同时支持 cursor
GET /api/v1/direct-messages?
  conversation_id=xxx&
  cursor=0&          // ✅ 新增（cursor 模式）
  count=50&
  direction=backward // ✅ 新增
  // 或保留原有
  limit=50&offset=0

Response: {
  "data": {
    "messages": [
      {
        "platform_message_id": "msg_xxx",   // ✅ 已有
        "conversation_id": "...",           // ✅ 已有
        "content": "...",                   // ✅ 已有
        "sender_id": "...",                 // ✅ 已有
        "sender_name": "...",               // ⚠️ 可能需要 JOIN
        "receiver_id": "...",               // ✅ 已有
        "receiver_name": "...",             // ⚠️ 可能需要 JOIN
        "created_at": 1635012345,           // ✅ 已有
        "type": "text",                     // ✅ 已有
        "direction": "inbound"              // ✅ 已有
      }
    ],
    "cursor": "next_cursor",                // ✅ 新增
    "has_more": true                        // ✅ 新增
  }
}
```

**涉及文件修改**:
- `packages/master/src/api/routes/messages.js` (增强 GET /api/v1/direct-messages 或新增 /api/v1/messages/history)
- `packages/master/src/database/direct-messages-dao.js` (新增 cursor 分页支持)

---

### 2.2 获取单条消息 ⚠️ 有但功能不完整

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/get` |
| **状态** | ❓ 待验证 |
| **用途** | 获取单条消息详情 |
| **优先级** | 🟠 重要 |

**请求参数**:
```json
{
  "message_id": "msg_001"
}
```

**返回格式**:
```json
{
  "data": {
    "message": {
      "platform_message_id": "msg_001",
      "conversation_id": "123456_abcdef",
      "content": "消息内容",
      "sender_id": "123456",
      "sender_name": "张三",
      "receiver_id": "my_user_id",
      "created_at": 1635012345,
      "type": "text",
      "is_read": true,
      "direction": "inbound"
    }
  },
  "status_code": 0
}
```

**Master 对应接口** (✅ 有):
```
GET /api/v1/messages/:id
GET /api/v1/direct-messages/:id
```

**Master 当前状态**:
- ✅ 端点存在
- ✅ 返回消息详情
- ✅ 字段基本匹配

**调整建议**:
```javascript
// 现有接口已可用，可直接用
GET /api/v1/messages/:id

// 确保返回字段包括：
// ✅ platform_message_id
// ✅ conversation_id
// ✅ direction
// ✅ sender_name (需要 JOIN users 表)
// ✅ receiver_name (需要 JOIN users 表)
```

**涉及文件修改**:
- 如果缺少 sender_name/receiver_name，需要增强查询 (JOIN 操作)

---

### 2.3 按消息类型查询 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/get_by_type` (推断) |
| **状态** | ❓ 不确定是否存在 |
| **用途** | 查询特定类型的消息（图片、视频等） |
| **优先级** | 🟡 可选 |

**预期请求参数**:
```json
{
  "conversation_id": "123456_abcdef",
  "message_type": "image",  // text, image, video, file
  "cursor": 0,
  "count": 50
}
```

**预期返回格式**:
```json
{
  "data": {
    "messages": [...]
  },
  "cursor": "...",
  "has_more": true
}
```

**Master 对应接口** (⚠️ 有但不完整):
```
GET /api/v1/messages?message_type=image
GET /api/v1/direct-messages?message_type=image
```

**Master 当前状态**:
- ⚠️ 可能有 message_type 过滤
- ❌ 无 cursor 分页

**调整建议**:
```javascript
// 增强现有端点
GET /api/v1/messages?
  conversation_id=xxx&
  message_type=image&
  cursor=0&
  count=50

// 或新增端点
GET /api/v1/messages/by-type?...
```

---

### 2.4 消息搜索 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/search` (推断) |
| **状态** | ❓ 不确定是否存在 |
| **用途** | 全文搜索消息 |
| **优先级** | 🔴 必需 |

**预期请求参数**:
```json
{
  "query": "关键词",
  "conversation_id": "123456_abcdef",  // 可选
  "sender_id": "123456",                // 可选
  "start_date": "2025-10-01",          // 可选
  "end_date": "2025-10-22",            // 可选
  "message_type": "text",               // 可选
  "cursor": 0,
  "count": 50
}
```

**预期返回格式**:
```json
{
  "data": {
    "matches": [
      {
        "message_id": "msg_xxx",
        "content": "包含<mark>关键词</mark>的消息",
        "highlight": "...关键词..."
      }
    ],
    "total": 234,
    "cursor": "...",
    "has_more": true
  }
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**Master 当前状态**:
- ❌ 无消息搜索功能
- ❌ 无全文搜索能力
- ❌ 无 FTS 索引

**调整建议**:
```javascript
// 新增搜索端点
POST /api/v1/messages/search
{
  "query": "关键词",
  "conversation_id": "xxx",
  "sender_id": "xxx",
  "start_date": "2025-10-01",
  "end_date": "2025-10-22",
  "message_type": "text",
  "cursor": 0,
  "count": 50
}

// 需要创建 FTS5 索引
// CREATE VIRTUAL TABLE direct_messages_fts USING fts5(content, ...);
```

**涉及文件修改**:
- `packages/master/src/api/routes/search.js` (新建)
- `packages/master/src/database/init.js` (创建 FTS5 表)
- `packages/master/src/database/direct-messages-dao.js` (新增搜索方法)

---

### 2.5 标记消息已读 ⚠️ 有但不完整

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/mark_read` |
| **状态** | ❓ 待验证 |
| **用途** | 标记消息为已读 |
| **优先级** | 🔴 必需 |

**请求参数**:
```json
{
  "message_ids": ["msg_001", "msg_002"],  // 批量
  // 或
  "conversation_id": "123456_abcdef"     // 对话级
}
```

**返回格式**:
```json
{
  "data": {
    "updated_count": 2
  },
  "status_code": 0
}
```

**Master 对应接口** (⚠️ 有，但不完整):
```
POST /api/v1/messages/:id/read
```

**Master 当前状态**:
- ✅ 可以标记单条消息已读
- ❌ 无批量标记
- ❌ 无对话级标记

**调整建议**:
```javascript
// 增强现有接口
PATCH /api/v1/messages/mark-read
{
  "message_ids": ["msg-1", "msg-2"],  // ✅ 新增（批量）
  "conversation_id": "conv-xxx",      // ✅ 新增（对话级）
  "read_at": 1697980123
}

Response: {
  "updated_count": 2
}

// 修改方法签名
direct-messages-dao.js:
  markAsRead(messageIds, readAt)
  markConversationAsRead(conversationId, readAt)
```

**涉及文件修改**:
- `packages/master/src/api/routes/messages.js` (修改 POST /api/v1/messages/:id/read)
- `packages/master/src/database/direct-messages-dao.js` (增强)

---

### 2.6 消息已读状态同步 ⚠️ 缺失增量同步

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/sync_read_status` (推断) |
| **状态** | ❓ 不确定是否存在 |
| **用途** | 批量同步消息已读状态（增量） |
| **优先级** | 🟠 重要 |

**预期请求参数**:
```json
{
  "conversation_id": "123456_abcdef",
  "last_read_message_id": "msg_xxx",
  "timestamp": 1635012345
}
```

**预期返回格式**:
```json
{
  "data": {
    "updated_count": 5,
    "status_changed_at": 1635012345
  }
}
```

**Master 对应接口** (❌ 无增量同步):
```
无对应接口
```

**Master 当前状态**:
- ⚠️ 可以逐条更新
- ❌ 无增量同步能力

**调整建议**:
```javascript
// 新增增量同步接口
POST /api/v1/messages/sync-read-status
{
  "conversation_id": "conv-xxx",
  "last_read_message_id": "msg-xxx",
  "read_at": 1697980123
}

Response: {
  "updated_count": 5
}

// 方法：更新此 conversation 中所有 created_at <= last_read_message_id 的消息
```

---

---

## 三、用户信息类 API (3 个)

### 3.1 获取用户信息 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/user/get` (推断) |
| **状态** | ❓ 不确定是否存在 |
| **用途** | 获取用户基本信息 |
| **优先级** | 🔴 必需 |

**请求参数**:
```json
{
  "user_id": "123456"
  // 或
  "user_ids": ["123456", "234567"]  // 批量
}
```

**返回格式**:
```json
{
  "data": {
    "user": {
      "user_id": "123456",
      "user_name": "张三",
      "avatar": "https://...",
      "signature": "个人签名",
      "verified": false,
      "follower_count": 1000
    }
  },
  "status_code": 0
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**Master 当前状态**:
- ❌ 无独立的用户信息接口
- ✅ 用户信息分散在 accounts 表

**调整建议**:
```javascript
// 新增用户信息接口
GET /api/v1/users/:userId

Response: {
  "data": {
    "user": {
      "user_id": "123456",
      "user_name": "张三",
      "avatar": "https://...",
      "signature": "...",
      "verified": false
    }
  }
}

// 批量获取
POST /api/v1/users/batch
{
  "user_ids": ["123456", "234567"]
}

// 创建 users 表和 users-dao.js
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  platform TEXT,
  platform_user_id TEXT,
  name TEXT,
  avatar TEXT,
  signature TEXT,
  verified INTEGER,
  follower_count INTEGER,
  cached_at INTEGER,
  UNIQUE(platform, platform_user_id)
);
```

**涉及文件修改**:
- `packages/master/src/api/routes/users.js` (新建)
- `packages/master/src/database/init.js` (新建 users 表)
- `packages/master/src/database/users-dao.js` (新建)

---

### 3.2 搜索用户 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/user/search` (推断) |
| **状态** | ❓ 不确定是否存在 |
| **用途** | 搜索用户 |
| **优先级** | 🟡 可选 |

**请求参数**:
```json
{
  "query": "用户名",
  "cursor": 0,
  "count": 50
}
```

**返回格式**:
```json
{
  "data": {
    "users": [...]
  },
  "cursor": "...",
  "has_more": true
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**调整建议**:
```javascript
// 新增搜索用户接口
GET /api/v1/users/search?q=keyword&cursor=0&count=50

Response: {
  "data": {
    "users": [...]
  }
}
```

---

### 3.3 获取用户关系信息 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/user/relation` (推断) |
| **状态** | ❓ 不确定是否存在 |
| **用途** | 获取与某用户的关系（好友、黑名单等） |
| **优先级** | 🟡 可选 |

**请求参数**:
```json
{
  "user_id": "123456"
}
```

**返回格式**:
```json
{
  "data": {
    "relation": {
      "is_friend": true,
      "is_blocked": false,
      "is_muted": false,
      "last_interaction_at": 1635012345
    }
  }
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**调整建议**:
```javascript
// 新增用户关系查询接口
GET /api/v1/users/:userId/relation

Response: {
  "data": {
    "is_friend": true,
    "is_blocked": false,
    "is_muted": false
  }
}

// 需要创建相关表
CREATE TABLE user_blocks (...)  // 黑名单
CREATE TABLE user_mutes (...)   // 静音
```

---

---

## 四、消息发送类 API (2 个)

### 4.1 发送消息 ✅ 已有但方式不同

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/send` |
| **状态** | ❓ 待验证 |
| **用途** | 发送私信 |
| **优先级** | 🔴 必需 |

**请求参数**:
```json
{
  "conversation_id": "123456_abcdef",
  "content": "消息内容",
  "type": "text",  // text, image, video, file
  "ext": {
    "image_url": "...",
    "duration": 0
  }
}
```

**返回格式**:
```json
{
  "data": {
    "message_id": "msg_new_001",
    "timestamp": 1635012345
  },
  "status_code": 0
}
```

**Master 对应接口** (⚠️ 有但方式不同):
```
POST /api/v1/replies  (用于回复评论)
```

**Master 当前状态**:
- ✅ 有发送消息的功能
- ❌ 是通过 Worker 代理实现的（浏览器自动化），而不是 API
- ❌ 无 HTTP API 直接发送消息

**调整建议**:
```javascript
// 说明：Master 目前通过 Worker 代理发送消息（Web UI 自动化）
// 不推荐添加直接 HTTP API 发送，原因：
// 1. 需要完整的 Cookie/Session 管理
// 2. 抖音 IM API 可能需要特殊认证
// 3. 当前架构是监控，不是主动发送

// 如果必须支持，则需要：
// 1. 实现完整的登录和会话管理
// 2. 处理抖音的加密和签名验证
// 3. 可能需要与 IM API 直接交互（目前未实现）

// 建议保持当前架构：
// - Master：监控和数据收集
// - Worker：通过浏览器自动化发送（已实现）
// - crm-pc-im：通过 Worker 代理发送（未来增强）
```

**涉及文件修改**:
- 建议不修改，保持当前架构

---

### 4.2 消息编辑/撤回 ⚠️ 缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/edit` |
| **状态** | ❓ 待验证 |
| **用途** | 编辑已发送的消息 |
| **优先级** | 🟠 重要 |

**请求参数**:
```json
{
  "message_id": "msg_001",
  "content": "新的消息内容"
}
```

**返回格式**:
```json
{
  "data": {
    "message_id": "msg_001",
    "updated_at": 1635012345
  }
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**Master 当前状态**:
- ❌ 无消息编辑功能

**调整建议**:
```javascript
// 新增消息编辑接口（P2 优先级）
PATCH /api/v1/messages/:id
{
  "content": "新内容"
}

// 需要创建编辑历史表
CREATE TABLE message_edits (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  old_content TEXT,
  new_content TEXT,
  edited_at INTEGER,
  editor_id TEXT
);
```

---

---

## 五、通知类 API (2 个)

### 5.1 获取通知列表 ✅ 有但结构不同

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/notification/get` (推断) |
| **状态** | ❓ 不确定是否存在 |
| **用途** | 获取消息通知列表 |
| **优先级** | 🟡 可选 |

**请求参数**:
```json
{
  "cursor": 0,
  "count": 50,
  "status": "unread|all"
}
```

**返回格式**:
```json
{
  "data": {
    "notifications": [
      {
        "notification_id": "notif_001",
        "conversation_id": "123456_abcdef",
        "message_id": "msg_001",
        "title": "来自张三的新消息",
        "type": "message",
        "is_read": false,
        "created_at": 1635012345
      }
    ],
    "cursor": "...",
    "has_more": true
  }
}
```

**Master 对应接口** (⚠️ 有但结构不同):
```
GET /api/v1/notifications (或 /notifications)
```

**Master 当前状态**:
- ✅ 有通知系统（主要用于 Socket.IO 推送）
- ⚠️ HTTP API 接口不清楚
- ⚠️ 数据结构可能不同

**调整建议**:
```javascript
// 增强/新增 HTTP API
GET /api/v1/notifications?status=unread&cursor=0&count=50

Response: {
  "data": {
    "notifications": [
      {
        "notification_id": "notif_xxx",
        "conversation_id": "conv_xxx",
        "message_id": "msg_xxx",
        "title": "消息标题",
        "type": "message",
        "is_read": false,
        "created_at": 1635012345
      }
    ],
    "cursor": "...",
    "has_more": true
  }
}
```

---

### 5.2 标记通知已读 ✅ 已实现

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/notification/mark_read` |
| **状态** | ✅ 已实现 |
| **用途** | 标记通知为已读 |
| **优先级** | 🟡 可选 |

**请求参数**:
```json
{
  "notification_ids": ["notif_001", "notif_002"]
}
```

**返回格式**:
```json
{
  "data": {
    "updated_count": 2
  }
}
```

**Master 对应接口** (✅ 有):
```
POST /api/v1/notifications/:id/read (或类似)
也有 Socket.IO: client:notification:ack (已实现)
```

**Master 当前状态**:
- ✅ 已实现 notification:ack 处理
- ✅ 能够标记通知为已确认
- ✅ 数据持久化到数据库

**调整建议**:
```javascript
// 现有实现已足够，可继续使用
// 如需增强：
// 1. 支持批量标记（批量 IDs）
// 2. 支持 HTTP API 接口（目前主要是 Socket.IO）

PATCH /api/v1/notifications/mark-read
{
  "notification_ids": ["notif-1", "notif-2"]
}
```

---

---

## 六、扩展功能 API (6 个)

### 6.1 消息撤回 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/recall` |
| **状态** | ❓ 待验证 |
| **用途** | 撤回已发送的消息 |
| **优先级** | 🟠 重要 |

**请求参数**:
```json
{
  "message_id": "msg_001"
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**调整建议**:
```javascript
// 新增消息撤回接口 (P2)
DELETE /api/v1/messages/:id

// 或
POST /api/v1/messages/:id/recall

// 创建消息删除记录
CREATE TABLE message_deletes (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  deleted_at INTEGER,
  deleted_by TEXT
);
```

---

### 6.2 对话置顶 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/conversation/pin` |
| **状态** | ❓ 待验证 |
| **用途** | 置顶对话 |
| **优先级** | 🟠 重要 |

**请求参数**:
```json
{
  "conversation_id": "123456_abcdef",
  "pin": true  // 或 false 取消置顶
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**调整建议**:
```javascript
// 新增置顶接口 (P2)
PATCH /api/v1/conversations/:id/pin
{
  "pin": true
}

// 修改 conversations 表
ALTER TABLE conversations ADD COLUMN is_pinned INTEGER DEFAULT 0;
```

---

### 6.3 对话静音 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/conversation/mute` |
| **状态** | ❓ 待验证 |
| **用途** | 静音对话（不接收通知） |
| **优先级** | 🟡 可选 |

**请求参数**:
```json
{
  "conversation_id": "123456_abcdef",
  "mute_until": 1635012345  // Unix 时间戳，0 表示永久
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**调整建议**:
```javascript
// 新增静音接口 (P3)
PATCH /api/v1/conversations/:id/mute
{
  "mute_until": 1635012345
}

// 修改表
ALTER TABLE conversations ADD COLUMN mute_until INTEGER;
```

---

### 6.4 黑名单管理 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/user/block` |
| **状态** | ❓ 待验证 |
| **用途** | 添加用户到黑名单 |
| **优先级** | 🟠 重要 |

**请求参数**:
```json
{
  "user_id": "123456",
  "reason": "骚扰"
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**调整建议**:
```javascript
// 新增黑名单接口 (P2)
POST /api/v1/users/:userId/block
{
  "reason": "原因"
}

DELETE /api/v1/users/:userId/block  // 解除黑名单

GET /api/v1/blocked-users  // 查询黑名单

// 创建黑名单表
CREATE TABLE user_blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT,
  blocked_user_id TEXT,
  reason TEXT,
  created_at INTEGER,
  UNIQUE(blocker_id, blocked_user_id)
);
```

---

### 6.5 标签管理 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/conversation/tag` |
| **状态** | ❓ 待验证 |
| **用途** | 为对话添加标签/分组 |
| **优先级** | 🟠 重要 |

**请求参数**:
```json
{
  "conversation_id": "123456_abcdef",
  "tags": ["重要", "客户"]
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**调整建议**:
```javascript
// 新增标签接口 (P2)
PATCH /api/v1/conversations/:id/tags
{
  "tags": ["重要", "客户"]
}

GET /api/v1/conversations/by-tag/:tag  // 查询有某标签的对话

// 修改表或创建标签表
ALTER TABLE conversations ADD COLUMN tags TEXT;  // JSON 数组

// 或创建单独的标签表
CREATE TABLE conversation_tags (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  tag_name TEXT,
  created_at INTEGER,
  UNIQUE(conversation_id, tag_name)
);
```

---

### 6.6 消息反应/表情 ❌ 完全缺失

| 字段 | 值 |
|------|-----|
| **IM API** | `POST /v1/im/message/reaction` |
| **状态** | ❓ 待验证 |
| **用途** | 给消息添加表情反应 |
| **优先级** | 🟡 可选 |

**请求参数**:
```json
{
  "message_id": "msg_001",
  "emoji": "👍",
  "action": "add|remove"
}
```

**Master 对应接口** (❌ 无):
```
无对应接口
```

**调整建议**:
```javascript
// 新增反应接口 (P3)
POST /api/v1/messages/:id/reactions
{
  "emoji": "👍",
  "action": "add"
}

// 创建反应表
CREATE TABLE message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  emoji TEXT,
  user_id TEXT,
  created_at INTEGER,
  UNIQUE(message_id, emoji, user_id)
);
```

---

---

## 📊 总结表格

| # | 功能类别 | IM API | Master 状态 | 优先级 | 工作量 | 备注 |
|---|---------|--------|-----------|--------|--------|------|
| 1 | 获取会话列表 | `/v1/message/get_by_user_init` | ✅ 有，⚠️ 需调整 | 🔴 P1 | 6h | 添加 cursor 分页、unread_count |
| 2 | 查询单个会话 | `/v1/im/query_conversation` | ⚠️ 有，❌ 分开的 | 🔴 P1 | 4h | 合并对话+消息查询 |
| 3 | 会话列表增强 | `/v1/im/conversation/list` | ⚠️ 有，❌ 缺功能 | 🟠 P2 | 6h | 排序、搜索、过滤 |
| 4 | 会话未读统计 | `/v1/im/conversation/unread` | ❌ 无 | 🟡 P3 | 2h | 新增接口 |
| 5 | 搜索会话 | `/v1/im/conversation/search` | ❌ 无 | 🟠 P2 | 3h | 按用户名搜索 |
| 6 | 消息历史 | `/v1/im/message/history` | ⚠️ 有，❌ 参数不同 | 🔴 P1 | 6h | 支持 cursor、direction |
| 7 | 获取单条消息 | `/v1/im/message/get` | ✅ 有 | 🟠 P2 | 1h | 确保字段完整 |
| 8 | 按类型查询消息 | `/v1/im/message/get_by_type` | ⚠️ 有，❌ 缺 cursor | 🟡 P3 | 2h | 消息类型过滤 |
| 9 | 消息搜索 | `/v1/im/message/search` | ❌ 无 | 🔴 P1 | 8h | FTS5 全文搜索 |
| 10 | 标记消息已读 | `/v1/im/message/mark_read` | ⚠️ 有，❌ 无批量 | 🔴 P1 | 4h | 批量标记、对话级标记 |
| 11 | 同步已读状态 | `/v1/im/message/sync_read_status` | ❌ 无 | 🟠 P2 | 4h | 增量同步 |
| 12 | 获取用户信息 | `/v1/im/user/get` | ❌ 无 | 🔴 P1 | 6h | 新建 users 表 |
| 13 | 搜索用户 | `/v1/im/user/search` | ❌ 无 | 🟡 P3 | 3h | 用户搜索 |
| 14 | 用户关系 | `/v1/im/user/relation` | ❌ 无 | 🟡 P3 | 2h | 好友、黑名单关系 |
| 15 | 发送消息 | `/v1/im/message/send` | ⚠️ 有，❌ 方式不同 | 🔴 P1 | 0h | 保持现有架构 |
| 16 | 编辑消息 | `/v1/im/message/edit` | ❌ 无 | 🟠 P2 | 8h | 编辑历史 |
| 17 | 撤回消息 | `/v1/im/message/recall` | ❌ 无 | 🟠 P2 | 6h | 消息删除 |
| 18 | 获取通知 | `/v1/im/notification/get` | ⚠️ 有，❌ 结构不同 | 🟡 P3 | 2h | HTTP API |
| 19 | 标记通知已读 | `/v1/im/notification/mark_read` | ✅ 有 | 🟡 P3 | 0h | 已实现 |
| 20 | 置顶对话 | `/v1/im/conversation/pin` | ❌ 无 | 🟠 P2 | 4h | 新增功能 |
| 21 | 静音对话 | `/v1/im/conversation/mute` | ❌ 无 | 🟡 P3 | 3h | 新增功能 |
| 22 | 黑名单管理 | `/v1/im/user/block` | ❌ 无 | 🟠 P2 | 6h | 新建表 |
| 23 | 标签管理 | `/v1/im/conversation/tag` | ❌ 无 | 🟠 P2 | 6h | 新建表 |
| 24 | 消息反应 | `/v1/im/message/reaction` | ❌ 无 | 🟡 P3 | 6h | 表情反应 |

---

## 建议优先级排序

### 🔴 立即实现 (P1, 21h, 这周)
```
1. 消息历史 (6h) - /v1/im/message/history
2. 消息搜索 (8h) - /v1/im/message/search (FTS5)
3. 会话列表 (6h) - /v1/message/get_by_user_init (添加 cursor)
4. 用户信息 (6h) - /v1/im/user/get (新建 users 表)
5. 标记消息已读 (4h) - /v1/im/message/mark_read (批量)
───────────────
总计: 30h (建议分 2 周完成)
```

### 🟠 本周完成 (P2, 39h, 后两周)
```
1. 编辑消息 (8h)
2. 撤回消息 (6h)
3. 会话列表增强 (6h)
4. 黑名单 (6h)
5. 标签管理 (6h)
6. 置顶对话 (4h)
7. 同步已读状态 (4h)
...
```

### 🟡 可选实现 (P3, 30h+, 下月)
```
1. 消息反应 (6h)
2. 静音对话 (3h)
3. 用户搜索 (3h)
4. 消息预览 (5h)
...
```

---

**版本**: v1.0
**完成时间**: 2025-10-23
**下一步**: 确认优先级 → 开始 P1 实现
