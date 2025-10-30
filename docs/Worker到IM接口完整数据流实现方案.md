# Worker → Master → IM 接口完整数据流实现方案

**日期**: 2025-10-30
**目标**: 将 Worker 爬取的数据推送到 Master，通过内存存储，供 IM 接口访问

---

## 当前架构分析

### 现状

#### 1. Worker 端
- ✅ 已有 DataManager 统一管理数据（评论、作品、会话、私信）
- ✅ 已实现数据快照导出
- ⚠️ 当前使用 `MessageReporter` 单条推送（性能较差）

#### 2. Master 端
- ✅ 已有 `MessageReceiver` 接收 Worker 数据
- ❌ 当前直接写入 **SQLite 数据库**
- ❌ 没有内存缓存层

#### 3. IM 接口
- ✅ 已实现完整的 IM 兼容接口（6个模块）
- ❌ 当前直接读取 **SQLite 数据库**
- ❌ 性能瓶颈：每次查询都访问数据库

### 问题

1. **数据流不完整**：Worker → Master 的数据推送效率低
2. **性能瓶颈**：IM 接口直接查询数据库
3. **缺少内存层**：无法快速访问最新数据

---

## 实现方案

### 架构设计

```
┌─────────────────┐
│     Worker      │
│  (DataManager)  │
└────────┬────────┘
         │ Socket.IO
         │ WORKER_DATA_SYNC (批量推送完整快照)
         ▼
┌─────────────────┐
│     Master      │
│   DataStore     │  ← 内存存储（Map 结构）
│  (In-Memory)    │
└────────┬────────┘
         │ Express API
         │ GET /api/im/xxx
         ▼
┌─────────────────┐
│   IM Client     │
│  (PC/Mobile)    │
└─────────────────┘
```

### 核心组件

#### 1. DataStore (Master 端内存存储)

```javascript
// packages/master/src/data/data-store.js

class DataStore {
  constructor() {
    // 按账户组织数据
    this.accounts = new Map(); // accountId -> AccountData
  }

  // AccountData 结构
  // {
  //   accountId: 'acc-xxx',
  //   platform: 'douyin',
  //   lastUpdate: timestamp,
  //   data: {
  //     comments: Map<commentId, Comment>,
  //     contents: Map<contentId, Content>,
  //     conversations: Map<conversationId, Conversation>,
  //     messages: Map<messageId, Message>,
  //     notifications: Map<notificationId, Notification>
  //   }
  // }

  updateAccountData(accountId, snapshot) {
    // 接收 Worker 的完整快照
    // 更新内存数据
  }

  getComments(accountId, filters) {}
  getContents(accountId, filters) {}
  getConversations(accountId, filters) {}
  getMessages(accountId, filters) {}
}
```

#### 2. Worker 数据推送

**使用现有的 DataManager**：

```javascript
// packages/worker/src/platforms/douyin/douyin-data-manager.js

// 修改 sync() 方法
async sync() {
  if (!this.autoSync) return;

  const snapshot = this.toSyncFormat();

  // 推送完整快照到 Master
  this.socketClient.sendMessage(createMessage(
    'WORKER_DATA_SYNC',
    {
      accountId: this.accountId,
      platform: this.platform,
      snapshot: snapshot,
      timestamp: Date.now()
    }
  ));
}
```

#### 3. Master 接收数据

```javascript
// packages/master/src/communication/data-sync-receiver.js

class DataSyncReceiver {
  constructor(dataStore) {
    this.dataStore = dataStore;
  }

  handleWorkerDataSync(socket, message) {
    const { accountId, platform, snapshot } = message.payload;

    // 更新内存存储
    this.dataStore.updateAccountData(accountId, {
      platform,
      data: snapshot,
      lastUpdate: Date.now()
    });

    logger.info(`Data synced for account ${accountId}:`, {
      comments: snapshot.comments?.length || 0,
      contents: snapshot.contents?.length || 0,
      conversations: snapshot.conversations?.length || 0,
      messages: snapshot.messages?.length || 0
    });
  }
}
```

#### 4. IM 接口读取内存

```javascript
// packages/master/src/api/routes/im/conversations.js (修改后)

function createIMConversationsRouter(db, dataStore) {  // 新增 dataStore 参数
  const router = express.Router();

  router.get('/', (req, res) => {
    const { account_id } = req.query;

    // ✅ 从内存读取，不再访问数据库
    const conversations = dataStore.getConversations(account_id, {
      status: req.query.status,
      is_pinned: req.query.is_pinned,
      is_muted: req.query.is_muted
    });

    // 转换为 IM 格式
    const imConversations = ConversationTransformer.toIMConversationList(conversations);

    res.json(ResponseWrapper.list(imConversations, 'conversations'));
  });

  return router;
}
```

---

## 实现步骤

### Phase 1: 创建内存存储 (DataStore)

**文件**: `packages/master/src/data/data-store.js`

**功能**:
1. ✅ 使用 Map 结构存储账户数据
2. ✅ 支持批量更新（接收完整快照）
3. ✅ 支持过滤查询（status, 分页等）
4. ✅ 提供 CRUD 接口

**关键方法**:
- `updateAccountData(accountId, snapshot)` - 更新账户数据
- `getConversations(accountId, filters)` - 查询会话
- `getMessages(accountId, conversationId, filters)` - 查询私信
- `getContents(accountId, filters)` - 查询作品
- `getComments(accountId, contentId)` - 查询评论

### Phase 2: 修改 Worker 数据推送

**文件**: `packages/worker/src/platforms/douyin/douyin-data-manager.js`

**修改**:
1. ✅ 修改 `sync()` 方法
2. ✅ 推送完整快照（而非单条消息）
3. ✅ 使用新消息类型 `WORKER_DATA_SYNC`

