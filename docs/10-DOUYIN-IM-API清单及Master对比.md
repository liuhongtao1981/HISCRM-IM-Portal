# 抖音 IM API 清单及 Master 对比

**简化版**：仅列出所有 API、功能、参数、返回，以及 Master 对应情况

---

## 快速统计

| 项目 | 数值 |
|------|------|
| 原版 IM API 总数 | 24 个 |
| Master 完全相同 | 2 个 ✅ |
| Master 需要调整 | 5 个 ⚠️ |
| Master 完全缺失 | 17 个 ❌ |
| Master 当前完整度 | 45% |

---

## 会话/对话类 API (7 个)

### 1. 获取私信初始列表 ✅

**IM API**: `POST /v1/message/get_by_user_init`

**功能**: 获取账户的所有会话列表（分页）

**请求**:
```json
{
  "cursor": 0,
  "count": 20,
  "source": "im_msg_list",
  "imei": "...",
  "idfa": "...",
  "device_id": "..."
}
```

**返回**:
```json
{
  "data": {
    "conversations": [
      {
        "conversation_id": "123456_abcdef",
        "other_user_id": "123456",
        "other_user_name": "张三",
        "last_message": {...},
        "unread_count": 3,
        "last_message_time": 1635012345,
        "is_group": false
      }
    ],
    "cursor": "next_cursor",
    "has_more": true
  },
  "status_code": 0
}
```

**Master 对比**: ⚠️ **有，但需调整**
- 接口: `GET /api/v1/conversations`
- 问题: 无 cursor 分页、无 unread_count、无 has_more
- 调整: 添加 cursor、unread_count、has_more 字段

---

### 2. 查询单个会话详情 ⚠️

**IM API**: `POST /v1/im/query_conversation`

**功能**: 获取单个会话的完整信息和消息

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "include_messages": true,
  "message_count": 50
}
```

**返回**:
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
        "receiver_name": "我的账户",
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

**Master 对比**: ⚠️ **有，但分开**
- 接口: `GET /api/v1/conversations/:id` + `GET /api/v1/direct-messages?conversation_id=xxx`
- 问题: 需要分开两次请求，无法一次性获取对话+消息
- 调整: 创建合并端点或增强现有端点支持 include_messages 参数

---

### 3. 获取会话列表（增强版） ⚠️

**IM API**: `POST /v1/im/conversation/list`

**功能**: 获取所有会话，支持排序、搜索、过滤

**请求**:
```json
{
  "cursor": 0,
  "count": 100,
  "sort_by": "last_message_time",
  "include_unread_only": false,
  "status": "active"
}
```

**返回**:
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

**Master 对比**: ⚠️ **有，但功能不完整**
- 接口: `GET /api/v1/conversations`
- 问题: 无排序、无搜索、无分页、无过滤
- 调整: 添加 sort_by、search、status、cursor、has_more 参数

---

### 4. 获取会话未读统计 ❌

**IM API**: `POST /v1/im/conversation/unread`

**功能**: 获取各会话的未读消息数

**请求**:
```json
{
  "conversation_ids": ["123456_abcdef", "234567_bcdefg"]
}
```

**返回**:
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

**Master 对比**: ❌ **无**
- 调整: 新增接口 `GET /api/v1/unread-summary`

---

### 5. 搜索会话 ❌

**IM API**: `POST /v1/im/conversation/search`

**功能**: 按用户名、备注等搜索会话

**请求**:
```json
{
  "query": "用户名或备注",
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "data": {
    "conversations": [...],
    "cursor": "...",
    "has_more": true
  }
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `GET /api/v1/conversations/search?q=keyword`

---

### 6. 置顶对话 ❌

**IM API**: `POST /v1/im/conversation/pin`

**功能**: 置顶或取消置顶对话

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "pin": true
}
```

**返回**:
```json
{
  "data": { "success": true },
  "status_code": 0
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `PATCH /api/v1/conversations/:id/pin`

---

### 7. 静音对话 ❌

**IM API**: `POST /v1/im/conversation/mute`

**功能**: 静音对话（不接收通知）

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "mute_until": 1635012345
}
```

**返回**:
```json
{
  "data": { "success": true },
  "status_code": 0
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `PATCH /api/v1/conversations/:id/mute`

---

## 消息历史类 API (6 个)

### 8. 获取消息历史 ⚠️

**IM API**: `POST /v1/im/message/history`

**功能**: 分页加载会话的历史消息

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "cursor": 0,
  "count": 50,
  "direction": "backward"
}
```

**返回**:
```json
{
  "data": {
    "messages": [
      {
        "platform_message_id": "msg_050",
        "conversation_id": "123456_abcdef",
        "content": "消息内容",
        "sender_id": "123456",
        "sender_name": "张三",
        "receiver_id": "my_user_id",
        "created_at": 1634012345,
        "type": "text",
        "direction": "inbound"
      }
    ],
    "cursor": "next_cursor",
    "has_more": true
  },
  "status_code": 0
}
```

**Master 对比**: ⚠️ **有，但参数不同**
- 接口: `GET /api/v1/direct-messages?conversation_id=xxx&limit=50&offset=0`
- 问题: 使用 offset/limit，不支持 cursor、direction、has_more
- 调整: 支持 cursor 和 direction 参数

---

### 9. 获取单条消息 ✅

**IM API**: `POST /v1/im/message/get`

**功能**: 获取单条消息详情

**请求**:
```json
{
  "message_id": "msg_001"
}
```

**返回**:
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

**Master 对比**: ✅ **完全相同**
- 接口: `GET /api/v1/messages/:id`

---

### 10. 按类型查询消息 ⚠️

**IM API**: `POST /v1/im/message/get_by_type`

**功能**: 查询特定类型的消息（图片、视频等）

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "message_type": "image",
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "data": {
    "messages": [...],
    "cursor": "...",
    "has_more": true
  }
}
```

