# 浏览器与 Anthropic MCP 连接说明

## 🎯 核心原理

Anthropic MCP **不需要** 我们的浏览器显式连接。相反，Anthropic MCP 通过 **Chrome DevTools Protocol (CDP)** 自动发现并连接到 Chrome 浏览器进程。

```
浏览器启动流程:
1. Playwright 启动 Chrome 进程
   ↓
2. Chrome 自动在某个端口启用 DevTools Protocol
   ↓
3. Anthropic MCP 自动发现这个端口
   ↓
4. Anthropic MCP 通过 CDP 连接到 Chrome
   ↓
5. Claude 就可以通过 Anthropic MCP 控制浏览器
```

## ⚙️ Anthropic MCP 的工作方式

### 启动过程

```bash
# 用户在 Claude Code 中：
$ 启用 Anthropic MCP 工具

# Anthropic MCP 会：
1. 查找本机运行的 Chrome 进程
2. 获取 Chrome DevTools 端口
3. 通过该端口连接到 Chrome
4. 为 Claude 提供浏览器控制接口
```

### 自动发现机制

Anthropic MCP 使用以下方式发现 Chrome：

```
Linux/Mac:
  - 查找 /tmp/.../DevToolsActivePort 文件
  - 查找 Chrome 进程参数中的 --remote-debugging-port

Windows:
  - 查找 Chrome 启动参数中的 --remote-debugging-port
  - 查找注册表中的信息
  - 查找常见的 Chrome 进程端口 (9222-9230)
```

## ✅ 我们的 Playwright 浏览器天然兼容

### 为什么工作

Playwright 启动的 Chrome 进程会自动：

1. **启用 DevTools Protocol**
   ```javascript
   // Playwright 启动时的参数
   await chromium.launch({
     // ... 其他参数
     // Playwright 自动添加必要的 DevTools Protocol 支持
   });
   ```

2. **监听 DevTools 端口**
   - 默认通常是 9222 或其他可用端口
   - Anthropic MCP 会自动查询这个端口

3. **提供完整的 CDP 接口**
   - 所有 Chrome DevTools Protocol 功能都可用
   - Claude 可以通过 MCP 访问所有功能

## 🔍 验证浏览器是否已就绪

### 方法 1: 检查 Chrome 进程

```bash
# Windows: 查看 Chrome 进程
tasklist | findstr chrome

# Linux/Mac: 查看 Chrome 进程
ps aux | grep chrome

# 应该看到包含 --remote-debugging-port 的进程
```

### 方法 2: 测试 DevTools 连接

```bash
# 尝试连接到本地的 DevTools 端口
# 通常是 9222 或临近的端口

# 使用 Chrome DevTools 本身
# 在浏览器地址栏输入: chrome://inspect

# 应该能看到远程目标
```

### 方法 3: 在 Claude 中测试

```
在 Claude Code 中:
"使用 chrome-devtools，看看浏览器能否被控制"

如果 Claude 能看到浏览器窗口的内容，就说明连接成功了。
```

## 📝 我们需要做的配置

### 在 Playwright 浏览器启动时

确保 Playwright 启动 Chrome 时支持 DevTools：

```javascript
// packages/worker/src/browser/browser-manager-v2.js

const browser = await chromium.launch({
  headless: false, // 显示浏览器窗口 (DEBUG 模式)
  // Playwright 会自动启用 DevTools Protocol
  // 无需显式配置端口
});
```

Playwright 会自动：
- ✅ 启用 Chrome DevTools Protocol
- ✅ 选择一个可用的端口
- ✅ 允许外部连接

### Master 端需要做的

.claude/mcp.json 已配置：

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

**就这样！** Anthropic MCP 会自动：
1. 查找运行的 Chrome 进程
2. 发现 DevTools 端口
3. 连接到浏览器

## 🎯 完整的连接流程

