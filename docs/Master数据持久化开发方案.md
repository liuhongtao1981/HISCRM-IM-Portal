# Master 数据持久化开发方案

**版本**: v1.0
**创建时间**: 2025-11-03
**状态**: 待实施

---

## 📋 目录

1. [设计目标](#设计目标)
2. [架构设计](#架构设计)
3. [数据库表结构设计](#数据库表结构设计)
4. [数据持久化策略](#数据持久化策略)
5. [实施方案](#实施方案)
6. [技术细节](#技术细节)
7. [测试方案](#测试方案)
8. [风险评估](#风险评估)

---

## 设计目标

### 核心理念

**内存优先 + 数据库备份**

```
┌─────────────────────────────────────┐
│   Worker 推送数据                    │
│         ↓                            │
│   DataStore (内存)  ← 主要交互       │
│         ↓                            │
│   定时持久化到数据库 (备份)          │
│         ↓                            │
│   Master 重启时从数据库加载          │
└─────────────────────────────────────┘
```

### 设计原则

1. **内存优先**: 所有读写操作都在内存中进行,保证性能
2. **异步持久化**: 定时批量写入数据库,不阻塞主流程
3. **结构一致**: 数据库表结构与内存结构完全一致,减少转换
4. **智能策略**: 根据数据新旧程度和重要性决定持久化频率
5. **启动加载**: Master 启动时从数据库加载最近数据到内存

### 解决的问题

| 问题 | 现状 | 解决方案 |
|------|------|----------|
| **数据丢失** | Master 重启后所有数据丢失 | 定时持久化 + 启动加载 |
| **内存溢出** | 无数据过期机制,内存无限增长 | 根据时效性清理旧数据 |
| **数据转换** | 内存格式 ≠ 数据库格式,需要转换 | 统一数据结构,零转换 |
| **性能影响** | 持久化可能阻塞主线程 | 异步批量写入 + 队列机制 |

---

## 架构设计

### 整体架构

```
┌────────────────────────────────────────────────────────────┐
│                     Master 服务器                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                  DataStore (内存)                    │  │
│  │                                                      │  │
│  │  accounts: Map<accountId, AccountData>              │  │
│  │    AccountData: {                                   │  │
│  │      accountId, platform, lastUpdate,               │  │
│  │      data: {                                        │  │
│  │        comments: Map<id, Comment>,                  │  │
│  │        contents: Map<id, Content>,                  │  │
│  │        conversations: Map<id, Conversation>,        │  │
│  │        messages: Map<id, Message>,                  │  │
│  │        notifications: Map<id, Notification>         │  │
│  │      }                                              │  │
│  │    }                                                │  │
│  └──────────────┬────────────────────┬─────────────────┘  │
│                 │                    │                     │
│                 │ 读写 (主要)         │ 定时持久化          │
│                 ↓                    ↓                     │
│  ┌──────────────────┐   ┌───────────────────────────────┐ │
│  │  IM WebSocket    │   │  PersistenceManager           │ │
│  │  (Socket.IO)     │   │  - 定时持久化 (5分钟)          │ │
│  └──────────────────┘   │  - 增量写入策略                │ │
│                         │  - 启动加载逻辑                │ │
│                         │  - 数据过期清理                │ │
│                         └───────────┬───────────────────┘ │
│                                     │                      │
│                                     │ SQLite               │
│                                     ↓                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │          数据库 (master.db)                          │  │
│  │                                                      │  │
│  │  cache_* 表 (与内存结构一致):                        │  │
│  │    - cache_comments                                 │  │
│  │    - cache_contents                                 │  │
│  │    - cache_conversations                            │  │
│  │    - cache_messages                                 │  │
│  │    - cache_notifications                            │  │
│  │    - cache_metadata (元数据)                        │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. PersistenceManager (持久化管理器)

**职责**:
- 定时持久化内存数据到数据库
- Master 启动时从数据库加载数据
- 管理数据过期和清理策略
- 监控持久化性能和状态

**关键方法**:
```javascript
class PersistenceManager {
  // 启动时加载数据
  async loadFromDatabase()

  // 定时持久化
  async persistToDatabase()

  // 增量持久化 (只持久化变更数据)
  async persistChanges()

  // 清理过期数据
  async cleanExpiredData()

  // 获取持久化统计
  getStats()
}
```

#### 2. DataStore 增强

**新增功能**:
- 标记数据变更 (dirty flag)
- 记录最后持久化时间
- 支持增量导出

---

## 数据库表结构设计

### 设计原则

1. **表名统一前缀**: `cache_` 前缀,与业务表区分
2. **结构一致**: 与内存 Map 的 value 结构完全一致
3. **JSON 扁平化**: 复杂对象存为 JSON TEXT
4. **最小字段**: 只保留核心字段 + 元数据字段

### 元数据表

#### cache_metadata

记录数据持久化的元信息。

```sql
CREATE TABLE IF NOT EXISTS cache_metadata (
  -- 主键
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 账户信息
  account_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,

  -- 时间戳
  last_update INTEGER NOT NULL,           -- 内存最后更新时间
  last_persist INTEGER NOT NULL,          -- 最后持久化时间
  last_load INTEGER,                      -- 最后加载时间

  -- 数据统计
  comments_count INTEGER DEFAULT 0,
  contents_count INTEGER DEFAULT 0,
  conversations_count INTEGER DEFAULT 0,
  messages_count INTEGER DEFAULT 0,
  notifications_count INTEGER DEFAULT 0,

  -- 元数据
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cache_metadata_account_id
  ON cache_metadata(account_id);
CREATE INDEX IF NOT EXISTS idx_cache_metadata_last_persist
  ON cache_metadata(last_persist);
```

### 数据表

#### cache_comments (评论缓存)

```sql
CREATE TABLE IF NOT EXISTS cache_comments (
  -- 主键 (与内存 Map key 一致)
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,
  content_id TEXT,

  -- 评论数据 (JSON - 与内存对象完全一致)
  data TEXT NOT NULL,

  -- 元数据
  created_at INTEGER NOT NULL,            -- 评论创建时间 (业务时间)
  updated_at INTEGER NOT NULL,            -- 记录更新时间
  persist_at INTEGER NOT NULL             -- 持久化时间
);

CREATE INDEX IF NOT EXISTS idx_cache_comments_account_id
  ON cache_comments(account_id);
CREATE INDEX IF NOT EXISTS idx_cache_comments_content_id
  ON cache_comments(content_id);
CREATE INDEX IF NOT EXISTS idx_cache_comments_created_at
  ON cache_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_comments_persist_at
  ON cache_comments(persist_at);

-- 唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_comments_unique
  ON cache_comments(account_id, id);
```

**data 字段 JSON 结构** (与内存对象一致):
```json
{
  "id": "comment_123",
  "contentId": "content_456",
  "accountId": "acc_789",
  "platform": "douyin",
  "authorId": "user_001",
  "authorName": "张三",
  "authorAvatar": "https://...",
  "content": "这个视频很棒!",
  "createdAt": 1698765432000,
  "isNew": false,
  "status": "active"
}
```

#### cache_contents (作品缓存)

```sql
CREATE TABLE IF NOT EXISTS cache_contents (
  -- 主键
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,

  -- 作品数据 (JSON)
  data TEXT NOT NULL,

  -- 元数据
  publish_time INTEGER NOT NULL,          -- 发布时间 (业务时间)
  updated_at INTEGER NOT NULL,
  persist_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_contents_account_id
  ON cache_contents(account_id);
CREATE INDEX IF NOT EXISTS idx_cache_contents_publish_time
  ON cache_contents(publish_time);
CREATE INDEX IF NOT EXISTS idx_cache_contents_persist_at
  ON cache_contents(persist_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_contents_unique
  ON cache_contents(account_id, id);
```

**data 字段 JSON 结构**:
```json
{
  "id": "content_456",
  "accountId": "acc_789",
  "platform": "douyin",
  "type": "video",
  "title": "精彩瞬间",
  "description": "这是描述",
  "coverUrl": "https://...",
  "videoUrl": "https://...",
  "publishTime": 1698765432000,
  "viewCount": 10000,
  "likeCount": 500,
  "commentCount": 50,
  "shareCount": 10,
  "status": "published"
}
```

#### cache_conversations (会话缓存)

```sql
CREATE TABLE IF NOT EXISTS cache_conversations (
  -- 主键
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  -- 会话数据 (JSON)
  data TEXT NOT NULL,

  -- 元数据
  last_message_time INTEGER,              -- 最后消息时间 (业务时间)
  updated_at INTEGER NOT NULL,
  persist_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_conversations_account_id
  ON cache_conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_cache_conversations_user_id
  ON cache_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_cache_conversations_last_message_time
  ON cache_conversations(last_message_time);
CREATE INDEX IF NOT EXISTS idx_cache_conversations_persist_at
  ON cache_conversations(persist_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_conversations_unique
  ON cache_conversations(account_id, id);
```

**data 字段 JSON 结构**:
```json
{
  "id": "conv_123",
  "conversationId": "conv_123",
  "accountId": "acc_789",
  "platform": "douyin",
  "type": "private",
  "userId": "user_001",
  "userName": "张三",
  "userAvatar": "https://...",
  "unreadCount": 5,
  "lastMessageContent": "你好",
  "lastMessageTime": 1698765432000,
  "lastMessageType": "text",
  "status": "active",
  "isPinned": false,
  "isMuted": false
}
```

#### cache_messages (私信缓存)

```sql
CREATE TABLE IF NOT EXISTS cache_messages (
  -- 主键
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,

  -- 消息数据 (JSON)
  data TEXT NOT NULL,

  -- 元数据
  created_at INTEGER NOT NULL,            -- 消息创建时间 (业务时间)
  updated_at INTEGER NOT NULL,
  persist_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_messages_account_id
  ON cache_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_cache_messages_conversation_id
  ON cache_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cache_messages_created_at
  ON cache_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_messages_persist_at
  ON cache_messages(persist_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_messages_unique
  ON cache_messages(account_id, id);
```

**data 字段 JSON 结构**:
```json
{
  "id": "msg_123",
  "conversationId": "conv_456",
  "accountId": "acc_789",
  "platform": "douyin",
  "senderId": "user_001",
  "senderName": "张三",
  "senderAvatar": "https://...",
  "receiverId": "user_002",
  "content": "你好,最近怎么样?",
  "messageType": "text",
  "createdAt": 1698765432000,
  "isNew": false,
  "isRead": false,
  "status": "sent"
}
```

#### cache_notifications (通知缓存)

```sql
CREATE TABLE IF NOT EXISTS cache_notifications (
  -- 主键
  id TEXT PRIMARY KEY,

  -- 关联
  account_id TEXT NOT NULL,

  -- 通知数据 (JSON)
  data TEXT NOT NULL,

  -- 元数据
  created_at INTEGER NOT NULL,            -- 通知创建时间 (业务时间)
  updated_at INTEGER NOT NULL,
  persist_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_notifications_account_id
  ON cache_notifications(account_id);
CREATE INDEX IF NOT EXISTS idx_cache_notifications_created_at
  ON cache_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_notifications_persist_at
  ON cache_notifications(persist_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_notifications_unique
  ON cache_notifications(account_id, id);
```

**data 字段 JSON 结构**:
```json
{
  "id": "notif_123",
  "accountId": "acc_789",
  "platform": "douyin",
  "type": "new_comment",
  "title": "新评论",
  "content": "张三评论了你的视频",
  "relatedId": "comment_456",
  "relatedType": "comment",
  "isRead": false,
  "createdAt": 1698765432000
}
```

---

## 数据持久化策略

### 持久化触发条件

| 触发方式 | 频率 | 说明 |
|---------|------|------|
| **定时持久化** | 每 5 分钟 | 自动持久化所有变更数据 |
| **阈值触发** | 变更 > 1000 条 | 变更数据超过阈值立即持久化 |
| **手动触发** | API 调用 | 通过 DEBUG API 手动触发 |
| **关闭前持久化** | 进程退出前 | 监听 SIGTERM/SIGINT 信号 |

### 数据过期策略

根据数据类型设置不同的保留期限:

| 数据类型 | 内存保留 | 数据库保留 | 清理频率 |
|---------|---------|-----------|---------|
| **评论** | 7 天 | 30 天 | 每天 1 次 |
| **私信** | 30 天 | 90 天 | 每天 1 次 |
| **作品** | 30 天 | 永久 | 每天 1 次 |
| **会话** | 30 天 | 90 天 | 每天 1 次 |
| **通知** | 3 天 | 7 天 | 每 6 小时 1 次 |

**配置文件** (`config/data-retention.js`):
```javascript
module.exports = {
  // 内存保留时间 (毫秒)
  memory: {
    comments: 7 * 24 * 60 * 60 * 1000,       // 7 天
    messages: 30 * 24 * 60 * 60 * 1000,      // 30 天
    contents: 30 * 24 * 60 * 60 * 1000,      // 30 天
    conversations: 30 * 24 * 60 * 60 * 1000, // 30 天
    notifications: 3 * 24 * 60 * 60 * 1000,  // 3 天
  },

  // 数据库保留时间 (毫秒)
  database: {
    comments: 30 * 24 * 60 * 60 * 1000,      // 30 天
    messages: 90 * 24 * 60 * 60 * 1000,      // 90 天
    contents: 0,                              // 永久
    conversations: 90 * 24 * 60 * 60 * 1000, // 90 天
    notifications: 7 * 24 * 60 * 60 * 1000,  // 7 天
  },

  // 清理频率 (毫秒)
  cleanupInterval: {
    comments: 24 * 60 * 60 * 1000,           // 每天
    messages: 24 * 60 * 60 * 1000,           // 每天
    contents: 24 * 60 * 60 * 1000,           // 每天
    conversations: 24 * 60 * 60 * 1000,      // 每天
    notifications: 6 * 60 * 60 * 1000,       // 每 6 小时
  },
};
```

### 持久化流程

#### 完整持久化流程

```
1. 定时器触发 (5 分钟)
   ↓
2. 检查是否有变更数据
   ↓
3. 导出内存快照
   ↓
4. 开启数据库事务
   ↓
5. 批量 UPSERT (INSERT OR REPLACE)
   - cache_comments
   - cache_contents
   - cache_conversations
   - cache_messages
   - cache_notifications
   ↓
6. 更新 cache_metadata
   ↓
7. 提交事务
   ↓
8. 更新持久化统计
   ↓
9. 清理过期数据 (可选)
```

#### 增量持久化优化

只持久化变更的数据,减少写入量:

```javascript
class DataStore {
  constructor() {
    this.accounts = new Map();
    this.dirtyData = new Set(); // 标记变更的数据 ID
  }

  updateAccountData(accountId, snapshot) {
    // ... 更新逻辑

    // 标记为脏数据
    this.dirtyData.add(accountId);
  }

  exportDirtySnapshot() {
    // 只导出标记为脏的账户数据
    const snapshot = {
      timestamp: Date.now(),
      accounts: {},
    };

    for (const accountId of this.dirtyData) {
      const accountData = this.accounts.get(accountId);
      if (accountData) {
        snapshot.accounts[accountId] = this.serializeAccount(accountData);
      }
    }

    return snapshot;
  }

  clearDirtyFlags() {
    this.dirtyData.clear();
  }
}
```

---

## 实施方案

### 第一阶段: 数据库表结构 (2 小时)

**任务**:
1. 创建新的 schema 文件: `packages/master/src/database/cache-schema.sql`
2. 创建所有 6 个缓存表 + 索引
3. 编写 schema 验证脚本

**文件**:
- `packages/master/src/database/cache-schema.sql`
- `packages/master/src/database/cache-schema-validator.js`

**验证**:
```bash
node packages/master/src/database/cache-schema-validator.js
```

---

### 第二阶段: 持久化管理器 (4 小时)

**任务**:
1. 创建 `PersistenceManager` 类
2. 实现定时持久化逻辑
3. 实现启动加载逻辑
4. 实现数据过期清理

**文件**:
- `packages/master/src/persistence/persistence-manager.js`
- `packages/master/src/persistence/cache-dao.js`
- `packages/master/src/config/data-retention.js`

**核心代码**:

#### packages/master/src/persistence/persistence-manager.js

```javascript
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const CacheDAO = require('./cache-dao');
const retentionConfig = require('../config/data-retention');

const logger = createLogger('persistence-manager');

class PersistenceManager {
  constructor(db, dataStore) {
    this.db = db;
    this.dataStore = dataStore;
    this.cacheDAO = new CacheDAO(db);

    this.config = {
      persistInterval: 5 * 60 * 1000,        // 5 分钟
      changeThreshold: 1000,                 // 变更阈值
      batchSize: 500,                        // 批量写入大小
    };

    this.stats = {
      totalPersists: 0,
      lastPersistTime: null,
      lastPersistDuration: 0,
      totalItemsPersisted: 0,
    };

    this.persistTimer = null;
    this.cleanupTimers = {};
  }

  /**
   * 启动持久化管理器
   */
  async start() {
    try {
      logger.info('🚀 Starting PersistenceManager...');

      // 1. 从数据库加载数据
      await this.loadFromDatabase();

      // 2. 启动定时持久化
      this.startPersistTimer();

      // 3. 启动定时清理
      this.startCleanupTimers();

      // 4. 监听进程退出事件
      this.setupExitHandler();

      logger.info('✅ PersistenceManager started');
    } catch (error) {
      logger.error('❌ Failed to start PersistenceManager:', error);
      throw error;
    }
  }

  /**
   * 停止持久化管理器
   */
  async stop() {
    logger.info('🛑 Stopping PersistenceManager...');

    // 停止定时器
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
    }

    for (const timer of Object.values(this.cleanupTimers)) {
      clearInterval(timer);
    }

    // 最后一次持久化
    await this.persistToDatabase();

    logger.info('✅ PersistenceManager stopped');
  }

  /**
   * 从数据库加载数据到内存
   */
  async loadFromDatabase() {
    const startTime = Date.now();
    logger.info('📥 Loading data from database...');

    try {
      // 获取所有账户元数据
      const metadataList = this.cacheDAO.getAllMetadata();

      let totalLoaded = {
        accounts: 0,
        comments: 0,
        contents: 0,
        conversations: 0,
        messages: 0,
        notifications: 0,
      };

      for (const metadata of metadataList) {
        const { account_id, platform } = metadata;

        // 加载各类数据
        const comments = this.cacheDAO.getCommentsByAccount(account_id);
        const contents = this.cacheDAO.getContentsByAccount(account_id);
        const conversations = this.cacheDAO.getConversationsByAccount(account_id);
        const messages = this.cacheDAO.getMessagesByAccount(account_id);
        const notifications = this.cacheDAO.getNotificationsByAccount(account_id);

        // 构建快照
        const snapshot = {
          platform,
          data: {
            comments: comments.map(row => JSON.parse(row.data)),
            contents: contents.map(row => JSON.parse(row.data)),
            conversations: conversations.map(row => JSON.parse(row.data)),
            messages: messages.map(row => JSON.parse(row.data)),
            notifications: notifications.map(row => JSON.parse(row.data)),
          },
        };

        // 更新 DataStore
        this.dataStore.updateAccountData(account_id, snapshot);

        // 统计
        totalLoaded.accounts++;
        totalLoaded.comments += comments.length;
        totalLoaded.contents += contents.length;
        totalLoaded.conversations += conversations.length;
        totalLoaded.messages += messages.length;
        totalLoaded.notifications += notifications.length;

        logger.debug(`Loaded account ${account_id}:`, {
          comments: comments.length,
          contents: contents.length,
          conversations: conversations.length,
          messages: messages.length,
          notifications: notifications.length,
        });
      }

      const duration = Date.now() - startTime;

      logger.info(`✅ Data loaded from database in ${duration}ms:`, totalLoaded);

      // 清空脏标记 (刚加载的数据不需要立即持久化)
      this.dataStore.clearDirtyFlags();

      return totalLoaded;

    } catch (error) {
      logger.error('❌ Failed to load data from database:', error);
      throw error;
    }
  }

  /**
   * 持久化数据到数据库
   */
  async persistToDatabase() {
    const startTime = Date.now();

    try {
      // 导出脏数据快照
      const snapshot = this.dataStore.exportDirtySnapshot();

      const accountIds = Object.keys(snapshot.accounts);
      if (accountIds.length === 0) {
        logger.debug('No dirty data to persist');
        return { persisted: 0, duration: 0 };
      }

      logger.info(`💾 Persisting ${accountIds.length} accounts to database...`);

      let totalPersisted = {
        comments: 0,
        contents: 0,
        conversations: 0,
        messages: 0,
        notifications: 0,
      };

      // 开启事务
      this.db.prepare('BEGIN TRANSACTION').run();

      try {
        for (const accountId of accountIds) {
          const accountData = snapshot.accounts[accountId];
          const { platform, lastUpdate, data } = accountData;

          // 持久化各类数据
          if (data.comments) {
            this.cacheDAO.batchUpsertComments(accountId, data.comments);
            totalPersisted.comments += data.comments.length;
          }

          if (data.contents) {
            this.cacheDAO.batchUpsertContents(accountId, data.contents);
            totalPersisted.contents += data.contents.length;
          }

          if (data.conversations) {
            this.cacheDAO.batchUpsertConversations(accountId, data.conversations);
            totalPersisted.conversations += data.conversations.length;
          }

          if (data.messages) {
            this.cacheDAO.batchUpsertMessages(accountId, data.messages);
            totalPersisted.messages += data.messages.length;
          }

          if (data.notifications) {
            this.cacheDAO.batchUpsertNotifications(accountId, data.notifications);
            totalPersisted.notifications += data.notifications.length;
          }

          // 更新元数据
          this.cacheDAO.upsertMetadata({
            account_id: accountId,
            platform,
            last_update: lastUpdate,
            last_persist: Date.now(),
            comments_count: data.comments?.length || 0,
            contents_count: data.contents?.length || 0,
            conversations_count: data.conversations?.length || 0,
            messages_count: data.messages?.length || 0,
            notifications_count: data.notifications?.length || 0,
          });
        }

        // 提交事务
        this.db.prepare('COMMIT').run();

        // 清空脏标记
        this.dataStore.clearDirtyFlags();

        const duration = Date.now() - startTime;

        // 更新统计
        this.stats.totalPersists++;
        this.stats.lastPersistTime = Date.now();
        this.stats.lastPersistDuration = duration;
        this.stats.totalItemsPersisted += Object.values(totalPersisted).reduce((a, b) => a + b, 0);

        logger.info(`✅ Persist completed in ${duration}ms:`, totalPersisted);

        return {
          persisted: Object.values(totalPersisted).reduce((a, b) => a + b, 0),
          duration,
          accounts: accountIds.length,
          details: totalPersisted,
        };

      } catch (error) {
        // 回滚事务
        this.db.prepare('ROLLBACK').run();
        throw error;
      }

    } catch (error) {
      logger.error('❌ Failed to persist data:', error);
      throw error;
    }
  }

  /**
   * 清理过期数据
   */
  async cleanExpiredData(dataType) {
    const startTime = Date.now();

    try {
      const memoryRetention = retentionConfig.memory[dataType];
      const dbRetention = retentionConfig.database[dataType];

      const now = Date.now();
      const memoryExpireTime = now - memoryRetention;
      const dbExpireTime = dbRetention > 0 ? now - dbRetention : 0;

      logger.info(`🧹 Cleaning expired ${dataType}...`, {
        memoryRetention: `${memoryRetention / (24 * 60 * 60 * 1000)} days`,
        dbRetention: dbRetention > 0 ? `${dbRetention / (24 * 60 * 60 * 1000)} days` : 'permanent',
      });

      // 清理内存
      const memoryDeleted = this.dataStore.cleanExpiredData(dataType, memoryExpireTime);

      // 清理数据库
      let dbDeleted = 0;
      if (dbExpireTime > 0) {
        dbDeleted = this.cacheDAO.cleanExpiredData(dataType, dbExpireTime);
      }

      const duration = Date.now() - startTime;

      logger.info(`✅ Cleanup completed in ${duration}ms:`, {
        dataType,
        memoryDeleted,
        dbDeleted,
      });

      return { memoryDeleted, dbDeleted, duration };

    } catch (error) {
      logger.error(`❌ Failed to clean expired ${dataType}:`, error);
      throw error;
    }
  }

  /**
   * 启动定时持久化
   */
  startPersistTimer() {
    this.persistTimer = setInterval(async () => {
      try {
        await this.persistToDatabase();
      } catch (error) {
        logger.error('Persist timer error:', error);
      }
    }, this.config.persistInterval);

    logger.info(`⏰ Persist timer started (interval: ${this.config.persistInterval / 1000}s)`);
  }

  /**
   * 启动定时清理
   */
  startCleanupTimers() {
    const dataTypes = ['comments', 'contents', 'conversations', 'messages', 'notifications'];

    for (const dataType of dataTypes) {
      const interval = retentionConfig.cleanupInterval[dataType];

      this.cleanupTimers[dataType] = setInterval(async () => {
        try {
          await this.cleanExpiredData(dataType);
        } catch (error) {
          logger.error(`Cleanup timer error (${dataType}):`, error);
        }
      }, interval);

      logger.info(`⏰ Cleanup timer started for ${dataType} (interval: ${interval / (60 * 60 * 1000)}h)`);
    }
  }

  /**
   * 设置退出处理器
   */
  setupExitHandler() {
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, performing graceful shutdown...`);

      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      dataStoreStats: this.dataStore.getStats(),
    };
  }
}

module.exports = PersistenceManager;
```

---

### 第三阶段: DataStore 增强 (2 小时)

**任务**:
1. 添加脏数据标记逻辑
2. 实现增量导出方法
3. 实现内存数据过期清理

**修改文件**:
- `packages/master/src/data/data-store.js`

**新增方法**:
```javascript
class DataStore {
  constructor() {
    this.accounts = new Map();
    this.dirtyAccounts = new Set();  // ⭐ 新增
    this.stats = { ... };
  }

  // ⭐ 新增: 导出脏数据快照
  exportDirtySnapshot() { ... }

  // ⭐ 新增: 清空脏标记
  clearDirtyFlags() { ... }

  // ⭐ 新增: 清理过期数据
  cleanExpiredData(dataType, expireTime) { ... }
}
```

---

### 第四阶段: 集成到 Master (2 小时)

**任务**:
1. 在 Master 启动时初始化 `PersistenceManager`
2. 启动持久化管理器
3. 添加手动持久化 DEBUG API

**修改文件**:
- `packages/master/src/index.js`

**新增 DEBUG API**:
```javascript
// packages/master/src/api/routes/debug-api.js

// 手动触发持久化
router.post('/persistence/persist', async (req, res) => {
  const result = await persistenceManager.persistToDatabase();
  res.json({ success: true, result });
});

// 获取持久化统计
router.get('/persistence/stats', (req, res) => {
  const stats = persistenceManager.getStats();
  res.json({ success: true, stats });
});

// 手动清理过期数据
router.post('/persistence/cleanup/:dataType', async (req, res) => {
  const { dataType } = req.params;
  const result = await persistenceManager.cleanExpiredData(dataType);
  res.json({ success: true, result });
});

// 从数据库重新加载
router.post('/persistence/reload', async (req, res) => {
  const result = await persistenceManager.loadFromDatabase();
  res.json({ success: true, result });
});
```

---

### 第五阶段: 测试验证 (4 小时)

**任务**:
1. 单元测试
2. 集成测试
3. 性能测试
4. 压力测试

**测试脚本**:
- `tests/persistence-manager.test.js`
- `tests/persistence-performance.test.js`
- `tests/persistence-stress.test.js`

---

### 第六阶段: 文档和部署 (2 小时)

**任务**:
1. 更新系统文档
2. 编写运维指南
3. 准备生产部署

---

## 技术细节

### 1. 批量 UPSERT 实现

使用 SQLite 的 `INSERT OR REPLACE` 语法:

```javascript
// packages/master/src/persistence/cache-dao.js

class CacheDAO {
  batchUpsertComments(accountId, comments) {
    const now = Date.now();

    // 准备批量插入语句
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache_comments (
        id, account_id, content_id, data, created_at, updated_at, persist_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((comments) => {
      for (const comment of comments) {
        stmt.run(
          comment.id,
          accountId,
          comment.contentId,
          JSON.stringify(comment),
          comment.createdAt,
          now,
          now
        );
      }
    });

    transaction(comments);
  }
}
```

### 2. 数据过期清理

```javascript
// DataStore 内存清理
class DataStore {
  cleanExpiredData(dataType, expireTime) {
    let deletedCount = 0;

    for (const [accountId, accountData] of this.accounts.entries()) {
      const dataMap = accountData.data[dataType];

      for (const [id, item] of dataMap.entries()) {
        const itemTime = item.createdAt || item.lastMessageTime || 0;

        if (itemTime < expireTime) {
          dataMap.delete(id);
          deletedCount++;
        }
      }
    }

    this.updateStats();
    return deletedCount;
  }
}

// CacheDAO 数据库清理
class CacheDAO {
  cleanExpiredData(dataType, expireTime) {
    const table = `cache_${dataType}`;
    const timeField = this.getTimeField(dataType);

    const result = this.db.prepare(`
      DELETE FROM ${table}
      WHERE ${timeField} < ?
    `).run(expireTime);

    return result.changes;
  }

  getTimeField(dataType) {
    const mapping = {
      comments: 'created_at',
      contents: 'publish_time',
      conversations: 'last_message_time',
      messages: 'created_at',
      notifications: 'created_at',
    };
    return mapping[dataType];
  }
}
```

### 3. 性能优化

#### 批量写入优化

```javascript
// 使用事务 + 批量插入
const batchSize = 500;

for (let i = 0; i < comments.length; i += batchSize) {
  const batch = comments.slice(i, i + batchSize);

  this.db.prepare('BEGIN TRANSACTION').run();

  for (const comment of batch) {
    stmt.run(...);
  }

  this.db.prepare('COMMIT').run();
}
```

#### 索引优化

```sql
-- 复合索引 (加速查询)
CREATE INDEX idx_cache_comments_account_created
  ON cache_comments(account_id, created_at DESC);

-- 部分索引 (只索引活跃数据)
CREATE INDEX idx_cache_comments_recent
  ON cache_comments(persist_at)
  WHERE persist_at > strftime('%s', 'now', '-30 days');
```

---

## 测试方案

### 单元测试

```javascript
// tests/persistence-manager.test.js

describe('PersistenceManager', () => {
  let db;
  let dataStore;
  let manager;

  beforeEach(() => {
    db = new Database(':memory:');
    dataStore = new DataStore();
    manager = new PersistenceManager(db, dataStore);
  });

  test('should load data from database', async () => {
    // 准备测试数据
    await seedTestData(db);

    // 加载
    const result = await manager.loadFromDatabase();

    // 验证
    expect(result.accounts).toBe(5);
    expect(result.comments).toBeGreaterThan(0);
  });

  test('should persist dirty data', async () => {
    // 添加数据到 DataStore
    dataStore.updateAccountData('acc_1', mockSnapshot);

    // 持久化
    const result = await manager.persistToDatabase();

    // 验证数据库
    const count = db.prepare('SELECT COUNT(*) as count FROM cache_comments').get().count;
    expect(count).toBeGreaterThan(0);
  });

  test('should clean expired data', async () => {
    // 添加过期数据
    await seedExpiredData(db);

    // 清理
    const result = await manager.cleanExpiredData('comments');

    // 验证
    expect(result.dbDeleted).toBeGreaterThan(0);
  });
});
```

### 性能测试

```javascript
// tests/persistence-performance.test.js

test('should persist 10000 items in < 5 seconds', async () => {
  const start = Date.now();

  // 准备 10000 条数据
  const snapshot = generateLargeSnapshot(10000);
  dataStore.updateAccountData('acc_1', snapshot);

  // 持久化
  await manager.persistToDatabase();

  const duration = Date.now() - start;

  expect(duration).toBeLessThan(5000);
});
```

---

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **持久化阻塞主线程** | 高 | 中 | 使用异步 + 队列机制 |
| **数据库写入失败** | 高 | 低 | 事务回滚 + 重试机制 |
| **内存占用增加** | 中 | 中 | 定期清理过期数据 |
| **数据不一致** | 高 | 低 | 事务保证原子性 |
| **启动加载缓慢** | 中 | 中 | 分页加载 + 懒加载 |

---

## 总结

### 实施时间估算

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| 1 | 数据库表结构 | 2 小时 |
| 2 | 持久化管理器 | 4 小时 |
| 3 | DataStore 增强 | 2 小时 |
| 4 | 集成到 Master | 2 小时 |
| 5 | 测试验证 | 4 小时 |
| 6 | 文档和部署 | 2 小时 |
| **总计** | - | **16 小时 (2 天)** |

### 关键优势

1. ✅ **内存优先**: 保证读写性能
2. ✅ **零转换**: 数据库结构与内存一致
3. ✅ **智能策略**: 根据数据类型设置不同保留期限
4. ✅ **易于维护**: 清晰的分层架构
5. ✅ **向后兼容**: 不影响现有业务逻辑

---

**文档维护者**: Claude Code
**最后更新**: 2025-11-03
