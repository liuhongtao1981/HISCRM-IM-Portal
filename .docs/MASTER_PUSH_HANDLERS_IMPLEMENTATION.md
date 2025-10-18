# Master 端推送处理器实现文档

## 📌 概述

本文档说明 Master 端新数据推送处理器的完整实现，包括三个核心处理函数和一个 Socket.IO 事件注册机制。

---

## 🎯 实现目标

- **数据验证**: 检查推送数据是否已存在
- **智能通知**: 仅向客户端推送新数据或标记为新的历史数据
- **去重保障**: 利用数据库约束防止重复
- **反馈机制**: 向 Worker 返回 ACK 确认

---

## 📝 核心处理器

### 1. onPushNewComments

**位置**: `packages/master/src/index.js` (Line 370-486)

**功能**: 处理 Worker 推送的新评论

**流程**:
```
接收数据
  ↓
遍历每条评论
  ↓
  ├─ 不存在? → INSERT + 加入通知列表 (new_comment)
  └─ 已存在?
      ├─ is_new=true? → 加入通知列表 (history_comment)
      └─ is_new=false? → 忽略
  ↓
批量发送客户端通知 (clientNamespace.emit('new:comment'))
  ↓
发送 ACK 反馈 (socket.emit('master:push_new_comments_ack_*'))
```

**关键代码**:
```javascript
// 检查评论是否已存在
const exists = commentsDAO.exists(account_id, comment.id);

// 提取历史数据的 is_new 标志
const existingComment = commentsDAO.findAll({
  account_id,
  is_new: true
}).find(c => c.platform_comment_id === comment.id);

// 发送客户端通知
clientNamespace.emit('new:comment', {
  type: 'batch',
  account_id,
  platform_user_id,
  data: commentsToNotify,
  timestamp: Math.floor(Date.now() / 1000)
});

// 发送 ACK 反馈
socket.emit(`master:push_new_comments_ack_${request_id}`, {
  success: true,
  inserted,
  skipped,
  notified: commentsToNotify.length
});
```

**统计字段**:
- `inserted`: 新插入的数据条数
- `skipped`: 跳过的数据条数（已存在且 is_new=false）
- `notified`: 推送给客户端的数据条数

---

### 2. onPushNewMessages

**位置**: `packages/master/src/index.js` (Line 491-608)

**功能**: 处理 Worker 推送的新私信

**流程**: 与 `onPushNewComments` 相同，但针对私信表

**关键不同点**:
```javascript
// 私信存在检查（使用 findAll）
const exists = directMessagesDAO.findAll({
  account_id,
  platform_user_id
}).some(m => m.platform_message_id === message.id);

// 客户端通知事件
clientNamespace.emit('new:message', { ... });

// ACK 反馈事件
socket.emit(`master:push_new_messages_ack_${request_id}`, { ... });
```

---

### 3. onPushNewVideos

**位置**: `packages/master/src/index.js` (Line 613-720)

**功能**: 处理 Worker 推送的新视频

**流程**: 与 `onPushNewComments` 相同，但针对视频表

**关键代码**:
```javascript
// 视频存在检查（支持两种方式）
let existingVideo = douyinVideoDAO.getVideoByPlatformVideosId(video.id, platform_user_id);
if (!existingVideo) {
  existingVideo = douyinVideoDAO.getVideoByAwemeId(video.id, platform_user_id);
}

// 视频新数据结构
const newVideo = {
  account_id,
  platform_user_id,
  aweme_id: video.id,
  platform_videos_id: video.id,
  title: video.title || '',
  cover: video.cover || '',
  publish_time: video.publish_time || Math.floor(Date.now() / 1000),
  total_comment_count: video.total_comment_count || 0,
  is_new: 1,
};

// 客户端通知事件
clientNamespace.emit('new:video', { ... });
```

---

## 🔌 Socket.IO 事件注册

**位置**: `packages/master/src/communication/socket-server.js` (Line 165-209)

**功能**: 注册三个 socket 事件监听器

### 事件 1: worker:push_new_comments

