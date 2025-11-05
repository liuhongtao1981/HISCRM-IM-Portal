# IM 徽章计数修复 - Tab 和账户级别未读数

## 问题描述

用户反馈：私信和作品评论 Tab 上面的数字不对，左侧账号上的数字也不对。

### 截图证据
用户提供的截图显示：
- 私信 Tab 的徽章数字不准确
- 作品评论 Tab 的徽章数字不准确
- 左侧账户列表中的徽章数字不准确

## 根本原因分析

### 问题 1: Tab 徽章只计算当前选中作品的消息

**位置**: `packages/crm-pc-im/src/pages/MonitorPage.tsx` Line 72-78

**旧代码**:
```typescript
const privateUnhandledCount = currentMessages.filter(msg =>
  msg.messageCategory === 'private' && !msg.isHandled
).length
const commentUnhandledCount = currentMessages.filter(msg =>
  (msg.messageCategory === 'comment' || !msg.messageCategory) && !msg.isHandled
).length
```

**问题**:
- `currentMessages` 只包含当前选中作品的消息
- 导致 Tab 徽章只显示当前作品的未读数
- 用户期望看到的是该账户下所有作品的未读数总和

### 问题 2: 账户级别的未读数不更新

**位置**: `packages/crm-pc-im/src/store/monitorSlice.ts` Line 251-265

**旧代码**:
```typescript
selectTopic: (state, action: PayloadAction<string>) => {
  state.selectedTopicId = action.payload

  // 清除该作品的未读计数
  if (state.selectedChannelId) {
    const topics = state.topics[state.selectedChannelId]
    if (topics) {
      const topic = topics.find(t => t.id === action.payload)
      if (topic) {
        topic.unreadCount = 0  // ❌ 清零了，但没有重新计算 channel.unreadCount
      }
    }
  }
},
```

**问题**:
- 当用户点击某个作品进入对话，topic 的 `unreadCount` 被清零
- 但账户的 `channel.unreadCount` 没有重新计算
- 导致左侧账户徽章数字不准确（显示过时的值）

## 修复方案

### 修复 1: Tab 徽章汇总所有作品的未读数

**新代码** (`MonitorPage.tsx`):
```typescript
// 计算私信和评论的未处理数量（汇总该账户下所有作品的未读消息）
const privateUnhandledCount = React.useMemo(() => {
  if (!selectedChannelId) return 0

  // 遍历该账户的所有作品，汇总私信未读数
  return currentTopics.reduce((sum, topic) => {
    if (topic.isPrivate) {
      // 对于私信主题，使用服务端推送的 unreadCount
      return sum + (topic.unreadCount || 0)
    }
    return sum
  }, 0)
}, [selectedChannelId, currentTopics])

const commentUnhandledCount = React.useMemo(() => {
  if (!selectedChannelId) return 0

  // 遍历该账户的所有作品，汇总评论未读数
  return currentTopics.reduce((sum, topic) => {
    if (!topic.isPrivate) {
      // 对于评论主题，使用服务端推送的 unreadCount
      return sum + (topic.unreadCount || 0)
    }
    return sum
  }, 0)
}, [selectedChannelId, currentTopics])
```

**改进**:
- 使用 `React.useMemo` 优化性能
- 遍历 `currentTopics`（该账户的所有作品）
- 根据 `topic.isPrivate` 区分私信和评论
- 使用服务端推送的 `topic.unreadCount`（已验证准确）

### 修复 2: 选择作品时重新计算账户未读数

**新代码** (`monitorSlice.ts`):
```typescript
selectTopic: (state, action: PayloadAction<string>) => {
  state.selectedTopicId = action.payload

  // 清除该作品的未读计数
  if (state.selectedChannelId) {
    const topics = state.topics[state.selectedChannelId]
    if (topics) {
      const topic = topics.find(t => t.id === action.payload)
      if (topic) {
        topic.unreadCount = 0
      }

      // ✅ 重新计算该账户的总未读数
      const channel = state.channels.find(ch => ch.id === state.selectedChannelId)
      if (channel) {
        channel.unreadCount = topics.reduce((sum, t) => sum + (t.unreadCount || 0), 0)
      }
    }
  }
},
```

**改进**:
- 在清除作品未读数后，立即重新计算账户的总未读数
- 确保左侧账户徽章始终显示准确的值

## 数据流总结

### 服务端推送流程：
1. **Master Server** 计算每个会话的 `unreadCount`（基于 `read_at` 字段）
2. 推送 `monitor:topics` 事件，包含所有作品及其 `unreadCount`
3. 客户端 Redux store 接收 `setTopics` action

### 客户端汇总流程：
```
topics (所有作品)
  ├─ topic1 (私信会话1): unreadCount = 3
  ├─ topic2 (私信会话2): unreadCount = 5
  ├─ topic3 (评论作品1): unreadCount = 2
  └─ topic4 (评论作品2): unreadCount = 1

⬇️ 汇总到 Tab 徽章
├─ 私信 Tab: privateUnhandledCount = 3 + 5 = 8
└─ 评论 Tab: commentUnhandledCount = 2 + 1 = 3

⬇️ 汇总到账户徽章
channel.unreadCount = 3 + 5 + 2 + 1 = 11
```

