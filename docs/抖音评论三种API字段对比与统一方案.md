# 抖音评论三种API字段对比与统一方案

## 一、三种API字段对比表

| 字段分类 | 字段含义 | onCommentsListAPI | onDiscussionsListAPI | onDiscussionsListV2API | 统一映射 |
|---------|---------|------------------|---------------------|----------------------|---------|
| **评论ID** | 评论唯一标识 | `comment_id` (加密) | `comment_id` (加密) | `cid` (数字) | `commentId` |
| **作品ID** | 关联作品 | ❌ 无（需从URL提取） | ❌ 无 | ✅ `aweme_id` (数字) | `contentId` |
| **父评论ID** | 回复对象 | `reply_to_user_info.user_id` | `reply_to_user_info.user_id` | `reply_id` | `parentCommentId` |
| **用户ID** | 评论作者ID | `user_info.user_id` (加密) | `user_info.user_id` (加密) | `user.uid` (数字) | `authorId` |
| **用户昵称** | 评论作者昵称 | `user_info.screen_name` | `user_info.screen_name` | `user.nickname` | `authorName` |
| **用户头像** | 评论作者头像 | `user_info.avatar_url` | `user_info.avatar_url` | `user.avatar_thumb.url_list[0]` | `authorAvatar` |
| **评论内容** | 评论文本 | `text` | `text` | `text` | ✅ 一致 |
| **创建时间** | 发布时间 | `create_time` (字符串) | `create_time` (字符串) | `create_time` (数字) | `createdAt` |
| **点赞数** | 点赞统计 | `digg_count` (字符串) | `digg_count` (字符串) | `digg_count` (数字) | `likeCount` |
| **回复数** | 回复统计 | `reply_count` (字符串) | `reply_count` (字符串) | `reply_comment_total` (数字) | `replyCount` |
| **是否作者** | 是否作者回复 | `is_author` (布尔) | `is_author` (布尔) | - | `isAuthorReply` |
| **用户已点赞** | 当前用户是否已点赞 | `user_digg` (布尔) | `user_digg` (布尔) | `user_digged` (0/1) | `isLiked` |
| **评论等级** | 评论层级 | `level` (1=一级) | `level` (2=二级) | `level` | ✅ 一致 |
| **评论图片** | 图片列表 | ❌ 无 | ❌ 无 | ✅ `image_list` | `images` |
| **IP属地** | 发布地点 | ❌ 无 | ❌ 无 | ✅ `ip_label` | - |

## 二、关键差异分析

### 1. **数据类型不一致**

#### V1 API (comment_info_list)
```javascript
{
  "comment_id": "@j/du7rRFQE76t8pb...",  // 加密字符串
  "create_time": "1703200978",           // 字符串
  "digg_count": "0",                     // 字符串
  "reply_count": "0",                    // 字符串
  "user_info": {                         // 嵌套对象
    "user_id": "@j/du7rRFQE76...",
    "screen_name": "夕阳",
    "avatar_url": "https://..."
  }
}
```

#### V2 API (comments)
```javascript
{
  "cid": "7572383596784419593",          // 数字字符串
  "create_time": 1763082950,             // 数字
  "digg_count": 0,                       // 数字
  "reply_comment_total": 0,              // 数字
  "aweme_id": "7571732586456812800",     // 数字字符串
  "user": {                              // 嵌套对象（字段名不同）
    "uid": "3607962860399156",
    "nickname": "向阳而生",
    "avatar_thumb": {                    // 更复杂的结构
      "url_list": ["https://..."]
    }
  }
}
```

### 2. **缺失字段汇总**

| 缺失字段 | V1评论API | V1讨论API | V2 API | 解决方案 |
|---------|---------|---------|--------|---------|
| `aweme_id` | ❌ | ❌ | ✅ | 从URL的 `item_id` 提取 |
| `parent_comment_id` | - | ❌ | - | 从URL的 `comment_id` 提取 |
| `image_list` | ❌ | ❌ | ✅ | 降级为 null |
| `ip_label` | ❌ | ❌ | ✅ | 可选字段 |
| `user.uid` (数字) | ❌ | ❌ | ✅ | V1使用加密ID |

## 三、推荐方案：API拦截时统一转换

### ✅ 方案选择：在API回调中统一转换

**原因：**
1. ✅ **数据完整性**：在API拦截时可以获取URL参数（item_id, comment_id等）
2. ✅ **单一职责**：DataManager只负责存储标准格式数据
3. ✅ **易于维护**：字段映射逻辑集中在API回调中
4. ✅ **类型安全**：统一转换为标准类型（字符串→数字，对象扁平化）

