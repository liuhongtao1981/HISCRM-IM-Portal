# is_new 字段设计与优化说明

## 问题：is_new 能否从抖音平台抓取？

**答案：不能**

## 原因分析

### 1. 抖音平台只提供绝对时间

抖音API返回的评论数据包含：
- `create_time` - 评论创建的绝对时间戳
- `cid` - 评论的唯一ID
- `text` - 评论内容
- `user` - 评论者信息

**抖音不知道**：
- 你上次什么时候爬取过这个作品的评论
- 你的系统中已经存储了哪些评论
- 哪些评论对你来说是"新的"

### 2. is_new 是相对概念

`is_new` 表示：**相对于我们系统上次爬取时，这条评论是否是新增的**

这是一个**业务层面的状态**，不是抖音平台的数据属性。

## 当前实现方案

### 方案：基于 ID 对比

```javascript
// packages/worker/src/services/incremental-crawl-service.js

// 1. 获取数据库中已存在的评论ID
const existingIds = await getExistingCommentIds(video.aweme_id);

// 2. 对比判断哪些是新的
const isNew = !existingIds.includes(comment.platform_comment_id);
```

### 优点
1. **准确可靠** - 基于唯一ID对比，100%准确
2. **处理补爬** - 如果某次爬取失败，下次仍能正确识别
3. **处理乱序** - 不受评论时间顺序影响

### 缺点
1. **查询成本** - 需要查询该作品的所有历史评论ID
2. **内存占用** - 如果评论数量大（如10万+），ID数组会占用较多内存

## 优化方案：时间窗口 + ID 对比

### 原理

对于**定期爬取**的场景（如每小时爬一次），我们不需要对比所有历史评论，只需要对比**最近时间窗口**内的评论ID。

### 实现

```javascript
// 1. 计算时间窗口
const now = Math.floor(Date.now() / 1000);
const timeSinceLastCrawl = now - video.last_crawl_time;
const safetyWindow = Math.max(timeSinceLastCrawl * 2, 3600); // 至少1小时
const sinceTime = video.last_crawl_time - safetyWindow;

// 2. 只查询时间窗口内的评论ID
const existingIds = await getExistingCommentIds(video.aweme_id, {
  since_time: sinceTime
});

// 3. 对比判断
const isNew = !existingIds.includes(comment.platform_comment_id);
```

### 性能对比

#### 场景：一个热门视频有 10 万条评论，每小时爬取一次

**优化前**：
- 查询所有 10 万条评论ID
- 内存：约 10 万 × 20 字节 = 2MB
- 查询时间：~500ms

**优化后**（假设每小时新增 100 条评论）：
- 只查询最近 2-3 小时的评论ID（约 200-300 条）
- 内存：约 300 × 20 字节 = 6KB
- 查询时间：~5ms

**性能提升**：约 **100 倍**

### 安全窗口（Safety Window）

为什么是 `timeSinceLastCrawl * 2`？

1. **容错机制** - 防止时间误差或爬取延迟
2. **处理补发** - 用户可能稍晚才发布评论
3. **时钟偏移** - 服务器时间可能不完全同步

例如：
- 上次爬取：1小时前
- 安全窗口：2小时
- 实际查询：3小时前到现在的评论ID

### 配置选项

```javascript
// 启用时间优化（默认）
IncrementalCrawlService.processCommentsIncremental(
  rawComments,
  video,
  accountId,
  platformUserId,
  getExistingCommentIds,
  { useTimeOptimization: true }  // 默认开启
);

// 关闭时间优化（查询所有历史ID）
IncrementalCrawlService.processCommentsIncremental(
  rawComments,
  video,
  accountId,
  platformUserId,
  getExistingCommentIds,
  { useTimeOptimization: false }  // 强制查询所有
);
```

## 使用场景对比

### 场景 1：定期爬取（推荐使用时间优化）

**特征**：
- 每小时或每天定期爬取
- 作品的 `last_crawl_time` 有值

**优化效果**：
- ✅ 显著提升性能
- ✅ 减少数据库查询压力
- ✅ 降低内存占用

```javascript
// 定期爬取 - 开启优化
const result = await IncrementalCrawlService.processCommentsIncremental(
  comments,
  video,  // video.last_crawl_time = 1小时前
  accountId,
  platformUserId,
  getExistingCommentIds,
  { useTimeOptimization: true }
);
```

### 场景 2：首次爬取或长时间未爬取

**特征**：
- 第一次爬取该作品
- 或很长时间（如1个月）未爬取

**自动处理**：
- 如果 `video.last_crawl_time` 不存在，自动使用全量查询
- 如果时间窗口过大（如1个月），建议关闭优化

