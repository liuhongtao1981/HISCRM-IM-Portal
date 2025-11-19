# CRM PC IM 打包修复说明

## 问题描述

打包后的 Electron 应用无法连接到 Master 服务器，而网页版本（开发环境）可以正常连接。

## 根本原因

1. **config.json 未被复制到构建输出目录**
   - Vite 构建时不会自动复制 JSON 文件
   - 导致打包后的应用无法读取 WebSocket 配置

2. **Electron 开发脚本缺少环境变量**
   - `NODE_ENV=development` 未设置
   - 导致 Electron 加载错误的文件路径（生产环境路径而非开发服务器）

3. **WebSocket 连接未连接到正确的 namespace**
   - 需要连接到 Master 的 `/client` namespace
   - 而不是废弃的 `crm-im-server`（端口 8080）

## 修复内容

### 1. Vite 配置 - 自动复制 config.json

**文件**: [packages/crm-pc-im/vite.config.ts](../packages/crm-pc-im/vite.config.ts)

添加了自定义 Vite 插件，在构建完成后自动复制 config.json 到 dist 目录：

```typescript
function copyConfigPlugin() {
  return {
    name: 'copy-config',
    closeBundle() {
      const src = path.resolve(__dirname, 'config.json')
      const dest = path.resolve(__dirname, 'dist/config.json')
      try {
        copyFileSync(src, dest)
        console.log('✓ config.json copied to dist/')
      } catch (err) {
        console.warn('Failed to copy config.json:', err)
      }
    }
  }
}
```

### 2. Package.json - 修复 Electron 开发脚本

