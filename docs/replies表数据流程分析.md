# replies 表数据流程分析

## 问题：为什么 replies 表没有数据？

### 快速回答

✅ **这是正常现象！**

`replies` 表是一个**临时任务队列表**，用于存储待执行和正在执行的回复任务。当回复任务完成后，记录会被**自动删除**。

---

## replies 表的设计用途

### 表的定义
```sql
CREATE TABLE replies (
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,

  -- 身份信息
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  -- 回复内容
  reply_content TEXT NOT NULL,

  -- 状态管理
  reply_status TEXT NOT NULL DEFAULT 'pending',  -- pending → executing → success/failed
  submitted_count INTEGER DEFAULT 1,

  -- Worker 追踪
  assigned_worker_id TEXT,

  -- 时间戳
  first_submitted_at INTEGER NOT NULL,
  last_submitted_at INTEGER NOT NULL,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- 错误信息
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);
```

### 核心设计理念

**replies 表 ≠ 回复记录表**

**replies 表 = 回复任务队列表**

类似于消息队列（如 RabbitMQ），用于：
1. 接收客户端的回复请求
2. 分发给对应的 Worker
3. 跟踪执行状态
4. 完成后自动清理

---

## 数据流程图

### 完整生命周期

```
┌─────────────┐
│   客户端    │
│  (PC/移动端) │
└──────┬──────┘
       │
       │ POST /api/replies
       │ {
       │   request_id: "xxx",
       │   account_id: "yyy",
       │   target_type: "comment",
       │   target_id: "zzz",
       │   reply_content: "回复内容"
       │ }
       ▼
┌─────────────────────┐
│   Master 服务器     │
│  (replies.js 路由)  │
└──────┬──────────────┘
       │
       │ 1. 创建记录
       ▼
┌─────────────────────────┐
│   replies 表             │
│  reply_status: 'pending' │  ← 📝 数据插入
└──────┬──────────────────┘
       │
       │ 2. 转发给 Worker
       ▼
┌─────────────────────────┐
│   Worker 进程           │
│  (socket: master:reply:request) │
└──────┬──────────────────┘
       │
       │ 3. 更新状态
       ▼
┌─────────────────────────┐
│   replies 表             │
│  reply_status: 'executing' │  ← 🔄 状态更新
└──────┬──────────────────┘
       │
       │ 4. 执行回复操作
       ▼
┌─────────────────────────┐
│   抖音/平台网站         │
│  (send-reply-comment.js) │
└──────┬──────────────────┘
       │
       │ 5. 返回结果
       ▼
┌─────────────────────────┐
│   Master 服务器         │
│  (handleReplyResult)    │
└──────┬──────────────────┘
       │
       │ 6. 成功 → 删除记录 ❌
       │    失败 → 删除记录 ❌
       ▼
┌─────────────────────────┐
│   replies 表             │
│  (记录被删除)            │  ← 🗑️ 数据清理
└─────────────────────────┘
```

---

## 代码证据

### 1. 创建回复记录

**文件**：`packages/master/src/api/routes/replies.js:142-153`

```javascript
// 创建回复记录（使用提取的最终值）
const reply = replyDAO.createReply({
  requestId: request_id,
  platform: account.platform,
  accountId: account_id,
  targetType: target_type,
  targetId: target_id,
  replyContent: reply_content,
  videoId: finalVideoId,
  userId: finalUserId,
  platformTargetId: finalPlatformTargetId,
  assignedWorkerId: account.assigned_worker_id,
});
```

📝 **此时插入 replies 表，状态 = 'pending'**

### 2. 转发给 Worker

**文件**：`packages/master/src/api/routes/replies.js:324-325`

```javascript
// 更新状态为 executing
replyDAO.updateReplyStatusToExecuting(replyId);
```

🔄 **更新 replies 表，状态 = 'executing'**

### 3. 处理结果并删除

**文件**：`packages/master/src/index.js:376-394`

```javascript
if (status === 'success') {
  replyDAO.updateReplySuccess(reply_id, platform_reply_id, data.data);
  logger.info(`Reply success: ${reply_id}`, { platformReplyId: platform_reply_id });

  // ...通知客户端...

  // 🗑️ 关键：成功后删除记录
  replyDAO.deleteReply(reply_id);
  logger.warn(`Reply ${status} and deleted from database: ${reply_id}`, {
    error_code,
    error_message,
  });
}
```

🗑️ **删除 replies 表中的记录**

---

## 为什么要删除成功的记录？

### 设计理由

#### 1. **避免数据累积**
- 回复任务可能非常频繁（每分钟数百次）
- 如果不删除，replies 表会快速膨胀
- 查询性能会下降

