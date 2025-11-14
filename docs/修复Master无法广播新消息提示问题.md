# 修复 Master 无法广播新消息提示问题

## 问题描述

IM控制台无法实时接收新消息推送，用户必须手动点击头像刷新才能看到新消息。

## 根本原因

`DataSyncReceiver` 在初始化时缺少 `imWebSocketServer` 参数，导致 `this.imWebSocketServer` 为 `null`，广播代码（第106-127行）无法执行。

### 代码位置

**问题代码** (`packages/master/src/index.js:501`):
```javascript
dataSyncReceiver = new DataSyncReceiver(dataStore);  // ❌ 缺少 imWebSocketServer 参数
```

**广播代码** (`packages/master/src/communication/data-sync-receiver.js:115-127`):
```javascript
if (this.imWebSocketServer) {  // ❌ this.imWebSocketServer 为 null，条件失败
  const newMessagesInfo = this.detectNewMessages(oldData, snapshot);

  if (newMessagesInfo.hasNew) {
    const hints = this.buildNewMessageHints(accountId, snapshot.platform, newMessagesInfo);
    for (const hint of hints) {
      this.imWebSocketServer.broadcastToMonitors('monitor:new_message_hint', hint);
    }

    logger.info(`📤 Broadcasted ${hints.length} new message hints for ${accountId}`);
  }
}
```

## 解决方案

### 方案选择

由于初始化顺序问题（`dataSyncReceiver` 在第501行创建，`imWebSocketServer` 在第561行创建），采用**延迟注入**方案：

1. 在 `DataSyncReceiver` 类中添加 `setIMWebSocketServer()` setter 方法
2. 在 `imWebSocketServer` 创建后立即调用 setter 注入实例

### 修改内容

#### 1. 添加 setter 方法

**文件**: `packages/master/src/communication/data-sync-receiver.js`

```javascript
/**
 * 设置 IM WebSocket 服务器实例（延迟注入）
 * @param {IMWebSocketServer} imWebSocketServer - IM WebSocket 服务器实例
 */
setIMWebSocketServer(imWebSocketServer) {
  this.imWebSocketServer = imWebSocketServer;
  logger.info('✅ IM WebSocket Server injected into DataSyncReceiver');
}
```

**位置**: 第22-29行（构造函数之后）

#### 2. 调用 setter 注入实例

**文件**: `packages/master/src/index.js`

```javascript
const IMWebSocketServer = require('./communication/im-websocket-server');
const imWebSocketServer = new IMWebSocketServer(socketNamespaces.io, dataStore, cacheDAO, accountsDAO, workerRegistry);
imWebSocketServer.setupHandlers();
logger.info('IM WebSocket Server initialized with CacheDAO, AccountsDAO and WorkerRegistry support');

// 4.3.1 将 imWebSocketServer 注入到 DataSyncReceiver（延迟注入）
dataSyncReceiver.setIMWebSocketServer(imWebSocketServer);
logger.info('DataSyncReceiver connected to IM WebSocket Server for message broadcasting');
```

**位置**: 第565-567行

## 验证步骤

### 1. 重启 Master 服务器

```bash
# 停止旧进程
wmic process where "ProcessId=10992" delete

# 启动新进程
cd packages/master && npm start
```

### 2. 检查启动日志

确认以下日志出现：
```
✅ IM WebSocket Server injected into DataSyncReceiver
DataSyncReceiver connected to IM WebSocket Server for message broadcasting
```

### 3. 发送测试消息

使用"苏苏"账号发送一条**全新的消息**（如 "test123"），观察 Master 日志：

**预期日志**：
```
[data-sync-receiver] info: 🔔 检测到新私信: 757248209210
[data-sync-receiver] info: 📤 Broadcasted 1 new message hints for acc-ea866598-ba84-48d9-8f11-1431e5a7d8a4
[im-websocket] info: [IM WS] Broadcasting to 1 monitors: monitor:new_message_hint
```

### 4. 验证 IM 控制台

确认 IM 控制台**自动显示红点提示**，无需手动刷新。

## 技术细节

### 新消息检测逻辑

`detectNewMessages()` 方法通过对比旧数据和新数据的消息 ID 来检测新消息：

```javascript
const oldMessageIds = new Set(
  (Array.isArray(oldMessages) ? oldMessages : Array.from(oldMessages.values()))
    .map(m => m.messageId)
);

for (const message of newMessagesList) {
  if (!oldMessageIds.has(message.messageId) && message.direction !== 'outbound') {
    result.messages.push(message);
    result.hasNew = true;
    logger.debug(`🔔 检测到新私信: ${message.messageId}`);
  }
}
```

**关键条件**：
1. `!oldMessageIds.has(message.messageId)` - 消息 ID 不在旧数据中
2. `message.direction !== 'outbound'` - 排除客服发送的消息

### 为什么重启后没有立即触发广播

Master 重启后：
1. `PersistenceManager` 从数据库加载所有历史数据到 `DataStore`
2. Worker 重新连接后推送完整快照
3. 但快照中的消息都是已存在的历史消息（`oldMessageIds` 已包含）
4. 因此 `detectNewMessages()` 返回 `hasNew: false`

**结论**：必须发送一条**数据库中不存在的全新消息**才能触发广播。

## 相关文件

### Master端
- `packages/master/src/index.js` (第565-567行) - 注入 `imWebSocketServer`
- `packages/master/src/communication/data-sync-receiver.js` (第22-29行, 115-127行) - setter 方法和广播逻辑

### Worker端
- `packages/worker/src/platforms/base/data-pusher.js` - 数据推送器
- `packages/worker/src/platforms/base/worker-bridge.js` - Worker 通信桥接

### 日志文件
- `packages/master/logs/master.log` - Master 运行日志
- `packages/worker/logs/douyin-realtime-monitor.log` - Worker 实时监控日志

## 时间线

- **16:05:28** - Master 重启，成功注入 `imWebSocketServer`
- **16:05:36** - Worker 重新连接
- **16:06:13** - Master 收到多个数据同步消息，但都是历史消息，未触发广播
- **待测试** - 发送全新消息验证广播功能

## 修复状态

- ✅ **已修复**: `DataSyncReceiver` 缺少 `imWebSocketServer` 参数
- ✅ **已验证**: Master 成功注入 `imWebSocketServer`
- ⏳ **待验证**: 发送新消息后广播功能是否正常

---

**最后更新**: 2025-11-14 16:07
**修复人员**: Claude Code
**状态**: 🟡 修复完成，待最终验证
