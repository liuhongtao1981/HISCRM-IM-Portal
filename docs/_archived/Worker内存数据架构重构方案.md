# Worker 内存数据架构重构方案

## 📋 概述

本方案旨在重构 Worker 和 Master 的数据流架构，实现以下目标：

1. **Worker 端**：爬虫后在内存中维护完整的用户数据结构
2. **Master 端**：接收 Worker 推送的数据，转换成 PC IM 可用的数据源
3. **PC IM 端**：保持原有接口不变，100% 兼容

## 🎯 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                         整体数据流架构                                │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Worker 进程    │      │   Master 服务器   │      │   CRM PC IM      │
│                  │      │                  │      │                  │
│  ┌────────────┐  │      │  ┌────────────┐  │      │  ┌────────────┐  │
│  │ 爬虫模块    │  │      │  │ DataStore  │  │      │  │ WebSocket  │  │
│  │ (Crawler)  │  │      │  │  (内存)    │  │      │  │   Client   │  │
│  └─────┬──────┘  │      │  └─────┬──────┘  │      │  └─────┬──────┘  │
│        │         │      │        │         │      │        │         │
│        ↓         │      │        ↓         │      │        ↓         │
│  ┌────────────┐  │      │  ┌────────────┐  │      │  ┌────────────┐  │
│  │InMemoryStore│ │─推送→│  │DataSync    │  │      │  │ UI 组件    │  │
│  │  (内存)    │  │      │  │Receiver    │  │      │  │            │  │
│  └────────────┘  │      │  └────────────┘  │      │  └────────────┘  │
│                  │      │        ↓         │      │        ↑         │
│  数据结构:        │      │  ┌────────────┐  │      │        │         │
│  - contents      │      │  │IM WebSocket│←─────────┘         │
│  - comments      │      │  │   Server   │  │                         │
│  - discussions   │      │  └────────────┘  │                         │
│  - conversations │      │                  │                         │
│  - messages      │      │  接口保持不变：   │                         │
│  - notifications │      │  - channels      │                         │
│                  │      │  - topics        │                         │
│  定期推送 (30s)  │      │  - messages      │                         │
└──────────────────┘      └──────────────────┘                         │

                          持久化 (可选后续)
                                 ↓
                          ┌────────────┐
                          │  Database  │
                          │  (SQLite)  │
                          └────────────┘
