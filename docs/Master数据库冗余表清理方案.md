# Master 数据库冗余表清理方案

**文档版本**: v1.0
**创建时间**: 2025-11-03
**状态**: 设计中

---

## 📋 背景分析

### 当前架构

Master 系统目前存在两套数据存储方案：

#### 1. 旧架构（待清理）

**数据表**:
- `comments` - 评论数据
- `direct_messages` - 私信数据
- `contents` - 作品数据
- `conversations` - 会话数据
- `discussions` - 讨论数据
- `notifications` - 通知数据
- `notification_rules` - 通知规则

**访问方式**:
- `CommentsDAO` → `comments` 表
- `DirectMessagesDAO` → `direct_messages` 表
- `ContentsDAO` → `contents` 表
- `ConversationsDAO` → `conversations` 表
- `DiscussionsDAO` → `discussions` 表
- `NotificationsDAO` → `notifications` 表

**使用场景**:
- ❌ `message-receiver.js` - Worker 消息接收器（已废弃，数据进 DataStore）
- ❌ `/api/v1/comments` - REST API（admin-web 不使用）
- ❌ `/api/v1/direct-messages` - REST API（admin-web 不使用）
- ⚠️ `cleanup-service.js` - 数据清理服务（需要迁移）
- ⚠️ `statistics-service.js` - 统计服务（需要迁移）

#### 2. 新架构（持久化系统）

**数据表** (cache_ 前缀):
- `cache_comments` - 评论数据（持久化）
- `cache_messages` - 私信数据（持久化）
- `cache_contents` - 作品数据（持久化）
- `cache_conversations` - 会话数据（持久化）
- `cache_notifications` - 通知数据（持久化）
- `cache_metadata` - 元数据（持久化）

**访问方式**:
- `DataStore` (内存) ← Worker 实时推送
- `CacheDAO` → `cache_*` 表（持久化）
- `PersistenceManager` - 自动持久化管理

**使用场景**:
- ✅ IM WebSocket Server（实时数据）
- ✅ Worker 数据同步
- ✅ 数据持久化和恢复
- ✅ 数据过期清理

---

## 🎯 清理目标

### 需要删除的表（7 个）

```sql
-- 评论相关
DROP TABLE IF EXISTS comments;

-- 私信相关
DROP TABLE IF EXISTS direct_messages;
DROP TABLE IF EXISTS conversations;

-- 作品相关
DROP TABLE IF EXISTS contents;
DROP TABLE IF EXISTS discussions;

-- 通知相关
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_rules;
```

### 需要删除的 DAO 类（7 个）

```
packages/master/src/database/
├── comments-dao.js          ❌ 删除
├── messages-dao.js          ❌ 删除（保留已读方法移至 CacheDAO）
├── contents-dao.js          ❌ 删除
├── conversations-dao.js     ❌ 删除
├── discussions-dao.js       ❌ 删除
└── notifications-dao.js     ❌ 删除

packages/master/src/dao/
├── ContentsDAO.js           ❌ 删除
└── DiscussionsDAO.js        ❌ 删除
```

### 需要修改的代码文件

**1. packages/master/src/index.js**
- 删除旧 DAO 初始化代码
- 移除旧 DAO 传参

**2. packages/master/src/communication/message-receiver.js**
- 删除旧 DAO 的导入和使用
- 确认 Worker 数据只进 DataStore

**3. packages/master/src/api/routes/messages.js**
- 删除旧的 REST API 路由（admin-web 不使用）
- 或改为从 DataStore 读取

**4. packages/master/src/services/cleanup-service.js**
- 从 `CacheDAO` 清理 cache_ 表数据
- 删除旧表的清理逻辑

**5. packages/master/src/services/statistics-service.js**
- 从 `DataStore` 或 `CacheDAO` 读取统计数据
- 删除旧表的查询逻辑

**6. packages/master/src/communication/im-websocket-server.js**
- 已读状态方法移至 CacheDAO
- 更新构造函数参数

---

## 📊 数据迁移策略

### 方案一：不迁移（推荐）

**原因**:
- 旧表数据已过期（持久化系统已运行）
- DataStore 和 cache_* 表已有最新数据
- Worker 持续推送新数据到 DataStore

**步骤**:
1. 确认 DataStore 和 cache_* 表有完整数据
2. 直接删除旧表
3. 清理相关代码

### 方案二：数据合并（不推荐）

**步骤**:
1. 从旧表读取数据
2. 转换为 DataStore 格式
3. 写入 cache_* 表
4. 删除旧表

**缺点**:
- 复杂度高
- 可能有重复数据
- 旧数据格式可能不兼容

---

## 🔄 实施步骤

### Phase 1: 代码清理 ✅

#### 1.1 修改 IM WebSocket Server

将已读状态方法从旧 DAO 迁移到 CacheDAO：

