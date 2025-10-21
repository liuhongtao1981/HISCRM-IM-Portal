# Master/Worker DEBUG 模式 - 浏览器直连调试指南

## 🎯 概述

这是一个**一键启动**的调试系统，让你可以实时看到Worker中的浏览器在做什么。

Master DEBUG模式会自动启动DEBUG模式的Worker，包括浏览器直连MCP调试面板。

### 特点

✨ **零配置** - 直接运行脚本即可启用
✨ **一键启动** - Master和Worker同时启动
✨ **浏览器直连** - 浏览器通过WebSocket直接连接MCP调试面板
✨ **实时监控** - 看到回复、DOM查找、消息定位等所有事件
✨ **DEBUG专用** - 正常生产模式不受影响

---

## 🚀 快速启动（推荐 - Master DEBUG模式）

### 方式一：Master DEBUG 模式（推荐 ⭐）

启动Master，它会自动启动DEBUG模式的Worker

#### Windows 用户

双击运行：
```
packages/master/start-debug.bat
```

或在PowerShell中：
```powershell
cd packages/master
.\start-debug.bat
```

#### Mac/Linux 用户

```bash
cd packages/master
chmod +x start-debug.sh
./start-debug.sh
```

#### 或手动启动

```bash
cd packages/master
DEBUG=true npm run start:master
```

---

## 🚀 快速启动（替代方案 - 仅Worker DEBUG）

如果只想启动Worker调试（Master已在运行）

### Windows 用户

```
packages/worker/start-debug.bat
```

### Mac/Linux 用户

```bash
cd packages/worker
./start-debug.sh
```

### 或手动启动

```bash
cd packages/worker
DEBUG=true DEBUG_HEADLESS=false node src/index.js
```

---

## 📊 启动后你会看到什么

### 1️⃣ Worker 启动日志

```
╔═══════════════════════════════════════════╗
║         🔍 DEBUG MODE ENABLED             ║
╠═══════════════════════════════════════════╣
║ MCP 接口: ✅ 启用 (端口 9222)
║ 单账户模式: ✅ 启用 (最多 1 个)
║ Headless: ✅ 禁用 (显示浏览器窗口)
║ 日志级别: debug
║ 监控间隔: 60 秒
╚═══════════════════════════════════════════╝

✅ Chrome DevTools MCP 调试接口启动成功
   workerId: worker1
   httpUrl: http://localhost:9222/
   wsUrl: ws://localhost:9222/
```

### 2️⃣ 打开浏览器看调试面板

在浏览器中打开：

```
http://localhost:9222/
```

你会看到：
- Worker 实时状态
- 任务监控面板
- 内存使用情况
- 实时日志流

### 3️⃣ 浏览器窗口会自动出现

当Worker启动浏览器进行回复时：
- 会看到一个显示的浏览器窗口（因为 `DEBUG_HEADLESS=false`）
- 浏览器自动连接到MCP调试面板
- 浏览器的所有操作都会实时显示在日志中

---

## 🔍 调试回复功能（完整流程）

### 步骤1：启动 Master 和 Worker（DEBUG模式）

只需一个命令，Master会自动启动DEBUG模式的Worker！

#### Windows
```bash
packages/master/start-debug.bat
```

#### Mac/Linux
```bash
cd packages/master
./start-debug.sh
```

或手动启动：
```bash
cd packages/master
DEBUG=true npm run start:master
```

然后在另一个终端：
```bash
cd packages/worker
npm run start:worker  # Worker 会自动以 DEBUG 模式启动
```

**你会看到：**
- Master 启动日志
- Master DEBUG MODE 信息
- Worker 自动启动信息
- Worker DEBUG MODE 信息
- MCP 服务启动成功信息

### 步骤2：打开MCP监控面板

在浏览器打开：
```
http://localhost:9222/
```

你会看到：
- Worker 实时状态
- 任务监控面板
- 内存使用情况
- 实时日志流（包括浏览器事件）

### 步骤3：提交回复请求

在第三个终端运行测试脚本：
```bash
cd packages/master/src/tests
node test-dm-reply-api.js
```

### 步骤4：观察实时日志

在MCP监控面板中，实时查看：

1. **Worker 状态卡片**
   ```
   Worker ID: worker1
   运行时间: 0h 2m 15s
   状态: running
   内存使用: 185.45 MB
   ```

2. **任务统计卡片**
   ```
   活跃任务: 1
   已完成: 2
   失败任务: 0
   ```

3. **浏览器事件日志**
   ```
   [2025-10-20 23:15:30] 🔗 浏览器已连接到MCP调试接口
   [2025-10-20 23:15:31] [浏览器事件] virtual_list_search
   [2025-10-20 23:15:32] [浏览器事件] message_located
   [2025-10-20 23:15:33] [浏览器事件] reply_submitted
   [2025-10-20 23:15:34] 🔌 浏览器已断开连接
   ```

---

## 📝 关键日志说明

当执行回复任务时，你会看到这些关键日志：

### 标记 ✨ 成功的回复流程

