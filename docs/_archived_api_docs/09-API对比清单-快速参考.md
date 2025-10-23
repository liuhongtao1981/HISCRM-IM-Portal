# Master vs 抖音 IM API - 快速参考

**用途**: 快速查看哪些 API 需要实现、优先级、工作量

---

## 一览表 (按优先级)

### 🔴 P1 必须 (需要立即实现, 30h)

| # | 功能 | IM API | Master 现状 | 工作量 | 说明 |
|---|------|--------|-----------|--------|------|
| 1 | 消息历史分页 | `/v1/im/message/history` | ⚠️ 有，参数不同 | 6h | 支持 cursor、direction、count |
| 2 | 消息全文搜索 | `/v1/im/message/search` | ❌ 无 | 8h | FTS5 虚拟表 + 触发器 |
| 3 | 会话列表（改进） | `/v1/message/get_by_user_init` | ✅ 有，需调整 | 6h | 添加 cursor、unread_count、has_more |
| 4 | 用户信息查询 | `/v1/im/user/get` | ❌ 无 | 6h | 新建 users 表 + users-dao.js |
| 5 | 消息已读管理 | `/v1/im/message/mark_read` | ⚠️ 有，无批量 | 4h | 支持批量、对话级标记 |

**共计**: 30 小时

---

### 🟠 P2 重要 (本周完成, 39h)

| # | 功能 | IM API | Master 现状 | 工作量 | 说明 |
|---|------|--------|-----------|--------|------|
| 6 | 消息编辑 | `/v1/im/message/edit` | ❌ 无 | 8h | 创建 message_edits 表、历史记录 |
| 7 | 消息撤回 | `/v1/im/message/recall` | ❌ 无 | 6h | 逻辑删除 + 同步 |
| 8 | 会话列表增强 | `/v1/im/conversation/list` | ⚠️ 有，缺功能 | 6h | 排序、搜索、过滤、分页 |
| 9 | 黑名单管理 | `/v1/im/user/block` | ❌ 无 | 6h | 创建 user_blocks 表 |
| 10 | 标签管理 | `/v1/im/conversation/tag` | ❌ 无 | 6h | tags 字段 + 管理接口 |
| 11 | 已读状态同步 | `/v1/im/message/sync_read_status` | ❌ 无 | 4h | 增量同步机制 |
| 12 | 置顶对话 | `/v1/im/conversation/pin` | ❌ 无 | 4h | is_pinned 字段 |
| 13 | 查询单个会话 | `/v1/im/query_conversation` | ⚠️ 有，分开的 | 4h | 合并对话 + 消息查询 |

**共计**: 44 小时

---

### 🟡 P3 可选 (下月, 30h+)

| # | 功能 | Master 现状 | 工作量 | 说明 |
|---|------|-----------|--------|------|
| 14 | 消息反应 | ❌ 无 | 6h | message_reactions 表 |
| 15 | 静音对话 | ❌ 无 | 3h | mute_until 字段 |
| 16 | 用户搜索 | ❌ 无 | 3h | 搜索接口 |
| 17 | 会话未读统计 | ❌ 无 | 2h | 快速统计接口 |
| 18 | 会话搜索 | ❌ 无 | 3h | 搜索接口 |
| 19 | 通知查询 | ⚠️ 有，结构不同 | 2h | HTTP API 适配 |
| 20 | 其他 | - | 15h+ | 消息预览、定时发送等 |

**共计**: 34+ 小时

---

## 二、按文件修改分类

### 需要新建的文件 (7 个)

```
1. packages/master/src/api/routes/users.js
   - GET /api/v1/users/:userId
   - POST /api/v1/users/batch
   - GET /api/v1/users/search

2. packages/master/src/api/routes/search.js
   - POST /api/v1/messages/search
   - GET /api/v1/conversations/search

3. packages/master/src/database/users-dao.js
   - getUser(userId)
   - getUserByPlatformId(platform, platformUserId)
   - searchUsers(query, limit)
   - createOrUpdateUser(userData)

4. packages/master/src/database/user-blocks-dao.js
   - blockUser(blockerId, userId, reason)
   - unblockUser(blockerId, userId)
   - getBlockedUsers(blockerId)

5. packages/master/src/database/message-edits-dao.js
   - getEditHistory(messageId)
   - recordEdit(messageId, oldContent, newContent)

6. tests/test-message-sync.js (消息同步测试)
7. tests/test-conversations-query.js (对话列表测试)
```

### 需要修改的文件 (6 个)

