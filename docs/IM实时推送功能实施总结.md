# IM实时推送功能实施总结

## 一、实施概述

**实施日期**：2025-11-14
**实施目标**：实现新消息实时推送功能，将消息到达延迟从30秒降低到1-3秒
**实施状态**：✅ 已完成代码实现，待测试验证

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         Worker 层                            │
├─────────────────────────────────────────────────────────────┤
│  爬虫检测到新消息                                              │
│      ↓                                                        │
│  AccountDataManager.upsertMessage/upsertComment             │
│      ↓                                                        │
│  【检测】是否为新消息（direction='inbound' && !isRead）        │
│      ↓                                                        │
│  【是】→ syncToMasterNow() 立即推送（不等30秒定期）           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         Master 层                            │
├─────────────────────────────────────────────────────────────┤
│  DataSyncReceiver.handleWorkerDataSync()                    │
│      ↓                                                        │
│  detectNewMessages() → 检测到新消息                           │
│      ↓                                                        │
│  buildNewMessageHints() → 构建简易概要                        │
│      ↓                                                        │
│  broadcastToMonitors('monitor:new_message_hint', hint)      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       IM 客户端层                             │
├─────────────────────────────────────────────────────────────┤
│  监听 'monitor:new_message_hint'                             │
│      ↓                                                        │
│  handleNewMessageHint() → 处理新消息提示                      │
│      ├─ 立即更新红点未读数（不防抖）                          │
│      ├─ 显示浏览器通知（不防抖）                              │
│      └─ 防抖刷新详细数据（1秒内多次合并）                     │
│          ├─ handleCommentHint() → 按需拉取评论数据           │
│          └─ handlePrivateMessageHint() → 按需拉取私信数据    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **纯按需拉取策略**：
   - 服务端：只推送简易概要（200-500字节）
   - 客户端：收到提示后主动拉取需要的数据
   - 优势：减轻服务端压力，尤其是客户端数量多时

2. **客户端防抖机制**：
   - 红点更新：立即执行（不防抖）
   - 浏览器通知：立即执行（不防抖）
   - 详细数据刷新：1秒防抖合并

3. **智能刷新策略**：
   - 在相关页面 → 主动拉取并刷新
   - 不在相关页面 → 只更新红点

4. **渐进式升级**：
   - 定期推送保留为兜底机制（30秒）
   - 新消息立即推送作为主要机制（1-3秒）

---

## 三、实施详情

### 3.1 Worker层改动

**文件**：`packages/worker/src/platforms/base/account-data-manager.js`

**改动1：构造函数添加新消息检测标志**

```javascript
// 行64-70
// ✨ 新增：新消息检测标志
this.hasNewMessages = false;
this.newMessageDetails = {
  comments: [],    // 新评论列表
  messages: [],    // 新私信列表
};
this._isSyncing = false;  // 防抖标志
```

**改动2：upsertMessage() 中添加新消息检测**

```javascript
// 行166-174
// ✨ 新增：检测是否为新消息（inbound 且未读）
if (isNew && message.direction === 'inbound' && !message.isRead) {
  this.hasNewMessages = true;
  this.newMessageDetails.messages.push(message);

  // 立即推送
  this.logger.info(`🔔 检测到新私信，触发立即推送: ${message.messageId}`);
  this.syncToMasterNow();
}
```

**改动3：upsertComment() 中添加新消息检测**

```javascript
// 行278-286
// ✨ 新增：检测是否为新评论（inbound 且未读）
if (isNew && comment.direction === 'inbound' && !comment.isRead) {
  this.hasNewMessages = true;
  this.newMessageDetails.comments.push(comment);

  // 立即推送
  this.logger.info(`🔔 检测到新评论，触发立即推送: ${comment.commentId}`);
  this.syncToMasterNow();
}
```

**改动4：新增 syncToMasterNow() 方法**

```javascript
// 行619-640
async syncToMasterNow() {
  // 防抖：如果正在推送，则跳过
  if (this._isSyncing) {
    this.logger.debug('Already syncing, skip immediate push');
    return;
  }

  this._isSyncing = true;

  try {
    await this.syncToMaster();

    // 清除新消息标志
    this.hasNewMessages = false;
    this.newMessageDetails = {
      comments: [],
      messages: [],
    };
  } finally {
    this._isSyncing = false;
  }
}
```

---

### 3.2 Master层改动

**文件**：`packages/master/src/communication/data-sync-receiver.js`

**改动1：handleWorkerDataSync() 中推送简易概要**

