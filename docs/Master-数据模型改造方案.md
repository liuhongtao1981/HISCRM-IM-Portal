# Master 数据模型改造方案

## 目录
1. [当前问题](#当前问题)
2. [改造目标](#改造目标)
3. [数据模型设计](#数据模型设计)
4. [实施路线图](#实施路线图)
5. [API 适配](#api-适配)
6. [迁移策略](#迁移策略)

---

## 当前问题

### 问题 1：数据分层不足
```
当前：Account → Comments/DirectMessages（2层）
期望：Account → Topics → Sessions → Messages（4层）
```

### 问题 2：缺乏消息关系追踪
- 无法表示"某个回复是对另一条消息的回复"
- 无法形成评论讨论树
- 无法区分一级评论和二级评论

### 问题 3：会话上下文缺失
- 无法追踪"这是对哪个客户问题的回复"
- 无法统计"某个问题有多少条回复"
- 无法区分不同话题的回复

### 问题 4：统计数据不完整
- 无法快速查询某账户的消息总数
- 无法显示最后一条消息内容
- 无法实现置顶功能

---

## 改造目标

### 目标 1：支持消息分层
```
实现从以下结构：
  Account
    ├─ Comment/DirectMessage 1
    ├─ Comment/DirectMessage 2
    └─ Comment/DirectMessage 3

改为：
  Account
    ├─ Topic 1（主题）
    │   ├─ Session 1（会话）
    │   │   ├─ Message 1
    │   │   ├─ Message 2 (回复给 Message 1)
    │   │   └─ Message 3 (回复给 Message 2)
    │   └─ Session 2（会话）
    │       └─ ...
    └─ Topic 2（主题）
        └─ ...
```

### 目标 2：完整的消息关系链
- 每条消息都可以标记"我是对谁的回复"
- 支持消息树形结构显示
- 支持 @ 提及某条消息

### 目标 3：清晰的会话管理
- 每个客户问题对应一个 Session
- 可以查看这个问题的所有回复历史
- 可以标记会话状态（已解决、进行中等）

### 目标 4：完善的统计信息
- 账户消息总数
- 主题消息计数
- 会话回复计数
- 最后消息时间和内容

---

## 数据模型设计

### 当前表结构

```sql
-- 现有表（简化版）
accounts {
  id, platform, account_id, account_name, avatar_url,
  status, login_status, worker_id, created_at
}

comments {
  id, account_id, from_id, from_name, content,
  message_type, created_at
}

direct_messages {
  id, account_id, from_id, from_name, content,
  message_type, created_at
}
```

### 改造后的表结构

#### 1. 保持 accounts 表不变，增加字段

```sql
ALTER TABLE accounts ADD COLUMN (
  message_count INT DEFAULT 0,           -- 该账户的消息总数
  is_pinned BOOLEAN DEFAULT FALSE,       -- 是否置顶
  last_message TEXT,                     -- 最后消息内容
  last_message_time TIMESTAMP            -- 最后消息时间
);
```

#### 2. 新增 topics 表（主题）

```sql
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),

  -- 基本信息
  title VARCHAR(255) NOT NULL,           -- 主题标题
  description TEXT,                      -- 主题描述

  -- 统计信息
  message_count INT DEFAULT 0,           -- 该主题的消息数
  session_count INT DEFAULT 0,           -- 该主题的会话数
  is_pinned BOOLEAN DEFAULT FALSE,       -- 是否置顶

  -- 最后活动信息
  last_message_time TIMESTAMP,           -- 最后消息时间
  last_message TEXT,                     -- 最后消息内容
  last_session_id UUID,                  -- 最后活动的会话

  -- 时间戳
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  -- 约束
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 创建索引加快查询
CREATE INDEX idx_topics_account_id ON topics(account_id);
CREATE INDEX idx_topics_pinned ON topics(is_pinned) WHERE is_pinned = true;
```

#### 3. 新增 sessions 表（会话）

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  topic_id UUID REFERENCES topics(id),

  -- 会话标识信息
  user_id TEXT NOT NULL,                 -- 客户用户ID
  user_name VARCHAR(255) NOT NULL,       -- 客户用户名
  user_avatar TEXT,                      -- 客户头像

  -- 会话内容
  first_message TEXT NOT NULL,           -- 首条消息（问题摘要）

  -- 统计信息
  message_count INT DEFAULT 0,           -- 该会话的消息数
  reply_count INT DEFAULT 0,             -- 回复数

  -- 会话状态
  status VARCHAR(50) DEFAULT 'active',   -- 状态：active/resolved/closed
  priority INT DEFAULT 0,                -- 优先级
  is_pinned BOOLEAN DEFAULT FALSE,       -- 是否置顶

  -- 时间信息
  created_at TIMESTAMP DEFAULT now(),
  last_message_time TIMESTAMP,           -- 最后消息时间
  resolved_at TIMESTAMP,                 -- 解决时间

  -- 约束
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

CREATE INDEX idx_sessions_account_id ON sessions(account_id);
CREATE INDEX idx_sessions_topic_id ON sessions(topic_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
```

#### 4. 修改 comments 表

```sql
ALTER TABLE comments ADD COLUMN (
  topic_id UUID REFERENCES topics(id),           -- 所属主题
  session_id UUID REFERENCES sessions(id),       -- 所属会话
  reply_to_id UUID REFERENCES comments(id),      -- 回复的消息ID
  reply_to_content TEXT,                         -- 回复的原始内容
  parent_id UUID REFERENCES comments(id),        -- 父消息ID（用于树形结构）
  message_depth INT DEFAULT 0,                   -- 消息深度（用于显示缩进）
  is_reply_from_staff BOOLEAN DEFAULT FALSE      -- 是否是员工回复
);

CREATE INDEX idx_comments_topic_id ON comments(topic_id);
CREATE INDEX idx_comments_session_id ON comments(session_id);
CREATE INDEX idx_comments_reply_to_id ON comments(reply_to_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
```

#### 5. 修改 direct_messages 表（类似 comments）

```sql
ALTER TABLE direct_messages ADD COLUMN (
  session_id UUID REFERENCES sessions(id),       -- 所属会话
  reply_to_id UUID REFERENCES direct_messages(id),
  reply_to_content TEXT,
  parent_id UUID REFERENCES direct_messages(id),
  is_reply_from_staff BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_direct_messages_session_id ON direct_messages(session_id);
CREATE INDEX idx_direct_messages_reply_to_id ON direct_messages(reply_to_id);
```

---

## 实施路线图

### Phase 1: 数据库准备（第1周）

**任务：**
1. 创建 topics 和 sessions 表
2. 为 comments/direct_messages 表增加新字段
3. 为 accounts 表增加统计字段
4. 创建必要的索引和约束

**SQL 脚本：**
```sql
-- 创建 topics 表
-- 创建 sessions 表
-- ALTER comments 表
-- ALTER direct_messages 表
-- ALTER accounts 表
-- 创建所有索引
```

**验证：**
- ✅ 表结构创建成功
- ✅ 索引创建成功
- ✅ 外键约束正确

---

### Phase 2: 数据迁移（第2周）

**任务：**
1. 为现有评论数据创建默认 Topic
2. 为现有评论数据创建默认 Session
3. 更新统计字段（message_count, last_message_time 等）

**迁移逻辑：**
```javascript
// 伪代码
for each account {
  // 创建默认主题
  const topic = createDefaultTopic(account);

  // 从所有评论创建会话
  const comments = getAllCommentsByAccount(account);

  for each group of comments by user_id {
    const session = createSession({
      account_id: account.id,
      topic_id: topic.id,
      user_id: group[0].from_id,
      user_name: group[0].from_name,
      first_message: group[0].content
    });

    // 更新这些评论的 session_id 和 topic_id
    updateComments(group.ids, {
      session_id: session.id,
      topic_id: topic.id
    });
  }

  // 更新账户统计信息
  updateAccountStats(account);
}
```

**验证：**
- ✅ 所有现有数据都有 topic_id
- ✅ 所有现有数据都有 session_id
- ✅ 统计字段正确

---

### Phase 3: API 更新（第3周）

**需要更新的 API：**

1. **获取账户详情** - 增加 message_count
2. **获取评论列表** - 支持按 topic/session 过滤
3. **获取评论详情** - 返回 reply_to 信息
4. **发送回复** - 支持指定 topic_id/session_id/reply_to_id
5. **新增主题管理 API**
6. **新增会话管理 API**

**示例 API：**

```javascript
// 获取账户及其主题列表
GET /api/accounts/:accountId?include=topics
{
  account: { ... },
  topics: [
    {
      id: "topic_xxx",
      title: "主题1",
      message_count: 10,
      session_count: 3
    }
  ]
}

// 获取某个主题的会话
GET /api/topics/:topicId/sessions
{
  sessions: [
    {
      id: "session_xxx",
      user_name: "张三",
      first_message: "请问...",
      message_count: 5,
      status: "active"
    }
  ]
}

// 获取某个会话的消息树
GET /api/sessions/:sessionId/messages
{
  messages: [
    {
      id: "msg_1",
      content: "消息1",
      from_name: "张三",
      replies: [
        {
          id: "msg_2",
          content: "我的回复",
          from_name: "客服",
          reply_to_id: "msg_1"
        }
      ]
    }
  ]
}

// 发送回复
POST /api/sessions/:sessionId/reply
{
  content: "感谢您的咨询...",
  reply_to_id: "msg_1",           // 可选：回复某条消息
  message_type: "text"
}
```

---

### Phase 4: UI 适配（第4周）

**UI 层级调整：**

```
当前：
Account Detail
  ├─ Comments Tab
  └─ DirectMessages Tab

改为：
Account Detail
  ├─ Topics Panel（主题列表）
  │   └─ Topic Detail
  │       ├─ Sessions List（会话列表）
  │       │   └─ Session Detail
  │       │       └─ Messages（消息树）
  │       └─ Quick Reply
  └─ Statistics（统计）
```

**UI 组件更新：**
- ✅ 主题选择器
- ✅ 会话列表
- ✅ 消息树形显示
- ✅ 上下文感知的回复框

---

## API 适配

### 向后兼容策略

**方案：** 在调用现有 API 时，自动关联默认 Topic 和 Session

```javascript
// 旧 API（仍然可用）
POST /api/comments
{
  account_id: "xxx",
  content: "评论内容"
}

// 后端处理
const defaultTopic = await getOrCreateDefaultTopic(accountId);
const comment = await createComment({
  account_id: accountId,
  topic_id: defaultTopic.id,        // 自动关联
  session_id: session_id,            // 根据 from_id 关联
  content: "评论内容"
});
```

### 新 API

```javascript
// 新 API（推荐）
POST /api/sessions/:sessionId/messages
{
  content: "评论内容",
  reply_to_id: "msg_xxx",  // 可选
  message_type: "text"
}

GET /api/topics
GET /api/topics/:topicId
POST /api/topics
PATCH /api/topics/:topicId

GET /api/sessions
GET /api/sessions/:sessionId
POST /api/sessions
PATCH /api/sessions/:sessionId
```

---

## 迁移策略

### 策略 A：渐进式迁移（推荐）

1. **第1阶段：** 部署新表和新字段（不影响现有代码）
2. **第2阶段：** 运行数据迁移脚本（填充新字段）
3. **第3阶段：** 同时支持旧 API 和新 API
4. **第4阶段：** 客户端逐步迁移到新 API
5. **第5阶段：** 废弃旧 API（可选）

**优点：**
- 零停机时间
- 可以并行开发
- 老系统和新系统共存

**缺点：**
- 需要维护两套 API
- 过渡期较长

### 策略 B：一次性迁移（风险高）

1. 备份数据库
2. 创建新表结构
3. 迁移所有数据
4. 部署新代码
5. 更新所有客户端

**优点：**
- 简单直接
- 代码整洁

**缺点：**
- 需要停机
- 风险高

---

## 代码实施要点

### 1. 自动创建默认 Topic

```javascript
async function getOrCreateDefaultTopic(accountId) {
  let topic = await db.topics.findOne({
    account_id: accountId,
    title: '默认话题'  // 特殊标记
  });

  if (!topic) {
    topic = await db.topics.create({
      account_id: accountId,
      title: '默认话题',
      description: '自动创建的默认话题'
    });
  }

  return topic;
}
```

### 2. 评论创建时自动关联会话

```javascript
async function createComment(data) {
  const { account_id, from_id, from_name, content } = data;

  // 获取或创建 Topic
  const topic = await getOrCreateDefaultTopic(account_id);

  // 获取或创建 Session（按 from_id 分组）
  let session = await db.sessions.findOne({
    account_id,
    topic_id: topic.id,
    user_id: from_id
  });

  if (!session) {
    session = await db.sessions.create({
      account_id,
      topic_id: topic.id,
      user_id: from_id,
      user_name: from_name,
      first_message: content
    });
  }

  // 创建评论
  return await db.comments.create({
    account_id,
    topic_id: topic.id,
    session_id: session.id,
    from_id,
    from_name,
    content
  });
}
```

### 3. 统计信息自动更新

```javascript
// 触发器或钩子
db.comments.afterCreate(async (comment) => {
  // 更新 session 的 message_count
  await db.sessions.update(
    { id: comment.session_id },
    { $inc: { message_count: 1 } }
  );

  // 更新 topic 的 message_count
  await db.topics.update(
    { id: comment.topic_id },
    { $inc: { message_count: 1 } }
  );

  // 更新 account 的 message_count
  await db.accounts.update(
    { id: comment.account_id },
    { $inc: { message_count: 1 } }
  );
});
```

---

## 测试计划

### 单元测试
- ✅ Topic CRUD 操作
- ✅ Session CRUD 操作
- ✅ Comment 创建时的自动关联
- ✅ 统计字段更新

### 集成测试
- ✅ 完整的评论流程
- ✅ 会话管理流程
- ✅ 数据迁移脚本
- ✅ 向后兼容性

### 性能测试
- ✅ 查询性能（有新索引的情况）
- ✅ 批量迁移性能
- ✅ 并发写入性能

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|--------|
| 数据迁移失败 | 高 | 完整备份，小规模测试 |
| 性能下降 | 中 | 合理的索引设计 |
| API 不兼容 | 中 | 渐进式迁移，向后兼容 |
| 概念混淆 | 低 | 充分的文档和培训 |

---

## 总结

通过引入 Topic 和 Session 概念，Master 将支持更加灵活的消息分层和组织方式，
从而提供更好的用户体验和数据管理能力。

**核心改变：**
```
Account → Comments（平铺）
改为
Account → Topic → Session → Messages（分层）
```

**关键收益：**
1. ✅ 消息上下文更清晰
2. ✅ 消息关系可追踪
3. ✅ 会话管理更便捷
4. ✅ UI 展示更直观
5. ✅ 数据统计更完整