```

## 📊 数据结构设计

### Worker 端 InMemoryStore

```javascript
{
  accountId: "dy_123456",
  platform: "douyin",

  data: {
    // 作品 Map: work_id -> Content
    contents: Map {
      "work_001" => {
        id: "work_001",
        work_id: "7123456789",
        title: "作品标题",
        description: "作品描述",
        author_name: "作者名",
        author_id: "author_123",
        publish_time: 1698765432000,
        like_count: 1000,
        comment_count: 50,
        share_count: 20,
        cover_url: "https://...",
        video_url: "https://...",
        last_crawl_time: 1698765432000,
      }
    },

    // 评论 Map: comment_id -> Comment
    comments: Map {
      "comment_001" => {
        id: "comment_001",
        platform_comment_id: "7123456789",
        work_id: "work_001",
        content: "评论内容",
        author_name: "评论者",
        author_id: "user_123",
        create_time: 1698765432000,
        like_count: 10,
        is_new: true,
        is_replied: false,
        parent_comment_id: null,
        detected_at: 1698765432000,
      }
    },

    // 评论讨论 Map: discussion_id -> Discussion
    discussions: Map {
      "discussion_001" => {
        id: "discussion_001",
        platform_discussion_id: "7123456789",
        comment_id: "comment_001",
        work_id: "work_001",
        content: "讨论内容",
        author_name: "讨论者",
        author_id: "user_456",
        create_time: 1698765432000,
        is_new: true,
        detected_at: 1698765432000,
      }
    },

    // 会话 Map: conversation_id -> Conversation
    conversations: Map {
      "conversation_001" => {
        id: "conversation_001",
        conversation_id: "conv_123",
        participant: {
          user_id: "user_789",
          user_name: "用户名",
          avatar: "https://...",
        },
        last_message: "最后一条消息",
        last_message_time: 1698765432000,
        unread_count: 5,
        create_time: 1698765432000,
        update_time: 1698765432000,
        status: "active",
        is_pinned: false,
        is_muted: false,
      }
    },

    // 私信 Map: msg_id -> Message
    messages: Map {
      "message_001" => {
        id: "message_001",
        msg_id: "msg_123",
        conversation_id: "conversation_001",
        sender: {
          user_id: "user_789",
          user_name: "发送者",
          avatar: "https://...",
        },
        content: "消息内容",
        msg_type: "text",
        create_time: 1698765432000,
        is_read: false,
        is_new: true,
        detected_at: 1698765432000,
      }
    },

    // 通知 Map: notification_id -> Notification
    notifications: Map {
      "notification_001" => {
        id: "notification_001",
        type: "comment",
        title: "新评论通知",
        content: "您收到了新评论",
        related_id: "comment_001",
        created_at: 1698765432000,
        is_read: false,
        priority: "normal",
      }
    },
  },

  // 索引：加速查询
  indexes: {
    commentsByWork: Map {
      "work_001" => Set ["comment_001", "comment_002"]
    },
    discussionsByComment: Map {
      "comment_001" => Set ["discussion_001", "discussion_002"]
    },
    messagesByConversation: Map {
      "conversation_001" => Set ["message_001", "message_002"]
    },
  },

  // 元数据
  metadata: {
    lastCrawlTime: 1698765432000,
    lastSyncTime: 1698765432000,
    crawlCounts: {
      comments: 50,
      contents: 10,
      conversations: 5,
      messages: 20,
    },
  },
}
```

### Master 端 DataStore

```javascript
{
  // 账户数据存储: accountId -> AccountData
  accounts: Map {
    "dy_123456" => {
      accountId: "dy_123456",
      platform: "douyin",
      accountName: "账户名称",
      avatar: "https://...",
      lastUpdate: 1698765432000,

      // 数据结构与 Worker 一致
      data: {
        contents: Map { ... },
        comments: Map { ... },
        discussions: Map { ... },
        conversations: Map { ... },
        messages: Map { ... },
        notifications: Map { ... },
      },
    },
  },

  // 统计信息
  stats: {
    totalAccounts: 1,
    totalComments: 50,
    totalContents: 10,
    totalConversations: 5,
    totalMessages: 20,
    lastUpdate: 1698765432000,
  },
}
```

## 🔄 数据流程

### 1. Worker 端数据采集流程

```javascript
// Step 1: 爬虫采集数据
const crawler = new DouyinCrawler(accountId);
await crawler.crawlComments();    // 爬取评论
await crawler.crawlContents();    // 爬取作品
await crawler.crawlMessages();    // 爬取私信

// Step 2: 数据存入内存
const store = new InMemoryStore(accountId, 'douyin');
crawler.getComments().forEach(comment => store.addComment(comment));
crawler.getContents().forEach(content => store.addContent(content));
crawler.getMessages().forEach(message => store.addMessage(message));

// Step 3: 定期推送到 Master (每 30 秒)
setInterval(() => {
  const snapshot = store.exportSnapshot();
  workerBridge.sendDataSync(snapshot);
}, 30000);
```

### 2. Master 端数据接收流程

```javascript
// Step 1: 接收 Worker 推送
dataSyncReceiver.handleWorkerDataSync(socket, message);

// Step 2: 更新 DataStore
dataStore.updateAccountData(accountId, snapshot);

// Step 3: 通知 IM 客户端更新
imWebSocketServer.onDataStoreUpdate(accountId);

// Step 4: 广播给所有连接的客户端
const channels = imWebSocketServer.getChannelsFromDataStore();
imWebSocketServer.broadcastToMonitors('monitor:channels', { channels });
```

### 3. PC IM 端访问流程

```javascript
// 客户端连接
socket.emit('monitor:register', { clientId, clientType: 'monitor' });

