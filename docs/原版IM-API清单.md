# 原版 IM (抖音IM) API 完整清单

**数据来源**: 从现有项目文档和之前的分析中提取

**API 总数**: 24 个

**分类**: 6 大类

---

## 一、账户管理接口 (6 个)

### 1. 获取账户列表

**API**: `GET /accounts` 或 `POST /v1/user/get_user_info`

**请求参数**:
```json
{
  "cursor": 0,
  "count": 20,
  "status": "active"  // 可选
}
```

**返回**:
```json
{
  "data": {
    "users": [
      {
        "user_id": "user_123",
        "user_name": "张三",
        "avatar": "https://...",
        "signature": "个人签名",
        "verified": false,
        "follower_count": 1000,
        "status": "active"
      }
    ],
    "cursor": "next_cursor",
    "has_more": true
  },
  "status_code": 0
}
```

---

### 2. 获取单个账户信息

**API**: `GET /accounts/{userId}` 或 `GET /v1/user/detail`

**请求参数**:
```json
{
  "user_id": "user_123"
}
```

**返回**:
```json
{
  "data": {
    "user_id": "user_123",
    "user_name": "张三",
    "avatar": "https://...",
    "signature": "个人签名",
    "verified": false,
    "follower_count": 1000,
    "following_count": 500,
    "video_count": 100,
    "total_likes": 10000
  },
  "status_code": 0
}
```

---

### 3. 创建账户

**API**: `POST /accounts`

**请求体**:
```json
{
  "platform": "douyin",
  "user_id": "user_123",
  "user_name": "张三",
  "avatar": "https://...",
  "credentials": {
    "session_id": "...",
    "cookies": "..."
  }
}
```

**返回**:
```json
{
  "data": {
    "account_id": "acc_123",
    "user_id": "user_123",
    "status": "active"
  },
  "status_code": 0
}
```

---

### 4. 更新账户信息

**API**: `PATCH /accounts/{userId}`

**请求体**:
```json
{
  "user_name": "新名字",
  "signature": "新签名",
  "avatar": "https://..."
}
```

**返回**:
```json
{
  "data": {
    "success": true,
    "user_id": "user_123"
  },
  "status_code": 0
}
```

---

### 5. 删除账户

**API**: `DELETE /accounts/{userId}`

**返回**:
```json
{
  "data": {
    "success": true
  },
  "status_code": 0
}
```

---

### 6. 获取账户状态

**API**: `GET /accounts/status` 或 `GET /v1/account/status`

**请求参数**:
```json
{
  "user_ids": ["user_123", "user_456"]  // 可选，不提供则获取全部
}
```

**返回**:
```json
{
  "data": {
    "statuses": [
      {
        "user_id": "user_123",
        "login_status": "logged_in",  // logged_in, logging_in, not_logged_in, login_failed
        "is_online": true,
        "last_active_time": 1635012345
      }
    ]
  },
  "status_code": 0
}
```

---

## 二、会话/对话接口 (4 个)

### 7. 获取会话列表 (初始化)

**API**: `POST /v1/message/get_by_user_init`

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
        "conversation_id": "123456_abcdef",     // 对方user_id_md5或特殊格式
        "other_user_id": "user_456",
        "other_user_name": "李四",
        "other_user_avatar": "https://...",
        "last_message": {
          "content": "最后一条消息内容",
          "type": "text",
          "timestamp": 1635012345
        },
        "unread_count": 3,
        "last_message_time": 1635012345,
        "is_group": false,
        "is_muted": false,
        "is_pinned": false
      }
    ],
    "cursor": "next_cursor_value",
    "has_more": true,
    "total_count": 50
  },
  "status_code": 0
}
```

---

### 8. 获取会话详情

**API**: `POST /v1/im/query_conversation`

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "include_messages": true,
  "message_count": 50,
  "sort": "desc"  // asc, desc
}
```

