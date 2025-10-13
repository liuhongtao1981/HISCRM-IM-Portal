# Socket.IO Events契约

**Version**: 1.0.0
**Protocol**: Socket.IO 4.x (WebSocket + JSON)

## 消息格式

所有消息遵循统一格式:

```typescript
interface Message {
  type: string;           // 消息类型
  version: string;        // API版本,如"v1"
  payload: any;           // 消息内容
  timestamp: number;      // Unix timestamp
  requestId?: string;     // 可选,用于追踪请求
}
```

---

## 主控 ←→ Worker 通信

### Worker → 主控

#### 1. worker:register - Worker注册

**Direction**: Worker → Master
**Trigger**: Worker启动时

```json
{
  "type": "worker:register",
  "version": "v1",
  "payload": {
    "worker_id": "worker-001",
    "host": "192.168.1.100",
    "port": 4000,
    "version": "1.0.0",
    "capabilities": ["douyin"],
    "max_accounts": 10
  },
  "timestamp": 1697000000
}
```

**Response**:
```json
{
  "type": "worker:register:ack",
  "version": "v1",
  "payload": {
    "success": true,
    "assigned_accounts": [
      {
        "id": "acc-001",
        "platform": "douyin",
        "account_id": "dy123456",
        "credentials": "encrypted_data",
        "monitor_interval": 30
      }
    ]
  },
  "timestamp": 1697000001
}
```

---

#### 2. worker:heartbeat - 心跳

**Direction**: Worker → Master
**Frequency**: 每10秒

```json
{
  "type": "worker:heartbeat",
  "version": "v1",
  "payload": {
    "worker_id": "worker-001",
    "status": "online",
    "active_tasks": 3,
    "memory_usage": 150.5,  // MB
    "cpu_usage": 25.3       // %
  },
  "timestamp": 1697000010
}
```

**Response**:
```json
{
  "type": "worker:heartbeat:ack",
  "version": "v1",
  "payload": {
    "success": true
  },
  "timestamp": 1697000010
}
```

---

#### 3. worker:message:detected - 检测到新消息

**Direction**: Worker → Master
**Trigger**: Worker检测到新评论或私信

```json
{
  "type": "worker:message:detected",
  "version": "v1",
  "payload": {
    "worker_id": "worker-001",
    "account_id": "acc-001",
    "message_type": "comment",  // or "direct_message"
    "data": {
      "id": "cmt-001",
      "platform_comment_id": "123456",
      "content": "好棒的视频!",
      "author_name": "用户A",
      "author_id": "user123",
      "post_id": "video789",
      "post_title": "我的最新视频",
      "created_at": 1697000000
    }
  },
  "timestamp": 1697000030
}
```

**Response**:
```json
{
  "type": "worker:message:ack",
  "version": "v1",
  "payload": {
    "success": true,
    "message_id": "cmt-001"
  },
  "timestamp": 1697000031
}
```

---

#### 4. worker:error - Worker错误报告

**Direction**: Worker → Master
**Trigger**: Worker遇到错误

```json
{
  "type": "worker:error",
  "version": "v1",
  "payload": {
    "worker_id": "worker-001",
    "error_type": "auth_failed",  // auth_failed, network_error, rate_limited
    "account_id": "acc-001",
    "error_message": "账户凭证已过期",
    "details": {
      "platform": "douyin",
      "retry_count": 3
    }
  },
  "timestamp": 1697000040
}
```

---

### 主控 → Worker

#### 5. master:task:assign - 分配任务

**Direction**: Master → Worker
**Trigger**: 新账户添加或Worker重启

```json
{
  "type": "master:task:assign",
  "version": "v1",
  "payload": {
    "account_id": "acc-002",
    "platform": "douyin",
    "account_credentials": "encrypted_data",
    "monitor_interval": 30
  },
  "timestamp": 1697000050
}
```

**Response**:
```json
{
  "type": "master:task:assign:ack",
  "version": "v1",
  "payload": {
    "success": true,
    "account_id": "acc-002"
  },
  "timestamp": 1697000051
}
```

---

#### 6. master:task:revoke - 撤销任务

**Direction**: Master → Worker
**Trigger**: 账户删除或重新分配

```json
{
  "type": "master:task:revoke",
  "version": "v1",
  "payload": {
    "account_id": "acc-002"
  },
  "timestamp": 1697000060
}
```

---

#### 7. master:shutdown - 关闭Worker

**Direction**: Master → Worker
**Trigger**: 系统维护或Worker缩容

```json
{
  "type": "master:shutdown",
  "version": "v1",
  "payload": {
    "reason": "maintenance",
    "graceful_timeout": 30  // 秒
  },
  "timestamp": 1697000070
}
```

---

## 主控 ←→ 客户端 通信

### 客户端 → 主控

#### 8. client:connect - 客户端连接

**Direction**: Client → Master
**Trigger**: 客户端启动

```json
{
  "type": "client:connect",
  "version": "v1",
  "payload": {
    "device_id": "device-001",
    "device_type": "desktop",  // desktop, ios, android
    "device_name": "我的MacBook Pro",
    "auth_token": "jwt_token_here"
  },
  "timestamp": 1697000080
}
```

