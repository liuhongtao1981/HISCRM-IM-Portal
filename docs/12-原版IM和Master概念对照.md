# 原版 IM 和 Master 概念对照表

**目的**: 澄清原版 IM 中的概念与 Master 中的对应关系

---

## 核心概念对照

| 原版 IM 概念 | Master 概念 | 说明 |
|-------------|-----------|------|
| **user** | **account** | 抖音账户，被监控的对象 |
| **会话** | **topic** / **conversation** | 视频评论话题 或 私信对话 |
| **message** | **comment** / **direct_message** | 评论消息 或 私信消息 |
| **friend** | **user** / **contact** | 好友/联系人 |

---

## 详细映射

### 1. User（用户） = Account（账户）

**原版 IM 中的 user**:
```json
{
  "user_id": "123456",
  "user_name": "张三",
  "avatar": "https://...",
  "status": "online",
  "signature": "个人签名"
}
```

**Master 中对应**:
```javascript
// accounts 表
{
  id: "account-123",
  account_name: "张三的抖音号",
  avatar: "https://...",
  platform: "douyin",
  platform_user_id: "123456",
  status: "active",  // 登录状态
  login_status: "logged_in"
}
```

**含义**:
- IM 的 user_id → Master 的 accounts.platform_user_id
- IM 的 user_name → Master 的 accounts.account_name
- IM 的 status → Master 的 accounts.login_status

---

### 2. 会话（Conversation）= Topic / Conversation

#### 场景 A: 视频评论话题

**原版 IM 中的会话**:
```json
{
  "conversation_id": "topic_123",
  "title": "【新品发布】最新款手机体验分享",
  "last_message": "这个手机太棒了！",
  "last_message_time": 1697980000,
  "unread_count": 5,
  "message_count": 50
}
```

**Master 中对应**:
```javascript
// comments 表（视频的所有评论）
// 或创建新的 topics 表
{
  id: "comment-123",  // 或 topic-123
  account_id: "account-123",  // 账户 ID
  content: "【新品发布】最新款手机体验分享",  // 视频内容/标题
  created_at: 1697900000,
  is_new: true,
  reply_count: 50,  // 评论数
  unread_count: 5   // 未读评论数
}
```

**含义**:
- IM 的 conversation_id → Master 的 comment.id
- IM 的 title → Master 的 comment.content（视频标题）
- IM 的 message_count → Master 的 comment.reply_count（回复数）
- IM 的 unread_count → Master 的未读回复数

---

#### 场景 B: 私信对话

**原版 IM 中的会话**:
```json
{
  "conversation_id": "dm_456",
  "other_user": {
    "user_id": "456789",
    "user_name": "李四",
    "avatar": "https://..."
  },
  "last_message": "你好，有什么需要帮助的吗？",
  "last_message_time": 1697980000,
  "unread_count": 2
}
```

**Master 中对应**:
```javascript
// conversations 表（与某个用户的私信对话）
{
  id: "conversation-456",
  account_id: "account-123",  // 我们的账户
  other_user_id: "456789",    // 对方用户 ID
  other_user_name: "李四",
  last_message: "你好，有什么需要帮助的吗？",
  last_message_time: 1697980000,
  unread_count: 2,
  created_at: 1697800000
}
```

**含义**:
- IM 的 conversation_id → Master 的 conversations.id
- IM 的 other_user.user_id → Master 的 conversations.other_user_id
- IM 的 unread_count → Master 的 conversations.unread_count

---

### 3. Message（消息）= Comment / DirectMessage

#### 场景 A: 视频评论消息

**原版 IM 中的消息**:
```json
{
  "message_id": "msg_001",
  "conversation_id": "topic_123",
  "from_user": {
    "user_id": "456789",
    "user_name": "李四"
  },
  "content": "这个视频太棒了！",
  "timestamp": 1697980000000,  // 毫秒
  "type": "text",
  "reply_to_message_id": "msg_000"  // 如果是回复
}
```

**Master 中对应**:
```javascript
// comments 表中的回复
{
  id: "msg_001",
  account_id: "account-123",
  parent_id: "msg_000",  // 被回复的消息
  sender_id: "456789",
  sender_name: "李四",
  content: "这个视频太棒了！",
  created_at: 1697980000,  // 秒
  type: "text",
  detected_at: 1697980000
}
```

**字段对照**:
- IM timestamp (毫秒) → Master created_at (秒) ÷ 1000
- IM reply_to_message_id → Master parent_id
- IM from_user → Master sender_id / sender_name

---

#### 场景 B: 私信消息

**原版 IM 中的消息**:
```json
{
  "message_id": "dm_msg_001",
  "conversation_id": "dm_456",
  "from_user": {
    "user_id": "456789",
    "user_name": "李四"
  },
  "to_user": {
    "user_id": "123456",
    "user_name": "张三"
  },
  "content": "你好，有什么需要帮助的吗？",
  "timestamp": 1697980000000,  // 毫秒
  "type": "text",
  "is_read": false
}
```

**Master 中对应**:
```javascript
// direct_messages 表
{
  id: "dm_msg_001",
  account_id: "account-123",  // 接收者账户
  conversation_id: "conversation-456",
  sender_id: "456789",
  sender_name: "李四",
  receiver_id: "123456",
  receiver_name: "张三",
  content: "你好，有什么需要帮助的吗？",
  created_at: 1697980000,  // 秒
  type: "text",
  is_read: false
}
```

**字段对照**:
- IM message_id → Master direct_messages.id
- IM conversation_id → Master direct_messages.conversation_id
- IM from_user.user_id → Master sender_id
- IM to_user.user_id → Master receiver_id
- IM timestamp (毫秒) → Master created_at (秒)

