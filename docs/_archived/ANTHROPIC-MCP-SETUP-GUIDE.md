# Anthropic Chrome DevTools MCP 配置指南

## 📋 概述

本指南将帮助你配置和使用 Anthropic 的 **chrome-devtools-mcp**，用于在 Claude Code 中实时调试浏览器。

## 🏗️ 系统架构

我们的系统使用简洁的架构：

```
┌──────────────────────────────────┐
│  Claude Code (通过 Anthropic MCP)│ ← 实时调试
├──────────────────────────────────┤
│  Chrome 浏览器进程 (Playwright)   │
├──────────────────────────────────┤
│  Worker (Socket.IO - Port 3000)  │ ← 事件发送
├──────────────────────────────────┤
│  Master (Socket.IO - Port 3000)  │ ← 事件处理
└──────────────────────────────────┘
```

### 架构要点

| 组件 | 用途 | 端口 | 说明 |
|------|------|------|------|
| **Anthropic MCP** | 实时浏览器调试 | 9222 | Claude 的工具 |
| **Master Socket.IO** | 浏览器事件处理 | 3000 | 直接复用现有通信 |

## ✅ 已完成的配置

### 1. 创建了 `.claude/mcp.json`

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

**说明**:
- `npx -y chrome-devtools-mcp@latest` 会自动下载最新版本并运行
- 无需提前安装，第一次使用时会自动下载
- 总是使用最新版本（@latest）

## 🚀 如何使用

### 前提条件

1. **Chrome 浏览器** - 已安装（用来启动浏览器进程）
2. **Node.js 20+** - 已有（用来运行 MCP 服务器）
3. **Claude Code** - 已有（用来调试）

### 第一步：启动系统

```bash
# 确保 Master 在 DEBUG 模式运行
cd packages/master
DEBUG=true npm start
```

**检查点**:
- ✅ Master 启动成功 (port 3000)
- ✅ Worker 自动启动
- ✅ 浏览器进程启动
- ✅ MCP 服务在 port 9222 运行

### 第二步：在 Claude Code 中调试

现在你可以在 Claude 中问这样的问题：

```
"Claude，使用 chrome-devtools 查看当前浏览器在做什么？"
```

Claude 会通过 Anthropic MCP 获取：
- 📸 浏览器截图
- 🔍 页面 DOM 结构
- 💻 执行 JavaScript 并获取结果
- 📊 性能数据
- 🔴 控制台错误日志

### 第三步：交互式调试流程

**例子：调试私信回复功能**

```
你: "Claude，浏览器现在显示什么？"

Claude (使用 MCP):
✅ 拍取截图
✅ 看到私信页面
❌ 但没看到"回复"按钮
→ 告诉你: "回复按钮选择器可能不对"

你: "查看私信消息的 HTML 结构"

Claude:
✅ 执行: document.querySelector('.message-item').outerHTML
✅ 显示实际 HTML
→ 告诉你: "实际的 class 是 .dm-message-item"

你: "更新脚本选择器为 .dm-message-item"
→ 快速修改脚本

你: "再看一遍，能找到了吗？"

Claude:
✅ 重新查询新选择器
✅ 找到按钮了！
→ 成功 ✅
```

## 📚 Anthropic MCP 可用工具

Claude 通过 Anthropic MCP 可以访问以下工具：

### 1. 获取浏览器信息
```
- 获取当前 URL
- 获取页面标题
- 获取浏览器窗口大小
- 获取浏览器内存使用
```

### 2. 导航和交互
```
- 导航到 URL
- 后退/前进
- 重新加载页面
- 点击元素
- 填充表单
- 提交表单
- 拖拽元素
```

### 3. 页面查询
```
- 获取 DOM 内容
- 查询元素选择器
- 执行 JavaScript
- 获取页面属性
- 获取输入框值
```

### 4. 调试信息
```
- 截图页面
- 获取控制台日志
- 获取网络请求
- 性能分析
```

## 🔧 配置文件位置

```
e:\HISCRM-IM-main\
├── .claude\
│   ├── mcp.json ← MCP 配置文件（已创建）
│   └── settings.local.json
├── packages\
│   ├── master\
│   │   └── src\
│   │       └── config\
│   │           └── debug-config.js ← DEBUG 模式配置
│   └── worker\
│       └── src\
│           └── debug\
│               └── chrome-devtools-mcp.js ← 自定义 MCP（后台）
```

## 🎯 实际调试场景

### 场景 1: 页面加载问题

