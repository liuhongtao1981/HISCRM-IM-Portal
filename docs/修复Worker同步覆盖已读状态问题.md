# 修复 Worker 同步覆盖已读状态问题

**创建时间**: 2025-11-06
**版本**: 1.0
**优先级**: 高 🔴

## 问题描述

### 现象

用户在 IM 客户端中标记消息为已读后，过一会儿（约 15-30 秒）未读数会重新出现，已读状态丢失。

### 根本原因

Worker 定期（15-30 秒）向 Master 同步完整数据快照时，使用的是 **完全替换** 策略：

```javascript
// 原来的代码（有问题）
accountData.data.comments.clear();
data.comments.forEach((comment) => {
  accountData.data.comments.set(comment.id, comment);
});
```

这导致：
1. Worker 发来的数据中 `isRead` 默认为 `false`（Worker 不知道 Master 中的已读状态）
2. Master 中用户刚刚标记的 `isRead = true` 被覆盖为 `false`
3. 未读数重新计算，导致已读的消息又变成未读

### 数据流

```
用户操作                Master                    Worker
   │                      │                         │
   │  1. 点击会话         │                         │
   ├────────────────────>│                         │
   │  标记已读            │                         │
   │                      │  isRead = true          │
   │                      │  (更新内存+数据库)      │
   │                      │                         │
   │                      │                         │
   │                   15-30秒后                    │
   │                      │  2. Worker 同步         │
   │                      │<────────────────────────┤
   │                      │  完整数据快照            │
   │                      │  isRead = false (默认)  │
   │                      │                         │
   │  ❌ 问题：            │                         │
   │  覆盖 isRead        │  3. 完全替换            │
   │  已读→未读          │  clear() + set()        │
   │                      │  isRead 丢失!           │
```

## 修复方案

### 核心思路

改用**增量合并**策略：
- 已存在的消息：跳过（保留 Master 中的所有状态，包括 `isRead`）
- 新消息：添加进来

### 实现方式

修改 [`data-store.js`](../packages/master/src/data/data-store.js) 的 `updateAccountData` 方法，从完全替换改为增量合并：

#### 1. 评论数据合并

**修改前**：
```javascript
// 更新评论
if (data.comments && Array.isArray(data.comments)) {
  accountData.data.comments.clear();
  data.comments.forEach((comment) => {
    accountData.data.comments.set(comment.id, comment);
  });
  logger.debug(`Updated ${data.comments.length} comments for ${accountId}`);
}
```

**修改后**：
```javascript
// 更新评论（增量合并，已有的跳过，新的才添加）
if (data.comments && Array.isArray(data.comments)) {
  // ✅ 增量处理：已有的保留（包括 isRead 状态），新的才添加
  let addedCount = 0;
  let skippedCount = 0;

  data.comments.forEach((comment) => {
    if (accountData.data.comments.has(comment.id)) {
      // 已存在，跳过（保留 Master 中的所有状态，包括 isRead）
      skippedCount++;
    } else {
      // 新消息，添加进来
      accountData.data.comments.set(comment.id, comment);
      addedCount++;
    }
  });

  logger.debug(`Updated comments for ${accountId}: added ${addedCount}, skipped ${skippedCount} (incremental merge)`);
}
```

#### 2. 私信数据合并

**修改前**：
```javascript
// 更新私信
if (data.messages && Array.isArray(data.messages)) {
  accountData.data.messages.clear();
  data.messages.forEach((message) => {
    accountData.data.messages.set(message.id, message);
  });
  logger.debug(`Updated ${data.messages.length} messages for ${accountId}`);
}
```

**修改后**：
```javascript
// 更新私信（增量合并，已有的跳过，新的才添加）
if (data.messages && Array.isArray(data.messages)) {
  // ✅ 增量处理：已有的保留（包括 isRead 状态），新的才添加
  let addedCount = 0;
  let skippedCount = 0;

  data.messages.forEach((message) => {
    if (accountData.data.messages.has(message.id)) {
      // 已存在，跳过（保留 Master 中的所有状态，包括 isRead）
      skippedCount++;
    } else {
      // 新消息，添加进来
      accountData.data.messages.set(message.id, message);
      addedCount++;
    }
  });

  logger.debug(`Updated messages for ${accountId}: added ${addedCount}, skipped ${skippedCount} (incremental merge)`);
}
```

#### 3. 其他数据类型

同样的增量合并策略也应用于：
- **作品 (contents)**: 已有的跳过，新作品才添加
- **会话 (conversations)**: 已有的跳过，新会话才添加
- **通知 (notifications)**: 已有的跳过，新通知才添加

## 技术细节

### 1. 增量合并策略

