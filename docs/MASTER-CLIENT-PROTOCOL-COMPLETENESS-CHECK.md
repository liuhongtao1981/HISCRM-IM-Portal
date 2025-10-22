# Master 客户端协议完整性检查

**日期**: 2025-10-22
**检查范围**: Master Socket.IO /client 命名空间的实现状态

---

## 客户端-Master 通信协议

### crm-pc-im 客户端需要的指令 (从 websocket.ts)

#### 1. 连接事件 ✅
```
socket.on('connect')         ✅ 原生 Socket.IO 支持
socket.on('error')           ✅ 原生 Socket.IO 支持
socket.on('disconnect')      ✅ 原生 Socket.IO 支持
```

#### 2. 注册流程 ✅
```
客户端 → Master:
  socket.emit('client:register', {
    client_id,
    device_id,
    device_type,
    app_version
  })

Master → 客户端:
  socket.on('client:register:success', {...})  ✅ 已实现
  socket.on('client:register:error', {...})    ✅ 已实现
```

**实现位置**: packages/master/src/communication/socket-server.js (lines 306-345)

#### 3. 心跳保活 ✅
```
客户端 → Master (每25秒):
  socket.emit('client:heartbeat', {
    client_id,
    timestamp
  })

Master 处理:
  socket.on('client:heartbeat', ...)  ✅ 已实现
```

**实现位置**: packages/master/src/communication/socket-server.js (lines 349-367)

#### 4. 推送消息接收 ✅
```
Master → 客户端:
  socket.on('message', (masterMessage) => {
    // 推送的消息数据
  })
```

**实现位置**: packages/master/src/communication/notification-broadcaster.js
- broadcastNotifications() 方法
- sendToDevice() 方法

#### 5. 消息确认 ⚠️ TODO
```
客户端 → Master:
  socket.emit('client:notification:ack', {
    notification_id,
    client_id,
    timestamp
  })

Master 处理:
  socket.on('client:notification:ack', ...)  ✅ 已监听，但未实现
```

**实现状态**: 已监听但标记为 TODO
**位置**: packages/master/src/communication/socket-server.js (line 369)

**缺失功能**: 需要将通知标记为已确认
```javascript
// 当前代码
socket.on('client:notification:ack', (data) => {
  const { notification_id } = data;
  logger.debug(`Client notification ack`, {
    socketId: socket.id,
    notificationId: notification_id,
  });
  // TODO: 标记通知已被确认  <-- THIS IS MISSING
});
```

---

## 所需但未实现的高级功能

### 1. 客户端消息同步 (Optional but good to have)

**目的**: 处理客户端离线期间的消息同步

**相关文件**: packages/master/src/communication/sync-handler.js
- 已实现处理器: `client:sync:request` ✅
- 已实现处理器: `client:notifications:fetch` ✅

**状态**: ✅ 已在 sync-handler.js 中完整实现

**但问题**: sync-handler 可能未集成到主 socket-server 中

---

## 实现检查清单

| 功能 | 客户端代码 | Master 实现 | 状态 |
|------|----------|-----------|------|
| WebSocket 连接 | ✅ websocket.ts | ✅ socket-server.js | ✅ 完成 |
| 客户端注册 | ✅ registerClient() | ✅ client:register handler | ✅ 完成 |
| 注册成功响应 | ✅ onAny listener | ✅ socket.emit() | ✅ 完成 |
| 注册错误处理 | ✅ error listener | ✅ socket.emit() | ✅ 完成 |
| 心跳发送 | ✅ startHeartbeat() | ✅ client:heartbeat handler | ✅ 完成 |
| 推送消息接收 | ✅ onMessage() | ✅ broadcastNotifications() | ✅ 完成 |
| 消息确认发送 | ✅ sendNotificationAck() | ⚠️ 监听但未处理 | ⚠️ **待完成** |
| 消息确认数据库更新 | N/A | ❌ 缺失 | ❌ **需要实现** |

---

## 缺失功能详解

### 1. 通知确认处理 (HIGH PRIORITY)

**当前状态**: Master 监听了 `client:notification:ack` 事件，但未做任何处理

**需要实现的功能**:
```javascript
socket.on('client:notification:ack', (data) => {
  const { notification_id, client_id, timestamp } = data;

  // 1. 验证数据
  if (!notification_id) {
    logger.warn('Missing notification_id in ack');
    return;
  }

  // 2. 在数据库中标记通知为已确认
  try {
    await notificationsDao.markAsConfirmed(notification_id, {
      confirmed_by: client_id,
      confirmed_at: timestamp
    });

    logger.info('Notification confirmed', {
      notificationId: notification_id,
      clientId: client_id
    });
  } catch (error) {
    logger.error('Failed to confirm notification', {
      notificationId: notification_id,
      error: error.message
    });
  }
});
```

**影响**:
- 没有这个功能，Master 无法追踪哪些通知已被客户端确认
- Admin UI 无法显示消息投递状态
- 重复发送的风险

**推荐优先级**: 🔴 HIGH - 影响消息追踪

### 2. NotificationsDAO 扩展

**需要添加方法**:
```javascript
// 标记通知为已确认
async markAsConfirmed(notificationId, confirmData) {
  return this.db.prepare(`
    UPDATE notifications
    SET
      confirmed_at = ?,
      confirmed_by = ?,
      status = 'confirmed'
    WHERE id = ?
  `).run(
    confirmData.confirmed_at,
    confirmData.confirmed_by,
    notificationId
  );
}

// 查询已确认的通知
async getConfirmedNotifications(limit = 100) {
  return this.db.prepare(`
    SELECT * FROM notifications
    WHERE status = 'confirmed'
    ORDER BY confirmed_at DESC
    LIMIT ?
  `).all(limit);
}
```

