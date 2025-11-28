# IM添加账号功能WebSocket实现说明

## 概述

IM 客户端的添加账号功能通过 **WebSocket 通信**实现，而不是HTTP REST API。这样保持了IM客户端与Master服务器之间统一的通信方式。

## 为什么使用WebSocket而不是HTTP API？

### 优势

1. **统一通信协议**
   - IM客户端已经通过WebSocket连接到Master
   - 避免维护两套通信机制（WebSocket + HTTP）
   - 简化代码结构和依赖管理

2. **实时性更好**
   - WebSocket是双向通信，Master可以主动推送更新
   - 账号创建后自动广播到所有连接的客户端
   - 无需客户端主动轮询或手动刷新

3. **性能更优**
   - 复用已有的WebSocket连接
   - 避免HTTP连接建立和断开的开销
   - 减少网络延迟

4. **安全性一致**
   - 统一的认证和授权机制
   - WebSocket连接已经过验证
   - 避免CORS等HTTP特定问题

## 实现架构

### 通信流程

```
IM客户端                Master服务器               数据库
   |                       |                        |
   |-- monitor:create_account -->                  |
   |   (账号数据)           |                        |
   |                       |-- createAccount() ---->|
   |                       |<----- 新账号数据 -------|
   |<-- monitor:create_account_result --|          |
   |   (创建结果)           |                        |
   |                       |-- broadcast() -->所有客户端
   |<-- monitor:channels --|                        |
   |   (更新账号列表)       |                        |
```

### 消息类型

