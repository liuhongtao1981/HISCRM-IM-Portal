# Electron主进程Socket.IO连接修复记录

## 问题描述

Electron主进程无法连接到Master服务器，日志显示：
```
[Main] ❌ 连接 Master 失败: websocket error
Error: connect EACCES ::1:3000
code: 'EACCES',
address: '::1',
port: 3000
```

## 根本原因

发现了**两个问题**：

### 问题1：命名空间错误
Electron主进程（`electron/main.ts`）连接的是根命名空间，而应该连接到`/client`命名空间。

**架构说明**：
- **渲染进程** → 根命名空间（IM协议：`monitor:*`事件）
- **主进程** → `/client`命名空间（接收Master通知：`master:account-status-updated`等）

### 问题2：IPv6/IPv4地址解析问题
`localhost` 在某些系统上会被解析为IPv6地址 `::1`，导致连接失败。

**具体原因**：
1. Socket.IO客户端使用 `http://localhost:3000` 作为URL
2. 系统将 `localhost` 解析为IPv6地址 `::1`
3. 客户端尝试连接到 `::1:3000`（IPv6）
4. Master服务器可能只监听IPv4地址（`127.0.0.1`）
5. 导致连接被拒绝（EACCES错误码 -4092）

## 修复方案

### 修复1：使用正确的命名空间

修改 `packages/crm-pc-im/electron/main.ts` 第191-200行：

```typescript
// ❌ 修复前：连接到根命名空间
socketClient = io(websocketUrl, { ... })

// ✅ 修复后：连接到 /client 命名空间
const clientNamespaceUrl = `${websocketUrl}/client`
socketClient = io(clientNamespaceUrl, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  transports: ['websocket', 'polling']
})

console.log('[Main] Socket.IO 客户端已创建, 开始连接...')
```

### 修复2：使用IPv4地址代替localhost

修改以下3个文件，将 `localhost` 改为 `127.0.0.1`：

**1. `packages/crm-pc-im/electron/main.ts` 第177行：**
```typescript
// ❌ 修复前
let websocketUrl = 'http://localhost:3000' // 默认值

// ✅ 修复后
let websocketUrl = 'http://127.0.0.1:3000' // 默认值（使用IPv4地址避免IPv6解析问题）
```

**2. `packages/crm-pc-im/config.json`：**
```json
{
  "websocket": {
    "url": "http://127.0.0.1:3000",
    ...
  }
}
```

**3. `packages/crm-pc-im/src/services/websocket.ts` 第11行：**
```typescript
// ❌ 修复前
private url: string = 'http://localhost:3000'

// ✅ 修复后
private url: string = 'http://127.0.0.1:3000' // 默认值（使用IPv4地址避免IPv6解析问题）
```

## 验证事件流

1. **Master发送通知** (`packages/master/src/index.js:544`)：
   ```javascript
   clientNamespace.emit('master:account-status-updated', {
     accountId,
     platform,
     status: success ? 'active' : 'error',
     ...
   })
   ```

2. **主进程接收通知** (`electron/main.ts:217`)：
   ```typescript
   socketClient.on('master:account-status-updated', (data) => {
     console.log('[Main] 收到账户状态更新:', data)
     // 转发给渲染进程
     if (mainWindow) {
       mainWindow.webContents.send('account-status-updated', data)
     }
   })
   ```

3. **渲染进程处理** (`MonitorPage.tsx:470`)：
   ```typescript
   window.electron?.on('account-status-updated', (data: any) => {
     console.log('[账号状态更新]', data)
     websocketService.emit('monitor:sync', {})
   })
   ```

## 重启步骤

1. 关闭当前运行的Electron应用（CRM PC IM）
2. 重新启动：
   ```bash
   cd packages/crm-pc-im
   npm run dev
   ```

## 预期结果

重启后，Electron主进程日志应显示：
```
[Main] 连接到 Master 服务器: http://127.0.0.1:3000
[Main] 完整命名空间URL: http://127.0.0.1:3000/client
[Main] Socket.IO 客户端已创建, 开始连接...
[Main] ✅ 已成功连接到 Master 服务器, socket.id: xxxxx
[Main] ✅ 登录助手已初始化
```

账号状态应正确显示：
- **douyin-test1**（login_status=logged_in, worker_status=online）：彩色头像 + 绿色状态点
- **douyin-test**（login_status=not_logged_in, worker_status=offline）：灰色头像 + 灰色状态点
- **douyin-test2**（login_status=not_logged_in, worker_status=offline）：灰色头像 + 灰色状态点

## 相关修改

### 连接问题修复
1. [electron/main.ts:177](../packages/crm-pc-im/electron/main.ts#L177) - 默认URL改为127.0.0.1
2. [electron/main.ts:191-200](../packages/crm-pc-im/electron/main.ts#L191-L200) - 连接到/client命名空间
3. [config.json](../packages/crm-pc-im/config.json) - WebSocket URL改为127.0.0.1
4. [websocket.ts:11](../packages/crm-pc-im/src/services/websocket.ts#L11) - 默认URL改为127.0.0.1

### 账号状态显示修复
5. [im-websocket-server.js:705-727](../packages/master/src/communication/im-websocket-server.js#L705-L727) - 返回isLoggedIn字段
6. [MonitorPage.tsx:305-306,678,981](../packages/crm-pc-im/src/pages/MonitorPage.tsx) - 使用isLoggedIn判断状态
7. [MonitorPage.tsx:461-472](../packages/crm-pc-im/src/pages/MonitorPage.tsx#L461-L472) - 添加30秒自动刷新

## 测试日期

2025-11-25