**返回**:
```json
{
  "data": {
    "conversation": {
      "conversation_id": "123456_abcdef",
      "other_user_id": "user_456",
      "other_user_name": "李四",
      "other_user_avatar": "https://...",
      "is_group": false,
      "is_muted": false,
      "is_pinned": false,
      "unread_count": 3,
      "total_message_count": 150
    },
    "messages": [
      {
        "platform_message_id": "msg_001",
        "conversation_id": "123456_abcdef",
        "content": "消息内容",
        "sender_id": "user_456",
        "sender_name": "李四",
        "receiver_id": "user_123",
        "receiver_name": "我的账户",
        "created_at": 1635012345,
        "type": "text",  // text, image, file, video
        "is_read": true,
        "direction": "inbound",  // inbound, outbound
        "media_url": null
      }
    ]
  },
  "status_code": 0
}
```

---

### 9. 搜索会话

**API**: `GET /conversations/search` 或 `POST /v1/im/search_conversation`

**请求参数**:
```json
{
  "query": "用户名或关键词",
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "data": {
    "conversations": [
      {
        "conversation_id": "...",
        "other_user_name": "...",
        "match_score": 0.95
      }
    ],
    "total": 5
  },
  "status_code": 0
}
```

---

### 10. 会话置顶/取消置顶

**API**: `PATCH /conversations/{conversationId}/pin`

**请求**:
```json
{
  "is_pinned": true
}
```

**返回**:
```json
{
  "data": {
    "success": true
  },
  "status_code": 0
}
```

---

## 三、消息查询接口 (6 个)

### 11. 获取消息历史

**API**: `POST /v1/im/message/history`

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "cursor": 0,
  "count": 50,
  "direction": "backward",  // backward, forward
  "start_time": 1635000000,  // 可选
  "end_time": 1635100000     // 可选
}
```

**返回**:
```json
{
  "data": {
    "messages": [
      {
        "platform_message_id": "msg_001",
        "conversation_id": "123456_abcdef",
        "content": "消息内容",
        "sender_id": "user_456",
        "sender_name": "李四",
        "receiver_id": "user_123",
        "created_at": 1635012345,
        "type": "text",
        "is_read": true,
        "direction": "inbound",
        "reply_to_message_id": "msg_000",
        "media_url": null,
        "media_type": null
      }
    ],
    "cursor": "next_cursor",
    "has_more": true,
    "total_count": 500
  },
  "status_code": 0
}
```

---

### 12. 获取单条消息

**API**: `GET /messages/{messageId}` 或 `POST /v1/im/query_message`

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
    "platform_message_id": "msg_001",
    "conversation_id": "123456_abcdef",
    "content": "消息内容",
    "sender_id": "user_456",
    "created_at": 1635012345,
    "type": "text",
    "is_read": true
  },
  "status_code": 0
}
```

---

### 13. 按类型查询消息

**API**: `GET /messages?type=image` 或 `POST /v1/im/message/by_type`

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "message_type": "image",  // text, image, file, video
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "data": {
    "messages": [
      {
        "platform_message_id": "msg_001",
        "type": "image",
        "media_url": "https://...",
        "created_at": 1635012345
      }
    ],
    "total": 100
  },
  "status_code": 0
}
```

---

### 14. 搜索消息

**API**: `GET /messages/search` 或 `POST /v1/im/search_message`

**请求**:
```json
{
  "query": "关键词",
  "conversation_id": "123456_abcdef",  // 可选
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
        "platform_message_id": "msg_001",
        "content": "包含<mark>关键词</mark>的内容",
        "highlight": "...关键词...",
        "created_at": 1635012345,
        "relevance": 0.95
      }
    ],
    "total": 234
  },
  "status_code": 0
}
```

---

### 15. 消息统计

**API**: `GET /messages/stats` 或 `POST /v1/im/message/stats`

**请求**:
```json
{
  "conversation_id": "123456_abcdef",  // 可选
  "start_time": 1635000000,
  "end_time": 1635100000
}
```

**返回**:
```json
{
  "data": {
    "total_messages": 1000,
    "unread_count": 5,
    "type_distribution": {
      "text": 800,
      "image": 150,
      "file": 30,
      "video": 20
    },
    "messages_by_day": {
      "2025-10-01": 50,
      "2025-10-02": 45,
      ...
    }
  },
  "status_code": 0
}
```

---

## 四、消息操作接口 (5 个)

### 16. 标记消息已读

**API**: `POST /messages/{messageId}/read` 或 `PATCH /messages/mark-read`

**请求**:
```json
{
  "message_ids": ["msg_001", "msg_002"],  // 批量
  "conversation_id": "123456_abcdef",      // 或按对话标记全部
  "read_at": 1697980000
}
```

**返回**:
```json
{
  "data": {
    "success": true,
    "updated_count": 2
  },
  "status_code": 0
}
```

---

### 17. 发送消息

**API**: `POST /messages/send` 或 `POST /v1/im/send_message`

**请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "content": "我的回复内容",
  "type": "text",  // text, image, file, video
  "reply_to_message_id": "msg_000",  // 可选，回复某条消息
  "media_url": null,  // 当 type 为 image/file/video 时
  "media_type": null
}
```

