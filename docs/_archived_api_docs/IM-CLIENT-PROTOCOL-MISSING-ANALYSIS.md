# 原版抖音 IM 客户端协议缺口分析

**日期**: 2025-10-22
**状态**: ✅ 分析完成
**目标**: 识别 Master 中缺失的原版 IM 客户端协议接口

---

## 概览

HisCRM-IM Master 服务器与原版抖音 IM 客户端的集成中，有多个关键协议接口还未实现。本文档详细列出所有缺失的功能，按优先级排序，并提供实现建议。

---

## 已实现的功能（6 个核心功能）

### ✅ 已完成

| 功能 | 实现位置 | 状态 |
|------|---------|------|
| **私信爬取** | crawl-direct-messages-v2.js | ✅ 完整 |
| **会话管理** | conversations-dao.js | ✅ 完整 |
| **消息持久化** | messages-dao.js | ✅ 完整 |
| **客户端注册** | socket-server.js | ✅ 完整 |
| **离线推送** | notification-broadcaster.js | ✅ 完整 |
| **消息已读标记** | 基础实现 | ⚠️ 部分 |

---

## 缺失的接口（18 个）

### 优先级 1️⃣ - 必须实现（5 个，38 小时）

#### 1. 消息搜索接口 ⭐⭐

**功能需求**:
```
POST /api/v1/messages/search
{
  "query": "关键词",
  "conversation_id": "对话ID",
  "from_user_id": "发送者ID",
  "start_date": "2025-10-01",
  "end_date": "2025-10-22",
  "message_type": "text|image|video|file",
  "limit": 50,
  "offset": 0
}

Response:
{
  "messages": [...],
  "total": 123,
  "has_more": true
}
```

**预期工作量**: 8 小时
**技术复杂度**: ⭐⭐
**实现位置**: `packages/master/src/api/routes/messages.js`
**数据库**: 需要创建消息内容索引

**验收标准**:
- [ ] 支持关键词搜索
- [ ] 支持按发送者过滤
- [ ] 支持日期范围查询
- [ ] 支持消息类型过滤
- [ ] 响应时间 < 500ms (消息量 100k+)
- [ ] 支持分页

---

#### 2. 对话列表增强版 ⭐⭐

**功能需求**:
```
GET /api/v1/conversations
Query Params:
  - status: "active|archived|blocked"
  - sort_by: "last_message_time|unread_count|name"
  - search: "搜索对话"
  - limit: 50
  - offset: 0

Response:
{
  "conversations": [
    {
      "id": "conv-xxx",
      "friend_id": "user-xxx",
      "friend_name": "...",
      "friend_avatar": "...",
      "last_message": "...",
      "last_message_time": 1234567890,
      "unread_count": 3,
      "is_pinned": true,
      "is_archived": false,
      "is_blocked": false,
      "tags": ["重要", "客户"],
      "mute_until": null
    }
  ],
  "total": 42,
  "unread_total": 15
}
```

**预期工作量**: 6 小时
**技术复杂度**: ⭐⭐
**实现位置**: `packages/master/src/api/routes/conversations.js`
**数据库**: conversations_dao 需要新增过滤和排序方法

**验收标准**:
- [ ] 支持多种排序方式
- [ ] 支持搜索对话
- [ ] 支持分组筛选
- [ ] 返回未读计数
- [ ] 性能: 100 个对话 < 100ms

---

#### 3. 消息增量同步 ⭐⭐⭐ [最复杂]

**功能需求**:
```
GET /api/v1/messages/sync
Query Params:
  - last_sync_timestamp: 1234567890
  - account_id: "账户ID"

Response:
{
  "messages": [
    {
      "id": "msg-xxx",
      "conversation_id": "...",
      "sender_id": "...",
      "content": "...",
      "created_at": 1234567890,
      "read_at": null,
      "type": "text"
    }
  ],
  "deleted_message_ids": ["msg-xxx"],
  "next_sync_timestamp": 1234567900,
  "has_more": true
}
```

**问题背景**:
- 当前推送可能重复发送客户端已看过的消息
- 需要追踪最后一次同步时间戳
- 需要处理消息删除情况

**预期工作量**: 12 小时
**技术复杂度**: ⭐⭐⭐
**实现位置**: `packages/master/src/api/routes/sync.js` (新建)
**数据库**: 需要追踪客户端最后同步时间

**验收标准**:
- [ ] 不返回已同步过的消息
- [ ] 处理消息删除场景
- [ ] 支持增量批量处理
- [ ] 时间戳精确性 < 100ms
- [ ] 大量消息(10k+)时性能 < 1s

---

#### 4. 消息已读管理增强 ⭐⭐

