# 回复功能设计文档

## 目录

1. [概述](#概述)
2. [架构设计](#架构设计)
3. [数据库设计](#数据库设计)
4. [协议设计](#协议设计)
5. [幂等性设计](#幂等性设计)
6. [实现指南](#实现指南)
7. [测试方案](#测试方案)

---

## 概述

本文档详细描述了在 HisCrm-IM 系统中添加**评论/私信回复功能**的完整设计方案。

### 核心设计原则

1. **多平台支持**：回复功能需要支持多个社交媒体平台（抖音、小红书等）
2. **幂等性保证**：防止重复提交和网络延迟导致的重复回复
3. **完整追踪**：记录每个回复操作的完整生命周期
4. **防重复**：三维度防护机制确保不会重复回复

### 业务场景

```
用户在客户端看到一条评论
    ↓
点击"回复"按钮，输入回复内容
    ↓
提交回复请求
    ↓
系统检查是否重复提交
    ↓
分配给对应平台的 Worker 执行
    ↓
Worker 通过浏览器自动化完成回复
    ↓
返回结果给用户
    ↓
用户收到成功/失败通知
```

---

## 架构设计

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│ 客户端 (Desktop/Web/Mobile)                                 │
│ - 生成唯一 request_id                                        │
│ - 禁用提交按钮防止多次点击                                    │
│ - 轮询查询回复状态                                            │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/WebSocket
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Master (主控服务器)                                          │
│ - 验证 request_id 防止重复                                   │
│ - 查询账户的 platform 和 assigned_worker_id                  │
│ - 创建 replies 表记录                                       │
│ - 转发请求给 Worker                                         │
│ - 处理 Worker 返回的结果                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ Socket.IO
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Worker (工作进程)                                            │
│ - 从 PlatformManager 获取平台实例                           │
│ - 调用平台特定的 replyToComment/DirectMessage 方法          │
│ - 通过浏览器自动化执行回复                                    │
│ - 拦截 API 响应获取结果                                    │
│ - 返回结果给 Master                                         │
└─────────────────────────────────────────────────────────────┘
```

### 三维身份识别

回复操作需要清晰地追踪：

```
Platform (平台标识)
    ├─ 'douyin'         # 抖音
    ├─ 'xiaohongshu'    # 小红书
    └─ ...

Account (账户标识)
    ├─ account_id: 'douyin-account-123'
    └─ assigned_worker_id: 'worker-1'

Target (消息目标)
    ├─ target_type: 'comment' | 'direct_message'
    └─ target_id: 'comment-456'
```

### 完整数据流

```
客户端
    │
    ├─ 生成 request_id = "reply-{timestamp}-{uuid}"
    ├─ 禁用提交按钮
    │
    ▼
POST /api/replies
    │ {
    │   request_id,
    │   account_id,
    │   target_type,
    │   target_id,
    │   reply_content
    │ }
    │
    ▼
Master: replyDAO.createReply()
    │
    ├─ 检查 request_id 是否已存在
    │   ├─ 已存在且成功 → 返回 409 Conflict
    │   └─ 不存在 → 创建新记录 (status='pending')
    │
    ├─ 查询 account.platform 和 account.assigned_worker_id
    │
    ├─ 标记为执行中 (status='executing')
    │
    ▼
转发给 Worker: master:reply:request
    │ {
    │   reply_id,
    │   request_id,
    │   platform,
    │   account_id,
    │   target_type,
    │   target_id,
    │   reply_content,
    │   context: { videoId, userId, ... }
    │ }
    │
    ▼
Worker: replyExecutor.executeReply()
    │
    ├─ 检查 request_id 是否已处理过
    │   ├─ 已处理 → 忽略（返回缓存结果）
    │   └─ 新请求 → 继续执行
    │
    ├─ 从 platformManager.getPlatform(platform) 获取实例
    │
    ├─ 调用 platform.replyToComment() 或 platform.replyToDirectMessage()
    │
    ├─ 浏览器自动化执行回复
    │   ├─ 创建账户上下文
    │   ├─ 导航到相应页面
    │   ├─ 定位消息目标
    │   ├─ 输入回复内容
    │   ├─ 提交回复
    │   └─ 拦截 API 获取结果
    │
    ▼
返回给 Master: worker:reply:result
    │ {
    │   reply_id,
    │   request_id,
    │   platform,
    │   account_id,
    │   status: 'success' | 'failed',
    │   platform_reply_id,
    │   data
    │ }
    │
    ▼
Master: 更新数据库
    │
    ├─ UPDATE replies SET status=?, platform_reply_id=?, reply_data=?
    │
    ├─ 查询账户用户的所有 Socket 会话
    │
    ▼
推送给客户端: server:reply:result
    │ {
    │   reply_id,
    │   request_id,
    │   status,
    │   message
    │ }
    │
    ▼
客户端
    ├─ 验证 request_id 匹配
    ├─ 清除 pending-reply 记录
    ├─ 启用提交按钮
    └─ 显示成功/失败提示
```

---

## 数据库设计

### replies 表结构

```sql
CREATE TABLE replies (
  -- 主键和幂等性
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT,

  -- 身份信息（三维标识）
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  -- 平台特定字段
  platform_target_id TEXT,
  video_id TEXT,
  user_id TEXT,

  -- 回复内容
  reply_content TEXT NOT NULL,

  -- 状态管理
  reply_status TEXT NOT NULL DEFAULT 'pending',
  submitted_count INTEGER DEFAULT 1,

  -- Worker 追踪
  assigned_worker_id TEXT,
  worker_platform TEXT,

  -- 时间戳（防延迟关键）
  first_submitted_at INTEGER NOT NULL,
  last_submitted_at INTEGER NOT NULL,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- 错误信息
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- 结果
  platform_reply_id TEXT,
  reply_data TEXT,

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL
);
```

### 关键字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `request_id` | TEXT UNIQUE | 客户端生成的唯一请求 ID，防止重复提交 |
| `idempotency_key` | TEXT | 基于内容的哈希，检测完全相同的请求 |
| `platform` | TEXT | 平台标识 ('douyin' \| 'xiaohongshu') |
| `account_id` | TEXT | 关联的账户 ID |
| `target_type` | TEXT | 目标类型 ('comment' \| 'direct_message') |
| `target_id` | TEXT | 被回复的消息 ID |
| `reply_status` | TEXT | 状态: pending → executing → success/failed |
| `submitted_count` | INT | 重复提交次数（防延迟时的提交计数） |
| `first_submitted_at` | INT | 第一次提交时间戳 |
| `last_submitted_at` | INT | 最后一次提交时间戳 |
| `executed_at` | INT | 执行完成时间戳 |

### 索引优化

```sql
CREATE UNIQUE INDEX idx_replies_request_id ON replies(request_id);
CREATE INDEX idx_replies_idempotency_key ON replies(idempotency_key);
CREATE INDEX idx_replies_account ON replies(account_id);
CREATE INDEX idx_replies_worker ON replies(assigned_worker_id);
CREATE INDEX idx_replies_platform ON replies(platform);
CREATE INDEX idx_replies_status ON replies(reply_status);
CREATE INDEX idx_replies_target ON replies(target_type, target_id);
CREATE INDEX idx_replies_created ON replies(created_at);
CREATE INDEX idx_replies_executed ON replies(executed_at);
```

---

## 协议设计

### 消息类型定义

#### 从客户端到 Master

```javascript
// POST /api/replies
{
  request_id: 'reply-1729420800000-uuid-12345',  // 必填
  account_id: 'douyin-account-123',
  target_type: 'comment' | 'direct_message',
  target_id: 'comment-456',
  reply_content: '用户输入的回复内容',
  context: {
    video_id?: 'video-789',
    user_id?: 'user-890',
    author_name?: '@用户昵称'
  }
}
```

#### 从 Master 到 Worker

```javascript
// Socket: master:reply:request
{
  type: 'master:reply:request',
  reply_id: 'reply-uuid-123',
  request_id: 'reply-1729420800000-uuid-12345',
  platform: 'douyin',
  account_id: 'douyin-account-123',
  target_type: 'comment',
  target_id: 'comment-456',
  reply_content: '用户输入的回复内容',
  context: {
    video_id: 'video-789',
    author_id: 'user-890'
  },
  timestamp: 1729420800000
}
```

#### 从 Worker 到 Master

```javascript
// Socket: worker:reply:result
{
  type: 'worker:reply:result',
  reply_id: 'reply-uuid-123',
  request_id: 'reply-1729420800000-uuid-12345',
  platform: 'douyin',
  account_id: 'douyin-account-123',
  worker_id: 'worker-1',
  status: 'success' | 'failed',
  platform_reply_id: 'reply-12345',
  data: {
    reply_created_at: 1729420900000,
    reply_author_id: 'account-id',
    // 其他平台特定字段
  },
  error_code?: 'NETWORK_ERROR' | 'LOGIN_EXPIRED' | 'QUOTA_EXCEEDED',
  error_message?: '具体错误信息',
  timestamp: 1729420900000
}
```

#### 从 Master 到客户端

```javascript
// Socket: server:reply:result
{
  reply_id: 'reply-uuid-123',
  request_id: 'reply-1729420800000-uuid-12345',
  status: 'success' | 'failed',
  platform: 'douyin',
  message: '✅ 回复成功！' | '❌ 回复失败: 原因'
}
```

---

## 幂等性设计

### 防重复提交的三重防护

#### 1. 前端防护（客户端）

```javascript
// 禁用提交按钮
submitBtn.disabled = true;

// 检查 sessionStorage 是否已有待处理的回复
const pending = sessionStorage.getItem(`pending-reply-${accountId}`);
if (pending) {
  showNotification('上一次回复还在处理中，请勿重复提交');
  return;
}

// 存储待处理状态
sessionStorage.setItem(
  `pending-reply-${accountId}`,
  JSON.stringify({
    requestId,
    replyId: data.reply_id,
    submittedAt: Date.now()
  })
);
```

#### 2. Master 数据库层

```javascript
// UNIQUE 约束防止重复
const existing = await replyDAO.checkDuplicateRequest(requestId);
if (existing) {
  // 返回 409 Conflict
  return res.status(409).json({
    reply_id: existing.id,
    status: existing.reply_status,
    message: '您已经提交过这条回复'
  });
}

// 内容去重（可选的更激进防护）
const idempotencyKey = generateIdempotencyKey(
  account_id,
  target_type,
  target_id,
  reply_content
);
```

#### 3. Worker 内存层

```javascript
// 本地缓存最近 24 小时的 request_id
private executedRequests = new Map();

// 检查是否已处理过
const processing = await this.isRequestAlreadyProcessing(request_id);
if (processing) {
  this.logger.warn('Request already processing, skipping');
  return;
}

// 标记为处理中
this.executedRequests.set(request_id, {
  reply_id,
  status: 'executing',
  timestamp: Date.now()
});
```

#### 4. Master 结果处理层

```javascript
// 检查这个结果是否已经处理过
const existingResult = await db.prepare(`
  SELECT id FROM replies
  WHERE request_id = ? AND reply_status IN ('success', 'failed')
`).get(request_id);

if (existingResult) {
  // 已处理过，不重复通知
  logger.warn('Duplicate reply result detected, skipping');
  return;
}
```

### 防延迟的时间戳追踪

```sql
-- 记录每个阶段的时间
first_submitted_at    -- 用户第一次提交时间
last_submitted_at     -- 用户最后一次点击时间
executed_at           -- 回复完成时间

-- 计算统计信息
wait_time = executed_at - first_submitted_at  -- 总等待时间
submit_delay = last_submitted_at - first_submitted_at  -- 重复提交间隔
```

---

## 实现指南

### 第一步：数据库迁移

创建迁移文件 `packages/master/src/database/migrations/003-add-replies-table.sql`：

```sql
-- 创建 replies 表
CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT,

  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  platform_target_id TEXT,
  video_id TEXT,
  user_id TEXT,

  reply_content TEXT NOT NULL,

  reply_status TEXT NOT NULL DEFAULT 'pending',
  submitted_count INTEGER DEFAULT 1,

  assigned_worker_id TEXT,
  worker_platform TEXT,

  first_submitted_at INTEGER NOT NULL,
  last_submitted_at INTEGER NOT NULL,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  platform_reply_id TEXT,
  reply_data TEXT,

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_replies_request_id ON replies(request_id);
CREATE INDEX idx_replies_idempotency_key ON replies(idempotency_key);
CREATE INDEX idx_replies_account ON replies(account_id);
CREATE INDEX idx_replies_worker ON replies(assigned_worker_id);
CREATE INDEX idx_replies_platform ON replies(platform);
CREATE INDEX idx_replies_status ON replies(reply_status);
CREATE INDEX idx_replies_target ON replies(target_type, target_id);
CREATE INDEX idx_replies_created ON replies(created_at);
CREATE INDEX idx_replies_executed ON replies(executed_at);
```

### 第二步：实现 ReplyDAO

`packages/master/src/database/reply-dao.js`

### 第三步：实现 API 端点

`packages/master/src/api/routes/replies.js`

### 第四步：Worker 端实现

1. 在 PlatformBase 中定义接口
2. 在 DouyinPlatform 中实现方法
3. 创建 ReplyExecutor 类
4. 在 TaskRunner 中集成

### 第五步：客户端实现

1. 生成唯一 request_id
2. 提交回复请求
3. 轮询查询状态
4. 处理成功/失败响应

---

## 测试方案

### 单元测试

- [ ] replyDAO.checkDuplicateRequest() - 检查重复请求
- [ ] replyDAO.createReply() - 创建回复记录
- [ ] replyDAO.updateReplyResult() - 更新结果
- [ ] ReplyExecutor.executeReply() - 执行回复
- [ ] DouyinPlatform.replyToComment() - 抖音回复评论

### 集成测试

- [ ] 完整的回复流程：客户端 → Master → Worker → 平台
- [ ] 重复提交防护：同一 request_id 多次提交
- [ ] 网络延迟模拟：测试 timeout 和 retry
- [ ] 多平台测试：抖音、小红书等

### 场景测试

1. **正常场景**
   - 用户提交回复 → 成功
   - 显示成功提示，刷新列表

2. **重复提交场景**
   - 用户快速点击多次提交按钮
   - 系统返回 409 Conflict
   - 用户收到"已提交"提示

3. **网络延迟场景**
   - Master 处理缓慢
   - 客户端继续轮询
   - 最终收到成功/失败结果

4. **Worker 离线场景**
   - Worker 掉线
   - Master 返回 503 Service Unavailable
   - 记录失败并重试

5. **同时多个回复**
   - 用户同时回复多个评论
   - 系统独立处理每个回复

---

## 附录

### 相关文件清单

- `packages/master/src/database/reply-dao.js` - 数据访问层
- `packages/master/src/api/routes/replies.js` - API 端点
- `packages/master/src/communication/socket-server.js` - Socket 事件处理
- `packages/worker/src/handlers/reply-executor.js` - 回复执行器
- `packages/worker/src/platforms/base/platform-base.js` - 平台基类
- `packages/worker/src/platforms/douyin/platform.js` - 抖音平台实现
- `packages/worker/src/handlers/task-runner.js` - 任务运行器

### 性能考虑

- 回复操作通常需要 3-10 秒（包括页面加载、填充表单、提交等）
- 推荐客户端轮询间隔：500ms
- 最大轮询次数：120 次（约 60 秒超时）
- Worker 本地缓存保留：24 小时

### 安全考虑

- 验证用户是否拥有该账户
- 限制每个用户的回复频率
- 记录所有回复操作用于审计
- 保护回复内容不被滥用（敏感词过滤等）
