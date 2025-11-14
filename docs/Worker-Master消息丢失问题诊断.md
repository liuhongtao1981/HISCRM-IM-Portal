# Worker-Master 消息丢失问题诊断

## 问题描述

Worker 成功捕获新消息并声称已通过 Socket.IO 发送到 Master，但 Master **完全没有接收到**除了 `heartbeat` 和 `register` 之外的任何消息。

## 时间线

### Worker 端（16:47:28 - 16:50:12）

**成功捕获新消息**（`douyin-realtime-monitor.log`）：
```
16:47:28.071 - Processing conversation and user info for message 757249995888
16:47:28.072 - Conversation upserted: conv_acc-98296c87-2e42-447a-9d8b-8be008ddb6e4... (苏苏)
16:47:28.074 - Message processed successfully: 757249995888
```

**成功推送到 Master**（`data-pusher.log`）：
```
16:47:28.075 - [acc-98296c87-2e42-447a-9d8b-8be008ddb6e4] Data sync pushed successfully
16:47:32.588 - Pushing 2 items to Master (1 conversation + 1 message)
16:47:32.589 - Push completed in 1ms
```

**Worker-Bridge 确认消息已发送**（`worker-bridge.log`）：
```javascript
16:49:22.564 - 📤 Sending worker:data:sync message to Master (Attempt 1/5)
               socketId: "xOdEIygua7Tz0UQdAAAD", connected: true
16:49:22.576 - ✅ Message worker:data:sync emitted successfully (event: 'message')

16:49:24.397 - 📤 Sending worker:conversations:update message to Master (Attempt 1/5)
16:49:24.398 - ✅ Message emitted successfully

16:49:27.113 - 📤 Sending worker:data:sync message to Master
16:49:27.114 - ✅ Message emitted successfully

// ... 数十条类似日志，所有消息都显示 "emitted successfully"
```

**Worker 发送的消息类型**：
- `worker:data:sync` - 数据同步消息（**核心消息，包含新消息数据**）
- `worker:conversations:update` - 会话更新
- `worker:messages:update` - 消息更新
- `worker:comments:update` - 评论更新
- `worker:heartbeat` - 心跳（**每10秒，Master 正常接收**）
- `worker:account:status` - 账户状态（**每60秒，Master 正常接收**）

### Master 端（16:46:39 - 16:50:00）

**Master 成功启动**（16:46:39.337）：
```
16:46:39.388 - ✅ IM WebSocket Server injected into DataSyncReceiver
16:46:39.388 - DataSyncReceiver connected to IM WebSocket Server for message broadcasting
16:46:39.537 - Master Server Started (Port: 3000)
```

**Worker 成功连接并注册**（16:46:40）：
```
16:46:40.097 - Worker connected: xOdEIygua7Tz0UQdAAAD
16:46:40.103 - Worker worker1 joined room: worker:worker1
16:46:40.107 - 📥 Worker sent MESSAGE event
16:46:40.107 - 📋 Worker message type: worker:heartbeat  ✅
16:46:40.133 - 📥 Worker sent MESSAGE event
16:46:40.134 - 📋 Worker message type: worker:register  ✅
```

**Master 接收的消息**（16:46:40 - 16:50:00）：
```
16:46:40.107 - worker:heartbeat  ✅ 接收成功
16:46:40.134 - worker:register   ✅ 接收成功
16:46:50.111 - worker:heartbeat  ✅ 接收成功
16:47:00.xxx - worker:heartbeat  ✅ 接收成功 (推测)
16:48:00.xxx - worker:account:status  ✅ 接收成功 (推测)
... (只有 heartbeat 和 account:status，没有任何其他消息)
```

**Master 完全没有接收到**：
- ❌ `worker:data:sync` - **0 条**
- ❌ `worker:conversations:update` - **0 条**
- ❌ `worker:messages:update` - **0 条**
- ❌ `worker:comments:update` - **0 条**

### 客户端（16:46:53）

**IM 控制台连接成功并加载数据**：
```
16:46:53.679 - [IM WS] New client connected: VBTx--FPA-5iXUZgAAAG
16:46:53.766 - [IM WS] Monitor client registered: monitor_1761267964500_a7a89i0zf
16:46:53.868 - [UNREAD] 会话 "苏苏" 有 1 条未读消息 (总消息数: 10)
```

但这个未读消息是之前的历史数据（16:41:33 的 "1234321"），**不是最新的 "545454"**。

## 问题分析

### 症状

1. **Worker 声称所有消息都发送成功**
   - `socket.emit('message', msg)` 执行成功
   - Socket 状态：`connected: true`
   - Socket ID：`xOdEIygua7Tz0UQdAAAD`（固定，无变化）

2. **Master 只接收部分消息类型**
   - ✅ `worker:heartbeat` - 正常接收
   - ✅ `worker:register` - 正常接收
   - ✅ `worker:account:status` - 正常接收（推测）
   - ❌ `worker:data:sync` - **完全丢失**
   - ❌ `worker:conversations:update` - **完全丢失**
   - ❌ `worker:messages:update` - **完全丢失**
   - ❌ `worker:comments:update` - **完全丢失**

3. **Socket 连接状态正常**
   - Worker 和 Master 之间的 Socket 连接稳定
   - 心跳正常（每10秒）
   - 无断开重连记录

### 可能原因

#### 假设 1: Master 事件监听器未正确注册（❌ 已排除）

