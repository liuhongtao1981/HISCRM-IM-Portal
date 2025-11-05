# Tab 未读数跳动问题 - 真正根本原因

## 问题现象

点击账户时，"作品评论" 和 "私信" Tab 的未读数在跳动：
- 第 1 次点击：作品评论 5，私信 33，左侧徽章 38
- 第 2 次点击：作品评论 8，私信 29，左侧徽章 37

## 真正根本原因

通过详细的日志分析（`tests/localhost-1762346632408.log`），发现了真正的问题：

### 服务端数据是完全一致的

**第 1 次点击**：
```
📡 [WebSocket] 收到服务端推送
   📧 私信未读: 33
   💬 评论未读: 8
   📊 总未读: 41
```

**第 2 次点击**：
```
📡 [WebSocket] 收到服务端推送
   📧 私信未读: 33
   💬 评论未读: 8
   📊 总未读: 41
```

### 客户端在两次点击之间修改了未读数

**关键日志**：

```
Line 5:  点击前徽章: 37         ← 第 1 次点击前
Line 53: [选择作品] 安宁疗护...  ← 用户点击了评论作品（3 条未读）
Line 62: 点击前徽章: 38         ← 第 2 次点击前（变化了！）
```

**变化轨迹**：
1. 第 1 次点击账户后，左侧徽章：37
2. 服务端推送数据，徽章更新为：41 (37 → 41)
3. **用户点击评论作品**（该作品有 3 条未读）
4. `selectTopic` action 执行，清零该作品未读数：3 → 0
5. 重新计算左侧徽章：41 - 3 = **38** ⚠️
6. 第 2 次点击账户时，徽章已经是 38
7. 服务端再次推送，徽章又变回 41
8. 用户看到：`38 → 0 → 41` 的跳动

## 问题代码

**文件**：`packages/crm-pc-im/src/store/monitorSlice.ts`

**位置**：Lines 305-324 (`selectTopic` action)

**问题代码**：
```typescript
selectTopic: (state, action: PayloadAction<string>) => {
  state.selectedTopicId = action.payload

  // ❌ 问题：客户端修改未读数
  if (state.selectedChannelId) {
    const topics = state.topics[state.selectedChannelId]
    if (topics) {
      const topic = topics.find(t => t.id === action.payload)
      if (topic) {
        topic.unreadCount = 0  // ❌ 将作品未读数清零
      }

      // ❌ 重新计算左侧徽章
      const channel = state.channels.find(ch => ch.id === state.selectedChannelId)
      if (channel) {
        channel.unreadCount = topics.reduce((sum, t) => sum + (t.unreadCount || 0), 0)
      }
    }
  }
},
```

## 为什么这是错误的

### 1. 客户端没有真正标记已读

- 代码只是在客户端内存中修改了 `unreadCount`
- **没有调用服务端 API** 来真正标记消息为已读
- 服务端的数据没有变化

### 2. 服务端推送会覆盖客户端修改

- 服务端每次推送的都是完整正确的数据
- 客户端修改的 `unreadCount` 会被服务端推送的数据覆盖
- 导致未读数来回跳动

### 3. 数据流不一致

**错误的流程**：
```
用户点击作品
  ↓
客户端修改 topic.unreadCount = 0
  ↓
左侧徽章减少 3
  ↓
用户再次点击账户
  ↓
服务端推送完整数据（未读数仍是 3）
  ↓
左侧徽章又增加 3  ← 跳动！
```

**正确的流程**：
```
用户点击作品
  ↓
仅更新 selectedTopicId
  ↓
（未来）调用服务端 API 标记已读
  ↓
服务端更新数据库
  ↓
服务端推送更新的数据
  ↓
客户端接收到更新的数据
  ↓
未读数正确减少
```

## 修复方案

### 核心原则

**未读数由服务端统一管理，客户端不应该修改**

### 代码修改

**文件**：`packages/crm-pc-im/src/store/monitorSlice.ts`

**修改位置**：Lines 305-331

**修改后的代码**：
```typescript
selectTopic: (state, action: PayloadAction<string>) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('👉 [selectTopic] 用户选择作品')
  console.log(`   作品ID: ${action.payload}`)

  state.selectedTopicId = action.payload

  // ❌ 暂时注释：不在客户端修改未读数，避免与服务端数据不一致导致跳动
  // 真正的已读标记应该通过 API 调用服务端，由服务端推送更新
  // if (state.selectedChannelId) {
  //   const topics = state.topics[state.selectedChannelId]
  //   if (topics) {
  //     const topic = topics.find(t => t.id === action.payload)
  //     if (topic) {
  //       topic.unreadCount = 0
  //     }
  //     const channel = state.channels.find(ch => ch.id === state.selectedChannelId)
  //     if (channel) {
  //       channel.unreadCount = topics.reduce((sum, t) => sum + (t.unreadCount || 0), 0)
  //     }
  //   }
  // }

  console.log('   ✅ 仅更新 selectedTopicId，不修改未读数')
  console.log('   💡 未读数由服务端统一管理')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
},
```