#### 2. **临时队列设计**
- replies 表设计为**临时任务队列**
- 只保存"待处理"和"正在处理"的任务
- 完成的任务应该移除

#### 3. **已有持久化存储**
- 成功的回复可以通过**平台 API** 查询
- 评论回复：存储在 `comments` 表的回复链中
- 私信回复：存储在 `direct_messages` 表中

---

## replies 表什么时候有数据？

### 场景 1：正在处理中

```sql
SELECT * FROM replies WHERE reply_status IN ('pending', 'executing');
```

**预期结果**：
- 有数据：说明有回复任务正在处理
- 无数据：说明当前没有待处理/正在处理的任务

### 场景 2：Worker 处理慢

如果 Worker 处理速度慢（如网络延迟、浏览器响应慢），记录会在表中停留更久：

```sql
-- 查看超过 1 分钟还未完成的任务
SELECT
  id,
  reply_status,
  datetime(created_at, 'unixepoch') as created_time,
  (strftime('%s', 'now') - created_at) as age_seconds
FROM replies
WHERE reply_status IN ('pending', 'executing')
  AND (strftime('%s', 'now') - created_at) > 60;
```

### 场景 3：失败任务

失败的任务也会被删除，但可能在重试期间存在：

```sql
-- 查看失败任务
SELECT * FROM replies WHERE error_code IS NOT NULL;
```

---

## 如何验证回复功能是否正常？

### 方法 1：查看日志

```bash
# Master 日志
tail -f packages/master/logs/replies-api.log

# 预期日志：
# Created reply request: <reply_id>
# Forwarded reply to worker: <worker_id>
# Reply success: <reply_id>
```

### 方法 2：API 查询历史

```bash
# 查询最近的回复记录（包括已删除的）
curl http://localhost:3000/api/replies?limit=10
```

**注意**：这个 API 只能查到**当前在表中的记录**，不包括已删除的。

### 方法 3：通过平台验证

直接去抖音/平台网站查看：
1. 评论是否有你的回复
2. 私信对话中是否有你的消息

### 方法 4：客户端通知

客户端会收到 `server:reply:result` 事件：

```javascript
socket.on('server:reply:result', (data) => {
  console.log('Reply result:', data);
  // {
  //   reply_id: "xxx",
  //   request_id: "yyy",
  //   status: "success",
  //   platform_reply_id: "zzz"
  // }
});
```

---

## 如果真的需要保存回复记录怎么办？

### 方案 1：修改删除逻辑（不推荐）

**文件**：`packages/master/src/index.js:394`

```javascript
// 修改前
replyDAO.deleteReply(reply_id);

// 修改后
// 不删除，只更新状态为 'completed'
// replyDAO.deleteReply(reply_id);
```

**缺点**：
- 数据会累积
- 查询变慢
- 需要定期清理

### 方案 2：创建回复历史表（推荐）✅

创建新表 `reply_history`：

```sql
CREATE TABLE reply_history (
  id TEXT PRIMARY KEY,
  original_reply_id TEXT,
  request_id TEXT,
  platform TEXT,
  account_id TEXT,
  target_type TEXT,
  target_id TEXT,
  reply_content TEXT,
  platform_reply_id TEXT,
  status TEXT,
  executed_at INTEGER,
  execution_time_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER,

  INDEX idx_reply_history_account (account_id),
  INDEX idx_reply_history_status (status),
  INDEX idx_reply_history_executed (executed_at)
);
```

**修改代码**：

```javascript
// 成功时：先归档，再删除
if (status === 'success') {
  replyDAO.updateReplySuccess(reply_id, platform_reply_id, data.data);

  // 新增：归档到历史表
  replyHistoryDAO.archive(reply);

  // 然后删除
  replyDAO.deleteReply(reply_id);
}
```

### 方案 3：使用外部日志系统

- 将回复记录发送到 ElasticSearch / MongoDB
- 用于长期分析和审计
- 不影响主数据库性能

---

## 总结

### ✅ replies 表没有数据是正常的

| 状态 | 说明 |
|------|------|
| **表为空** | ✅ 正常（无待处理任务或任务已完成） |
| **有少量记录** | ✅ 正常（正在处理中） |
| **记录堆积** | ⚠️ 异常（Worker 可能离线或处理慢） |

### 📋 验证回复功能的正确方法

1. ✅ 查看 Master 日志
2. ✅ 查看 Worker 日志
3. ✅ 客户端监听通知事件
4. ✅ 直接去平台网站验证

### 🎯 关键要点

- `replies` 表 = **临时任务队列**
- 完成的任务 = **自动删除**
- 回复记录 = **存储在平台或其他表中**

---

**分析时间**：2025-10-27
**分析人员**：Claude
**结论**：✅ replies 表设计正常，无需修改