**Master 对比**: ⚠️ **有类似，但不完整**
- 接口: `GET /api/v1/messages?message_type=image`
- 问题: 无 cursor 分页
- 调整: 添加 cursor 和 has_more 支持

---

### 11. 消息搜索 ❌

**IM API**: `POST /v1/im/message/search`

**功能**: 全文搜索消息

**请求**:
```json
{
  "query": "关键词",
  "conversation_id": "123456_abcdef",
  "sender_id": "123456",
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

**Master 对比**: ❌ **无**
- 调整: 新增接口 `POST /api/v1/messages/search`，需要 FTS5 索引

---

### 12. 标记消息已读 ⚠️

**IM API**: `POST /v1/im/message/mark_read`

**功能**: 标记消息为已读

**请求**:
```json
{
  "message_ids": ["msg_001", "msg_002"],
  // 或
  "conversation_id": "123456_abcdef"
}
```

**返回**:
```json
{
  "data": {
    "updated_count": 2
  },
  "status_code": 0
}
```

**Master 对比**: ⚠️ **有，但无批量**
- 接口: `POST /api/v1/messages/:id/read`
- 问题: 只能单条标记，不支持批量、对话级
- 调整: 修改为 `PATCH /api/v1/messages/mark-read`，支持批量和对话级

---

### 13. 消息已读状态同步 ❌

**IM API**: `POST /v1/im/message/sync_read_status`

**功能**: 批量同步消息已读状态（增量）

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "last_read_message_id": "msg_xxx",
  "timestamp": 1635012345
}
```

