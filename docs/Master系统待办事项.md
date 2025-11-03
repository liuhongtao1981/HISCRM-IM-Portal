# Master 系统待办事项

**文档版本**: v1.2
**创建时间**: 2025-10-31
**最后更新**: 2025-11-03
**状态**: 进行中 (2/5 已完成)

---

## 📋 待办任务清单

### 1. 移除废弃的 API ✅

**优先级**: 🔴 高
**状态**: ✅ 已完成 (2025-11-03)

#### 已移除的 API

**位置**: `packages/master/src/api/routes/im/` (已删除)

已删除的废弃 API 端点（7 个文件）：

```
packages/master/src/api/routes/im/
├── index.js             # IM API 主路由
├── accounts.js          # 账户相关 API
├── messages.js          # 消息相关 API
├── conversations.js     # 会话相关 API
├── contents.js          # 作品相关 API
├── discussions.js       # 讨论相关 API
└── unified-messages.js  # 统一消息 API
```

#### 移除验证

- [x] 确认哪些 API 已被新的 IM WebSocket 服务器替代
- [x] 检查是否有客户端仍在使用这些 API（确认无客户端使用）
- [x] 删除所有 REST API 文件
- [x] 更新 `packages/master/src/index.js` 移除路由配置
- [x] 创建变更说明文档

#### 完成内容

1. **删除文件**: 移除整个 `packages/master/src/api/routes/im/` 目录
2. **更新路由**: 修改 `index.js` 第 1276-1277 行,移除 IM API 路由挂载
3. **文档**: 创建 `docs/废弃REST-API移除说明.md` 记录变更详情

#### 参考文档
- `packages/master/src/communication/im-websocket-server.js` - WebSocket 服务器（实际使用）
- `docs/废弃REST-API移除说明.md` - 移除说明文档

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

### 4. Master 数据持久化 ✅

**优先级**: 🔴 高
**状态**: ✅ 已完成 (2025-11-03)

#### 实现概述

已实现完整的 Master 数据持久化系统，解决了 DataStore 纯内存数据丢失和内存增长问题。

#### 核心特性

1. **内存优先架构**: 所有操作在内存中进行，数据库作为备份
2. **零转换成本**: 数据库使用 JSON 存储，与内存结构完全一致
3. **增量持久化**: 使用脏标记（Dirty Flag）机制，只持久化变更数据
4. **自动启动加载**: Master 启动时从数据库恢复最近数据
5. **定期自动持久化**: 每 5 分钟自动持久化一次
6. **优雅关闭**: SIGTERM/SIGINT 触发最终持久化
7. **数据过期清理**: 按数据类型配置不同的保留策略
8. **调试 API**: 5 个 DEBUG API 端点用于监控和手动控制

#### 已实现功能

**Phase 1: 数据库 Schema** ✅
- [x] 创建 `cache-schema.sql` - 6 个缓存表（metadata, comments, contents, conversations, messages, notifications）
- [x] 实现 `cache-schema-validator.js` - Schema 完整性验证工具
- [x] 创建 `data-retention.js` - 数据保留策略配置
- [x] 启用 WAL 模式 - 支持并发读写

**Phase 2: 持久化层** ✅
- [x] 实现 `CacheDAO` 类 - 数据访问层（500 行代码）
  - 批量 UPSERT 操作（事务支持）
  - 按账户查询数据
  - 过期数据清理方法
  - 预编译 SQL 语句优化
- [x] 实现 `PersistenceManager` 类 - 持久化管理器（580 行代码）
  - 启动时从数据库加载数据
  - 定期持久化（5 分钟间隔）
  - 优雅关闭处理
  - 定时清理过期数据

**Phase 3: DataStore 增强** ✅
- [x] 添加脏标记机制（Dirty Flag）
- [x] 实现 `exportDirtySnapshot()` - 增量导出
- [x] 实现 `clearDirtyFlags()` - 清理脏标记
- [x] 实现 `cleanExpiredData()` - 内存数据过期清理
- [x] 综合测试通过（100%）

**Phase 4: Master 集成** ✅
- [x] 集成 PersistenceManager 到 Master 启动流程
- [x] 添加 SIGTERM/SIGINT 优雅关闭处理
- [x] 创建 5 个 DEBUG API 端点：
  - `GET /api/debug/persistence/stats` - 获取统计信息
  - `POST /api/debug/persistence/persist` - 手动持久化
  - `POST /api/debug/persistence/reload` - 重新加载数据
  - `POST /api/debug/persistence/cleanup/:dataType` - 清理过期数据
  - `GET /api/debug/persistence/cache-stats` - 缓存表统计

