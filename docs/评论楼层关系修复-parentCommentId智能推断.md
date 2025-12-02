# 评论楼层关系修复 - parentCommentId 智能推断

## 问题描述

用户反馈："统一包装有问题，没有盖楼，那个回复 非常对对 没有放到正确的地方"

**症状**：
- 回复评论（二级、三级）没有正确嵌套在父评论下
- IM 界面中评论楼层结构混乱
- 所有评论都被当作一级评论处理

## 评论层级定义

抖音评论系统支持三级评论：

```
一级评论：直接评论作品（parent_comment_id = null）
二级评论：回复一级评论（parent_comment_id = 一级评论的 cid）
三级评论：回复二级评论（parent_comment_id = 二级评论的 cid）
```

## 根本原因

`normalizeComment` 函数只使用外部传入的 `parentCommentId` 参数，而没有从 API 响应的 `comment` 对象中提取楼层关系信息。

**API 响应中已经包含完整的楼层关系**：
- `comment.reply_id`：一级评论 ID（对于二级、三级评论都指向一级评论）
- `comment.reply_to_reply_id`：直接回复的目标评论 ID（三级评论指向二级评论）

## API 响应示例

### 三级评论实例（来自 tests/reply3.har）

**请求参数**：
```json
{
  "aweme_id": "7533083869034138931",
  "reply_id": "7533107840476594986",        // 一级评论 ID
  "reply_to_reply_id": "7578786373030314758", // 二级评论 ID（直接回复的目标）
  "text": "你棒棒的"
}
```

**响应数据**：
```json
{
  "status_code": 0,
  "comment": {
    "cid": "7579143773713613602",           // 新评论的 ID（三级评论）
    "text": "你棒棒的",
    "reply_id": "7533107840476594986",      // ✅ 一级评论 ID
    "reply_to_reply_id": "7578786373030314758", // ✅ 二级评论 ID（直接回复的目标）
    "label_text": "作者",
    "label_type": 1,
    "user": { /* ... */ }
  }
}
```

**预期结果**：
- `parent_comment_id` 应该设置为 `"7578786373030314758"`（二级评论 ID）
- 这样三级评论就能正确嵌套在二级评论下

## 楼层关系推断逻辑

根据 `reply_id` 和 `reply_to_reply_id` 字段推断 `parent_comment_id`：

| 评论层级 | reply_id | reply_to_reply_id | parent_comment_id |
|---------|----------|-------------------|-------------------|
| 一级评论 | `'0'` | `'0'` | `null` |
| 二级评论 | `一级评论 cid` | `'0'` | `reply_id`（一级评论 cid） |
| 三级评论 | `一级评论 cid` | `二级评论 cid` | `reply_to_reply_id`（二级评论 cid） |

**推断优先级**：
1. 如果 `reply_to_reply_id !== '0'` → 三级评论，`parent_comment_id = reply_to_reply_id`
2. 否则如果 `reply_id !== '0'` → 二级评论，`parent_comment_id = reply_id`
3. 否则 → 一级评论，`parent_comment_id = null`

## 修复方案

### 1. 修改 data-manager.js 的 normalizeComment 函数

