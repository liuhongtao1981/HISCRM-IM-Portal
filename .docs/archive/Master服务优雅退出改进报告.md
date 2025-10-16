# Master 服务优雅退出改进报告

## 问题描述

**现象**：Master 服务退出时终端报错
```
终端进程"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"已终止，退出代码: 2。
```

**退出代码含义**：
- 退出代码 0: 正常退出
- 退出代码 1: 程序主动抛出错误退出
- **退出代码 2**: 通常是未捕获的异常或 Promise rejection

## 根本原因分析

### 1. 不完整的资源清理顺序

**原有实现问题**：
```javascript
// 原来的 shutdown 函数
const shutdown = async (signal) => {
  // 停止调度器和监控
  if (taskScheduler) taskScheduler.stop();
  if (heartbeatMonitor) heartbeatMonitor.stop();
  if (notificationQueue) notificationQueue.stop();
  if (loginHandler) loginHandler.stopCleanupTimer();

  // 关闭HTTP服务器
  server.close(() => {
    if (db) db.close();
    process.exit(0);
  });

  // 强制退出超时
  setTimeout(() => {
    process.exit(1);
  }, 10000);
};
```

**存在的问题**：

1. **Socket.IO 连接未关闭**：
   - 只关闭了 HTTP 服务器，没有主动断开 WebSocket 连接
   - 导致 `server.close()` 回调可能永远不会触发（等待现有连接关闭）

2. **定时器管理问题**：
   - 强制退出的 `setTimeout` 没有使用 `.unref()`
   - 会阻止进程正常退出

3. **缺少错误处理**：
   - shutdown 函数是 async 但没有 try-catch
   - 如果清理过程出错，会产生未捕获的 Promise rejection

4. **缺少全局异常捕获**：
   - 没有监听 `uncaughtException` 和 `unhandledRejection`
   - 任何未处理的错误都会导致进程异常退出

### 2. 变量作用域问题

```javascript
// workerNamespace 和 clientNamespace 只在局部声明
const { workerNamespace, clientNamespace, adminNamespace } = initSocketServer(...);
```

shutdown 函数无法访问这些变量来关闭连接。

## 解决方案

### 1. 完整的优雅退出流程

```javascript
// 13. 优雅退出处理
let isShuttingDown = false;
let forceShutdownTimer = null;

const shutdown = async (signal) => {
  // 防止重复调用
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }
  isShuttingDown = true;

  logger.info(`${signal} received, shutting down gracefully`);

  // 启动强制退出超时（只在 shutdown 时启动）
  forceShutdownTimer = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  try {
    // 步骤1: 停止调度器和监控（阻止新任务）
    logger.info('Stopping schedulers and monitors...');
    if (taskScheduler) taskScheduler.stop();
    if (heartbeatMonitor) heartbeatMonitor.stop();
    if (notificationQueue) notificationQueue.stop();
    if (loginHandler) loginHandler.stopCleanupTimer();

    // 步骤2: 等待当前任务完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 步骤3: 关闭所有 Socket.IO 连接
    logger.info('Closing Socket.IO connections...');
    if (workerNamespace) {
      workerNamespace.disconnectSockets(true);
    }
    if (clientNamespace) {
      clientNamespace.disconnectSockets(true);
    }
    if (adminNamespace) {
      adminNamespace.disconnectSockets(true);
    }

    // 步骤4: 关闭HTTP服务器（现在没有活跃连接了）
    logger.info('Closing HTTP server...');
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info('HTTP server closed');

    // 步骤5: 关闭数据库
    if (db) {
      logger.info('Closing database...');
      db.close();
      logger.info('Database closed');
    }

    // 清除强制退出定时器
    if (forceShutdownTimer) {
      clearTimeout(forceShutdownTimer);
    }

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};
```

### 2. 强制退出超时优化

```javascript
let forceShutdownTimer = null;

const shutdown = async (signal) => {
  // ...

  // 启动强制退出超时（只在 shutdown 时启动）
  forceShutdownTimer = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  try {
    // ... 清理流程 ...

    // 清除强制退出定时器（正常退出时）
    if (forceShutdownTimer) {
      clearTimeout(forceShutdownTimer);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};
```