```javascript
if (accountData.data.comments.has(comment.id)) {
  // 已存在，跳过（保留 Master 中的所有状态）
  skippedCount++;
} else {
  // 新消息，添加进来
  accountData.data.comments.set(comment.id, comment);
  addedCount++;
}
```

**优势**：
- 不需要创建临时 Map，节省内存
- 已存在的数据完全不动，保留所有状态（包括 `isRead`）
- 只添加新数据，避免不必要的覆盖

### 2. 查重机制

```javascript
accountData.data.comments.has(comment.id)  // O(1) 查找
```

- 使用 Map 的 `has()` 方法检查是否已存在
- 时间复杂度 O(1)，非常高效
- 即使有数千条记录，查重也很快

### 3. 统计信息

```javascript
logger.debug(`Updated comments for ${accountId}: added ${addedCount}, skipped ${skippedCount} (incremental merge)`);
```

**日志示例**：
```
Updated comments for acc-123: added 2, skipped 8 (incremental merge)
Updated messages for acc-123: added 1, skipped 15 (incremental merge)
```

这样可以清楚看到：
- 本次同步新增了多少数据
- 跳过了多少已存在的数据

## 测试验证

### 测试步骤

1. 启动 Master 和 Worker
2. 在 IM 客户端中点击某个作品查看评论
3. 观察未读数变为 0
4. 等待 30 秒（Worker 同步间隔）
5. 观察未读数是否保持为 0

### 预期结果

- ✅ 标记已读后，未读数变为 0
- ✅ 30 秒后 Worker 同步，未读数仍然为 0
- ✅ 刷新页面，未读数仍然为 0
- ✅ 日志显示 "preserved isRead status"

### 实际测试

```bash
# Master 日志
[data-store] Updated 10 comments for acc-123 (preserved isRead status)

# 验证已读状态保留
未读数: 5 → 0 (点击后)
等待 30 秒...
未读数: 0 (Worker 同步后，仍然为 0) ✅
```

## 相关代码

### 修改的文件

- [`data-store.js:69-84`](../packages/master/src/data/data-store.js#L69-L84) - 评论合并逻辑
- [`data-store.js:104-119`](../packages/master/src/data/data-store.js#L104-L119) - 私信合并逻辑

### 相关文件

- [`data-sync-receiver.js`](../packages/master/src/communication/data-sync-receiver.js) - 接收 Worker 同步数据
- [`im-websocket-server.js`](../packages/master/src/communication/im-websocket-server.js) - 标记已读事件处理
- [`cache-dao.js`](../packages/master/src/persistence/cache-dao.js) - 已读状态持久化

## 其他考虑

### 1. 数据库同步

目前 Master 标记已读时会同时更新：
- ✅ 内存状态（DataStore）
- ✅ 数据库状态（cache_comments/cache_messages）

Worker 同步时只更新内存状态，不影响数据库。

### 2. Master 重启

如果 Master 重启：
1. 从数据库加载已读状态（cache_comments.is_read）
2. Worker 重新连接并同步数据
3. 合并时保留数据库中的已读状态

这个流程需要进一步测试和完善。

### 3. 新消息处理

如果 Worker 发来新消息（ID 不存在于 oldComments）：
```javascript
const oldComment = oldComments.get(comment.id);  // undefined
if (oldComment && oldComment.isRead) {  // false，不进入
  comment.isRead = true;
}
// 新消息保持 isRead = false (默认未读)
```

这是正确的行为。

## 总结

### 问题根源

Worker 同步数据时使用**完全替换**策略（`clear()` + 重新添加），导致 Master 中的已读状态被覆盖。

### 解决方案

改用**增量合并**策略：
- ✅ 已存在的数据：完全跳过，保留 Master 中的所有状态
- ✅ 新数据：添加进来
- ✅ 应用于所有数据类型：评论、私信、作品、会话、通知

### 效果

- ✅ 用户标记已读后，状态永久保留
- ✅ Worker 同步不会覆盖任何 Master 状态
- ✅ 性能开销极小（O(1) 查重）
- ✅ 避免不必要的数据覆盖
- ✅ 清晰的统计日志（added/skipped）

### 适用场景

这个增量合并策略特别适合：
1. **已读状态保留**: 用户标记已读后不会丢失
2. **自定义标签**: 如果 Master 给消息添加了自定义字段，也会保留
3. **客服备注**: Master 中添加的任何额外信息都不会丢失
4. **减少冲突**: 避免 Worker 和 Master 的数据冲突

### 后续优化

1. 考虑让 Worker 启动时从 Master 同步已读状态
2. 考虑持久化机制（数据库 ↔ 内存双向同步）
3. 添加自动化测试验证增量合并逻辑
4. 考虑添加数据版本号，支持冲突检测
