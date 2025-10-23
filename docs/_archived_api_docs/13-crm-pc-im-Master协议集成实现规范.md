# crm-pc-im → Master 协议集成实现规范

**方案代号**: 方案 4（客户端内部协议转换）
**实现周期**: 4-5 天（32 小时）
**文档日期**: 2025-10-22
**风险等级**: 🟢 极低
**改动范围**: ~250 行代码，仅限通讯层

---

## 📋 核心改动概览

| 文件 | 类型 | 行数 | 说明 |
|------|------|------|------|
| `protocol-converter.ts` | **新增** | 80 | Master ↔ crm 协议转换器 |
| `websocket.ts` | 修改 | 90 | 连接 Master，添加转换、心跳、注册 |
| `constants.ts` | 修改 | 20 | 更新 Socket.IO 事件常量 |
| `App.tsx` | 修改 | 30 | 初始化改为连接 Master |
| `.env.example` | 修改 | 2 | 添加 Master URL 配置 |
| **其他所有文件** | 不改 | - | UI、业务逻辑、类型定义零改动 |

---

## 🔧 第一步：创建协议转换器 (`protocol-converter.ts`)

**位置**: `packages/crm-pc-im/src/services/protocol-converter.ts`
**新增文件**，80 行代码

```typescript
/**
 * Protocol Converter
 *
 * 负责在 Master 协议和 crm 协议之间转换
 *
 * Master 格式: {id, account_id, sender_id, sender_name, type, content, created_at, is_new, is_sent, ...}
 * crm 格式:    {id, fromId, fromName, toId, topic, content, type, timestamp, fileUrl, ...}
 */

import type { Message } from '@shared/types'

/**
 * Master 协议消息结构
 */
export interface MasterMessage {
  id: string
  account_id: string
  sender_id: string
  sender_name?: string
  type: string
  content: string
  created_at: number  // Unix timestamp (seconds)
  is_new: number
  is_sent: number
  payload?: Record<string, any>
  [key: string]: any
}

/**
 * 将 Master 格式消息转换为 crm 格式
 *
 * @param masterMessage Master 协议消息
 * @returns crm 格式的 Message 对象
 */
export function convertMasterToCrm(masterMessage: MasterMessage): Message {
  // 处理 payload 嵌套结构（某些情况下 Master 会将消息包装在 payload 中）
  const payload = masterMessage.payload || masterMessage

  return {
    id: payload.id || `master_${Date.now()}_${Math.random()}`,
    fromId: payload.sender_id || payload.from_id || 'unknown',
    fromName: payload.sender_name || payload.from_name || 'Unknown User',
    toId: '', // Master 没有 toId 概念，留空（由 topic 识别）
    topic: payload.account_id || payload.topic || 'default', // account_id 映射到 topic
    content: payload.content || '',
    type: convertMessageType(payload.type || 'TEXT'),
    timestamp: (payload.created_at || payload.timestamp || Date.now() / 1000) * 1000, // 秒 → 毫秒
    fileUrl: payload.file_url || payload.fileUrl || undefined,
    fileName: payload.file_name || payload.fileName || undefined
  }
}

/**
 * 将 crm 格式消息转换为 Master 格式
 *
 * @param crmMessage crm 格式的 Message 对象
 * @returns Master 协议消息
 */
export function convertCrmToMaster(crmMessage: Message): MasterMessage {
  return {
    type: 'MASTER_NOTIFICATION_PUSH',
    payload: {
      id: crmMessage.id,
      account_id: crmMessage.topic, // topic 映射回 account_id
      type: crmMessage.type === 'file' ? 'FILE' : 'TEXT',
      content: crmMessage.content,
      sender_id: crmMessage.fromId,
      sender_name: crmMessage.fromName,
      created_at: Math.floor(crmMessage.timestamp / 1000), // 毫秒 → 秒
      is_new: 1,
      is_sent: 0,
      file_url: crmMessage.fileUrl,
      file_name: crmMessage.fileName
    }
  }
}

/**
 * 转换消息类型
 *
 * Master 支持: TEXT, FILE, IMAGE, SYSTEM, NOTIFICATION
 * crm 支持:    text, file
 */
function convertMessageType(
  masterType: string | undefined,
  isMasterToCrm: boolean = true
): string {
  if (isMasterToCrm) {
    // Master → crm
    switch ((masterType || 'TEXT').toUpperCase()) {
      case 'TEXT':
      case 'SYSTEM':
      case 'NOTIFICATION':
        return 'text'
      case 'FILE':
      case 'IMAGE':
        return 'file'
      default:
        return 'text'
    }
  } else {
    // crm → Master
    switch ((masterType || 'text').toLowerCase()) {
      case 'text':
        return 'TEXT'
      case 'file':
        return 'FILE'
      default:
        return 'TEXT'
    }
  }
}

/**
 * 判断消息是否为 Master 格式
 */
export function isMasterMessage(msg: any): msg is MasterMessage {
  return msg && (msg.account_id !== undefined || msg.sender_id !== undefined)
}

/**
 * 判断消息是否为 crm 格式
 */
export function isCrmMessage(msg: any): msg is Message {
  return msg && msg.fromId !== undefined && msg.topic !== undefined
}

/**
 * 生成客户端 ID（用于注册）
 */
export function generateClientId(): string {
  return `crm-pc-im_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 提取 Master 消息中的关键信息用于日志
 */
