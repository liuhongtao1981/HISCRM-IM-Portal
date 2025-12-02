# IM端验证弹窗命名空间修正

**文档类型**: 🔧 修正文档 - IM 端命名空间架构调整
**创建时间**: 2025-12-02
**问题**: 初始实现错误地让CRM PC IM连接到 `/client` namespace，导致无法正常使用monitor协议
**解决方案**: CRM PC IM 继续连接根命名空间，Master同时向根命名空间和 `/client` namespace 广播验证请求

---

## 问题发现

### 初始错误实现

在初次集成时，错误地认为CRM PC IM应该连接到Master的 `/client` namespace：

```typescript
// ❌ 错误：连接到 /client namespace
this.socket = io(`${connectionUrl}/client`, {
  // ...
})
```

**问题**:
- CRM PC IM 使用 `monitor:*` 协议（`monitor:register`, `monitor:channels`, `monitor:topics` 等）
- 这些协议由 Master 的**根命名空间**（IM WebSocket Server）处理
- `/client` namespace 只处理 `client:*` 协议（用于未来的新功能）
- 连接到 `/client` namespace 后，CRM PC IM 无法接收账户列表、消息列表等核心功能

---

## Master 的 Socket.IO 架构

Master 服务器有**四套 WebSocket 服务**：

### 1. 根命名空间（`io.on('connection')`）

**文件**: `packages/master/src/communication/im-websocket-server.js`

**用途**: CRM IM 监控客户端

**协议**: `monitor:*`

**支持的事件** (发送):
- `monitor:register` - 客户端注册
- `monitor:request_channels` - 请求账户列表
- `monitor:request_topics` - 请求作品列表
- `monitor:request_messages` - 请求消息列表
- `monitor:reply` - 发送回复
- `monitor:mark_topic_as_read` - 标记作品已读
- `monitor:mark_conversation_as_read` - 标记会话已读
- `monitor:create_account` - 创建账号
- `monitor:delete_account` - 删除账号
- `monitor:request_platforms` - 请求平台列表
- `monitor:request_workers` - 请求Worker列表
- **✅ `monitor:verification:response`** - 验证响应（新增）

**支持的事件** (接收):
- `monitor:channels` - 账户列表
- `monitor:topics` - 作品列表
- `monitor:messages` - 消息列表
- `channel:message` - 新消息
- `channel:status_update` - 账户状态更新
- `monitor:sending_queue` - 发送队列更新
- `monitor:new_message_hint` - 新消息提示
- **✅ `verification:request`** - 验证请求（新增）
- 其他...

---

### 2. `/worker` namespace

**文件**: `packages/master/src/communication/socket-server.js`

**用途**: Worker 进程通信

**协议**: `worker:*`

**主要事件**:
- `worker:verification:request` - Worker发送验证请求
- `worker:verification:response:{request_id}` - Master转发验证响应
- `worker:login:status` - 登录状态更新
- `worker:message:detected` - 消息检测
- 其他 Worker 通信事件

---

### 3. `/client` namespace

**文件**: `packages/master/src/communication/socket-server.js`

**用途**: **未来的**新IM客户端（当前未使用）

**协议**: `client:*`

**主要事件**:
- `client:register` - 客户端注册
- `client:heartbeat` - 心跳
- `client:notification:ack` - 通知确认
- `client:manual-login-success` - 手动登录成功
- `client:verification:response` - 验证响应
- `verification:request` - 验证请求（接收）

**说明**: 这是为未来的新IM客户端设计的namespace，当前CRM PC IM不使用此namespace。

---

### 4. `/admin` namespace

**文件**: `packages/master/src/socket/admin-namespace.js`

**用途**: Admin Web UI

**协议**: `admin:*`

**主要事件**:
- 账户管理
- 二维码登录
- 系统监控
- 其他管理功能

---

## 修正方案

### 修改 1: websocket.ts - 恢复连接根命名空间

**文件**: `packages/crm-pc-im/src/services/websocket.ts`

**位置**: 第 57-65 行

```typescript
// ✅ 正确：连接到根命名空间
this.socket = io(connectionUrl, {
  reconnection: config.websocket?.reconnection ?? true,
  reconnectionDelay: config.websocket?.reconnectionDelay ?? 1000,
  reconnectionDelayMax: config.websocket?.reconnectionDelayMax ?? 5000,
  reconnectionAttempts: config.websocket?.reconnectionAttempts ?? 5,
  transports: ['websocket', 'polling']
})
```

**说明**: 继续连接根命名空间以使用 monitor:* 协议

---

### 修改 2: websocket.ts - 修改验证响应事件名

**文件**: `packages/crm-pc-im/src/services/websocket.ts`

**位置**: 第 177-186 行