```javascript
// 行105-118
// ✅ 检测是否有新消息，只推送简易概要
if (this.imWebSocketServer) {
  const newMessagesInfo = this.detectNewMessages(oldData, snapshot);

  if (newMessagesInfo.hasNew) {
    // ✨ 只推送简易概要，客户端按需拉取详细数据
    const hints = this.buildNewMessageHints(accountId, snapshot.platform, newMessagesInfo);
    for (const hint of hints) {
      this.imWebSocketServer.broadcastToMonitors('monitor:new_message_hint', hint);
    }

    logger.info(`📤 Broadcasted ${hints.length} new message hints for ${accountId}`);
  }
}
```

**改动2：detectNewMessages() 返回详细信息**

```javascript
// 行153-209
detectNewMessages(oldData, newSnapshot) {
  try {
    const result = {
      hasNew: false,
      comments: [],   // 新增的评论列表
      messages: [],   // 新增的私信列表
    };

    // 检测新评论
    if (newSnapshot.data?.comments) {
      const oldComments = oldData?.data?.comments || [];
      const oldCommentIds = new Set(...);

      // 收集新增的评论（排除客服发送的）
      for (const comment of newCommentsList) {
        if (!oldCommentIds.has(comment.commentId) && comment.direction !== 'outbound') {
          result.comments.push(comment);
          result.hasNew = true;
        }
      }
    }

    // 检测新私信（类似逻辑）
    // ...

    return result;
  } catch (error) {
    logger.error('检测新消息时出错:', error);
    return { hasNew: false, comments: [], messages: [] };
  }
}
```

**改动3：buildNewMessageHints() 构建简易概要**

```javascript
// 行218-277
buildNewMessageHints(accountId, platform, newMessagesInfo) {
  const hints = [];

  // 计算总未读数
  const accountData = this.dataStore.accounts.get(accountId);
  const totalUnreadCount = this.calculateUnreadCount(accountData);

  // 1. 按作品分组评论
  const commentsByTopic = new Map();
  for (const comment of newMessagesInfo.comments) {
    const topicId = comment.contentId;
    if (!commentsByTopic.has(topicId)) {
      commentsByTopic.set(topicId, []);
    }
    commentsByTopic.get(topicId).push(comment);
  }

  // 为每个作品创建一个 hint
  for (const [topicId, comments] of commentsByTopic) {
    const firstComment = comments[0];
    hints.push({
      channelId: accountId,
      platform,
      messageType: 'comment',
      topicId,
      topicTitle: firstComment.contentTitle || '未知作品',
      commentCount: comments.length,
      totalUnreadCount,
      timestamp: Date.now(),
    });
  }

  // 2. 按会话分组私信（类似逻辑）
  // ...

  return hints;
}
```

**改动4：calculateUnreadCount() 计算总未读数**

```javascript
// 行284-306
calculateUnreadCount(accountData) {
  if (!accountData || !accountData.data) return 0;

  let count = 0;

  // 评论未读数
  if (accountData.data.comments) {
    const comments = Array.isArray(accountData.data.comments)
      ? accountData.data.comments
      : Array.from(accountData.data.comments.values());
    count += comments.filter(c => !c.isRead && c.direction !== 'outbound').length;
  }

  // 私信未读数
  if (accountData.data.messages) {
    const messages = Array.isArray(accountData.data.messages)
      ? accountData.data.messages
      : Array.from(accountData.data.messages.values());
    count += messages.filter(m => !m.isRead && m.direction !== 'outbound').length;
  }

  return count;
}
```

---

### 3.3 客户端层改动

**文件1**：`packages/crm-pc-im/src/shared/types-monitor.ts`

**改动：添加 NewMessageHint 类型定义**

```typescript
// 行83-103
export interface NewMessageHint {
  channelId: string          // 账户 ID
  platform: string           // 平台（douyin, xiaohongshu）
  messageType: 'comment' | 'private_message'  // 消息类型

  // 评论相关（messageType='comment' 时）
  topicId?: string           // 作品 ID
  topicTitle?: string        // 作品标题
  commentCount?: number      // 该作品新增评论数

  // 私信相关（messageType='private_message' 时）
  conversationId?: string    // 会话 ID
  fromUserId?: string        // 发送者 ID
  fromUserName?: string      // 发送者名称
  messageCount?: number      // 该会话新增消息数

  // 汇总信息
  totalUnreadCount: number   // 该账户总未读数
  timestamp: number          // 时间戳
}
```

**文件2**：`packages/crm-pc-im/src/store/monitorSlice.ts`

**改动：添加 updateChannelUnreadCount action**

