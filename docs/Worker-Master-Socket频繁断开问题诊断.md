# Worker-Master Socket 频繁断开问题诊断

## 问题现象

用户发送测试消息 "333444" 后，系统出现以下异常：
1. IM 控制台无法收到新消息推送
2. 手动刷新也无法看到新消息

## 根本原因

Worker 与 Master 之间的 Socket.IO 连接**每30秒自动断开并重连**，导致新消息推送时恰好遇到连接断开，推送失败。

### 时间线分析

```
16:29:24.284 - Worker 连接到 Master (socket ID: 43vrxawwGJ52m2v_AABt)
16:29:52.569 - Worker 实时监控捕获新消息 757249542734 (苏苏: 333444)
16:29:52.602 - Worker 尝试推送数据到 Master
16:29:52.608 - Socket 断开 (Disconnected from master: transport close) ❌
16:29:52.783 - 推送失败: "Socket is not connected" ❌
16:29:53.826 - Socket 重新连接 (socket ID: ReUg8Bn4XkldSwyTAABy)
```

### 日志证据

**Worker 实时监控日志** (`douyin-realtime-monitor.log`):
```json
{"level":"info","message":"[Realtime] Processing message: 757249542734...","service":"douyin-realtime-monitor","timestamp":"2025-11-14 16:29:52.569"}
{"level":"info","message":"✅ [Realtime] Message processed successfully: 757249542734...","service":"douyin-realtime-monitor","timestamp":"2025-11-14 16:29:52.602"}
```

**Worker Socket 客户端日志** (`socket-client.log`):
```json
{"level":"warn","message":"Disconnected from master: transport close","service":"socket-client","timestamp":"2025-11-14 16:29:52.608"}
{"level":"info","message":"Connected to master (socket ID: ReUg8Bn4XkldSwyTAABy)","service":"socket-client","timestamp":"2025-11-14 16:29:53.826"}
```

**Worker 数据推送日志** (`data-pusher.log`):
```json
{"level":"error","message":"Failed to push data sync: Socket is not connected","service":"data-pusher","timestamp":"2025-11-14 16:29:52.783"}
```

### Socket 断开模式

观察 `socket-client.log`，发现 Worker Socket 每30秒规律性断开：
```
16:25:52.756 - Disconnected (间隔 30秒)
16:26:22.768 - Disconnected (间隔 30秒)
16:26:52.774 - Disconnected (间隔 30秒)
16:27:16.051 - Disconnected (间隔 24秒，因重连延迟)
16:27:22.784 - Disconnected (间隔 6秒，恢复30秒周期)
16:27:52.788 - Disconnected (间隔 30秒)
16:28:22.790 - Disconnected (间隔 30秒)
16:28:52.795 - Disconnected (间隔 30秒)
16:29:22.799 - Disconnected (间隔 30秒)
16:29:52.608 - Disconnected (间隔 30秒) ← 恰好在推送时断开！
```

## 技术分析

### Master Socket.IO 配置

**文件**: `packages/master/src/communication/socket-server.js:29-30`

```javascript
const io = new Server(httpServer, {
  pingTimeout: 60000,    // 60秒
  pingInterval: 25000,   // 25秒
});
```

配置正常，不应导致30秒断开。

### Worker Socket.IO 客户端配置

**文件**: `packages/worker/src/communication/socket-client.js`

```javascript
reconnection: true,
reconnectionDelay: 1000,
reconnectionDelayMax: 5000,
reconnectionAttempts: Infinity,
```

配置正常，支持自动重连。

### sendToMaster 缺陷

**文件**: `packages/worker/src/platforms/base/worker-bridge.js:287-291`

```javascript
if (!this.socket.connected) {
  const error = new Error('Socket is not connected');
  logger.error('Failed to send message to Master:', error);
  throw error;  // ❌ 直接抛出错误，没有重试机制
}
```

**问题**：在 Socket 断开时立即失败，不等待重连，导致数据丢失。

## 可能的根本原因

### 假设 1: Master 端定时断开连接

可能原因：
- 某个定时任务在清理连接
- 心跳监控逻辑有问题
- Worker 注册/状态更新逻辑触发重连

### 假设 2: Worker 端主动断开

可能原因：
- 账户状态上报逻辑（每30秒）触发连接重置
- 数据推送逻辑有副作用
- Socket 客户端实例被重新创建

### 假设 3: 网络/Transport 层问题

可能原因：
- Long polling 模式下的 transport 切换
- WebSocket upgrade 失败后回退
- 防火墙/代理干扰

## 待排查问题

1. **为什么 Socket 每30秒断开？**
   - 检查 Master 端是否有定时任务在关闭连接
   - 检查 Worker 端账户状态上报逻辑
   - 检查 Socket.IO transport 模式

2. **为什么没有重试机制？**
   - `sendToMaster` 在 Socket 断开时应该等待重连
   - 或者 `data-pusher` 应该捕获错误并重试

3. **断开是否与账户状态上报相关？**
   - 观察日志，账户状态上报约每60秒一次
   - Socket 断开约每30秒一次
   - 时间不完全吻合，但可能有关联

## 解决方案

### 方案 1: 添加推送重试机制（短期）

修改 `worker-bridge.js` 的 `sendToMaster` 方法，添加等待重连和重试逻辑：

```javascript
async sendToMaster(message, retries = 3, retryDelay = 2000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (!this.socket || !this.socket.connected) {
      logger.warn(`Attempt ${attempt + 1}/${retries}: Socket not connected, waiting...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      continue;
    }

    try {
      this.socket.emit('message', message);
      logger.info(`✅ Message ${message.type} sent successfully`);
      return;
    } catch (error) {
      logger.error(`Attempt ${attempt + 1}/${retries} failed:`, error);
      if (attempt === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error('Failed to send message after max retries');
}
```

**优点**：
- 快速修复，防止数据丢失
- 兼容现有架构

**缺点**：
- 治标不治本
- 增加推送延迟

### 方案 2: 查找并修复 Socket 频繁断开问题（长期）

**排查步骤**：
1. 在 Master 端添加 Socket 断开日志，记录断开原因
2. 检查 Worker 端账户状态上报逻辑
3. 检查 Master 端心跳监控逻辑
4. 确认 Socket.IO transport 模式（WebSocket vs Long Polling）
5. 检查是否有代码在重新创建 Socket 实例

**预期结果**：
- 找到触发断开的代码位置
- 修复后 Socket 保持长连接

### 方案 3: 使用消息队列（架构优化）

引入 Redis 或内存队列，Worker 先将数据推送到队列，由独立进程负责重试：

**优点**：
- 高可靠性，不丢数据
- 解耦推送逻辑

**缺点**：
- 架构复杂度增加
- 需要额外依赖

## 建议修复顺序

1. **立即**: 实施方案1，添加重试机制，防止数据丢失
2. **今日**: 实施方案2排查步骤，找到断开原因
3. **本周**: 修复根本问题，确保 Socket 稳定连接
4. **未来**: 考虑方案3，提升系统架构健壮性

## 下一步行动

1. ✅ **已完成**: 诊断并定位问题
2. ⏳ **进行中**: 添加 `sendToMaster` 重试机制
3. ⏳ **待执行**: 查找 Socket 断开根本原因
4. ⏳ **待验证**: 发送新测试消息验证修复

---

**最后更新**: 2025-11-14 16:34
**诊断人员**: Claude Code
**状态**: 🔴 问题已定位，正在修复