```javascript
// packages/master/src/persistence/cache-dao.js
class CacheDAO {
  /**
   * 标记评论为已读
   * @param {string} id - 评论ID
   * @param {number} readAt - 已读时间戳
   */
  markCommentAsRead(id, readAt = null) {
    const timestamp = readAt || Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare('UPDATE cache_comments SET is_read = 1, read_at = ? WHERE id = ?')
      .run(timestamp, id);
    return result.changes > 0;
  }

  /**
   * 批量标记评论为已读
   */
  markCommentsAsRead(ids, readAt = null) {
    if (!ids || ids.length === 0) return 0;
    const timestamp = readAt || Math.floor(Date.now() / 1000);
    const placeholders = ids.map(() => '?').join(',');
    const result = this.db.prepare(`
      UPDATE cache_comments
      SET is_read = 1, read_at = ?
      WHERE id IN (${placeholders})
    `).run(timestamp, ...ids);
    return result.changes;
  }

  /**
   * 统计未读评论数量
   */
  countUnreadComments(accountId = null) {
    let sql = 'SELECT COUNT(*) as count FROM cache_comments WHERE is_read = 0';
    const params = [];
    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }
    return this.db.prepare(sql).get(...params).count;
  }

  // 私信已读方法（类似）
  markMessageAsRead(id, readAt = null) { /* ... */ }
  markMessagesAsRead(ids, readAt = null) { /* ... */ }
  countUnreadMessages(accountId = null) { /* ... */ }
}
```

**修改 im-websocket-server.js**:
```javascript
// 构造函数改为接收 cacheDAO
constructor(io, dataStore, cacheDAO = null) {
  this.io = io;
  this.dataStore = dataStore;
  this.cacheDAO = cacheDAO;
}

// 已读事件处理改为使用 cacheDAO
handleMarkAsRead(socket, data) {
  const { type, id } = data;
  if (type === 'comment' && this.cacheDAO) {
    success = this.cacheDAO.markCommentAsRead(id, readAt);
  } else if (type === 'message' && this.cacheDAO) {
    success = this.cacheDAO.markMessageAsRead(id, readAt);
  }
}
```

#### 1.2 修改 cleanup-service.js

从 CacheDAO 清理数据：

```javascript
class CleanupService {
  constructor(db) {
    this.cacheDAO = new CacheDAO(db);
  }

  async cleanExpiredData() {
    const now = Math.floor(Date.now() / 1000);

    // 清理过期评论（cache_comments）
    const commentsCleaned = this.cacheDAO.db.prepare(`
      DELETE FROM cache_comments
      WHERE detected_at < ?
    `).run(now - 30 * 24 * 3600).changes;

    // 清理过期私信（cache_messages）
    const messagesCleaned = this.cacheDAO.db.prepare(`
      DELETE FROM cache_messages
      WHERE detected_at < ?
    `).run(now - 90 * 24 * 3600).changes;

    logger.info(`Cleaned expired data: ${commentsCleaned} comments, ${messagesCleaned} messages`);
  }
}
```

#### 1.3 修改 statistics-service.js

从 DataStore 或 CacheDAO 读取统计：

```javascript
class StatisticsService {
  constructor(dataStore, cacheDAO) {
    this.dataStore = dataStore;
    this.cacheDAO = cacheDAO;
  }

  getStatistics() {
    // 优先从 DataStore（内存）获取实时统计
    const stats = this.dataStore.getStats();

    // 或从 CacheDAO 获取历史统计
    const totalComments = this.cacheDAO.db.prepare('SELECT COUNT(*) as count FROM cache_comments').get().count;
    const totalMessages = this.cacheDAO.db.prepare('SELECT COUNT(*) as count FROM cache_messages').get().count;

    return {
      realtime: stats,
      historical: {
        totalComments,
        totalMessages,
      },
    };
  }
}
```

#### 1.4 修改 message-receiver.js

确认只写入 DataStore，删除旧 DAO：

```javascript
class MessageReceiver {
  constructor(db, dataStore) {
    this.dataStore = dataStore;
    // ❌ 删除：this.commentsDAO = new CommentsDAO(db);
    // ❌ 删除：this.messagesDAO = new DirectMessagesDAO(db);
  }

  handleWorkerData(workerId, payload) {
    const { account_id, data } = payload;

    // ✅ 只写入 DataStore（内存）
    this.dataStore.updateAccountData(account_id, {
      platform: data.platform,
      data: data,
    });

    // ❌ 删除：不再写入旧表
  }
}
```

#### 1.5 修改 index.js

删除旧 DAO 初始化：

```javascript
// ❌ 删除这些初始化
// const commentsDAO = new CommentsDAO(db);
// const directMessagesDAO = new DirectMessagesDAO(db);
// const conversationsDAO = new ConversationsDAO(db);
// const contentsDAO = new ContentsDAO(db);
// const discussionsDAO = new DiscussionsDAO(db);
// const notificationsDAO = new NotificationsDAO(db);

// ✅ 保留 CacheDAO
const cacheDAO = new CacheDAO(db);

// ✅ 更新 IMWebSocketServer 初始化
const imWebSocketServer = new IMWebSocketServer(socketNamespaces.io, dataStore, cacheDAO);
```

#### 1.6 删除或修改 REST API

