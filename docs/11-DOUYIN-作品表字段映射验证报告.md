# 作品表（works）字段映射验证报告

## 数据库表结构 vs 代码字段映射

### works 表结构（schema.sql:583-622）

```sql
CREATE TABLE works (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_work_id TEXT NOT NULL,
  platform_user_id TEXT,

  -- 作品类型和信息
  work_type TEXT NOT NULL CHECK(work_type IN ('video', 'article', 'image', 'audio', 'text')),
  title TEXT,
  description TEXT,
  cover TEXT,
  url TEXT,
  publish_time INTEGER,

  -- 统计信息
  total_comment_count INTEGER DEFAULT 0,
  new_comment_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,

  -- 爬取状态
  last_crawl_time INTEGER,
  crawl_status TEXT DEFAULT 'pending',
  crawl_error TEXT,

  -- 标记
  is_new BOOLEAN DEFAULT 1,
  push_count INTEGER DEFAULT 0,

  -- 时间戳
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- 三字段组合唯一约束
  UNIQUE(account_id, platform, platform_work_id),

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
```

### crawl-works.js 标准化数据（第485-516行）

```javascript
function standardizeWorkData(work, account) {
  return {
    id: uuidv4(),
    account_id: account.id,
    platform: 'douyin',                          // ✅ 匹配
    platform_work_id: work.platform_work_id,     // ✅ 匹配
    platform_user_id: account.platform_user_id,  // ✅ 匹配

    work_type: work.work_type || 'video',        // ✅ 匹配
    title: work.title || '',                     // ✅ 匹配
    description: work.description || '',         // ✅ 匹配
    cover: work.cover || '',                     // ✅ 匹配
    url: work.url || '',                         // ✅ 匹配
    publish_time: work.publish_time || null,     // ✅ 匹配

    total_comment_count: work.total_comment_count || 0,  // ✅ 匹配
    new_comment_count: 0,                        // ✅ 匹配
    like_count: work.like_count || 0,            // ✅ 匹配
    share_count: work.share_count || 0,          // ✅ 匹配
    view_count: work.view_count || 0,            // ✅ 匹配

    last_crawl_time: Math.floor(Date.now() / 1000),  // ✅ 匹配
    crawl_status: 'success',                     // ✅ 匹配
    crawl_error: null,                           // ✅ 匹配

    is_new: true,                                // ✅ 匹配
    push_count: 0,                               // ✅ 匹配

    created_at: Math.floor(Date.now() / 1000),   // ✅ 匹配
    updated_at: Math.floor(Date.now() / 1000),   // ✅ 匹配
  };
}
```

## ✅ 验证结果：完全匹配！

### 字段对比表

| 数据库字段 | 代码字段 | 数据类型 | 匹配状态 |
|-----------|---------|---------|----------|
| `id` | `id` | TEXT | ✅ |
| `account_id` | `account_id` | TEXT | ✅ |
| `platform` | `platform` | TEXT | ✅ |
| `platform_work_id` | `platform_work_id` | TEXT | ✅ |
| `platform_user_id` | `platform_user_id` | TEXT | ✅ |
| `work_type` | `work_type` | TEXT | ✅ |
| `title` | `title` | TEXT | ✅ |
| `description` | `description` | TEXT | ✅ |
| `cover` | `cover` | TEXT | ✅ |
| `url` | `url` | TEXT | ✅ |
| `publish_time` | `publish_time` | INTEGER | ✅ |
| `total_comment_count` | `total_comment_count` | INTEGER | ✅ |
| `new_comment_count` | `new_comment_count` | INTEGER | ✅ |
| `like_count` | `like_count` | INTEGER | ✅ |
| `share_count` | `share_count` | INTEGER | ✅ |
| `view_count` | `view_count` | INTEGER | ✅ |
| `last_crawl_time` | `last_crawl_time` | INTEGER | ✅ |
| `crawl_status` | `crawl_status` | TEXT | ✅ |
| `crawl_error` | `crawl_error` | TEXT | ✅ |
| `is_new` | `is_new` | BOOLEAN | ✅ |
| `push_count` | `push_count` | INTEGER | ✅ |
| `created_at` | `created_at` | INTEGER | ✅ |
| `updated_at` | `updated_at` | INTEGER | ✅ |