**Response**:
```json
{
  "type": "client:connect:ack",
  "version": "v1",
  "payload": {
    "success": true,
    "session_id": "session-001",
    "unread_notifications": 5
  },
  "timestamp": 1697000081
}
```

---

#### 9. client:sync:request - 请求同步

**Direction**: Client → Master
**Trigger**: 客户端重新上线

```json
{
  "type": "client:sync:request",
  "version": "v1",
  "payload": {
    "device_id": "device-001",
    "last_sync_time": 1696999000
  },
  "timestamp": 1697000090
}
```

**Response**:
```json
{
  "type": "client:sync:response",
  "version": "v1",
  "payload": {
    "success": true,
    "notifications": [
      {
        "id": "notif-001",
        "type": "comment",
        "title": "新评论",
        "content": "用户A评论了你的视频",
        "created_at": 1697000000
      }
    ]
  },
  "timestamp": 1697000091
}
```

---

#### 10. client:notification:read - 标记通知已读

**Direction**: Client → Master

```json
{
  "type": "client:notification:read",
  "version": "v1",
  "payload": {
    "notification_id": "notif-001"
  },
  "timestamp": 1697000100
}
```

---

### 主控 → 客户端

#### 11. master:notification:push - 推送通知

**Direction**: Master → Client (广播到所有设备)
**Trigger**: Worker上报新消息

```json
{
  "type": "master:notification:push",
  "version": "v1",
  "payload": {
    "id": "notif-002",
    "type": "comment",
    "account_id": "acc-001",
    "account_name": "我的抖音账号",
    "title": "新评论",
    "content": "用户B: 太有趣了!",
    "related_id": "cmt-002",
    "created_at": 1697000105
  },
  "timestamp": 1697000105
}
```

---

#### 12. master:account:update - 账户状态更新

**Direction**: Master → Client (广播)
**Trigger**: 账户状态变化

```json
{
  "type": "master:account:update",
  "version": "v1",
  "payload": {
    "account_id": "acc-001",
    "status": "error",
    "error_message": "凭证已过期,请重新登录"
  },
  "timestamp": 1697000110
}
```

---

## 错误处理

### 错误响应格式

```json
{
  "type": "{original_type}:error",
  "version": "v1",
  "payload": {
    "success": false,
    "error_code": "ERR_AUTH_FAILED",
    "error_message": "Authentication failed",
    "details": {}
  },
  "timestamp": 1697000120
}
```

### 常见错误码

| 错误码 | 说明 |
|-------|------|
| ERR_AUTH_FAILED | 认证失败 |
| ERR_INVALID_PAYLOAD | 消息格式错误 |
| ERR_ACCOUNT_NOT_FOUND | 账户不存在 |
| ERR_WORKER_OFFLINE | Worker离线 |
| ERR_RATE_LIMITED | 平台限流 |
| ERR_INTERNAL | 内部服务器错误 |

---

## 版本兼容性

### 版本协商

客户端连接时,主控检查version字段:
- 如果version="v1": 使用v1协议
- 如果version未知: 返回错误 `ERR_UNSUPPORTED_VERSION`

### 向后兼容

新版本主控必须支持旧版本Worker和客户端:
- v1.1主控可处理v1.0消息
- 新增字段使用可选字段,旧版本忽略

---

## 连接生命周期

### Worker连接流程

```
1. Worker启动 → 连接主控Socket.IO
2. 发送worker:register → 接收assigned_accounts
3. 开始监控任务 + 每10秒发送heartbeat
4. 检测到新消息 → 发送worker:message:detected
5. 接收到master:shutdown → 停止任务,断开连接
```

### 客户端连接流程

```
1. 客户端启动 → 连接主控Socket.IO
2. 发送client:connect → 接收session_id + unread_notifications
3. 监听master:notification:push → 显示通知
4. 点击通知 → 发送client:notification:read
5. 网络断开 → Socket.IO自动重连 → 发送client:sync:request
```

---

## 测试用例

### 场景1: Worker注册并接收任务

```javascript
// Worker端
socket.emit('message', {
  type: 'worker:register',
  version: 'v1',
  payload: { worker_id: 'worker-001', ... },
  timestamp: Date.now()
});

// 期望收到
socket.on('message', (msg) => {
  assert.equal(msg.type, 'worker:register:ack');
  assert.equal(msg.payload.success, true);
  assert.isArray(msg.payload.assigned_accounts);
});
```

### 场景2: 通知推送到所有客户端

```javascript
// 主控端(模拟Worker上报)
io.to('all-clients').emit('message', {
  type: 'master:notification:push',
  version: 'v1',
  payload: { id: 'notif-001', ... },
  timestamp: Date.now()
});

// 客户端A和B都应收到
clientA.on('message', (msg) => {
  assert.equal(msg.type, 'master:notification:push');
});
clientB.on('message', (msg) => {
  assert.equal(msg.type, 'master:notification:push');
});
```