```
✅ [task-runner] Running reply task for account xxx

🔗 浏览器已连接到MCP调试接口
   browserId: browser_1729449330xxx

[Douyin] 为回复任务开启新浏览器标签页
[Douyin] 标签页导航到: https://www.douyin.com/...
[Douyin] 回复文本框已定位
   selector: [contenteditable="true"]
   xpath: /div[1]/div[2]/textarea

[浏览器事件] dom_inspection
   selector: [contenteditable="true"]
   found: true

[浏览器事件] virtual_list_search
   queryId: 7437896255660017187
   found: true
   matchType: tier2b (React Fiber提取)

[Douyin] 正在输入回复内容
[浏览器事件] reply_submitted
   messageId: 7437896255660017187
   contentLength: 20

[Douyin] 点击发送按钮
[Douyin] 回复任务标签页已关闭

🔌 浏览器已断开连接

✅ [task-runner] Reply task completed successfully
```

### 标记 ❌ 问题的日志

如果看到这些，说明有问题：

```
❌ [Douyin] 为回复任务开启新浏览器标签页 FAILED
   ↳ 问题: Worker没有收到回复任务

❌ [Douyin] 回复文本框已定位 FAILED
   ↳ 问题: DOM选择器可能过期

❌ [浏览器事件] virtual_list_search
   found: false
   ↳ 问题: ID匹配失败

❌ 点击发送按钮 FAILED
   ↳ 问题: 按钮选择器改变
```

---

## 🛠️ 调试技巧

### 技巧1：检查虚拟列表ID匹配

在日志中查找 `matchType`：

```
matchType: tier1  → 精确内容匹配 ✅
matchType: tier2a → 直接HTML匹配 ✅
matchType: tier2b → React Fiber提取 ✅
matchType: tier2c → 内容哈希匹配 ✅
matchType: tier3  → 发送者+时间模糊匹配 ⚠️
matchType: tier4  → 索引位置回退 ⚠️
matchType: null   → 所有匹配都失败 ❌
```

### 技巧2：观察浏览器窗口

因为启用了非headless模式，你可以：
- 看到网页加载过程
- 看到文本输入
- 看到按钮点击
- 看到标签页打开关闭

### 技巧3：清除日志重新测试

在MCP面板点击"清除日志"按钮，然后再次提交回复请求。这样可以集中看新的日志。

### 技巧4：检查内存泄漏

如果"内存使用"不断增长（从100MB增长到500MB+），说明可能有内存泄漏。

---

## 🔐 重要提醒

### DEBUG模式的限制

- ✅ 只监控1个账户（`singleAccount.maxAccounts: 1`）
- ✅ 只启动1个浏览器（`maxBrowsersPerWorker: 1`）
- ✅ 禁用headless（显示浏览器窗口）
- ⚠️ 性能会降低（为了便于观察）

### 不要在生产环境启用

```bash
# ❌ 错误
DEBUG=true npm run start:worker  # 在生产环境

# ✅ 正确
npm run start:worker  # 正常生产模式
```

---

## 🎮 交互操作

在MCP面板中你可以：

- **刷新数据按钮** - 立即刷新所有状态
- **清除日志按钮** - 清空日志列表（便于重新测试）
- **实时滚动日志** - 自动滚动到最新日志

---

## 📊 MCP 面板详解

### Worker 状态卡片
显示Worker的基本信息：
- Worker ID
- 运行时间（自启动以来）
- 当前状态（initializing/running/paused/error）
- 当前内存使用量

### 任务统计卡片
显示任务执行情况：
- 活跃任务数
- 已完成任务数
- 失败任务数

### 账户信息卡片
显示账户相关信息：
- 已登录账户数
- 正在监控的账户数

### 实时日志面板
显示最新的1000条日志：
- 时间戳
- 日志级别（蓝=info，黄=warn，红=error）
- 消息内容

---

## 🔧 常见问题

### Q1: MCP面板打开不了

**答**: 检查Worker是否成功启动，看日志中是否有"MCP 调试接口启动成功"

### Q2: 浏览器窗口没有显示

**答**: 检查是否启用了DEBUG模式，确保 `DEBUG_HEADLESS=false`

### Q3: 看不到浏览器事件日志

**答**: 确保浏览器成功连接到MCP（看"浏览器已连接"消息）

### Q4: 回复功能在DEBUG模式下工作，但正常模式下不工作

**答**: 可能是环境变量影响，检查 `.env` 文件设置

---

## 📚 相关文件

| 文件 | 用途 |
|------|------|
| `packages/worker/start-debug.bat` | Windows启动脚本 |
| `packages/worker/start-debug.sh` | Mac/Linux启动脚本 |
| `packages/worker/src/config/debug-config.js` | DEBUG配置 |
| `packages/worker/src/debug/chrome-devtools-mcp.js` | MCP调试服务 |
| `packages/worker/src/debug/browser-debug-client.js` | 浏览器调试客户端 |

---

## 💡 总结

```
快速启动:    ./start-debug.bat (Windows) 或 ./start-debug.sh (Mac/Linux)
打开面板:    http://localhost:9222
查看事件:    监听浏览器事件日志
调试问题:    检查日志中的matchType字段
```

祝调试顺利！🚀