export function formatMasterMessageForLog(msg: MasterMessage): string {
  const payload = msg.payload || msg
  return `[Master] ${payload.sender_name || 'Unknown'} → ${payload.account_id}: ${payload.content?.substring(0, 50)}`
}

/**
 * 提取 crm 消息中的关键信息用于日志
 */
export function formatCrmMessageForLog(msg: Message): string {
  return `[crm] ${msg.fromName} → ${msg.topic}: ${msg.content.substring(0, 50)}`
}
```

---

## 🔧 第二步：修改 WebSocketService (`websocket.ts`)

**位置**: `packages/crm-pc-im/src/services/websocket.ts`
**改造**: 90 行代码修改

### 完整改造后的代码

```typescript
/**
 * WebSocket 连接服务 - Master 协议版本
 *
 * 核心改动：
 * 1. 连接到 Master（而不是 crm-im-server）
 * 2. 添加客户端注册机制（client:register）
 * 3. 添加心跳机制（client:heartbeat）
 * 4. 在消息接收/发送时做协议转换
 * 5. 添加消息确认机制（notification:ack）
 */

import { io, Socket } from 'socket.io-client'
import { WS_EVENTS } from '@shared/constants'
import type { Message } from '@shared/types'
import {
  convertMasterToCrm,
  convertCrmToMaster,
  isMasterMessage,
  generateClientId,
  formatMasterMessageForLog,
  formatCrmMessageForLog
} from './protocol-converter'

class WebSocketService {
  private socket: Socket | null = null
  private url: string = 'http://localhost:3000' // Master 默认地址
  private isConnected: boolean = false
  private clientId: string = generateClientId()
  private deviceType: string = 'desktop'
  private heartbeatInterval: NodeJS.Timeout | null = null
  private messageCallbacks: ((message: Message) => void)[] = []