**选项 A**: 删除旧 API（推荐，admin-web 不使用）

```javascript
// packages/master/src/api/routes/messages.js
// ❌ 删除整个文件，或删除使用旧 DAO 的路由
```

**选项 B**: 改为从 DataStore 读取

```javascript
// GET /api/v1/comments
router.get('/comments', (req, res) => {
  const { account_id } = req.query;
  const accountData = dataStore.getAccountData(account_id);

  if (!accountData) {
    return res.json({ success: true, data: [] });
  }

  const comments = Array.from(accountData.data.comments.values());
  res.json({ success: true, data: comments });
});
```

---

### Phase 2: 数据库清理 ✅

#### 2.1 验证 cache_* 表有数据

```javascript
// tests/test-cache-data-verify.js
const Database = require('better-sqlite3');
const db = new Database('./packages/master/data/master.db');

console.log('=== Verifying cache_* tables ===');

const cacheTables = ['cache_comments', 'cache_messages', 'cache_contents', 'cache_conversations', 'cache_notifications'];
for (const table of cacheTables) {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
  console.log(`✓ ${table}: ${count} rows`);
}

db.close();
```

#### 2.2 创建删除脚本

```sql
-- packages/master/src/database/migrations/drop-legacy-tables.sql

-- 删除评论相关表
DROP TABLE IF EXISTS comments;

-- 删除私信相关表
DROP TABLE IF EXISTS direct_messages;
DROP TABLE IF EXISTS conversations;

-- 删除作品相关表
DROP TABLE IF EXISTS contents;
DROP TABLE IF EXISTS discussions;

-- 删除通知相关表
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_rules;

-- 清理索引（SQLite 会自动删除，但显式列出以供记录）
-- DROP INDEX IF EXISTS idx_comments_unread;
-- DROP INDEX IF EXISTS idx_messages_unread;
-- ...
```

#### 2.3 更新 schema.sql

删除旧表定义，只保留：
- 核心表：accounts, workers, worker_configs, worker_runtime, proxies, login_sessions, client_sessions, replies, worker_logs
- 新表：cache_comments, cache_messages, cache_contents, cache_conversations, cache_notifications, cache_metadata

---

### Phase 3: 测试验证 ✅

#### 3.1 功能测试

```javascript
// tests/test-legacy-cleanup.js

const tests = [
  '✓ DataStore 包含最新数据',
  '✓ cache_* 表可以正常读写',
  '✓ IM WebSocket Server 已读功能正常',
  '✓ CleanupService 清理 cache_* 表',
  '✓ StatisticsService 从 DataStore/CacheDAO 读取',
  '✓ PersistenceManager 持久化正常',
  '✓ Worker 数据推送正常',
  '✓ Admin Web 功能正常（如果使用 REST API）',
];
```

#### 3.2 性能测试

- DataStore 内存占用
- cache_* 表查询性能
- 持久化速度

---

## 📝 待确认问题

### 1. admin-web 是否使用 REST API？

**检查结果**:
- `admin-web/src/services/api.js` 定义了 `/api/v1/comments` 和 `/api/v1/direct-messages`
- 但需要确认是否实际使用（MessageManagementPage.js）

**解决方案**:
- 如果使用：改为从 DataStore 读取
- 如果不使用：直接删除 API

### 2. notification_rules 表是否有用？

**检查**:
- 是否有通知规则配置功能？
- 是否有其他地方引用？

**建议**:
- 如果未使用，直接删除
- 如果使用，保留（但从 schema 看应该未使用）

---

## 🚀 实施建议

### 优先级

1. **高优先级** - 删除明确无用的代码：
   - `message-receiver.js` 中的旧 DAO 使用
   - 旧 DAO 文件（7 个）
   - 旧表（7 个）

2. **中优先级** - 迁移功能到新架构：
   - `cleanup-service.js` 迁移到 CacheDAO
   - `statistics-service.js` 迁移到 DataStore/CacheDAO
   - `im-websocket-server.js` 已读方法迁移到 CacheDAO

3. **低优先级** - API 清理：
   - 确认 admin-web 是否使用 REST API
   - 删除或改造 `/api/v1/messages.js`

### 安全措施

1. **数据备份**:
   ```bash
   cp packages/master/data/master.db packages/master/data/master.db.backup
   ```

2. **分阶段提交**:
   - Commit 1: 代码迁移（不删表）
   - Commit 2: 测试验证
   - Commit 3: 删除旧表和旧代码

3. **回滚计划**:
   - 保留备份数据库
   - 保留旧代码的 Git 历史

---

## 📊 预期效果

### 代码简化

- 删除 7 个 DAO 文件（~2000 行代码）
- 删除 7 个数据库表
- 统一数据访问路径：Worker → DataStore → cache_* 表

### 性能提升

- 减少数据库表数量（18 → 11）
- 减少数据冗余
- 简化数据同步逻辑

### 维护性提升

- 单一数据源（DataStore）
- 清晰的架构（内存 + 持久化）
- 减少代码维护成本

---

**文档维护者**: Claude Code
**最后更新**: 2025-11-03