```typescript
// 行405-437
updateChannelUnreadCount: (state, action: PayloadAction<{
  channelId: string
  unreadCount: number
}>) => {
  const { channelId, unreadCount } = action.payload
  const channel = state.channels.find(ch => ch.id === channelId)
  if (channel) {
    console.log(`[Store] 更新账户未读数: ${channel.name} -> ${unreadCount}`)
    channel.unreadCount = unreadCount

    // 如果有未读消息，标记为闪烁
    if (unreadCount > 0) {
      channel.isFlashing = true
    }

    // 重新排序账户列表（有未读的在前）
    state.channels.sort((a, b) => {
      // 1. 置顶的在前
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1

      // 2. 有未读消息的在前
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1

      // 3. 按最新消息时间降序
      const aTime = a.lastMessageTime || 0
      const bTime = b.lastMessageTime || 0
      return bTime - aTime
    })
  }
}
```

**文件3**：`packages/crm-pc-im/src/pages/MonitorPage.tsx`

**改动1：添加防抖定时器 ref**

```typescript
// 行102-103
const refreshTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
```

**改动2：添加处理函数（在 WebSocket 连接 useEffect 之前）**

```typescript
// 行293-394
// handleNewMessageHint() - 处理新消息提示（带防抖）
// handleCommentHint() - 处理评论提示
// handlePrivateMessageHint() - 处理私信提示
```

**改动3：在 WebSocket 连接中添加监听**

```typescript
// 行415
websocketService.on('monitor:new_message_hint', handleNewMessageHint)
```

**改动4：在清理函数中取消监听**

```typescript
// 行426
websocketService.off('monitor:new_message_hint')
```

**改动5：添加定时器清理 useEffect**

```typescript
// 行534-540
useEffect(() => {
  return () => {
    refreshTimers.current.forEach(timer => clearTimeout(timer))
    refreshTimers.current.clear()
  }
}, [])
```

---

## 四、数据流示例

### 4.1 评论消息推送流程

```
1. Worker: 爬虫检测到新评论
   └─ upsertComment({ commentId: '123', direction: 'inbound', isRead: false })
      └─ 🔔 检测到新评论，触发立即推送
         └─ syncToMasterNow()

2. Master: 收到数据同步
   └─ handleWorkerDataSync()
      └─ detectNewMessages() → { hasNew: true, comments: [评论1, 评论2] }
         └─ buildNewMessageHints() → [
              {
                channelId: 'douyin_account_123',
                platform: 'douyin',
                messageType: 'comment',
                topicId: '7123456789',
                topicTitle: '我的最新作品',
                commentCount: 2,
                totalUnreadCount: 15,
                timestamp: 1699876543210
              }
            ]
            └─ broadcastToMonitors('monitor:new_message_hint', hint)

3. Client: 收到新消息提示
   └─ handleNewMessageHint(hint)
      ├─ 立即更新红点：dispatch(updateChannelUnreadCount({ unreadCount: 15 }))
      ├─ 显示通知："我的最新作品 收到 2 条新评论"
      └─ 1秒后执行 handleCommentHint(hint)
         ├─ 如果在该账户页面：emit('monitor:request_topics')
         └─ 如果在该作品页面：emit('monitor:request_messages')
```

### 4.2 私信消息推送流程

```
1. Worker: 爬虫检测到新私信
   └─ upsertMessage({ messageId: 'msg_456', direction: 'inbound', isRead: false })
      └─ 🔔 检测到新私信，触发立即推送
         └─ syncToMasterNow()

2. Master: 收到数据同步
   └─ handleWorkerDataSync()
      └─ detectNewMessages() → { hasNew: true, messages: [私信1] }
         └─ buildNewMessageHints() → [
              {
                channelId: 'douyin_account_123',
                platform: 'douyin',
                messageType: 'private_message',
                conversationId: 'conv_user_456',
                fromUserId: '456',
                fromUserName: '粉丝小明',
                messageCount: 1,
                totalUnreadCount: 15,
                timestamp: 1699876543210
              }
            ]
            └─ broadcastToMonitors('monitor:new_message_hint', hint)

3. Client: 收到新消息提示
   └─ handleNewMessageHint(hint)
      ├─ 立即更新红点：dispatch(updateChannelUnreadCount({ unreadCount: 15 }))
      ├─ 显示通知："粉丝小明 发来 1 条新消息"
      └─ 1秒后执行 handlePrivateMessageHint(hint)
         ├─ 如果在该账户页面：emit('monitor:request_topics')
         └─ 如果在该会话页面：emit('monitor:request_messages')
```

---

## 五、性能优化

### 5.1 Worker层防抖机制

```javascript
if (this._isSyncing) {
  this.logger.debug('Already syncing, skip immediate push');
  return;
}
```

**效果**：避免短时间内多次检测到新消息时频繁推送

### 5.2 客户端防抖机制

```javascript
// 清除之前的定时器
if (refreshTimers.current.has(refreshKey)) {
  clearTimeout(refreshTimers.current.get(refreshKey)!)
}

// 设置新的定时器（1秒后执行）
const timer = setTimeout(() => {
  // 执行刷新逻辑
}, 1000)
```

**效果**：1秒内收到多条同一作品/会话的新消息提示时，合并为一次刷新请求

