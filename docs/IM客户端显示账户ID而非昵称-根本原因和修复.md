# IM 客户端显示账户ID而非昵称 - 根本原因和修复

## 问题描述

IM 客户端（CRM PC IM）的左侧账户列表显示的是账户 ID（如 `acc-98296c87-2e42-447a-9d8b-8be008ddb6e4`），而不是平台昵称（如"向阳而生"）。

### 用户期望

根据 Web Admin 的显示效果，IM 客户端应该显示：
- **平台头像**（从 `user_info.avatar`）
- **平台昵称**（从 `user_info.nickname`）
- **平台账号 ID**（通用 `platformUserId` 字段）

## 调试过程

### 1. 初步排查

首先检查了数据库中的 `user_info` 字段：

```bash
node tests/check-userinfo-field.js
```

**结果**：数据库中有正确的 `user_info` 数据：

```json
{
  "avatar": "https://p11.douyinpic.com/aweme/100x100/...",
  "nickname": "向阳而生",
  "uid": "35263030952",
  "douyin_id": "35263030952",
  "followers": "30",
  "following": "30",
  "signature": "临终关怀是人类文明最重要的精神基建之一..."
}
```

### 2. 代码检查

检查了三个关键文件的修改：

1. **服务端**：`packages/master/src/communication/im-websocket-server.js`
   - 第274行：✅ 已添加 `userInfo: userInfo` 字段

2. **类型定义**：`packages/crm-pc-im/src/shared/types-monitor.ts`
   - 第11行：✅ 已添加 `userInfo?: string` 字段

3. **客户端**：`packages/crm-pc-im/src/pages/MonitorPage.tsx`
   - 第515-562行：✅ 已添加 userInfo 解析和显示逻辑

代码看起来都是正确的，但是问题依然存在。

### 3. WebSocket 连接测试

运行测试脚本：

```bash
node tests/debug-im-userinfo.js
```

**关键发现**：

```
✅ 已连接到 Master
📤 发送 monitor:register 事件...
📨 收到事件: error [{"message":"监控注册失败"}]
```

**监控注册失败！** 这就是根本原因。

### 4. 服务器端错误定位

检查 `im-websocket-server.js` 的 `handleMonitorRegister` 方法（第97-130行）：

```javascript
handleMonitorRegister(socket, data) {
  try {
    // ...
    const channels = this.getChannelsFromDataStore();  // ← 这里出错
    socket.emit('monitor:channels', { channels });
    // ...
  } catch (error) {
    logger.error('[IM WS] Monitor register error:', error);
    socket.emit('error', { message: '监控注册失败' });  // ← 错误被捕获
  }
}
```

### 5. 根本原因

在 `getChannelsFromDataStore()` 方法中（第249行）：

```javascript
const accountInfo = this.accountDAO.getAccountById(accountId);
```

**问题**：`this.accountDAO` 从来没有被初始化！

#### 构造函数（修复前）

```javascript
class IMWebSocketServer {
  constructor(io, dataStore, cacheDAO = null) {
    this.io = io;
    this.dataStore = dataStore;
    this.cacheDAO = cacheDAO;
    // ❌ 缺少 this.accountDAO 的初始化
  }
}
```

#### 初始化调用（修复前）

在 `packages/master/src/index.js` 第535行：

```javascript
const imWebSocketServer = new IMWebSocketServer(socketNamespaces.io, dataStore, cacheDAO);
// ❌ 没有传递 accountsDAO
```

## 修复方案

### 1. 修改 IMWebSocketServer 构造函数

**文件**：`packages/master/src/communication/im-websocket-server.js`

**修改前**：
```javascript
constructor(io, dataStore, cacheDAO = null) {
  this.io = io;
  this.dataStore = dataStore;
  this.cacheDAO = cacheDAO;
}
```

**修改后**：
```javascript
constructor(io, dataStore, cacheDAO = null, accountDAO = null) {
  this.io = io;
  this.dataStore = dataStore;
  this.cacheDAO = cacheDAO;
  this.accountDAO = accountDAO;  // ✅ 添加 accountDAO
}
```

### 2. 修改初始化代码

**文件**：`packages/master/src/index.js`

**修改前**（第532-537行）：
```javascript
// 4.3 初始化 IM WebSocket 服务器 (CRM PC IM 客户端)
// 使用 CacheDAO 支持已读状态处理（从 cache_* 表读取）
const IMWebSocketServer = require('./communication/im-websocket-server');
const imWebSocketServer = new IMWebSocketServer(socketNamespaces.io, dataStore, cacheDAO);
imWebSocketServer.setupHandlers();
logger.info('IM WebSocket Server initialized with CacheDAO support');
```

**修改后**（第532-540行）：
```javascript
// 4.3 初始化 IM WebSocket 服务器 (CRM PC IM 客户端)
// 使用 CacheDAO 支持已读状态处理（从 cache_* 表读取）
// 使用 AccountsDAO 获取账户信息（user_info, avatar等）
const AccountsDAO = require('./database/accounts-dao');
const accountsDAO = new AccountsDAO(db);
const IMWebSocketServer = require('./communication/im-websocket-server');
const imWebSocketServer = new IMWebSocketServer(socketNamespaces.io, dataStore, cacheDAO, accountsDAO);
imWebSocketServer.setupHandlers();
logger.info('IM WebSocket Server initialized with CacheDAO and AccountsDAO support');
```