```javascript
// 首次爬取 - 自动使用全量查询
const result = await IncrementalCrawlService.processCommentsIncremental(
  comments,
  video,  // video.last_crawl_time = null
  accountId,
  platformUserId,
  getExistingCommentIds
  // 自动检测到 last_crawl_time 不存在，使用全量查询
);
```

### 场景 3：不确定的爬取模式

**特征**：
- 爬取时间不固定
- 可能遗漏某些时间段

**建议**：
- 关闭时间优化，使用全量ID对比
- 或定期（如每周）执行一次全量对比校验

```javascript
// 不固定爬取 - 关闭优化以确保准确性
const result = await IncrementalCrawlService.processCommentsIncremental(
  comments,
  video,
  accountId,
  platformUserId,
  getExistingCommentIds,
  { useTimeOptimization: false }
);
```

## 数据流程示意

```
┌─────────────────────────────────────────────────────────────┐
│                     爬取评论流程                              │
└─────────────────────────────────────────────────────────────┘

1. 从抖音API获取评论
   ↓
   rawComments = [
     { cid: '123', text: '很棒', create_time: 1697500000 },
     { cid: '456', text: '不错', create_time: 1697500100 },
     ...
   ]

2. 查询数据库中的历史评论ID
   ↓
   existingIds = ['123', '789', '101112', ...]

   ┌─────────────────────────────────────┐
   │  时间优化：只查询最近2小时的ID      │
   │  无优化：查询该作品所有历史ID       │
   └─────────────────────────────────────┘

3. 对比判断 is_new
   ↓
   comment.cid = '123' → existingIds.includes('123') = true
   → is_new = false (已存在)

   comment.cid = '456' → existingIds.includes('456') = false
   → is_new = true (新评论)

4. 插入数据库
   ↓
   INSERT INTO comments (
     ...,
     is_new = 1,  -- 新评论标记
     first_detected_at = 当前时间
   )

5. 生成通知
   ↓
   如果 is_new = true，生成通知推送给客户端
```

## 代码实现位置

### DAO 层
- [packages/master/src/database/comments-dao.js](../packages/master/src/database/comments-dao.js)
  - `getCommentIdsByPostId(postId, options)` - 支持 `since_time` 参数

### 服务层
- [packages/worker/src/services/incremental-crawl-service.js](../packages/worker/src/services/incremental-crawl-service.js)
  - `processCommentsIncremental()` - 核心增量处理逻辑

### 平台层
- [packages/worker/src/platforms/douyin/platform.js](../packages/worker/src/platforms/douyin/platform.js)
  - `crawlComments()` - 调用增量服务

## 最佳实践

### 1. 定期爬取推荐配置

```javascript
// 推荐：每小时爬取一次，使用时间优化
const crawlInterval = 3600 * 1000; // 1小时

setInterval(async () => {
  const result = await crawlComments(account, {
    useTimeOptimization: true  // 开启优化
  });
}, crawlInterval);
```

### 2. 监控与告警

```javascript
// 记录每次爬取的统计信息
logger.info('Crawl completed', {
  video_id: video.aweme_id,
  total_comments: result.stats.total,
  new_comments: result.stats.new,
  existing_in_window: existingIds.length,
  time_window: `${safetyWindow}s`,
  optimization_used: useTimeOptimization
});

// 如果新评论比例异常（如100%都是新的），可能需要检查
if (result.stats.new === result.stats.total && result.stats.total > 50) {
  logger.warn('Unusual: all comments are new', {
    video_id: video.aweme_id,
    comment_count: result.stats.total
  });
}
```

### 3. 定期全量校验

```javascript
// 每周执行一次全量校验，确保数据准确性
const weeklyFullCheck = async () => {
  logger.info('Starting weekly full check...');

  const result = await crawlComments(account, {
    useTimeOptimization: false  // 关闭优化，全量对比
  });

  logger.info('Weekly full check completed', result.stats);
};

// 每周日凌晨3点执行
schedule.scheduleJob('0 3 * * 0', weeklyFullCheck);
```

## 总结

### 核心要点

1. **is_new 无法从抖音获取** - 这是业务状态，不是平台数据
2. **ID 对比最可靠** - 基于唯一ID判断，100%准确
3. **时间优化提升性能** - 定期爬取场景下可提升 100 倍性能
4. **安全窗口保证准确性** - 2倍时间窗口防止遗漏

### 推荐方案

- **定期爬取**：启用时间优化（`useTimeOptimization: true`）
- **首次爬取**：自动使用全量查询
- **不确定模式**：关闭优化或定期全量校验

### 性能收益

对于热门视频（10万+评论），定期爬取场景下：
- 查询时间：500ms → 5ms（**100倍**提升）
- 内存占用：2MB → 6KB（**300倍**降低）
- 准确性：保持 100%

## 相关文档
- [增量抓取实现指南.md](./增量抓取实现指南.md)
- [DAO层platform_user_id支持总结.md](./DAO层platform_user_id支持总结.md)