```javascript
socket.on('worker:push_new_comments', async (data) => {
  logger.info(`Worker pushing ${data.comments?.length || 0} new comments`);
  if (handlers.onPushNewComments) {
    try {
      await handlers.onPushNewComments(data, socket);
    } catch (error) {
      logger.error('Failed to push new comments:', error);
      socket.emit(`master:push_new_comments_ack_${data?.request_id}`, {
        success: false,
        error: error.message
      });
    }
  }
});
```

### 事件 2: worker:push_new_messages

类似 worker:push_new_comments，监听事件名称不同

### 事件 3: worker:push_new_videos

类似 worker:push_new_comments，监听事件名称不同

---

## 📊 数据流示例

### 新数据流（不存在）
```
Worker:
  ├─ 爬虫发现新评论 ID:123
  ├─ CacheManager 存储 (is_new=true, push_count=0)
  └─ IsNewPushTask 推送
      └─ socket.emit('worker:push_new_comments', {
          request_id: 'req-001',
          comments: [{ id: 123, ... }]
         })

Master (通过 socket 事件触发):
  ├─ 接收 'worker:push_new_comments' 事件
  ├─ 调用 onPushNewComments()
  ├─ 检查 commentsDAO.exists(account_id, 123) → false
  ├─ 执行 INSERT（is_new=1, push_count=0）
  ├─ 加入通知列表 (type='new_comment')
  ├─ emit('new:comment', { type: 'batch', data: [...] })
  └─ socket.emit('master:push_new_comments_ack_req-001', {
      success: true,
      inserted: 1,
      skipped: 0,
      notified: 1
     })

Client:
  ├─ 监听 'new:comment' 事件
  └─ 在 UI 上显示新评论通知
```

### 历史数据流（已存在，is_new=true）
```
Worker:
  ├─ IsNewPushTask 扫描（第 2 次推送）
  ├─ 同一条评论 ID:123 再次推送
  └─ socket.emit('worker:push_new_comments', { ... })

Master:
  ├─ 调用 onPushNewComments()
  ├─ 检查 commentsDAO.exists(account_id, 123) → true
  ├─ 查询现有记录: is_new=1（历史新数据）
  ├─ 加入通知列表 (type='history_comment')
  ├─ emit('new:comment', { ... })
  └─ socket.emit('master:push_new_comments_ack_...', {
      success: true,
      inserted: 0,
      skipped: 1,
      notified: 1
     })
```

### 忽略流程（已存在，is_new=false）
```
Worker:
  ├─ IsNewPushTask 扫描（第 3+ 次推送）
  ├─ 同一条评论 ID:123 再次推送
  └─ socket.emit('worker:push_new_comments', { ... })

Master:
  ├─ 调用 onPushNewComments()
  ├─ 检查 commentsDAO.exists(account_id, 123) → true
  ├─ 查询现有记录: is_new=0（旧数据）
  ├─ 不加入通知列表
  ├─ 不 emit('new:comment', ...)
  └─ socket.emit('master:push_new_comments_ack_...', {
      success: true,
      inserted: 0,
      skipped: 1,
      notified: 0
     })
```

---

## 🔐 数据去重机制

### 表级约束
```sql
-- comments 表
UNIQUE(account_id, platform_comment_id)

-- direct_messages 表
UNIQUE(account_id, platform_message_id)

-- douyin_videos 表
UNIQUE(account_id, platform_videos_id)
```

### 插入策略
```javascript
// 使用 INSERT OR IGNORE 自动处理重复
const result = insertStmt.run(...values);

if (result.changes > 0) {
  inserted++;  // 新插入
} else {
  skipped++;   // 已存在（被忽略）
}
```

---

## ⚙️ 环境变量配置

### Worker .env
```bash
# 推送任务配置
IS_NEW_PUSH_INTERVAL=60000      # 推送检查周期（毫秒）
IS_NEW_PUSH_MAX_TIMES=3         # 单条数据最多推送次数
```

### Master .env
```bash
# 新数据通知配置
IS_NEW_NOTIFICATION_ENABLED=true  # 启用客户端通知
```

---

## 📋 注册流程（Master 启动）

**时间点**: `packages/master/src/index.js` - start() 函数

### 第 4.4 阶段 - 添加爬虫处理器
```javascript
// 初始化 DAO
const commentsDAO = new CommentsDAO(db);
const directMessagesDAO = new DirectMessagesDAO(db);
const douyinVideoDAO = new DouyinVideoDAO(db);

// 注册三个处理器
tempHandlers.onPushNewComments = async (data, socket) => { ... };
tempHandlers.onPushNewMessages = async (data, socket) => { ... };
tempHandlers.onPushNewVideos = async (data, socket) => { ... };
```