```
Master 启动
    ↓
Worker 启动
    ↓
Playwright 启动 Chrome 浏览器
    │
    └─ Chrome 启用 DevTools Protocol (自动)
    │
    └─ Chrome 监听 DevTools 端口 (自动)
        ↓
Claude Code 中启用 Anthropic MCP
    ↓
Anthropic MCP 启动
    ↓
MCP 查询本机 Chrome 进程
    ↓
MCP 发现 DevTools 端口
    ↓
MCP 连接到 Chrome (通过 CDP)
    ↓
Claude 现在可以控制浏览器！
```

## 🚀 快速验证步骤

### 第 1 步: 启动系统
```bash
cd packages/master
DEBUG=true npm start
```

等待 30-60 秒，浏览器应该会打开。

### 第 2 步: 验证 Chrome 进程
```bash
# Windows
netstat -ano | findstr LISTENING | findstr 922

# 应该看到类似:
# TCP  127.0.0.1:9222  0.0.0.0:0  LISTENING  12345
```

### 第 3 步: 在 Claude Code 中测试
```
"使用 chrome-devtools，给我拍个浏览器的截图"
```

如果成功，Claude 应该回复：
```
"我看到了 [浏览器内容描述]，已为你拍了一张截图"
```

## ⚠️ 可能的问题

### 问题 1: "找不到 Chrome 进程"

**原因**: Chrome 没有成功启动

**解决**:
```bash
# 检查 Playwright 日志
# 查看 Master 日志中是否有 Chrome 启动错误

# 检查是否已安装 Chrome
where chrome  # Windows
which google-chrome  # Linux
```

### 问题 2: "DevTools 端口找不到"

**原因**: Chrome 启动但 DevTools 未启用

**解决**:
```javascript
// 确保浏览器设置了 headless 模式正确
// Playwright 会自动启用 DevTools

// 如果还是不行，可以显式启用:
const browser = await chromium.launch({
  args: [
    // ... 其他参数
    // Playwright 已包含必要参数
  ]
});
```

### 问题 3: "MCP 无法连接到浏览器"

**原因**: 防火墙或权限问题

**解决**:
```bash
# 确保本地 localhost 连接不被阻止
# 检查防火墙设置

# 手动测试连接
curl -X GET http://127.0.0.1:9222/json/version

# 应该返回 Chrome 版本信息
```

## 📊 完整的通信流程

```
Claude Code
    ↓ (MCP 请求)
Anthropic MCP (npx 进程)
    ↓ (Chrome DevTools Protocol)
Chrome 浏览器进程 (由 Playwright 启动)
    ├─ 加载网页
    ├─ 执行 JavaScript
    ├─ 接收点击等交互
    └─ 返回 DOM、截图等数据
        ↓ (CDP 响应)
Anthropic MCP (聚合数据)
    ↓ (MCP 响应)
Claude Code (向用户展示结果)
```

## ✅ 验证清单

启动系统后，检查：

- [ ] Master 成功启动 (port 3000)
- [ ] Worker 成功启动
- [ ] Chrome 浏览器窗口打开
- [ ] Chrome 进程在监听 DevTools 端口 (9222 或附近)
- [ ] 在 Claude Code 中能看到 Anthropic MCP 工具
- [ ] Claude 能成功执行浏览器截图命令
- [ ] 浏览器响应 Claude 的交互命令

## 🎓 总结

**浏览器与 Anthropic MCP 的连接是自动的：**

1. ✅ Playwright 启动 Chrome 时，Chrome 自动启用 DevTools Protocol
2. ✅ Chrome 自动在某个端口监听 (通常 9222)
3. ✅ Anthropic MCP 自动发现和连接
4. ✅ Claude 自动获得浏览器控制能力

**我们无需做任何额外的连接配置！**

只需确保：
- Chrome 已安装
- Playwright 能正常启动浏览器
- .claude/mcp.json 已配置 (已完成)

**就这样，浏览器与 MCP 会自动连接！** 🚀