---

## crm-pc-im 中的概念

### Channel（频道）= Account（账户）

**crm-pc-im 中**:
```javascript
{
  id: "account-123",
  name: "张三的抖音号",
  avatar: "https://...",
  platform: "douyin",
  unreadCount: 5,
  lastMessage: "最新消息",
  lastMessageTime: 1697980000000,  // 毫秒
  isPinned: false
}
```

**对应 Master**:
```javascript
accounts 表 {
  id: "account-123",
  account_name: "张三的抖音号",
  avatar: "https://..."
}
```

---

### Topic（话题）= Comment（评论）或 Conversation（私信）

**crm-pc-im 中的 Topic**:
```javascript
{
  id: "comment-123",  // 视频评论话题
  channelId: "account-123",
  title: "【新品发布】最新款手机体验分享",
  messageCount: 50,  // 回复数
  unreadCount: 5,    // 未读回复数
  lastMessage: "棒极了！",
  lastMessageTime: 1697980000000,  // 毫秒
  isPinned: false
}
```

**对应 Master**:
```javascript
comments 表 {
  id: "comment-123",
  account_id: "account-123",
  content: "【新品发布】最新款手机体验分享",
  reply_count: 50,
  created_at: 1697900000  // 秒
}
```

---

### Message（消息）= Comment / DirectMessage（评论/私信）

**crm-pc-im 中的 Message**:
```javascript
{
  id: "msg-001",
  topicId: "comment-123",
  accountId: "account-123",
  fromId: "user-456",
  fromName: "李四",
  content: "这个视频太棒了！",
  type: "text",
  timestamp: 1697980000000,  // 毫秒
  replyToId: "msg-000",      // 如果是回复
  replyToContent: "被回复的消息"
}
```

**对应 Master**:
```javascript
comments 表中的回复 {
  id: "msg-001",
  account_id: "account-123",
  parent_id: "msg-000",
  sender_id: "user-456",
  sender_name: "李四",
  content: "这个视频太棒了！",
  created_at: 1697980000,  // 秒
  type: "text"
}
```

---

## 关键数据库表对照

| Master 表 | crm-pc-im 对应 | 说明 |
|----------|----------------|------|
| **accounts** | **Channel** | 抖音账户 |
| **comments** | **Topic**（视频评论） | 视频及其评论 |
| **direct_messages** | **Topic**（私信对话） | 私信对话 |
| **comments** (回复) | **Message** | 评论的回复 |
| **direct_messages** | **Message** | 私信消息 |

---

## 数据转换规则

### 时间戳转换

```javascript
// Master → crm-pc-im (秒 → 毫秒)
const timestamp_ms = created_at * 1000;

// crm-pc-im → Master (毫秒 → 秒)
const created_at = Math.floor(timestamp / 1000);
```

### 消息类型转换

```javascript
// Master → crm-pc-im
Master: 'TEXT' → crm: 'text'
Master: 'IMAGE' → crm: 'image'
Master: 'FILE' → crm: 'file'

// crm-pc-im → Master
crm: 'text' → Master: 'TEXT'
crm: 'image' → Master: 'IMAGE'
crm: 'file' → Master: 'FILE'
```

### ID 映射

```javascript
// Master 的 comment.id === crm-pc-im 的 Topic.id
// Master 的 comment.reply → crm-pc-im 的 Message.replyToId
// Master 的 comments.sender_id === crm-pc-im 的 Message.fromId
```

---

## 关键理解

### ✅ 正确的理解

1. **account 就是 user**
   - 我们监控的抖音账户就是 IM 中的用户
   - account 有 avatar, name, status 等用户属性

2. **视频评论是一种会话**
   - 一个视频 + 它的所有评论 = 一个 "话题"（Topic）
   - Topic 包含多个 Message（评论和回复）
   - Topic 需要追踪 unreadCount（未读评论数）

3. **私信也是一种会话**
   - 与某个用户的私信对话 = 一个 Conversation
   - Conversation 包含多个 Message（私信消息）
   - Conversation 需要追踪 unreadCount（未读私信数）

4. **消息可以有嵌套结构**
   - 视频评论可以被回复（评论的回复）
   - 私信没有嵌套，是平的线性结构

---

## Master 现有表结构

```
accounts (账户 = IM 的 user)
├── id
├── account_name (IM: user_name)
├── avatar (IM: avatar)
├── status
├── login_status
└── ...

comments (评论 = IM 的视频话题)
├── id (IM: conversation_id)
├── account_id (IM: user_id)
├── content (IM: 视频标题)
├── created_at
├── reply_count (IM: message_count)
└── ...

direct_messages (私信 = IM 的私信消息)
├── id (IM: message_id)
├── account_id (IM: user_id - 接收者)
├── sender_id (IM: from_user_id)
├── receiver_id (IM: to_user_id)
├── content (IM: message content)
├── created_at (IM: timestamp ÷ 1000)
└── ...
```

---

## 总结表格

| 维度 | 原版 IM | Master | crm-pc-im |
|------|--------|--------|-----------|
| **账户** | user | account | Channel |
| **视频话题** | conversation | comment | Topic |
| **私信对话** | conversation | conversation | Topic |
| **评论** | message | comment (reply) | Message |
| **私信** | message | direct_message | Message |
| **时间单位** | 毫秒 | 秒 | 毫秒 |
| **用户关键字** | user_id | account_id | fromId |

---

**现在对应关系清晰了！可以直接对照实现了。** ✅
