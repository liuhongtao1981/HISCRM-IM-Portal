# CRM-PC-IM Master 快速集成指南

**快速参考**: 如何在 crm-pc-im 中使用 Master 系统

---

## 🚀 5 分钟快速开始

### 1. 安装依赖

```bash
cd packages/crm-pc-im
npm install
```

### 2. 配置环境

创建 `.env` 文件:

```bash
# Master 服务器地址
REACT_APP_MASTER_URL=http://localhost:3000

# 开发 API 地址
VITE_API_BASE_URL=http://localhost:3000/api
```

### 3. 启动 Master 服务器

```bash
cd packages/master
npm start
# Master 运行在 http://localhost:3000
```

### 4. 启动 crm-pc-im

```bash
cd packages/crm-pc-im
npm run dev
```

**自动初始化流程**:
```
App.tsx useEffect →
  连接 Master →
  获取设备 ID →
  注册客户端 →
  启动心跳 →
  准备接收消息
```

### 5. 在 Redux/Store 中处理消息

```typescript
// src/store/slices/messageSlice.ts
websocketService.onMessage((crmMessage) => {
  dispatch(addMessage(crmMessage))
})
```

---

## 📡 消息格式参考

### 接收消息 (crm 格式)

```typescript
interface Message {
  id: string                    // 消息唯一 ID
  fromId: string               // 发送者 ID
  fromName: string             // 发送者名称
  toId: string                 // 接收者 ID (空)
  topic: string                // 账户 ID (来自 Master 的 account_id)
  content: string              // 消息内容
  type: 'text' | 'file'       // 消息类型
  timestamp: number            // 时间戳 (毫秒)
  fileUrl?: string             // 文件 URL (FILE 类型)
  fileName?: string            // 文件名 (FILE 类型)
}
```

### 发送消息 (同 crm 格式)

```typescript
const message = {
  id: 'msg-' + Date.now(),
  fromId: 'current-user-id',
  fromName: 'Current User',
  topic: 'account-id',
  content: 'Hello Master!',
  type: 'text',
  timestamp: Date.now(),
}

websocketService.sendMessage(message)
```

**自动转换**: 消息自动转换为 Master 格式后发送，无需手工处理。

---

## 🔌 WebSocket 服务 API

### 连接和注册

```typescript
import { websocketService } from '@services/websocket'

// 连接到 Master
await websocketService.connect('http://localhost:3000')

// 注册客户端
await websocketService.registerClient(deviceId, 'desktop')

// 启动心跳 (25 秒间隔)
websocketService.startHeartbeat(25000)
```

### 监听消息

```typescript
// 注册回调 (支持多个监听器)
websocketService.onMessage((message) => {
  console.log('新消息:', message)
  // message 已自动转换为 crm 格式
})

// 第二个监听器
websocketService.onMessage((message) => {
  // 另一个处理流程
})
```

### 发送消息

```typescript
const crmMessage = {
  id: 'msg-123',
  fromId: 'user-456',
  fromName: 'Alice',
  topic: 'account-789',
  content: 'Hello',
  type: 'text',
  timestamp: Date.now(),
}

websocketService.sendMessage(crmMessage)
// 自动转换为 Master 格式并发送
```

### 低级别 API

```typescript
// 监听特定事件
websocketService.on('client:register:success', (data) => {
  console.log('注册成功:', data)
})

// 发送自定义事件
websocketService.emit('custom:event', { data: 'value' })

// 移除事件监听
websocketService.off('client:register:success')
```

### 连接管理

```typescript
// 断开连接
websocketService.disconnect()

// 检查连接状态
const isConnected = websocketService.getIsConnected()

// 获取客户端 ID
const clientId = websocketService.getClientId()
```

---

## 🛠️ 在 React 组件中使用

### 基础示例

```tsx
import { useEffect, useState } from 'react'
import { websocketService } from '@services/websocket'
import type { Message } from '@shared/types'

export function MessageList() {
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
    // 监听消息
    websocketService.onMessage((message) => {
      setMessages(prev => [...prev, message])
    })
  }, [])

  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>
          <strong>{msg.fromName}:</strong> {msg.content}
          {msg.type === 'file' && (
            <a href={msg.fileUrl}>{msg.fileName}</a>
          )}
        </div>
      ))}
    </div>
  )
}
```

