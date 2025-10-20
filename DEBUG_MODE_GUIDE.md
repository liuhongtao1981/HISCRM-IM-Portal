# Debug 模式使用指南

本指南说明如何使用 Debug 模式进行开发和调试。Debug 模式提供了实时监控面板、单 Worker 模式和单账户模式。

---

## 🚀 快速开始

### 1. 使用 Debug 模式启动 Master

```bash
# 方式 1: 直接使用 DEBUG 环境变量
DEBUG=true npm run start:master

# 方式 2: 使用 .env.debug 配置文件
npx dotenv -e .env.debug npm run start:master
```

**Debug 模式下 Master 会**:
- ✅ 启用单 Worker 模式 (最多 1 个 Worker)
- ✅ 自动启动 1 个 Worker 进程
- ✅ Worker 会启用 MCP 调试接口
- ✅ 在 localhost:9222 上提供监控面板

### 2. 使用 Debug 模式启动 Worker (独立启动)

```bash
# 方式 1: 直接使用 DEBUG 环境变量
DEBUG=true npm run start:worker

# 方式 2: 使用 .env.debug 配置文件
npx dotenv -e .env.debug npm run start:worker

# 方式 3: 自定义 MCP 端口
DEBUG=true MCP_PORT=9223 npm run start:worker
```

**Debug 模式下 Worker 会**:
- ✅ 启用单账户模式 (最多 1 个账户、1 个浏览器)
- ✅ 显示浏览器窗口 (非 headless 模式)
- ✅ 启用 MCP 调试接口
- ✅ 在指定端口提供实时监控面板

---

## 🔍 实时监控面板

### 访问方式

启动 Worker 后，在浏览器中打开:
```
http://localhost:9222
```

### 监控内容

- **Worker 状态**: Worker ID、运行时间、状态、内存使用
- **账户信息**: 已登录账户数、活跃监控数
- **任务统计**: 活跃任务、已完成、失败任务
- **性能指标**: 内存使用、任务执行时间、爬虫统计
- **实时日志**: 最新 1000 条日志消息

### 功能

- 🔄 自动刷新 (每 2 秒)
- 📊 实时数据更新
- 🎨 深色模式界面
- 📋 RESTful API 接口

---

## 📋 配置选项

### 全局配置

| 变量 | 值 | 说明 |
|------|-----|------|
| `DEBUG` | `true` | 启用 Debug 模式 |
| `DEBUG_MCP` | `true` | 启用 MCP 调试接口 |
| `MCP_PORT` | `9222` | MCP 服务端口 |
| `MCP_HOST` | `localhost` | MCP 服务主机 |

### Worker 配置

| 变量 | 值 | 说明 |
|------|-----|------|
| `DEBUG_HEADLESS` | `false` | 显示浏览器窗口 |
| `DEBUG_VERBOSE` | `true` | 详细日志输出 |
| `DEBUG_LOG_FILE` | `true` | 保存日志到文件 |

### Master 配置

| 变量 | 值 | 说明 |
|------|-----|------|
| `DEBUG_AUTO_START` | `true` | 自动启动 Worker |
| `WORKER_COMMAND` | 自定义 | Worker 启动命令 |

---

## 📚 API 端点

当 MCP 接口启用时，可以通过以下 API 获取实时数据:

### 获取 Worker 状态
```bash
curl http://localhost:9222/api/status
```

响应示例:
```json
{
  "worker": {
    "id": "worker-abc123",
    "startTime": 1697793600000,
    "uptime": 3600000,
    "status": "connected"
  },
  "accounts": [
    {
      "id": "acc-001",
      "monitoring": true,
      "timestamp": 1697793600000
    }
  ],
  "tasks": {
    "active": [],
    "completed": 5,
    "failed": 0
  }
}
```

### 获取账户列表
```bash
curl http://localhost:9222/api/accounts
```

### 获取任务列表
```bash
curl http://localhost:9222/api/tasks
```

### 获取性能数据
```bash
curl http://localhost:9222/api/performance
```

### 获取日志
```bash
# 获取所有日志
curl http://localhost:9222/api/logs

# 按级别过滤 (info, warn, error, debug)
curl http://localhost:9222/api/logs?level=error

# 清除日志
curl -X DELETE http://localhost:9222/api/logs
```

---

## 🎯 常见使用场景

### 场景 1: 调试单个私信爬虫

```bash
# 终端 1: 启动 Master
DEBUG=true npm run start:master

# 终端 2: 监控 Worker (会自动打开)
# 打开浏览器访问 http://localhost:9222

# Master 会自动启动一个 Worker，你可以在 Master 中:
# 1. 登录一个账户
# 2. 分配账户给 Worker
# 3. 在监控面板观察爬虫行为
```

### 场景 2: 调试独立 Worker

