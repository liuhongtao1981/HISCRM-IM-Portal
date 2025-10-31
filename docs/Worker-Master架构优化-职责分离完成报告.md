# Worker-Master 架构优化 - 职责分离完成报告

## 📋 优化背景

**问题发现**: PC IM 中作品评论只显示 2 个，但实际有 8 个作品有评论。

**根本原因**: Worker 在 `is_new` 字段设置时混入了业务逻辑（24小时时效性判断），导致：
- Worker 承担了不应该承担的业务职责
- Master 无法根据自己的业务需求灵活处理数据
- 违反了**数据层**和**业务层**的职责分离原则

## 🎯 架构设计原则

### Worker 层职责
```
✅ 数据抓取的完整性
✅ 数据关联的正确性
✅ 原始数据的传输
❌ 业务逻辑判断（已读/未读、时效性等）
```

### Master 层职责
```
✅ 业务逻辑处理
✅ 数据转换和映射
✅ 时效性判断
✅ 已读/未读状态管理
```

## 🔧 实施的修改

### 修改 1: Worker 评论处理 (platform.js)

**文件**: `packages/worker/src/platforms/douyin/platform.js`

**修改前** (Line 1168-1181):
```javascript
// ❌ 问题代码
const createIsNewFlag = (createdAt) => {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - createdAt;
  const oneDaySeconds = 24 * 60 * 60;  // 86400
  return ageSeconds < oneDaySeconds;  // Worker 判断时效性
};

const commentsWithIds = newComments.map((comment) => ({
  id: comment.platform_comment_id,
  account_id: account.id,
  is_new: createIsNewFlag(comment.create_time),  // 基于时间判断
  push_count: 0,
  ...comment,
}));
```

**修改后** (Line 1168-1178):
```javascript
// ✅ 优化代码
// is_new 表示"首次抓取"，而不是基于时间判断
// Worker 只负责数据完整性，不关心业务逻辑（时效性由 Master 处理）
// 由于 newComments 已经是通过 cacheManager.filterNewComments() 过滤的首次抓取数据
// 所以这里的 is_new 应该全部为 true
const commentsWithIds = newComments.map((comment) => ({
  id: comment.platform_comment_id,
  account_id: account.id,
  is_new: true,  // ✅ 首次抓取的评论 is_new = true
  push_count: 0,
  ...comment,
}));
```

**语义变化**:
- **旧语义**: `is_new` = "24小时内创建的评论"
- **新语义**: `is_new` = "首次抓取到的评论"

### 修改 2: Worker 私信处理 (crawl-direct-messages-v2.js)

**文件**: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`

**修改前** (Line 1122):
```javascript
is_new: (Date.now() - msg.created_at * 1000) < 24 * 60 * 60 * 1000,  // ❌ 时间判断
```

**修改后** (Line 1122):
```javascript
is_new: true,  // ✅ 首次抓取的消息 is_new = true（时效性由 Master 判断）
```

### 修改 3: Worker 私信处理 (platform.js - crawlDirectMessages)

**文件**: `packages/worker/src/platforms/douyin/platform.js`

**修改前** (Line 941-961):
```javascript
const createIsNewFlag = (createdAt) => {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - createdAt;
  const oneDaySeconds = 24 * 60 * 60;
  return ageSeconds < oneDaySeconds;
};

