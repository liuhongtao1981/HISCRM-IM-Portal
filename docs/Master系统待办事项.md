# Master 系统待办事项

**文档版本**: v1.0
**创建时间**: 2025-10-31
**状态**: 待处理

---

## 📋 待办任务清单

### 1. 移除废弃的 API

**优先级**: 🔴 高
**状态**: ⏳ 待处理

#### 需要移除的 API

**位置**: `packages/master/src/api/routes/im/`

需要评估和移除的废弃 API 端点：

```
packages/master/src/api/routes/im/
├── accounts.js          # 账户相关 API（需评估）
├── messages.js          # 消息相关 API（需评估）
├── conversations.js     # 会话相关 API（需评估）
└── notifications.js     # 通知相关 API（需评估）
```

#### 移除标准

- [ ] 确认哪些 API 已被新的 IM WebSocket 服务器替代
- [ ] 检查是否有客户端仍在使用这些 API
- [ ] 标记为 `@deprecated` 并添加迁移指南
- [ ] 1-2 个版本后完全移除

#### 参考文档
- `packages/master/src/communication/im-websocket-server.js` - 新的 IM WebSocket 服务器
- `docs/15-Master新增IM兼容层设计方案.md`

---

### 2. Master 数据时效性控制

**优先级**: 🟡 中
**状态**: ⏳ 待处理

#### 需求说明

当前 Master 的 DataStore 是纯内存数据结构，缺乏时效性控制机制。需要实现：

#### 实现要点

1. **数据过期策略**
   - [ ] 评论数据：保留最近 7 天
   - [ ] 私信数据：保留最近 30 天
   - [ ] 通知数据：保留最近 3 天
   - [ ] 登录会话：保留最近 24 小时

2. **定时清理机制**
   ```javascript
   // 示例：每小时清理一次过期数据
   setInterval(() => {
     dataStore.cleanExpiredData();
   }, 60 * 60 * 1000);
   ```

3. **配置化时效参数**
   ```javascript
   // packages/master/src/config/data-retention.js
   module.exports = {
     comments: 7 * 24 * 60 * 60 * 1000,      // 7 天
     directMessages: 30 * 24 * 60 * 60 * 1000, // 30 天
     notifications: 3 * 24 * 60 * 60 * 1000,   // 3 天
     loginSessions: 24 * 60 * 60 * 1000        // 24 小时
   };
   ```

#### 影响范围
- `packages/master/src/worker_manager/data-store.js`
- `packages/master/src/communication/im-websocket-server.js`

---

### 3. 数据库表格按通用格式设计

**优先级**: 🟡 中
**状态**: ⏳ 待处理

#### 当前问题

Master 数据库 schema 缺少标准化的通用字段：

#### 需要添加的通用字段

**所有表都应包含**:
```sql
-- 时间戳字段
created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

-- 软删除字段
deleted_at INTEGER DEFAULT NULL,
is_deleted INTEGER DEFAULT 0,

-- 数据版本字段（用于乐观锁）
version INTEGER DEFAULT 1,

-- 审计字段
created_by TEXT DEFAULT NULL,
updated_by TEXT DEFAULT NULL
```

#### 需要修改的表

- [ ] `comments` 表 - 添加 `updated_at`, `deleted_at`, `version`
- [ ] `direct_messages` 表 - 添加 `updated_at`, `deleted_at`, `version`
- [ ] `conversations` 表 - 添加 `updated_at`, `deleted_at`, `version`
- [ ] `replies` 表 - 添加 `updated_at`, `deleted_at`, `version`
- [ ] `notifications` 表 - 添加 `updated_at`, `deleted_at`, `version`
- [ ] `login_sessions` 表 - 添加 `updated_at`, `deleted_at`, `version`

#### 自动触发器

```sql
-- 自动更新 updated_at
CREATE TRIGGER update_{table_name}_timestamp
AFTER UPDATE ON {table_name}
FOR EACH ROW
BEGIN
  UPDATE {table_name} SET updated_at = strftime('%s', 'now')
  WHERE id = NEW.id;
END;
```