```typescript
sendVerificationResponse(requestId: string, choice: 'yes' | 'no'): void {
  if (this.socket) {
    // ✅ 发送到根命名空间，使用 monitor:* 协议
    this.socket.emit('monitor:verification:response', {
      request_id: requestId,
      choice,
      timestamp: Date.now()
    })
    console.log(`[WebSocket] 发送验证响应: ${choice}, request_id: ${requestId}`)
  }
}
```

**变更**:
- `client:verification:response` → `monitor:verification:response`

---

### 修改 3: im-websocket-server.js - 添加验证响应监听器

**文件**: `packages/master/src/communication/im-websocket-server.js`

#### 3.1 添加事件监听

**位置**: 第 127-130 行

```javascript
// ✅ 验证响应（来自 IM 客户端）
socket.on('monitor:verification:response', (data) => {
    this.handleVerificationResponse(socket, data);
});
```

#### 3.2 添加处理方法

**位置**: 第 2172-2195 行

```javascript
/**
 * 处理验证响应（来自 IM 客户端）
 */
handleVerificationResponse(socket, data) {
    try {
        logger.info(`[IM WS] 📱 Monitor client ${socket.id} verification response:`, {
            requestId: data.request_id,
            choice: data.choice,
            timestamp: data.timestamp
        });

        // 转发到 Worker 命名空间
        const workerNamespace = this.io.of('/worker');
        workerNamespace.emit(`worker:verification:response:${data.request_id}`, {
            choice: data.choice,
            timestamp: data.timestamp || Date.now()
        });

        logger.info(`[IM WS] Verification response forwarded to Worker, request_id: ${data.request_id}, choice: ${data.choice}`);

    } catch (error) {
        logger.error('[IM WS] Failed to forward verification response:', error);
    }
}
```

**说明**: 接收来自IM客户端的验证响应，并转发到Worker namespace

---

### 修改 4: socket-server.js - 同时向两个namespace广播验证请求

**文件**: `packages/master/src/communication/socket-server.js`

**位置**: 第 157-183 行

```javascript
try {
  const verificationData = {
    request_id: data.request_id,
    account_id: data.account_id,
    source: data.source,
    platform: data.platform,
    verification_type: data.verification_type,
    message: data.message,
    phone_number: data.phone_number,
    has_sms_button: data.has_sms_button,
    has_qrcode_option: data.has_qrcode_option,
    context: data.context,
    timestamp: data.timestamp
  };

  // 转发到 Client 命名空间（用于未来的新IM客户端）
  const clientNamespace = io.of('/client');
  clientNamespace.emit('verification:request', verificationData);

  // ✅ 同时转发到根命名空间（用于当前的 CRM PC IM）
  io.emit('verification:request', verificationData);

  logger.info(`Verification request forwarded to both /client namespace and root namespace, request_id: ${data.request_id}, source: ${data.source}, platform: ${data.platform}`);

} catch (error) {
  logger.error('Failed to forward verification request:', error);
}
```

**说明**:
- 向 `/client` namespace 发送（为未来准备）
- 向根命名空间广播（当前CRM PC IM使用）

---

## 修正后的完整流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    验证请求完整流程（修正后）                     │
└─────────────────────────────────────────────────────────────────┘

1️⃣ Worker 检测验证
   ↓
   Worker (send-reply-to-comment-video-detail.js)
   └─> detectVerification() 检测到验证弹窗
   └─> throw VERIFICATION_REQUIRED error

2️⃣ Worker 请求 Master
   ↓
   Worker (worker-bridge.js)
   └─> emit('worker:verification:request', { ... })
   └─> 发送到 /worker namespace

3️⃣ Master 广播验证请求
   ↓
   Master (socket-server.js)
   └─> on('worker:verification:request')
   └─> clientNamespace.emit('verification:request', ...)  // 发送到 /client
   └─> io.emit('verification:request', ...)                // 发送到根命名空间

4️⃣ CRM PC IM 接收验证请求
   ↓
   CRM PC IM (websocket.ts, 连接到根命名空间)
   └─> on('verification:request', callback)
   └─> verification-dialog.ts: showVerificationDialog()

5️⃣ 用户选择
   ↓
   用户点击「是」或「否」

6️⃣ CRM PC IM 发送响应
   ↓
   CRM PC IM (websocket.ts)
   └─> emit('monitor:verification:response', { ... })
   └─> 发送到根命名空间

7️⃣ IM WebSocket Server 转发响应
   ↓
   Master (im-websocket-server.js)
   └─> on('monitor:verification:response')
   └─> handleVerificationResponse()
   └─> workerNamespace.emit('worker:verification:response:{request_id}', ...)

8️⃣ Worker 接收响应并处理
   ↓
   Worker (platform.js)
   └─> on('worker:verification:response:{request_id}')
   └─> choice === 'yes': 准备验证码处理
   └─> choice === 'no': 关闭标签页，取消任务