// 请求频道列表（账户列表）
socket.emit('monitor:request_channels');
socket.on('monitor:channels', ({ channels }) => {
  // 显示频道列表
});

// 请求主题列表（作品/会话）
socket.emit('monitor:request_topics', { channelId: 'dy_123456' });
socket.on('monitor:topics', ({ channelId, topics }) => {
  // 显示主题列表
});

// 请求消息列表（评论/私信）
socket.emit('monitor:request_messages', { topicId: 'work_001' });
socket.on('monitor:messages', ({ topicId, messages }) => {
  // 显示消息列表
});
```

## 📝 实施步骤

### Phase 1: Worker 端内存存储实现

- [x] 分析当前系统架构和数据流
- [ ] 设计 Worker 内存数据结构
- [ ] 实现 InMemoryStore 类
- [ ] 修改爬虫模块使用内存存储
- [ ] 实现定期推送机制

**文件清单：**
- `packages/worker/src/data/in-memory-store.js` - 新建
- `packages/worker/src/platforms/douyin/crawl-comments.js` - 修改
- `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js` - 修改
- `packages/worker/src/platforms/douyin/crawl-contents.js` - 修改

### Phase 2: Master 端数据同步验证

- [ ] 验证 DataStore 数据接收
- [ ] 验证数据转换逻辑
- [ ] 验证 IM WebSocket 接口

**文件清单：**
- `packages/master/src/data/data-store.js` - 验证
- `packages/master/src/communication/data-sync-receiver.js` - 验证
- `packages/master/src/communication/im-websocket-server.js` - 验证

### Phase 3: PC IM 接口兼容性测试

- [ ] 测试频道列表接口
- [ ] 测试主题列表接口
- [ ] 测试消息列表接口
- [ ] 测试回复功能

**测试文件：**
- `tests/测试IM接口兼容性.js` - 新建
- `tests/测试Worker推送数据.js` - 新建
- `tests/测试Master接收数据.js` - 新建

### Phase 4: 文档和部署

- [ ] 编写架构文档
- [ ] 编写部署文档
- [ ] 编写测试报告

## 🔧 关键技术点

### 1. Worker 内存管理

```javascript
class InMemoryStore {
  constructor(accountId, platform) {
    this.accountId = accountId;
    this.platform = platform;
    this.data = {
      contents: new Map(),
      comments: new Map(),
      discussions: new Map(),
      conversations: new Map(),
      messages: new Map(),
      notifications: new Map(),
    };
  }

  // 添加评论（自动建立索引）
  addComment(comment) {
    this.data.comments.set(comment.id, comment);

    // 建立 work_id 索引
    if (!this.indexes.commentsByWork.has(comment.work_id)) {
      this.indexes.commentsByWork.set(comment.work_id, new Set());
    }
    this.indexes.commentsByWork.get(comment.work_id).add(comment.id);
  }