### Redux 集成

```typescript
// store/slices/messageSlice.ts
import { createSlice } from '@reduxjs/toolkit'
import type { Message } from '@shared/types'

const messageSlice = createSlice({
  name: 'messages',
  initialState: [] as Message[],
  reducers: {
    addMessage: (state, action) => {
      state.push(action.payload)
    },
  },
})

export const { addMessage } = messageSlice.actions
export default messageSlice.reducer
```

```typescript
// src/App.tsx
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { websocketService } from '@services/websocket'
import { addMessage } from '@store/slices/messageSlice'

function App() {
  const dispatch = useDispatch()

  useEffect(() => {
    const init = async () => {
      await websocketService.connect(process.env.REACT_APP_MASTER_URL)
      const deviceId = getOrCreateDeviceId()
      await websocketService.registerClient(deviceId, 'desktop')
      websocketService.startHeartbeat(25000)

      websocketService.onMessage((message) => {
        dispatch(addMessage(message))
      })
    }

    init()

    return () => {
      websocketService.stopHeartbeat()
      websocketService.disconnect()
    }
  }, [dispatch])

  return <MonitorPage />
}

export default App
```

---

## 🔄 协议转换流程

### 消息接收 (Master → crm)

```
Master 推送:
{
  id: 'msg-1',
  account_id: 'acc-123',        ← account_id
  sender_id: 'user-456',        ← sender_id
  sender_name: 'Alice',
  type: 'TEXT',                 ← 大写
  content: 'Hello',
  created_at: 1697952000,       ← 秒
  file_url: 'http://...',
  file_name: 'doc.pdf'
}
          ↓
  convertMasterToCrm()
          ↓
UI 接收 (crm 格式):
{
  id: 'msg-1',
  fromId: 'user-456',           ← 转换
  fromName: 'Alice',
  topic: 'acc-123',             ← 转换
  type: 'text',                 ← 小写
  content: 'Hello',
  timestamp: 1697952000000,     ← 毫秒
  fileUrl: 'http://...',
  fileName: 'doc.pdf'
}
```

### 消息发送 (crm → Master)

```
UI 发送 (crm 格式):
{
  id: 'msg-2',
  fromId: 'user-789',
  topic: 'acc-456',
  type: 'text',
  timestamp: 1697953000000
}
          ↓
  convertCrmToMaster()
          ↓
Master 接收:
{
  id: 'msg-2',
  sender_id: 'user-789',        ← 转换
  account_id: 'acc-456',        ← 转换
  type: 'TEXT',                 ← 转换
  created_at: 1697953000,       ← 转换
  ...
}
```

---

## 🚨 常见问题

### Q: 如何确保设备 ID 一致?

**A**: 已自动处理，使用 localStorage:

```typescript
function getOrCreateDeviceId(): string {
  const key = 'crm_pc_im_device_id'
  let id = localStorage.getItem(key)

  if (!id) {
    id = `crm-pc-im_${Date.now()}_${Math.random()...}`
    localStorage.setItem(key, id)
  }

  return id
}
```

### Q: 心跳间隔是多少?

**A**: 默认 25 秒，Master 要求 30 秒内至少一次:

```typescript
websocketService.startHeartbeat(25000) // 毫秒
```

可自定义:

```typescript
// 每 20 秒一次
websocketService.startHeartbeat(20000)
```

### Q: 如何处理消息发送失败?

**A**: 当前实现无重试，可手动添加:

```typescript
async function sendMessageWithRetry(message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (websocketService.getIsConnected()) {
        websocketService.sendMessage(message)
        return
      }
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}
```

### Q: 如何监听连接状态变化?

**A**: 使用低级别 API:

```typescript
websocketService.on('connect', () => {
  console.log('已连接')
})

websocketService.on('disconnect', () => {
  console.log('已断开')
})

websocketService.on('error', (error) => {
  console.error('连接错误:', error)
})
```

### Q: 如何调试消息?

**A**: 查看浏览器控制台:

```
[WebSocket] 已连接到 Master: http://localhost:3000
[WebSocket] 正在向 Master 注册客户端: {...}
[WebSocket] 客户端注册成功: {...}
[WebSocket] 启动心跳机制，间隔: 25000 ms
[WebSocket] 收到 Master 消息: {...}
```

---

## 📊 测试

### 运行单元测试

```bash
# 测试协议转换逻辑
node tests/test-protocol-converter.js

# 输出:
# ✅ 通过: 4/4
# 📈 成功率: 100%
```

### 运行集成测试

```bash
# 测试 Master 通信流程
node tests/test-master-integration.js

# 输出:
# ✅ 集成测试通过！Master 和 crm-pc-im 通信正常
```

### 编译检查

```bash
cd packages/crm-pc-im
npx tsc --noEmit
# 编译成功 (仅 Electron 警告，无关)
```

---

## 🔗 相关资源

| 资源 | 位置 |
|------|------|
| 完整验证报告 | [09-CRM-PC-IM-Master集成验证报告.md](09-CRM-PC-IM-Master集成验证报告.md) |
| Master 文档 | [02-MASTER-系统文档.md](02-MASTER-系统文档.md) |
| 系统概览 | [01-ADMIN-WEB-系统文档.md](01-ADMIN-WEB-系统文档.md) |
| 快速参考 | [快速参考-系统文档.md](快速参考-系统文档.md) |

---

## 💡 最佳实践

### ✅ 推荐做法

```typescript
// ✅ 在 App.tsx 初始化一次
useEffect(() => {
  websocketService.connect(masterUrl)
  // ...
}, []) // 空依赖，确保只运行一次

// ✅ 在多个地方监听消息
websocketService.onMessage(callback1) // Redux
websocketService.onMessage(callback2) // Analytics
websocketService.onMessage(callback3) // UI

// ✅ 检查连接状态
if (websocketService.getIsConnected()) {
  websocketService.sendMessage(message)
}

// ✅ 优雅清理
return () => {
  websocketService.stopHeartbeat()
  websocketService.disconnect()
}
```

### ❌ 避免的做法

```typescript
// ❌ 在多个地方重复连接
useEffect(() => {
  websocketService.connect() // 每个组件都会调用!
}, [])

// ❌ 忽略连接错误
websocketService.connect().catch(() => {})

// ❌ 不清理监听器
useEffect(() => {
  websocketService.onMessage(callback)
  // 没有清理!
}, [])

// ❌ 发送未转换的 Master 格式消息
websocketService.emit('message', masterFormatMessage)
```

---

## 🔄 生命周期

```
App 启动
  ↓
useEffect (空依赖)
  ↓
websocketService.connect()
  ↓ (Promise resolved)
getOrCreateDeviceId()
  ↓
websocketService.registerClient()
  ↓ (Promise resolved)
websocketService.startHeartbeat()
  ↓
websocketService.onMessage(callback)
  ↓
[等待消息...]
  ↓
Master 推送消息 → 自动转换 → callback 执行
  ↓
组件卸载
  ↓
cleanup function
  ↓
websocketService.stopHeartbeat()
websocketService.disconnect()
```

---

## 📝 日志示例

### 成功连接和注册

```
[WebSocket] 正在连接到 Master: http://localhost:3000
[WebSocket] 已连接到 Master
[WebSocket] 正在向 Master 注册客户端: {
  clientId: 'crm-pc-im_1697952000000_abc123',
  deviceType: 'desktop'
}
[WebSocket] 客户端注册成功: {
  session_id: 'session_1697952001234',
  device_id: 'crm-pc-im_1697952000000_abc123',
  connected_at: '2023-10-22T12:00:01Z'
}
[WebSocket] 启动心跳机制，间隔: 25000 ms
```

### 接收消息

```
[WebSocket] 收到 Master 消息: {
  id: 'msg-123',
  fromId: 'user-456',
  topic: 'account-789',
  ...
}
```

### 发送消息

```
[WebSocket] 发送消息到 Master: {
  id: 'msg-789',
  sender_id: 'user-456',
  account_id: 'account-789',
  ...
}
```

---

**最后更新**: 2025-10-22
**版本**: 1.0
**维护人**: Claude Code 代理