```
1. packages/master/src/database/init.js
   新增表：users, user_blocks, message_edits, direct_messages_fts
   新增字段：conversations.status/tags/is_pinned, direct_messages.edited_at
   新增索引：8+ 个

2. packages/master/src/database/conversations-dao.js
   新增方法：
   - getConversationsSorted(sortBy, limit, offset)
   - getConversationsByStatus(status, limit, offset)
   - searchConversations(query, limit, offset)
   - getConversationWithMessages(conversationId, messageCount)
   - getUnreadSummary()
   - pinConversation(conversationId)
   - unpinConversation(conversationId)

3. packages/master/src/database/direct-messages-dao.js
   新增方法：
   - getMessagesSince(timestamp, conversationId, limit)
   - searchMessages(query, filters, limit, offset)
   - markBatchAsRead(messageIds, readAt)
   - markConversationAsRead(conversationId, readAt)
   - editMessage(messageId, newContent)
   - deleteMessage(messageId)

4. packages/master/src/api/routes/messages.js
   新增/修改端点：
   - GET /api/v1/conversations (改进分页)
   - GET /api/v1/conversations/:id (新增 include_messages 参数)
   - GET /api/v1/direct-messages (改进 cursor 分页)
   - PATCH /api/v1/messages/mark-read (批量)
   - POST /api/v1/messages/search (新)
   - PATCH /api/v1/messages/:id (编辑)
   - DELETE /api/v1/messages/:id (撤回)

5. packages/master/src/communication/socket-server.js
   新增/修改事件处理：
   - client:messages:sync (消息增量同步)
   - client:conversations:list (对话列表)
   - 其他 Socket 事件同步

6. package.json (如需依赖)
   可能需要添加：sqlite3 相关依赖（但已有 better-sqlite3）
```

---

## 三、数据库变更清单

### 新增表 (4 个)

```sql
-- 1. 用户信息表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  signature TEXT,
  verified INTEGER DEFAULT 0,
  follower_count INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  cached_at INTEGER,
  UNIQUE(platform, platform_user_id)
);

-- 2. 用户黑名单表
CREATE TABLE user_blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER,
  UNIQUE(blocker_id, blocked_user_id)
);

-- 3. 消息编辑历史表
CREATE TABLE message_edits (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  old_content TEXT,
  new_content TEXT,
  edited_at INTEGER,
  editor_id TEXT,
  UNIQUE(message_id),
  FOREIGN KEY(message_id) REFERENCES direct_messages(id)
);

-- 4. 全文搜索虚拟表
CREATE VIRTUAL TABLE direct_messages_fts USING fts5(
  content,
  message_type,
  sender_id,
  conversation_id,
  created_at,
  content=direct_messages,
  content_rowid=id
);
```

### 修改表 (3 个)

```sql
-- 1. conversations 表
ALTER TABLE conversations
  ADD COLUMN status TEXT DEFAULT 'active';       -- active, archived, blocked
ALTER TABLE conversations
  ADD COLUMN tags TEXT;                          -- JSON 数组
ALTER TABLE conversations
  ADD COLUMN is_pinned INTEGER DEFAULT 0;

-- 2. direct_messages 表
ALTER TABLE direct_messages
  ADD COLUMN edited_at INTEGER;                  -- 编辑时间

-- 3. client_sessions 表
ALTER TABLE client_sessions
  ADD COLUMN last_sync_timestamp INTEGER;        -- 最后同步时间
```

### 新增索引 (8+ 个)

```sql
CREATE INDEX idx_direct_messages_created_at
  ON direct_messages(created_at DESC);

CREATE INDEX idx_direct_messages_conversation_created
  ON direct_messages(conversation_id, created_at DESC);

CREATE INDEX idx_conversations_status
  ON conversations(status);

CREATE INDEX idx_conversations_last_message_time
  ON conversations(last_message_time DESC);

CREATE INDEX idx_direct_messages_message_type
  ON direct_messages(message_type);

CREATE INDEX idx_users_platform_user_id
  ON users(platform, platform_user_id);

CREATE INDEX idx_user_blocks_blocker_id
  ON user_blocks(blocker_id);

CREATE INDEX idx_message_edits_message_id
  ON message_edits(message_id);
```

### 新增触发器 (2 个)

```sql
-- FTS 索引自动同步
CREATE TRIGGER direct_messages_insert AFTER INSERT ON direct_messages BEGIN
  INSERT INTO direct_messages_fts(rowid, content, message_type, sender_id, conversation_id, created_at)
  VALUES (new.id, new.content, new.message_type, new.sender_id, new.conversation_id, new.created_at);
END;

CREATE TRIGGER direct_messages_delete AFTER DELETE ON direct_messages BEGIN
  DELETE FROM direct_messages_fts WHERE rowid = old.id;
END;
```

---

## 四、优先级实施计划

### 第一周 (P1 完成, 30h)

**Day 1-2: 会话列表和用户信息 (12h)**
```
1. 修改 init.js，添加 users 表
2. 创建 users-dao.js
3. 创建 users.js API 路由
4. 修改 conversations-dao.js，增强查询
5. 测试用户信息 API
```