**功能需求**:
```
PATCH /api/v1/messages/mark-read
{
  "conversation_id": "对话ID",     // 对话级别已读
  "message_ids": ["msg-1", "msg-2"], // 或单条消息
  "read_at": 1234567890
}

GET /api/v1/unread-summary
Response:
{
  "total_unread": 42,
  "conversations_unread": [
    {
      "conversation_id": "...",
      "unread_count": 3,
      "last_unread_message": "...",
      "last_unread_time": 1234567890
    }
  ]
}
```

**预期工作量**: 6 小时
**技术复杂度**: ⭐⭐
**实现位置**: `packages/master/src/api/routes/messages.js`
**数据库**: 优化 read_at 字段查询

**验收标准**:
- [ ] 对话级别标记已读
- [ ] 批量标记多个消息
- [ ] 未读摘要查询 < 100ms
- [ ] 保证数据一致性

---

#### 5. 用户信息查询 ⭐⭐

**功能需求**:
```
GET /api/v1/users/:platform_user_id
Response:
{
  "user_id": "1234567890",
  "name": "用户昵称",
  "avatar": "https://...",
  "signature": "个人签名",
  "follower_count": 12345,
  "following_count": 678,
  "video_count": 42,
  "is_verified": true,
  "is_friend": true,
  "platform": "douyin"
}

GET /api/v1/users/batch
{
  "user_ids": ["1234567890", "0987654321"]
}
Response:
{
  "users": [...]
}
```

**预期工作量**: 6 小时
**技术复杂度**: ⭐⭐
**实现位置**: `packages/master/src/api/routes/users.js` (新建)
**数据库**: 创建 users 表，缓存用户信息

**验收标准**:
- [ ] 支持单个和批量查询
- [ ] 缓存用户信息 (1 小时)
- [ ] 响应时间 < 100ms (缓存) / < 500ms (网络查询)
- [ ] 定期更新用户信息

---

### 优先级 2️⃣ - 重要功能（5 个，38 小时）

#### 6-7. 消息编辑与撤回 ⭐⭐⭐ (18h)

**函数需求**:
```
PUT /api/v1/messages/:message_id
{
  "content": "编辑后的内容"
}

DELETE /api/v1/messages/:message_id
// 撤回消息
```

**技术挑战**:
- 需要追踪消息编辑历史
- 撤回后客户端需要更新显示
- 需要通知其他参与者

**预期工作量**: 18 小时
**技术复杂度**: ⭐⭐⭐

---

#### 8. 黑名单管理 ⭐⭐ (8h)

**功能**:
```
POST /api/v1/users/:user_id/block
GET /api/v1/blocked-users
DELETE /api/v1/users/:user_id/unblock
```

**预期工作量**: 8 小时
**技术复杂度**: ⭐⭐

---

#### 9. 对话置顶 ⭐ (4h)

**功能**:
```
POST /api/v1/conversations/:conversation_id/pin
DELETE /api/v1/conversations/:conversation_id/unpin
```

**预期工作量**: 4 小时
**技术复杂度**: ⭐

---

#### 10. 对话标签/分组 ⭐⭐ (8h)

**功能**:
```
POST /api/v1/conversations/:conversation_id/tags
{
  "tags": ["重要", "客户"]
}
```

**预期工作量**: 8 小时
**技术复杂度**: ⭐⭐

---

### 优先级 3️⃣ - 可选功能（8 个，77 小时）

#### 11-18. 其他功能

| 功能 | 工作量 | 复杂度 | 说明 |
|------|--------|--------|------|
| 消息推荐 | 12h | ⭐⭐⭐ | 基于热度、转发、点赞等 |
| 统计分析 | 10h | ⭐⭐ | 消息量、活跃度、趋势等 |
| 文件传输 | 14h | ⭐⭐⭐ | 上传、下载、预览 |
| 消息转发 | 8h | ⭐⭐ | 转发给多个对话 |
| 消息静音 | 6h | ⭐ | 对话免打扰 |
| 表情反应 | 10h | ⭐⭐ | 点赞、评论反应等 |
| 消息预览 | 8h | ⭐⭐ | 链接预览、富文本 |
| 定时发送 | 9h | ⭐⭐ | 预约发送消息 |

---

## 📊 工作量总结

```
优先级 1 (P1)    5 个接口  38 小时   2 周   1-2 人
优先级 2 (P2)    5 个接口  38 小时   2 周   1-2 人
优先级 3 (P3)    8 个接口  77 小时   3 周   1 人
─────────────────────────────────────────────────
总计            18 个接口  153 小时  7 周   1-2 人
```

---

## 🚀 建议的实现路线

### 第 1 阶段（2 周）- P1 必须功能

**周 1**:
1. 对话列表增强 (6h) - 基础功能，快速见效
2. 消息已读管理 (6h) - 提升用户体验
3. 用户信息查询 (6h) - 数据补充

**周 2**:
4. 消息搜索 (8h) - 核心功能
5. 消息同步增强 (12h) - 避免重复推送

**里程碑**: 完成核心功能，用户体验大幅提升

### 第 2 阶段（2 周）- P2 重要功能