  /**
   * 连接到 Master
   */
  connect(url?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (url) {
          this.url = url
        }

        console.log(`[WebSocket] 正在连接到 Master: ${this.url}`)

        // 连接到 Master 的 /client 命名空间
        this.socket = io(this.url, {
          path: '/socket.io/',
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
          transports: ['websocket', 'polling'],
          query: {
            clientId: this.clientId,
            deviceType: this.deviceType
          }
        })

        this.socket.on(WS_EVENTS.CONNECT, () => {
          console.log('[WebSocket] 已连接到 Master')
          this.isConnected = true
          resolve()
        })

        this.socket.on(WS_EVENTS.ERROR, (error) => {
          console.error('[WebSocket] 连接错误:', error)
          reject(error)
        })

        this.socket.on(WS_EVENTS.DISCONNECT, () => {
          console.log('[WebSocket] 连接已断开')
          this.isConnected = false
          if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval)
            this.heartbeatInterval = null
          }
        })

        // 监听 Master 推送的消息
        this.socket.on('message', (masterMessage: any) => {
          console.log('[WebSocket] 收到 Master 消息:', formatMasterMessageForLog(masterMessage))

          // 转换为 crm 格式
          const crmMessage = convertMasterToCrm(masterMessage)

          // 分发给所有监听器
          this.messageCallbacks.forEach((callback) => {
            try {
              callback(crmMessage)
            } catch (error) {
              console.error('[WebSocket] 消息回调执行出错:', error)
            }
          })

          // 发送确认信号给 Master
          if (masterMessage.id) {
            this.sendNotificationAck(masterMessage.id)
          }
        })

        // 注册响应处理
        this.socket.on('client:register:success', (data) => {
          console.log('[WebSocket] 客户端注册成功:', data)
        })

        this.socket.on('client:register:error', (error) => {
          console.error('[WebSocket] 客户端注册失败:', error)
        })

        // 调试：监听所有事件
        this.socket.onAny((eventName, ...args) => {
          if (!['message'].includes(eventName)) {
            console.log(`[WebSocket] 收到事件: ${eventName}`, args)
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 注册客户端到 Master
   *
   * 必须在 connect() 之后调用
   */
  async registerClient(deviceId?: string, deviceType?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        reject(new Error('WebSocket 未连接'))
        return
      }

      if (deviceId) {
        this.clientId = deviceId
      }
      if (deviceType) {
        this.deviceType = deviceType
      }

      console.log('[WebSocket] 正在向 Master 注册客户端:', {
        clientId: this.clientId,
        deviceType: this.deviceType
      })

      // 监听注册响应（一次性）
      const successHandler = (data: any) => {
        console.log('[WebSocket] 客户端注册成功:', data)
        this.socket?.off('client:register:error', errorHandler)
        resolve()
      }

      const errorHandler = (error: any) => {
        console.error('[WebSocket] 客户端注册失败:', error)
        this.socket?.off('client:register:success', successHandler)
        reject(error)
      }

      this.socket.once('client:register:success', successHandler)
      this.socket.once('client:register:error', errorHandler)

      // 发送注册请求
      this.socket.emit('client:register', {
        client_id: this.clientId,
        device_id: this.clientId,
        device_type: this.deviceType,
        app_version: '0.0.1'
      })

      // 30 秒超时
      setTimeout(() => {
        this.socket?.off('client:register:success', successHandler)
        this.socket?.off('client:register:error', errorHandler)
        reject(new Error('客户端注册超时'))
      }, 30000)
    })
  }

  /**
   * 启动心跳机制
   *
   * Master 需要定期收到心跳信号来确认客户端在线
   * 默认每 25 秒发送一次（Master 要求 30 秒内至少一次）
   */
  startHeartbeat(interval: number = 25000): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    console.log('[WebSocket] 启动心跳机制，间隔:', interval, 'ms')

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('client:heartbeat', {
          client_id: this.clientId,
          timestamp: Date.now()
        })
      }
    }, interval)
  }

  /**
   * 停止心跳机制
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
      console.log('[WebSocket] 停止心跳机制')
    }
  }

  /**
   * 发送确认信号给 Master
   *
   * 通知 Master 客户端已收到并处理了某条消息
   */
  sendNotificationAck(notificationId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('client:notification:ack', {
        notification_id: notificationId,
        client_id: this.clientId,
        timestamp: Date.now()
      })
    }
  }

  disconnect(): void {
    console.log('[WebSocket] 正在断开连接')
    this.stopHeartbeat()
    if (this.socket) {
      this.socket.disconnect()
      this.isConnected = false
    }
  }

  getIsConnected(): boolean {
    return this.isConnected
  }

  getClientId(): string {
    return this.clientId
  }

  /**
   * 注册消息监听器
   *
   * 改动：支持多个回调函数，每个都会收到转换后的 crm 格式消息
   */
  onMessage(callback: (message: Message) => void): void {
    this.messageCallbacks.push(callback)
  }

  /**
   * 发送消息给 Master
   *
   * 内部会自动将 crm 格式转换为 Master 格式
   */
  sendMessage(crmMessage: Message): void {
    if (!this.socket || !this.isConnected) {
      console.error('[WebSocket] 未连接，无法发送消息')
      return
    }

    // 转换为 Master 格式
    const masterMessage = convertCrmToMaster(crmMessage)

    console.log('[WebSocket] 发送消息到 Master:', formatCrmMessageForLog(crmMessage))

    // 发送给 Master
    this.socket.emit('message', masterMessage)
  }

  /**
   * 通用事件监听（低级别 API）
   */
  on(event: string, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  /**
   * 通用事件发送（低级别 API）
   */
  emit(event: string, data: any): void {
    if (this.socket) {
      this.socket.emit(event, data)
    }
  }

  /**
   * 移除事件监听
   */
  off(event: string): void {
    if (this.socket) {
      this.socket.off(event)
    }
  }
}