**Day 3: 消息同步 (6h)**
```
1. 修改 client_sessions 表
2. 修改 direct-messages-dao.js
3. 创建消息同步 API
4. 测试同步功能
```

**Day 4: 已读管理 (4h)**
```
1. 增强 mark-read API
2. 批量标记逻辑
3. 测试已读功能
```

**Day 5: 消息搜索 (8h)**
```
1. 创建 FTS5 虚拟表
2. 创建触发器
3. 创建搜索 API
4. 测试搜索功能
```

**Day 6: 集成测试 (4h)**
```
1. 完整流程测试
2. 性能优化
3. Bug 修复
```

### 第二周 (P2 开始, 20h)

**Day 7-8: 消息编辑和撤回 (14h)**
```
1. 创建 message_edits 表
2. 实现编辑和撤回逻辑
3. 编写测试
```

**Day 9-10: 黑名单、标签、置顶 (15h)**
```
1. 创建相关表
2. 实现 CRUD 接口
3. 测试
```

**Day 11: 集成测试 (5h)**

### 第三周 (P3 可选)

性能优化、文档完善、部署准备

---

## 五、关键要点总结

### ✅ 已经有的功能（无需修改）

```
1. 获取单条消息        ✅ GET /api/v1/messages/:id
2. 标记通知已读        ✅ client:notification:ack
3. 发送消息           ✅ 通过 Worker 代理
4. 获取账户信息        ✅ GET /api/v1/accounts
5. Worker 管理        ✅ 完整实现
```

### ⚠️ 有但需要调整的功能（修改现有）

```
1. 获取会话列表        ⚠️ 需添加 cursor、unread_count
2. 消息历史分页        ⚠️ 需支持 cursor、direction
3. 标记消息已读        ⚠️ 需支持批量
4. 会话列表查询        ⚠️ 需排序、搜索、过滤
5. 获取单个会话        ⚠️ 需合并对话 + 消息
```

### ❌ 完全缺失的功能（新增）

```
1. 消息全文搜索        ❌ 需创建 FTS5 索引
2. 用户信息表         ❌ 需新建 users 表
3. 黑名单管理         ❌ 需新建 user_blocks 表
4. 消息编辑           ❌ 需新建 message_edits 表
5. 标签管理           ❌ 需添加 tags 字段
6. 置顶对话           ❌ 需添加 is_pinned 字段
7. 消息撤回           ❌ 需实现删除逻辑
8. ... 其他 P3 功能
```

---

## 六、工作量估算

| 阶段 | 任务 | 工作量 | 期限 | 状态 |
|------|------|--------|------|------|
| **第 1 周** | P1 必须 (5 个接口) | 30h | 本周五 | 🔴 待开始 |
| **第 2 周** | P2 重要 (8 个接口) | 44h | 下周五 | 🔴 待开始 |
| **第 3 周** | P3 可选 + 优化 | 34h+ | 下下周 | 🟢 可选 |
| | **总计** | **108h+** | **4 周** | |

---

## 七、测试策略

### 单元测试 (推荐)

```javascript
// tests/test-message-sync.js
test('getMessagesSince() 返回指定时间后的消息');
test('标记消息已读');
test('批量标记消息已读');

// tests/test-conversations-query.js
test('按 last_message_time 排序对话');
test('按 status 过滤对话');
test('搜索对话');

// tests/test-search.js
test('FTS5 消息搜索');
test('复杂搜索条件 (AND/OR)');

// tests/test-users-dao.js
test('创建和查询用户');
test('用户缓存 TTL');
```

### 集成测试 (推荐)

```javascript
// tests/integration/message-sync-flow.test.js
test('客户端离线-在线消息恢复流程');
test('新消息推送 + 同步');

// tests/integration/conversation-mgmt.test.js
test('对话列表排序、搜索、过滤');
test('对话置顶、标签、静音');
```

### 性能测试 (推荐)

```javascript
// tests/performance/message-search.test.js
test('100k 消息全文搜索 <100ms');

// tests/performance/conversation-list.test.js
test('1000 对话列表查询 <100ms');
```

---

## 八、注意事项

### 向后兼容性

✅ 所有新增功能都使用新的参数/新的端点，旧接口保持不变
✅ 新字段都有默认值，数据库迁移可平滑进行

### 性能影响

⚠️ 新增索引可能增加写入时间，但提升读取 10 倍
✅ FTS5 虚拟表占用空间，但查询 <100ms
✅ 定期清理过期数据（如缓存的用户信息）

### 安全性

✅ 用户黑名单在查询时过滤
✅ 消息删除逻辑删除，保留审计日志
✅ 参数验证完整

---

**文档版本**: v1.0
**创建时间**: 2025-10-23
**下一步**: 确认优先级 → 分配人力 → 开始 P1 实现
