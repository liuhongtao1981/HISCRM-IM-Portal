# Master 数据已读状态处理设计方案

**文档版本**: v1.0
**创建时间**: 2025-11-03
**状态**: 设计中

---

## 📋 需求背景

当前 Master 系统的已读状态处理存在以下问题：

1. ✅ **已有功能**:
   - `is_read` 字段（布尔值）
   - 单条消息标记已读方法

2. ❌ **缺少功能**:
   - 批量标记已读
   - 已读时间戳（`read_at`）
   - WebSocket 实时通知
   - 未读计数统计

---

## 🎯 设计目标

### 核心功能

1. **批量标记已读**: 一次性标记多条消息
2. **已读时间戳**: 记录精确的已读时间
3. **实时同步**: 通过 WebSocket 通知所有客户端
4. **高效统计**: 快速获取未读计数

### 非功能需求

- **性能**: 批量操作 < 10ms
- **兼容性**: 不破坏现有 API
- **扩展性**: 支持未来添加更多状态

---

## 📊 数据库 Schema 变更

### 1. comments 表

```sql
-- 添加已读时间戳字段
ALTER TABLE comments ADD COLUMN read_at INTEGER DEFAULT NULL;

-- 创建索引优化未读查询
CREATE INDEX IF NOT EXISTS idx_comments_unread
  ON comments(account_id, is_read, detected_at DESC);
```

### 2. direct_messages 表

```sql
-- 添加已读时间戳字段
ALTER TABLE direct_messages ADD COLUMN read_at INTEGER DEFAULT NULL;

-- 创建索引优化未读查询
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON direct_messages(account_id, is_read, detected_at DESC);
```

---

## 🔌 API 接口设计

### WebSocket 事件（IM WebSocket Server）

#### 1. 标记单条消息已读

**事件名**: `monitor:mark_as_read`

**客户端发送**:
```javascript
socket.emit('monitor:mark_as_read', {
  type: 'comment' | 'message',  // 消息类型
  id: 'message_id',              // 消息ID
  channelId: 'channel_id'        // 频道ID（账户ID）
});
```

**服务器响应**:
```javascript
// 成功响应
{
  success: true,
  id: 'message_id',
  read_at: 1699000000
}

// 失败响应
{
  success: false,
  error: 'Message not found'
}
```

**广播事件**: `monitor:message_read` (通知所有客户端)
```javascript
io.of('/client').emit('monitor:message_read', {
  type: 'comment',
  id: 'message_id',
  channelId: 'channel_id',
  read_at: 1699000000
});
```

---

#### 2. 批量标记已读

**事件名**: `monitor:mark_batch_as_read`

**客户端发送**:
```javascript
socket.emit('monitor:mark_batch_as_read', {
  type: 'comment' | 'message',  // 消息类型
  ids: ['id1', 'id2', 'id3'],   // 消息ID数组
  channelId: 'channel_id'       // 频道ID
});
```

**服务器响应**:
```javascript
{
  success: true,
  count: 3,                     // 成功标记的数量
  read_at: 1699000000
}
```

**广播事件**: `monitor:messages_read` (批量)
```javascript
io.of('/client').emit('monitor:messages_read', {
  type: 'comment',
  ids: ['id1', 'id2', 'id3'],
  channelId: 'channel_id',
  read_at: 1699000000
});
```

---

#### 3. 按作品标记所有评论已读

**事件名**: `monitor:mark_topic_as_read`

**客户端发送**:
```javascript
socket.emit('monitor:mark_topic_as_read', {
  channelId: 'channel_id',      // 频道ID
  topicId: 'post_id'            // 作品ID
});
```

**服务器响应**:
```javascript
{
  success: true,
  count: 15,                    // 标记的评论数量
  read_at: 1699000000
}
```

---

#### 4. 按会话标记所有私信已读

**事件名**: `monitor:mark_conversation_as_read`

**客户端发送**:
```javascript
socket.emit('monitor:mark_conversation_as_read', {
  channelId: 'channel_id',          // 频道ID
  conversationId: 'conversation_id' // 会话ID
});
```

**服务器响应**:
```javascript
{
  success: true,
  count: 10,                    // 标记的私信数量
  read_at: 1699000000
}
```

---

#### 5. 获取未读计数

**事件名**: `monitor:get_unread_count`

**客户端发送**:
```javascript
socket.emit('monitor:get_unread_count', {
  channelId: 'channel_id'       // 频道ID（可选）
});
```

**服务器响应**:
```javascript
{
  success: true,
  unread: {
    comments: 25,               // 未读评论数
    messages: 10,               // 未读私信数
    total: 35                   // 总未读数
  },
  byChannel: {                  // 按频道分组（如果未指定 channelId）
    'channel_1': {
      comments: 15,
      messages: 5,
      total: 20
    },
    'channel_2': {
      comments: 10,
      messages: 5,
      total: 15
    }
  }
}
```