**返回**:
```json
{
  "data": {
    "platform_message_id": "msg_new_001",
    "conversation_id": "123456_abcdef",
    "created_at": 1697980000,
    "status": "sent"  // sent, sending, failed
  },
  "status_code": 0
}
```

---

### 18. 编辑消息

**API**: `PATCH /messages/{messageId}` 或 `POST /v1/im/edit_message`

**请求**:
```json
{
  "content": "编辑后的内容"
}
```

**返回**:
```json
{
  "data": {
    "success": true,
    "edited_at": 1697980000,
    "edit_history": [
      {
        "old_content": "原始内容",
        "new_content": "编辑后的内容",
        "edited_at": 1697980000
      }
    ]
  },
  "status_code": 0
}
```

---

### 19. 删除消息

**API**: `DELETE /messages/{messageId}` 或 `POST /v1/im/delete_message`

**请求**:
```json
{
  "message_id": "msg_001",
  "soft_delete": true  // 软删除或真实删除
}
```

**返回**:
```json
{
  "data": {
    "success": true,
    "deleted_at": 1697980000
  },
  "status_code": 0
}
```

---

### 20. 会话静音/取消静音

**API**: `PATCH /conversations/{conversationId}/mute`

**请求**:
```json
{
  "is_muted": true,
  "mute_until": 1697980000  // 可选，静音至某个时间
}
```

**返回**:
```json
{
  "data": {
    "success": true
  },
  "status_code": 0
}
```

---

## 五、用户管理接口 (3 个)

### 21. 获取用户信息

**API**: `GET /users/{userId}` 或 `POST /v1/user/get_user_info`

**请求**:
```json
{
  "user_id": "user_456"
}
```

**返回**:
```json
{
  "data": {
    "user_id": "user_456",
    "user_name": "李四",
    "avatar": "https://...",
    "signature": "个人签名",
    "verified": false,
    "follower_count": 1000,
    "following_count": 500,
    "video_count": 100,
    "is_blocked": false,
    "is_friend": true
  },
  "status_code": 0
}
```

---

### 22. 搜索用户

**API**: `GET /users/search` 或 `POST /v1/user/search`

**请求**:
```json
{
  "query": "用户名",
  "cursor": 0,
  "count": 50,
  "type": "user"  // user, video, topic
}
```

**返回**:
```json
{
  "data": {
    "users": [
      {
        "user_id": "user_456",
        "user_name": "李四",
        "avatar": "https://...",
        "verified": false,
        "follower_count": 1000
      }
    ],
    "total": 10
  },
  "status_code": 0
}
```

---

### 23. 用户拉黑

**API**: `POST /users/{userId}/block` 或 `POST /v1/user/block`

**请求**:
```json
{
  "user_id": "user_456",
  "reason": "骚扰"  // 可选
}
```

**返回**:
```json
{
  "data": {
    "success": true,
    "blocked_at": 1697980000
  },
  "status_code": 0
}
```

---

### 24. 获取黑名单

**API**: `GET /users/blacklist` 或 `POST /v1/user/blacklist`

**请求**:
```json
{
  "cursor": 0,
  "count": 50
}
```

**返回**:
```json
{
  "data": {
    "blocked_users": [
      {
        "user_id": "user_456",
        "user_name": "李四",
        "blocked_at": 1697980000,
        "reason": "骚扰"
      }
    ],
    "total": 5
  },
  "status_code": 0
}
```

---

## 总结表格

