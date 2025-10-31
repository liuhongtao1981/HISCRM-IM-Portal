# Worker 内存数据架构使用指南

## 📋 概述

Worker 端已实现完整的内存数据管理架构，无需额外开发。本文档说明现有架构的工作原理和使用方法。

## 🎯 核心架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         数据流架构                                    │
└─────────────────────────────────────────────────────────────────────┘

Worker 进程                    Master 服务器               CRM PC IM
────────────                   ────────────               ─────────

爬虫模块                       DataStore                  WebSocket
  ↓                              ↓                          ↓
AccountDataManager         DataSyncReceiver           UI 组件
(内存完整数据)              (接收并转换)                 (显示)
  ↓                              ↓                          ↓
DataPusher                 IMWebSocketServer          原有接口
  ↓                              ↓                          ↓
推送快照 (30秒)  ────────→   channels/topics  ←──────   100% 兼容
                              /messages
```

## 🏗️ 核心组件

### 1. AccountDataManager（Worker 端）

**位置：** `packages/worker/src/platforms/base/account-data-manager.js`

**功能：**
- 每个账户维护一个独立实例
- 内存中存储完整数据结构
- 自动定期推送到 Master（30 秒）

**数据结构：**
```javascript
{
  conversations: DataCollection,  // 会话集合
  messages: DataCollection,       // 私信集合
  contents: DataCollection,       // 作品集合
  comments: DataCollection,       // 评论集合
  notifications: DataCollection,  // 通知集合
}
```

**关键特性：**
- ✅ 数据状态管理（NEW/UPDATED/SYNCED）
- ✅ 数据来源追踪（API/FIBER/DOM）
- ✅ 标准化数据模型
- ✅ 自动同步机制

### 2. DataCollection（数据集合类）

**位置：** `packages/worker/src/platforms/base/data-models.js`

**功能：**
- 存储同类型数据的集合
- 支持状态管理和过滤

**使用示例：**
```javascript
// 添加或更新评论
dataManager.upsertComment(commentData);

// 添加或更新会话
dataManager.upsertConversation(conversationData);

// 添加或更新私信
dataManager.upsertMessage(messageData);

// 添加或更新作品
dataManager.upsertContent(contentData);
```

### 3. DataPusher（数据推送器）

**位置：** `packages/worker/src/platforms/base/data-pusher.js`

**功能：**
- 将 Worker 数据推送到 Master
- 支持完整快照推送（`pushDataSync()`）

**推送流程：**
```javascript
// 自动调用（由 AccountDataManager 触发）
dataPusher.pushDataSync({
  accountId: 'dy_123456',
  platform: 'douyin',
  snapshot: {
    platform: 'douyin',
    data: {
      comments: [...],
      contents: [...],
      conversations: [...],
      messages: [...],
      notifications: [...],
    }
  },
  timestamp: Date.now(),
});
```

### 4. Master DataStore（Master 端）

**位置：** `packages/master/src/data/data-store.js`

**功能：**
- 接收 Worker 推送的数据
- 内存中存储所有账户数据
- 提供查询接口

**数据结构：**
```javascript
{
  accounts: Map {
    'dy_123456' => {
      accountId: 'dy_123456',
      platform: 'douyin',
      lastUpdate: 1698765432000,
      data: {
        comments: Map,
        contents: Map,
        conversations: Map,
        messages: Map,
        notifications: Map,
      }
    }
  }
}
```

### 5. DataSyncReceiver（Master 端）

**位置：** `packages/master/src/communication/data-sync-receiver.js`

**功能：**
- 接收 Worker 的 `WORKER_DATA_SYNC` 消息
- 更新 DataStore
- 发送 ACK 确认

**处理流程：**
```javascript
// Worker 发送
WORKER_DATA_SYNC {
  accountId,
  platform,
  snapshot,
  timestamp
}

// Master 接收并处理
dataStore.updateAccountData(accountId, snapshot);

// 发送确认
WORKER_DATA_SYNC_ACK {
  success: true,
  accountId,
  timestamp,
  stats: {...}
}
```

### 6. IMWebSocketServer（Master 端）

**位置：** `packages/master/src/communication/im-websocket-server.js`

**功能：**
- 实现 CRM IM Server 协议
- 从 DataStore 读取数据
- 提供原有接口

**接口映射：**
```javascript
// 频道列表（账户列表）
getChannelsFromDataStore() → accounts

// 主题列表（作品/会话）
getTopicsFromDataStore(channelId) → contents + conversations

