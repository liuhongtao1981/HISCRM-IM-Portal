# 统一已读字段方案 - is_read

## 用户需求

用户要求：
1. **统一字段**：使用 `is_read` 作为主要的已读标记
2. **保存时更新**：保存到数据库时要更新 `is_read` 字段
3. **加载时读取**：从数据库加载时要从 `is_read` 读取

## 数据库现状

### 评论表 (`cache_comments`)
```sql
CREATE TABLE cache_comments (
  ...
  data TEXT NOT NULL,  -- JSON: {is_read, ...}
  read_at INTEGER DEFAULT NULL,
  is_read INTEGER DEFAULT 0
);
```

### 私信表 (`cache_messages`)
```sql
CREATE TABLE cache_messages (
  ...
  data TEXT NOT NULL,  -- JSON: {is_read, ...}
  read_at INTEGER DEFAULT NULL,
  is_read INTEGER DEFAULT 0
);
```

### 字段说明
- `data`: JSON 字段，存储完整的消息对象（包括 `isRead`, `isHandled` 等）
- `read_at`: INTEGER，时间戳（毫秒），记录已读时间
- `is_read`: INTEGER，布尔值（0 = 未读，1 = 已读）

## 统一方案

### 原则
1. **唯一标准**: 使用 `is_read` 字段（INTEGER，0/1）
2. **内存对象**: 从数据库加载时，将 `is_read` 字段同步到内存对象
3. **保存数据**: 保存到数据库时，从内存对象的 `isRead` 更新 `is_read` 字段
4. **废弃字段**: `read_at` 字段保留但不再使用（向后兼容）

### 数据流

#### 加载流程（数据库 → 内存）
```javascript
// 1. 从数据库读取
const row = db.prepare('SELECT * FROM cache_messages WHERE id = ?').get(id);

// 2. 解析 JSON
const data = JSON.parse(row.data);

// 3. ✅ 从 is_read 字段同步到内存对象
data.isRead = row.is_read === 1;  // 0 → false, 1 → true

// 4. 存入内存
dataStore.setMessage(accountId, data);
```

#### 保存流程（内存 → 数据库）
```javascript
// 1. 从内存获取对象
const message = dataStore.getMessage(accountId, messageId);

// 2. ✅ 从内存对象更新 is_read 字段
const isRead = message.isRead ? 1 : 0;  // true → 1, false → 0

// 3. 保存到数据库
db.prepare(`
  UPDATE cache_messages
  SET is_read = ?, updated_at = ?
  WHERE id = ?
`).run(isRead, Date.now(), message.id);
```

#### 未读计算（从内存）
```javascript
// ✅ 统一标准：使用内存对象的 isRead 字段
const unreadMessages = messages.filter(m => !m.isRead);
```

## 实施步骤

### 步骤 1: 修改 CacheDAO 加载逻辑

**文件**: `packages/master/src/database/cache-dao.js`

#### 评论加载
```javascript
getComments(accountId) {
  const rows = this.db.prepare(`
    SELECT * FROM cache_comments
    WHERE account_id = ?
    ORDER BY created_at DESC
  `).all(accountId);

  return rows.map(row => {
    const data = JSON.parse(row.data);
    // ✅ 从 is_read 字段同步到内存对象
    data.isRead = row.is_read === 1;
    return data;
  });
}
```

#### 私信加载
```javascript
getMessages(accountId) {
  const rows = this.db.prepare(`
    SELECT * FROM cache_messages
    WHERE account_id = ?
    ORDER BY created_at DESC
  `).all(accountId);

  return rows.map(row => {
    const data = JSON.parse(row.data);
    // ✅ 从 is_read 字段同步到内存对象
    data.isRead = row.is_read === 1;
    return data;
  });
}
```

### 步骤 2: 修改 CacheDAO 保存逻辑

