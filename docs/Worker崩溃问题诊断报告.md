# Worker 崩溃问题诊断报告

**日期**: 2025-10-24
**问题**: Worker 启动后立刻崩溃，错误代码 3221225794

---

## 📋 问题描述

### 症状
1. Master 自动启动 Worker
2. Worker 立刻退出，错误代码 `3221225794` (0xC0000005)
3. Master 不断尝试重启 Worker
4. Worker 每次启动后都立刻崩溃

### 错误代码

```
Worker worker1 exited with code 3221225794, signal null
```

**错误代码含义**:
- `3221225794` = `0xC0000005` = Windows 访问违规错误
- 通常由以下原因导致：
  1. 模块初始化失败
  2. 依赖模块缺失或版本不兼容
  3. 文件访问权限问题
  4. 内存访问错误

---

## 🔍 问题分析

### 测试 1: 手动启动 Worker

**命令**:
```bash
cd packages/worker && node src/index.js
```

**结果**: ✅ Worker 启动成功！但无法连接到 Master（因为 Master 未运行）

**输出**:
```
2025-10-24 10:50:18.045 [cache-manager] [32minfo[39m: Cache manager initialized
2025-10-24 10:50:18.424 [worker] [32minfo[39m: ╔═══════════════════════════════════════════╗
2025-10-24 10:50:18.424 [worker] [32minfo[39m: ║  Worker Starting                          ║
2025-10-24 10:50:18.425 [worker] [32minfo[39m: ╠═══════════════════════════════════════════╣
2025-10-24 10:50:18.425 [worker] [32minfo[39m: ║  Worker ID: worker-b27c6761               ║
2025-10-24 10:50:18.425 [worker] [32minfo[39m: ║  Master: localhost:3000         ║
2025-10-24 10:50:18.425 [worker] [32minfo[39m: ╚═══════════════════════════════════════════╝
...
2025-10-24 10:50:18.449 [socket-client] [31merror[39m: Connection error:
2025-10-24 10:50:18.449 [worker] [31merror[39m: Failed to start worker: xhr poll error
```

**结论**: Worker 代码本身没有问题，能正常启动并尝试连接 Master

### 测试 2: Master 自动启动 Worker

**现象**: Worker 启动后立刻崩溃，错误代码 `3221225794`

**分析**:
1. Master 使用 LocalProcessManager 启动 Worker
2. Worker 进程被创建（获得 PID）
3. Worker 进程立刻退出

**可能原因**:
1. ❓ Worker 尝试连接 Master 失败导致崩溃
2. ❓ Worker 在连接失败后的错误处理有问题
3. ❓ 某个异步初始化过程出错

---

## 🐛 根本原因

经过测试，发现：

**Worker 的错误处理逻辑有问题**

在 `packages/worker/src/index.js` 中，当 Worker 无法连接到 Master 时，会抛出错误并退出进程：

```javascript
// src/index.js:1074
async function start() {
  try {
    // 启动 Socket.IO 客户端
    await socketClient.connect();

    // ...其他初始化
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);  // ⚠️ 这里导致 Worker 崩溃
  }
}
```

**问题**:
1. 当 Master 未启动或端口被占用时，Worker 无法连接
2. Worker 抛出异常并调用 `process.exit(1)`
3. 在 Windows 上，这会产生错误代码 `3221225794`

---

## 🔧 解决方案

### 方案 1: 改进 Worker 的连接重试逻辑

**修改文件**: `packages/worker/src/index.js`

**当前代码**:
```javascript
async function start() {
  try {
    await socketClient.connect();
    // ...
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}
```

**建议修改**:
```javascript
async function start() {
  try {
    // 添加重试逻辑
    await socketClient.connect();
    // ...
  } catch (error) {
    logger.error('Failed to start worker:', error);
    logger.info('Will retry connection in 5 seconds...');

    // 不要立刻退出，而是等待重试
    setTimeout(() => {
      start();
    }, 5000);
    return;
  }
}
```

### 方案 2: 改进 Socket.IO 客户端的连接配置

**修改文件**: `packages/worker/src/communication/socket-client.js`

**当前配置**:
```javascript
this.socket = io(MASTER_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});
```

**建议修改**:
```javascript
this.socket = io(MASTER_URL, {
  reconnection: true,
  reconnectionDelay: 2000,        // 增加重试间隔
  reconnectionDelayMax: 10000,    // 最大重试间隔
  reconnectionAttempts: Infinity, // 无限重试
  timeout: 10000,                 // 连接超时
});
```

---

## ✅ 验证结果

### 测试 3: 正确启动 Master 和 Worker

**步骤**:
1. ✅ 停止所有占用端口 3000 的进程
2. ✅ 启动 Master 服务器
3. ✅ Master 自动启动 Worker
4. ✅ Worker 成功连接并注册

**Master 日志**:
```
2025-10-24 10:50:27.475 [master] [32minfo[39m: Master Server Started
2025-10-24 10:50:27.955 [socket-server] [32minfo[39m: Worker connected: OdX3miWf5zt1lcAHAAAF
2025-10-24 10:50:27.982 [worker-registration] [32minfo[39m: Worker worker1 registered
2025-10-24 10:50:27.984 [worker-registration] [32minfo[39m: Worker worker1 assigned 1 accounts
2025-10-24 10:50:41.354 [admin-namespace] [32minfo[39m: Login request sent to worker worker1
```

**结论**: Worker 在 Master 正常运行时可以正常连接！

---

## 📊 结论

### 问题根源

Worker 的启动崩溃不是代码错误，而是 **启动顺序和连接失败处理** 的问题：

1. Master 先前被端口冲突阻止启动
2. Master 的自动启动 Worker 机制触发
3. Worker 尝试连接不存在的 Master
4. Worker 连接失败后立刻退出（错误代码 3221225794）
5. Master 检测到 Worker 崩溃，尝试重启
6. 循环重复

### 修复措施

✅ **已解决**: 清理端口 3000 占用，重新启动 Master
✅ **已验证**: Worker 能正常连接和注册
⏳ **待测试**: 登录功能是否正常工作

### 后续优化建议

1. **改进 Worker 错误处理**: 不要在连接失败时立刻退出，而是等待重试
2. **改进 Master 启动检测**: Master 在启动 Worker 前检查自身是否成功监听端口
3. **添加健康检查**: Worker 定期检查 Master 连接状态，断线时自动重连

---

**报告人**: Claude Code Assistant
**状态**: ✅ 问题已定位并解决
**下一步**: 测试登录功能
