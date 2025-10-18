# DAO 层 platform_user_id 支持总结

本文档总结了为支持 `platform_user_id` 数据隔离而对所有 DAO 类进行的更新。

## 更新日期
2025-10-17

## 背景
为了支持同一系统账号登录不同抖音账号时的数据隔离，所有查询、统计和更新操作都需要支持按 `platform_user_id` 过滤。

## 更新的 DAO 文件

### 1. DouyinVideoDAO (`packages/master/src/database/douyin-video-dao.js`)

#### 更新的方法：

**`upsertVideo(video)`**
- 新增必填字段：`platform_user_id`
- 复合唯一索引：`(platform_user_id, aweme_id)`
- 确保同一平台用户的视频不会重复

**`getVideosByAccountId(accountId, options)`**
- 新增可选参数：`options.platform_user_id`
- 支持按平台用户ID过滤视频列表
```javascript
// 使用示例
const videos = videoDAO.getVideosByAccountId('account-123', {
  platform_user_id: 'douyin-user-456',
  limit: 10
});
```

**`getVideoStats(accountId, platformUserId = null)`**
- 新增可选参数：`platformUserId`
- 统计数据按平台用户ID分组
- 返回：总视频数、总评论数、新评论数、点赞数、播放数
```javascript
// 使用示例
const stats = videoDAO.getVideoStats('account-123', 'douyin-user-456');
// { total_videos: 10, total_comments: 100, new_comments: 5, ... }
```

**`updateCrawlStatus(awemeId, status, error, platformUserId)`**
- 新增可选参数：`platformUserId`
- 更新视频爬取状态时支持平台用户ID过滤

**`incrementNewCommentCount(awemeId, count, platformUserId)`**
- 新增可选参数：`platformUserId`
- 增加新评论计数时支持平台用户ID过滤

---

### 2. CommentsDAO (`packages/master/src/database/comments-dao.js`)

#### 更新的方法：

**`bulkInsert(comments)`**
- 所有评论对象必须包含 `platform_user_id` 字段
- 复合索引：`(account_id, platform_user_id)`
```javascript
// 使用示例
const comments = [
  {
    id: 'uuid-1',
    account_id: 'account-123',
    platform_user_id: 'douyin-user-456',  // 必填
    platform_comment_id: 'comment-789',
    content: '很棒的视频',
    // ... 其他字段
  }
];
commentsDAO.bulkInsert(comments);
```

**`findAll(filters)`**
- 新增过滤条件：`filters.platform_user_id`
```javascript
// 使用示例
const comments = commentsDAO.findAll({
  account_id: 'account-123',
  platform_user_id: 'douyin-user-456',
  is_new: true
});
```

**`count(filters)`**
- 新增过滤条件：`filters.platform_user_id`
```javascript
// 使用示例
const count = commentsDAO.count({
  account_id: 'account-123',
  platform_user_id: 'douyin-user-456',
  is_read: false
});
```

**`countNew(accountId, platformUserId, postId)`**
- 新增可选参数：`platformUserId`
```javascript
// 使用示例
const newCount = commentsDAO.countNew('account-123', 'douyin-user-456');
```

**`findByPostId(postId, options)`**
- 新增选项：`options.platform_user_id`
```javascript
// 使用示例
const comments = commentsDAO.findByPostId('aweme-123', {
  platform_user_id: 'douyin-user-456',
  is_new: true,
  limit: 20
});
```

**`markNewAsViewed(accountId, platformUserId, postId)`**
- 新增可选参数：`platformUserId`
- 标记新评论为已查看时支持平台用户ID过滤
```javascript
// 使用示例
commentsDAO.markNewAsViewed('account-123', 'douyin-user-456', 'aweme-123');
```

**`getCommentIdsByPostId(postId)`**
- 用于增量爬取，获取已存在的评论ID列表
- 注意：此方法返回所有评论ID，不区分 platform_user_id
- 如需区分，应在调用处添加过滤逻辑

---

### 3. DirectMessagesDAO (`packages/master/src/database/messages-dao.js`)

#### 更新的方法：

**`bulkInsert(messages)`**
- 新增字段支持：`platform_user_id`, `conversation_id`
```javascript
// 使用示例
const messages = [
  {
    id: 'uuid-1',
    account_id: 'account-123',
    platform_user_id: 'douyin-user-456',  // 新增
    conversation_id: 'conv-789',          // 新增
    platform_message_id: 'msg-abc',
    content: '你好',
    sender_name: '张三',
    sender_id: 'user-111',
    direction: 'inbound',
    // ... 其他字段
  }
];
messagesDAO.bulkInsert(messages);
```

**`findAll(filters)`**
- 新增过滤条件：`filters.platform_user_id`, `filters.conversation_id`
```javascript
// 使用示例
const messages = messagesDAO.findAll({
  account_id: 'account-123',
  platform_user_id: 'douyin-user-456',
  conversation_id: 'conv-789',
  is_read: false
});
```

**`count(filters)`**
- 新增过滤条件：`filters.platform_user_id`, `filters.conversation_id`
```javascript
// 使用示例
const count = messagesDAO.count({
  account_id: 'account-123',
  platform_user_id: 'douyin-user-456',
  is_read: false
});
```