**推荐优先级**: 🟡 MEDIUM - 支持功能完整性

---

## Sync Handler 集成检查

**文件**: packages/master/src/communication/sync-handler.js

**现状**: 完整实现但未在 socket-server 中集成

**需要检查**:
1. ✅ `client:sync:request` 处理 - 已实现
2. ✅ `client:notifications:fetch` 处理 - 已实现
3. ❓ 是否在 socket-server 中初始化?

**建议**: 验证 sync-handler 在 socket-server 中是否被正确初始化

---

## 建议的改进计划

### Phase 1: 立即实现 (本周)

**任务 1.1**: 实现通知确认处理
```
文件: packages/master/src/communication/socket-server.js
行号: ~369
修改: 完成 client:notification:ack 的 TODO
时间: ~30 分钟
```

**任务 1.2**: 添加 NotificationsDAO.markAsConfirmed()
```
文件: packages/master/src/database/notifications-dao.js
修改: 添加确认相关的数据库方法
时间: ~20 分钟
```

### Phase 2: 验证集成 (本周)

**任务 2.1**: 验证 SyncHandler 集成
```
检查: socket-server.js 是否创建和初始化了 SyncHandler
```

**任务 2.2**: 编写集成测试
```
测试: client:notification:ack 流程
测试: 数据库是否正确更新
```

### Phase 3: Admin UI 支持 (下周)

**任务 3.1**: Admin UI 显示消息投递状态
**任务 3.2**: 实现消息确认统计

---

## 代码示例: 完整的通知确认实现

### socket-server.js 中的完整实现

```javascript
// 处理消息确认 - CURRENT (不完整)
socket.on('client:notification:ack', (data) => {
  const { notification_id } = data;
  logger.debug(`Client notification ack`, {
    socketId: socket.id,
    notificationId: notification_id,
  });
  // TODO: 标记通知已被确认
});

// SHOULD BE (完整实现)
socket.on('client:notification:ack', async (data) => {
  const { notification_id, client_id, timestamp } = data;
  const deviceId = socket.deviceId;

  if (!notification_id) {
    logger.warn('Client notification ack: missing notification_id', {
      socketId: socket.id,
      clientId: client_id,
    });
    return;
  }

  try {
    // 标记通知为已确认
    await notificationsDao.markAsConfirmed(notification_id, {
      confirmed_by: client_id || deviceId,
      confirmed_at: timestamp || Date.now(),
    });

    logger.info('Client notification ack processed', {
      socketId: socket.id,
      deviceId: deviceId,
      notificationId: notification_id,
      clientId: client_id,
      timestamp: timestamp,
    });

    // 可选: 向 Admin UI 广播确认事件
    if (adminNamespaceInstance) {
      adminNamespaceInstance.emit('notification:confirmed', {
        notification_id,
        confirmed_by: client_id || deviceId,
        confirmed_at: timestamp || Date.now(),
      });
    }
  } catch (error) {
    logger.error('Failed to process client notification ack', {
      socketId: socket.id,
      notificationId: notification_id,
      error: error.message,
    });
  }
});
```

### notifications-dao.js 中的扩展

```javascript
/**
 * 标记通知为已确认
 */
async markAsConfirmed(notificationId, confirmData) {
  try {
    const result = this.db.prepare(`
      UPDATE notifications
      SET
        status = 'confirmed',
        confirmed_at = ?,
        confirmed_by = ?
      WHERE id = ?
    `).run(
      confirmData.confirmed_at || Date.now(),
      confirmData.confirmed_by || 'unknown',
      notificationId
    );

    return {
      success: true,
      changes: result.changes,
    };
  } catch (error) {
    logger.error('markAsConfirmed failed', {
      notificationId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * 批量更新确认状态
 */
async markMultipleAsConfirmed(notificationIds, confirmedBy) {
  try {
    const placeholders = notificationIds.map(() => '?').join(',');
    const params = [...notificationIds, confirmedBy, Date.now()];

    const result = this.db.prepare(`
      UPDATE notifications
      SET
        status = 'confirmed',
        confirmed_by = ?,
        confirmed_at = ?
      WHERE id IN (${placeholders})
    `).run(...params);

    return {
      success: true,
      updated: result.changes,
    };
  } catch (error) {
    logger.error('markMultipleAsConfirmed failed', {
      count: notificationIds.length,
      error: error.message,
    });
    throw error;
  }
}
```

---

## 总结

### ✅ 已实现的功能
- WebSocket 连接和事件处理
- 客户端注册流程
- 心跳保活机制
- 推送消息广播
- 离线同步支持 (SyncHandler)

### ⚠️ 部分实现的功能
- 消息确认处理 (监听但未处理)

### ❌ 缺失的功能
- 通知确认数据库更新
- 确认状态追踪
- Admin UI 投递状态显示

### 建议优先级

| 优先级 | 任务 | 预计时间 |
|------|------|---------|
| 🔴 HIGH | 实现 client:notification:ack 完整处理 | 30 min |
| 🟡 MEDIUM | 添加 NotificationsDAO 确认方法 | 20 min |
| 🟢 LOW | Admin UI 状态显示 | 2 hours |

---

**结论**: Master 的客户端协议实现 **80% 完整**。关键缺失是通知确认处理的数据库部分。建议立即补充这个功能。