### 用户点击作品进入对话：
```
selectTopic(topic1)
  ├─ topic1.unreadCount = 0  // 清零
  └─ channel.unreadCount = 0 + 5 + 2 + 1 = 8  // ✅ 重新计算

⬇️ 更新 Tab 徽章
├─ 私信 Tab: privateUnhandledCount = 0 + 5 = 5  // ✅ 自动更新
└─ 评论 Tab: commentUnhandledCount = 2 + 1 = 3  // 不变
```

## 验证清单

### 验证步骤：

1. **重启 IM 客户端**
   ```bash
   cd packages/crm-pc-im
   npm run dev
   ```

2. **选择一个有多个私信会话的账户**
   - 查看左侧账户徽章数字（A）
   - 查看私信 Tab 徽章数字（B）
   - 查看评论 Tab 徽章数字（C）
   - 验证：A = B + C

3. **点击一个有未读消息的私信会话**
   - 会话的未读数应该清零
   - 私信 Tab 的徽章数字应该减少相应数量
   - 左侧账户徽章数字应该减少相应数量

4. **切换到评论 Tab**
   - 评论 Tab 徽章数字应该显示所有作品评论的未读总数

5. **点击一个有未读评论的作品**
   - 作品的未读数应该清零
   - 评论 Tab 的徽章数字应该减少相应数量
   - 左侧账户徽章数字应该减少相应数量

### 预期结果：

✅ 私信 Tab 徽章 = 该账户所有私信会话的未读总和
✅ 评论 Tab 徽章 = 该账户所有作品评论的未读总和
✅ 账户徽章 = 私信未读 + 评论未读
✅ 点击会话/作品后，徽章数字实时更新准确

## 技术要点

### 1. 使用 React.useMemo 优化性能
```typescript
const privateUnhandledCount = React.useMemo(() => {
  // 计算逻辑
}, [selectedChannelId, currentTopics])
```
- 避免每次渲染都重新计算
- 只在依赖项变化时重新计算

### 2. 数据源一致性
- **服务端**: 基于 `read_at` 字段计算
- **客户端**: 使用服务端推送的 `topic.unreadCount`
- **不从本地消息重新计算**（避免数据不一致）

### 3. Redux 状态更新顺序
```typescript
1. topic.unreadCount = 0       // 清除作品未读
2. channel.unreadCount = sum   // 重新汇总账户未读
3. UI 自动响应 Redux 变化       // React 重新渲染
```

## 文件修改清单

### 修改的文件：
1. `packages/crm-pc-im/src/pages/MonitorPage.tsx` (Lines 72-97)
   - 修改 Tab 徽章计数逻辑，从汇总所有作品获取

2. `packages/crm-pc-im/src/store/monitorSlice.ts` (Lines 251-271)
   - 在 `selectTopic` reducer 中添加账户未读数重新计算

### 关联文件（无需修改）：
- `packages/master/src/communication/im-websocket-server.js`
  - 服务端推送逻辑已在上一次修复中完成
  - 已验证 `topic.unreadCount` 准确

## 后续优化建议

### 可选优化 1: 添加调试日志
```typescript
console.log('[徽章计数]', {
  账户: selectedChannel?.name,
  私信未读: privateUnhandledCount,
  评论未读: commentUnhandledCount,
  账户总未读: selectedChannel?.unreadCount
})
```

### 可选优化 2: 添加单元测试
```typescript
describe('Badge Count Aggregation', () => {
  it('should sum unread counts from all topics', () => {
    // 测试逻辑
  })

  it('should update channel unread count when topic is selected', () => {
    // 测试逻辑
  })
})
```

## 问题根源回顾

这个问题的根本原因是**数据聚合不完整**：

### 之前的错误假设：
❌ Tab 徽章只需要显示当前作品的未读数
❌ 账户徽章在 `setTopics` 时计算一次就够了

### 正确的设计：
✅ Tab 徽章应该聚合该账户下所有相关作品的未读数
✅ 账户徽章需要在每次作品未读数变化时重新计算
✅ 使用 React.useMemo 优化聚合计算性能

## 总结

通过这两处修复：
1. **Tab 徽章**现在能准确显示该账户下所有私信/评论的未读总数
2. **账户徽章**在用户点击进入对话后能实时更新准确数值
3. **数据一致性**得到保证（都使用服务端推送的 `topic.unreadCount`）
4. **性能优化**通过 React.useMemo 避免不必要的重复计算

用户体验改善：
- ✅ 徽章数字始终准确
- ✅ 用户能直观看到该账户有多少未读私信/评论
- ✅ 点击后徽章实时减少，反馈清晰
