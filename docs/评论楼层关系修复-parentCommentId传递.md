# 评论楼层关系修复 - parentCommentId 传递

## 问题描述

用户反馈："统一包装有问题，没有盖楼，那个回复 非常对对 没有放到正确的地方"

**症状**：
- 回复评论（二级、三级）没有正确嵌套在父评论下
- IM 界面中评论楼层结构混乱
- 所有评论都被当作一级评论处理

## 评论层级定义

```
一级评论：直接评论作品
二级评论：对一级评论的回复
三级评论：对二级评论的回复
```

## 根本原因

在 `send-reply-to-comment-video-detail.js` 的 API 拦截器中，调用 `normalizePublishResponse` 时**没有传递 `parentCommentId` 参数**：

```javascript
// ❌ 问题代码（第 1075-1078 行）
const newCommentData = dataManager.normalizePublishResponse(body, {
    accountUserId: page._accountContext?.accountId,
    awemeId: postData?.aweme_id,
    // ❌ 缺失 parentCommentId - 导致楼层关系丢失
});
```

**结果**：
- `normalizeComment` 函数的 `parentCommentId` 参数默认为 `null`
- 标准化后的评论对象 `parent_comment_id` 字段为 `null`
- 数据库中保存的评论失去了父子关系
- IM 界面无法正确渲染评论树

## 修复方案

### 1. 从 API 请求参数中提取父评论 ID

抖音评论发布 API 请求参数中的 `reply_id` 字段表示父评论 ID：

| reply_id 值 | 含义 |
|------------|------|
| `'0'` 或不存在 | 一级评论（直接评论作品） |
| 其他值 | 二级/三级评论（回复某个评论，reply_id 为父评论的 cid） |

### 2. 修改代码传递 parentCommentId

```javascript
// ✅ 修复后的代码
// 提取请求参数
const request = response.request();
const postData = request.postDataJSON();

// ✅ 判断评论层级，提取父评论 ID
let parentCommentId = null;
if (postData?.reply_id && postData.reply_id !== '0') {
    parentCommentId = String(postData.reply_id);
    logger.debug(`[API] 检测到回复评论，父评论 ID: ${parentCommentId}`);
}

// ✅ 传递 parentCommentId 保持楼层关系
const newCommentData = dataManager.normalizePublishResponse(body, {
    accountUserId: page._accountContext?.accountId,
    awemeId: postData?.aweme_id,
    parentCommentId: parentCommentId,  // ✅ 修复点
});
```

## 数据流转

### 修复前

```
API 请求 (reply_id: "7441234567890")
    ↓
normalizePublishResponse({ awemeId: "xxx" })  // ❌ 缺失 parentCommentId
    ↓
normalizeComment(rawComment, { parentCommentId: null })  // ❌ 默认为 null
    ↓
标准化数据: { parent_comment_id: null, ... }  // ❌ 楼层关系丢失
    ↓
数据库保存: parent_comment_id = null  // ❌ 无法构建评论树
```

### 修复后

```
API 请求 (reply_id: "7441234567890")
    ↓
提取 postData.reply_id → parentCommentId = "7441234567890"
    ↓
normalizePublishResponse({ awemeId: "xxx", parentCommentId: "7441234567890" })
    ↓
normalizeComment(rawComment, { parentCommentId: "7441234567890" })
    ↓
标准化数据: { parent_comment_id: "7441234567890", ... }  // ✅ 楼层关系正确
    ↓
数据库保存: parent_comment_id = "7441234567890"  // ✅ 可以构建评论树
```

## 关键字段说明

在标准化后的评论对象中，楼层关系通过以下字段表示：

| 字段 | 说明 | 来源 |
|------|------|------|
| `parent_comment_id` | 父评论 ID | 从 API 请求参数的 `reply_id` 提取 |
| `reply_id` | 回复关系 ID | 从 API 响应的 `comment.reply_id` 提取 |
| `reply_to_reply_id` | 三级回复的目标 ID | 从 API 响应的 `comment.reply_to_reply_id` 提取 |

