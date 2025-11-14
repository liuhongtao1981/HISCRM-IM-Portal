# Socket 通信接口对比 - 服务端与客户端

## 一、客户端 → 服务端（客户端发送的请求）

| 事件名称 | 客户端发送 | 服务端监听 | 匹配状态 | 说明 |
|---------|----------|-----------|---------|------|
| `monitor:register` | ✅ MonitorPage.tsx:306 | ✅ im-websocket-server.js:43 | ✅ 匹配 | 客户端注册 |
| `monitor:request_channels` | ✅ MonitorPage.tsx:411 | ✅ im-websocket-server.js:48 | ✅ 匹配 | 请求频道列表 |
| `monitor:request_topics` | ✅ MonitorPage.tsx:322,434 | ✅ im-websocket-server.js:53 | ✅ 匹配 | 请求主题列表 |
| `monitor:request_messages` | ✅ MonitorPage.tsx:463,475,483,506 | ✅ im-websocket-server.js:58 | ✅ 匹配 | 请求消息列表 |
| `monitor:reply` | ✅ MonitorPage.tsx:576 | ✅ im-websocket-server.js:63 | ✅ 匹配 | 发送回复 |
| `monitor:mark_as_read` | ❌ 未发送 | ✅ im-websocket-server.js:70 | ⚠️ 未使用 | 标记单条消息已读 |
| `monitor:mark_batch_as_read` | ❌ 未发送 | ✅ im-websocket-server.js:75 | ⚠️ 未使用 | 批量标记已读 |
| `monitor:mark_topic_as_read` | ✅ MonitorPage.tsx:489 | ✅ im-websocket-server.js:80 | ✅ 匹配 | 标记作品所有评论已读 |
| `monitor:mark_conversation_as_read` | ✅ MonitorPage.tsx:512 | ✅ im-websocket-server.js:85 | ✅ 匹配 | 标记会话所有私信已读 |
| `monitor:get_unread_count` | ❌ 未发送 | ✅ im-websocket-server.js:90 | ⚠️ 未使用 | 获取未读计数 |

## 二、服务端 → 客户端（服务端推送的响应和通知）

| 事件名称 | 服务端发送 | 客户端监听 | 匹配状态 | 说明 |
|---------|----------|-----------|---------|------|
| `monitor:registered` | ✅ im-websocket-server.js:136 | ❌ 未监听 | ❌ **不匹配** | 注册成功响应 |
| `monitor:channels` | ✅ im-websocket-server.js:133,158,1406,1963 | ✅ MonitorPage.tsx:312 | ✅ 匹配 | 频道列表推送 |
| `monitor:topics` | ✅ im-websocket-server.js:174,1643,1709 | ✅ MonitorPage.tsx:327 | ✅ 匹配 | 主题列表推送 |
| `monitor:messages` | ✅ im-websocket-server.js:191 | ✅ MonitorPage.tsx:356 | ✅ 匹配 | 消息列表响应 |
| `monitor:sending_queue` | ✅ im-websocket-server.js:195,1918 | ✅ MonitorPage.tsx:400 | ✅ 匹配 | 发送队列更新 |
| `channel:message` | ✅ im-websocket-server.js:1421 | ✅ MonitorPage.tsx:364 | ✅ 匹配 | 新消息推送 |
| `channel:message:status` | ✅ im-websocket-server.js:522 | ❌ 未监听 | ❌ **不匹配** | 消息状态更新 |
| `monitor:mark_as_read_response` | ✅ im-websocket-server.js:1482 | ❌ 未监听 | ❌ **不匹配** | 标记已读响应 |
| `monitor:message_read` | ✅ im-websocket-server.js:1490 | ❌ 未监听 | ❌ **不匹配** | 已读状态广播 |
| `monitor:mark_batch_as_read_response` | ✅ im-websocket-server.js:1566 | ❌ 未监听 | ❌ **不匹配** | 批量已读响应 |
| `monitor:messages_read` | ✅ im-websocket-server.js:1574 | ❌ 未监听 | ❌ **不匹配** | 批量已读广播 |
| `monitor:mark_topic_as_read_response` | ✅ im-websocket-server.js:1625 | ❌ 未监听 | ❌ **不匹配** | 主题已读响应 |
| `monitor:topic_read` | ✅ im-websocket-server.js:1634 | ❌ 未监听 | ❌ **不匹配** | 主题已读广播 |
| `monitor:mark_conversation_as_read_response` | ✅ im-websocket-server.js:1691 | ❌ 未监听 | ❌ **不匹配** | 会话已读响应 |
| `monitor:conversation_read` | ✅ im-websocket-server.js:1700 | ❌ 未监听 | ❌ **不匹配** | 会话已读广播 |
| `monitor:unread_count_response` | ✅ im-websocket-server.js:1746,1777 | ❌ 未监听 | ❌ **不匹配** | 未读计数响应 |
| `monitor:unread_update` | ✅ im-websocket-server.js:1858 | ❌ 未监听 | ❌ **不匹配** | **定期未读数推送** |

