# MCP 浏览器交互测试指南

## 📋 概述

这份指南说明如何通过 MCP WebSocket 接口与 Worker 启动的浏览器进行交互和测试通信。

## 🚀 快速开始

### 前提条件
- Master 已启动在 DEBUG 模式 (`DEBUG=true npm start`)
- Worker 已自动启动并初始化浏览器
- 浏览器已打开抖音首页
- MCP 服务运行在 http://localhost:9222

### 步骤

#### 1️⃣ 打开测试页面

在浏览器的地址栏中输入：
```
file:///E:/HISCRM-IM-main/packages/worker/src/debug/test-mcp-browser-client.html
```

#### 2️⃣ 连接 MCP

页面加载后会自动尝试连接，或者手动点击 "连接 MCP" 按钮。

你应该看到：
```
✅ WebSocket 已连接!
📤 已发送注册消息: {"type":"register","accountId":"test-account-123",...}
```

#### 3️⃣ 发送测试消息

点击 "发送测试消息" 按钮，浏览器将向 MCP 发送：
```json
{
  "type": "event",
  "accountId": "test-account-123",
  "event": "test_click",
  "content": "这是一个测试消息，代表用户在浏览器中进行了点击操作"
}
```

#### 4️⃣ 发送导航事件（转到私信页面）

点击 "发送导航事件" 按钮，浏览器将：
1. 发送导航事件到 MCP
2. 自动导航到私信页面: `https://creator.douyin.com/creator-micro/data/following/chat`

```json
{
  "type": "event",
  "accountId": "test-account-123",
  "event": "navigation",
  "content": {
    "from": "file:///E:/...",
    "to": "https://creator.douyin.com/creator-micro/data/following/chat",
    "description": "导航到私信页面"
  }
}
```

## 📊 实时监控 MCP

### 查询 MCP 状态

在命令行中运行：
```bash
curl -s "http://127.0.0.1:9222/api/status" | python -m json.tool
```

### 查询 MCP 日志

```bash
curl -s "http://127.0.0.1:9222/api/logs" | python -m json.tool
```

### 实时监控（Windows）

创建 `monitor-mcp.bat` 文件并运行：
```batch
@echo off
:loop
cls
curl -s "http://127.0.0.1:9222/api/status" | python -m json.tool
timeout /t 2
goto loop
```

## 🔍 预期的交互流程

```
浏览器加载测试页面
    ↓
浏览器自动连接到 MCP WebSocket (ws://localhost:9222)
    ↓
浏览器发送注册消息
    ↓
MCP 记录浏览器连接信息
    ↓
用户点击按钮发送测试事件
    ↓
MCP 通过 WebSocket 接收事件
    ↓
MCP 将事件记录到 browserEvents 数组
    ↓
通过 API 查询时显示浏览器事件
```

## ✅ 验证检查清单

- [ ] Master DEBUG 模式启动成功
- [ ] Worker 自动启动
- [ ] 浏览器打开并显示抖音首页
- [ ] 浏览器可以打开测试 HTML 页面
- [ ] 浏览器自动连接到 MCP WebSocket
- [ ] 浏览器成功注册 (见日志)
- [ ] 测试消息成功发送 (见日志)
- [ ] MCP 接收到消息 (curl 查询显示 browserEvents)
- [ ] 浏览器可以导航到新 URL
- [ ] 导航事件被 MCP 接收

## 🐛 故障排除

### 问题: WebSocket 连接失败

**原因**: MCP 服务未运行或端口 9222 被占用

**解决方案**:
```bash
# 检查端口
netstat -ano | findstr :9222

# 如果有进程占用，杀死后重启 Master
```

### 问题: 浏览器显示 "未连接"

**原因**: 浏览器与 MCP 服务之间的网络问题

**解决方案**:
- 确保在浏览器中打开测试页面 (file:// URL)
- 检查 MCP 服务是否正常运行
- 查看浏览器控制台 (F12) 获取详细错误信息

### 问题: MCP API 无响应

**原因**: Master 或 Worker 进程已停止

**解决方案**:
```bash
# 重启 Master
cd packages/master
DEBUG=true npm start
```

## 📝 MCP API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 获取 HTML 监控面板 |
| `/api/status` | GET | 获取 Worker 和浏览器状态 |
| `/api/logs` | GET | 获取 MCP 日志 |
| `/api/accounts` | GET | 获取账户信息 |
| `/api/tasks` | GET | 获取任务信息 |
| `/api/performance` | GET | 获取性能指标 |
| `/api/worker-info` | GET | 获取 Worker 信息 |
| `/` (WebSocket) | WS | 浏览器消息接收 |

## 🎯 测试场景

### 场景 1: 基本连接测试
1. 打开测试页面
2. 验证自动连接成功
3. 检查 MCP 日志中有注册消息

### 场景 2: 事件发送测试
1. 打开测试页面并连接
2. 点击 "发送测试消息"
3. 查询 MCP `/api/logs` 验证事件被记录

### 场景 3: 导航交互测试
1. 打开测试页面
2. 点击 "发送导航事件"
3. 验证浏览器导航到私信页面
4. 检查 MCP 是否记录导航事件

## 📚 相关文档

- [WORKER-DEBUG-MODE-GUIDE.md](./WORKER-DEBUG-MODE-GUIDE.md) - Worker DEBUG 模式完整指南
- [chrome-devtools-mcp.js](../packages/worker/src/debug/chrome-devtools-mcp.js) - MCP 实现代码

## 🔧 扩展功能

### 添加自定义事件类型

在 `test-mcp-browser-client.html` 中添加新的按钮：

```javascript
function sendCustomEvent() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const msg = {
        type: 'event',
        accountId: accountId,
        event: 'your_event_type',
        content: { /* your data */ }
    };

    ws.send(JSON.stringify(msg));
}
```

### 添加自定义日志类型

在 `chrome-devtools-mcp.js` 的 `handleBrowserMessage()` 中添加：

```javascript
case 'your_event_type':
    // 处理自定义事件
    logger.info('Custom event received', data);
    break;
```

## 💡 建议

1. **开发环境**: 在测试页面中集成更多交互元素来测试各种场景
2. **生产环境**: 在实际浏览器脚本中使用 MCP 来报告执行进度
3. **监控**: 持续监控 MCP 日志来诊断浏览器自动化问题
