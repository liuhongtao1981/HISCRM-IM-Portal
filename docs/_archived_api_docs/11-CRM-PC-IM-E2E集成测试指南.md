# crm-pc-im ↔ Master 真实 E2E 集成测试指南

**目的**: 验证 crm-pc-im 客户端与真实 Master 系统的完整通信流程
**难度**: ⭐⭐ 中等
**耗时**: 30-45 分钟
**日期**: 2025-10-22

---

## 📋 测试前置条件

### 环境检查

```bash
# 1. 检查 Node.js 版本
node --version  # 需要 >= 18.x

# 2. 检查项目依赖
cd packages/master && npm list socket.io
cd packages/crm-pc-im && npm list socket.io-client

# 3. 检查端口可用性
lsof -i :3000   # Master 端口
lsof -i :5173   # crm-pc-im 开发服务器
```

### 数据库准备

```bash
# 确保 Master 数据库存在且已初始化
ls -lh packages/master/data/master.db

# 检查数据库中的账户
sqlite3 packages/master/data/master.db "SELECT id, platform, login_status FROM accounts LIMIT 5;"
```

---

## 🚀 完整 E2E 测试步骤

### 步骤 1: 启动 Master 服务器 (Terminal 1)

```bash
cd packages/master
npm start

# 期望输出:
# Master Server Started
# Port: 3000
# Namespaces: /worker, /client, /admin
```

**验证点:**
- ✓ 输出 "Master Server Started"
- ✓ Socket.IO 服务器初始化成功
- ✓ /client 命名空间已创建
- ✓ 监听端口 3000

### 步骤 2: 启动 crm-pc-im 开发服务器 (Terminal 2)

```bash
cd packages/crm-pc-im
npm install  # 首次运行需要
npm run dev

# 期望输出:
# ➜  Local:   http://localhost:5173/
# ➜  press h to show help
```

**验证点:**
- ✓ Vite 开发服务器启动
- ✓ 可访问 http://localhost:5173

### 步骤 3: 在浏览器中打开应用

1. 打开浏览器
2. 访问 `http://localhost:5173`
3. 打开 **DevTools** (F12 或 Ctrl+Shift+I)
4. 切换到 **Console** 选项卡

**期望输出:**

```
[WebSocket] 正在连接到 Master: http://localhost:3000
[WebSocket] 已连接到 Master
[WebSocket] 正在向 Master 注册客户端: {clientId, deviceType}
[WebSocket] 客户端注册成功: {session_id, device_id}
[WebSocket] 启动心跳机制，间隔: 25000 ms
```

**故障排除:**

| 问题 | 原因 | 解决方案 |
|------|------|--------|
| "连接超时" | Master 未运行 | 检查 Terminal 1 是否启动了 Master |
| "CORS 错误" | 跨域配置 | 检查 Master 的 CORS 设置 |
| "注册失败" | 客户端处理器未初始化 | 检查 Master 日志中的错误消息 |

---

### 步骤 4: 监控 Master 日志

保持 Terminal 1 的日志可见，观察：

```
[socket-server] Client connected: <socket-id>
[socket-server] Client registered: <device-id>
[heartbeat-monitor] Client heartbeat received from <device-id>
```

**验证点:**
- ✓ Master 接收客户端连接
- ✓ 客户端注册请求被处理
- ✓ 定期接收心跳信号（每 25 秒）

---

### 步骤 5: 在 Master 中推送测试消息

#### 方法 A: 通过 Master HTTP API

```bash
# 获取一个客户端 ID (从浏览器 Console 中复制)
CLIENT_ID="<从浏览器复制的设备ID>"

# 推送消息到客户端
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "'$CLIENT_ID'",
    "account_id": "test-account",
    "sender_id": "user-123",
    "sender_name": "Test User",
    "type": "TEXT",
    "content": "这是一条测试消息",
    "created_at": '$(date +%s)'
  }'
```

#### 方法 B: 通过 SQL 直接插入通知

```bash
sqlite3 packages/master/data/master.db << EOF
INSERT INTO notifications (
  id, device_id, notification_type, subject, message, data, is_read, created_at
) VALUES (
  'test-notif-001',
  '<设备ID>',
  'message',
  'Test Message',
  'This is a test message from Master',
  '{"account_id":"test-account","sender_id":"user-123"}',
  0,
  datetime('now')
);
EOF
```

#### 方法 C: 通过 Master Debug API (如果可用)

```bash
# 查看 Master Debug API 端点
curl http://localhost:3000/api/debug/help

# 推送测试通知
curl -X POST http://localhost:3000/api/debug/notifications/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "client_ids": ["<设备ID>"],
    "message": {
      "id": "test-msg-1",
      "account_id": "test-account",
      "sender_id": "user-123",
      "sender_name": "Test Sender",
      "type": "TEXT",
      "content": "Test message",
      "created_at": '$(date +%s)'
    }
  }'
```

---

### 步骤 6: 验证客户端接收消息

#### 在浏览器 Console 中观察:

```javascript
// 应该看到类似的日志:
[WebSocket] 收到 Master 消息: {
  id: "test-msg-1",
  account_id: "test-account",
  sender_id: "user-123",
  ...
}

// 消息自动转换为 crm 格式:
{
  id: "test-msg-1",
  fromId: "user-123",    // ← 转换成功
  fromName: "Test Sender",
  topic: "test-account",  // ← 转换成功
  type: "text",           // ← 类型转换成功
  content: "Test message",
  timestamp: 1697952000000 // ← 时间戳转换成功 (毫秒)
}
```

**验证点:**
- ✓ 消息在浏览器 Console 中可见
- ✓ 协议字段映射正确 (account_id → topic, sender_id → fromId)
- ✓ 类型转换正确 (TEXT → text)
- ✓ 时间戳转换正确 (秒 → 毫秒)

---

### 步骤 7: 验证消息确认机制

#### 在 Master 日志中观察:

```
[socket-server] Client <device-id> sent acknowledgment for message <msg-id>
```

#### 在 SQLite 中验证:

```bash
sqlite3 packages/master/data/master.db \
  "SELECT id, is_read FROM notifications WHERE id='test-notif-001';"

# 输出应该显示:
# test-notif-001|1  (is_read = 1)
```

**验证点:**
- ✓ Master 接收消息确认
- ✓ 数据库中 is_read 字段更新为 1
- ✓ 心跳机制继续运行

---

### 步骤 8: 测试消息发送功能 (可选)

#### 从浏览器发送消息到 Master:

```javascript
// 在浏览器 Console 中执行:
const { websocketService } = require('@services/websocket');

const testMessage = {
  id: 'msg-send-test-' + Date.now(),
  fromId: 'current-user',
  fromName: 'Current User',
  topic: 'test-account',
  content: 'Message from client to Master',
  type: 'text',
  timestamp: Date.now()
};

websocketService.sendMessage(testMessage);
```

#### 在 Master 日志中验证:

```
[socket-server] Client message received:
{
  id: "msg-send-test-...",
  account_id: "test-account",      // ← 自动转换 (topic → account_id)
  sender_id: "current-user",       // ← 自动转换 (fromId → sender_id)
  type: "TEXT",                    // ← 自动转换 (text → TEXT)
  created_at: 1697952000          // ← 自动转换 (ms → s)
}
```

**验证点:**
- ✓ 消息发送成功
- ✓ 反向协议转换正确
- ✓ 字段映射完整

---

## 📊 完整测试检查清单

| # | 检查项 | 状态 | 备注 |
|---|--------|------|------|
| 1 | Master 服务器启动成功 | ☐ | 查看端口 3000 日志 |
| 2 | crm-pc-im 开发服务器启动 | ☐ | Vite 输出 Local 地址 |
| 3 | 浏览器连接到 Master | ☐ | Console: "已连接到 Master" |
| 4 | 客户端注册成功 | ☐ | Console: "客户端注册成功" |
| 5 | 心跳机制运行 | ☐ | Master 日志每 25 秒更新 |
| 6 | Master 推送消息 | ☐ | 使用 API/SQL 推送 |
| 7 | 客户端接收消息 | ☐ | Console 显示收到消息 |
| 8 | 协议转换正确 | ☐ | 字段映射完整 |
| 9 | 消息确认接收 | ☐ | Master 日志显示 ack |
| 10 | 客户端发送消息 | ☐ | Master 接收并转换 |

---

## 🔍 调试技巧

### 启用详细日志

#### 在浏览器 Console 中:

```javascript
// 启用所有 WebSocket 事件
const { websocketService } = require('@services/websocket');

websocketService.onAny((eventName, ...args) => {
  console.log(`🔔 Event: ${eventName}`, args);
});
```

#### 在 Master 中:

```bash
# 设置日志级别为 debug
export LOG_LEVEL=debug
npm start

# 监听特定事件
tail -f logs/master.log | grep "client"
```

### 监控网络请求

1. 打开 DevTools → **Network** 选项卡
2. 过滤 WebSocket 连接
3. 观察消息流:
   - **Green**: client:register (注册)
   - **Blue**: client:heartbeat (心跳)
   - **Yellow**: message (消息)
   - **Red**: client:notification:ack (确认)

### 检查浏览器存储

```javascript
// 查看存储的设备 ID
localStorage.getItem('crm_pc_im_device_id')

// 检查 Socket.IO 配置
const { websocketService } = require('@services/websocket');
console.log(websocketService.getClientId());
console.log(websocketService.getIsConnected());
```

---

## 🐛 常见问题和解决方案

### 问题 1: 注册超时 (10s)

**症状**: Console 显示 "注册超时"

**原因**:
- Master /client 命名空间未初始化
- 客户端未连接到正确的命名空间
- 防火墙阻止

**解决方案**:
```bash
# 检查 Master 日志
grep "Socket.IO.*client" logs/master.log

# 检查 Master 源代码
grep -r "client:register" packages/master/src/

# 重启 Master
kill $(lsof -t -i :3000)
npm start
```