const directMessages = rawDirectMessages.map((msg) => {
  // ...
  return {
    ...msg,
    account_id: account.id,
    is_read: false,
    created_at: createdAt,
    is_new: createIsNewFlag(createdAt),  // ❌ 时间判断
    push_count: 0,
  };
});
```

**修改后** (Line 941-956):
```javascript
// ✅ 优化: is_new 表示"首次抓取"，而不是基于时间判断
// Worker 只负责数据完整性，不关心业务逻辑（时效性由 Master 处理）
const directMessages = rawDirectMessages.map((msg) => {
  // ...
  return {
    ...msg,
    account_id: account.id,
    is_read: false,
    created_at: createdAt,
    is_new: true,  // ✅ 首次抓取的私信 is_new = true
    push_count: 0,
  };
});
```

### 修改 4: Master 业务逻辑调整 (im-websocket-server.js)

**文件**: `packages/master/src/communication/im-websocket-server.js`

**修改前** (Line 318):
```javascript
unreadCount: contentComments.filter(c => c.isNew).length,  // ❌ 基于 isNew（可能为 false）
```

**修改后** (Line 318):
```javascript
unreadCount: contentComments.filter(c => c.isHandled === undefined || !c.isHandled).length,  // ✅ 基于 isHandled
```

**修改前** (Line 464):
```javascript
unreadCount += commentsList.filter(c => c.isNew).length;  // ❌ 基于 isNew
```

**修改后** (Line 464):
```javascript
unreadCount += commentsList.filter(c => c.isHandled === undefined || !c.isHandled).length;  // ✅ 基于 isHandled
```

## 📊 优化效果

### Worker 端
- ✅ **职责清晰**: 只负责数据抓取，不关心业务逻辑
- ✅ **语义明确**: `is_new` 表示"首次抓取"，而不是"时效性"
- ✅ **代码简化**: 移除了 3 处 `createIsNewFlag()` 函数和时间判断逻辑

### Master 端
- ✅ **业务控制**: 完全掌控"未读"的定义（可以基于 `isHandled` 或时间）
- ✅ **灵活扩展**: 未来可以根据需求调整未读逻辑，无需修改 Worker
- ✅ **数据完整**: 所有抓取到的数据都能正常显示（从 2/8 → 8/8）

### PC IM 端
- ✅ **显示正确**: 所有有评论的作品都能正确显示
- ✅ **体验优化**: 用户可以看到所有评论数据，不再受 24 小时限制

## 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Worker 层（数据层）                        │
├─────────────────────────────────────────────────────────────┤
│ 职责：                                                        │
│ • 抓取原始数据（评论、私信、作品）                              │
│ • 数据完整性验证                                              │
│ • 数据关联正确性                                              │
│ • 首次抓取标记 (is_new = true)                                │
│                                                               │
│ 不负责：                                                      │
│ ❌ 业务逻辑（已读/未读、时效性）                               │
│ ❌ 数据过滤（基于业务规则）                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    完整的原始数据
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Master 层（业务层）                         │
├─────────────────────────────────────────────────────────────┤
│ 职责：                                                        │
│ • 接收 Worker 数据并存入 DataStore                            │
│ • 业务逻辑处理：                                              │
│   - 已读/未读判断 (isHandled)                                │
│   - 时效性过滤（如需要）                                       │
│   - unreadCount 计算                                         │
│ • 数据转换和映射                                              │
│ • 为 PC IM 提供业务数据                                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    业务处理后的数据
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    PC IM 层（展示层）                          │
├─────────────────────────────────────────────────────────────┤
│ • 显示所有有评论的作品                                         │
│ • 显示未读数量                                                │
│ • 提供用户交互                                                │
└─────────────────────────────────────────────────────────────┘
```

## 🎓 设计原则总结

### 1. 职责单一原则 (SRP)
每一层只负责自己的职责：
- Worker: 数据抓取
- Master: 业务逻辑
- PC IM: 数据展示

### 2. 关注点分离 (SoC)
- 数据层不关心业务逻辑
- 业务层不关心数据来源
- 展示层不关心业务实现

### 3. 开闭原则 (OCP)
- Master 可以随时调整业务逻辑，无需修改 Worker
- Worker 可以扩展新的数据字段，无需修改 Master（只要保持兼容）

## 📝 未来扩展建议

### 选项 1: Master 端实现时效性判断（如需要）

如果未来需要区分"最近 24 小时的评论"，可以在 Master 的 IM 服务器中添加：

```javascript
// packages/master/src/communication/im-websocket-server.js
const isRecent = (createdAt) => {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - createdAt;
  const oneDaySeconds = 24 * 60 * 60;
  return ageSeconds < oneDaySeconds;
};

// 在 getTopicsFromDataStore 中使用
const topic = {
  // ...
  unreadCount: contentComments.filter(c =>
    (!c.isHandled || c.isHandled === undefined) &&
    isRecent(c.createdAt)  // 可选的时效性过滤
  ).length,
};
```

### 选项 2: 提供多种过滤模式

Master 可以根据 PC IM 的请求参数，提供不同的过滤模式：
- `mode=all`: 显示所有评论
- `mode=recent`: 只显示最近 24 小时
- `mode=unhandled`: 只显示未处理的

## ✅ 验证清单

- [x] Worker 端移除所有时间判断逻辑
- [x] Worker 的 `is_new` 改为表示"首次抓取"
- [x] Master 端调整 `unreadCount` 计算逻辑
- [x] 所有有评论的作品都能在 PC IM 中显示
- [x] 架构职责分离清晰
- [x] 代码注释完整

## 📅 完成时间

**优化日期**: 2025-10-31
**修改文件**: 3 个
**代码行数**: ~30 行
**影响范围**: Worker → Master → PC IM 全链路

---

**报告人**: Claude Code
**状态**: ✅ 已完成