export const websocketService = new WebSocketService()
export default websocketService
```

---

## 🔧 第三步：更新事件常量 (`constants.ts`)

**位置**: `packages/crm-pc-im/src/shared/constants.ts`
**改造**: 20 行代码修改

### 改造清单

替换以下代码块：

```typescript
// ❌ 旧代码（crm-im-server 协议）
export const WS_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  MESSAGE: 'message',
  STATUS_CHANGE: 'status_change',
  FILE_TRANSFER: 'file_transfer',
  NOTIFICATION: 'notification',
  ERROR: 'error'
} as const
```

替换为：

```typescript
// ✅ 新代码（Master 协议）
export const WS_EVENTS = {
  // 基础连接事件
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Master 协议事件
  CLIENT_REGISTER: 'client:register',
  CLIENT_REGISTER_SUCCESS: 'client:register:success',
  CLIENT_REGISTER_ERROR: 'client:register:error',
  CLIENT_HEARTBEAT: 'client:heartbeat',
  CLIENT_NOTIFICATION_ACK: 'client:notification:ack',

  // 消息事件
  MESSAGE: 'message',

  // 兼容旧事件（可选，用于渐进式迁移）
  // STATUS_CHANGE: 'status_change',
  // FILE_TRANSFER: 'file_transfer',
  // NOTIFICATION: 'notification'
} as const
```

---

## 🔧 第四步：修改应用初始化 (`App.tsx`)

**位置**: `packages/crm-pc-im/src/App.tsx`
**改造**: 30 行代码修改

### 改造前后对比

```typescript
// ❌ 旧代码
import { useEffect } from 'react'
import { websocketService } from '@services/websocket'

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await websocketService.connect('ws://localhost:8080')
        console.log('Connected to crm-im-server')
      } catch (error) {
        console.error('Failed to connect:', error)
      }
    }

    initializeApp()

    return () => {
      websocketService.disconnect()
    }
  }, [])

  return (
    // ... UI 代码
  )
}
```

```typescript
// ✅ 新代码
import { useEffect } from 'react'
import { websocketService } from '@services/websocket'

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 1. 连接到 Master
        const masterUrl = process.env.REACT_APP_MASTER_URL || 'http://localhost:3000'
        await websocketService.connect(masterUrl)
        console.log('[App] 已连接到 Master:', masterUrl)

        // 2. 注册客户端到 Master
        // 生成唯一的设备 ID（可以从本地存储读取以保持一致性）
        const deviceId = getOrCreateDeviceId()
        await websocketService.registerClient(deviceId, 'desktop')
        console.log('[App] 已向 Master 注册客户端:', deviceId)

        // 3. 启动心跳机制（必须）
        websocketService.startHeartbeat(25000) // 每 25 秒发送一次
        console.log('[App] 已启动心跳机制')

        // 4. 监听消息（UI 层会自动处理 crm 格式的消息）
        websocketService.onMessage((crmMessage) => {
          console.log('[App] 收到消息:', crmMessage)
          // 这里的 crmMessage 已经是 crm 格式，直接使用
          // Redux/Store 会处理后续逻辑
        })
      } catch (error) {
        console.error('[App] 初始化失败:', error)
      }
    }

    initializeApp()

    return () => {
      websocketService.stopHeartbeat()
      websocketService.disconnect()
    }
  }, [])

  return (
    // ... UI 代码（完全不改）
  )
}

/**
 * 获取或创建设备 ID
 *
 * 使用本地存储保证客户端的唯一性
 */