在 [packages/shared/protocol/messages.js](packages/shared/protocol/messages.js#L79-L85) 中定义：

```javascript
// 账号管理相关
const CLIENT_CREATE_ACCOUNT = 'client:create-account'  // IM客户端创建账号
const CLIENT_CREATE_ACCOUNT_ACK = 'client:create-account:ack'  // Master确认账号创建结果
const CLIENT_REQUEST_PLATFORMS = 'client:request-platforms'  // IM客户端请求平台列表
const CLIENT_REQUEST_PLATFORMS_ACK = 'client:request-platforms:ack'  // Master响应平台列表
const CLIENT_REQUEST_WORKERS = 'client:request-workers'  // IM客户端请求Worker列表
const CLIENT_REQUEST_WORKERS_ACK = 'client:request-workers:ack'  // Master响应Worker列表
```

**注意**：实际实现中使用的是简化的事件名（如 `monitor:create_account`），因为IM客户端连接到根命名空间而不是特定命名空间。

## Master服务器端实现

### 1. WebSocket事件注册

在 [im-websocket-server.js](packages/master/src/communication/im-websocket-server.js#L95-L110) 中注册事件处理器：

```javascript
// ============ 账号管理事件 ============

// 创建账号
socket.on('monitor:create_account', (data) => {
    this.handleCreateAccount(socket, data);
});

// 请求平台列表
socket.on('monitor:request_platforms', () => {
    this.handleRequestPlatforms(socket);
});

// 请求Worker列表
socket.on('monitor:request_workers', () => {
    this.handleRequestWorkers(socket);
});
```

### 2. 创建账号处理器

[handleCreateAccount()](packages/master/src/communication/im-websocket-server.js#L1925-L1983)：

```javascript
async handleCreateAccount(socket, data) {
    try {
        // 1. 验证必填字段
        const { platform, account_name, account_id, status, monitor_interval, assigned_worker_id } = data;

        if (!platform || !account_name) {
            socket.emit('monitor:create_account_result', {
                success: false,
                error: '缺少必填字段：platform 和 account_name'
            });
            return;
        }

        // 2. 创建账号数据
        const accountData = {
            platform,
            account_name,
            account_id: account_id || `temp_${Date.now()}`,
            status: status || 'active',
            monitor_interval: monitor_interval || 30,
            assigned_worker_id: assigned_worker_id || null,
        };

        // 3. 调用 DAO 创建账号
        const newAccount = await this.accountDAO.createAccount(accountData);

        // 4. 通知客户端创建成功
        socket.emit('monitor:create_account_result', {
            success: true,
            data: newAccount
        });

        // 5. 广播更新账户列表
        const channels = this.getChannelsFromDataStore();
        this.broadcastToMonitors('monitor:channels', { channels });

    } catch (error) {
        socket.emit('monitor:create_account_result', {
            success: false,
            error: error.message || '创建账号失败'
        });
    }
}
```

**关键特性**：
- 验证必填字段
- 自动生成临时ID（如果未提供）
- 调用AccountDAO持久化到数据库
- 成功后广播更新到所有客户端

### 3. 平台列表处理器

[handleRequestPlatforms()](packages/master/src/communication/im-websocket-server.js#L1985-L2010)：

```javascript
async handleRequestPlatforms(socket) {
    const platforms = [
        { value: 'douyin', label: '抖音' },
        { value: 'xiaohongshu', label: '小红书' }
    ];

    socket.emit('monitor:platforms', {
        success: true,
        data: platforms
    });
}
```

### 4. Worker列表处理器

[handleRequestWorkers()](packages/master/src/communication/im-websocket-server.js#L2012-L2048)：

```javascript
async handleRequestWorkers(socket) {
    // 从 Worker 注册表获取在线 Worker 列表
    const workers = Array.from(this.workerRegistry.workers.values()).map(worker => ({
        id: worker.id,
        status: worker.status,
        assigned_accounts: worker.assigned_accounts || 0,
        host: worker.host,
        port: worker.port
    }));

    socket.emit('monitor:workers', {
        success: true,
        data: workers
    });
}
```

## IM客户端实现

### 1. 加载平台列表

[MonitorPage.tsx](packages/crm-pc-im/src/pages/MonitorPage.tsx#L945-L965)：

```typescript
const loadPlatforms = () => {
    setPlatformsLoading(true)

    // 监听平台列表响应
    const handlePlatformsResponse = (response: any) => {
        setPlatformsLoading(false)
        if (response.success && Array.isArray(response.data)) {
            setPlatforms(response.data)
        } else {
            setPlatforms([
                { value: 'douyin', label: '抖音' },
                { value: 'xiaohongshu', label: '小红书' }
            ])
        }
        websocketService.off('monitor:platforms')
    }

    websocketService.on('monitor:platforms', handlePlatformsResponse)
    websocketService.emit('monitor:request_platforms')
}
```

**特性**：
- 注册响应处理器
- 发送请求
- 处理响应后移除监听器（避免内存泄漏）
- 降级方案（使用默认平台列表）

### 2. 加载Worker列表

[MonitorPage.tsx](packages/crm-pc-im/src/pages/MonitorPage.tsx#L967-L979)：

```typescript
const loadWorkers = () => {
    const handleWorkersResponse = (response: any) => {
        if (response.success && Array.isArray(response.data)) {
            setWorkers(response.data)
        }
        websocketService.off('monitor:workers')
    }

    websocketService.on('monitor:workers', handleWorkersResponse)
    websocketService.emit('monitor:request_workers')
}
```

### 3. 提交创建账号表单

[MonitorPage.tsx](packages/crm-pc-im/src/pages/MonitorPage.tsx#L996-L1024)：

```typescript
const handleSubmitAddAccount = async () => {
    try {
        const values = await form.validateFields()

        // 处理 assigned_worker_id: 'auto' 转换为 null
        if (values.assigned_worker_id === 'auto') {
            values.assigned_worker_id = null
        }

        // 监听创建账号响应
        const handleCreateAccountResult = (response: any) => {
            if (response.success) {
                antdMessage.success('账户创建成功')
                handleCloseAddAccountModal()
                // 账户列表会自动更新（Master会广播）
            } else {
                antdMessage.error(response.error || '账户创建失败')
            }
            websocketService.off('monitor:create_account_result')
        }

        websocketService.on('monitor:create_account_result', handleCreateAccountResult)
        websocketService.emit('monitor:create_account', values)
    } catch (error) {
        antdMessage.error('表单验证失败')
    }
}
```

**特性**：
- 表单验证
- 处理特殊字段（如 'auto' → null）
- 注册响应处理器
- 发送创建请求
- 成功后账号列表自动更新（Master广播）

## WebSocket事件列表

| 事件名称 | 方向 | 数据 | 说明 |
|---------|------|------|------|
| `monitor:request_platforms` | Client → Master | 无 | 请求平台列表 |
| `monitor:platforms` | Master → Client | `{ success, data }` | 响应平台列表 |
| `monitor:request_workers` | Client → Master | 无 | 请求Worker列表 |
| `monitor:workers` | Master → Client | `{ success, data }` | 响应Worker列表 |
| `monitor:create_account` | Client → Master | `{ platform, account_name, ...}` | 创建账号请求 |
| `monitor:create_account_result` | Master → Client | `{ success, data/error }` | 创建账号结果 |
| `monitor:channels` | Master → Client (广播) | `{ channels }` | 更新账号列表 |

## 错误处理

### 客户端错误处理

1. **网络错误**
   - WebSocket连接断开时，操作会失败
   - 需要在UI上显示连接状态

2. **验证错误**
   - 表单验证失败：显示字段错误
   - 服务器验证失败：显示错误消息

3. **超时处理**
   - 可以设置超时定时器
   - 超时后移除事件监听器

### 服务器端错误处理

1. **DAO层错误**
   - 数据库操作失败
   - 返回错误消息到客户端

2. **验证错误**
   - 必填字段缺失
   - 返回明确的错误消息

3. **权限错误**
   - Worker未启用
   - AccountDAO未初始化

## 与HTTP API的对比

| 特性 | WebSocket | HTTP REST API |
|------|-----------|---------------|
| 连接复用 | ✅ 是 | ❌ 否（每次请求新连接） |
| 实时推送 | ✅ 支持 | ❌ 需要轮询 |
| 双向通信 | ✅ 是 | ❌ 单向（请求-响应） |
| 协议统一 | ✅ IM客户端统一 | ❌ 混合协议 |
| 实现复杂度 | ⚖️ 中等 | ⚖️ 简单 |
| 调试难度 | ⚖️ 中等 | ⚖️ 简单 |
| 浏览器支持 | ✅ 现代浏览器 | ✅ 所有浏览器 |
| 防火墙穿透 | ⚠️ 可能被阻挡 | ✅ 通常允许 |

## 测试建议

### 功能测试

1. **正常流程**：
   - 打开添加账号Modal
   - 加载平台和Worker列表
   - 填写表单
   - 提交创建
   - 验证账号出现在列表中

2. **异常流程**：
   - WebSocket未连接时创建账号
   - 必填字段为空提交
   - Master服务器异常

3. **边界情况**：
   - Worker列表为空
   - 平台列表加载失败
   - 快速重复点击提交

### 集成测试

1. 多客户端同步
   - 客户端A创建账号
   - 验证客户端B自动收到更新

2. Worker分配
   - 测试自动分配
   - 测试手动指定

## 性能优化建议

1. **事件监听器管理**
   - 响应后及时移除监听器
   - 避免重复注册

2. **请求防抖**
   - 防止快速重复点击
   - 添加loading状态

3. **错误重试**
   - 网络错误时自动重试
   - 指数退避策略

## 安全考虑

1. **输入验证**
   - 客户端表单验证
   - 服务器端验证（不可信任客户端）

2. **权限检查**
   - 验证WebSocket连接已认证
   - 检查用户权限

3. **数据清理**
   - 防止SQL注入（使用参数化查询）
   - 防止XSS（转义输出）

## 相关文档

- [Master系统文档](./02-MASTER-系统文档.md)
- [消息协议定义](../packages/shared/protocol/messages.js)
- [IM WebSocket Server](../packages/master/src/communication/im-websocket-server.js)
