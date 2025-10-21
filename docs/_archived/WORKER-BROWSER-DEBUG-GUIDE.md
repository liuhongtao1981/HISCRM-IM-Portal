# Worker 浏览器调试指南 - Chrome DevTools 实时监控

## 📋 概述

系统提供了多层次的浏览器调试方案，可以实时监控Worker中的浏览器行为。

### 可用的调试工具

| 工具 | 端口 | 功能 | 使用场景 |
|------|------|------|--------|
| **Chrome DevTools MCP** | 9222 | 实时监控Worker状态、任务、内存 | 监控回复执行流程 |
| **Playwright DevTools** | 动态 | 浏览器开发者工具 | 检查DOM、JavaScript调试 |
| **调试日志** | 文件系统 | 详细的执行日志 | 事后分析问题 |

---

## 🔧 方案一：Chrome DevTools MCP（推荐用于回复调试）

### 特点

✅ **实时监控** - 无需修改代码，直接监控Worker状态
✅ **性能跟踪** - 显示内存使用、任务执行时间
✅ **任务追踪** - 查看活跃任务、完成任务、失败任务
✅ **日志流** - 实时日志输出

### 启用方式

#### 步骤1：修改Worker配置

编辑 `packages/worker/src/config/debug-config.js`：

```javascript
module.exports = {
  enabled: process.env.DEBUG_MODE === 'true',
  mcp: {
    enabled: true,  // 启用 MCP 调试
    port: 9222,     // MCP 服务端口
  },
  logging: {
    level: process.env.DEBUG_LOG_LEVEL || 'debug',
    verbose: true,
  },
};
```

#### 步骤2：启动Worker（启用调试模式）

```bash
# 方式1: 环境变量
DEBUG_MODE=true npm run start:worker

# 方式2: 直接运行（包含调试）
cd packages/worker
DEBUG_MODE=true DEBUG_LOG_LEVEL=debug node src/index.js
```

#### 步骤3：访问MCP调试界面

打开浏览器访问：

```
http://localhost:9222/
```

会看到如下信息：

```json
{
  "worker": {
    "id": "worker1",
    "status": "running",
    "uptime": 12345,
    "startTime": 1697856000000
  },
  "accounts": {...},
  "tasks": {
    "active": [...],
    "completed": [...],
    "failed": [...]
  },
  "performance": {
    "memoryUsage": {...},
    "taskExecutionTimes": [...]
  }
}
```

### 调试回复功能时的用法

1. **提交回复请求**（通过测试脚本或API）
2. **打开MCP监控面板**
3. **实时观察**：
   - `tasks.active` - 查看回复任务是否被分配
   - `performance.taskExecutionTimes` - 查看执行时间
   - 日志流 - 查看"为回复任务开启新浏览器标签页"消息

---

## 🎮 方案二：Playwright DevTools（用于DOM检查）

### 特点

✅ **完整的浏览器DevTools** - 检查DOM、CSS、JavaScript
✅ **断点调试** - 逐行执行代码
✅ **性能分析** - 查看页面性能
✅ **网络监控** - 查看API调用

### 启用方式

#### 步骤1：修改浏览器启动配置

编辑 `packages/worker/src/browser/browser-manager-v2.js`：

```javascript
// 在 launchBrowserForAccount 方法中修改
async launchBrowserForAccount(accountId, proxyConfig) {
  const launchOptions = {
    // ... 其他配置
    devtools: true,  // 启用 DevTools
    headless: false, // 非headless模式（必须关闭headless才能看到浏览器窗口）
  };

  const browser = await chromium.launch(launchOptions);
  // ...
}
```

#### 步骤2：修改Worker启动脚本

修改 `packages/worker/src/index.js` 中的配置：

```javascript
const browserManager = new BrowserManagerV2('worker1', {
  headless: false,  // 禁用headless
  devtools: true,   // 启用devtools
  slowMo: 100,      // 慢动作（100ms延迟，方便观察）
});
```

#### 步骤3：启动Worker

```bash
npm run start:worker
```

此时会打开浏览器窗口，右上角会显示DevTools选项。

### 调试回复功能时的步骤