```
问题: 浏览器访问私信页面，但页面加载不完整

调试:
你: "浏览器的私信页面是什么样的？请截图"

Claude:
  [Claude 通过 Anthropic MCP 获取截图]
  [看到页面只加载了一半]
  → "页面似乎还在加载中，右下角有加载中的动画"

你: "等等加载完成，再截图"

Claude:
  [等待...]
  [再次截图]
  → "现在加载完成了，可以看到完整的私信列表"

✅ 问题确认：加载速度或选择器需要等待
```

### 场景 2: 元素选择器错误

```
问题: 找不到"回复"按钮

调试:
你: "用 document.querySelectorAll('.reply-btn') 查看有多少个回复按钮"

Claude:
  [执行 JavaScript]
  → "返回空数组，说明选择器错误"

你: "查找所有可能的按钮，看看真实的 class 是什么"

Claude:
  [执行] document.querySelectorAll('button').forEach(...)
  [分析 HTML]
  → "找到了！实际的 class 是 'message-action-reply'"

你: "更新脚本"
✅ 快速解决
```

### 场景 3: 动态内容加载

```
问题: 脚本能找到第一条私信，但找不到第二条

调试:
你: "滚动页面到底部，看看有没有更多私信"

Claude:
  [执行 scrollTo]
  [等待 2 秒加载新内容]
  [截图]
  → "现在看到了 5 条私信，可能需要等待动态加载"

✅ 确认问题：需要在脚本中添加等待逻辑
```

## 📊 监控系统运行

### 浏览器事件处理
浏览器事件通过 Socket.IO (Port 3000) 直接发送给 Master，无需额外端口：
```bash
# 查看 Master 的 Worker 信息
curl -s "http://127.0.0.1:3000/api/workers" | python -m json.tool
```

### 实时浏览器调试
通过 Claude Code 使用 Anthropic MCP (Port 9222) 查看浏览器：
```
Claude: "使用 chrome-devtools 截图"
```

## 🎓 常见命令

### 在 Claude Code 中调试

```
# 基础查询
"浏览器现在在哪个 URL？"
"拍一张浏览器的截图"

# 元素查询
"查找 class='reply-btn' 的元素"
"有多少个私信消息？"

# JavaScript 执行
"执行 document.querySelector('.message-list').children.length"
"看看控制台有没有错误"

# 交互操作
"点击第一条私信的回复按钮"
"在文本框中输入'测试内容'"

# 调试分析
"检查网络请求，看看私信数据的 API 是什么"
"分析页面性能，看看加载花了多长时间"
```

## ⚠️ 注意事项

### 1. 需要 Chrome 浏览器

Anthropic MCP 使用 Puppeteer 来控制浏览器，需要 Chrome 已安装。

如果没有安装，会显示错误：
```
Error: Failed to launch browser
```

### 2. 只在需要时激活

Anthropic MCP 只在你使用相关工具时激活，不会一直运行。

### 3. 安全考虑

如果浏览器中有敏感信息（登录 token、密码等），请注意：
- Claude 可以看到页面内容
- Claude 可以执行 JavaScript
- 确保不共享敏感数据

### 4. 性能影响

在浏览器中进行大量截图或 JavaScript 执行可能会影响页面性能。

## 🔗 相关文档

- [Anthropic Chrome DevTools MCP GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [MCP Tool Reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)
- [Claude Code MCP 配置指南](https://docs.anthropic.com/en/docs/claude-code/mcp)

## 📞 故障排除

### 问题：MCP 无法连接

```
错误: Failed to connect to MCP server
```

**解决**:
1. 检查 Chrome 是否安装：`chrome --version`
2. 检查是否有其他进程占用端口
3. 尝试重启 Claude Code
4. 查看 Claude Code 的 MCP 日志

### 问题：JavaScript 执行超时

```
错误: Timeout waiting for JavaScript execution
```

**解决**:
- 可能是页面加载缓慢
- 添加更多等待时间
- 查看页面是否有错误

### 问题：找不到元素

```
Claude: "无法找到选择器 .reply-btn 的元素"
```

**解决**:
- 检查元素选择器是否正确
- 使用浏览器开发者工具验证选择器
- 查看元素是否被隐藏或动态加载
- 尝试使用不同的选择器方式

## 🎉 开始使用

现在你已经配置好了！你可以：

1. 确保 Master 在 DEBUG 模式运行
2. 在 Claude Code 中问浏览器相关的问题
3. Claude 会通过 Anthropic MCP 查看你的浏览器
4. 快速定位问题所在
5. 迭代修复脚本

**享受高效的调试体验！** 🚀