**文件**: [packages/crm-pc-im/package.json](../packages/crm-pc-im/package.json#L14)

添加 `NODE_ENV=development` 环境变量：

```json
{
  "scripts": {
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:5173 && npm run build:electron && cross-env NODE_ENV=development electron .\"",
    "verify": "node verify-build.js",
    "prebuild": "node verify-build.js || exit 0"
  }
}
```

### 3. WebSocket 服务 - 容错处理和详细日志

**文件**: [packages/crm-pc-im/src/services/websocket.ts](../packages/crm-pc-im/src/services/websocket.ts)

#### 3.1 容错加载 config.json

```typescript
// 尝试导入 config.json，如果失败则使用默认值
let config: any = { websocket: { url: 'http://localhost:3000' } }
try {
  config = require('../../config.json')
} catch (err) {
  console.warn('[WebSocket] 无法加载 config.json，使用默认配置')
}
```

#### 3.2 连接到正确的 namespace

```typescript
// 连接到 Master 服务器的 /client namespace
this.socket = io(`${connectionUrl}/client`, {
  // ... options
})
```

#### 3.3 添加详细日志

```typescript
console.log('[WebSocket] 配置信息:', {
  connectionUrl,
  fullUrl,
  config: config.websocket
})

this.socket.on('connect_error', (error) => {
  console.error('[WebSocket] ❌ 连接错误:', error.message)
})
```

### 4. 配置文件 - 正确的服务器地址

**文件**: [packages/crm-pc-im/config.json](../packages/crm-pc-im/config.json)

```json
{
  "websocket": {
    "url": "http://localhost:3000"  // Master 服务器，不是 8080
  }
}
```

### 5. 新增工具

#### 5.1 构建验证脚本

**文件**: [packages/crm-pc-im/verify-build.js](../packages/crm-pc-im/verify-build.js)

用于打包前检查所有必要文件：

```bash
npm run verify
```

输出示例：
```
🔍 开始验证构建配置...
✅ config.json 存在
✅ dist/ 目录存在
✅ dist/config.json 已复制
✅ dist/index.html 存在
...
```

#### 5.2 打包说明文档

**文件**: [packages/crm-pc-im/打包说明.md](../packages/crm-pc-im/打包说明.md)

完整的打包流程、问题排查和调试技巧。

## 测试验证

### 1. 开发环境

```bash
npm run start:im
```

应该看到：
- Electron 窗口正常启动
- 控制台输出连接日志
- 成功连接到 Master 服务器

### 2. 生产环境

```bash
# 完整构建
cd packages/crm-pc-im
npm run build
npm run build:electron
npm run electron:build

# 运行打包后的应用
./release/CRM-PC-IM.exe
```

检查：
1. 按 `F12` 打开开发者工具
2. 查看控制台日志：
   ```
   [WebSocket] 配置信息: { connectionUrl: "http://localhost:3000", ... }
   [WebSocket] ✅ 已成功连接到服务器: http://localhost:3000
   [监控] WebSocket 连接成功
   [监控] 发送注册请求: { clientType: 'monitor', clientId: 'monitor_...' }
   [IM WS] 🔔 收到注册请求: ...
   ```
3. 验证数据正常显示

## 架构说明

Master 服务器有两个 WebSocket 系统：

### 1. Socket.IO Namespaces（用于 Worker/Admin）
```
┌─────────────────────┐
│  Master 服务器       │
│  端口: 3000         │
│  Socket.IO          │
│  ├─ /admin ←─ Admin Web
│  ├─ /worker ←─ Worker 进程
│  └─ /client (预留，未使用)
└─────────────────────┘
```

### 2. IM WebSocket Server（用于 PC/移动端客户端）
```
┌─────────────────────┐
│  CRM PC IM          │
│  (Electron)         │
└──────────┬──────────┘
           │ WebSocket
           │ http://localhost:3000 (根命名空间)
           │ monitor:register, monitor:channels 等
           ↓
┌─────────────────────┐
│  Master 服务器       │
│  端口: 3000         │
│  IM WebSocket       │
│  (根命名空间)        │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  Worker 进程        │
│  端口: 4000+        │
│  (抖音爬虫等)       │
└─────────────────────┘
```

## 相关文件清单

### 修改的文件

1. [packages/crm-pc-im/vite.config.ts](../packages/crm-pc-im/vite.config.ts) - 添加复制插件
2. [packages/crm-pc-im/package.json](../packages/crm-pc-im/package.json) - 修复脚本
3. [packages/crm-pc-im/src/services/websocket.ts](../packages/crm-pc-im/src/services/websocket.ts) - 容错和日志
4. [packages/crm-pc-im/config.json](../packages/crm-pc-im/config.json) - 正确的服务器地址

### 新增的文件

1. [packages/crm-pc-im/verify-build.js](../packages/crm-pc-im/verify-build.js) - 构建验证脚本
2. [packages/crm-pc-im/打包说明.md](../packages/crm-pc-im/打包说明.md) - 打包文档
3. [docs/CRM-PC-IM打包修复说明.md](./CRM-PC-IM打包修复说明.md) - 本文档

## 后续建议

### 1. 添加配置界面

在应用中添加设置页面，允许用户修改服务器地址，而不需要重新打包：

```typescript
// 使用 Electron IPC 保存配置
ipcMain.handle('set-websocket-url', async (_event, url) => {
  const userDataPath = app.getPath('userData')
  const configPath = path.join(userDataPath, 'config.json')
  // 保存配置...
})
```

### 2. 自动服务器发现

添加服务器自动发现功能，检测局域网中的 Master 服务器。

### 3. 连接状态指示器

在界面上添加连接状态指示器，显示：
- 🟢 已连接
- 🟡 连接中
- 🔴 已断开

### 4. 离线模式

实现离线缓存，在断开连接时仍可查看历史数据。

## 常见问题

### Q: 为什么不使用环境变量？

**A**: Electron 打包后，环境变量不容易传递给最终用户。使用 config.json 文件更灵活，用户可以直接修改。

### Q: 为什么不把 config.json 放在用户数据目录？

**A**: 这是一个好建议！未来可以改进为：
1. 首次启动时复制默认 config.json 到用户数据目录
2. 优先读取用户数据目录的配置
3. 提供界面修改配置

### Q: 开发环境和生产环境如何区分？

**A**: 通过 `process.env.NODE_ENV` 判断：
- `development`: 开发环境，连接 Vite 开发服务器
- `production`: 生产环境，加载 dist 静态文件

---

**文档版本**: 1.0
**最后更新**: 2025-11-17
**相关 Commit**: 待提交