### 5.3 按需拉取策略

**服务端**：
- 只推送简易概要（200-500 字节）
- 不推送完整 topics 列表（可能10KB+）
- 流量减少95%+

**客户端**：
- 只在需要时请求详细数据
- 不在相关页面时，只更新红点

---

## 六、监控指标建议

### 6.1 Worker层

- 新消息检测次数
- 立即推送触发次数
- 立即推送延迟（从检测到推送完成）
- 防抖跳过次数（_isSyncing 触发）

### 6.2 Master层

- 简易概要推送次数
- 推送失败次数
- 推送延迟
- 每次推送的客户端数量

### 6.3 客户端层

- 接收到简易提示次数
- 防抖合并次数（定时器被清除的次数）
- 主动刷新请求次数
- 红点更新次数
- UI 刷新延迟（从提示到 UI 更新）

---

## 七、测试计划

### 7.1 单元测试

- [ ] Worker: syncToMasterNow() 防抖机制
- [ ] Master: detectNewMessages() 新消息检测
- [ ] Master: buildNewMessageHints() 概要构建
- [ ] Client: handleNewMessageHint() 防抖机制

### 7.2 集成测试

- [ ] Worker到Master的立即推送功能
- [ ] Master的新消息检测和概要推送
- [ ] 客户端的防抖机制和按需拉取

### 7.3 边界场景测试

- [ ] 快速连续新消息（测试防抖）
- [ ] 切换账户时的红点更新
- [ ] 在会话内时的自动刷新
- [ ] 不在会话内时不刷新详情

### 7.4 性能测试

- [ ] 对比实时推送vs定期推送的延迟
- [ ] 测试多客户端场景下的服务端压力
- [ ] 测试防抖机制的有效性

---

## 八、风险评估

| 风险 | 影响 | 概率 | 缓解措施 | 状态 |
|------|------|------|----------|------|
| Worker 频繁推送导致性能问题 | 中 | 低 | Worker层防抖机制 | ✅ 已实施 |
| 客户端频繁请求导致服务器压力 | 中 | 低 | 客户端防抖机制 | ✅ 已实施 |
| Master 推送失败 | 低 | 低 | 保留定期推送兜底 | ✅ 已保留 |
| 客户端监听器未注册 | 低 | 低 | 定期推送兜底 | ✅ 已保留 |
| 网络延迟导致推送顺序错乱 | 低 | 低 | 时间戳比对 | ⏳ 待实施 |

---

## 九、后续优化方向

1. **WebSocket 压缩**：启用 Socket.IO 的压缩功能，进一步减少流量
2. **推送优先级**：为不同类型的消息设置优先级（如私信 > 评论）
3. **批量推送**：在短时间内（如1秒）收到多条新消息时，批量推送一次
4. **离线消息**：客户端重新连接后，拉取离线期间的新消息
5. **时间戳校验**：客户端忽略旧于当前数据的推送，避免顺序错乱

---

## 十、总结

### 10.1 实施成果

✅ **Worker层**：完成新消息检测和立即推送功能
✅ **Master层**：完成新消息检测、概要构建和广播功能
✅ **客户端层**：完成消息提示监听、防抖机制和按需拉取功能
✅ **类型定义**：完成 NewMessageHint 接口定义
✅ **代码语法**：通过编译验证，无语法错误

### 10.2 代码统计

| 层级 | 修改文件 | 新增代码 | 新增功能 |
|------|---------|---------|---------|
| Worker | 1个文件 | ~70行 | 新消息检测、立即推送 |
| Master | 1个文件 | ~180行 | 新消息检测、概要构建、广播 |
| Client | 3个文件 | ~200行 | 监听、防抖、按需拉取、红点更新 |
| **总计** | **5个文件** | **~450行** | **完整实时推送链路** |

### 10.3 预期效果

| 指标 | 当前（定期推送） | 目标（实时推送） | 改进幅度 |
|------|----------------|----------------|---------|
| 消息延迟 | 最高30秒 | 1-3秒 | **降低90%+** |
| 服务端流量 | 完整数据推送 | 简易概要推送 | **减少95%+** |
| 客户端请求 | 被动接收 | 按需拉取 | **更智能** |
| 用户体验 | 延迟明显 | 几乎实时 | **显著提升** |

### 10.4 下一步行动

1. ⏳ **启动测试**：按照测试计划进行功能验证
2. ⏳ **性能监控**：添加监控指标，观察运行效果
3. ⏳ **生产部署**：通过测试后部署到生产环境
4. ⏳ **持续优化**：根据监控数据进行调优

---

**文档版本**：v1.0
**创建时间**：2025-11-14
**创建者**：Claude Code
**文件路径**：`docs/IM实时推送功能实施总结.md`
