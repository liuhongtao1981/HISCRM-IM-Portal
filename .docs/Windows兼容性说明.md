# Master 服务 Windows 优雅退出兼容性说明

## 问题背景

用户报告：在 Windows PowerShell 中退出 Master 服务时，终端显示：
```
终端进程"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"已终止，退出代码: 2。
```

退出代码 2 表示程序异常终止，而不是正常退出（退出代码 0）。

## 根本原因

### Windows 与 Unix 信号处理的差异

1. **Unix/Linux 系统**：
   - `Ctrl+C` 发送 SIGINT 信号
   - `process.on('SIGINT', handler)` 可以正常捕获并处理
   - 允许程序执行清理逻辑后正常退出

2. **Windows 系统**：
   - PowerShell 和 CMD 的 `Ctrl+C` 行为与 Unix 不同
   - Node.js 的 `process.on('SIGINT')` 在 Windows 上可能不会被触发
   - 或者进程在事件处理器执行前就被强制杀死
   - 导致无法执行优雅退出流程

### 测试结果

通过测试脚本 `test_shutdown.js` 发现：
```
Process exited with code: null, signal: SIGINT
❌ Graceful shutdown failed!
```

查看日志文件，**完全没有任何 shutdown 相关的日志**，证明 `shutdown()` 函数根本没有被调用。

## 解决方案

### 使用 `readline` 模块实现跨平台支持

Node.js 的 `readline` 模块提供了跨平台的 SIGINT 事件支持：

```javascript
// 标准的 POSIX 信号处理（Unix/Linux/Mac）
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Windows 兼容性：监听 Ctrl+C
if (process.platform === 'win32') {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('SIGINT', () => {
    logger.info('Received SIGINT from readline (Windows)');
    shutdown('SIGINT (Windows)');
  });
}
```

### 工作原理

1. **Unix/Linux/Mac**：
   - `process.on('SIGINT')` 正常工作
   - readline 不会被初始化（`process.platform !== 'win32'`）

2. **Windows**：
   - 创建 readline 接口连接到 stdin/stdout
   - readline 内部使用 Windows API 监听键盘中断
   - `Ctrl+C` 触发 `rl.on('SIGINT')` 事件
   - 执行优雅退出流程

### 优势

- **跨平台兼容**：同一套代码在所有操作系统上都能正确工作
- **零运行时开销**：只在 Windows 上创建 readline 接口
- **官方支持**：使用 Node.js 内置模块，无需第三方依赖

## 修改文件

### [packages/master/src/index.js:385-397](../packages/master/src/index.js#L385-L397)

添加了 Windows 兼容性代码：
```javascript
// Windows 兼容性：监听 Ctrl+C
if (process.platform === 'win32') {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('SIGINT', () => {
    logger.info('Received SIGINT from readline (Windows)');
    shutdown('SIGINT (Windows)');
  });
}
```

## 预期效果

### 修复前（Windows PowerShell）

```powershell
PS> npm run dev
# ... 服务启动日志 ...
# 按 Ctrl+C
终端进程已终止，退出代码: 2  ❌
```

没有任何优雅退出的日志，数据库连接、Socket.IO 连接等资源未正确释放。

### 修复后（Windows PowerShell）

```powershell
PS> npm run dev
# ... 服务启动日志 ...
# 按 Ctrl+C

2025-10-14 14:00:00.123 [master] info: Received SIGINT from readline (Windows)
2025-10-14 14:00:00.124 [master] info: SIGINT (Windows) received, shutting down gracefully
2025-10-14 14:00:00.125 [master] info: Stopping schedulers and monitors...
2025-10-14 14:00:00.630 [master] info: Closing Socket.IO connections...
2025-10-14 14:00:00.635 [master] info: Closing HTTP server...
2025-10-14 14:00:00.640 [master] info: HTTP server closed
2025-10-14 14:00:00.641 [master] info: Closing database...
2025-10-14 14:00:00.642 [master] info: Database closed
2025-10-14 14:00:00.643 [master] info: Shutdown complete

终端进程已终止，退出代码: 0  ✅
```

完整的优雅退出流程被执行，所有资源正确释放。

## 测试方法

### 方法 1：交互式测试（推荐）

```bash
# 启动服务
cd packages/master
npm run dev

# 等待服务启动完成（看到 "Master Server Started"）
# 按 Ctrl+C
# 观察日志输出
```

**预期结果**：
- 看到完整的 shutdown 日志序列
- 最后显示 "Shutdown complete"
- 终端显示退出代码为 0

### 方法 2：自动化测试

```bash
cd packages/master
node test_shutdown.js
```

**预期结果**：
```
========================================
Process exited with code: 0, signal: null
========================================
✅ Graceful shutdown successful!
```

### 方法 3：查看日志文件

```bash
cd packages/master
# Windows PowerShell
Get-Content logs/master.log -Tail 20

# Unix/Linux
tail -20 logs/master.log
```

**预期包含**：
```json
{"level":"info","message":"SIGINT (Windows) received, shutting down gracefully","service":"master"}
{"level":"info","message":"Stopping schedulers and monitors...","service":"master"}
{"level":"info","message":"Closing Socket.IO connections...","service":"master"}
{"level":"info","message":"Closing HTTP server...","service":"master"}
{"level":"info","message":"HTTP server closed","service":"master"}
{"level":"info","message":"Closing database...","service":"master"}
{"level":"info","message":"Database closed","service":"master"}
{"level":"info","message":"Shutdown complete","service":"master"}
```

## 其他 Windows 注意事项

### nodemon 在 Windows 上的行为

如果使用 nodemon 开发模式（`npm run dev`），在某些情况下 nodemon 可能会拦截 `Ctrl+C` 并直接杀死进程，绕过优雅退出。

**解决方法**：
- 在生产环境使用 `npm start` 而不是 `npm run dev`
- 或者配置 nodemon 传递信号：
  ```json
  // nodemon.json
  {
    "signal": "SIGINT"
  }
  ```

### Windows 服务（后台运行）

如果将 Master 作为 Windows 服务运行（使用 node-windows 或 pm2），确保服务管理器配置了正确的停止信号：

```javascript
// pm2 ecosystem.config.js
module.exports = {
  apps: [{
    name: 'hiscrm-master',
    script: './src/index.js',
    kill_timeout: 12000,  // 给足够时间完成优雅退出（12秒）
    wait_ready: true,
    listen_timeout: 5000
  }]
};
```

## 参考资料

- [Node.js Process Documentation](https://nodejs.org/api/process.html#signal-events)
- [Node.js Readline Documentation](https://nodejs.org/api/readline.html)
- [Windows Signal Handling in Node.js](https://nodejs.org/api/process.html#signal-events)
- [Cross-platform Signal Handling](https://github.com/nodejs/node/issues/15472)

## 相关文件

- [packages/master/src/index.js](../packages/master/src/index.js) - 主要修改
- [.docs/Master服务优雅退出改进报告.md](./Master服务优雅退出改进报告.md) - 完整技术报告
- [packages/master/test_shutdown.js](../packages/master/test_shutdown.js) - 自动化测试脚本