**返回**:
```json
{
  "data": {
    "updated_count": 5,
    "status_changed_at": 1635012345
  }
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `POST /api/v1/messages/sync-read-status`

---

## 用户信息类 API (3 个)

### 14. 获取用户信息 ❌

**IM API**: `POST /v1/im/user/get`

**功能**: 获取用户基本信息

**请求**:
```json
{
  "user_id": "123456"
  // 或批量
  "user_ids": ["123456", "234567"]
}
```

**返回**:
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

**Master 对比**: ❌ **无**
- 调整: 新增接口 `GET /api/v1/users/:userId`

---

### 15. 搜索用户 ❌

**IM API**: `POST /v1/im/user/search`

**功能**: 搜索用户

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
  "data": {
    "users": [...]
  },
  "cursor": "...",
  "has_more": true
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `GET /api/v1/users/search?q=keyword`

---

### 16. 用户黑名单 ❌

**IM API**: `POST /v1/im/user/block`

**功能**: 添加用户到黑名单

**请求**:
```json
{
  "user_id": "123456",
  "reason": "骚扰"
}
```

**返回**:
```json
{
  "data": { "success": true },
  "status_code": 0
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `POST /api/v1/users/:userId/block`

---

## 消息发送类 API (2 个)

### 17. 发送消息 ⚠️

**IM API**: `POST /v1/im/message/send`

**功能**: 发送私信

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "content": "消息内容",
  "type": "text",
  "ext": {
    "image_url": "...",
    "duration": 0
  }
}
```

**返回**:
```json
{
  "data": {
    "message_id": "msg_new_001",
    "timestamp": 1635012345
  },
  "status_code": 0
}
```

**Master 对比**: ⚠️ **有，但方式不同**
- 当前方式: 通过 Worker 代理发送（浏览器自动化）
- 问题: 不是直接 HTTP API
- 建议: 保持现有架构（已足够）

---

### 18. 消息编辑/撤回 ❌

**IM API**: `POST /v1/im/message/edit` + `POST /v1/im/message/recall`

**功能**: 编辑或撤回已发送的消息

**请求 - 编辑**:
```json
{
  "message_id": "msg_001",
  "content": "新的消息内容"
}
```

**请求 - 撤回**:
```json
{
  "message_id": "msg_001"
}
```

**返回**:
```json
{
  "data": {
    "message_id": "msg_001",
    "updated_at": 1635012345
  }
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `PATCH /api/v1/messages/:id` (编辑) 和 `DELETE /api/v1/messages/:id` (撤回)

---

## 通知类 API (2 个)

### 19. 获取通知列表 ⚠️

**IM API**: `POST /v1/im/notification/get`

**功能**: 获取消息通知列表

**请求**:
```json
{
  "cursor": 0,
  "count": 50,
  "status": "unread|all"
}
```

**返回**:
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

**Master 对比**: ⚠️ **有，但结构不同**
- 接口: `GET /api/v1/notifications` (主要用 Socket.IO)
- 问题: HTTP API 格式不清楚
- 调整: 增强 HTTP API 支持

---

### 20. 标记通知已读 ✅

**IM API**: `POST /v1/im/notification/mark_read`

**功能**: 标记通知为已读

**请求**:
```json
{
  "notification_ids": ["notif_001", "notif_002"]
}
```

**返回**:
```json
{
  "data": {
    "updated_count": 2
  }
}
```

**Master 对比**: ✅ **完全相同**
- 接口: Socket.IO `client:notification:ack` (已实现)

---

## 扩展功能 API (4 个)

### 21. 对话标签 ❌

**IM API**: `POST /v1/im/conversation/tag`

**功能**: 为对话添加标签/分组

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "tags": ["重要", "客户"]
}
```

**返回**:
```json
{
  "data": { "success": true }
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `PATCH /api/v1/conversations/:id/tags`

---

### 22. 消息反应 ❌

**IM API**: `POST /v1/im/message/reaction`

**功能**: 给消息添加表情反应

**请求**:
```json
{
  "message_id": "msg_001",
  "emoji": "👍",
  "action": "add|remove"
}
```

**返回**:
```json
{
  "data": { "success": true }
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `POST /api/v1/messages/:id/reactions`

---

### 23. 消息增量同步 ❌

**功能**: 离线消息恢复

**请求**:
```json
{
  "last_sync_timestamp": 1697980000,
  "conversation_ids": ["conv-1"]
}
```

**返回**:
```json
{
  "data": {
    "messages": [...],
    "sync_timestamp": 1697980123,
    "total": 45,
    "has_more": true
  }
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `POST /api/v1/messages/sync`

---

### 24. 消息预览 ❌

**功能**: URL 链接预览、图片缩略图

**请求**:
```json
{
  "url": "https://example.com",
  "type": "link|image"
}
```

**返回**:
```json
{
  "data": {
    "title": "页面标题",
    "description": "页面描述",
    "image": "https://...",
    "url": "https://example.com"
  }
}
```

**Master 对比**: ❌ **无**
- 调整: 新增接口 `POST /api/v1/messages/preview`

---

## 总结表格

| # | API 名称 | 功能简述 | Master 状态 | 优先级 |
|----|---------|---------|-----------|--------|
| 1 | 获取私信初始列表 | 会话列表 | ⚠️ 需调整 | P1 |
| 2 | 查询单个会话详情 | 对话 + 消息 | ⚠️ 需调整 | P1 |
| 3 | 获取会话列表（增强） | 排序、搜索、过滤 | ⚠️ 需调整 | P2 |
| 4 | 会话未读统计 | 快速统计 | ❌ 无 | P3 |
| 5 | 搜索会话 | 按用户名搜索 | ❌ 无 | P2 |
| 6 | 置顶对话 | 优先级显示 | ❌ 无 | P2 |
| 7 | 静音对话 | 消息不提醒 | ❌ 无 | P3 |
| 8 | 获取消息历史 | 分页加载 | ⚠️ 需调整 | P1 |
| 9 | 获取单条消息 | 消息详情 | ✅ 相同 | - |
| 10 | 按类型查询消息 | 图片、视频等 | ⚠️ 需调整 | P3 |
| 11 | 消息搜索 | 全文搜索 | ❌ 无 | P1 |
| 12 | 标记消息已读 | 批量、对话级 | ⚠️ 需调整 | P1 |
| 13 | 已读状态同步 | 增量同步 | ❌ 无 | P2 |
| 14 | 获取用户信息 | 用户基本信息 | ❌ 无 | P1 |
| 15 | 搜索用户 | 搜索用户 | ❌ 无 | P3 |
| 16 | 用户黑名单 | 屏蔽用户 | ❌ 无 | P2 |
| 17 | 发送消息 | 发送私信 | ⚠️ 方式不同 | - |
| 18 | 消息编辑/撤回 | 编辑和撤回 | ❌ 无 | P2 |
| 19 | 获取通知列表 | 通知列表 | ⚠️ 结构不同 | P3 |
| 20 | 标记通知已读 | 通知已读 | ✅ 相同 | - |
| 21 | 对话标签 | 分组标签 | ❌ 无 | P2 |
| 22 | 消息反应 | 表情反应 | ❌ 无 | P3 |
| 23 | 消息增量同步 | 离线恢复 | ❌ 无 | P1 |
| 24 | 消息预览 | URL 预览 | ❌ 无 | P3 |

---

## 按优先级分组

### 🔴 P1 必须 (5 个)
1. 获取私信初始列表 (改进)
2. 查询单个会话详情 (合并)
3. 获取消息历史 (改进)
4. 消息搜索 (新增)
5. 标记消息已读 (改进)
6. 获取用户信息 (新增)
7. 消息增量同步 (新增)

**共 7 个，工作量 30-40h**

### 🟠 P2 重要 (6 个)
1. 获取会话列表增强 (改进)
2. 搜索会话 (新增)
3. 置顶对话 (新增)
4. 已读状态同步 (新增)
5. 消息编辑/撤回 (新增)
6. 用户黑名单 (新增)
7. 对话标签 (新增)

**共 7 个，工作量 40-50h**

### 🟡 P3 可选 (11 个)
1. 会话未读统计
2. 静音对话
3. 按类型查询消息
4. 搜索用户
5. 获取通知列表
6. 消息反应
7. 消息预览
+ 其他

**共 11 个，工作量 30+ h**

---

**完成！现在你有一个单一的清单文档，可以直接看表格对比。** ✅