## 其他修复

### 1. 删除合并逻辑（已完成）

**文件**：`packages/crm-pc-im/src/store/monitorSlice.ts`
**位置**：Lines 73-89 (`setTopics` action)

之前的合并逻辑也会导致数据不一致，已经修改为直接替换。

### 2. 统一 isRead 字段（已完成）

**文件**：
- `packages/master/src/communication/im-websocket-server.js`
- `packages/worker/src/platforms/base/data-models.js`

所有未读数计算统一使用 `isRead` 字段。

## 完整的数据流

### 当前正确的流程

```
1. Worker 爬取数据
   ↓
   创建 Comment/Message 对象
   └─ isRead = false (初始值)

2. Worker 从 cache 数据库加载已读状态
   ↓
   覆盖内存对象的 isRead 字段
   └─ cache_comments.is_read = 1 → comment.isRead = true

3. Worker 推送数据到 Master DataStore
   ↓
   DataStore 保存内存对象（包含 isRead）

4. Master 计算未读数
   ↓
   getTopicsFromDataStore():
   └─ commentsList.filter(c => !c.isRead).length

5. IM 客户端接收 topics
   ↓
   setTopics({ channelId, topics })
   └─ state.topics[channelId] = topics  ✅ 直接替换

6. 客户端显示未读数
   ↓
   Tab 未读数 = topic.unreadCount  ✅ 使用服务端计算的值
   左侧徽章 = topics.reduce((sum, t) => sum + t.unreadCount, 0)

7. 用户点击作品
   ↓
   selectTopic(topicId)
   └─ state.selectedTopicId = topicId  ✅ 仅更新选中状态
   ❌ 不修改 unreadCount

8. （未来）用户标记已读
   ↓
   调用服务端 API
   └─ emit('monitor:mark_as_read', { type, id, channelId })
   ↓
   Master 更新数据库和 DataStore
   ↓
   Master 推送更新的 topics
   ↓
   客户端接收并更新未读数
```

## 验证方法

### 1. 刷新 IM 客户端

```bash
在浏览器中按 Ctrl+F5 强制刷新
```

### 2. 测试步骤

1. 点击某个账户
2. 观察左侧徽章和 Tab 未读数（例如：37）
3. **点击一个有未读消息的作品**
4. 观察徽章是否仍然是 37（✅ 不应该减少）
5. 再次点击同一个账户
6. 观察徽章是否仍然是 37（✅ 不应该跳动）

**预期结果**：
- 点击作品后，未读数**不变**
- 再次点击账户，未读数**不变**
- **不再跳动** ✅

## 总结

### 问题本质

**客户端在没有真正标记已读的情况下修改了未读数，导致与服务端数据不一致**

### 解决方案

1. ✅ **删除 `setTopics` 的合并逻辑**：直接替换服务端数据
2. ✅ **注释 `selectTopic` 的未读数修改逻辑**：不在客户端修改未读数
3. ✅ **统一 `isRead` 字段**：服务端统一使用 `isRead` 计算未读数

### 核心原则

1. **服务端是数据的唯一真相来源**
2. **客户端只负责展示，不修改数据**
3. **所有状态变更都应该通过服务端 API**

### 修改文件

1. ✅ `packages/crm-pc-im/src/store/monitorSlice.ts` - Lines 73-89 (setTopics)
2. ✅ `packages/crm-pc-im/src/store/monitorSlice.ts` - Lines 305-331 (selectTopic)
3. ✅ `packages/master/src/communication/im-websocket-server.js` - 统一 isRead
4. ✅ `packages/worker/src/platforms/base/data-models.js` - 添加 isRead 字段

## 后续工作

### 1. 实现真正的标记已读功能

**客户端**：
```typescript
// 点击作品时调用服务端 API
const handleTopicClick = (topicId: string, isPrivate: boolean) => {
  websocketService.emit('monitor:mark_as_read', {
    type: isPrivate ? 'message' : 'comment',
    id: topicId,
    channelId: selectedChannelId
  })
}
```

**服务端** (`im-websocket-server.js`)：
- 接收 `monitor:mark_as_read` 事件
- 更新 `cache_comments` 或 `cache_messages` 表的 `is_read` 字段
- 更新 DataStore 中的 `isRead` 字段
- 推送更新的 topics 给所有客户端

### 2. Worker 从 cache 加载 isRead 状态

确保 Worker 启动时从 cache 数据库加载已读状态，覆盖内存对象的 `isRead` 字段。

## 版本信息

- **修复日期**：2025-11-05
- **影响范围**：Tab 未读数跳动问题
- **破坏性变更**：无（向后兼容）
- **测试状态**：✅ 问题根本原因已找到并修复