```

---

## 对比：修正前 vs 修正后

| 步骤 | 修正前 | 修正后 |
|------|--------|--------|
| **IM连接** | `/client` namespace ❌ | 根命名空间 ✅ |
| **IM接收协议** | `client:*` 和 `verification:*` | `monitor:*` 和 `verification:*` |
| **IM发送响应** | `client:verification:response` | `monitor:verification:response` |
| **Master验证请求** | 只向 `/client` 发送 | 同时向 `/client` 和根命名空间发送 |
| **Master响应处理** | `/client` namespace监听 | IM WebSocket Server监听 |
| **核心功能** | 账户列表等功能不可用 ❌ | 所有功能正常 ✅ |

---

## 测试验证

### 测试 1: 连接测试

**预期行为**:
- ✅ CRM PC IM 连接到根命名空间成功
- ✅ 收到 `monitor:registered` 事件
- ✅ 收到 `monitor:channels` 账户列表

**测试命令**:
```bash
# 启动 Master
cd packages/master && npm start

# 启动 CRM PC IM
cd packages/crm-pc-im && npm run dev
```

**日志验证**:
```
[WebSocket] ✅ 已成功连接到服务器: http://127.0.0.1:3000
[监控] 发送注册请求: { clientType: 'monitor', clientId: 'monitor_...' }
[监控] WebSocket 连接成功
```

---

### 测试 2: 验证请求接收

**触发条件**:
- Worker 检测到抖音评论验证

**预期行为**:
- ✅ CRM PC IM 收到 `verification:request` 事件
- ✅ 显示验证对话框
- ✅ 对话框包含正确的账户信息和手机号

**日志验证**:
```
[WebSocket] 收到事件: verification:request { request_id: 'verify_...', ... }
[VerificationDialog] 收到验证请求: {
  requestId: 'verify_...',
  source: 'douyin_comment_reply',
  platform: 'douyin',
  verificationType: 'sms'
}
[VerificationDialog] 显示验证对话框
```

---

### 测试 3: 验证响应发送

**触发条件**:
- 用户在对话框中点击「是」或「否」

**预期行为**:
- ✅ CRM PC IM 发送 `monitor:verification:response` 到根命名空间
- ✅ IM WebSocket Server 转发到 `/worker` namespace
- ✅ Worker 收到响应并执行相应操作

**日志验证** (CRM PC IM):
```
[VerificationDialog] 用户选择: 继续验证, request_id: verify_...
[WebSocket] 发送验证响应: yes, request_id: verify_...
```

**日志验证** (Master):
```
[IM WS] 📱 Monitor client xxx verification response: {
  requestId: 'verify_...',
  choice: 'yes',
  timestamp: 1701511234567
}
[IM WS] Verification response forwarded to Worker, request_id: verify_..., choice: yes
```

**日志验证** (Worker):
```
User choice received: yes
收到用户选择: yes
用户选择继续验证，准备处理短信验证码...
```

---

## 架构优势

### 为什么使用双命名空间广播？

**原因**:
1. **向后兼容**: 当前CRM PC IM 使用根命名空间的 monitor:* 协议
2. **向前扩展**: 未来的新IM客户端可以使用 /client namespace 的 client:* 协议
3. **平滑过渡**: 两套协议并存，不需要一次性迁移

**未来迁移路径**:
1. 新IM客户端连接到 `/client` namespace
2. 使用 `client:*` 协议替代 `monitor:*`
3. 当所有客户端迁移完成后，可以移除根命名空间的验证广播
4. 根命名空间专注于 monitor:* 核心功能

---

## 总结

### 修正内容

1. ✅ **恢复CRM PC IM连接**: 从 `/client` namespace 恢复到根命名空间
2. ✅ **修改验证响应事件**: `client:verification:response` → `monitor:verification:response`
3. ✅ **添加IM WebSocket Server处理器**: 新增 `handleVerificationResponse()` 方法
4. ✅ **双命名空间广播**: Master同时向 `/client` 和根命名空间发送验证请求

### 验证完整性

- ✅ 不影响现有 monitor:* 协议功能
- ✅ 验证请求接收正常
- ✅ 验证响应转发正常
- ✅ 向后兼容（当前CRM PC IM）
- ✅ 向前兼容（未来新IM客户端）

---

## 相关文档

- [IM端验证弹窗实现完成报告.md](./IM端验证弹窗实现完成报告.md) - 初始实现（已过时）
- [IM端验证弹窗集成指南.md](./IM端验证弹窗集成指南.md) - 集成指南
- [验证检测功能实现总结.md](./验证检测功能实现总结.md) - Worker-Master端实现
- [验证来源标识规范.md](./验证来源标识规范.md) - Source和Platform标识规范

---

**文档版本**: v1.0
**最后更新**: 2025-12-02
**维护者**: CRM PC IM 团队