```bash
# 终端 1: 启动独立 Master (不需要 Worker)
npm run start:master

# 终端 2: 启动 Worker (Debug 模式)
DEBUG=true npm run start:worker

# 浏览器:
# 1. 打开 http://localhost:9222 (Worker 监控面板)
# 2. 在 Master 中添加和分配账户
# 3. 观察 Worker 的行为
```

### 场景 3: 多个不同端口的 Worker

```bash
# 终端 1: 启动 Master
DEBUG=true npm run start:master

# 终端 2: Worker 1 (端口 9222)
DEBUG=true npm run start:worker

# 终端 3: Worker 2 (端口 9223)
DEBUG=true MCP_PORT=9223 npm run start:worker

# 浏览器:
# Worker 1: http://localhost:9222
# Worker 2: http://localhost:9223
```

---

## 📖 Debug 模式特性

### Worker Debug 特性

- 🔍 **MCP 监控面板**: 实时查看 Worker 运行状态
- 🖥️ **非 Headless 浏览器**: 可以看到浏览器自动化操作
- 📊 **详细日志**: 所有操作都有日志记录
- ⏱️ **长监控间隔**: 60 秒 (便于观察)
- 🔧 **开发者工具**: 浏览器启用开发者工具

### Master Debug 特性

- 🎯 **单 Worker 模式**: 只启动 1 个 Worker
- 🚀 **自动启动 Worker**: Master 启动时自动启动 Worker
- 📱 **单账户模式**: 每个 Worker 最多 1 个账户
- 💗 **快速心跳**: 5 秒检查一次 Worker 状态
- 📝 **详细日志**: 所有交互都有日志

---

## 🐛 调试技巧

### 1. 查看 Browser DevTools

Debug 模式下浏览器窗口会打开，你可以直接用 Browser DevTools 查看:
- DOM 结构
- Network 请求
- Console 日志
- 执行脚本

### 2. 监控日志

通过 MCP 接口 `/api/logs` 获取实时日志:
```bash
# 持续监控日志
watch -n 2 "curl -s http://localhost:9222/api/logs | jq '.logs[-10:]'"
```

### 3. 分析性能

访问 `/api/performance` 查看:
- 内存使用
- 任务执行时间
- 爬虫统计

### 4. 测试 API

使用 API 端点直接测试:
```bash
# 获取完整状态
curl http://localhost:9222/api/status | jq

# 监控特定账户
curl http://localhost:9222/api/accounts | jq '.accounts'

# 查看失败任务
curl http://localhost:9222/api/tasks | jq '.failed'
```

---

## ⚙️ 高级配置

### 自定义 .env.debug

创建 `.env.debug` 文件来设置所有参数:

```bash
DEBUG=true
DEBUG_MCP=true
MCP_PORT=9222
DEBUG_HEADLESS=false
DEBUG_VERBOSE=true
MASTER_HOST=localhost
MASTER_PORT=3000
WORKER_PORT=4000
```

然后使用:
```bash
npx dotenv -e .env.debug npm run start:master
npx dotenv -e .env.debug npm run start:worker
```

### 自定义 Worker 启动

修改 `.env.debug` 中的 `WORKER_COMMAND`:

```bash
# 使用特定的 npm 脚本
WORKER_COMMAND=npm run start:worker:debug

# 使用 Node 直接启动
WORKER_COMMAND=node packages/worker/src/index.js
```

---

## 📞 故障排除

### 问题: MCP 端口被占用

```bash
# 使用不同的端口
DEBUG=true MCP_PORT=9223 npm run start:worker
```

### 问题: Worker 不自动启动

检查 Master 日志:
```bash
# Master 日志中应该有 "Starting worker process"
# 如果没有，检查是否设置了 DEBUG_AUTO_START=true
```

### 问题: 浏览器窗口不显示

确保 `DEBUG_HEADLESS=false`:
```bash
DEBUG=true DEBUG_HEADLESS=false npm run start:worker
```

### 问题: 监控面板数据不更新

检查:
1. MCP 接口是否启用: `curl http://localhost:9222/`
2. Worker 是否正常运行: 查看 Worker 日志
3. 端口是否正确: 检查 MCP_PORT 设置

---

## 🎓 学习资源

- 查看 [Chrome DevTools 调试指南](https://developer.chrome.com/docs/devtools/)
- 了解 [Playwright 自动化](https://playwright.dev/)
- 学习 [事件驱动调试](https://nodejs.org/en/docs/guides/debugging-getting-started/)

---

## 📝 日志级别

Debug 模式下日志级别设为 `debug`，包含:

- 🔵 **DEBUG**: 详细的调试信息
- 🟢 **INFO**: 一般信息
- 🟡 **WARN**: 警告信息
- 🔴 **ERROR**: 错误信息

---

**更新于**: 2025-10-20
**版本**: 1.0