### 实现步骤

#### 步骤1：在API回调中创建统一转换函数

**位置**：[crawler-comments.js](packages/worker/src/platforms/douyin/crawler-comments.js)

```javascript
/**
 * 统一转换评论数据格式（支持三种API）
 * @param {Object} comment - 原始评论数据
 * @param {Object} context - 上下文信息（item_id, comment_id等）
 * @returns {Object} 统一格式的评论数据
 */
function normalizeCommentData(comment, context = {}) {
  // 判断是V1还是V2格式
  const isV2 = 'cid' in comment && 'user' in comment;

  return {
    // ✅ 评论ID：统一为字符串
    comment_id: isV2 ? comment.cid : comment.comment_id,
    cid: isV2 ? comment.cid : comment.comment_id,

    // ✅ 作品ID：从数据或上下文获取
    aweme_id: comment.aweme_id || context.item_id,
    item_id: comment.aweme_id || context.item_id,

    // ✅ 父评论ID：从数据或上下文获取
    parent_comment_id: context.parent_comment_id || null,
    reply_id: isV2 ? comment.reply_id : null,

    // ✅ 评论内容（字段一致）
    text: comment.text,
    content: comment.text,

    // ✅ 时间戳：统一为数字
    create_time: isV2 ? comment.create_time : parseInt(comment.create_time),

    // ✅ 统计数据：统一为数字
    digg_count: isV2 ? comment.digg_count : parseInt(comment.digg_count || 0),
    reply_count: isV2
      ? comment.reply_comment_total
      : parseInt(comment.reply_count || 0),

    // ✅ 用户信息：统一字段名
    user_info: isV2 ? {
      user_id: comment.user.uid,
      uid: comment.user.uid,
      screen_name: comment.user.nickname,
      nickname: comment.user.nickname,
      avatar_url: comment.user.avatar_thumb?.url_list?.[0] || null,
    } : {
      user_id: comment.user_info.user_id,
      uid: comment.user_info.user_id,
      screen_name: comment.user_info.screen_name,
      nickname: comment.user_info.screen_name,
      avatar_url: comment.user_info.avatar_url,
    },

    // ✅ 用户字段（扁平化，兼容两种格式）
    user: comment.user || {
      uid: comment.user_info?.user_id,
      nickname: comment.user_info?.screen_name,
      avatar_thumb: {
        url_list: [comment.user_info?.avatar_url]
      }
    },

    // ✅ 状态字段
    is_author: isV2 ? (comment.label_text === '作者') : comment.is_author,
    user_digg: isV2 ? (comment.user_digged === 1) : comment.user_digg,
    user_digged: isV2 ? comment.user_digged : (comment.user_digg ? 1 : 0),
    level: comment.level,
    status: comment.status,

    // ✅ 可选字段（V2独有）
    image_list: comment.image_list || null,
    ip_label: comment.ip_label || null,

    // ⚠️ 保留原始数据（便于调试）
    _raw: comment,
    _api_version: isV2 ? 'v2' : 'v1',
  };
}
```

#### 步骤2：在三个API回调中使用统一转换

```javascript
// onCommentsListAPI
async function onCommentsListAPI(body, response) {
  const url = response.url();
  const itemId = extractItemId(url);
  const comments = body?.comment_info_list || [];

  if (dataManager && comments.length > 0) {
    const normalizedComments = comments.map(comment =>
      normalizeCommentData(comment, {
        item_id: itemId,  // ✅ 补充作品ID
      })
    );

    const savedComments = dataManager.batchUpsertComments(
      normalizedComments,
      DataSource.API
    );
    logger.info(`[API] [${accountId}] 评论列表: ${savedComments.length} 条`);
  }
}

// onDiscussionsListAPI
async function onDiscussionsListAPI(body, response) {
  const url = response.url();
  const commentId = extractCommentId(url);
  const comments = body?.comment_info_list || [];

  if (dataManager && comments.length > 0) {
    const normalizedComments = comments.map(comment =>
      normalizeCommentData(comment, {
        parent_comment_id: commentId,  // ✅ 补充父评论ID
      })
    );

    const discussions = dataManager.batchUpsertComments(
      normalizedComments,
      DataSource.API
    );
    logger.info(`[API] [${accountId}] 讨论列表: ${discussions.length} 条`);
  }
}

// onDiscussionsListV2API
async function onDiscussionsListV2API(body, response) {
  const url = response.url();
  const awemeId = extractAwemeId(url);
  const comments = body?.comments || [];

  if (dataManager && comments.length > 0) {
    const normalizedComments = comments.map(comment =>
      normalizeCommentData(comment, {
        item_id: comment.aweme_id || awemeId,  // ✅ 确保有作品ID
      })
    );

    const discussions = dataManager.batchUpsertComments(
      normalizedComments,
      DataSource.API
    );
    logger.info(`[API] [${accountId}] 讨论列表V2: ${discussions.length} 条`);
  }
}
```