## 三、数据流对比

### 3.1 新消息推送流程（当前已修复）

```
Worker 爬取新消息
    ↓
WORKER_DATA_SYNC → Master
    ↓
DataSyncReceiver.detectNewMessages() - 检测新消息
    ↓
【有新消息】→ broadcastToMonitors('monitor:topics') ✅
    ↓
客户端监听 monitor:topics ✅
    ↓
dispatch(setTopics()) → UI 自动刷新 ✅
```

### 3.2 定期推送流程（问题所在）

```
每 5 秒轮询
    ↓
checkAndPushUnreadNotifications()
    ↓
计算未读数变化
    ↓
broadcastToMonitors('monitor:unread_update') ❌
    ↓
客户端未监听 monitor:unread_update ❌
    ↓
UI 不会刷新 ❌
```

## 四、问题总结

### 🔴 关键问题

1. **定期推送无效**: 服务端每 5 秒推送 `monitor:unread_update`，但客户端没有监听
2. **已读状态广播未生效**:
   - `monitor:message_read` - 单条消息已读广播
   - `monitor:messages_read` - 批量已读广播
   - `monitor:topic_read` - 主题已读广播
   - `monitor:conversation_read` - 会话已读广播

### ⚠️ 未使用的接口

1. **客户端未发送但服务端监听**:
   - `monitor:mark_as_read` - 标记单条消息已读
   - `monitor:mark_batch_as_read` - 批量标记已读
   - `monitor:get_unread_count` - 获取未读计数

2. **服务端发送但客户端未监听**:
   - `monitor:registered` - 注册成功响应
   - `channel:message:status` - 消息状态更新
   - 所有 `*_response` 和 `*_read` 广播事件

## 五、修复建议

### 方案 1: 修改定期推送逻辑（推荐）

**优点**: 复用现有的 `monitor:topics` 事件，客户端已监听
**缺点**: 推送数据量稍大（完整 topics 列表）

```javascript
// 在 im-websocket-server.js 的 checkAndPushUnreadNotifications() 中
if (currentUnread.total > lastUnread.total) {
  // 推送完整的 topics 更新，而不是只推送未读数
  const updatedTopics = this.getTopicsFromDataStore(accountId);
  this.broadcastToMonitors('monitor:topics', {
    channelId: accountId,
    topics: updatedTopics
  });
}
```

### 方案 2: 客户端监听 monitor:unread_update

**优点**: 数据量小（只推送未读数变化）
**缺点**: 需要修改客户端代码，增加 Redux action

```typescript
// 在 MonitorPage.tsx 中添加
websocketService.on('monitor:unread_update', (data: any) => {
  // 更新对应频道的未读数
  dispatch(updateChannelUnreadCount({
    channelId: data.channelId,
    unread: data.unread
  }));
});
```

### 方案 3: 混合方案

- **新消息推送**: 使用 `monitor:topics`（已实现）
- **定期推送**: 改为推送 `monitor:topics`
- **已读状态**: 保持现有的 `monitor:topics` 推送（已实现）

## 六、当前修复状态

✅ **已修复**: Worker 数据同步时检测新消息并推送 `monitor:topics`
❌ **待修复**: 定期推送改为推送 `monitor:topics` 或客户端监听 `monitor:unread_update`

---

**生成时间**: 2025-11-13
**文件路径**: `docs/Socket通信接口对比-服务端与客户端.md`
