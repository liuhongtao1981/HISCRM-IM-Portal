# IM 发送消息功能实现

**日期**: 2025-11-06
**版本**: 1.0

## 功能概述

实现了 IM 客户端通过 Master 向 Worker 发送消息的完整功能，支持：
- 评论回复（回复作品下的评论）
- 私信回复（回复用户私信）
- 实时状态反馈（发送中/已发送/失败）
- 自动持久化（Worker 爬取回来后自动存储）

## 架构设计

### 数据流

```
┌─────────────┐
│  IM 客户端   │
└──────┬──────┘
       │ emit('monitor:reply')
       │ {channelId, topicId, content, messageCategory}
       ↓
┌─────────────────────────────────┐
│  Master (IMWebSocketServer)     │
│  handleMonitorReply()            │
├─────────────────────────────────┤
│ 1. 创建回复消息对象              │
│ 2. 广播给所有 IM 客户端(状态:sending) │
│ 3. 查找负责账户的 Worker         │
│ 4. 构造回复任务                  │
│ 5. 发送给 Worker                │
└──────┬──────────────────────────┘
       │ emit('master:reply:request')
       │ {reply_id, platform, target_type, reply_content...}
       ↓
┌─────────────────────────────────┐
│  Worker (ReplyExecutor)         │
│  executeReply()                  │
├─────────────────────────────────┤
│ 1. 获取平台实例                  │
│ 2. 调用平台 API 发送消息         │
│ 3. 返回执行结果                  │
└──────┬──────────────────────────┘
       │ emit('worker:reply:result')
       │ {reply_id, status, platform_reply_id}
       ↓
┌─────────────────────────────────┐
│  Master (IMWebSocketServer)     │
│  handleWorkerReplyResult()      │
├─────────────────────────────────┤
│ 1. 接收 Worker 回复结果         │
│ 2. 广播状态更新给所有 IM 客户端  │
│    (status: sent/failed)        │
└─────────────────────────────────┘
       │ emit('channel:message:status')
       ↓
┌─────────────┐
│  IM 客户端   │ 显示消息状态
└─────────────┘

       ┌────────────────────────┐
       │   Worker 定期爬取      │
       │   (15-30秒后)          │
       ├────────────────────────┤
       │ 客服的回复被抓取回来    │
       │ 存储到 cache 表        │
       │ 同步到 DataStore       │
       └────────────────────────┘
```

## 实现细节

### 1. Master 端修改

#### 1.1 IMWebSocketServer 构造函数

