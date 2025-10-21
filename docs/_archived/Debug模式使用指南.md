# Debug 模式使用指南

本指南说明如何使用 Debug 模式进行开发和调试。Debug 模式提供了实时监控面板、单 Worker 模式和单账户模式。

---

## 🚀 快速开始

### 1. 使用 Debug 模式启动 Worker

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

---

## 📚 API 端点

当 MCP 接口启用时，可以通过以下 API 获取实时数据:

### 获取 Worker 状态
```bash
curl http://localhost:9222/api/status
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

### 场景 1: 调试单个爬虫

```bash
# 终端 1: 启动 Worker (Debug 模式)
DEBUG=true npm run start:worker

# 浏览器: 打开监控面板
http://localhost:9222

# 在 Master 中添加和分配账户
# 在监控面板观察爬虫行为
```

### 场景 2: 多个不同端口的 Worker

```bash
# 终端 1: Worker 1 (端口 9222)
DEBUG=true npm run start:worker

# 终端 2: Worker 2 (端口 9223)
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
- 🎯 **单账户模式**: 只初始化第一个账户的浏览器

---

## 🐛 调试技巧

### 1. 查看浏览器窗口

Debug 模式下浏览器窗口会打开，你可以直接观察爬虫操作

### 2. 监控日志

通过 MCP 面板查看实时日志，了解 Worker 的行为

### 3. 分析性能

访问 `/api/performance` 查看内存使用、任务执行时间等

### 4. 测试 API

使用 API 端点直接测试数据

---

## 🎓 实时交互验证方式

### 工作流程

1. **启动 Worker**
   ```bash
   DEBUG=true npm run start:worker
   ```

2. **打开监控面板**
   ```
   http://localhost:9222
   ```

3. **实时交互**
   - 询问 Claude 现在的状态
   - Claude 通过 MCP 面板查看数据
   - Claude 告诉你浏览器现在做什么
   - 基于反馈进行下一步操作

4. **检查问题**
   - 看日志找错误
   - 查看当前状态
   - 验证爬虫行为

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
