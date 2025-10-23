# Master 改造实施指南

## 快速导航

- [第1周：数据库准备](#第1周数据库准备)
- [第2周：数据迁移](#第2周数据迁移)
- [第3周：API 更新](#第3周api-更新)
- [第4周：UI 适配](#第4周ui-适配)
- [验证清单](#验证清单)

---

## 第1周：数据库准备

### 目标
为 Master 数据库增加新表和字段，支持 Topic/Session 分层结构。

### 步骤 1.1：创建 topics 表

```sql
-- 创建 topics 表
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,

  -- 基本信息
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- 统计信息
  message_count INT DEFAULT 0,
  session_count INT DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,

  -- 最后活动
  last_message_time TIMESTAMP,
  last_message TEXT,

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 约束
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX idx_topics_account_id ON topics(account_id);
CREATE INDEX idx_topics_pinned ON topics(is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_topics_created_at ON topics(created_at DESC);
```

**验证：**
```sql
-- 检查表是否创建成功
SELECT * FROM information_schema.tables
WHERE table_name = 'topics';

-- 应该返回一行记录
```

### 步骤 1.2：创建 sessions 表

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL,
  topic_id UUID,

  -- 用户信息
  user_id TEXT NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_avatar TEXT,

  -- 内容
  first_message TEXT NOT NULL,

  -- 统计
  message_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,

  -- 状态
  status VARCHAR(50) DEFAULT 'active',
  priority INT DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,

  -- 时间
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_time TIMESTAMP,
  resolved_at TIMESTAMP,

  -- 约束
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL
);

-- 创建索引
CREATE INDEX idx_sessions_account_id ON sessions(account_id);
CREATE INDEX idx_sessions_topic_id ON sessions(topic_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
```

**验证：**
```sql
SELECT * FROM information_schema.tables
WHERE table_name = 'sessions';
```

### 步骤 1.3：为 accounts 表增加字段

```sql
-- 增加统计字段
ALTER TABLE accounts ADD COLUMN (
  message_count INT DEFAULT 0,
  is_pinned BOOLEAN DEFAULT FALSE,
  last_message TEXT,
  last_message_time TIMESTAMP
);

-- 验证
SELECT * FROM information_schema.columns
WHERE table_name = 'accounts'
AND column_name IN ('message_count', 'is_pinned', 'last_message', 'last_message_time');
```

### 步骤 1.4：为 comments 表增加字段

```sql
-- 增加关联和回复字段
ALTER TABLE comments ADD COLUMN (
  topic_id UUID REFERENCES topics(id),
  session_id UUID REFERENCES sessions(id),
  reply_to_id UUID REFERENCES comments(id),
  reply_to_content TEXT,
  parent_id UUID REFERENCES comments(id),
  message_depth INT DEFAULT 0,
  is_reply_from_staff BOOLEAN DEFAULT FALSE
);

-- 创建索引
CREATE INDEX idx_comments_topic_id ON comments(topic_id);
CREATE INDEX idx_comments_session_id ON comments(session_id);
CREATE INDEX idx_comments_reply_to_id ON comments(reply_to_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
```

### 步骤 1.5：为 direct_messages 表增加字段

```sql
-- 增加关联和回复字段
ALTER TABLE direct_messages ADD COLUMN (
  session_id UUID REFERENCES sessions(id),
  reply_to_id UUID REFERENCES direct_messages(id),
  reply_to_content TEXT,
  parent_id UUID REFERENCES direct_messages(id),
  is_reply_from_staff BOOLEAN DEFAULT FALSE
);

-- 创建索引
CREATE INDEX idx_direct_messages_session_id ON direct_messages(session_id);
CREATE INDEX idx_direct_messages_reply_to_id ON direct_messages(reply_to_id);
```

### 步骤 1.6：验证所有字段

```sql
-- 检查所有新字段是否正确创建
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('topics', 'sessions', 'accounts', 'comments', 'direct_messages')
AND column_name IN (
  -- topics
  'title', 'description', 'message_count',
  -- sessions
  'user_id', 'user_name', 'first_message', 'status',
  -- accounts
  'message_count', 'is_pinned', 'last_message',
  -- comments/direct_messages
  'topic_id', 'session_id', 'reply_to_id'
)
ORDER BY table_name;

-- 应该返回所有字段的记录
```

---

## 第2周：数据迁移

### 目标
将现有的 comments/direct_messages 数据关联到新的 topics 和 sessions 表。

### 步骤 2.1：为每个账户创建默认 Topic

```sql
-- 插入默认 topic
INSERT INTO topics (account_id, title, description, created_at)
SELECT
  id as account_id,
  '默认话题' as title,
  '系统自动创建的默认话题' as description,
  CURRENT_TIMESTAMP as created_at
FROM accounts
WHERE id NOT IN (
  SELECT DISTINCT account_id FROM topics
);

-- 验证
SELECT COUNT(*) FROM topics WHERE title = '默认话题';
-- 应该等于账户总数
```

### 步骤 2.2：为现有评论创建 Session

```sql
-- 按 (account_id, from_id) 分组，为每个组创建一个 session
WITH grouped_comments AS (
  SELECT DISTINCT
    account_id,
    from_id,
    from_name,
    MIN(content) as first_message,
    MIN(created_at) as created_at
  FROM comments
  WHERE session_id IS NULL
  GROUP BY account_id, from_id, from_name
)
INSERT INTO sessions (
  account_id,
  topic_id,
  user_id,
  user_name,
  first_message,
  created_at
)
SELECT
  gc.account_id,
  t.id as topic_id,
  gc.from_id,
  gc.from_name,
  gc.first_message,
  gc.created_at
FROM grouped_comments gc
JOIN topics t ON t.account_id = gc.account_id AND t.title = '默认话题';

-- 验证
SELECT COUNT(*) FROM sessions WHERE topic_id IN (
  SELECT id FROM topics WHERE title = '默认话题'
);
```

### 步骤 2.3：为现有评论关联 Topic 和 Session

```sql
-- 更新 comments 表，关联 topic_id 和 session_id
UPDATE comments c
SET
  topic_id = t.id,
  session_id = (
    SELECT id FROM sessions s
    WHERE s.account_id = c.account_id
    AND s.user_id = c.from_id
    LIMIT 1
  )
FROM topics t
WHERE t.account_id = c.account_id
AND t.title = '默认话题'
AND c.topic_id IS NULL;

-- 验证
SELECT COUNT(*) as comments_without_session FROM comments WHERE session_id IS NULL;
-- 应该返回 0（或很少的特殊情况）
```

### 步骤 2.4：为现有私信关联 Session

```sql
-- 类似地更新 direct_messages 表
UPDATE direct_messages dm
SET
  session_id = (
    SELECT id FROM sessions s
    WHERE s.account_id = dm.account_id
    AND s.user_id = dm.from_id
    LIMIT 1
  )
WHERE dm.session_id IS NULL;

-- 验证
SELECT COUNT(*) as dms_without_session FROM direct_messages WHERE session_id IS NULL;
```

### 步骤 2.5：更新统计字段

```sql
-- 更新 sessions 的 message_count
UPDATE sessions s
SET
  message_count = (
    SELECT COUNT(*) FROM comments c
    WHERE c.session_id = s.id
  ),
  last_message_time = (
    SELECT MAX(created_at) FROM comments c
    WHERE c.session_id = s.id
  )
WHERE id IN (SELECT id FROM sessions);

-- 更新 topics 的 message_count 和 session_count
UPDATE topics t
SET
  message_count = (
    SELECT COUNT(*) FROM comments c
    WHERE c.topic_id = t.id
  ),
  session_count = (
    SELECT COUNT(*) FROM sessions s
    WHERE s.topic_id = t.id
  ),
  last_message_time = (
    SELECT MAX(c.created_at)
    FROM comments c
    WHERE c.topic_id = t.id
  );

-- 更新 accounts 的 message_count
UPDATE accounts a
SET
  message_count = (
    SELECT COUNT(*) FROM comments c
    WHERE c.account_id = a.id
  ) + (
    SELECT COUNT(*) FROM direct_messages dm
    WHERE dm.account_id = a.id
  ),
  last_message_time = (
    SELECT MAX(created_at) FROM (
      SELECT created_at FROM comments WHERE account_id = a.id
      UNION ALL
      SELECT created_at FROM direct_messages WHERE account_id = a.id
    ) t
  );
```

### 步骤 2.6：验证数据完整性

```sql
-- 检查每个 comment 都有 session_id 和 topic_id
SELECT
  COUNT(*) as total_comments,
  COUNT(session_id) as with_session,
  COUNT(topic_id) as with_topic,
  COUNT(*) - COUNT(session_id) as missing_session,
  COUNT(*) - COUNT(topic_id) as missing_topic
FROM comments;

-- 检查统计字段是否正确
SELECT
  a.id,
  a.message_count as account_count,
  (SELECT COUNT(*) FROM comments c WHERE c.account_id = a.id) as actual_comments,
  (SELECT COUNT(*) FROM direct_messages dm WHERE dm.account_id = a.id) as actual_dms
FROM accounts a
LIMIT 10;

-- 应该 account_count = actual_comments + actual_dms
```

---

## 第3周：API 更新

### 目标
实现新的 API 端点，支持 Topic 和 Session 的管理。

### 步骤 3.1：实现 Topic API

**位置：** `packages/master/src/api/routes/topics.js`

```javascript
const express = require('express');
const router = express.Router();
const TopicDAO = require('../../database/topic-dao');

// 获取某个账户的所有主题
router.get('/accounts/:accountId/topics', async (req, res) => {
  try {
    const { accountId } = req.params;
    const topics = await TopicDAO.getByAccountId(accountId);
    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个主题详情
router.get('/topics/:topicId', async (req, res) => {
  try {
    const { topicId } = req.params;
    const topic = await TopicDAO.getById(topicId);
    res.json(topic);
  } catch (error) {
    res.status(404).json({ error: 'Topic not found' });
  }
});

// 创建新主题
router.post('/accounts/:accountId/topics', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { title, description } = req.body;
    const topic = await TopicDAO.create({
      account_id: accountId,
      title,
      description
    });
    res.status(201).json(topic);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 更新主题
router.patch('/topics/:topicId', async (req, res) => {
  try {
    const { topicId } = req.params;
    const { title, description, is_pinned } = req.body;
    const topic = await TopicDAO.update(topicId, {
      title, description, is_pinned
    });
    res.json(topic);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
```

### 步骤 3.2：实现 Session API

**位置：** `packages/master/src/api/routes/sessions.js`

```javascript
const express = require('express');
const router = express.Router();
const SessionDAO = require('../../database/session-dao');

// 获取某个主题的所有会话
router.get('/topics/:topicId/sessions', async (req, res) => {
  try {
    const { topicId } = req.params;
    const sessions = await SessionDAO.getByTopicId(topicId);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个会话详情
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await SessionDAO.getById(sessionId);
    res.json(session);
  } catch (error) {
    res.status(404).json({ error: 'Session not found' });
  }
});

// 获取会话的所有消息
router.get('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await SessionDAO.getMessages(sessionId);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 在会话中发送消息/回复
router.post('/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content, reply_to_id, message_type } = req.body;

    const message = await SessionDAO.addMessage(sessionId, {
      content,
      reply_to_id,
      message_type
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 更新会话状态
router.patch('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status, is_pinned, priority } = req.body;

    const session = await SessionDAO.update(sessionId, {
      status, is_pinned, priority
    });

    res.json(session);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
```

### 步骤 3.3：实现 DAO 类

**TopicDAO 位置：** `packages/master/src/database/topic-dao.js`

```javascript
const { query } = require('../database');

class TopicDAO {
  static async getByAccountId(accountId) {
    const result = await query(
      `SELECT * FROM topics
       WHERE account_id = $1
       ORDER BY created_at DESC`,
      [accountId]
    );
    return result.rows;
  }

  static async getById(topicId) {
    const result = await query(
      `SELECT * FROM topics WHERE id = $1`,
      [topicId]
    );
    return result.rows[0];
  }

  static async create(data) {
    const { account_id, title, description } = data;
    const result = await query(
      `INSERT INTO topics (account_id, title, description, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING *`,
      [account_id, title, description]
    );
    return result.rows[0];
  }

  static async update(topicId, data) {
    const updates = [];
    const values = [];
    let paramCount = 1;

    Object.keys(data).forEach(key => {
      if (data[key] !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(data[key]);
        paramCount++;
      }
    });

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await query(
      `UPDATE topics SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      [...values, topicId]
    );

    return result.rows[0];
  }
}

module.exports = TopicDAO;
```

### 步骤 3.4：注册新路由

**位置：** `packages/master/src/api/index.js`

```javascript
const topicsRouter = require('./routes/topics');
const sessionsRouter = require('./routes/sessions');

// 在现有路由之后
app.use('/api', topicsRouter);
app.use('/api', sessionsRouter);
```

### 步骤 3.5：向后兼容处理

**位置：** `packages/master/src/api/routes/comments.js`

```javascript
// 在创建评论时，自动关联 topic_id 和 session_id
async function createComment(req, res) {
  try {
    const { account_id, from_id, from_name, content } = req.body;

    // 获取或创建默认 topic
    let topic = await TopicDAO.getByAccountId(account_id);
    if (!topic || topic.length === 0) {
      topic = await TopicDAO.create({
        account_id,
        title: '默认话题',
        description: '系统自动创建的默认话题'
      });
    } else {
      topic = topic[0];
    }

    // 获取或创建 session
    let session = await SessionDAO.findOne({
      account_id,
      topic_id: topic.id,
      user_id: from_id
    });

    if (!session) {
      session = await SessionDAO.create({
        account_id,
        topic_id: topic.id,
        user_id: from_id,
        user_name: from_name,
        first_message: content
      });
    }

    // 创建评论
    const comment = await CommentDAO.create({
      account_id,
      topic_id: topic.id,
      session_id: session.id,
      from_id,
      from_name,
      content
    });

    res.status(201).json(comment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
```

---

## 第4周：UI 适配

### 目标
更新前端 UI，展示新的分层结构。

### 步骤 4.1：账户详情组件重构

**位置：** `packages/admin-web/src/pages/AccountDetail.tsx`

```typescript
// 新的 UI 结构
const AccountDetail = ({ accountId }) => {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);

  // 加载主题
  useEffect(() => {
    fetchTopics(accountId).then(setTopics);
  }, [accountId]);

  // 加载会话
  useEffect(() => {
    if (selectedTopic) {
      fetchSessions(selectedTopic.id).then(setSessions);
    }
  }, [selectedTopic]);

  // 加载消息
  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession.id).then(setMessages);
    }
  }, [selectedSession]);

  return (
    <div className="account-detail">
      {/* 左侧：主题列表 */}
      <div className="topics-panel">
        <h3>主题列表</h3>
        {topics.map(topic => (
          <div
            key={topic.id}
            className={`topic-item ${selectedTopic?.id === topic.id ? 'active' : ''}`}
            onClick={() => setSelectedTopic(topic)}
          >
            <div className="topic-title">{topic.title}</div>
            <div className="topic-meta">
              {topic.message_count} 条消息 · {topic.session_count} 个会话
            </div>
          </div>
        ))}
      </div>

      {/* 中间：会话列表 */}
      {selectedTopic && (
        <div className="sessions-panel">
          <h3>{selectedTopic.title} 的会话</h3>
          {sessions.map(session => (
            <div
              key={session.id}
              className={`session-item ${selectedSession?.id === session.id ? 'active' : ''}`}
              onClick={() => setSelectedSession(session)}
            >
              <div className="session-user">
                <img src={session.user_avatar} alt={session.user_name} />
                <span>{session.user_name}</span>
              </div>
              <div className="session-message">{session.first_message}</div>
              <div className="session-meta">
                {session.message_count} 条消息 · 状态：{session.status}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 右侧：消息树 */}
      {selectedSession && (
        <div className="messages-panel">
          <h3>{selectedSession.user_name} 的对话</h3>
          <MessageThread messages={messages} />
          <ReplyBox sessionId={selectedSession.id} />
        </div>
      )}
    </div>
  );
};
```

### 步骤 4.2：消息树组件

**位置：** `packages/admin-web/src/components/MessageThread.tsx`

```typescript
const MessageThread = ({ messages }) => {
  return (
    <div className="message-thread">
      {messages.map(msg => (
        <div key={msg.id} className={`message ${msg.is_reply_from_staff ? 'staff' : 'customer'}`}>
          <div className="message-header">
            <span className="from-name">{msg.from_name}</span>
            <span className="time">{formatTime(msg.created_at)}</span>
          </div>
          <div className="message-content">{msg.content}</div>

          {/* 回复链接 */}
          {msg.reply_to_id && (
            <div className="reply-to">
              ↳ 回复给: {msg.reply_to_content}
            </div>
          )}

          {/* 嵌套回复 */}
          {msg.replies && msg.replies.length > 0 && (
            <div className="nested-replies">
              {msg.replies.map(reply => (
                <div key={reply.id} className="nested-message">
                  <span className="from-name">{reply.from_name}</span>
                  <div className="message-content">{reply.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
```

### 步骤 4.3：回复框组件

**位置：** `packages/admin-web/src/components/ReplyBox.tsx`

```typescript
const ReplyBox = ({ sessionId, onReplyToMessage }) => {
  const [content, setContent] = useState('');
  const [replyToId, setReplyToId] = useState(null);

  const handleSend = async () => {
    await fetch(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        reply_to_id: replyToId,
        message_type: 'text'
      })
    });

    setContent('');
    setReplyToId(null);
  };

  return (
    <div className="reply-box">
      {replyToId && (
        <div className="reply-to-indicator">
          回复给: {replyToId}
          <button onClick={() => setReplyToId(null)}>✕</button>
        </div>
      )}
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="输入回复内容..."
      />
      <button onClick={handleSend} disabled={!content}>
        发送回复
      </button>
    </div>
  );
};
```

---

## 验证清单

### 第1周验证

- [ ] topics 表创建成功
- [ ] sessions 表创建成功
- [ ] accounts 表新字段创建成功
- [ ] comments 表新字段创建成功
- [ ] direct_messages 表新字段创建成功
- [ ] 所有索引创建成功
- [ ] 外键约束正确

### 第2周验证

- [ ] 每个 account 都有至少一个 topic
- [ ] 每个现有 comment 都有 topic_id 和 session_id
- [ ] 所有 session 的 message_count 正确
- [ ] 所有 topic 的 message_count 和 session_count 正确
- [ ] 所有 account 的 message_count 正确
- [ ] 无 NULL 的 session_id 或 topic_id（除了特殊情况）

### 第3周验证

- [ ] Topic GET/POST/PATCH API 正常工作
- [ ] Session GET/POST/PATCH API 正常工作
- [ ] Message POST API 正常工作
- [ ] 旧 API 仍然兼容
- [ ] 数据库更新正确（自动关联 topic_id 和 session_id）

### 第4周验证

- [ ] 账户详情页面加载成功
- [ ] 主题列表显示正确
- [ ] 会话列表显示正确
- [ ] 消息树显示正确
- [ ] 回复功能正常

---

## 常见错误及解决方案

### 错误 1：外键约束冲突

```
ERROR: insert or update on table "comments" violates foreign key constraint
```

**原因：** 尝试关联一个不存在的 session_id

**解决：**
```sql
-- 检查是否所有 account_id 都存在
SELECT c.account_id FROM comments c
LEFT JOIN accounts a ON c.account_id = a.id
WHERE a.id IS NULL;

-- 检查是否有孤立的 comments
SELECT * FROM comments WHERE session_id NOT IN (SELECT id FROM sessions);
```

### 错误 2：数据迁移后统计数字不对

**原因：** 迁移脚本没有正确计算

**解决：**
```javascript
// 重新计算统计数据
async function recalculateStats() {
  // 更新 topics 统计
  await updateTopicsStats();
  // 更新 sessions 统计
  await updateSessionsStats();
  // 更新 accounts 统计
  await updateAccountsStats();
}
```

### 错误 3：API 响应缓慢

**原因：** 缺少必要的索引

**解决：**
```sql
-- 检查是否创建了所有索引
SELECT * FROM pg_indexes
WHERE tablename IN ('topics', 'sessions', 'comments');

-- 如果缺少索引，手动创建
CREATE INDEX idx_comments_session_id ON comments(session_id);
```

---

## 性能监控

### 需要监控的指标

1. **查询性能：** 获取账户的主题列表，应该 < 100ms
2. **写入性能：** 创建新评论，应该 < 50ms
3. **数据库大小：** 新表增加的存储大小 < 50MB

### 监控 SQL

```sql
-- 检查表大小
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('topics', 'sessions', 'comments', 'accounts');

-- 检查慢查询
SELECT
  query,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%topics%' OR query LIKE '%sessions%'
ORDER BY mean_time DESC;
```

---

## 回滚计划

如果需要回滚：

```sql
-- 删除新表
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS topics;

-- 删除新字段
ALTER TABLE accounts DROP COLUMN message_count, is_pinned, last_message, last_message_time;
ALTER TABLE comments DROP COLUMN topic_id, session_id, reply_to_id, reply_to_content, parent_id, message_depth, is_reply_from_staff;
ALTER TABLE direct_messages DROP COLUMN session_id, reply_to_id, reply_to_content, parent_id, is_reply_from_staff;
```

---

## 总结

这个 4 周的改造计划将：

1. ✅ 第1周：建立数据库基础
2. ✅ 第2周：迁移现有数据
3. ✅ 第3周：实现新 API
4. ✅ 第4周：完善 UI

**预期结果：** Master 将支持完整的 Account → Topic → Session → Message 分层结构。