**代码检查**：
```javascript
// packages/master/src/communication/socket-server.js:130
socket.on(MESSAGE, async (msg) => {
  logger.info(`📥 Worker ${socket.id} sent MESSAGE event`);
  logger.info(`📋 Worker ${socket.id} message type: ${msg.type}`);

  const handler = handlers[msg.type];
  if (handler) {
    await handler(socket, msg, workerNamespace);
  } else {
    logger.warn(`No handler for message type: ${msg.type}`);
  }
});
```

**分析**：
- 代码逻辑正确
- `heartbeat` 和 `register` 能正常接收，说明监听器已注册
- 应该会记录所有 MESSAGE 事件，但日志中**完全没有** `data:sync` 相关的日志

#### 假设 2: 消息大小超过 Socket.IO 限制（⚠️ 待验证）

**分析**：
- `heartbeat` 消息很小（只有时间戳）→ 正常接收
- `register` 消息中等（包含 Worker 信息）→ 正常接收
- `account:status` 消息中等（2个账户状态）→ 正常接收
- `data:sync` 消息**可能很大**（包含完整快照数据）→ **丢失**

**Socket.IO 默认限制**：
- `maxHttpBufferSize`: 1MB (1e6 bytes)
- 如果消息超过此限制，Socket.IO 会**静默丢弃**消息

#### 假设 3: 消息验证失败被拦截（⚠️ 待验证）

**代码逻辑**：
```javascript
const validation = validateMessage(msg);
if (!validation.valid) {
  logger.warn(`Invalid message from worker ${socket.id}:`, validation.error);
  return;
}
```

**分析**：
- 如果 `data:sync` 消息格式不符合验证规则，会被拦截
- 但应该有 `logger.warn` 日志，而日志中**完全没有警告**
- 说明消息**根本没到达验证环节**

#### 假设 4: Socket.IO 传输层问题（🔥 最可能）

**症状**：
- 小消息（heartbeat）正常传输
- 大消息（data:sync）完全丢失
- 无任何错误日志

**可能性**：
1. **消息大小超限** - Socket.IO 静默丢弃超过 1MB 的消息
2. **序列化失败** - 某些数据类型无法被 JSON.stringify 序列化
3. **传输缓冲区满** - 大量消息堆积导致缓冲区溢出
4. **WebSocket/Polling 协议切换问题** - 长连接模式下的数据传输异常

#### 假设 5: Master 运行代码与源码不一致（⚠️ 待验证）

**观察**：
- Master bash_id `1386d2` 在 16:46:39 启动
- 日志显示 `✅ IM WebSocket Server injected into DataSyncReceiver`（说明运行了最新代码）
- 但之后完全没有 MESSAGE 日志（16:46:50 之后）

**可能性**：
- Master 进程可能崩溃后自动重启，但我们看到的是旧进程
- 或者日志写入被延迟/缓冲

## 下一步排查

### 1. 检查 Socket.IO 配置

查看 Master 的 Socket.IO 服务器配置，确认 `maxHttpBufferSize` 设置：

```javascript
// packages/master/src/communication/socket-server.js:24-31
const io = new Server(httpServer, {
  cors: { ... },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: ???  // 需要检查
});
```

### 2. 测试消息大小

在 Worker bridge 中添加日志，记录发送的消息大小：

```javascript
const messageSize = JSON.stringify(message).length;
logger.info(`Message size: ${messageSize} bytes (${(messageSize/1024).toFixed(2)} KB)`);
```

### 3. 添加 Socket.IO 错误监听

在 Worker 端监听 Socket 错误事件：

```javascript
socket.on('error', (error) => {
  logger.error('Socket error:', error);
});

socket.on('connect_error', (error) => {
  logger.error('Socket connect error:', error);
});
```

### 4. 验证 Master 进程状态

确认当前运行的 Master 进程 PID 和启动时间：

```bash
tasklist | findstr node
netstat -ano | findstr :3000
```

### 5. 尝试发送小消息测试

修改 Worker 的 `data:sync` 消息，只发送少量数据（如 1-2 条消息而非完整快照），观察是否能被 Master 接收。

## 建议修复方案

### 方案 A: 增加 Socket.IO 消息大小限制

```javascript
// packages/master/src/communication/socket-server.js
const io = new Server(httpServer, {
  cors: { ... },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 10e6,  // 增加到 10MB
});
```

### 方案 B: 分片传输大消息

将 `data:sync` 消息拆分成多个小消息发送：

```javascript
// Worker 端
if (messageSize > 500000) {  // 500KB
  // 拆分成多个消息
  for (const chunk of chunks) {
    socket.emit('message', chunk);
  }
} else {
  socket.emit('message', message);
}
```

### 方案 C: 使用增量同步代替完整快照

修改数据同步逻辑，只发送变更的数据而非完整快照：

```javascript
// 只发送新增/修改的消息
const changes = {
  newMessages: [...],
  updatedConversations: [...],
};
socket.emit('message', { type: 'worker:data:delta', payload: changes });
```

## 当前状态

- 🔴 **严重问题** - Worker → Master 数据同步消息完全丢失
- ✅ Worker 实时监控功能正常（成功捕获新消息 757249995888）
- ✅ Worker Socket 连接正常（heartbeat 正常发送和接收）
- ❌ Master 无法接收数据同步消息（无法检测新消息）
- ❌ IM 控制台无法实时显示红点（因为 Master 未收到数据）

---

**最后更新**: 2025-11-14 16:51
**诊断人员**: Claude Code
**状态**: 🔴 严重问题 - 消息丢失原因待确认
