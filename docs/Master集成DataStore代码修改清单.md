# Master 集成 DataStore 代码修改清单

**目标**: 将 DataStore 和 DataSyncReceiver 集成到 Master 主程序

---

## 修改文件: packages/master/src/index.js

### 1. 添加依赖导入（第46行附近）

```javascript
// 在现有导入后添加
const DataStore = require('./data/data-store');
const DataSyncReceiver = require('./communication/data-sync-receiver');
const { WORKER_DATA_SYNC } = require('@hiscrm-im/shared/protocol/messages');
```

### 2. 添加全局变量（第150行附近）

```javascript
// 在现有全局变量后添加
let dataStore;
let dataSyncReceiver;
```

### 3. 在 start() 函数中初始化（第456行附近 - 数据库初始化后）

```javascript
// 1. 初始化数据库
db = initDatabase(DB_PATH);
logger.info('Database initialized');

// 1.5 初始化 DataStore (内存数据存储)
dataStore = new DataStore();
logger.info('DataStore initialized');

// 1.6 初始化 DataSyncReceiver
dataSyncReceiver = new DataSyncReceiver(dataStore);
logger.info('DataSyncReceiver initialized');
```

### 4. 在 temp Handlers 中添加数据同步处理器（第475行附近）

```javascript
let tempHandlers = {
  [WORKER_REGISTER]: (socket, msg) => workerRegistry.handleRegistration(socket, msg),
  [WORKER_HEARTBEAT]: (socket, msg) => heartbeatMonitor.handleHeartbeat(socket, msg),
  [WORKER_MESSAGE_DETECTED]: (socket, msg) => messageReceiver.handleMessageDetected(socket, msg),
  [WORKER_ACCOUNT_STATUS]: (socket, msg) => handleAccountStatus(socket, msg),
  [WORKER_DATA_SYNC]: (socket, msg) => dataSyncReceiver.handleWorkerDataSync(socket, msg),  // ✨ 新增
  [CLIENT_SYNC_REQUEST]: (socket, msg) => handleClientSync(socket, msg),
  // ... 其他处理器
};
```

### 5. 在 API 路由初始化中传递 dataStore（寻找 createIMRouter 的位置）

```javascript
// 修改前（假设在某处）
const createIMRouter = require('./api/routes/im');
app.use('/api/im', createIMRouter(db));

// 修改后
const createIMRouter = require('./api/routes/im');
app.use('/api/im', createIMRouter(db, dataStore));  // ✨ 新增 dataStore 参数
```

### 6. 添加 DataStore 状态到 /api/v1/status 端点（第152行附近）

```javascript
app.get('/api/v1/status', (req, res) => {
  const workerStats = heartbeatMonitor ? heartbeatMonitor.getStats() : {};
  const schedulingStats = taskScheduler ? taskScheduler.getSchedulingStats() : {};
  const sessionStats = sessionManager ? sessionManager.getStats() : {};
  const queueStats = notificationQueue ? notificationQueue.getStats() : {};
  const broadcasterStats = notificationBroadcaster ? notificationBroadcaster.getStats() : {};
  const dataStoreStats = dataStore ? dataStore.getStats() : {};  // ✨ 新增
  const dataSyncStats = dataSyncReceiver ? dataSyncReceiver.getStats() : {};  // ✨ 新增

  res.json({
    success: true,
    data: {
      version: '1.0.0',
      uptime: process.uptime(),
      workers: workerStats,
      scheduling: schedulingStats,
      clients: sessionStats,
      notifications: {
        queue: queueStats,
        broadcaster: broadcasterStats,
      },
      dataStore: dataStoreStats,  // ✨ 新增
      dataSync: dataSyncStats,  // ✨ 新增
    },
  });
});
```

---

## 完整初始化顺序

```javascript
async function start() {
  try {
    // 0. Debug配置
    if (debugConfig.enabled) {
      debugConfig.print();
    }

    // 1. 初始化数据库
    db = initDatabase(DB_PATH);
    logger.info('Database initialized');

    // 1.5 ✨ 初始化 DataStore
    dataStore = new DataStore();
    logger.info('DataStore initialized');

    // 1.6 ✨ 初始化 DataSyncReceiver
    dataSyncReceiver = new DataSyncReceiver(dataStore);
    logger.info('DataSyncReceiver initialized');

    // 2. 初始化Worker注册表
    workerRegistry = new WorkerRegistry(db);
    logger.info('Worker registry initialized');

    // 3. 初始化客户端会话管理器
    sessionManager = new SessionManager(db);
    logger.info('Session manager initialized');

    // 4. 创建 masterServer 对象
    const masterServer = { db, dataStore };  // ✨ 添加 dataStore

    // 4.1 初始化 Socket.IO 服务器
    let tempHandlers = {
      [WORKER_REGISTER]: (socket, msg) => workerRegistry.handleRegistration(socket, msg),
      [WORKER_HEARTBEAT]: (socket, msg) => heartbeatMonitor.handleHeartbeat(socket, msg),
      [WORKER_MESSAGE_DETECTED]: (socket, msg) => messageReceiver.handleMessageDetected(socket, msg),
      [WORKER_ACCOUNT_STATUS]: (socket, msg) => handleAccountStatus(socket, msg),
      [WORKER_DATA_SYNC]: (socket, msg) => dataSyncReceiver.handleWorkerDataSync(socket, msg),  // ✨ 新增
      [CLIENT_SYNC_REQUEST]: (socket, msg) => handleClientSync(socket, msg),
      onWorkerDisconnect: (socket) => workerRegistry.handleDisconnect(socket),
      onClientConnect: (socket) => handleClientConnect(socket),
      onClientDisconnect: (socket) => handleClientDisconnect(socket),
      onReplyResult: (data, socket) => handleReplyResult(data, socket),
    };

    const socketNamespaces = initSocketServer(
      server,
      tempHandlers,
      masterServer,
      sessionManager
    );

    // ... 其余初始化代码
  }
}
```

---

## 验证步骤

1. **启动 Master**
   ```bash
   npm run start:master
   ```

2. **检查日志** - 应该看到：
   ```
   Database initialized
   DataStore initialized
   DataSyncReceiver initialized
   ```

3. **检查状态端点**
   ```bash
   curl http://localhost:3000/api/v1/status
   ```

   应该返回：
   ```json
   {
     "success": true,
     "data": {
       "dataStore": {
         "totalAccounts": 0,
         "totalComments": 0,
         "totalContents": 0,
         ...
       },
       "dataSync": {
         "totalReceived": 0,
         "lastReceiveTime": null,
         ...
       }
     }
   }
   ```

4. **启动 Worker 并观察数据同步**
   ```bash
   npm run start:worker
   ```

   应该在 Master 日志中看到：
   ```
   📥 Receiving data sync from worker-1
   ✅ Data sync completed for acc-xxx
   ```

---

## 下一步

完成此集成后，需要修改 IM 接口使用 DataStore，具体参见：
- [修改IM会话接口](./修改IM会话接口使用DataStore.md)
- [修改IM私信接口](./修改IM私信接口使用DataStore.md)
- [修改IM作品接口](./修改IM作品接口使用DataStore.md)