// 消息列表（评论/私信）
getMessagesFromDataStore(topicId) → comments + messages
```

## 🔄 数据流程

### 1. Worker 端数据采集

```javascript
// 平台实现示例（DouyinPlatform）
class DouyinPlatform extends PlatformBase {
  async startMonitoring(accountId) {
    // 创建数据管理器
    this.dataManager = new AccountDataManager(
      accountId,
      'douyin',
      this.dataPusher
    );

    // 爬取评论
    const comments = await this.crawlComments(accountId);
    comments.forEach(comment => {
      this.dataManager.upsertComment(comment);
    });

    // 爬取作品
    const contents = await this.crawlContents(accountId);
    contents.forEach(content => {
      this.dataManager.upsertContent(content);
    });

    // 爬取私信
    const messages = await this.crawlDirectMessages(accountId);
    messages.forEach(message => {
      this.dataManager.upsertMessage(message);
    });

    // 自动定期推送（30 秒）
    // dataManager 内部自动调用 startDataSnapshot()
  }
}
```

### 2. Master 端数据接收

```javascript
// Master 启动时初始化
const dataStore = new DataStore();
const dataSyncReceiver = new DataSyncReceiver(dataStore);
const imWebSocketServer = new IMWebSocketServer(io, dataStore);

// 注册消息处理器
socketServer.on('WORKER_DATA_SYNC', (socket, message) => {
  dataSyncReceiver.handleWorkerDataSync(socket, message);

  // 通知 IM 客户端更新
  imWebSocketServer.onDataStoreUpdate(message.payload.accountId);
});
```

### 3. PC IM 端访问

```javascript
// 客户端连接
socket.emit('monitor:register', {
  clientId: 'client_001',
  clientType: 'monitor'
});

// 请求频道列表（账户）
socket.emit('monitor:request_channels');
socket.on('monitor:channels', ({ channels }) => {
  // channels = 所有账户列表
  console.log('频道列表:', channels);
});

// 请求主题列表（作品/会话）
socket.emit('monitor:request_topics', { channelId: 'dy_123456' });
socket.on('monitor:topics', ({ channelId, topics }) => {
  // topics = 该账户的所有作品和会话
  console.log('主题列表:', topics);
});

// 请求消息列表（评论/私信）
socket.emit('monitor:request_messages', { topicId: 'work_001' });
socket.on('monitor:messages', ({ topicId, messages }) => {
  // messages = 该主题下的所有评论或私信
  console.log('消息列表:', messages);
});
```

## 📊 数据模型

### Conversation（会话）

```javascript
{
  id: "conv_001",                    // 唯一 ID
  accountId: "dy_123456",            // 账户 ID
  platform: "douyin",                // 平台
  conversationId: "conv_123",        // 平台会话 ID
  type: "direct",                    // 会话类型
  userId: "user_123",                // 对方用户 ID
  userName: "用户名",                // 对方用户名
  userAvatar: "https://...",         // 对方头像
  unreadCount: 5,                    // 未读数
  lastMessageContent: "最后消息",    // 最后消息内容
  lastMessageTime: 1698765432000,    // 最后消息时间
  status: DataStatus.NEW,            // 状态
  source: DataSource.API,            // 数据来源
  createdAt: 1698765432000,          // 创建时间
  updatedAt: 1698765432000,          // 更新时间
}
```

### Message（私信）

```javascript
{
  id: "msg_001",                     // 唯一 ID
  accountId: "dy_123456",            // 账户 ID
  platform: "douyin",                // 平台
  messageId: "msg_123",              // 平台消息 ID
  conversationId: "conv_001",        // 会话 ID
  senderId: "user_123",              // 发送者 ID
  senderName: "发送者",              // 发送者名称
  senderAvatar: "https://...",       // 发送者头像
  content: "消息内容",               // 消息内容
  messageType: "text",               // 消息类型（text/image/video）
  mediaUrls: [],                     // 媒体 URL 数组
  replyToMessageId: null,            // 回复的消息 ID
  status: DataStatus.NEW,            // 状态
  isRead: false,                     // 是否已读
  createdAt: 1698765432000,          // 创建时间
}
```

### Content（作品）

```javascript
{
  id: "content_001",                 // 唯一 ID
  accountId: "dy_123456",            // 账户 ID
  platform: "douyin",                // 平台
  contentId: "7123456789",           // 平台作品 ID
  type: "video",                     // 作品类型（video/image）
  title: "作品标题",                 // 标题
  coverUrl: "https://...",           // 封面 URL
  mediaUrls: ["https://..."],        // 媒体 URL 数组
  viewCount: 1000,                   // 播放量
  likeCount: 100,                    // 点赞数
  commentCount: 50,                  // 评论数
  shareCount: 20,                    // 分享数
  publishTime: 1698765432000,        // 发布时间
  tags: ["标签1", "标签2"],          // 标签
  status: DataStatus.NEW,            // 状态
}
```

### Comment（评论）

```javascript
{
  id: "comment_001",                 // 唯一 ID
  accountId: "dy_123456",            // 账户 ID
  platform: "douyin",                // 平台
  commentId: "7123456789",           // 平台评论 ID
  contentId: "content_001",          // 作品 ID
  userId: "user_123",                // 评论者 ID
  userName: "评论者",                // 评论者名称
  userAvatar: "https://...",         // 评论者头像
  content: "评论内容",               // 评论内容
  likeCount: 10,                     // 点赞数
  replyCount: 5,                     // 回复数
  parentCommentId: null,             // 父评论 ID
  status: DataStatus.NEW,            // 状态
  createdAt: 1698765432000,          // 创建时间
}
```

### Notification（通知）

```javascript
{
  id: "notification_001",            // 唯一 ID
  accountId: "dy_123456",            // 账户 ID
  platform: "douyin",                // 平台
  notificationId: "notif_123",       // 平台通知 ID
  type: "comment",                   // 通知类型
  title: "新评论通知",               // 标题
  content: "您收到了新评论",         // 内容
  relatedId: "comment_001",          // 关联 ID
  relatedType: "comment",            // 关联类型
  isRead: false,                     // 是否已读
  status: DataStatus.NEW,            // 状态
  createdAt: 1698765432000,          // 创建时间
}
```

## 🔧 配置选项

### AccountDataManager 配置

```javascript
// 推送配置
this.pushConfig = {
  interval: 5000,           // 推送间隔（毫秒）
  batchSize: 100,           // 批量推送大小
  autoSync: true,           // 是否自动同步
};