**总计**：23 个字段，全部匹配 ✅

## 数据提取流程验证

### 1. React Fiber 提取（第274-301行）

```javascript
const work = {
  index,
  platform_work_id: String(workId),               // ✅ 提取正确
  title: workData.title || workData.desc || '',   // ✅ 提取正确
  description: workData.description || workData.desc || '',  // ✅ 提取正确
  cover: workData.cover || workData.video?.cover?.url_list?.[0] || '',  // ✅ 提取正确
  url: workData.share_url || `https://www.douyin.com/video/${workId}`,  // ✅ 提取正确
  publish_time: workData.create_time || workData.createTime,  // ✅ 提取正确

  // 统计数据
  total_comment_count: workData.statistics?.comment_count || 0,  // ✅ 提取正确
  like_count: workData.statistics?.digg_count || 0,              // ✅ 提取正确
  share_count: workData.statistics?.share_count || 0,            // ✅ 提取正确
  view_count: workData.statistics?.play_count || 0,              // ✅ 提取正确

  // 作品类型
  work_type: detectWorkType(workData),  // ✅ 提取正确

  // 来源标记
  source: 'fiber',
};
```

### 2. API 数据增强（第438-462行）

```javascript
const enhanced = works.map(work => {
  const apiData = apiWorkMap.get(work.platform_work_id);

  if (apiData) {
    return {
      ...work,
      title: apiData.desc || work.title,                             // ✅ API 优先
      description: apiData.desc || work.description,                 // ✅ API 优先
      cover: apiData.video?.cover?.url_list?.[0] || work.cover,      // ✅ API 优先
      url: apiData.share_url || work.url,                            // ✅ API 优先
      publish_time: apiData.create_time || work.publish_time,        // ✅ API 优先

      total_comment_count: apiData.statistics?.comment_count || work.total_comment_count,  // ✅ API 优先
      like_count: apiData.statistics?.digg_count || work.like_count,           // ✅ API 优先
      share_count: apiData.statistics?.share_count || work.share_count,        // ✅ API 优先
      view_count: apiData.statistics?.play_count || work.view_count,           // ✅ API 优先

      work_type: detectWorkTypeFromAPI(apiData),  // ✅ API 优先
      source: 'api_enhanced',
    };
  }

  return work;
});
```

### 3. work_type 检测逻辑（第343-352行）

```javascript
function detectWorkType(workData) {
  if (workData.images && workData.images.length > 0) {
    return 'image';  // 图文作品 ✅
  } else if (workData.video || workData.aweme_type === 0) {
    return 'video';  // 视频作品 ✅
  } else if (workData.article_id) {
    return 'article';  // 文章作品 ✅
  }
  return 'video';  // 默认为视频 ✅
}
```

**验证结果**：✅ 类型检测逻辑正确，符合数据库约束：
```sql
CHECK(work_type IN ('video', 'article', 'image', 'audio', 'text'))
```

## 数据一致性检查

### 1. 字段默认值对比

| 字段 | 数据库默认值 | 代码默认值 | 匹配 |
|-----|-------------|-----------|------|
| `total_comment_count` | 0 | `work.total_comment_count \|\| 0` | ✅ |
| `new_comment_count` | 0 | `0` | ✅ |
| `like_count` | 0 | `work.like_count \|\| 0` | ✅ |
| `share_count` | 0 | `work.share_count \|\| 0` | ✅ |
| `view_count` | 0 | `work.view_count \|\| 0` | ✅ |
| `crawl_status` | 'pending' | `'success'` | ⚠️ 不同（但合理） |
| `is_new` | 1 (true) | `true` | ✅ |
| `push_count` | 0 | `0` | ✅ |

**说明**：`crawl_status` 默认值不同是合理的：
- 数据库默认 `'pending'`（待爬取）
- 代码设置 `'success'`（已成功爬取）
- 因为代码只在爬取成功后才调用 `standardizeWorkData()`

### 2. 约束检查

#### 唯一约束
```sql
UNIQUE(account_id, platform, platform_work_id)
```

**代码实现**：
- `account_id`：从 `account.id` 获取 ✅
- `platform`：固定为 `'douyin'` ✅
- `platform_work_id`：从 `work.platform_work_id` 获取（Fiber/API 提取的 `aweme_id`）✅

**验证结果**：✅ 可以防止重复入库

#### 外键约束
```sql
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
```

**代码实现**：
- 使用 `account.id`（传入参数）✅
- 账户删除时，作品自动删除（CASCADE）✅

#### CHECK 约束
```sql
CHECK(work_type IN ('video', 'article', 'image', 'audio', 'text'))
```

**代码实现**：
- `detectWorkType()` 返回 `'video'`, `'image'`, `'article'` ✅
- 默认值为 `'video'` ✅
- **注意**：代码未生成 `'audio'` 和 `'text'` 类型，但这是正常的（抖音主要是视频和图文）

## 潜在问题分析

### ⚠️ 问题 1：publish_time 数据类型

**数据库**：`INTEGER`（Unix 时间戳，秒）

**代码提取**：
```javascript
publish_time: workData.create_time || workData.createTime
```

**风险**：
- API 返回的 `create_time` 可能是**毫秒级时间戳**（13 位）
- 数据库期望的是**秒级时间戳**（10 位）
- 如果不转换，会导致时间显示错误（如 2054 年）

**验证方法**：
```javascript
// 在 standardizeWorkData() 中添加日志
logger.info(`publish_time: ${work.publish_time} (length: ${String(work.publish_time).length})`);
```

**修复建议**：
```javascript
publish_time: work.publish_time
  ? (String(work.publish_time).length === 13
      ? Math.floor(work.publish_time / 1000)  // 毫秒 → 秒
      : work.publish_time)
  : null,