**文件**: [im-websocket-server.js:12](../packages/master/src/communication/im-websocket-server.js#L12)

```javascript
constructor(io, dataStore, cacheDAO = null, accountDAO = null, workerRegistry = null, replyDAO = null) {
  this.io = io;
  this.dataStore = dataStore;
  this.cacheDAO = cacheDAO;
  this.accountDAO = accountDAO;
  this.workerRegistry = workerRegistry;  // ✅ 新增: Worker 注册表
  this.replyDAO = replyDAO;  // ✅ 新增: 回复数据访问层（保留，暂未使用）

  // ...
}
```

#### 1.2 setupHandlers 添加 Worker 监听

**文件**: [im-websocket-server.js:93-100](../packages/master/src/communication/im-websocket-server.js#L93-L100)

```javascript
// ✅ 监听 Worker 命名空间的回复结果
const workerNamespace = this.io.of('/worker');
workerNamespace.on('connection', (socket) => {
  // 监听 Worker 发送的回复结果
  socket.on('worker:reply:result', (data) => {
    this.handleWorkerReplyResult(socket, data);
  });
});
```

#### 1.3 handleMonitorReply 发送任务给 Worker

**文件**: [im-websocket-server.js:195-313](../packages/master/src/communication/im-websocket-server.js#L195-L313)

**核心逻辑**：

1. **创建回复消息并立即广播**（状态: sending）
```javascript
const replyMessage = {
  id: replyId,
  channelId,
  topicId,
  fromName: '客服',
  content,
  status: 'sending',  // 发送中
  // ...
};
this.broadcastToMonitors('channel:message', replyMessage);
```

2. **查找负责账户的 Worker**
```javascript
// 查询账户信息
const accountInfo = this.accountDAO.findById(channelId);
const { assigned_worker_id, platform } = accountInfo;

// 获取 Worker socket
const workerSocket = this.workerRegistry.getWorkerSocket(assigned_worker_id);
```

3. **构造回复任务**
```javascript
const replyTask = {
  reply_id: replyId,
  request_id: requestId,
  platform: platform,
  account_id: channelId,
  target_type: targetType,  // 'comment' 或 'direct_message'
  target_id: replyToId || topicId,
  conversation_id: targetType === 'direct_message' ? topicId : null,
  platform_message_id: targetType === 'direct_message' ? replyToId : null,
  reply_content: content,
  context: {
    reply_to_content: replyToContent,
    monitor_client_id: socket.id
  }
};
```

4. **发送给 Worker**
```javascript
workerSocket.emit('master:reply:request', replyTask);
```

#### 1.4 handleWorkerReplyResult 处理回复结果

**文件**: [im-websocket-server.js:319-351](../packages/master/src/communication/im-websocket-server.js#L319-L351)

```javascript
handleWorkerReplyResult(socket, data) {
  const { reply_id, status, error_message, platform_reply_id } = data;

  // 根据状态更新消息状态
  let messageStatus = 'sent';
  if (status === 'failed' || status === 'blocked' || status === 'error') {
    messageStatus = 'failed';
  }

  // 广播状态更新给所有监控客户端
  this.broadcastToMonitors('channel:message:status', {
    messageId: reply_id,
    status: messageStatus,
    error: error_message,
    platformReplyId: platform_reply_id,
    timestamp: Date.now()
  });
}
```

#### 1.5 index.js 传递 workerRegistry

**文件**: [index.js:539](../packages/master/src/index.js#L539)

```javascript
const imWebSocketServer = new IMWebSocketServer(
  socketNamespaces.io,
  dataStore,
  cacheDAO,
  accountsDAO,
  workerRegistry  // ✅ 传递 workerRegistry
);
```

### 2. Worker 端（已有实现）

Worker 端的回复执行器已经完整实现，位于：

**文件**: [reply-executor.js](../packages/worker/src/handlers/reply-executor.js)

**主要功能**：
- 接收 Master 的 `master:reply:request` 事件
- 调用平台特定的 API（`replyToComment` 或 `replyToDirectMessage`）
- 返回执行结果 `worker:reply:result`

**文件**: [task-runner.js:168-198](../packages/worker/src/handlers/task-runner.js#L168-L198)

```javascript
setupReplyHandlers() {
  // 监听 Master 发送的回复请求
  this.socketClient.socket.on('master:reply:request', async (data) => {
    logger.info(`Received reply request: ${data.reply_id}`);

    // 异步执行回复
    setImmediate(() => {
      this.replyExecutor.executeReply(data).catch((error) => {
        logger.error('Failed to execute reply:', error);
      });
    });
  });
}
```

## 消息类型和参数

### IM 客户端 → Master

**事件**: `monitor:reply`

**参数**:
```javascript
{
  channelId: 'acc-123',         // 账户ID
  topicId: 'topic-456',         // 作品ID 或 会话ID
  content: '回复内容',          // 回复文本
  replyToId: 'msg-789',         // 回复的消息ID（可选）
  replyToContent: '原消息',     // 回复的消息内容（可选）
  messageCategory: 'comment'    // 'comment' 或 'private'
}
```

### Master → Worker

**事件**: `master:reply:request`

**参数**:
```javascript
{
  reply_id: 'reply_xxx',                // 回复ID
  request_id: 'req_xxx',                // 请求ID
  platform: 'douyin',                   // 平台
  account_id: 'acc-123',                // 账户ID
  target_type: 'comment',               // 'comment' 或 'direct_message'
  target_id: 'msg-789',                 // 目标ID（评论ID或会话ID）
  conversation_id: 'conv-456',          // 会话ID（仅私信）
  platform_message_id: 'msg-789',       // 平台消息ID（仅私信，可选）
  reply_content: '回复内容',            // 回复文本
  context: {
    reply_to_content: '原消息',
    monitor_client_id: 'socket-id'
  }
}
```

### Worker → Master

**事件**: `worker:reply:result`

**参数**:
```javascript
{
  reply_id: 'reply_xxx',          // 回复ID
  request_id: 'req_xxx',          // 请求ID
  platform: 'douyin',             // 平台
  account_id: 'acc-123',          // 账户ID
  status: 'success',              // 'success' | 'failed' | 'blocked'
  platform_reply_id: 'xxx',       // 平台返回的回复ID（可选）
  error_code: null,               // 错误代码（失败时）
  error_message: null,            // 错误消息（失败时）
  timestamp: 1234567890
}
```

### Master → IM 客户端

**事件1**: `channel:message` (新消息广播)
```javascript
{
  id: 'reply_xxx',
  channelId: 'acc-123',
  topicId: 'topic-456',
  fromName: '客服',
  content: '回复内容',
  status: 'sending',      // 'sending' | 'sent' | 'failed'
  messageCategory: 'comment',
  timestamp: 1234567890,
  // ...
}
```

**事件2**: `channel:message:status` (状态更新)
```javascript
{
  messageId: 'reply_xxx',
  status: 'sent',         // 'sent' | 'failed'
  error: null,            // 错误消息（失败时）
  platformReplyId: 'xxx', // 平台回复ID
  timestamp: 1234567890
}
```

**事件3**: `reply:success` (提交成功确认)
```javascript
{
  messageId: 'reply_xxx',
  requestId: 'req_xxx',
  status: 'submitted'
}
```

**事件4**: `reply:error` (提交失败)
```javascript
{
  messageId: 'reply_xxx',
  error: '错误信息'
}
```

## 数据持久化

### 当前方案：自动持久化（通过爬取）

**特点**：
- ❌ 不保存到 `replies` 表
- ✅ Worker 下次爬取时会抓取回来
- ✅ 自动存储到 `cache_comments` 或 `cache_messages` 表
- ✅ 同步到 DataStore (内存)
- ✅ IM 客户端显示完整对话历史

**优势**：
1. 简单：不需要额外的数据库写入
2. 一致：客服回复和用户消息统一处理
3. 可靠：爬取机制已经很成熟

**数据流**：
```
客服发送回复
  ↓
Worker 在平台发送
  ↓
Worker 定期爬取 (15-30秒)
  ↓
抓取到客服的回复
  ↓
存储到 cache_comments/cache_messages 表
  ↓
同步到 DataStore
  ↓
IM 客户端自动显示
```

## 测试

### 测试脚本

**文件**: [test-send-message.js](../tests/test-send-message.js)

**用法**：
```bash
# 修改脚本中的测试参数
TEST_ACCOUNT_ID = 'acc-douyin-test-001'
TEST_COMMENT_TOPIC_ID = 'topic-comment-001'
TEST_PRIVATE_TOPIC_ID = 'topic-private-001'

# 运行测试
node tests/test-send-message.js
```

**测试场景**：
1. 连接到 Master IM WebSocket
2. 注册为监控客户端
3. 发送评论回复
4. 发送私信回复
5. 接收回复结果
6. 验证状态更新

### 手动测试步骤

1. 启动 Master 和 Worker
```bash
npm run start:master
npm run start:worker
```

2. 启动 IM 客户端
```bash
cd packages/crm-pc-im
npm run dev
```

3. 测试评论回复
   - 选择一个账户
   - 点击某个作品查看评论
   - 在输入框输入回复内容
   - 点击发送
   - 观察消息状态：发送中 → 已发送

4. 测试私信回复
   - 选择一个账户
   - 点击某个私信会话
   - 在输入框输入回复内容
   - 点击发送
   - 观察消息状态：发送中 → 已发送

5. 验证持久化
   - 等待 30 秒（Worker 爬取间隔）
   - 刷新 IM 客户端
   - 验证客服的回复仍然显示

## 错误处理

### 1. Worker 未连接

**错误**: `Worker not connected: worker-1`

**原因**: 负责该账户的 Worker 未在线

**处理**:
- Master 返回错误给 IM 客户端
- 广播消息状态为 'failed'

### 2. 账户未分配 Worker

**错误**: `No worker assigned to account: acc-123`

**原因**: 账户的 `assigned_worker_id` 为空

**处理**:
- Master 返回错误给 IM 客户端
- 提示管理员分配 Worker

### 3. Worker 执行失败

**状态**: `status: 'failed'`

**可能原因**:
- 登录状态过期
- 网络错误
- 平台限流
- 目标不存在

**处理**:
- Worker 返回详细错误信息
- Master 广播失败状态给 IM 客户端
- IM 客户端显示错误提示

### 4. Worker 执行被拦截

**状态**: `status: 'blocked'`

**原因**:
- 平台检测到自动化行为
- 账户被限制评论/私信
- 内容包含敏感词

**处理**:
- Worker 返回拦截原因
- Master 广播失败状态
- IM 客户端显示拦截提示

## 相关文件

### Master 端
1. [im-websocket-server.js](../packages/master/src/communication/im-websocket-server.js) - IM WebSocket 服务器
2. [index.js](../packages/master/src/index.js) - Master 入口，初始化 IMWebSocketServer
3. [registration.js](../packages/master/src/worker_manager/registration.js) - Worker 注册表
4. [accounts-dao.js](../packages/master/src/database/accounts-dao.js) - 账户数据访问

### Worker 端
5. [reply-executor.js](../packages/worker/src/handlers/reply-executor.js) - 回复执行器
6. [task-runner.js](../packages/worker/src/handlers/task-runner.js) - 任务运行器

### 测试和文档
7. [test-send-message.js](../tests/test-send-message.js) - 发送消息测试脚本
8. 本文档

## 总结

### 已实现功能

- ✅ IM 客户端发送评论回复
- ✅ IM 客户端发送私信回复
- ✅ Master 查找负责账户的 Worker
- ✅ Master 发送回复任务给 Worker
- ✅ Worker 执行回复并返回结果
- ✅ Master 接收结果并广播状态更新
- ✅ 实时状态反馈（发送中/已发送/失败）
- ✅ 自动持久化（通过 Worker 爬取）

### 核心优势

1. **实时性**: 立即广播消息，用户体验好
2. **可靠性**: 复用 Worker 的成熟回复机制
3. **简单性**: 不需要额外的数据库操作
4. **一致性**: 客服回复和用户消息统一处理
5. **持久化**: Worker 爬取自动持久化

### 后续优化（可选）

1. 支持发送图片/视频附件
2. 支持消息撤回
3. 支持批量回复
4. 添加回复模板功能
5. 添加敏感词过滤
