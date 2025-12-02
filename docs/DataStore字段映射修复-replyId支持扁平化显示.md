# DataStore 字段映射修复 - replyId 支持扁平化显示

## 问题描述

用户反馈：IM 界面显示所有评论都是一级评论，没有盖楼（评论嵌套）。

**症状**：
- 所有评论显示为一级评论，`replyToId` 都为 `null`
- 二级、三级评论没有正确显示在父评论下方
- 前端 `filter(d => d.replyToId === mainMsg.id)` 筛选失败

## 根本原因

**关键发现**：DataStore 使用统一的标准化结构（camelCase），只有 `_raw` 字段保留原始 API 结构。

### 问题代码

在 [data-manager.js:331-335](packages/worker/src/platforms/douyin/data-manager.js#L331-L335)（修复前）：

```javascript
// ❌ 缺少 replyId 字段映射
// 回复信息
replyToUserId: douyinData.reply_to_userid ? String(douyinData.reply_to_userid) : null,
replyToUserName: douyinData.reply_to_username || null,  // ❌ 字段名不一致
```

**结果**：
- `normalizeComment()` 函数生成了 `reply_id` 字段
- 但 `mapCommentData()` 没有将其映射到 DataStore 格式
- im-websocket-server.js 中的 `comment.replyId` 为 `undefined`
- 所有评论的 `replyToId` 都回退到 `parentCommentId`（树形结构，不是扁平化）

### 数据流转（修复前）

```
normalizeComment 生成：
{
  reply_id: "7533107840476594986",           // ✅ 一级评论 ID
  reply_to_reply_id: "7578786373030314758",  // ✅ 二级评论 ID
  reply_to_username: "临终关怀志愿者-宝哥"     // ✅ 回复的用户名
}

    ↓ mapCommentData 映射

DataStore 存储：
{
  commentId: "7579143773713613602",
  parentCommentId: "7578786373030314758",
  replyToUserId: "...",
  replyToUserName: "临终关怀志愿者-宝哥",
  // ❌ 缺少 replyId 字段！
  // ❌ 缺少 replyToReplyId 字段！
  // ❌ replyToUserName 字段名不一致（应为 replyToUsername）
}

    ↓ im-websocket-server.js 读取

const replyId = comment.replyId;  // ❌ undefined
// 回退到 parentCommentId（树形结构）
// 导致三级评论无法正确显示
```

## 修复方案

### 1. 添加 replyId 字段映射

**修改文件**：`packages/worker/src/platforms/douyin/data-manager.js`

**修改位置**：第 331-335 行

**修改内容**：

```javascript
// 回复信息
replyId: douyinData.reply_id ? String(douyinData.reply_id) : null,  // ✅ 一级评论 ID（扁平化显示用）
replyToReplyId: douyinData.reply_to_reply_id ? String(douyinData.reply_to_reply_id) : null,  // ✅ 三级评论时，直接回复的二级评论 ID
replyToUserId: douyinData.reply_to_userid ? String(douyinData.reply_to_userid) : null,
replyToUsername: douyinData.reply_to_username || null,  // ✅ 三级评论显示"回复 @某人"（统一字段名）
```

**关键变更**：
1. ✅ 添加 `replyId` 字段：映射 `reply_id`（一级评论 ID）
2. ✅ 添加 `replyToReplyId` 字段：映射 `reply_to_reply_id`（三级评论的二级父评论 ID）
3. ✅ 统一字段名：`replyToUserName` → `replyToUsername`（与 im-websocket-server.js 一致）

### 2. 数据流转（修复后）

```
normalizeComment 生成：
{
  reply_id: "7533107840476594986",           // ✅ 一级评论 ID
  reply_to_reply_id: "7578786373030314758",  // ✅ 二级评论 ID
  reply_to_username: "临终关怀志愿者-宝哥"     // ✅ 回复的用户名
}

    ↓ mapCommentData 映射

DataStore 存储：
{
  commentId: "7579143773713613602",
  parentCommentId: "7578786373030314758",
  replyId: "7533107840476594986",            // ✅ 新增：一级评论 ID
  replyToReplyId: "7578786373030314758",     // ✅ 新增：二级评论 ID
  replyToUserId: "...",
  replyToUsername: "临终关怀志愿者-宝哥",      // ✅ 修正：字段名统一
}

    ↓ im-websocket-server.js 读取

const replyId = comment.replyId;  // ✅ "7533107840476594986"
replyToId = String(replyId);      // ✅ 指向一级评论（扁平化显示）
replyToUsername: comment.replyToUsername  // ✅ "临终关怀志愿者-宝哥"

    ↓ 前端显示

filter(d => d.replyToId === "7533107840476594986")  // ✅ 筛选成功
显示："回复 @临终关怀志愿者-宝哥: 你棒棒的"         // ✅ 正确显示
```

## 字段说明

### DataStore 标准化字段

| 字段 | 类型 | 说明 | 用途 |
|------|------|------|------|
| `commentId` | String | 评论唯一 ID | 主键 |
| `parentCommentId` | String/null | 直接父评论 ID | 数据库查询，构建评论树 |
| `replyId` | String/null | 一级评论 ID | **IM 扁平化显示**（二级、三级都指向一级） |
| `replyToReplyId` | String/null | 三级评论的二级父评论 ID | 调试用，区分二级/三级评论 |
| `replyToUserId` | String/null | 回复的用户 ID | 用户信息关联 |
| `replyToUsername` | String/null | 回复的用户名 | 前端显示 "回复 @某人" |

### 字段关系对比

| 评论层级 | `reply_id` | `reply_to_reply_id` | `parent_comment_id` | `replyId` (DataStore) | 前端 `replyToId` |
|---------|------------|---------------------|---------------------|-----------------------|------------------|
| 一级评论 | `'0'` | `'0'` | `null` | `null` | `null` |
| 二级评论 | `一级 cid` | `'0'` | `一级 cid` | `一级 cid` | `一级 cid` ✅ |
| 三级评论 | `一级 cid` | `二级 cid` | `二级 cid` | `一级 cid` | `一级 cid` ✅ |

**关键区别**：
- `parentCommentId`：树形结构，三级评论指向二级评论
- `replyId`：扁平结构，二级、三级都指向一级评论 ✅

## 完整示例

### API 响应（来自 tests/reply3.har）

```json
{
  "comment": {
    "cid": "7579143773713613602",
    "text": "你棒棒的",
    "reply_id": "7533107840476594986",           // 一级评论 ID
    "reply_to_reply_id": "7578786373030314758",  // 二级评论 ID
    "reply_to_username": "临终关怀志愿者-宝哥",
    "user": { "nickname": "临终关怀志愿者-宝哥" }
  }
}
```

### normalizeComment 输出

```javascript
{
  cid: "7579143773713613602",
  reply_id: "7533107840476594986",
  reply_to_reply_id: "7578786373030314758",
  reply_to_username: "临终关怀志愿者-宝哥",
  parent_comment_id: "7578786373030314758"  // 智能推断
}
```

### mapCommentData 输出（DataStore）

```javascript
{
  commentId: "7579143773713613602",
  replyId: "7533107840476594986",            // ✅ 新增字段
  replyToReplyId: "7578786373030314758",     // ✅ 新增字段
  replyToUsername: "临终关怀志愿者-宝哥",      // ✅ 修正字段名
  parentCommentId: "7578786373030314758",
  content: "你棒棒的"
}
```

### im-websocket-server.js 输出

```javascript
{
  id: "7579143773713613602",
  replyToId: "7533107840476594986",          // ✅ 使用 replyId（扁平化）
  replyToUsername: "临终关怀志愿者-宝哥",      // ✅ 前端显示用
  content: "你棒棒的"
}
```

### 前端显示

```
一级评论 (7533107840476594986)
  ├─ 二级评论 (7578786373030314758): "你好呀"
  └─ 三级评论 (7579143773713613602): "回复 @临终关怀志愿者-宝哥: 你棒棒的" ✅
```

## 相关文档

- [IM三级评论扁平化显示修复.md](IM三级评论扁平化显示修复.md) - 前端显示逻辑修复
- [评论楼层关系修复-parentCommentId智能推断.md](评论楼层关系修复-parentCommentId智能推断.md) - normalizeComment 智能推断逻辑

## 修改文件清单

### packages/worker/src/platforms/douyin/data-manager.js (Line 331-335)

**修改内容**：
1. ✅ 添加 `replyId` 字段映射
2. ✅ 添加 `replyToReplyId` 字段映射
3. ✅ 修正 `replyToUserName` → `replyToUsername`（统一命名）

### packages/master/src/communication/im-websocket-server.js (Line 1109-1141)

**无需修改**：代码已正确实现，优先使用 `comment.replyId`，有 fallback 到 `parentCommentId`

### packages/crm-pc-im/src/pages/MonitorPage.tsx (Line 2078-2086)

**无需修改**：前端已正确使用 `replyToUsername` 显示 "回复 @某人"

## 测试验证

### 验证步骤

1. **启动服务**：
   ```bash
   npm run start:master
   npm run start:worker
   cd packages/crm-pc-im && npm run dev
   ```

2. **发布三级评论**：
   - 在抖音视频详情页，找到一个一级评论
   - 回复该一级评论（生成二级评论）
   - 再回复二级评论（生成三级评论）

3. **验证 DataStore**：
   ```javascript
   // 在 Master 控制台查看
   const comment = dataStore.comments.get(accountId).find(c => c.commentId === '三级评论ID');
   console.log(comment.replyId);          // 应为一级评论 ID
   console.log(comment.replyToReplyId);   // 应为二级评论 ID
   console.log(comment.replyToUsername);  // 应为被回复的用户名
   ```

4. **验证 IM 显示**：
   - 打开 IM 界面，查看该视频的评论列表
   - 验证三级评论显示在一级评论下方（与二级评论平级）
   - 验证三级评论显示 "回复 @某人: 内容"

### 验证点

- ✅ DataStore 包含 `replyId` 字段
- ✅ DataStore 包含 `replyToReplyId` 字段
- ✅ DataStore 包含 `replyToUsername` 字段（不是 `replyToUserName`）
- ✅ im-websocket-server.js 正确读取 `comment.replyId`
- ✅ 前端 `filter(d => d.replyToId === mainMsg.id)` 筛选成功
- ✅ 前端正确显示 "回复 @某人"

## 关键技术点

### 1. DataStore 标准化格式

- **统一规则**：所有字段使用 camelCase 命名
- **原始数据**：保留在 `_raw` 字段中
- **字段映射**：在 `mapCommentData` 函数中集中定义

### 2. 扁平化 vs 树形化

| 显示方式 | 关键字段 | 前端实现 | 抖音官方 |
|----------|----------|----------|----------|
| **扁平化** | `replyId` | 一层筛选 | ✅ 使用 |
| **树形化** | `parentCommentId` | 递归渲染 | ❌ 不使用 |

抖音采用扁平化显示，所有二级、三级评论都显示在一级评论下，通过 "回复 @某人" 标识层级关系。

### 3. 字段命名一致性

**重要**：DataStore 字段名必须与 im-websocket-server.js 中的访问代码保持一致。

- ✅ 正确：`replyToUsername`（camelCase，与代码一致）
- ❌ 错误：`replyToUserName`（PascalCase，导致访问失败）

## 总结

这次修复的核心是：**补全 DataStore 标准化格式中缺失的扁平化显示字段**。

- ✅ **添加字段**：`replyId`、`replyToReplyId`、`replyToUsername`
- ✅ **统一命名**：遵循 camelCase 规范，与 im-websocket-server.js 保持一致
- ✅ **扁平化支持**：im-websocket-server.js 优先使用 `replyId`，实现抖音式扁平显示
- ✅ **向后兼容**：保留 `parentCommentId` fallback，兼容旧数据

**关键认知**：
1. DataStore 使用统一的标准化格式（camelCase），`_raw` 保留原始结构
2. `mapCommentData` 是字段映射的唯一入口，必须完整映射所有需要的字段
3. 字段命名一致性至关重要，任何不一致都会导致数据丢失
4. 扁平化显示依赖 `replyId` 字段，树形显示依赖 `parentCommentId` 字段