```

### ⚠️ 问题 2：title 和 description 使用同一字段

**代码**：
```javascript
title: apiData.desc || work.title,
description: apiData.desc || work.description,
```

**风险**：
- 抖音 API 的 `desc` 字段通常是作品描述（标题）
- 代码将 `desc` 同时赋给了 `title` 和 `description`
- 这是合理的（抖音作品通常没有单独的"描述"字段）

**验证结果**：✅ 合理设计

### ✅ 问题 3：view_count 字段名

**之前担心**：`view_count` vs `play_count`

**验证结果**：
- 数据库字段：`view_count` ✅
- 代码字段：`view_count` ✅
- **完全匹配**！

## 总结

### ✅ 字段映射正确性

| 检查项 | 结果 |
|-------|------|
| 字段名匹配 | ✅ 100% 匹配 (23/23) |
| 数据类型匹配 | ✅ 全部正确 |
| 默认值合理性 | ✅ 合理 |
| 约束满足 | ✅ UNIQUE, FK, CHECK 都满足 |

### ⚠️ 需要改进的地方

1. **publish_time 时间戳转换**
   - 当前可能存在毫秒/秒混用问题
   - 建议添加转换逻辑

### 💡 建议测试验证

1. **运行作品爬虫**
   ```bash
   npm run start:worker
   ```

2. **查看日志**
   ```bash
   tail -f packages/worker/logs/crawl-works.log
   ```

3. **检查数据库**
   ```sql
   SELECT
     platform_work_id,
     title,
     work_type,
     view_count,
     total_comment_count,
     datetime(publish_time, 'unixepoch') as publish_time_formatted,
     datetime(created_at, 'unixepoch') as created_at_formatted
   FROM works
   WHERE platform = 'douyin'
     AND created_at > strftime('%s', 'now', '-1 hour')
   ORDER BY created_at DESC
   LIMIT 10;
   ```

4. **预期结果**
   - ✅ `platform_work_id` 有值（aweme_id）
   - ✅ `title` 有值（作品标题）
   - ✅ `work_type` 为 'video' 或 'image'
   - ✅ `view_count` > 0（如果作品有播放量）
   - ⚠️ `publish_time_formatted` 显示正确的日期（不是 2054 年）

---

**验证时间**：2025-10-27
**验证人员**：Claude
**结论**：✅ works 表字段映射基本正确，仅需验证 publish_time 时间戳格式
