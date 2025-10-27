# 作品标题显示"未知作品"问题分析

## 问题描述

在抖音评论抓取功能中，入库的作品标题显示为"未知作品"，而不是实际的视频标题。

## 问题定位

### 1. 代码位置

**问题代码**：[packages/worker/src/platforms/douyin/crawl-comments.js:422-425](../packages/worker/src/platforms/douyin/crawl-comments.js#L422-L425)

```javascript
// 匹配视频信息
const videoInfo = videosToClick.find(v => v.commentCountText == totalCount.toString()) || {
  title: '未知作品',
  index: -1,
};
```

### 2. 问题原因

#### 当前实现逻辑

1. **DOM 提取阶段**（第 121-139 行）：
   ```javascript
   const videoElements = await page.evaluate(() => {
     const containers = document.querySelectorAll('.container-Lkxos9');
     const videos = [];

     containers.forEach((container, idx) => {
       const titleEl = container.querySelector('.title-LUOP3b');
       const commentCountEl = container.querySelector('.right-os7ZB9 > div:last-child');

       if (titleEl) {
         videos.push({
           index: idx,
           title: titleEl.innerText?.trim() || '',
           commentCountText: commentCountEl?.innerText?.trim() || '0',
         });
       }
     });

     return videos;
   });
   ```
   - 从 DOM 提取 3 个字段：`index`、`title`、`commentCountText`
   - **缺少** `item_id` 字段（视频唯一标识）

2. **API 拦截阶段**（第 68-82 行）：
   ```javascript
   if (commentApiPattern.test(url) && json.comment_info_list && Array.isArray(json.comment_info_list)) {
     const itemId = extractItemId(url);  // 从 API URL 提取 item_id
     const cursor = extractCursor(url);

     apiResponses.comments.push({
       timestamp: Date.now(),
       url: url,
       item_id: itemId,  // ✅ 有 item_id
       cursor: cursor,
       data: json,
     });
   }
   ```
   - API 响应包含 `item_id`（从 URL 参数提取）
   - **可能包含**视频标题信息（需验证）

3. **匹配逻辑**（第 422-425 行）：
   ```javascript
   const videoInfo = videosToClick.find(v => v.commentCountText == totalCount.toString()) || {
     title: '未知作品',
     index: -1,
   };
   ```
   - ❌ **通过评论数量匹配**（`commentCountText == totalCount`）
   - ❌ **没有使用** `item_id` 进行匹配

#### 为什么匹配失败？

| 问题 | 原因 | 影响 |
|------|------|------|
| 匹配条件不可靠 | 两个视频可能有相同的评论数 | 匹配错误的视频 |
| 缺少唯一标识 | DOM 元素没有 `item_id` | 无法建立 DOM 与 API 的关联 |
| 数据源分离 | DOM 数据 ≠ API 数据 | 信息孤岛 |

## 解决方案

### 方案 1：从 API 响应中提取视频标题（推荐）

**优点**：
- ✅ 直接从 API 获取，数据准确
- ✅ 不依赖 DOM 匹配
- ✅ 代码简洁

**前提条件**：
- API 响应中包含视频标题信息

**实现步骤**：

1. **查看 API 响应结构**（已添加调试日志）：
   ```javascript
   // 位置：crawl-comments.js:73-106
   if (cursor === 0) {
     logger.info('📋 Top-level keys:', Object.keys(json).join(', '));
     // 输出所有对象字段，查找视频信息
   }
   ```

2. **提取视频标题**：
   ```javascript
   // 假设 API 响应结构为：
   // {
   //   comment_info_list: [...],
   //   aweme_info: {
   //     desc: "视频标题",
   //     aweme_id: "7xxx",
   //   }
   // }

   for (const [itemId, responses] of Object.entries(responsesByItemId)) {
     const firstResponse = responses[0];
     const videoTitle = firstResponse.data.aweme_info?.desc || '未知作品';  // 从 API 提取标题
     const totalCount = firstResponse.data.total_count || 0;

     videosWithComments.push({
       aweme_id: itemId,
       title: videoTitle,  // ✅ 使用 API 中的标题
       total_count: totalCount,
       actual_count: uniqueComments.length,
     });
   }
   ```

### 方案 2：建立 DOM 与 item_id 的映射

**优点**：
- ✅ 不依赖 API 响应中的标题字段

**缺点**：
- ❌ 实现复杂
- ❌ 需要在点击视频时记录 item_id

**实现步骤**：

1. **点击视频时记录映射**：
   ```javascript
   const videoToItemIdMap = {};  // { index: item_id }

   for (let i = 0; i < maxToProcess; i++) {
     const video = videosToClick[i];

     // 点击视频
     await page.evaluate((idx) => {
       const containers = document.querySelectorAll('.container-Lkxos9');
       if (idx < containers.length) {
         containers[idx].click();
       }
     }, video.index);

     // 等待 API 响应
     await page.waitForTimeout(3000);

     // 记录映射（从最新的 API 响应中提取 item_id）
     const latestResponse = apiResponses.comments[apiResponses.comments.length - 1];
     if (latestResponse) {
       videoToItemIdMap[video.index] = latestResponse.item_id;
     }
   }
   ```

2. **使用映射进行匹配**：
   ```javascript
   for (const [itemId, responses] of Object.entries(responsesByItemId)) {
     const videoIndex = Object.keys(videoToItemIdMap).find(
       idx => videoToItemIdMap[idx] === itemId
     );

     const video = videosToClick.find(v => v.index === parseInt(videoIndex));
     const videoTitle = video?.title || '未知作品';

     videosWithComments.push({
       aweme_id: itemId,
       title: videoTitle,  // ✅ 使用 DOM 中的标题
       total_count: totalCount,
     });
   }
   ```

## 下一步操作

### 立即执行

1. **运行 Worker 并查看调试日志**：
   ```bash
   # 终端 1
   npm run start:master

   # 终端 2
   npm run start:worker
   ```

2. **查看日志输出**：
   ```
   ╔═══════════════════════════════════════════════════════════════╗
   ║  🔍 Comment API Response Structure (First Page)               ║
   ╚═══════════════════════════════════════════════════════════════╝
   📋 Top-level keys: comment_info_list, has_more, cursor, total_count, aweme_info, ...

   📦 aweme_info:
      Type: Object
      Keys: aweme_id, desc, create_time, ...
      🎯 Possible title fields:
         desc: 这是一个视频标题...
   ```

3. **根据日志确定字段名称**：
   - 如果 API 包含视频标题 → 使用方案 1
   - 如果 API 不包含标题 → 使用方案 2

### 待修复的文件

1. **crawl-comments.js**（主要修改）：
   - 第 422-442 行：视频信息匹配逻辑
   - 第 337-446 行：`videosWithComments` 构建逻辑

2. **platform.js**（次要修改）：
   - 第 1706 行：`sendNewCommentNotifications` 中的视频查找逻辑

## 相关文件

- [packages/worker/src/platforms/douyin/crawl-comments.js](../packages/worker/src/platforms/douyin/crawl-comments.js)
- [packages/worker/src/platforms/douyin/platform.js](../packages/worker/src/platforms/douyin/platform.js)
- [tests/debug-video-title.js](../tests/debug-video-title.js)

## 验证步骤

修复后需验证：

1. ✅ 作品标题不再显示"未知作品"
2. ✅ 标题与实际视频匹配
3. ✅ 多个视频标题不混淆
4. ✅ 入库数据正确

---

**创建时间**：2025-10-27
**状态**：待修复（等待 API 响应结构确认）
**优先级**：高