**新增消息类型**:
```javascript
// packages/shared/protocol/messages.js
const WORKER_DATA_SYNC = 'worker:data:sync';  // Worker 完整数据同步
```

### Phase 3: 修改 Master 接收逻辑

**文件**: `packages/master/src/communication/data-sync-receiver.js` (新建)

**功能**:
1. ✅ 监听 `WORKER_DATA_SYNC` 消息
2. ✅ 解析快照数据
3. ✅ 调用 DataStore 更新内存

**集成到 Master**:
```javascript
// packages/master/src/index.js

const DataStore = require('./data/data-store');
const DataSyncReceiver = require('./communication/data-sync-receiver');

const dataStore = new DataStore();
const dataSyncReceiver = new DataSyncReceiver(dataStore);

// 注册消息处理器
socketServer.on('WORKER_DATA_SYNC', (socket, message) => {
  dataSyncReceiver.handleWorkerDataSync(socket, message);
});
```

### Phase 4: 修改 IM 接口

**文件**:
- `packages/master/src/api/routes/im/conversations.js`
- `packages/master/src/api/routes/im/messages.js`
- `packages/master/src/api/routes/im/contents.js`
- `packages/master/src/api/routes/im/discussions.js`

**修改**:
1. ✅ 路由工厂函数新增 `dataStore` 参数
2. ✅ 所有查询从 `dataStore` 读取（不再访问数据库）
3. ✅ 保持 IM 响应格式不变

**示例**:
```javascript
// 修改前
const masterConversations = conversationsDAO.findByAccount(account_id, options);

// 修改后
const masterConversations = dataStore.getConversations(account_id, options);
```

### Phase 5: 测试完整数据流

**测试脚本**: `tests/测试Worker到IM完整数据流.js`

**测试内容**:
1. ✅ Worker 启动并抓取数据
2. ✅ Worker 推送数据到 Master
3. ✅ Master DataStore 接收并存储
4. ✅ IM API 查询返回正确数据
5. ✅ 数据格式符合 IM 规范

---

## 数据结构设计

### Worker 快照格式

```javascript
{
  accountId: 'acc-xxx',
  platform: 'douyin',
  timestamp: 1761804248025,
  data: {
    comments: [
      {
        id: 'comm_xxx',
        commentId: '7566864433692459826',
        content: '在哪里',
        contentId: '7566840303458569498',
        authorId: '106228603660',
        authorName: '苏苏',
        createdAt: 1761798515,
        status: 'new'
      }
    ],
    contents: [
      {
        id: 'cont_xxx',
        contentId: '7566840303458569498',
        title: '大白们晨会交班...',
        type: 'video',
        commentCount: 3,
        status: 'new'
      }
    ],
    conversations: [
      {
        id: 'conv_xxx',
        conversationId: 'MS4wLjABAAAA...',
        userId: 'MS4wLjABAAAA...',
        userName: '雨后彩虹🌈',
        lastMessageTime: 1761803486125,
        unreadCount: 0,
        status: 'updated'
      }
    ],
    messages: [
      {
        id: 'msg_xxx',
        messageId: '7566782673110223656',
        conversationId: 'MS4wLjABAAAA...',
        content: '我们已互相关注，可以开始聊天了',
        direction: 'inbound',
        type: 'text',
        createdAt: '2025-10-29T23:01:30.496Z',
        status: 'delivered'
      }
    ]
  }
}
```

### DataStore 内存结构

```javascript
{
  accounts: Map {
    'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4' => {
      accountId: 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4',
      platform: 'douyin',
      lastUpdate: 1761804248025,
      data: {
        comments: Map {
          'comm_xxx' => { /* Comment 对象 */ },
          // ...
        },
        contents: Map {
          'cont_xxx' => { /* Content 对象 */ },
          // ...
        },
        conversations: Map {
          'conv_xxx' => { /* Conversation 对象 */ },
          // ...
        },
        messages: Map {
          'msg_xxx' => { /* Message 对象 */ },
          // ...
        }
      }
    }
  }
}
```

---

## 性能对比

| 指标 | 数据库方案 | 内存方案 | 提升 |
|------|-----------|---------|------|
| 查询延迟 | 10-50ms | <1ms | **10-50x** |
| 并发能力 | ~100 req/s | ~10000 req/s | **100x** |
| 数据一致性 | 强一致 | 最终一致 | ⚠️ 需权衡 |
| 数据持久化 | ✅ 持久化 | ❌ 易失 | ⚠️ 重启丢失 |

### 数据持久化策略（可选）

如果需要持久化，可以：
1. 定期将内存数据快照写入磁盘
2. Worker 重连时重新推送完整数据
3. Master 重启时从磁盘加载最后快照

---

## 优势

1. **✅ 高性能**：内存访问，毫秒级响应
2. **✅ 低耦合**：Worker、Master、IM 接口职责清晰
3. **✅ 易扩展**：可轻松添加缓存策略、持久化等
4. **✅ 实时性强**：Worker 推送即时更新

## 注意事项

1. **内存限制**：需监控内存使用，考虑 LRU 淘汰策略
2. **数据一致性**：Worker 和 Master 可能短暂不同步
3. **数据丢失**：Master 重启时内存数据丢失（需 Worker 重推）
4. **并发控制**：多 Worker 更新同一账户需加锁

---

## 后续优化

1. **数据过期策略**：旧数据自动清理
2. **持久化支持**：定期快照到磁盘
3. **分布式缓存**：使用 Redis 替代内存 Map
4. **增量更新**：支持增量推送（而非完整快照）

---

**下一步**: 开始实现 Phase 1 - 创建 DataStore 内存存储