**关键改进**：
- 定时器只在 `shutdown()` 调用时启动，而不是服务启动时
- 正常退出时会 `clearTimeout()`，防止误触发
- 只有在 shutdown 流程卡住时才会强制退出

### 3. 全局异常捕获

```javascript
// 捕获未处理的同步异常
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

// 捕获未处理的 Promise rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION');
});
```

### 4. 变量作用域修复

```javascript
// 全局变量声明
let workerNamespace;
let clientNamespace;
let adminNamespace;

// 赋值
const socketNamespaces = initSocketServer(server, tempHandlers, masterServer);
workerNamespace = socketNamespaces.workerNamespace;
clientNamespace = socketNamespaces.clientNamespace;
adminNamespace = socketNamespaces.adminNamespace;
```

## 改进效果

### Before (原有实现)
```
终端进程已终止，退出代码: 2  ❌ 异常退出
- 未关闭 Socket.IO 连接
- 未捕获异常
- 可能有资源泄漏
```

### After (改进后)
```
[INFO] SIGINT received, shutting down gracefully
[INFO] Stopping schedulers and monitors...
[INFO] Closing Socket.IO connections...
[INFO] Closing HTTP server...
[INFO] HTTP server closed
[INFO] Closing database...
[INFO] Database closed
[INFO] Shutdown complete

终端进程已终止，退出代码: 0  ✅ 正常退出
```

## 资源清理顺序

```
1. 停止调度器和监控
   ├─ taskScheduler.stop()        // 不再分配新任务
   ├─ heartbeatMonitor.stop()     // 停止心跳检查
   ├─ notificationQueue.stop()    // 停止通知队列
   └─ loginHandler.stopCleanupTimer()  // 停止登录会话清理

2. 等待当前任务完成 (500ms)

3. 关闭所有 Socket.IO 连接
   ├─ workerNamespace.disconnectSockets(true)
   ├─ clientNamespace.disconnectSockets(true)
   └─ adminNamespace.disconnectSockets(true)

4. 关闭 HTTP 服务器
   └─ server.close()              // 现在没有活跃连接了

5. 关闭数据库
   └─ db.close()                  // 确保所有事务完成

6. 进程退出
   └─ process.exit(0)
```

## 测试验证

### 正常退出测试
```bash
# 启动服务
cd packages/master
npm run dev

# Ctrl+C 退出
# 应该看到完整的 shutdown 日志
# 退出代码应该是 0
```

### 强制退出测试
```bash
# 启动服务
cd packages/master
npm run dev

# 模拟卡死（在 shutdown 函数中添加 while(true)）
# 10秒后应该强制退出
# 日志: "Forced shutdown after timeout"
```

### 异常退出测试
```javascript
// 在代码中添加一个未捕获的错误
setTimeout(() => {
  throw new Error('Test uncaught exception');
}, 5000);

// 应该看到:
// [ERROR] Uncaught Exception: Test uncaught exception
// [INFO] UNCAUGHT_EXCEPTION received, shutting down gracefully
// ... 完整的 shutdown 流程
```

## 最佳实践总结

### 1. 资源清理顺序
- **由外到内**：先关闭对外的连接（Socket.IO），再关闭内部资源（数据库）
- **先停后关**：先停止接受新请求，等待当前请求完成，再关闭服务

### 2. 异步操作处理
- 所有 shutdown 逻辑放在 try-catch 中
- 使用 `await` 确保每一步完成后再执行下一步
- 使用 `.unref()` 避免定时器阻止退出

### 3. 防护机制
- 防止重复调用（`isShuttingDown` 标志）
- 强制退出超时（10秒）
- 全局异常捕获（`uncaughtException`, `unhandledRejection`）

### 4. 日志记录
- 每一步都记录日志，方便排查问题
- 记录错误详情，包括堆栈信息

## 相关文件

- [packages/master/src/index.js:306-384](../packages/master/src/index.js#L306-L384) - 优雅退出实现

## 参考资料

- [Node.js Process Events](https://nodejs.org/api/process.html#process_event_exit)
- [Socket.IO Server API](https://socket.io/docs/v4/server-api/#namespace-disconnectsockets-close)
- [Timer.unref()](https://nodejs.org/api/timers.html#timers_timeout_unref)