| # | 分类 | 接口名 | API 端点 | 类型 | 工作量估计 |
|----|------|--------|---------|------|----------|
| **账户 (6)** |
| 1 | 账户 | 获取列表 | GET /accounts | REST | 小 |
| 2 | 账户 | 获取单个 | GET /accounts/:id | REST | 小 |
| 3 | 账户 | 创建 | POST /accounts | REST | 小 |
| 4 | 账户 | 更新 | PATCH /accounts/:id | REST | 小 |
| 5 | 账户 | 删除 | DELETE /accounts/:id | REST | 小 |
| 6 | 账户 | 获取状态 | GET /accounts/status | REST | 小 |
| **会话 (4)** |
| 7 | 会话 | 会话列表 | POST /v1/message/get_by_user_init | RPC | 中 |
| 8 | 会话 | 会话详情 | POST /v1/im/query_conversation | RPC | 中 |
| 9 | 会话 | 搜索 | POST /v1/im/search_conversation | RPC | 中 |
| 10 | 会话 | 置顶/静音 | PATCH /conversations/:id/pin | REST | 小 |
| **消息查询 (6)** |
| 11 | 消息 | 消息历史 | POST /v1/im/message/history | RPC | 中 |
| 12 | 消息 | 单条消息 | POST /v1/im/query_message | RPC | 小 |
| 13 | 消息 | 按类型查询 | POST /v1/im/message/by_type | RPC | 中 |
| 14 | 消息 | 搜索 | POST /v1/im/search_message | RPC | 大 |
| 15 | 消息 | 统计 | POST /v1/im/message/stats | RPC | 小 |
| **消息操作 (5)** |
| 16 | 操作 | 标记已读 | PATCH /messages/mark-read | REST | 小 |
| 17 | 操作 | 发送消息 | POST /v1/im/send_message | RPC | 大 |
| 18 | 操作 | 编辑消息 | POST /v1/im/edit_message | RPC | 中 |
| 19 | 操作 | 删除消息 | POST /v1/im/delete_message | RPC | 中 |
| 20 | 操作 | 会话静音 | PATCH /conversations/:id/mute | REST | 小 |
| **用户管理 (3)** |
| 21 | 用户 | 用户信息 | POST /v1/user/get_user_info | RPC | 小 |
| 22 | 用户 | 搜索用户 | POST /v1/user/search | RPC | 中 |
| 23 | 用户 | 拉黑 | POST /v1/user/block | RPC | 小 |
| 24 | 用户 | 黑名单 | POST /v1/user/blacklist | RPC | 小 |

---

## 关键特性

### 1. 数据格式标准
- 所有响应都包含 `status_code`（0 表示成功）
- 数据包装在 `data` 字段内
- 支持分页：`cursor`/`count` 或 `offset`/`limit`

### 2. 时间单位
- 所有时间戳为 **毫秒** (milliseconds)
- 格式: `1697980000` (13 位)
- 对比 Master 使用秒的差异

### 3. 消息类型
- `text` - 文本
- `image` - 图片
- `file` - 文件
- `video` - 视频

### 4. 方向标记
- `inbound` - 接收的消息
- `outbound` - 发送的消息

### 5. 会话概念
- **私信会话**: 一对一消息对话
- **conversation_id** = `other_user_id` 或特殊格式

### 6. 消息搜索
- 支持全文搜索 (FTS)
- 支持日期范围筛选
- 支持消息类型过滤
- 返回高亮结果

---

## Master 对标情况

| 类别 | 原版数量 | Master 现有 | 缺失数量 | 完整度 |
|------|---------|-----------|---------|-------|
| 账户管理 | 6 | 6 | 0 | ✅ 100% |
| 会话查询 | 4 | 1 | 3 | ⚠️ 25% |
| 消息查询 | 6 | 2 | 4 | ⚠️ 33% |
| 消息操作 | 5 | 1 | 4 | ⚠️ 20% |
| 用户管理 | 3 | 0 | 3 | ❌ 0% |
| **总计** | **24** | **10** | **14** | **42%** |

---

## 参考文档

- [Master-API现有清单.md](./Master-API现有清单.md) - Master 当前已实现接口
- [13-Master缺失接口精准对比.md](./13-Master缺失接口精准对比.md) - 详细缺口分析