在 [data-manager.js:689-703](packages/worker/src/platforms/douyin/data-manager.js#L689-L703) 添加智能推断逻辑：

```javascript
// ✅ 智能推断父评论 ID（支持三级评论）
// 1. 优先使用外部传入的 parentCommentId（用于 API 爬虫递归提取回复）
// 2. 否则从 rawComment 字段推断（API 拦截器的评论响应中包含完整关系）：
//    - 三级评论：reply_to_reply_id 不为 '0' → parent_comment_id = reply_to_reply_id（直接回复的二级评论）
//    - 二级评论：reply_id 不为 '0' → parent_comment_id = reply_id（回复的一级评论）
//    - 一级评论：reply_id 为 '0' → parent_comment_id = null
let inferredParentId = null;
if (rawComment.reply_to_reply_id && rawComment.reply_to_reply_id !== '0') {
  // 三级评论：父评论是 reply_to_reply_id（二级评论）
  inferredParentId = String(rawComment.reply_to_reply_id);
} else if (rawComment.reply_id && rawComment.reply_id !== '0') {
  // 二级评论：父评论是 reply_id（一级评论）
  inferredParentId = String(rawComment.reply_id);
}
const finalParentCommentId = parentCommentId || inferredParentId;
```

### 2. send-reply-to-comment-video-detail.js 无需修改

API 拦截器直接调用 `normalizePublishResponse`，无需传递额外参数：

```javascript
// ✅ API 响应的 comment 对象中已包含完整的楼层关系（reply_id、reply_to_reply_id）
// normalizeComment 会自动从中推断 parent_comment_id
const newCommentData = dataManager.normalizePublishResponse(body, {
    accountUserId: page._accountContext?.accountId,
    awemeId: postData?.aweme_id,
});
```

## 数据流转

### 修复前

```
API 响应: {
  comment: {
    reply_id: "7533107840476594986",
    reply_to_reply_id: "7578786373030314758"  // ❌ 被忽略
  }
}
    ↓
normalizeComment({ parentCommentId: null })  // ❌ 使用默认值
    ↓
标准化数据: { parent_comment_id: null, ... }  // ❌ 楼层关系丢失
```

### 修复后

```
API 响应: {
  comment: {
    reply_id: "7533107840476594986",
    reply_to_reply_id: "7578786373030314758"  // ✅ 提取此字段
  }
}
    ↓
normalizeComment()
  → 检测到 reply_to_reply_id !== '0'
  → inferredParentId = "7578786373030314758"  // ✅ 智能推断
    ↓
标准化数据: {
  parent_comment_id: "7578786373030314758",  // ✅ 正确的父评论 ID
  reply_id: "7533107840476594986",
  reply_to_reply_id: "7578786373030314758"
}
```

## 测试案例

### 测试案例 1：一级评论

**API 响应**：
```json
{
  "comment": {
    "cid": "7579111111111111",
    "text": "测试一级评论",
    "reply_id": "0",
    "reply_to_reply_id": "0"
  }
}
```

**标准化结果**：
```javascript
{
  cid: "7579111111111111",
  parent_comment_id: null,  // ✅ 一级评论无父评论
  reply_id: "0",
  reply_to_reply_id: "0"
}
```

### 测试案例 2：二级评论

**API 响应**：
```json
{
  "comment": {
    "cid": "7579222222222222",
    "text": "测试二级评论",
    "reply_id": "7579111111111111",
    "reply_to_reply_id": "0"
  }
}
```

**标准化结果**：
```javascript
{
  cid: "7579222222222222",
  parent_comment_id: "7579111111111111",  // ✅ 父评论是一级评论
  reply_id: "7579111111111111",
  reply_to_reply_id: "0"
}
```

### 测试案例 3：三级评论

**API 响应**（来自 reply3.har）：
```json
{
  "comment": {
    "cid": "7579143773713613602",
    "text": "你棒棒的",
    "reply_id": "7533107840476594986",
    "reply_to_reply_id": "7578786373030314758"
  }
}
```

**标准化结果**：
```javascript
{
  cid: "7579143773713613602",
  parent_comment_id: "7578786373030314758",  // ✅ 父评论是二级评论
  reply_id: "7533107840476594986",
  reply_to_reply_id: "7578786373030314758"
}
```

## 关键字段说明

| 字段 | 说明 | 用途 |
|------|------|------|
| `cid` | 评论唯一 ID | 主键 |
| `parent_comment_id` | **父评论 ID**（数据库字段） | 用于构建评论树，查询子评论 |
| `reply_id` | 一级评论 ID | 原始字段，用于推断 parent_comment_id |
| `reply_to_reply_id` | 直接回复的目标评论 ID | 原始字段，用于推断三级评论的 parent_comment_id |

**重要区别**：
- `parent_comment_id`：我们自己定义的字段，表示**直接父评论**（用于构建树形结构）
- `reply_id`：抖音 API 的字段，对于二级、三级评论都指向**一级评论**
- `reply_to_reply_id`：抖音 API 的字段，仅三级评论时有值，指向**二级评论**

## 修改文件

### `packages/worker/src/platforms/douyin/data-manager.js`

**位置**：第 689-703 行

**修改内容**：
1. 添加智能推断逻辑，支持三级评论
2. 优先级：外部传入 > reply_to_reply_id > reply_id > null

### `packages/worker/src/platforms/douyin/send-reply-to-comment-video-detail.js`

**位置**：第 1074-1080 行

**修改内容**：
- 简化代码，移除手动提取 parentCommentId 的逻辑
- 依赖 normalizeComment 的智能推断

## 影响范围

### ✅ 受益功能

1. **API 拦截器** - 正确同步一级、二级、三级评论的楼层关系
2. **IM 界面评论树渲染** - 可以正确显示评论层级
3. **评论数据同步** - Master 数据库中保存正确的父子关系
4. **评论查询** - 可以通过 `parent_comment_id` 查询子评论

### ⚠️ 无影响

1. **API 爬虫** - crawler-api.js 会显式传递 `parentCommentId`，优先级高于智能推断
2. **现有数据** - 历史数据中的 `parent_comment_id` 可能不准确，需要重新爬取

## 兼容性说明

这次修复完全向后兼容：

1. **API 爬虫**：继续显式传递 `parentCommentId`，不受影响
2. **API 拦截器**：受益于智能推断，无需修改调用代码
3. **现有调用**：如果外部传递了 `parentCommentId`，优先使用外部值，智能推断作为回退

## 验证步骤

1. **发布一级评论**：验证 `parent_comment_id === null`
2. **回复一级评论**（二级评论）：验证 `parent_comment_id === 一级评论的 cid`
3. **回复二级评论**（三级评论）：验证 `parent_comment_id === 二级评论的 cid`
4. **查看 IM 界面**：验证评论树正确嵌套显示
5. **查看数据库**：验证 `parent_comment_id` 字段值正确

## 总结

这次修复的核心思想：**利用 API 响应中已有的完整信息，而不是手动传递参数**。

- ✅ **代码简化**：API 拦截器无需手动提取 parentCommentId
- ✅ **逻辑统一**：所有评论数据源都使用相同的推断逻辑
- ✅ **支持三级评论**：正确处理 reply_to_reply_id 字段
- ✅ **向后兼容**：保留外部传入 parentCommentId 的优先级

**关键技术点**：
1. API 响应中的 `reply_id` 和 `reply_to_reply_id` 字段包含完整的楼层关系信息
2. 三级评论的父评论是 `reply_to_reply_id`（二级评论），而不是 `reply_id`（一级评论）
3. 智能推断 + 外部传入的双重支持，保证灵活性和兼容性