### 第 4.1 阶段 - Socket.IO 初始化
```javascript
const socketNamespaces = initSocketServer(
  server,
  tempHandlers,  // ← 包含三个处理器
  masterServer
);
```

### socket-server.js 中的事件绑定
```javascript
workerNamespace.on('connection', (socket) => {
  // 绑定三个事件
  socket.on('worker:push_new_comments', async (data) => {
    if (handlers.onPushNewComments) {
      await handlers.onPushNewComments(data, socket);
    }
  });
  // ... 其他两个事件类似
});
```

---

## 🧪 调试技巧

### 查看 Master 日志
```bash
# 监听 [IsNew] 标记的日志
tail -f packages/master/logs/master.log | grep "\[IsNew\]"

# 查看所有推送相关日志
tail -f packages/master/logs/master.log | grep -E "(push_new|new:comment)"
```

### 验证数据库
```bash
# 检查评论的 is_new 状态
sqlite3 packages/master/data/master.db \
  "SELECT id, platform_comment_id, is_new, push_count FROM comments LIMIT 10;"

# 统计新评论数量
sqlite3 packages/master/data/master.db \
  "SELECT COUNT(*) FROM comments WHERE is_new=1;"
```

### 模拟 Worker 推送
```javascript
// 在浏览器控制台或测试脚本中
socket.emit('worker:push_new_comments', {
  request_id: 'test-001',
  account_id: 'account-123',
  platform_user_id: 'user-456',
  comments: [
    {
      id: 'comment-789',
      content: 'Test comment',
      platform_comment_id: 'comment-789',
      author_name: 'Test User',
      created_at: Math.floor(Date.now() / 1000)
    }
  ]
});
```

---

## 🚀 性能考虑

### 批量推送优化
当前实现为逐条处理，可优化为批量处理：
```javascript
// 目前做法（单条）
for (const comment of comments) {
  // 处理单条
}

// 可优化为批量插入
commentsDAO.bulkInsert(comments);  // 使用事务
```

### 数据库索引
建议为查询频繁的字段添加索引：
```sql
CREATE INDEX idx_comments_is_new ON comments(is_new);
CREATE INDEX idx_comments_account_is_new ON comments(account_id, is_new);
CREATE INDEX idx_messages_is_new ON direct_messages(is_new);
CREATE INDEX idx_videos_is_new ON douyin_videos(is_new);
```

---

## 📞 故障排查

### 推送不被接收
**症状**: Worker 推送但 Master 无响应

**排查步骤**:
1. 检查 socket 事件是否被注册
2. 检查 handlers.onPushNewComments 是否存在
3. 查看 Master 日志中的错误信息
4. 验证 request_id 是否被正确传递

### ACK 未被接收
**症状**: Master 返回 ACK 但 Worker 未收到

**排查步骤**:
1. 检查 request_id 是否正确
2. 验证 socket 连接状态
3. 查看 Master 日志中的 emit 操作
4. 增加超时时间或添加重试逻辑

### 数据重复
**症状**: 同一条数据被推送多次

**排查步骤**:
1. 检查 platform_comment_id 是否正确
2. 验证 account_id 是否正确
3. 查看数据库约束是否生效
4. 检查 INSERT OR IGNORE 语法

---

## 📚 相关文件参考

- [IsNewPushTask](packages/worker/src/tasks/is-new-push-task.js) - Worker 端推送任务
- [CacheManager](packages/worker/src/services/cache-manager.js) - 数据缓存管理
- [CommentsDAO](packages/master/src/database/comments-dao.js) - 评论数据操作
- [DirectMessagesDAO](packages/master/src/database/messages-dao.js) - 私信数据操作
- [DouyinVideoDAO](packages/master/src/database/douyin-video-dao.js) - 视频数据操作
- [Migration 014](packages/master/src/database/migrations/014_add_is_new_and_push_count_fields.sql) - 数据库迁移

---

**最后更新**: 2025-10-18
**版本**: 1.0
**状态**: ✅ 完成并可用