## 数据流

修复后的完整数据流：

```
1. Worker 爬取数据 → 推送到 Master DataStore
   └─ 包含账户基本信息

2. IM 客户端连接 → 发送 monitor:register 事件

3. Master 处理注册：
   └─ handleMonitorRegister()
      └─ getChannelsFromDataStore()
         ├─ 从 DataStore 获取账户列表
         ├─ 从数据库查询 user_info（✅ 需要 accountsDAO）
         │  └─ accountsDAO.getAccountById(accountId)
         │     └─ 返回 { account_name, avatar, user_info, ... }
         └─ 构造 channel 对象：
            {
              id: accountId,
              name: accountName,
              avatar: avatar,
              userInfo: userInfo,  // ✅ JSON 字符串
              platform: platform,
              ...
            }

4. Master 推送 → socket.emit('monitor:channels', { channels })

5. IM 客户端接收 → 解析 userInfo：
   const parsed = JSON.parse(channel.userInfo)
   └─ 显示：
      ├─ 头像：parsed.avatar
      ├─ 昵称：parsed.nickname
      └─ 账号ID：parsed.platformUserId || parsed.douyin_id
```

## 测试验证

### 1. 启动 Master 服务器

```bash
cd packages/master
npm start
```

### 2. 运行测试脚本

```bash
cd tests
node debug-im-userinfo.js
```

**预期输出**：

```
✅ 已连接到 Master
📤 发送 monitor:register 事件...
📨 收到事件: monitor:registered {"success":true,"channelCount":1,"clientId":"debug-client","clientType":"monitor"}
📨 收到事件: monitor:channels ...
=== 收到 monitor:channels 事件 ===
频道数量: 1

频道 1:
  id: acc-98296c87-2e42-447a-9d8b-8be008ddb6e4
  name: douyin-test
  avatar: https://p11.douyinpic.com/aweme/100x100/...
  platform: douyin
  userInfo 字段: 存在
  userInfo 类型: string
  userInfo 长度: 345 字符
  ✅ userInfo 解析成功:
    - nickname: 向阳而生
    - douyin_id: 35263030952
    - platformUserId: 35263030952
    - avatar: https://p11.douyinpic.com/aweme/100x100/...
    - uid: 35263030952
```

### 3. 启动 IM 客户端

```bash
cd packages/crm-pc-im
npm run dev
```

**预期效果**：

左侧账户列表显示：
- ✅ 平台头像（用户真实头像）
- ✅ 平台昵称："向阳而生"
- ✅ 平台账号ID："35263030952"

## 总结

### 问题本质

**表面现象**：IM 客户端显示账户 ID 而不是昵称

**根本原因**：`IMWebSocketServer` 缺少 `accountsDAO` 依赖，导致注册失败，客户端无法接收到包含 `userInfo` 的频道数据

### 关键教训

1. **依赖注入不完整**：构造函数需要的依赖没有被传入
2. **错误被静默捕获**：`try-catch` 吞掉了错误，导致难以发现
3. **客户端没有错误处理**：客户端没有监听 `error` 事件，无法发现注册失败
4. **缺少日志**：服务端错误日志没有打印到控制台

### 改进建议

1. **构造函数参数验证**：
   ```javascript
   constructor(io, dataStore, cacheDAO, accountDAO) {
     if (!accountDAO) {
       throw new Error('accountDAO is required');
     }
     // ...
   }
   ```

2. **更详细的错误日志**：
   ```javascript
   catch (error) {
     logger.error('[IM WS] Monitor register error:', error);
     logger.error('[IM WS] Stack trace:', error.stack);  // ✅ 打印堆栈
     socket.emit('error', { message: '监控注册失败', details: error.message });
   }
   ```

3. **客户端错误监听**：
   ```javascript
   socket.on('error', (error) => {
     console.error('[IM WS] 服务器错误:', error);
     notification.error({
       message: 'WebSocket 错误',
       description: error.message
     });
   });
   ```

## 文件清单

### 修改的文件

1. `packages/master/src/communication/im-websocket-server.js`
   - 第12行：添加 `accountDAO` 参数
   - 第16行：初始化 `this.accountDAO`

2. `packages/master/src/index.js`
   - 第535-536行：初始化 `AccountsDAO`
   - 第538行：传递 `accountsDAO` 给 `IMWebSocketServer`

### 测试脚本

1. `tests/debug-im-userinfo.js` - WebSocket 连接和数据验证
2. `tests/check-userinfo-field.js` - 数据库 user_info 验证

## 版本信息

- **修复日期**：2025-11-05
- **Master 服务器版本**：1.0.0
- **影响的客户端**：CRM PC IM (Electron)
- **数据库版本**：v1.0 (2025-10-21)