#### 步骤3：简化 mapCommentData 方法

由于数据已在API回调中统一，`mapCommentData` 只需处理标准格式：

```javascript
mapCommentData(douyinData) {
  return {
    // 关联信息（字段已统一）
    commentId: String(douyinData.cid || douyinData.comment_id),
    contentId: String(douyinData.aweme_id || 'undefined'),
    parentCommentId: douyinData.parent_comment_id
      ? String(douyinData.parent_comment_id)
      : null,

    // 作者信息（字段已统一为user_info）
    authorId: String(douyinData.user_info?.uid || 'unknown'),
    authorName: douyinData.user_info?.nickname || 'Unknown',
    authorAvatar: douyinData.user_info?.avatar_url || null,

    // 评论内容（字段已统一）
    content: douyinData.text || '',
    images: douyinData.image_list || null,

    // 统计数据（类型已统一为数字）
    likeCount: douyinData.digg_count || 0,
    replyCount: douyinData.reply_count || 0,

    // 状态
    isAuthorReply: douyinData.is_author || false,
    isLiked: douyinData.user_digged === 1,

    // 时间戳（类型已统一为数字）
    createdAt: douyinData.create_time || Date.now(),
    updatedAt: Date.now(),

    // 保留原始数据
    rawData: douyinData,
  };
}
```

## 四、方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|-----|------|------|--------|
| **方案1：API拦截时统一转换** | ✅ 数据完整（有URL上下文）<br>✅ 逻辑集中<br>✅ DataManager简洁 | ⚠️ API回调代码增加 | ⭐⭐⭐⭐⭐ **推荐** |
| 方案2：DataManager分两种方法 | ✅ API回调简洁 | ❌ 逻辑分散<br>❌ 缺少URL上下文<br>❌ 难以维护 | ⭐⭐ |
| 方案3：直接推送原始数据 | ✅ 代码最少 | ❌ 数据不一致<br>❌ 下游处理复杂<br>❌ 容易出错 | ⭐ 不推荐 |

## 五、实施建议

### 立即实施（高优先级）
1. ✅ 实现 `normalizeCommentData()` 统一转换函数
2. ✅ 在三个API回调中应用转换
3. ✅ 简化 `mapCommentData()` 方法
4. ✅ 添加单元测试验证转换正确性

### 后续优化（中优先级）
1. 添加字段校验（确保必填字段存在）
2. 记录转换失败日志（便于排查问题）
3. 支持更多API版本（如未来V3）

### 长期维护（低优先级）
1. 定期检查API变化
2. 更新字段映射文档
3. 优化转换性能

## 六、测试用例

### 测试场景1：V1评论API
```javascript
const input = {
  comment_id: "@j/du7rRFQE76...",
  create_time: "1703200978",
  digg_count: "5",
  text: "测试评论",
  user_info: {
    user_id: "@j/du7rRFQE76...",
    screen_name: "测试用户",
    avatar_url: "https://..."
  }
};

const context = { item_id: "@j/item123..." };
const output = normalizeCommentData(input, context);

// 验证
assert.equal(output.aweme_id, "@j/item123...");
assert.equal(output.create_time, 1703200978);
assert.equal(output.digg_count, 5);
assert.equal(output.user_info.nickname, "测试用户");
```

### 测试场景2：V2讨论API
```javascript
const input = {
  cid: "7572383596784419593",
  aweme_id: "7571732586456812800",
  create_time: 1763082950,
  digg_count: 10,
  text: "测试回复",
  user: {
    uid: "3607962860399156",
    nickname: "测试用户",
    avatar_thumb: {
      url_list: ["https://..."]
    }
  }
};

const output = normalizeCommentData(input);

// 验证
assert.equal(output.comment_id, "7572383596784419593");
assert.equal(output.aweme_id, "7571732586456812800");
assert.equal(output.user_info.uid, "3607962860399156");
assert.equal(output.user_info.nickname, "测试用户");
```

## 七、相关文件

- [packages/worker/src/platforms/douyin/crawler-comments.js](packages/worker/src/platforms/douyin/crawler-comments.js) - API回调（需添加转换）
- [packages/worker/src/platforms/douyin/data-manager.js](packages/worker/src/platforms/douyin/data-manager.js) - 数据映射（需简化）
- [tests/评论回复.txt](tests/评论回复.txt) - API真实数据
