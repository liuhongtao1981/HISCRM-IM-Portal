# MCP 快速参考卡

## 🚀 快速启动

### 1️⃣ 启动系统
```bash
cd packages/master
DEBUG=true npm start
```

✅ 检查：
- Master 运行在 port 3000
- Worker 自动启动
- 浏览器进程启动
- 浏览器事件通过 Socket.IO 发送给 Master
- Anthropic MCP 通过 port 9222 为 Claude 提供浏览器控制能力

### 2️⃣ 在 Claude Code 中调试

现在可以在 Claude 中问浏览器问题。Claude 会通过 **Anthropic chrome-devtools-mcp** 查看浏览器。

## 📡 两个 MCP 的区别

```
┌──────────────────────────────┬──────────────────────────────┐
│  我们的自定义 MCP             │  Anthropic MCP               │
├──────────────────────────────┼──────────────────────────────┤
│ 用途: Node.js 应用通信        │ 用途: Claude 实时调试        │
│ 地址: localhost:9222          │ 由 Claude 调用               │
│ 运行: 24/7 自动               │ 运行: 按需 (npx)             │
│ 消息: 业务事件                │ 消息: 浏览器交互             │
│ 用户: Worker/Master           │ 用户: Claude AI              │
└──────────────────────────────┴──────────────────────────────┘
```

## 💬 Claude 中的常用命令

### 基础查询
```
"使用 chrome-devtools 截图，看看浏览器现在的样子"
"当前浏览器在哪个 URL？"
"私信页面加载完成了吗？"
```

### 元素查询
```
"查找 class='reply-btn' 的元素，它存在吗？"
"有多少条私信消息？请用 querySelector 数一下"
"显示第一条私信的 HTML 结构"
```

### JavaScript 执行
```
"执行 document.querySelectorAll('.message').length 看看有几条消息"
"检查控制台是否有错误，看看有什么错误日志"
"执行 localStorage.getItem('auth_token') 看看登录 token"
```

### 交互操作
```
"点击页面上的第一条私信"
"在文本框中输入 '这是我的回复'"
"点击'发送'按钮提交表单"
"滚动页面到底部"
```

### 调试分析
```
"分析页面加载性能，看看花了多长时间"
"检查网络请求，找出获取私信的 API 是什么"
"分析 DOM 树，看看私信列表的结构"
```

## 📊 监控状态

### 查看浏览器事件和 Worker 信息
```bash
# 浏览器事件已存储在 Master，可通过 Master API 查询
curl -s "http://127.0.0.1:3000/api/workers" | python -m json.tool

# 查看特定 Worker 的信息
curl -s "http://127.0.0.1:3000/api/workers/worker1" | python -m json.tool
```

### 通过 Claude 查看浏览器
```
在 Claude Code 中使用 Anthropic MCP (port 9222):
"使用 chrome-devtools 截图，看看浏览器现在的状态"
```

### Master 可用的 API 端点
```
/api/workers       - Worker 列表和状态
/api/accounts      - 账户信息
/api/comments      - 评论数据
/api/messages      - 消息数据
```

## 🔍 调试私信回复的典型流程

### 问题：私信回复不工作

```
1️⃣ 问 Claude: "浏览器现在显示什么？请截图"
   ✅ Claude 拍照看到页面现状

2️⃣ 问 Claude: "能找到'回复'按钮吗？"
   ✅ 或找到，或提示选择器错误

3️⃣ 问 Claude: "显示私信消息的 HTML 结构"
   ✅ 获得实际的 HTML，找出正确选择器

4️⃣ 修改脚本中的选择器

5️⃣ 问 Claude: "再试一次，现在能找到按钮吗？"
   ✅ 验证修改是否成功

6️⃣ 问 Claude: "试试点击这个按钮"
   ✅ Claude 通过 MCP 交互页面

7️⃣ 问 Claude: "在文本框中输入'测试回复'"
   ✅ Claude 填充表单

8️⃣ 问 Claude: "点击发送按钮"
   ✅ 提交回复，测试完成
```

## 📋 配置文件

### `.claude/mcp.json` - MCP 配置
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

### `packages/master/src/config/debug-config.js` - DEBUG 模式配置
```javascript
{
  debug: {
    enabled: true,
    singleWorkerMode: true,
    autoStartWorker: true,
    // ...
  },
  mcp: {
    enabled: true,
    port: 9222,
    logBrowserEvents: true
  }
}
```

## ⚡ 快速问题诊断

| 症状 | 快速诊断 | 解决方案 |
|------|---------|---------|
| 浏览器找不到按钮 | "Claude，显示该按钮的 HTML" | 更新选择器 |
| 页面加载不完整 | "Claude，截图看看" | 增加等待时间 |
| 表单填充失败 | "Claude，试试填充这个文本框" | 检查元素是否存在 |
| 脚本执行出错 | "Claude，检查控制台错误" | 查看 JavaScript 错误 |
| 数据获取失败 | "Claude，检查网络请求" | 分析 API 响应 |

## 🎯 今天的调试场景

**任务**：调试私信回复功能

```
现在的状态:
✅ Master 已启动（DEBUG 模式）
✅ Worker 已启动（自动）
✅ 浏览器已初始化
✅ MCP 已配置
✅ Anthropic MCP 已可用

下一步:
1. 问 Claude: "浏览器能看到私信吗？"
2. 根据反馈调整脚本
3. 快速迭代，直到问题解决
```

## 📚 详细文档

- **完整配置指南**: `docs/ANTHROPIC-MCP-SETUP-GUIDE.md`
- **浏览器交互测试**: `docs/MCP-BROWSER-INTERACTION-SUCCESS.md`
- **Anthropic MCP 参考**: https://github.com/ChromeDevTools/chrome-devtools-mcp

## 💡 高级用法

### 执行复杂的 JavaScript
```
Claude: "执行这段代码，看看结果"
代码:
```javascript
const messages = document.querySelectorAll('.message');
const result = Array.from(messages).map(msg => ({
  sender: msg.querySelector('.sender')?.textContent,
  content: msg.querySelector('.content')?.textContent,
  time: msg.querySelector('.time')?.textContent
}));
console.log(JSON.stringify(result, null, 2));
```
```

### 等待动态加载
```
Claude: "等 3 秒让页面加载，然后重新截图"
```

### 性能分析
```
Claude: "使用 performance API 测量页面加载时间"
```

---

**准备好了吗？开始在 Claude Code 中调试吧！** 🚀