1. 启动Worker（浏览器窗口应该可见）
2. 提交回复请求
3. 观察浏览器窗口：
   - 应该看到打开新标签页（回复任务）
   - DevTools会自动打开
   - 可以查看DOM结构和JavaScript执行

---

## 📊 方案三：详细日志分析（用于事后分析）

### 启用详细日志

修改 `packages/worker/src/config/debug-config.js`：

```javascript
module.exports = {
  logging: {
    level: 'debug',  // 显示所有日志（包括debug级别）
    verbose: true,   // 显示详细信息
    file: './logs/worker-debug.log',
  },
};
```

### 查看回复相关的关键日志

```bash
# 查看所有回复相关日志
grep "回复\|reply" packages/worker/logs/worker-debug.log

# 查看标签页操作日志
grep "为回复任务\|新浏览器标签页" packages/worker/logs/worker-debug.log

# 查看ID匹配过程
grep "findMessageItemInVirtualList\|normalizeConversationId" packages/worker/logs/worker-debug.log

# 查看React Fiber提取
grep "extractMessageIdsFromReactFiber" packages/worker/logs/worker-debug.log
```

### 关键日志点

| 日志内容 | 含义 | 期望值 |
|--------|------|--------|
| `[Douyin] 为回复任务开启新浏览器标签页` | 标签页开启 | ✅ 应该看到 |
| `[Douyin] 标签页导航到回复URL` | 页面导航 | ✅ 应该看到 |
| `[Douyin] 回复文本框已定位` | 找到输入框 | ✅ 应该看到 |
| `[Douyin] 正在输入回复内容` | 输入文本 | ✅ 应该看到 |
| `[Douyin] 点击发送按钮` | 发送回复 | ✅ 应该看到 |
| `[Douyin] 回复任务标签页已关闭` | 标签页关闭 | ✅ 应该看到 |

---

## 🎯 调试回复私信问题的完整步骤

### 问题诊断流程

```
1. 启用详细日志
   ↓
2. 启动Master和Worker
   ↓
3. 提交回复请求
   ↓
4. 检查日志中是否有"为回复任务开启新浏览器标签页"
   ├─ 如果没有 → 问题在Worker任务处理
   └─ 如果有 → 问题在浏览器交互
   ↓
5. 启用浏览器DevTools查看DOM
   ↓
6. 验证回复是否成功提交
```

### 第一步：启用调试模式

```bash
# 1. 设置环境变量
$env:DEBUG_MODE='true'
$env:DEBUG_LOG_LEVEL='debug'

# 2. 启动Worker（保持窗口）
cd packages/worker
node src/index.js
```

### 第二步：启动Master

```bash
# 新的终端窗口
cd packages/master
npm run start:master
```

### 第三步：运行回复测试

```bash
# 新的终端窗口
cd packages/master/src/tests
node test-dm-reply-api.js
```

### 第四步：观察日志输出

在Worker的日志中查找关键消息：

```
✅ 应该看到的日志序列：

1. [task-runner] info: Running reply task for account xxx
2. [Douyin] info: 为回复任务开启新浏览器标签页
3. [Douyin] info: 标签页导航到: https://www.douyin.com/...
4. [Douyin] info: 回复文本框已定位
5. [Douyin] info: 正在输入回复内容
6. [Douyin] info: 点击发送按钮
7. [Douyin] info: 回复任务标签页已关闭
8. [task-runner] info: Reply task completed successfully
```

如果缺少这些日志，说明流程在某处中断。

---

## 🔍 常见问题排查

### 问题1：看不到"为回复任务开启新浏览器标签页"日志

**原因**：Worker没有收到回复任务

**排查步骤**：
1. 检查Master是否成功转发（查看Master日志中的"Forwarded reply to worker"）
2. 检查Worker是否成功连接（查看Worker日志中的连接信息）
3. 检查Worker中的回复处理器是否注册（查看"Reply handlers setup completed"）

### 问题2：浏览器窗口没有打开

**原因**：`headless: true` 模式下浏览器在后台运行

**解决**：
```bash
# 修改 browser-manager-v2.js 中的 headless 设置为 false
# 并确保系统支持图形界面（Windows/Mac可以，Linux需要显示服务器）
```

