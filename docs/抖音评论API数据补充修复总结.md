# 抖音评论API数据补充修复总结

## 问题背景

在评论爬取过程中，发现三种不同的评论API返回数据格式不一致，导致评论数据无法正确关联到作品：

### 三种API的数据差异

| API类型 | URL | 返回字段 | 评论ID类型 | 作品ID | 问题 |
|--------|-----|---------|-----------|--------|------|
| **onCommentsListAPI** | `comment/list/?item_id=...` | `comment_info_list` | `comment_id` (加密) | ❌ 无 | 数据中缺少 `aweme_id`，必须从 URL 的 `item_id` 提取 |
| **onDiscussionsListAPI** | `comment/reply/list/?comment_id=...` | `comment_info_list` | `comment_id` (加密) | ❌ 无 | 数据中缺少 `aweme_id`，这是对某条评论的回复 |
| **onDiscussionsListV2API** | `comment/list/select/?aweme_id=...` | `comments` | `cid` (数字) | ✅ 有 | 数据中包含 `aweme_id` |

## 修复方案

### 1. 创建 `extractAwemeId()` 工具函数

**位置**：[crawler-comments.js:1007-1010](packages/worker/src/platforms/douyin/crawler-comments.js#L1007-L1010)

```javascript
/**
 * 从 URL 中提取 aweme_id (作品ID)
 */
function extractAwemeId(url) {
  const match = url.match(/aweme_id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

### 2. 修复 `onCommentsListAPI` - 补充作品ID

**位置**：[crawler-comments.js:69-83](packages/worker/src/platforms/douyin/crawler-comments.js#L69-L83)

```javascript
// 使用账号级别隔离的 DataManager
if (dataManager && comments.length > 0) {
  // ✅ 关键修复：评论数据中没有 aweme_id，需要从 URL 的 item_id 提取并补充
  const enrichedComments = comments.map(comment => ({
    ...comment,
    // 从 URL 提取的 item_id 就是作品的加密ID
    item_id: itemId,  // 补充作品ID
    aweme_id: itemId  // 同时补充 aweme_id（虽然是加密的）
  }));

  const savedComments = dataManager.batchUpsertComments(
    enrichedComments,
    DataSource.API
  );
  logger.info(`[API] [${accountId}] 评论列表: ${savedComments.length} 条`);
}
```

**效果**：
- ✅ 评论数据现在包含作品ID，可以正确关联到作品
- ✅ 支持加密的 `item_id`（sec_item_id）

### 3. 修复 `onDiscussionsListAPI` - 补充父评论ID

**位置**：[crawler-comments.js:124-142](packages/worker/src/platforms/douyin/crawler-comments.js#L124-L142)

```javascript
// 使用账号级别隔离的 DataManager
if (dataManager && comments.length > 0) {
  // ✅ 关键修复：讨论列表数据中没有 aweme_id，需要从 URL 的 comment_id 提取父评论关联
  // 注意：讨论是针对某条评论的回复，所以没有直接的 aweme_id
  const enrichedComments = comments.map(comment => ({
    ...comment,
    // 补充父评论ID（从URL提取）
    parent_comment_id: commentId,
    // ⚠️ aweme_id 无法从讨论API获取，需要从上下文或其他方式补充
  }));

  const discussions = dataManager.batchUpsertComments(
    enrichedComments,
    DataSource.API
  );
  logger.info(`[API] [${accountId}] 讨论列表: ${discussions.length} 条`);
}
```

**效果**：
- ✅ 回复评论可以通过 `parent_comment_id` 关联到父评论
- ⚠️ 作品ID仍然缺失，但可以通过父评论间接获取

### 4. 修复 `onDiscussionsListV2API` - 确保作品ID存在

**位置**：[crawler-comments.js:224-236](packages/worker/src/platforms/douyin/crawler-comments.js#L224-L236)

```javascript
// 使用账号级别隔离的 DataManager
if (dataManager && comments.length > 0) {
  // ✅ V2 API数据中已经包含 aweme_id，只需要确保所有评论都有
  const enrichedComments = comments.map(comment => ({
    ...comment,
    aweme_id: comment.aweme_id || awemeId,  // 使用数据中的aweme_id，如果没有则使用URL中的
  }));

  const discussions = dataManager.batchUpsertComments(
    enrichedComments,
    DataSource.API
  );
  logger.info(`[API] [${accountId}] 讨论列表V2: ${discussions.length} 条`);
}
```

**效果**：
- ✅ 确保所有评论都有作品ID
- ✅ 支持从数据和URL两个来源获取ID

### 5. 更新 `mapCommentData()` - 兼容多种数据格式

**位置**：[data-manager.js:271-304](packages/worker/src/platforms/douyin/data-manager.js#L271-L304)

```javascript
mapCommentData(douyinData) {
  // ✅ 关键修复：处理三种API返回的不同数据格式
  // 1. onCommentsListAPI: comment_id(加密) + item_id(加密，从URL补充)
  // 2. onDiscussionsListAPI: comment_id(加密) + parent_comment_id(加密，从URL补充)
  // 3. onDiscussionsListV2API: cid(数字) + aweme_id(数字)

  const awemeId = douyinData.aweme_id || douyinData.item_id;
  const secAwemeId = douyinData.sec_aweme_id;

  this.logger.debug(`💬 [mapCommentData] ID 字段:`, {
    aweme_id: awemeId,
    item_id: douyinData.item_id,
    sec_aweme_id: secAwemeId ? secAwemeId.substring(0, 40) + '...' : null,
    cid: douyinData.cid,
    comment_id: douyinData.comment_id ? douyinData.comment_id.substring(0, 40) + '...' : null,
    parent_comment_id: douyinData.parent_comment_id ? douyinData.parent_comment_id.substring(0, 40) + '...' : null
  });

  // ✅ 处理 contentId（作品ID）
  let contentId = awemeId || 'undefined';
  if (contentId === 'undefined' || !contentId) {
    this.logger.warn(`⚠️ [mapCommentData] 评论缺少 aweme_id，这可能是讨论回复`);
  }

  return {
    // 关联信息
    commentId: String(douyinData.cid || douyinData.comment_id),
    contentId: String(contentId),
    // ✅ 优先使用 parent_comment_id（从URL提取），否则使用 reply_id
    parentCommentId: douyinData.parent_comment_id
      ? String(douyinData.parent_comment_id)
      : (douyinData.reply_id ? String(douyinData.reply_id) : null),
    // ... 其他字段
  };
}
```

**效果**：
- ✅ 支持三种不同的API数据格式
- ✅ 统一处理加密ID和数字ID
- ✅ 详细的调试日志便于追踪问题

## 测试验证

### 测试场景

1. **评论列表**（onCommentsListAPI）：
   - 评论是否正确关联到作品
   - 加密的 `item_id` 是否正确保存

2. **讨论回复V1**（onDiscussionsListAPI）：
   - 回复是否正确关联到父评论
   - 缺失作品ID时是否有警告日志

3. **讨论回复V2**（onDiscussionsListV2API）：
   - 评论是否正确关联到作品
   - 数字和加密ID混合是否正确处理

### 预期结果

- ✅ 所有评论都有 `contentId`（作品ID）或 `parentCommentId`（父评论ID）
- ✅ 不再有 "评论缺少 aweme_id" 的错误
- ✅ 评论可以通过作品ID或父评论ID正确查询和展示

## 注意事项

1. **讨论回复的作品ID**：
   - `onDiscussionsListAPI` 返回的回复数据中没有直接的作品ID
   - 需要通过父评论ID间接获取作品ID
   - 在展示时，需要先查询父评论获取作品信息

2. **加密ID vs 数字ID**：
   - 旧版API使用加密的 `comment_id`（Base64编码的字符串）
   - 新版API使用数字 `cid`
   - 两种ID格式需要分别处理，不能混用

3. **数据完整性**：
   - 如果评论缺少作品ID，会记录警告日志
   - 建议定期检查日志，确认是否有数据丢失

## 相关文件

- [packages/worker/src/platforms/douyin/crawler-comments.js](packages/worker/src/platforms/douyin/crawler-comments.js) - API回调函数
- [packages/worker/src/platforms/douyin/data-manager.js](packages/worker/src/platforms/douyin/data-manager.js) - 数据映射方法
- [tests/评论回复.txt](tests/评论回复.txt) - API真实数据样例

## 修复时间

2025-11-14

## 修复人员

Claude (AI Assistant)
