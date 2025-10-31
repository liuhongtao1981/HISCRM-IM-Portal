# CRM PC IM 配置文件说明

## 文档日期
2025-10-31

## 概述

CRM PC IM 现已支持通过 `config.json` 配置文件管理 WebSocket 连接参数,无需修改代码即可调整连接地址和参数。

## 配置文件位置

```
packages/crm-pc-im/config.json
```

## 配置文件结构

```json
{
  "websocket": {
    "url": "http://localhost:3000",
    "reconnection": true,
    "reconnectionDelay": 1000,
    "reconnectionDelayMax": 5000,
    "reconnectionAttempts": 5
  },
  "app": {
    "name": "CRM PC IM",
    "version": "1.0.0"
  }
}
```

## 配置项说明

### websocket 配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `url` | string | `"http://localhost:3000"` | Master 服务器地址 |
| `reconnection` | boolean | `true` | 是否启用自动重连 |
| `reconnectionDelay` | number | `1000` | 重连延迟时间(毫秒) |
| `reconnectionDelayMax` | number | `5000` | 最大重连延迟时间(毫秒) |
| `reconnectionAttempts` | number | `5` | 最大重连尝试次数 |

### app 配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `name` | string | `"CRM PC IM"` | 应用名称 |
| `version` | string | `"1.0.0"` | 应用版本 |

## 使用场景

### 1. 本地开发环境

```json
{
  "websocket": {
    "url": "http://localhost:3000"
  }
}
```

### 2. 测试环境

```json
{
  "websocket": {
    "url": "http://test-server:3000"
  }
}
```

### 3. 生产环境

```json
{
  "websocket": {
    "url": "https://master.example.com"
  }
}
```

### 4. 调整重连参数

如果网络不稳定,可以增加重连尝试次数和延迟:

```json
{
  "websocket": {
    "url": "http://localhost:3000",
    "reconnection": true,
    "reconnectionDelay": 2000,
    "reconnectionDelayMax": 10000,
    "reconnectionAttempts": 10
  }
}
```

## 代码实现

### WebSocket Service 更新

在 [`packages/crm-pc-im/src/services/websocket.ts`](../packages/crm-pc-im/src/services/websocket.ts) 中:

```typescript
import config from '../../config.json'

class WebSocketService {
  private socket: Socket | null = null
  private url: string = config.websocket?.url || 'http://localhost:3000'
  private isConnected: boolean = false

  connect(url?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 如果提供了 url 参数,则使用参数;否则使用配置文件或默认值
        const connectionUrl = url || this.url
        this.url = connectionUrl
        this.socket = io(connectionUrl, {
          reconnection: config.websocket?.reconnection ?? true,
          reconnectionDelay: config.websocket?.reconnectionDelay ?? 1000,
          reconnectionDelayMax: config.websocket?.reconnectionDelayMax ?? 5000,
          reconnectionAttempts: config.websocket?.reconnectionAttempts ?? 5,
          transports: ['websocket', 'polling']
        })
        // ...
      } catch (error) {
        reject(error)
      }
    })
  }
}
```

### MonitorPage 更新

在 [`packages/crm-pc-im/src/pages/MonitorPage.tsx`](../packages/crm-pc-im/src/pages/MonitorPage.tsx:203) 中:

```typescript
// 之前 (硬编码):
await websocketService.connect('ws://localhost:8080')

// 现在 (使用配置文件):
await websocketService.connect()
```

## 优先级

配置加载优先级从高到低:

1. **传入参数** - `websocketService.connect(url)` 中的 `url` 参数
2. **配置文件** - `config.json` 中的 `websocket.url`
3. **默认值** - 代码中的默认值 `'http://localhost:3000'`

## 修改配置后的操作

1. 编辑 `packages/crm-pc-im/config.json`
2. 重启 CRM PC IM 应用
3. 检查控制台日志确认连接地址

## 注意事项

1. **协议选择**:
   - 本地开发: `http://localhost:3000` 或 `ws://localhost:3000`
   - 生产环境: `https://domain.com` 或 `wss://domain.com`

2. **端口号**: 确保端口号与 Master 服务器配置一致(默认 3000)

3. **跨域**: 如果 Master 和 PC IM 不在同一域名,需要在 Master 中配置 CORS

4. **构建**: 确保 `config.json` 被包含在构建输出中

## 迁移指南

### 从旧版本升级

如果您的项目之前使用硬编码的 URL:

1. 创建 `packages/crm-pc-im/config.json`
2. 将连接地址写入配置文件
3. 更新代码以使用配置文件(已完成)
4. 删除代码中的硬编码 URL

### 配置模板

复制以下内容创建 `config.json`:

```json
{
  "websocket": {
    "url": "http://localhost:3000",
    "reconnection": true,
    "reconnectionDelay": 1000,
    "reconnectionDelayMax": 5000,
    "reconnectionAttempts": 5
  },
  "app": {
    "name": "CRM PC IM",
    "version": "1.0.0"
  }
}
```

## 相关文档

- [CRM IM Server与Master IM集成对比分析](./CRM-IM-Server与Master-IM集成对比分析.md)
- [Master IM WebSocket 服务器实现报告](./Master-IM-WebSocket服务器实现报告.md)
- [01-ADMIN-WEB-系统文档](./01-ADMIN-WEB-系统文档.md)

## 更新历史

| 日期 | 版本 | 说明 |
|------|------|------|
| 2025-10-31 | 1.0 | 初始版本 - 添加配置文件支持 |