**示例**：

```javascript
// 一级评论
{
  cid: "7441111111111",
  parent_comment_id: null,        // ✅ 没有父评论
  reply_id: "0",
  reply_to_reply_id: "0"
}

// 二级评论（回复一级评论）
{
  cid: "7442222222222",
  parent_comment_id: "7441111111111",  // ✅ 父评论是一级评论
  reply_id: "7441111111111",
  reply_to_reply_id: "0"
}

// 三级评论（回复二级评论）
{
  cid: "7443333333333",
  parent_comment_id: "7442222222222",  // ✅ 父评论是二级评论
  reply_id: "7441111111111",           // 一级评论 ID
  reply_to_reply_id: "7442222222222"   // 二级评论 ID
}
```

## 修改文件

### `packages/worker/src/platforms/douyin/send-reply-to-comment-video-detail.js`

**位置**：第 1074-1089 行

**修改内容**：
1. 添加父评论 ID 提取逻辑（判断 `postData.reply_id`）
2. 传递 `parentCommentId` 给 `normalizePublishResponse`

## 测试验证

### 测试用例 1：一级评论

**操作**：在作品下直接发布评论 "测试一级评论"

**预期结果**：
```javascript
{
  cid: "744xxxx",
  parent_comment_id: null,  // ✅ 一级评论无父评论
  text: "测试一级评论"
}
```

### 测试用例 2：二级评论

**操作**：回复一级评论 "测试二级评论"

**预期结果**：
```javascript
{
  cid: "744yyyy",
  parent_comment_id: "744xxxx",  // ✅ 指向一级评论
  text: "测试二级评论"
}
```

### 测试用例 3：三级评论

**操作**：回复二级评论 "测试三级评论"

**预期结果**：
```javascript
{
  cid: "744zzzz",
  parent_comment_id: "744yyyy",  // ✅ 指向二级评论
  text: "测试三级评论"
}
```

## 影响范围

### ✅ 受益功能

1. **IM 界面评论树渲染** - 可以正确显示评论层级
2. **评论数据同步** - Master 数据库中保存正确的父子关系
3. **评论查询** - 可以通过 `parent_comment_id` 查询子评论

### ⚠️ 无影响

1. **现有数据** - 历史数据中的 `parent_comment_id` 可能为 `null`，需要重新爬取或手动修复
2. **API 爬虫** - crawler-api.js 已经正确设置 `parentCommentId`，无需修改

## 后续优化建议

### 1. 历史数据修复

对于已保存的评论数据，可能需要重新爬取或通过以下方式修复：

```javascript
// 伪代码：根据 reply_id 设置 parent_comment_id
UPDATE comments
SET parent_comment_id = reply_id
WHERE reply_id != '0' AND parent_comment_id IS NULL;
```

### 2. 数据完整性校验

添加定期校验任务，检查评论楼层关系是否完整：

```javascript
// 检查孤儿评论（parent_comment_id 指向不存在的评论）
SELECT * FROM comments
WHERE parent_comment_id IS NOT NULL
AND parent_comment_id NOT IN (SELECT cid FROM comments);
```

### 3. IM 界面容错

IM 客户端应处理以下边界情况：
- `parent_comment_id` 为 `null` 的回复评论（当作一级评论显示）
- 父评论不存在的孤儿评论（显示警告或隐藏）

## 总结

这次修复解决了评论楼层关系丢失的问题，核心改动只有一行代码（传递 `parentCommentId`），但影响重大：

- ✅ **数据完整性**：保证评论父子关系正确保存
- ✅ **用户体验**：IM 界面可以正确渲染评论树
- ✅ **代码一致性**：与 crawler-api.js 的处理逻辑保持一致

**关键点**：API 拦截器需要从**请求参数**（`postData.reply_id`）而不是响应数据中提取父评论信息，因为响应数据中的 `reply_id` 可能不准确或缺失。