#### 迁移步骤

1. [ ] 创建新的 schema 文件: `packages/master/src/database/schema-v2.sql`
2. [ ] 编写迁移脚本: `packages/master/src/database/migrations/001_add_common_fields.sql`
3. [ ] 更新所有 DAO 类以支持新字段
4. [ ] 更新 schema-validator.js
5. [ ] 测试迁移脚本
6. [ ] 应用到生产环境

---

### 4. Master 数据持久化

**优先级**: 🔴 高
**状态**: ⏳ 待处理

#### 当前问题

Master 的 DataStore 是纯内存数据结构，存在以下问题：

1. **Master 重启后数据丢失**
   - Worker 推送的评论、私信数据全部丢失
   - 需要重新触发 Worker 全量推送

2. **内存占用无限增长**
   - 没有数据过期和清理机制
   - 长时间运行会导致 OOM

#### 解决方案

**方案 1: 定期持久化到数据库** (推荐)

```javascript
// packages/master/src/worker_manager/data-store.js

class DataStore {
  constructor(db) {
    this.db = db;
    this.cache = new Map(); // 内存缓存

    // 每 5 分钟持久化一次
    setInterval(() => {
      this.persistToDatabase();
    }, 5 * 60 * 1000);

    // 启动时从数据库加载
    this.loadFromDatabase();
  }

  async persistToDatabase() {
    // 将内存数据批量写入数据库
    const comments = Array.from(this.cache.values())
      .filter(item => item.type === 'comment');

    await this.db.batchInsertComments(comments);
  }

  async loadFromDatabase() {
    // 从数据库加载最近 7 天的数据到内存
    const recentComments = await this.db.getRecentComments(7);

    for (const comment of recentComments) {
      this.cache.set(comment.id, comment);
    }
  }
}
```

**方案 2: Redis 缓存** (可选)

```javascript
// 使用 Redis 作为 DataStore 的持久化层
const redis = require('redis');
const client = redis.createClient();

class DataStore {
  async set(key, value) {
    // 写入 Redis
    await client.set(key, JSON.stringify(value));

    // 设置过期时间
    await client.expire(key, 7 * 24 * 60 * 60); // 7 天
  }

  async get(key) {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  }
}
```

#### 实现步骤

**阶段 1: 数据库持久化**
- [ ] 修改 DataStore 类支持数据库持久化
- [ ] 实现定期持久化机制（5 分钟）
- [ ] 实现启动时数据加载
- [ ] 添加数据过期清理逻辑

**阶段 2: 性能优化**
- [ ] 实现增量持久化（只持久化变更数据）
- [ ] 添加持久化队列避免阻塞
- [ ] 监控持久化性能

**阶段 3: 可选 Redis 支持**
- [ ] 添加 Redis 适配器
- [ ] 配置化选择持久化方式
- [ ] 性能对比测试

#### 影响范围
- `packages/master/src/worker_manager/data-store.js`
- `packages/master/src/database/comments-dao.js`
- `packages/master/src/database/direct-messages-dao.js`

---

### 5. Master 数据已读状态处理

**优先级**: 🟡 中
**状态**: ⏳ 待处理

#### 当前问题

1. **Worker 上报的 `is_new` 字段语义混乱**
   - 之前是基于时间判断（24 小时内）
   - 现已改为首次抓取标识

2. **Master 使用 `isHandled` 判断未读**
   - 但缺乏标记已读的机制
   - PC IM 读取消息后无法标记为已读

#### 需要实现的功能

**1. 提供标记已读 API**

```javascript
// packages/master/src/communication/im-websocket-server.js

socket.on('monitor:mark_as_read', async (data) => {
  const { channelId, messageIds } = data;

  // 更新数据库
  await commentsDAO.markAsHandled(messageIds);

  // 更新 DataStore
  dataStore.markMessagesAsRead(channelId, messageIds);

  // 通知所有连接的客户端
  io.of('/client').emit('monitor:messages_read', {
    channelId,
    messageIds,
    timestamp: Date.now()
  });
});
```