---

## 🔧 DAO 方法设计

### CommentsDAO 新增方法

```javascript
class CommentsDAO {
  /**
   * 批量标记评论为已读
   * @param {Array<string>} ids - 评论ID数组
   * @param {number} readAt - 已读时间戳（可选，默认当前时间）
   * @returns {number} 成功标记的数量
   */
  markBatchAsRead(ids, readAt = null) {
    if (!ids || ids.length === 0) return 0;

    const timestamp = readAt || Math.floor(Date.now() / 1000);
    const placeholders = ids.map(() => '?').join(',');

    const result = this.db.prepare(`
      UPDATE comments
      SET is_read = 1, read_at = ?
      WHERE id IN (${placeholders})
    `).run(timestamp, ...ids);

    return result.changes;
  }

  /**
   * 按作品ID标记所有评论为已读
   * @param {string} postId - 作品ID
   * @param {string} accountId - 账户ID（可选）
   * @param {number} readAt - 已读时间戳（可选）
   * @returns {number} 成功标记的数量
   */
  markTopicAsRead(postId, accountId = null, readAt = null) {
    const timestamp = readAt || Math.floor(Date.now() / 1000);
    let sql = 'UPDATE comments SET is_read = 1, read_at = ? WHERE post_id = ? AND is_read = 0';
    const params = [timestamp, postId];

    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }

    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }

  /**
   * 获取未读评论数量
   * @param {string} accountId - 账户ID（可选）
   * @returns {number} 未读数量
   */
  countUnread(accountId = null) {
    let sql = 'SELECT COUNT(*) as count FROM comments WHERE is_read = 0';
    const params = [];

    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }

    const result = this.db.prepare(sql).get(...params);
    return result.count;
  }

  /**
   * 按账户分组统计未读数量
   * @returns {Object} { account_id: count, ... }
   */
  countUnreadByAccount() {
    const rows = this.db.prepare(`
      SELECT account_id, COUNT(*) as count
      FROM comments
      WHERE is_read = 0
      GROUP BY account_id
    `).all();

    const result = {};
    for (const row of rows) {
      result[row.account_id] = row.count;
    }
    return result;
  }
}
```

### MessagesDAO 新增方法

```javascript
class DirectMessagesDAO {
  /**
   * 批量标记私信为已读
   * @param {Array<string>} ids - 私信ID数组
   * @param {number} readAt - 已读时间戳（可选）
   * @returns {number} 成功标记的数量
   */
  markBatchAsRead(ids, readAt = null) {
    if (!ids || ids.length === 0) return 0;

    const timestamp = readAt || Math.floor(Date.now() / 1000);
    const placeholders = ids.map(() => '?').join(',');

    const result = this.db.prepare(`
      UPDATE direct_messages
      SET is_read = 1, read_at = ?
      WHERE id IN (${placeholders})
    `).run(timestamp, ...ids);

    return result.changes;
  }

  /**
   * 按会话ID标记所有私信为已读
   * @param {string} conversationId - 会话ID
   * @param {string} accountId - 账户ID（可选）
   * @param {number} readAt - 已读时间戳（可选）
   * @returns {number} 成功标记的数量
   */
  markConversationAsRead(conversationId, accountId = null, readAt = null) {
    const timestamp = readAt || Math.floor(Date.now() / 1000);
    let sql = 'UPDATE direct_messages SET is_read = 1, read_at = ? WHERE conversation_id = ? AND is_read = 0';
    const params = [timestamp, conversationId];

    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }

    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }

  /**
   * 获取未读私信数量
   * @param {string} accountId - 账户ID（可选）
   * @returns {number} 未读数量
   */
  countUnread(accountId = null) {
    let sql = 'SELECT COUNT(*) as count FROM direct_messages WHERE is_read = 0';
    const params = [];

    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }

    const result = this.db.prepare(sql).get(...params);
    return result.count;
  }

  /**
   * 按账户分组统计未读数量
   * @returns {Object} { account_id: count, ... }
   */
  countUnreadByAccount() {
    const rows = this.db.prepare(`
      SELECT account_id, COUNT(*) as count
      FROM direct_messages
      WHERE is_read = 0
      GROUP BY account_id
    `).all();

    const result = {};
    for (const row of rows) {
      result[row.account_id] = row.count;
    }
    return result;
  }
}
```

---

## 🔄 实施步骤

### Phase 1: 数据库 Schema 变更 ✅
- [x] 创建 SQL 迁移脚本
- [x] 添加 `read_at` 字段
- [x] 创建性能优化索引
- [x] 测试 Schema 变更