#### 评论保存
```javascript
saveComment(accountId, comment) {
  // ✅ 从内存对象更新 is_read 字段
  const isRead = comment.isRead ? 1 : 0;

  this.db.prepare(`
    INSERT INTO cache_comments (
      id, account_id, content_id, data,
      created_at, updated_at, persist_at,
      is_read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at,
      persist_at = excluded.persist_at,
      is_read = excluded.is_read
  `).run(
    comment.id,
    accountId,
    comment.contentId,
    JSON.stringify(comment),
    comment.createdAt || Date.now(),
    Date.now(),
    Date.now(),
    isRead  // ✅ 更新 is_read
  );
}
```

#### 私信保存
```javascript
saveMessage(accountId, message) {
  // ✅ 从内存对象更新 is_read 字段
  const isRead = message.isRead ? 1 : 0;

  this.db.prepare(`
    INSERT INTO cache_messages (
      id, account_id, conversation_id, data,
      created_at, updated_at, persist_at,
      is_read
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at,
      persist_at = excluded.persist_at,
      is_read = excluded.is_read
  `).run(
    message.id,
    accountId,
    message.conversationId,
    JSON.stringify(message),
    message.createdAt || Date.now(),
    Date.now(),
    Date.now(),
    isRead  // ✅ 更新 is_read
  );
}
```

### 步骤 3: 修改标记已读逻辑

#### 标记单条消息已读
```javascript
markMessageAsRead(accountId, messageId) {
  // 1. 更新数据库
  this.db.prepare(`
    UPDATE cache_messages
    SET is_read = 1, updated_at = ?
    WHERE account_id = ? AND id = ?
  `).run(Date.now(), accountId, messageId);

  // 2. ✅ 同步更新内存对象
  const message = dataStore.getMessage(accountId, messageId);
  if (message) {
    message.isRead = true;
  }
}
```

#### 标记会话所有消息已读
```javascript
markConversationAsRead(accountId, conversationId) {
  // 1. 更新数据库
  this.db.prepare(`
    UPDATE cache_messages
    SET is_read = 1, updated_at = ?
    WHERE account_id = ? AND conversation_id = ?
  `).run(Date.now(), accountId, conversationId);

  // 2. ✅ 同步更新内存对象
  const messages = dataStore.getMessages(accountId);
  messages.forEach(msg => {
    if (msg.conversationId === conversationId) {
      msg.isRead = true;
    }
  });
}
```

#### 标记作品所有评论已读
```javascript
markTopicAsRead(accountId, contentId) {
  // 1. 更新数据库
  this.db.prepare(`
    UPDATE cache_comments
    SET is_read = 1, updated_at = ?
    WHERE account_id = ? AND content_id = ?
  `).run(Date.now(), accountId, contentId);

  // 2. ✅ 同步更新内存对象
  const comments = dataStore.getComments(accountId);
  comments.forEach(comment => {
    if (comment.contentId === contentId) {
      comment.isRead = true;
    }
  });
}
```

### 步骤 4: 修改未读计算逻辑

#### 服务端（im-websocket-server.js）

**评论未读计算**:
```javascript
// Line 411 - 修改为使用 isRead
unreadCount: contentComments.filter(c => !c.isRead).length
```

**私信未读计算**:
```javascript
// Line 463-468 - 修改为使用 isRead
const unreadMessages = conversationMessages.filter(m => !m.isRead);
```

#### 客户端（MonitorPage.tsx）

**私信未读计算**:
```typescript
// Line 175-178 - 修改为使用 isRead
const unreadMessages = privateMessages.filter(msg =>
  !msg.isRead && msg.fromId !== 'monitor_client'
)
```

**评论未读计算**:
```typescript
// Line 123-127 - 修改为使用 isRead
const unreadMessages = topicMessages.filter(msg =>
  (msg.messageCategory === 'comment' || !msg.messageCategory) &&
  !msg.isRead &&
  msg.fromId !== 'monitor_client'
)
```

## 数据迁移（可选）

如果现有数据中有 `isHandled` 或 `read_at` 字段，需要迁移到 `is_read`：

```sql
-- 迁移评论数据
UPDATE cache_comments
SET is_read = 1
WHERE JSON_EXTRACT(data, '$.isHandled') = 1
   OR read_at IS NOT NULL AND read_at > 0;

-- 迁移私信数据
UPDATE cache_messages
SET is_read = 1
WHERE JSON_EXTRACT(data, '$.isRead') = 1
   OR read_at IS NOT NULL AND read_at > 0;

-- 验证迁移结果
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) AS read_count,
  SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_count
FROM cache_comments;

SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) AS read_count,
  SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_count
FROM cache_messages;
```

## 优点

1. **统一标准**: 评论和私信使用相同的已读标记
2. **数据库优化**: `is_read` 字段有索引，查询效率高
3. **简单明确**: INTEGER 类型，0/1 布尔值，语义清晰
4. **内存同步**: 加载时同步到内存，保存时同步到数据库
5. **兼容性好**: 保留 `read_at` 字段，向后兼容

## 测试清单

### 数据库测试
- [ ] 新消息保存时 `is_read = 0`
- [ ] 标记已读后 `is_read = 1`
- [ ] 查询未读消息：`WHERE is_read = 0`

### 内存对象测试
- [ ] 从数据库加载后 `message.isRead` 正确
- [ ] 标记已读后内存对象同步更新

### 未读计数测试
- [ ] 评论未读数 = `comments.filter(c => !c.isRead).length`
- [ ] 私信未读数 = `messages.filter(m => !m.isRead).length`
- [ ] 多次查询结果一致（不再横跳）

### UI 测试
- [ ] Tab 徽章数字准确
- [ ] 账户徽章数字准确
- [ ] 点击会话后未读数减少
- [ ] 刷新页面后未读数保持一致

## 实施时间估算

- **步骤 1**: 修改加载逻辑 - 30 分钟
- **步骤 2**: 修改保存逻辑 - 30 分钟
- **步骤 3**: 修改标记已读逻辑 - 45 分钟
- **步骤 4**: 修改未读计算逻辑 - 30 分钟
- **数据迁移**: 15 分钟
- **测试验证**: 1 小时

**总计**: 约 3 小时

## 总结

通过统一使用 `is_read` 字段：
- ✅ 解决未读数横跳问题
- ✅ 统一评论和私信的已读标准
- ✅ 提高查询效率（INTEGER 索引）
- ✅ 简化代码逻辑（单一数据源）
- ✅ 保持内存和数据库同步

这是一个**彻底的解决方案**，建议尽快实施。
