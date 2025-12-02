# IM 三级评论扁平化显示修复

## 问题描述

用户反馈：IM 界面只显示一级、二级评论，三级评论不显示。

**用户需求**：跟抖音官方界面一致，采用扁平化显示，三级评论也显示在一级评论下方，但需要额外显示 "回复 @某人" 的信息。

## 抖音评论显示方式（扁平化）

```
一级评论 A
  ├─ 二级评论 B（回复 A）
  ├─ 二级评论 C（回复 A）
  └─ 三级评论 D（回复 @B: ...）← 也显示在 A 下方，与 B、C 平级
```

**特点**：
- ✅ 一级评论：独立显示
- ✅ 二级评论：显示在一级评论下方
- ✅ 三级评论：**也显示在一级评论下方**（不嵌套在二级评论下）
- ✅ 三级评论额外显示"回复 @某人"来标识回复关系

## 根本原因

### 数据字段说明

抖音评论数据有三个关键字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| `parent_comment_id` | **直接父评论 ID**（树形结构） | 三级评论指向二级评论 |
| `reply_id` | **一级评论 ID**（扁平化显示） | 二级、三级都指向一级评论 |
| `reply_to_username` | 三级评论回复的用户名 | "临终关怀志愿者-宝哥" |

### 问题代码

在 [im-websocket-server.js:1109-1111](packages/master/src/communication/im-websocket-server.js#L1109-L1111)（修复前）：

```javascript
// ❌ 使用 parentCommentId 导致三级评论 replyToId 指向二级评论
const parentId = comment.parentCommentId;
const replyToId = (!parentId || parentId === '0' || parentId === 0) ? null : parentId;
```

**结果**：
- 一级评论：`replyToId = null` ✅
- 二级评论：`replyToId = 一级评论 ID` ✅
- 三级评论：`replyToId = 二级评论 ID` ❌（前端筛选时找不到）

### 前端筛选逻辑

在 [MonitorPage.tsx:1958](packages/crm-pc-im/src/pages/MonitorPage.tsx#L1958)：

```javascript
const msgDiscussions = discussions.filter(d => d.replyToId === mainMsg.id)
```

这个筛选只能找到 `replyToId === mainMsg.id`（一级评论 ID）的消息，所以：
- ✅ 二级评论能显示（replyToId = 一级评论 ID）
- ❌ 三级评论不显示（replyToId = 二级评论 ID）

## 修复方案

### 1. 后端修复：使用 reply_id 而不是 parent_comment_id

**修改文件**：`packages/master/src/communication/im-websocket-server.js`

**修改位置**：第 1109-1114 行

**修改前**：
```javascript
const parentId = comment.parentCommentId;
const replyToId = (!parentId || parentId === '0' || parentId === 0) ? null : parentId;
```

**修改后**：
```javascript
// ✅ 使用 replyId 支持扁平化显示
const replyId = comment.replyId || comment.reply_id;
const replyToId = (!replyId || replyId === '0' || replyId === 0) ? null : replyId;
```

**效果**：
- 一级评论：`reply_id = '0'` → `replyToId = null`
- 二级评论：`reply_id = 一级评论 ID` → `replyToId = 一级评论 ID`
- 三级评论：`reply_id = 一级评论 ID` → `replyToId = 一级评论 ID` ✅

### 2. 后端增加 replyToUsername 字段

在同一位置添加：

```javascript
replyToUsername: comment.replyToUsername || comment.reply_to_username || null,  // ✅ 三级评论显示用
```

这样前端可以判断是否是三级评论，并显示"回复 @某人"。

### 3. 前端显示"回复 @某人"

**修改文件**：`packages/crm-pc-im/src/pages/MonitorPage.tsx`

**修改位置**：第 2078-2086 行

**修改前**：
```tsx
<div className="wechat-discussion-text">
  <Text style={{ fontSize: 13 }}>{discussion.content}</Text>
</div>
```

**修改后**：
```tsx
<div className="wechat-discussion-text">
  {/* ✅ 三级评论显示"回复 @某人" */}
  {(discussion as any).replyToUsername && (
    <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
      回复 @{(discussion as any).replyToUsername}:
    </Text>
  )}
  <Text style={{ fontSize: 13 }}>{discussion.content}</Text>
</div>
```

**效果**：
- 二级评论：直接显示内容 "你好呀"
- 三级评论：显示 "回复 @某人: 你棒棒的"

## 数据流转

### 修复前

```
评论数据（三级评论）：
  parent_comment_id: "7578786373030314758" (二级评论)
  reply_id: "7533107840476594986" (一级评论)
  reply_to_username: "临终关怀志愿者-宝哥"

    ↓ Master 转换（使用 parent_comment_id）

IM 消息：
  replyToId: "7578786373030314758"  ❌ 指向二级评论

    ↓ 前端筛选 filter(d => d.replyToId === "7533107840476594986")

结果：❌ 筛选失败，三级评论不显示
```

### 修复后

```
评论数据（三级评论）：
  parent_comment_id: "7578786373030314758" (二级评论)
  reply_id: "7533107840476594986" (一级评论)  ✅ 使用这个
  reply_to_username: "临终关怀志愿者-宝哥"   ✅ 传递给前端

    ↓ Master 转换（使用 reply_id）

IM 消息：
  replyToId: "7533107840476594986"  ✅ 指向一级评论
  replyToUsername: "临终关怀志愿者-宝哥"  ✅ 新增字段

    ↓ 前端筛选 filter(d => d.replyToId === "7533107840476594986")

结果：✅ 筛选成功，三级评论显示在一级评论下方

    ↓ 前端显示

显示：回复 @临终关怀志愿者-宝哥: 你棒棒的  ✅
```

## 完整示例

### API 响应数据（来自 tests/reply3.har）

```json
{
  "comment": {
    "cid": "7579143773713613602",
    "text": "你棒棒的",
    "reply_id": "7533107840476594986",           // 一级评论 ID
    "reply_to_reply_id": "7578786373030314758",  // 二级评论 ID（直接回复的目标）
    "reply_to_username": "临终关怀志愿者-宝哥",    // 回复的用户名
    "user": { "nickname": "临终关怀志愿者-宝哥" }
  }
}
```

### Worker 标准化后

```javascript
{
  cid: "7579143773713613602",
  parent_comment_id: "7578786373030314758",  // 直接父评论（二级评论）
  reply_id: "7533107840476594986",           // 一级评论 ID
  reply_to_username: "临终关怀志愿者-宝哥"
}
```

### Master 转换为 IM 消息

```javascript
{
  id: "7579143773713613602",
  replyToId: "7533107840476594986",      // ✅ 使用 reply_id（指向一级评论）
  replyToUsername: "临终关怀志愿者-宝哥", // ✅ 传递给前端
  content: "你棒棒的"
}
```

### 前端显示

```
一级评论 (7533107840476594986)
  ├─ 二级评论 (7578786373030314758): "你好呀"
  └─ 三级评论 (7579143773713613602): "回复 @临终关怀志愿者-宝哥: 你棒棒的" ✅
```

## 修改文件

### 后端

1. ✅ `packages/master/src/communication/im-websocket-server.js` (第 1109-1130 行)
   - 使用 `reply_id` 字段而不是 `parent_comment_id`
   - 添加 `replyToUsername` 字段传递给前端

### 前端

2. ✅ `packages/crm-pc-im/src/pages/MonitorPage.tsx` (第 2078-2086 行)
   - 检测 `replyToUsername` 字段
   - 显示"回复 @某人"前缀

## 测试验证

### 测试步骤

1. **发布一级评论**：
   ```
   内容: "这是一级评论"
   预期: 在 IM 中显示，replyToId = null
   ```

2. **回复一级评论（二级评论）**：
   ```
   内容: "你好呀"
   预期: 显示在一级评论下方，无"回复 @某人"前缀
   ```

3. **回复二级评论（三级评论）**：
   ```
   内容: "你棒棒的"
   预期: 显示在一级评论下方，显示"回复 @临终关怀志愿者-宝哥: 你棒棒的"
   ```

### 验证点

- ✅ 三级评论显示在一级评论下方（与二级评论平级）
- ✅ 三级评论显示"回复 @某人"前缀
- ✅ 二级评论不显示"回复 @某人"前缀
- ✅ 前端筛选逻辑 `filter(d => d.replyToId === mainMsg.id)` 正确工作

## 关键技术点

### 1. 字段用途区分

| 用途 | 字段 | 说明 |
|------|------|------|
| **树形结构**（数据库查询） | `parent_comment_id` | 查询直接子评论，构建完整树 |
| **扁平化显示**（IM 界面） | `reply_id` | 所有二级、三级都指向一级评论 |
| **回复提示**（三级标识） | `reply_to_username` | 显示"回复 @某人" |

### 2. 前端简化逻辑

前端不需要递归渲染评论树，只需要：
```javascript
// 一层筛选即可
const msgDiscussions = discussions.filter(d => d.replyToId === mainMsg.id)
```

所有二级、三级评论都能筛选出来，因为它们的 `replyToId` 都指向同一个一级评论 ID。

### 3. 扁平化 vs 树形化

| 显示方式 | 数据字段 | 前端实现 | 适用场景 |
|----------|----------|----------|----------|
| **扁平化** | `reply_id` | 一层筛选 | 抖音、微博（简单直观） |
| **树形化** | `parent_comment_id` | 递归渲染 | Reddit、论坛（层级清晰） |

抖音采用扁平化显示，最多显示两层（一级评论 + 二级/三级评论），通过"回复 @某人"标识更深层级。

## 总结

这次修复的核心是：**理解抖音的扁平化显示逻辑，使用正确的字段（reply_id）而不是树形字段（parent_comment_id）**。

- ✅ **后端修复**：使用 `reply_id` 字段，确保三级评论的 `replyToId` 指向一级评论
- ✅ **前端优化**：显示"回复 @某人"，符合抖音官方界面习惯
- ✅ **代码简化**：前端无需递归渲染，一层筛选即可
- ✅ **用户体验**：与抖音官方界面一致，直观易懂

**关键认知**：
- `parent_comment_id` 用于**数据库查询**（树形结构）
- `reply_id` 用于**界面显示**（扁平化结构）
- `reply_to_username` 用于**三级评论标识**（回复提示）

不同的字段有不同的用途，选择正确的字段是解决问题的关键。