**2. 批量标记已读**

```javascript
// 标记某个作品的所有消息为已读
socket.on('monitor:mark_topic_as_read', async (data) => {
  const { channelId, topicId } = data;

  const messageIds = dataStore.getTopicMessageIds(channelId, topicId);
  await commentsDAO.markAsHandled(messageIds);
  dataStore.markMessagesAsRead(channelId, messageIds);
});
```

**3. 自动标记已读策略**

```javascript
// 配置文件
module.exports = {
  autoMarkAsRead: {
    enabled: true,
    // 消息发送给客户端后 N 秒自动标记为已读
    delaySeconds: 30,
    // 或者：用户查看消息后自动标记
    onView: true
  }
};
```

#### 数据库修改

**添加已读时间戳**:

```sql
-- comments 表
ALTER TABLE comments ADD COLUMN read_at INTEGER DEFAULT NULL;

-- direct_messages 表
ALTER TABLE direct_messages ADD COLUMN read_at INTEGER DEFAULT NULL;
```

**更新 DAO 方法**:

```javascript
// packages/master/src/database/comments-dao.js

class CommentsDAO {
  async markAsHandled(messageIds, readAt = Date.now()) {
    const placeholders = messageIds.map(() => '?').join(',');

    this.db.prepare(`
      UPDATE comments
      SET isHandled = 1, read_at = ?
      WHERE id IN (${placeholders})
    `).run(readAt, ...messageIds);
  }

  async getUnreadCount(accountId) {
    return this.db.prepare(`
      SELECT COUNT(*) as count
      FROM comments
      WHERE platform_account_id = ?
        AND isHandled = 0
    `).get(accountId).count;
  }
}
```

#### 实现步骤

- [ ] 添加 `monitor:mark_as_read` Socket.IO 事件处理
- [ ] 添加 `monitor:mark_topic_as_read` 事件处理
- [ ] 实现批量标记已读功能
- [ ] 添加 `read_at` 字段到数据库
- [ ] 更新 DAO 类支持已读状态
- [ ] PC IM 前端实现标记已读功能
- [ ] 添加自动标记已读配置（可选）

#### 影响范围
- `packages/master/src/communication/im-websocket-server.js`
- `packages/master/src/database/comments-dao.js`
- `packages/master/src/database/direct-messages-dao.js`
- `packages/crm-pc-im/src/pages/MonitorPage.tsx`

---

## 📊 任务优先级矩阵

| 任务 | 优先级 | 复杂度 | 预计工时 |
|------|--------|--------|----------|
| 移除废弃的 API | 🔴 高 | 低 | 4 小时 |
| Master 数据持久化 | 🔴 高 | 高 | 16 小时 |
| 数据已读状态处理 | 🟡 中 | 中 | 8 小时 |
| 数据时效性控制 | 🟡 中 | 中 | 8 小时 |
| 数据库表格标准化 | 🟡 中 | 高 | 12 小时 |

**总计**: 约 48 小时（6 个工作日）

---

## 🔄 实施顺序建议

### 第一阶段：紧急修复（1-2 天）
1. ✅ Master 数据持久化（避免数据丢失）
2. ✅ 移除废弃的 API（减少维护成本）

### 第二阶段：功能完善（2-3 天）
3. ✅ 数据已读状态处理（完善用户体验）
4. ✅ 数据时效性控制（优化内存使用）

### 第三阶段：技术债务（1-2 天）
5. ✅ 数据库表格标准化（提升代码质量）

---

## 📝 备注

- 所有数据库 schema 变更需要编写迁移脚本
- 新增功能需要编写单元测试和集成测试
- 完成后更新相关文档
- 考虑向后兼容性，避免破坏现有功能

---

**文档维护者**: Claude Code
**最后更新**: 2025-10-31