#### 数据保留策略

**内存保留期**:
- 评论（comments）: 7 天
- 私信（messages）: 30 天
- 作品（contents）: 30 天
- 会话（conversations）: 30 天
- 通知（notifications）: 3 天

**数据库保留期**:
- 评论（comments）: 30 天
- 私信（messages）: 90 天
- 作品（contents）: 永久
- 会话（conversations）: 90 天
- 通知（notifications）: 7 天

#### 性能数据

- **持久化速度**: 2-5ms（6 项数据）
- **加载速度**: 2-4ms（6 项数据）
- **增量持久化**: 0-2ms（单个账户）
- **内存占用**: 每账户约 50KB（1000 条消息）

#### 测试结果

测试脚本: `tests/test-persistence.js`

```
✅ 数据库初始化成功
✅ 数据持久化完成 (2ms, 6 items)
✅ 数据一致性验证通过
✅ 内存清空成功
✅ 数据加载完成 (2ms, 6 items)
✅ 加载数据一致性验证通过
✅ 增量持久化完成 (0ms, 1 item)
✅ 数据过期清理完成
✅ 统计信息获取成功
✅ 所有测试通过！
```

#### 相关文件

**核心实现**:
- `packages/master/src/database/cache-schema.sql` - 数据库 Schema
- `packages/master/src/persistence/cache-dao.js` - 数据访问层
- `packages/master/src/persistence/persistence-manager.js` - 持久化管理器
- `packages/master/src/data/data-store.js` - 增强的 DataStore
- `packages/master/src/index.js` - Master 集成

**配置文件**:
- `packages/master/src/config/data-retention.js` - 数据保留配置

**测试文件**:
- `tests/test-cache-schema.js` - Schema 验证测试
- `tests/test-persistence.js` - 持久化功能测试

**文档**:
- `docs/Master数据持久化开发方案.md` - 完整设计方案

#### 后续优化建议

1. **性能监控**: 在生产环境监控持久化性能，根据实际数据量调整间隔
2. **备份策略**: 考虑实现数据库定期备份功能
3. **Redis 支持**: 如有高并发需求，可添加 Redis 适配器（可选）
4. **压缩存储**: 对历史数据实现压缩存储以节省空间（可选）

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

| 任务 | 优先级 | 复杂度 | 预计工时 | 实际工时 | 状态 |
|------|--------|--------|----------|----------|------|
| 移除废弃的 API | 🔴 高 | 低 | 4 小时 | 2 小时 | ✅ 已完成 |
| Master 数据持久化 | 🔴 高 | 高 | 16 小时 | 12 小时 | ✅ 已完成 |
| 数据已读状态处理 | 🟡 中 | 中 | 8 小时 | - | ⏳ 待处理 |
| 数据时效性控制 | 🟡 中 | 中 | 8 小时 | - | 🔄 部分完成 |
| 数据库表格标准化 | 🟡 中 | 高 | 12 小时 | - | ⏳ 待处理 |

**总计**: 约 48 小时（6 个工作日）
**已完成**: 14 小时（2 个任务）
**剩余**: 28 小时（3.5 个工作日）

**注**: 数据时效性控制已通过持久化系统部分实现（数据过期清理），但仍需添加更细粒度的配置和监控。

---

## 🔄 实施顺序建议

### 第一阶段：紧急修复（1-2 天）✅ 已完成
1. ✅ **移除废弃的 API** - 已完成 (2025-11-03，2 小时)
2. ✅ **Master 数据持久化** - 已完成 (2025-11-03，12 小时)
   - 实现了完整的持久化系统
   - 自动数据加载和保存
   - 数据过期清理
   - DEBUG API 端点

### 第二阶段：功能完善（2-3 天）⏳ 进行中
3. ⏳ **数据已读状态处理** - 待处理（完善用户体验）
4. 🔄 **数据时效性控制** - 部分完成（已实现数据过期清理，需要细粒度配置）

### 第三阶段：技术债务（1-2 天）⏳ 待开始
5. ⏳ **数据库表格标准化** - 待处理（提升代码质量）

---

## 📝 备注

- 所有数据库 schema 变更需要编写迁移脚本
- 新增功能需要编写单元测试和集成测试
- 完成后更新相关文档
- 考虑向后兼容性，避免破坏现有功能

---

**文档维护者**: Claude Code
**最后更新**: 2025-11-03

## 📈 更新历史

- **v1.2** (2025-11-03): 完成 Master 数据持久化任务，更新任务状态和进度
- **v1.1** (2025-11-03): 完成废弃 API 移除任务
- **v1.0** (2025-10-31): 初始版本，创建待办事项清单
