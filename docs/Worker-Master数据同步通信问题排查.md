# Worker-Master数据同步通信问题排查

## 问题描述

IM控制台无法实时接收新消息推送，用户必须手动点击头像刷新才能看到新消息。

## 问题分析

### 系统架构
```
Worker (数据采集) → Master (数据分发) → Client (前端展示)
```

### 消息流程
1. **Worker端实时监控** (`douyin-realtime-monitor.log`)
   - ✅ 成功捕获新消息 (如: "苏苏" 发送的 "123456", messageId: 757248209209, 时间: 15:38:06)
   - ✅ 数据推送到 Master (`data-pusher.log` 显示 "Data sync pushed successfully")

2. **Master端接收** (`master.log`)
   - ❌ **完全没有收到数据同步消息**
   - ✅ 但能正常接收账户状态上报

3. **Client端**
   - ❌ 无法收到新消息提示（红点）

## 技术细节

### Worker 消息发送路径

```javascript
// 1. data-pusher.js (line 312)
await this.workerBridge.sendToMaster(message);

// 2. worker-bridge.js (line 302)
this.socket.emit('message', message);  // MESSAGE = 'message'
```

### Master 消息接收路径

```javascript
// socket-server.js (line 130)
socket.on(MESSAGE, async (msg) => {  // MESSAGE = 'message'
  logger.info(`📥 Worker ${socket.id} sent MESSAGE event`);
  // ... 处理逻辑
});
```

### 关键发现

1. **相同的Socket实例**
   - `AccountStatusReporter` 使用: `socketClient.socket` ✅ (能正常发送)
   - `WorkerBridge` 使用: `socketClient.socket` ❌ (无法发送)
   - **两者使用同一个socket实例**

2. **相同的事件名**
   - 账户状态上报: `socket.emit(MESSAGE, ...)` = `socket.emit('message', ...)`
   - 数据同步: `socket.emit('message', ...)`
   - **两者使用相同的事件名 'message'**

3. **不同的消息类型**
   - 账户状态: `message.type = 'worker:account:status'` ✅ 能收到
   - 数据同步: `message.type = 'worker:data:sync'` ❌ 收不到

## 已执行的修复尝试

### 尝试 1: 添加专用监听器 (失败)
**文件**: `packages/master/src/communication/socket-server.js`

**错误操作**: 在第101-117行添加了 `socket.on('worker:data:sync', ...)` 监听器

**问题**:
- Worker 发送的是 `socket.emit('message', ...)` 事件
- 添加的监听器监听的是 `'worker:data:sync'` 事件
- **事件名不匹配**

**已回滚**: ✅ 删除了错误的监听器

### 尝试 2: 添加调试日志 (进行中)

**Master端** (`socket-server.js` line 131, 146):
```javascript
socket.on(MESSAGE, async (msg) => {
  logger.info(`📥 Worker ${socket.id} sent MESSAGE event`);
  // ...
  logger.info(`📋 Worker ${socket.id} message type: ${msg.type}`);
});
```

**Worker端** (`worker-bridge.js` line 294, 304):
```javascript
logger.info(`📤 Sending ${message.type} message to Master`, {
  type: message.type,
  socketId: this.socket.id,
  connected: this.socket.connected,
});
// socket.emit('message', message);
logger.info(`✅ Message ${message.type} emitted successfully`);
```

**观察结果**:
- Worker 日志: "Data sync pushed successfully" (证明 emit 被调用)
- Master 日志: **完全没有** "📥 Worker sent MESSAGE event" (证明监听器未触发)

## 当前状态

### 已排除的可能原因
1. ❌ 事件名不匹配 (都是 'message')
2. ❌ Socket实例不同 (确认是同一个)
3. ❌ 命名空间错误 (都在 `/worker` 命名空间)
4. ❌ Worker未连接 (日志显示已连接)

### 待排查方向

1. **消息验证失败** (`validateMessage`函数)
   - 可能数据同步消息格式与账户状态消息格式不同
   - 验证失败但没有日志输出

2. **Socket.IO中间件拦截**
   - 可能有中间件过滤了特定类型的消息

3. **消息大小限制**
   - 数据同步消息可能超过Socket.IO的消息大小限制
   - 账户状态消息较小，能正常传输

4. **异步处理问题**
   - data-pusher 使用 `await this.workerBridge.sendToMaster()`
   - account-status-reporter 使用 `this.socket.emit()` (同步)
   - 可能存在 Promise 未正确处理的问题

## 测试数据

### 最新测试消息
- **发送方**: 苏苏
- **内容**: "654321"
- **时间**: 15:48:xx (用户反馈: "发送了新消息，前台还是没有推送")

### Worker日志证据
```
15:47:22 - 推送了 14 条数据（7 conversations + 7 messages）
15:47:31 - 推送了 30 条数据（15 conversations + 15 messages）
```

### Master日志证据
- ❌ 无任何接收记录

## 下一步行动

1. **重启Worker** - 应用新的调试日志
2. **监控日志** - 观察 emit 和监听器是否都被触发
3. **检查消息格式** - 对比账户状态消息和数据同步消息的结构
4. **检查消息大小** - 确认是否超过限制
5. **检查 validateMessage** - 确认数据同步消息是否通过验证

## 相关文件

### Master端
- `packages/master/src/communication/socket-server.js` - Socket.IO服务器配置
- `packages/master/src/communication/data-sync-receiver.js` - 数据同步接收处理
- `packages/master/src/index.js` - 消息处理器注册 (line 521)

### Worker端
- `packages/worker/src/platforms/base/data-pusher.js` - 数据推送器
- `packages/worker/src/platforms/base/worker-bridge.js` - Worker通信桥接
- `packages/worker/src/handlers/account-status-reporter.js` - 账户状态上报器 (对照组)

### Shared
- `packages/shared/protocol/events.js` - 事件常量定义 (MESSAGE = 'message')
- `packages/shared/protocol/messages.js` - 消息类型定义
- `packages/shared/utils/validator.js` - 消息验证函数

## 时间线

- **15:36:30** - 首次发现Master收到数据同步 (修复前)
- **15:35:50** - Master重启后，**再也没有收到**数据同步
- **15:38:06** - 用户发送测试消息 "123456" (Worker已捕获)
- **15:4X** - 添加错误监听器 `worker:data:sync` (已回滚)
- **15:46:49** - Master再次重启，应用正确配置
- **15:47:22+** - Worker持续推送数据，Master持续无接收记录
- **15:48:xx** - 用户发送 "654321"，前台仍无推送

## 关键疑问

**为什么同一个socket实例、同一个事件名，账户状态能收到，数据同步收不到？**

可能的答案：
1. 消息内容差异导致验证失败
2. 消息大小差异导致传输失败
3. 异步处理方式差异导致时序问题
4. Socket.IO内部缓冲/队列问题

---

**最后更新**: 2025-11-14 15:50
**状态**: 🔴 问题未解决 - 正在深度调查