### Phase 2: DAO 层实现 ⏳
- [ ] 实现 CommentsDAO 批量已读方法
- [ ] 实现 MessagesDAO 批量已读方法
- [ ] 添加未读计数方法
- [ ] 编写 DAO 单元测试

### Phase 3: WebSocket 事件处理 ⏳
- [ ] 实现 `monitor:mark_as_read` 事件
- [ ] 实现 `monitor:mark_batch_as_read` 事件
- [ ] 实现 `monitor:mark_topic_as_read` 事件
- [ ] 实现 `monitor:mark_conversation_as_read` 事件
- [ ] 实现 `monitor:get_unread_count` 事件
- [ ] 添加事件广播逻辑

### Phase 4: 集成测试 ⏳
- [ ] 编写集成测试脚本
- [ ] 测试单条标记已读
- [ ] 测试批量标记已读
- [ ] 测试实时同步
- [ ] 测试未读计数

### Phase 5: 文档和部署 ⏳
- [ ] 更新 API 文档
- [ ] 更新待办事项文档
- [ ] 编写使用示例
- [ ] 提交代码

---

## 📈 性能考虑

### 批量操作优化

```javascript
// ❌ 错误做法：循环单条更新
for (const id of ids) {
  await markAsRead(id);  // N 次数据库操作
}

// ✅ 正确做法：批量更新
await markBatchAsRead(ids);  // 1 次数据库操作
```

### 索引优化

```sql
-- 未读查询索引（复合索引）
CREATE INDEX idx_comments_unread ON comments(account_id, is_read, detected_at DESC);

-- 覆盖索引：包含常用查询字段
CREATE INDEX idx_comments_read_status ON comments(account_id, is_read, read_at);
```

### 缓存策略

未读计数可以在 DataStore 中缓存：

```javascript
class DataStore {
  constructor() {
    this.unreadCounts = new Map(); // { account_id: { comments: N, messages: M } }
  }

  updateUnreadCount(accountId, type, delta) {
    if (!this.unreadCounts.has(accountId)) {
      this.unreadCounts.set(accountId, { comments: 0, messages: 0 });
    }
    const counts = this.unreadCounts.get(accountId);
    counts[type] = Math.max(0, counts[type] + delta);
  }
}
```

---

## 🔒 兼容性保证

### 向后兼容

1. **现有字段保留**: `is_read` 字段继续使用
2. **新字段可选**: `read_at` 默认为 NULL
3. **渐进式迁移**: 旧数据可以逐步迁移

### API 版本控制

```javascript
// 旧版 API（保留）
socket.on('mark_as_read', (data) => {
  // 兼容旧版本客户端
});

// 新版 API
socket.on('monitor:mark_as_read', (data) => {
  // 新版本功能
});
```

---

## 📝 测试用例

### 单元测试

```javascript
describe('CommentsDAO', () => {
  test('markBatchAsRead - 批量标记已读', () => {
    const ids = ['comment1', 'comment2', 'comment3'];
    const count = commentsDAO.markBatchAsRead(ids);
    expect(count).toBe(3);

    // 验证 read_at 已设置
    const comment = commentsDAO.findById('comment1');
    expect(comment.is_read).toBe(true);
    expect(comment.read_at).toBeGreaterThan(0);
  });

  test('countUnread - 统计未读数量', () => {
    const count = commentsDAO.countUnread('account1');
    expect(count).toBeGreaterThan(0);
  });
});
```

### 集成测试

```javascript
describe('已读状态 WebSocket 集成测试', () => {
  test('标记已读并广播通知', (done) => {
    // 客户端1 监听广播
    client1.on('monitor:message_read', (data) => {
      expect(data.id).toBe('comment1');
      expect(data.read_at).toBeDefined();
      done();
    });

    // 客户端2 发送标记请求
    client2.emit('monitor:mark_as_read', {
      type: 'comment',
      id: 'comment1',
      channelId: 'channel1'
    });
  });
});
```

---

## 🚀 后续优化

### 可选功能

1. **自动标记已读**: 消息推送后 N 秒自动标记
2. **已读回执**: 显示消息被谁读过
3. **部分已读**: 标记消息为"已阅读但未处理"
4. **已读同步**: 跨设备同步已读状态

### 性能监控

```javascript
// 监控未读计数查询性能
const startTime = Date.now();
const count = commentsDAO.countUnread();
const duration = Date.now() - startTime;

if (duration > 100) {
  logger.warn(`Slow unread count query: ${duration}ms`);
}
```

---

**文档维护者**: Claude Code
**最后更新**: 2025-11-03