// 修改配置
dataManager.pushConfig.interval = 30000;  // 改为 30 秒
dataManager.pushConfig.autoSync = false;  // 禁用自动同步
```

### 数据状态

```javascript
DataStatus = {
  NEW: 'new',           // 新数据，未推送
  UPDATED: 'updated',   // 已更新，未推送
  SYNCED: 'synced',     // 已同步
};
```

### 数据来源

```javascript
DataSource = {
  API: 'api',           // API 拦截
  FIBER: 'fiber',       // React Fiber 提取
  DOM: 'dom',           // DOM 解析
};
```

## 📈 监控和调试

### Worker 端日志

```bash
# 数据管理器日志
[data-manager:dy_123456] Upserted comment: comment_001 (用户评论)
[data-manager:dy_123456] Upserted conversation: conv_001 (用户名)

# 数据推送日志
[data-pusher] [dy_123456] Pushing data sync to Master
[data-pusher] [dy_123456] Data sync pushed successfully

# 快照日志
[AccountDataManager] 📤 开始调用 pushDataSync...
[AccountDataManager] ✅ 推送完成，totalPushed: 1
```

### Master 端日志

```bash
# 数据接收日志
[data-sync-receiver] 📥 Receiving data sync from worker-1
[data-sync-receiver] ✅ Data sync completed for dy_123456

# DataStore 日志
[data-store] Created new account data store: dy_123456 (douyin)
[data-store] Account data updated: dy_123456

# IM 服务器日志
[im-websocket] [IM WS] New client connected: socket_123
[im-websocket] [IM WS] Client registered: client_001, type: monitor
[im-websocket] [IM WS] Sent 5 channels to socket_123
```

### 查看统计信息

```javascript
// Worker 端
const stats = dataManager.getStats();
console.log('数据统计:', stats);

// Master 端
const storeStats = dataStore.getStats();
console.log('DataStore 统计:', storeStats);
```

## 🧪 测试验证

### 1. 验证 Worker 数据采集

```bash
# 启动 Worker
cd packages/worker
npm start

# 查看日志，确认：
# ✅ AccountDataManager initialized
# ✅ Upserted comment/conversation/message
# ✅ Data synced to Master
```

### 2. 验证 Master 数据接收

```bash
# 启动 Master
cd packages/master
npm start

# 查看日志，确认：
# ✅ Receiving data sync from worker-1
# ✅ Data sync completed
# ✅ Account data updated
```

### 3. 验证 PC IM 接口

```bash
# 启动 PC IM
cd packages/crm-pc-im
npm run dev

# 连接后查看：
# ✅ 频道列表显示账户
# ✅ 主题列表显示作品/会话
# ✅ 消息列表显示评论/私信
```

## 📚 相关文档

- [02-MASTER-系统文档.md](./02-MASTER-系统文档.md) - Master 服务器完整设计
- [03-WORKER-系统文档.md](./03-WORKER-系统文档.md) - Worker 架构和多浏览器设计
- [04-WORKER-平台扩展指南.md](./04-WORKER-平台扩展指南.md) - 平台扩展指南
- [Worker内存架构对比分析.md](./Worker内存架构对比分析.md) - 架构对比分析

## 🎉 总结

原版系统已经完整实现了以下功能：

✅ **Worker 端**：
- 内存维护完整用户数据结构
- 包括会话、私信、评论、作品、讨论、通知
- 自动定期推送到 Master（30 秒）

✅ **Master 端**：
- 接收 Worker 推送的数据
- 内存存储并转换成 PC IM 格式
- 提供原有接口

✅ **PC IM 端**：
- 连接 Master 获取数据
- 接口保持原有结构
- 100% 兼容

**无需额外开发，直接使用即可！**

---

**版本：** 1.0
**作者：** Claude Code
**日期：** 2025-10-31
**状态：** 已完成