### 问题3：找不到回复内容输入框

**原因**：DOM选择器可能过期，或页面结构改变

**调试**：
1. 打开浏览器DevTools
2. 在Console中运行：
   ```javascript
   // 查找可能的输入框
   document.querySelectorAll('input[placeholder*="回复"], textarea')
   document.querySelectorAll('[contenteditable]')
   ```
3. 更新 `packages/worker/src/platforms/douyin/platform.js` 中的选择器

### 问题4：消息ID无法匹配

**原因**：虚拟列表的DOM结构发生变化，或ID提取失败

**调试**：
1. 在浏览器DevTools中检查虚拟列表的DOM
2. 查看日志中"findMessageItemInVirtualList"的输出
3. 检查四层匹配是否都被尝试：
   - Tier 1: 精确内容匹配
   - Tier 2a: 直接HTML匹配
   - Tier 2b: React Fiber提取
   - Tier 2c: 内容哈希匹配

---

## 📝 创建自定义调试脚本

### 示例：监控单个回复任务

创建 `packages/worker/src/tests/debug-reply-task.js`：

```javascript
const { chromium } = require('playwright');
const path = require('path');

async function debugReplyTask() {
  console.log('🔍 开始调试回复任务...\n');

  // 启动浏览器并启用DevTools
  const browser = await chromium.launch({
    headless: false,
    devtools: true,
    slowMo: 1000, // 每步暂停1秒
  });

  const context = await browser.createBrowserContext({
    // 使用保存的cookies和存储
    storageState: path.join('./data/browser/fingerprints/account-123_storage.json'),
  });

  const page = await context.newPage();

  // 设置断点式调试
  page.on('console', msg => console.log(`[PAGE CONSOLE] ${msg.text()}`));
  page.on('error', err => console.error(`[PAGE ERROR] ${err}`));

  // 导航到私信页面
  console.log('📍 导航到私信页面...');
  await page.goto('https://www.douyin.com/...');

  // 在此处添加调试代码
  await page.pause(); // 暂停，等待用户交互

  await context.close();
  await browser.close();
}

debugReplyTask().catch(console.error);
```

运行：
```bash
node packages/worker/src/tests/debug-reply-task.js
```

---

## 🚀 实时调试建议

### 调试回复私信时的最佳实践

1. **先启用详细日志**
   ```bash
   DEBUG_MODE=true DEBUG_LOG_LEVEL=debug
   ```

2. **使用非headless模式观察浏览器**
   ```javascript
   headless: false,
   slowMo: 500, // 让操作变慢，便于观察
   ```

3. **在关键点添加日志**
   ```javascript
   logger.info(`[DEBUG] 正在查找消息: ${messageId}`, {
     conversationId,
     messageContent: message.content?.substring(0, 20),
   });
   ```

4. **使用浏览器DevTools**
   - 打开Elements标签查看DOM结构
   - 打开Console查看JavaScript错误
   - 打开Network查看API调用

5. **逐步测试各个层级**
   - 先测试normalizeConversationId()
   - 再测试findMessageItemInVirtualList()
   - 最后测试完整的回复流程

---

## 📚 相关文件

| 文件 | 用途 |
|------|------|
| `packages/worker/src/debug/chrome-devtools-mcp.js` | MCP调试服务 |
| `packages/worker/src/config/debug-config.js` | 调试配置 |
| `packages/worker/src/browser/browser-manager-v2.js` | 浏览器管理（包含devtools选项） |
| `packages/worker/src/platforms/douyin/platform.js` | 回复执行逻辑（包含日志点） |
| `packages/worker/logs/` | 日志输出目录 |

---

## 💡 总结

根据你的调试需求选择合适的方案：

- **想监控任务流程** → 使用 Chrome DevTools MCP（端口9222）
- **想查看DOM和交互** → 启用 Playwright DevTools（headless: false）
- **想分析历史问题** → 查看详细日志文件

所有这些方案都可以组合使用，获得最全面的调试视图！

---

**最后更新**: 2025-10-20
**文档版本**: 1.0