**周 3**:
6. 对话置顶 (4h)
7. 对话标签 (8h)
8. 黑名单管理 (8h)

**周 4**:
9. 消息编辑 (9h)
10. 消息撤回 (9h)

**里程碑**: 完成用户管理功能

### 第 3 阶段（按需）- P3 可选功能

根据业务需求逐步实现

---

## 📂 实现位置和文件变更

### 需要创建的新文件（6 个）

```
packages/master/src/api/routes/
├── sync.js                    (消息同步)
├── users.js                   (用户信息查询)
└── search.js                  (搜索功能)

packages/master/src/database/
├── users-dao.js               (用户数据访问)
├── user-blocks-dao.js         (黑名单数据访问)
└── message-edits-dao.js       (消息编辑历史)
```

### 需要修改的现有文件（15+ 个）

```
packages/master/src/
├── api/routes/conversations.js  (+增强查询)
├── api/routes/messages.js       (+搜索、编辑、撤回)
├── database/conversations-dao.js (+排序、过滤)
├── database/messages-dao.js     (+索引优化)
├── database/notifications-dao.js (已完成)
├── communication/socket-server.js (已完成)
└── ...
```

### 数据库 Schema 扩展

```sql
-- 用户表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT UNIQUE,
  name TEXT,
  avatar TEXT,
  signature TEXT,
  follower_count INTEGER,
  following_count INTEGER,
  video_count INTEGER,
  is_verified BOOLEAN,
  last_updated_at INTEGER,
  created_at INTEGER
);

-- 用户黑名单
CREATE TABLE user_blocks (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  blocked_user_id TEXT,
  created_at INTEGER,
  UNIQUE(account_id, blocked_user_id)
);

-- 消息编辑历史
CREATE TABLE message_edits (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  content TEXT,
  edited_at INTEGER,
  created_at INTEGER
);

-- 对话标签
CREATE TABLE conversation_tags (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  tag TEXT,
  created_at INTEGER,
  UNIQUE(conversation_id, tag)
);

-- 消息同步记录（跟踪客户端最后同步时间）
CREATE TABLE client_sync_records (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  account_id TEXT,
  last_sync_timestamp INTEGER,
  updated_at INTEGER,
  UNIQUE(device_id, account_id)
);
```

---

## 🎯 性能指标和优化建议

### 搜索性能优化

```sql
-- 添加全文索引
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  conversation_id,
  created_at
);

-- 定期更新索引
PRAGMA optimize;
```

### 对话列表性能优化

```javascript
// 缓存未读计数
const unreadCache = new Map();  // TTL: 5 分钟

// 使用视图减少计算
CREATE VIEW conversation_summary AS
SELECT
  c.id,
  c.friend_id,
  c.last_message,
  COUNT(DISTINCT m.id) as unread_count,
  MAX(m.created_at) as last_message_time
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id AND m.read_at IS NULL
GROUP BY c.id;
```

### 同步性能优化

```javascript
// 批量查询新消息
const BATCH_SIZE = 1000;
const messages = await messagesDao.getMessagesSince(
  lastSyncTime,
  BATCH_SIZE
);

// 使用流处理大量消息
const stream = messagesDao.createMessageStream(lastSyncTime);
stream.on('data', (message) => {
  // 处理单条消息
});
```

---

## 🔍 实现优先级理由

### 为什么 P1 必须优先实现

1. **对话列表** - 用户首先看到的，直接影响 UX
2. **消息已读** - 提升消息管理体验
3. **用户信息** - 补充用户头像、昵称等必需信息
4. **消息搜索** - 用户高频需求
5. **消息同步** - 避免消息重复，提升可靠性

### 为什么 P2 次优先

1. **用户管理** (黑名单、置顶、标签) - 提升平台治理
2. **消息编辑/撤回** - 提升消息准确性

### 为什么 P3 可选

- 增强功能，不影响核心业务
- 可根据用户反馈逐步添加

---

## ✅ 验收标准模板

每个功能实现时应检查：

```
□ API 端点实现完整
□ 数据库操作正确
□ 错误处理完善
□ 日志记录详细
□ 性能指标符合要求
□ 单元测试覆盖
□ 集成测试通过
□ 文档完整
□ Code Review 通过
□ 部署到测试环境验证
```

---

## 总结

Master 服务器与原版抖音 IM 客户端的集成尚有 **18 个关键功能缺失**，分三个优先级：

- **P1 (必须)**: 5 个接口，38 小时，2 周完成
- **P2 (重要)**: 5 个接口，38 小时，2 周完成
- **P3 (可选)**: 8 个接口，77 小时，按需实现

**建议**: 按照 P1 → P2 → P3 的顺序实现，预计 4-7 周完成所有功能。

---

**报告日期**: 2025-10-22
**报告版本**: v1.0
**下一步**: 根据业务优先级选择 P1 功能中的第一个开始实现