### 问题 2: 无法接收消息

**症状**: Console 没有收到消息

**原因**:
- Master 没有推送消息
- 消息没有指向正确的设备 ID
- 消息监听器未注册

**解决方案**:
```javascript
// 验证监听器已注册
const { websocketService } = require('@services/websocket');
console.log('消息回调数:', websocketService.messageCallbacks?.length || 0);

// 重新注册监听器
websocketService.onMessage((msg) => {
  console.log('🎉 收到消息:', msg);
});
```

### 问题 3: 消息协议转换错误

**症状**: 消息接收到但字段映射不正确

**原因**:
- protocol-converter.ts 中的映射配置错误
- Master 消息格式与预期不符

**解决方案**:
```javascript
// 在 Console 中检查转换逻辑
const { convertMasterToCrm } = require('@services/protocol-converter');

const masterMsg = {
  account_id: 'test',
  sender_id: 'user1',
  // ...
};

const crmMsg = convertMasterToCrm(masterMsg);
console.log('转换结果:', crmMsg);
// 应该显示: { topic: 'test', fromId: 'user1', ... }
```

---

## 📈 性能验证

### 检查内存使用

```javascript
// 在浏览器 Console 中
performance.memory // 显示内存使用情况

// 发送 100 条消息后检查
console.log('发送 100 条消息前:', performance.memory.usedJSHeapSize);
// ... 发送消息 ...
console.log('发送 100 条消息后:', performance.memory.usedJSHeapSize);
// 增长应该 < 10MB
```

### 检查消息延迟

```javascript
const { websocketService } = require('@services/websocket');

let messageCount = 0;
let totalLatency = 0;

websocketService.onMessage((msg) => {
  const latency = Date.now() - msg.timestamp;
  messageCount++;
  totalLatency += latency;
  console.log(`消息 #${messageCount} 延迟: ${latency}ms`);

  if (messageCount >= 100) {
    console.log(`平均延迟: ${(totalLatency / messageCount).toFixed(2)}ms`);
  }
});
```

**期望结果**:
- ✓ 消息延迟 < 100ms (本地网络)
- ✓ 内存增长线性且稳定
- ✓ 心跳间隔稳定在 25 秒

---

## ✅ 测试成功标准

### 基础标准 (必须)

- [ ] Master 服务器启动并监听 3000 端口
- [ ] crm-pc-im 客户端连接到 Master
- [ ] 客户端成功注册 (收到 client:register:success)
- [ ] 心跳机制正常运行
- [ ] Master 可以推送消息到客户端
- [ ] 协议转换正确 (所有字段映射都正确)
- [ ] 消息确认机制工作正常

### 高级标准 (加分)

- [ ] 客户端可以发送消息到 Master
- [ ] 消息延迟 < 100ms
- [ ] 内存使用稳定，无泄漏
- [ ] 在低网络条件下也能正常工作
- [ ] 支持消息批处理

### 完美标准 (优秀)

- [ ] 实现自动重连机制
- [ ] 本地消息缓存和同步
- [ ] 消息去重逻辑
- [ ] 离线消息队列
- [ ] UI 层完整集成并显示消息

---

## 📝 测试报告模板

```markdown
# crm-pc-im ↔ Master E2E 测试报告

**测试日期**: 2025-10-22
**测试环境**: Windows 10, Node.js 18.x
**测试人员**: [名字]

## 测试结果

| 检查项 | 结果 | 时间 | 备注 |
|--------|------|------|------|
| Master 启动 | ✅/❌ | | |
| 客户端连接 | ✅/❌ | | |
| 客户端注册 | ✅/❌ | | |
| 消息推送 | ✅/❌ | | |
| 协议转换 | ✅/❌ | | |
| 消息确认 | ✅/❌ | | |

## 遇到的问题

(列出测试过程中遇到的任何问题及解决方案)

## 性能指标

- 消息延迟: ____ ms
- 内存增长: ____ MB
- 心跳间隔: ____ s

## 结论

(整体评估测试结果)
```

---

## 🎓 学到的内容

通过这个 E2E 测试，你将学到:

1. ✅ Master-Client Socket.IO 通信工作原理
2. ✅ 协议转换在实际中如何工作
3. ✅ WebSocket 调试技巧
4. ✅ 消息确认和心跳机制的重要性
5. ✅ 客户端-服务器通信的完整流程

---

## 📞 遇到问题？

1. **检查 Master 日志** - 查看是否有错误消息
2. **查看浏览器 Console** - 查看客户端日志
3. **检查网络** - 使用 DevTools Network 选项卡
4. **查看相关文档**:
   - [快速集成指南](./10-CRM-PC-IM-Master快速集成指南.md)
   - [验证报告](./09-CRM-PC-IM-Master集成验证报告.md)
   - [Master 系统文档](./02-MASTER-系统文档.md)

---

**更新日期**: 2025-10-22
**版本**: 1.0
**维护人**: Claude Code 代理