**`getConversations(accountId, platformUserId)`**
- 新增方法：获取会话列表
- 新增可选参数：`platformUserId`
- 返回：会话ID、平台用户ID、发送者名称、最后消息时间、消息数、未读数
```javascript
// 使用示例
const conversations = messagesDAO.getConversations('account-123', 'douyin-user-456');
// [
//   {
//     conversation_id: 'conv-789',
//     platform_user_id: 'douyin-user-456',
//     sender_name: '张三',
//     last_message_time: 1697500000,
//     message_count: 10,
//     unread_count: 3
//   }
// ]
```

**`getMessagesByConversation(conversationId, options)`**
- 新增方法：获取会话的所有消息
- 支持分页：`options.limit`, `options.offset`
```javascript
// 使用示例
const messages = messagesDAO.getMessagesByConversation('conv-789', {
  limit: 50,
  offset: 0
});
```

---

### 4. NotificationsDAO (`packages/master/src/database/notifications-dao.js`)

#### 更新的方法：

**`findAll(filters)`**
- 新增过滤条件：`filters.platform_user_id`
```javascript
// 使用示例
const notifications = notificationsDAO.findAll({
  account_id: 'account-123',
  platform_user_id: 'douyin-user-456',
  is_sent: false
});
```

**`count(filters)`**
- 新增过滤条件：`filters.platform_user_id`
```javascript
// 使用示例
const count = notificationsDAO.count({
  account_id: 'account-123',
  platform_user_id: 'douyin-user-456',
  is_sent: false
});
```

---

## 使用模式总结

### 1. 查询数据（按平台用户过滤）
```javascript
// 查询特定平台用户的评论
const comments = commentsDAO.findAll({
  account_id: systemAccountId,
  platform_user_id: douyinUserId,  // 抖音账号的 douyin_id
  is_new: true
});

// 查询特定平台用户的视频统计
const stats = videoDAO.getVideoStats(systemAccountId, douyinUserId);
```

### 2. 插入数据（必须包含平台用户ID）
```javascript
// 爬取到的评论必须包含 platform_user_id
const newComments = rawComments.map(comment => ({
  id: uuidv4(),
  account_id: account.id,
  platform_user_id: account.platform_user_id,  // 从账号获取
  platform_comment_id: comment.cid,
  content: comment.text,
  // ... 其他字段
}));

commentsDAO.bulkInsert(newComments);
```

### 3. 统计数据（按平台用户分组）
```javascript
// 获取特定平台用户的新评论数
const newCommentCount = commentsDAO.countNew(
  systemAccountId,
  douyinUserId,
  null  // postId = null 表示统计所有作品
);

// 获取特定平台用户的未读私信数
const unreadMessageCount = messagesDAO.count({
  account_id: systemAccountId,
  platform_user_id: douyinUserId,
  is_read: false
});
```

### 4. 更新数据（按平台用户过滤）
```javascript
// 标记特定平台用户的新评论为已查看
commentsDAO.markNewAsViewed(
  systemAccountId,
  douyinUserId,
  null  // postId = null 表示所有作品
);
```

---

## 数据库索引

为了提高查询性能，已创建以下索引：

```sql
-- comments 表
CREATE INDEX idx_comments_platform_user ON comments(platform_user_id);
CREATE INDEX idx_comments_account_platform_user ON comments(account_id, platform_user_id);

-- direct_messages 表
CREATE INDEX idx_messages_platform_user ON direct_messages(platform_user_id);
CREATE INDEX idx_messages_account_platform_user ON direct_messages(account_id, platform_user_id);
CREATE INDEX idx_messages_conversation ON direct_messages(conversation_id);

-- douyin_videos 表
CREATE UNIQUE INDEX idx_videos_platform_aweme ON douyin_videos(platform_user_id, aweme_id);
CREATE INDEX idx_videos_account_platform ON douyin_videos(account_id, platform_user_id);

-- notifications 表
CREATE INDEX idx_notifications_platform_user ON notifications(platform_user_id);
CREATE INDEX idx_notifications_account_platform ON notifications(account_id, platform_user_id);
```

---

## 向后兼容性

所有 `platform_user_id` 参数都是**可选的**：
- 如果不提供 `platform_user_id`，查询将返回该账号的所有数据（不区分平台用户）
- 这确保了现有代码在未更新前仍能正常工作
- 建议逐步迁移所有查询代码以支持平台用户ID过滤

---

## 下一步工作

1. ✅ 数据库迁移（Migration 008）
2. ✅ DAO 层更新
3. 🔲 更新 Worker 爬虫代码，在插入数据时包含 `platform_user_id`
4. 🔲 更新 Master API 路由，支持按 `platform_user_id` 查询
5. 🔲 更新 Admin Web UI，显示和过滤平台用户数据
6. 🔲 测试完整的数据隔离流程

---

## 相关文档
- [平台用户ID设计说明.md](.docs/平台用户ID设计说明.md)
- [数据库字典.md](.docs/数据库字典.md)
- [增量抓取实现指南.md](.docs/增量抓取实现指南.md)