function getOrCreateDeviceId(): string {
  const storageKey = 'crm_pc_im_device_id'
  let deviceId = localStorage.getItem(storageKey)

  if (!deviceId) {
    // 首次运行，生成新的设备 ID
    deviceId = `crm-pc-im_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(storageKey, deviceId)
  }

  return deviceId
}
```

---

## 🔧 第五步：环境变量配置 (`.env.example`)

**位置**: `packages/crm-pc-im/.env.example`
**改造**: 添加 2 行配置

```bash
# Master 服务器地址
REACT_APP_MASTER_URL=http://localhost:3000

# （其他现有配置保持不变）
```

**本地开发配置** (`.env.local` - 不提交版本控制)：

```bash
REACT_APP_MASTER_URL=http://localhost:3000
```

**生产环境配置** (`.env.production`):

```bash
REACT_APP_MASTER_URL=https://master.example.com:3000
```

---

## ✅ 不需要改的文件（完全兼容）

以下文件 **0 行改动**，完全兼容：

### UI 组件层
- `src/components/**/*.tsx` - 所有组件（0 改动）
- `src/pages/**/*.tsx` - 所有页面（0 改动）
- `src/App.css` - 样式（0 改动）
- `src/index.css` - 全局样式（0 改动）

### 状态管理层
- `src/store/**/*.ts` - Redux store（0 改动）
- Redux 切片和中间件（0 改动）

### 类型定义
- `src/shared/types.ts` - Message 等类型定义（0 改动）
- `src/shared/types-monitor.ts` - 监控相关类型（0 改动）

### 业务逻辑
- 所有业务处理逻辑（0 改动）
- 消息处理器（0 改动）
- 事件分发逻辑（0 改动）

### 为什么？
因为转换层负责将 Master 协议转换为 crm 协议格式，UI 层继续使用原有的 Message 类型和数据结构，完全感知不到协议变化。

---

## 📅 实现时间表

### Day 1：分析和设计（4 小时）

```
上午（2 小时）：
  ├─ 详细阅读 Master 协议文档
  ├─ 确认 Master 的消息格式和事件
  └─ 准备开发环境（克隆代码、安装依赖）

下午（2 小时）：
  ├─ 设计转换函数的细节
  ├─ 规划 WebSocketService 的改造
  └─ 准备测试计划
```

### Day 2：编码实现 Part 1（8 小时）

```
上午（4 小时）：
  ├─ 创建 protocol-converter.ts
  ├─ 实现所有转换函数
  ├─ 编写单元测试（转换函数）
  └─ 验证转换逻辑正确性

下午（4 小时）：
  ├─ 修改 WebSocketService
  ├─ 实现 Master 连接逻辑
  ├─ 添加 registerClient() 和 startHeartbeat()
  ├─ 修改消息接收处理（onMessage）
  └─ 基础集成测试
```

### Day 3：编码实现 Part 2（6 小时）

```
上午（3 小时）：
  ├─ 修改消息发送逻辑（sendMessage）
  ├─ 实现 sendNotificationAck()
  ├─ 更新 constants.ts
  └─ 修改 App.tsx 初始化

下午（3 小时）：
  ├─ 整体集成测试
  ├─ 往返转换测试（Master → crm → Master）
  ├─ 修复任何转换逻辑问题
  └─ 添加错误处理
```

### Day 4-5：测试和调试（10 小时）

```
Day 4（5 小时）：
  ├─ 完整端到端测试
  ├─ 测试各种消息类型
  ├─ 测试边界情况
  ├─ 性能测试（消息吞吐、延迟）
  └─ 修复发现的 bug

Day 5（5 小时）：
  ├─ 文档编写和完善
  ├─ 性能优化（如需要）
  ├─ 部署准备
  ├─ 上线前检查清单
  └─ 监控告警配置
```

**总计：32 小时（4-5 天）**

---

## 🧪 测试清单

### 单元测试（Day 2）

```
✅ convertMasterToCrm()
  - 基本字段转换正确
  - 时间戳正确（秒 → 毫秒）
  - payload 嵌套结构处理
  - 缺少字段的默认值处理

✅ convertCrmToMaster()
  - 基本字段转换正确
  - 时间戳正确（毫秒 → 秒）
  - 消息类型转换正确
  - 空值处理

✅ 消息类型转换
  - Master TEXT ↔ crm text
  - Master FILE ↔ crm file
  - 未知类型处理
```

### 集成测试（Day 3-4）

```
✅ WebSocket 连接
  - 能连接到 Master
  - 连接失败重试逻辑
  - 断开重连逻辑

✅ 客户端注册
  - registerClient() 成功返回
  - 收到 client:register:success 事件
  - 错误处理

✅ 心跳机制
  - startHeartbeat() 按时发送
  - 停止时清理定时器
  - 断开连接时自动停止

✅ 消息接收
  - 收到 Master 消息
  - 自动转换为 crm 格式
  - 自动发送 ack
  - 多个监听器都能收到

✅ 消息发送
  - sendMessage() 发送 crm 格式
  - 自动转换为 Master 格式
  - 能正确发送到 Master

✅ 往返转换
  - Master → crm → Master 数据一致
  - 无数据损失
```

### 手动测试（Day 4）

```
✅ UI 功能不变
  - 消息列表显示正常
  - 发送消息功能正常
  - 消息通知正常
  - UI 响应性能

✅ Master 连接
  - 使用 Postman/WebSocket 客户端验证 Master 能收到消息
  - 从 Master 发送消息，crm-pc-im 能正确接收

✅ 性能
  - 消息延迟 < 100ms
  - 心跳不占用主线程
  - 内存泄漏检查
```

---

## 📊 改动汇总

```
┌─────────────────────┬──────┬────────────────────────────┐
│ 文件                │ 行数 │ 说明                       │
├─────────────────────┼──────┼────────────────────────────┤
│ protocol-converter  │ +80  │ 新增：协议转换器           │
│ websocket.ts        │ ~90  │ 修改：Master 适配          │
│ constants.ts        │ ~20  │ 修改：事件常量更新         │
│ App.tsx             │ ~30  │ 修改：初始化流程           │
│ .env.example        │ +2   │ 修改：环境变量             │
├─────────────────────┼──────┼────────────────────────────┤
│ 合计                │ 222  │ ~250 行（包括注释和空行）  │
├─────────────────────┼──────┼────────────────────────────┤
│ UI 组件             │ 0    │ 零改动 ✅                  │
│ 类型定义            │ 0    │ 零改动 ✅                  │
│ Redux/状态          │ 0    │ 零改动 ✅                  │
│ 业务逻辑            │ 0    │ 零改动 ✅                  │
│ 样式和交互          │ 0    │ 零改动 ✅                  │
└─────────────────────┴──────┴────────────────────────────┘
```

---

## 🎯 成功标准

### 技术指标

```
✅ 连接成功率：99%+
✅ 消息延迟：< 100ms
✅ 消息丢失率：0%
✅ 心跳稳定性：100%
✅ 内存泄漏：0
✅ CPU 占用：< 5%（空闲状态）
```

### 功能指标

```
✅ crm-pc-im 能正常启动
✅ 能连接到 Master
✅ 能接收 Master 推送的消息
✅ 能发送消息到 Master
✅ UI 界面显示消息正常
✅ 所有原有功能保持不变
```

### 代码质量

```
✅ TypeScript 无错误编译
✅ 单元测试覆盖 > 80%
✅ 集成测试全通过
✅ 代码审查通过
✅ 文档完整
```

---

## 🚀 部署清单

### 部署前

- [ ] 所有测试通过
- [ ] 代码审查完成
- [ ] Master 服务器在线
- [ ] 备份现有数据库
- [ ] 准备回滚方案
- [ ] 监控告警已配置

### 部署过程

- [ ] 部署到测试环境
- [ ] 运行全量测试
- [ ] 灰度部署（10%）
- [ ] 监控错误率
- [ ] 扩大灰度（50%）
- [ ] 最终全量部署

### 部署后

- [ ] 验证所有功能正常
- [ ] 检查监控指标
- [ ] 收集用户反馈
- [ ] 准备补丁方案

---

## ⚠️ 风险评估

### 低风险区域 🟢

```
✅ 协议转换：独立模块，易于测试
✅ WebSocket 连接：遵循 Socket.IO 标准实现
✅ 心跳机制：简单的定时发送
✅ UI 零改动：完全兼容，无风险
```

### 潜在风险 🟡

```
⚠️ 消息转换完整性：需充分测试
⚠️ 协议版本差异：需处理 Master 协议更新
⚠️ 网络环境：需要重连机制
⚠️ 时间同步：秒毫秒转换需精确
```

### 风险缓解方案

```
✅ 完整的单元测试
✅ 详细的错误日志
✅ 自动重连机制
✅ 数据校验和确认
✅ 灰度部署
✅ 快速回滚方案
```

---

## 📚 相关文档

- [最终决策-方案4最优.md](./最终决策-方案4最优.md) - 决策依据
- Master 协议文档 - 详细协议规范
- crm-pc-im 源代码 - 现有实现参考

---

**文档版本**: 1.0
**最后更新**: 2025-10-22
**作者**: Claude Code
**状态**: ✅ 实现-Ready