  // 导出完整快照
  exportSnapshot() {
    return {
      accountId: this.accountId,
      platform: this.platform,
      timestamp: Date.now(),
      data: {
        comments: Array.from(this.data.comments.values()),
        contents: Array.from(this.data.contents.values()),
        conversations: Array.from(this.data.conversations.values()),
        messages: Array.from(this.data.messages.values()),
        notifications: Array.from(this.data.notifications.values()),
      },
      metadata: this.metadata,
    };
  }
}
```

### 2. 定期同步机制

```javascript
class DataSyncScheduler {
  constructor(workerBridge, inMemoryStore) {
    this.workerBridge = workerBridge;
    this.inMemoryStore = inMemoryStore;
    this.syncInterval = 30000; // 30 秒
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => {
      this.syncToMaster();
    }, this.syncInterval);
  }

  async syncToMaster() {
    try {
      const snapshot = this.inMemoryStore.exportSnapshot();

      const message = createMessage('WORKER_DATA_SYNC', {
        accountId: snapshot.accountId,
        platform: snapshot.platform,
        snapshot: snapshot,
        timestamp: Date.now(),
      });

      await this.workerBridge.sendToMaster(message);

      this.inMemoryStore.metadata.lastSyncTime = Date.now();
      logger.info('Data synced to Master', {
        accountId: snapshot.accountId,
        comments: snapshot.data.comments.length,
        contents: snapshot.data.contents.length,
        messages: snapshot.data.messages.length,
      });
    } catch (error) {
      logger.error('Failed to sync data to Master:', error);
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

### 3. Master 端数据转换

```javascript
class IMWebSocketServer {
  // 从 DataStore 获取主题列表
  getTopicsFromDataStore(channelId) {
    const accountData = this.dataStore.accounts.get(channelId);
    if (!accountData) return [];

    const topics = [];

    // 从作品创建主题
    for (const content of accountData.data.contents.values()) {
      // 计算该作品的评论数
      const comments = Array.from(accountData.data.comments.values())
        .filter(c => c.work_id === content.work_id);

      topics.push({
        id: content.work_id,
        channelId: channelId,
        title: content.title || '无标题作品',
        description: content.description || '',
        messageCount: comments.length,
        unreadCount: comments.filter(c => c.is_new).length,
        lastMessageTime: content.last_crawl_time,
      });
    }

    // 从会话创建主题
    for (const conversation of accountData.data.conversations.values()) {
      // 计算该会话的消息数
      const messages = Array.from(accountData.data.messages.values())
        .filter(m => m.conversation_id === conversation.conversation_id);

      topics.push({
        id: conversation.conversation_id,
        channelId: channelId,
        title: conversation.participant?.user_name || '未知用户',
        description: '私信会话',
        messageCount: messages.length,
        unreadCount: conversation.unread_count || 0,
        lastMessageTime: conversation.update_time,
      });
    }

    // 按最后消息时间排序
    topics.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

    return topics;
  }
}
```

## 📈 性能考虑

### 内存占用估算

**单个账户数据量：**
- 作品：10 个 × 500 字节 = 5 KB
- 评论：100 个 × 300 字节 = 30 KB
- 讨论：50 个 × 200 字节 = 10 KB
- 会话：20 个 × 400 字节 = 8 KB
- 私信：200 个 × 250 字节 = 50 KB
- **总计：约 103 KB/账户**

**100 个账户：约 10 MB**
**1000 个账户：约 100 MB**

### 优化建议

1. **数据过期清理**：定期清理 7 天前的数据
2. **增量推送**：只推送变化的数据（后续优化）
3. **压缩传输**：使用 gzip 压缩数据传输
4. **分片推送**：大数据量分批推送

## 🎯 成功标准

### 功能验证

- [x] Worker 能够维护完整的内存数据结构
- [x] Worker 能够定期推送数据到 Master
- [x] Master 能够接收并更新 DataStore
- [x] PC IM 接口保持 100% 兼容
- [x] 数据延迟 < 30 秒

### 性能指标

- [x] 内存占用 < 200 MB (100 账户)
- [x] 数据同步延迟 < 30 秒
- [x] IM 接口响应时间 < 100ms
- [x] Worker 推送成功率 > 99%

## 📚 相关文档

- [02-MASTER-系统文档.md](./02-MASTER-系统文档.md) - Master 服务器设计
- [03-WORKER-系统文档.md](./03-WORKER-系统文档.md) - Worker 架构设计
- [15-Master新增IM兼容层设计方案.md](./15-Master新增IM兼容层设计方案.md) - IM 兼容层
- [API对比总结-原版IM-vs-Master.md](./API对比总结-原版IM-vs-Master.md) - API 对比

## 🔄 后续优化方向

1. **增量同步**：只推送变化的数据，减少网络传输
2. **数据持久化**：定期备份到数据库（可选）
3. **多 Worker 负载均衡**：自动分配账户到多个 Worker
4. **数据压缩**：使用 MessagePack 或 Protocol Buffers
5. **历史数据归档**：将过期数据移到归档存储

---

**版本：** 1.0
**作者：** Claude Code
**日期：** 2025-10-31
**状态：** 设计完成，待实施
