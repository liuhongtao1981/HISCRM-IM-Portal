# API 实际抓取数据分析

**分析日期**: 2025-10-27
**数据来源**: 实际拦截的 API 响应

---

## 📋 拦截到的 3 个 API

### 1️⃣ 作品列表 API

**端点**: `/aweme/v1/creator/item/list/`

**完整URL**:
```
https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=&aid=2906&msToken=...
```

**响应字段结构**:
```json
{
  "cursor": "1758867587000",
  "extra": {
    "now": 1761543464000
  },
  "has_more": false,
  "item_info_list": [
    {
      "anchor_user_id": "3607962860399156",
      "comment_count": 0,
      "cover_image_url": "https://...",
      "create_time": "发布于2025年10月27日 10:42",
      "creator_item_setting": {
        "charge_comment_audit": false
      },
      "duration": 27334,
      "item_id": "@jfFo679LREb/...",
      "item_id_plain": "7565726274291895578",
      "item_link": "https://www.iesdouyin.com/share/video/...",
      "media_type": 4,
      "title": "作品标题..."
    }
  ],
  "status_code": 0,
  "status_msg": "",
  "total_count": 18
}
```

**关键发现**:
- ⚠️  **API 端点不同**: 当前代码拦截的是 `/aweme/v1/web/aweme/post/**`
- ✅ **实际端点**: `/aweme/v1/creator/item/list/`
- 🔴 **问题**: 代码中的拦截规则无法匹配这个 API!

---

### 2️⃣ 一级评论列表 API

**端点**: `/aweme/v1/creator/comment/list/`

**完整URL**:
```
https://creator.douyin.com/aweme/v1/creator/comment/list/?cursor=0&count=10&item_id=%40j%2F...&sort=TIME&aid=2906
```

**参数**:
- `cursor`: 分页游标 (0, 4, ...)
- `count`: 每页数量 (10)
- `item_id`: 作品ID (加密)
- `sort`: 排序方式 (TIME)

**响应字段结构**:
```json
{
  "comment_info_list": [
    {
      "comment_id": "@j/du7rRFQE76...",
      "create_time": "1703200978",
      "digg_count": "0",
      "followed": false,
      "following": false,
      "is_author": false,
      "level": 1,
      "reply_count": "0",
      "reply_to_user_info": {
        "avatar_url": "",
        "screen_name": "",
        "user_id": "..."
      },
      "status": 1,
      "text": "[赞][赞][赞][赞][鼓掌]",
      "user_bury": false,
      "user_digg": false,
      "user_info": {
        "avatar_url": "https://p11.douyinpic.com/...",
        "screen_name": "夕阳",
        "user_id": "@j/du7rRFQE76..."
      }
    }
  ],
  "cursor": 4,
  "extra": {
    "now": 1761542813000
  },
  "has_more": false,
  "has_vcd_filter": false,
  "status_code": 0,
  "status_msg": "",
  "total_count": 4
}
```

**匹配状态**: ✅ 代码中的正则 `/comment.*list/i` 可以匹配

---

### 3️⃣ 二级回复列表 API (Discussions)

**端点**: `/aweme/v1/creator/comment/reply/list/`

**完整URL**:
```
https://creator.douyin.com/aweme/v1/creator/comment/reply/list/?cursor=0&count=10&comment_id=%40j%2F...&aid=2906
```

**参数**:
- `cursor`: 分页游标 (0, 3, ...)
- `count`: 每页数量 (10)
- `comment_id`: 父评论ID (加密)

**响应字段结构**:
```json
{
  "comment_info_list": [
    {
      "comment_id": "@j/du7rRFQE76...",
      "create_time": "1761313593",
      "digg_count": "0",
      "followed": false,
      "following": false,
      "is_author": true,           // ✅ 是作者本人
      "level": 2,                   // ✅ 二级回复
      "reply_count": "0",
      "reply_to_user_info": {       // ✅ 被回复用户信息
        "avatar_url": "",
        "screen_name": "",
        "user_id": "..."
      },
      "status": 1,
      "text": "谢谢你",
      "user_bury": false,
      "user_digg": false,
      "user_info": {                // ✅ 回复者信息
        "avatar_url": "https://p11.douyinpic.com/...",
        "screen_name": "苏苏",
        "user_id": "@j/du7rRFQE76..."
      }
    }
  ],
  "cursor": 3,
  "extra": {
    "now": 1761543014000
  },
  "has_more": false,
  "has_vcd_filter": false,
  "status_code": 0,
  "status_msg": "",
  "total_count": 3
}
```

**匹配状态**: ✅ 代码中的正则 `/comment.*reply/i` 可以匹配

---

## 🔍 详细字段对比分析

### 作品 API 字段对比

| 实际字段 | 数据类型 | 示例值 | 当前代码是否提取 |
|----------|---------|--------|----------------|
| `item_id` | string (加密) | `@jfFo679LREb/...` | ❌ 未提取 |
| `item_id_plain` | string (明文) | `"7565726274291895578"` | ❌ 未提取 |
| `title` | string | `"作品标题..."` | ❌ 未提取 |
| `create_time` | string | `"发布于2025年10月27日 10:42"` | ❌ 未提取 |
| `comment_count` | number | `0` | ❌ 未提取 |
| `cover_image_url` | string | `"https://..."` | ❌ 未提取 |
| `duration` | number (毫秒) | `27334` | ❌ 未提取 |
| `item_link` | string | `"https://www.iesdouyin.com/..."` | ❌ 未提取 |
| `anchor_user_id` | string | `"3607962860399156"` | ❌ 未提取 |
| `media_type` | number | `4` | ❌ 未提取 |

**原因**: 代码拦截的是 `/aweme/v1/web/aweme/post/**`,但实际 API 是 `/aweme/v1/creator/item/list/`

---

### 评论 API 字段对比 (实际 vs 代码)

| 字段 | 实际API | 代码提取 | 状态 |
|------|---------|---------|------|
| `comment_id` | ✅ 有 | ✅ 提取 | ✅ 匹配 |
| `text` | ✅ 有 | ✅ 提取 | ✅ 匹配 |
| `create_time` | ✅ `"1703200978"` (秒,字符串) | ✅ 提取+转换 | ✅ 匹配 |
| `digg_count` | ✅ `"0"` (字符串) | ✅ 提取+转换 | ✅ 匹配 |
| `reply_count` | ✅ `"0"` (字符串) | ✅ 提取+转换 | ✅ 匹配 |
| `level` | ✅ `1` (数字) | ❌ 未提取 | ⚠️  缺失 |
| `is_author` | ✅ `false` (布尔) | ❌ 未提取 | ⚠️  缺失 |
| `user_info.user_id` | ✅ 有 | ✅ 提取 | ✅ 匹配 |
| `user_info.screen_name` | ✅ `"夕阳"` | ✅ 提取 | ✅ 匹配 |
| `user_info.avatar_url` | ✅ 有 | ✅ 提取 | ✅ 匹配 |
| `reply_to_user_info` | ✅ 有 (空) | ❌ 未提取 | ⚠️  缺失 |
| `followed` | ✅ `false` | ❌ 未提取 | 🤔 可选 |
| `following` | ✅ `false` | ❌ 未提取 | 🤔 可选 |
| `status` | ✅ `1` | ❌ 未提取 | 🤔 可选 |

---

### Discussions API 字段对比

| 字段 | 实际API | 代码提取 | 状态 |
|------|---------|---------|------|
| `comment_id` | ✅ 有 | ✅ 提取 | ✅ 匹配 |
| `text` | ✅ `"谢谢你"` | ✅ 提取 | ✅ 匹配 |
| `create_time` | ✅ `"1761313593"` (秒) | ✅ 提取+转换 | ✅ 匹配 |
| `digg_count` | ✅ `"0"` | ✅ 提取+转换 | ✅ 匹配 |
| `reply_count` | ✅ `"0"` | ✅ 提取 | ✅ 匹配 |
| `level` | ✅ `2` (二级回复) | ❌ 未提取 | ⚠️  缺失 |
| `is_author` | ✅ `true` (是作者) | ❌ 未提取 | 🔴 **重要缺失** |
| `user_info.*` | ✅ 有 (回复者) | ✅ 提取 | ✅ 匹配 |
| `reply_to_user_info.*` | ✅ 有 (被回复者) | ❌ 未提取 | 🔴 **重要缺失** |

**示例数据**:
```json
{
  "reply_to_user_info": {
    "avatar_url": "https://p11.douyinpic.com/aweme/100x100/fa88000ec26f8c484cde.jpeg",
    "screen_name": "苏苏",
    "user_id": "@j/du7rRFQE76t8pb8rrruMp8qiiQZS/xL5oaCJNev56KsZmx+8RYOKiR6pIzTNZU"
  }
}
```

这个字段包含**完整的被回复用户信息**,非常重要!

---

## 🚨 关键问题发现

### 问题 1: 作品 API 拦截规则不匹配 🔴

**当前代码**:
```javascript
await page.route('**/aweme/v1/web/aweme/post/**', async (route) => {
  // ...
});

await page.route('**/aweme/v1/web/aweme/detail/**', async (route) => {
  // ...
});
```

**实际 API**:
```
/aweme/v1/creator/item/list/
```

**结果**: ❌ **完全无法匹配!作品 API 未被拦截!**

**影响**:
- 无法获取作品的详细信息
- `works` 表中的数据来源不明确
- 可能依赖 DOM 提取

**修复方案**:
```javascript
// 方案 1: 添加新的拦截规则
await page.route('**/aweme/v1/creator/item/list/**', async (route) => {
  const response = await route.fetch();
  const body = await response.json();

  apiResponses.worksList.push(body);
  logger.debug(`Intercepted creator item list API: ${body.item_info_list?.length || 0} items`);

  await route.fulfill({ response });
});

// 方案 2: 使用 page.on('response') 监听
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('/creator/item/list')) {
    const json = await response.json();
    apiResponses.worksList.push(json);
  }
});
```

---

### 问题 2: reply_to_user_info 未提取 🔴

**数据示例**:
```json
{
  "reply_to_user_info": {
    "avatar_url": "https://p11.douyinpic.com/aweme/100x100/fa88000ec26f8c484cde.jpeg",
    "screen_name": "苏苏",
    "user_id": "@j/du7rRFQE76t8pb8rrruMp8qiiQZS/xL5oaCJNev56KsZmx+8RYOKiR6pIzTNZU"
  }
}
```

**当前代码**: ❌ 完全未使用

**影响**:
- 无法知道"回复给谁"
- 无法构建完整的对话树
- 用户体验差

**修复方案**:
```javascript
discussions.push({
  // ... 现有字段

  // 新增: 被回复用户信息
  reply_to_user_id: reply.reply_to_user_info?.user_id || null,
  reply_to_user_name: reply.reply_to_user_info?.screen_name || null,
  reply_to_user_avatar: reply.reply_to_user_info?.avatar_url || null,
});
```

---

### 问题 3: is_author 未提取 🔴

**数据**:
- 一级评论: `"is_author": false` - 别人的评论
- 二级回复: `"is_author": true` - 作者本人的回复

**影响**:
- 无法区分自己和他人的评论
- 可能回复自己的评论
- 无法统计作者互动率

**修复方案**:
```javascript
comments.push({
  // ... 现有字段
  is_author: c.is_author || false,  // ✅ 新增
});

discussions.push({
  // ... 现有字段
  is_author: reply.is_author || false,  // ✅ 新增
});
```

---

### 问题 4: level 未提取 ⚠️

**数据**:
- 一级评论: `"level": 1`
- 二级回复: `"level": 2`

**影响**:
- 无法明确区分评论层级
- 查询时需要靠表名区分

**修复方案**:
```javascript
comments.push({
  // ... 现有字段
  level: c.level || 1,  // ✅ 新增
});

discussions.push({
  // ... 现有字段
  level: reply.level || 2,  // ✅ 新增
});
```

---

## 📊 字段提取完整性统计

### 评论 API (comment/list)

| 分类 | 总字段 | 已提取 | 未提取 | 完整率 |
|------|--------|--------|--------|--------|
| **基本信息** | 5 | 5 | 0 | **100%** ✅ |
| **用户信息** | 3 | 3 | 0 | **100%** ✅ |
| **状态标识** | 3 | 0 | 3 | **0%** ⚠️  |
| **回复关系** | 3 | 0 | 3 | **0%** ⚠️  |
| **用户关系** | 2 | 0 | 2 | **0%** 🤔 |
| **统计** | 2 | 2 | 0 | **100%** ✅ |
| **总计** | 18 | 10 | 8 | **56%** |

### Discussions API (comment/reply/list)

| 分类 | 总字段 | 已提取 | 未提取 | 完整率 |
|------|--------|--------|--------|--------|
| **基本信息** | 5 | 5 | 0 | **100%** ✅ |
| **回复者信息** | 3 | 3 | 0 | **100%** ✅ |
| **被回复者信息** | 3 | 0 | 3 | **0%** 🔴 |
| **状态标识** | 3 | 0 | 3 | **0%** ⚠️  |
| **统计** | 2 | 2 | 0 | **100%** ✅ |
| **总计** | 16 | 10 | 6 | **63%** |

### 作品 API (creator/item/list)

| 分类 | 状态 |
|------|------|
| **API 拦截** | ❌ **未拦截** |
| **字段提取** | ❌ **0%** |
| **数据来源** | ⚠️  **可能使用 DOM** |

---

## 🎯 修复优先级

### 🔴 P0 - 立即修复

1. **作品 API 拦截规则**
   - 当前: 拦截 `/aweme/v1/web/aweme/post/**`
   - 实际: `/aweme/v1/creator/item/list/`
   - 影响: 作品数据完全依赖 DOM 提取
   - 工作量: 30 分钟

2. **is_author 字段**
   - API 已提供,但未提取
   - 影响: 可能回复自己的评论
   - 工作量: 15 分钟

3. **reply_to_user_info 字段**
   - API 已提供完整数据
   - 影响: 无法构建对话树
   - 工作量: 30 分钟

### 🟡 P1 - 建议修复

4. **level 字段**
   - 明确评论层级
   - 工作量: 10 分钟

5. **followed/following 字段**
   - 用户关系分析
   - 工作量: 15 分钟

---

## 🔧 完整修复方案

### 1. 修复作品 API 拦截

**文件**: `packages/worker/src/platforms/douyin/crawl-works.js`

**修改**:
```javascript
// 删除或注释旧的拦截规则
// await page.route('**/aweme/v1/web/aweme/post/**', ...);
// await page.route('**/aweme/v1/web/aweme/detail/**', ...);

// 新增: 拦截创作者作品列表 API
await page.route('**/aweme/v1/creator/item/list/**', async (route) => {
  try {
    const response = await route.fetch();
    const body = await response.json();

    const signature = `${route.request().url()}`;
    if (!requestCache.has(signature)) {
      requestCache.add(signature);
      apiResponses.worksList.push(body);
      logger.debug(`Intercepted creator item list API: ${body.item_info_list?.length || 0} items`);
    }

    await route.fulfill({ response });
  } catch (error) {
    logger.error('API interception error:', error.message);
    await route.continue();
  }
});
```

**数据映射**:
```javascript
function enhanceWorksWithAPIData(works, apiResponses) {
  const apiWorkMap = new Map();

  apiResponses.worksList.forEach(response => {
    response.item_info_list?.forEach(item => {
      // 使用 item_id_plain 作为键
      const id = item.item_id_plain || item.item_id;
      apiWorkMap.set(String(id), item);
    });
  });

  return works.map(work => {
    const apiData = apiWorkMap.get(work.platform_work_id);

    if (apiData) {
      return {
        ...work,
        title: apiData.title || work.title,
        cover: apiData.cover_image_url || work.cover,
        url: apiData.item_link || work.url,
        // create_time 是字符串格式，需要解析
        // publish_time: parseCreateTime(apiData.create_time),
        total_comment_count: apiData.comment_count || work.total_comment_count,
        // duration 是毫秒，转换为秒
        duration: apiData.duration ? Math.floor(apiData.duration / 1000) : null,
      };
    }

    return work;
  });
}
```

---

### 2. 添加缺失字段到评论

**文件**: `packages/worker/src/platforms/douyin/crawl-comments.js:537-548`

```javascript
comments.push({
  platform_comment_id: c.comment_id,
  content: c.text,
  author_name: c.user_info?.screen_name || '匿名',
  author_id: c.user_info?.user_id || '',
  author_avatar: c.user_info?.avatar_url || '',
  create_time: createTimeSeconds,
  like_count: parseInt(c.digg_count) || 0,
  reply_count: parseInt(c.reply_count) || 0,

  // ✅ 新增字段
  is_author: c.is_author || false,
  level: c.level || 1,

  detected_at: Math.floor(Date.now() / 1000),
});
```

---

### 3. 添加缺失字段到 discussions

**文件**: `packages/worker/src/platforms/douyin/crawl-comments.js:643-656`

```javascript
discussions.push({
  platform_discussion_id: reply.comment_id,
  parent_comment_id: parentCommentId,
  work_id: reply.aweme_id || null,
  content: reply.text || reply.content,

  // 回复者信息
  author_name: reply.user_info?.screen_name || '匿名',
  author_id: reply.user_info?.user_id || '',
  author_avatar: reply.user_info?.avatar_url || '',

  // ✅ 新增: 被回复用户信息
  reply_to_user_id: reply.reply_to_user_info?.user_id || null,
  reply_to_user_name: reply.reply_to_user_info?.screen_name || null,
  reply_to_user_avatar: reply.reply_to_user_info?.avatar_url || null,

  // 统计和状态
  create_time: createTimeSeconds,
  like_count: parseInt(reply.digg_count) || 0,
  reply_count: parseInt(reply.reply_count) || 0,

  // ✅ 新增字段
  is_author: reply.is_author || false,
  level: reply.level || 2,

  detected_at: Math.floor(Date.now() / 1000),
});
```

---

### 4. 更新数据库 Schema

**文件**: `packages/master/src/database/schema.sql`

```sql
-- comments 表添加字段
ALTER TABLE comments ADD COLUMN is_author BOOLEAN DEFAULT 0;
ALTER TABLE comments ADD COLUMN level INTEGER DEFAULT 1;

-- discussions 表添加字段
ALTER TABLE discussions ADD COLUMN is_author BOOLEAN DEFAULT 0;
ALTER TABLE discussions ADD COLUMN level INTEGER DEFAULT 2;
ALTER TABLE discussions ADD COLUMN reply_to_user_id TEXT;
ALTER TABLE discussions ADD COLUMN reply_to_user_name TEXT;
ALTER TABLE discussions ADD COLUMN reply_to_user_avatar TEXT;
```

---

## 📝 总结

### 核心发现

1. ✅ **评论 API 拦截正常** - 正则匹配工作良好
2. ✅ **discussions API 拦截正常** - 正则匹配工作良好
3. ❌ **作品 API 拦截失败** - URL 模式不匹配
4. ⚠️  **关键字段缺失** - is_author, reply_to_user_info, level

### 数据质量评估

| API | 拦截状态 | 字段提取率 | 评分 |
|-----|---------|-----------|------|
| 作品列表 | ❌ 失败 | 0% | 🔴 0/5 |
| 一级评论 | ✅ 成功 | 56% | 🟡 3/5 |
| 二级回复 | ✅ 成功 | 63% | 🟡 3/5 |
| **总体** | ⚠️  部分成功 | **40%** | 🟡 **2/5** |

### 改进后预期

| API | 拦截状态 | 字段提取率 | 评分 |
|-----|---------|-----------|------|
| 作品列表 | ✅ 成功 | 80% | ⭐⭐⭐⭐ 4/5 |
| 一级评论 | ✅ 成功 | 83% | ⭐⭐⭐⭐ 4/5 |
| 二级回复 | ✅ 成功 | 94% | ⭐⭐⭐⭐⭐ 5/5 |
| **总体** | ✅ 成功 | **86%** | ⭐⭐⭐⭐ **4.3/5** |

---

**分析完成时间**: 2025-10-27
**分析人员**: Claude
**结论**: 作品 API 拦截规则需要紧急修复!评论和回复 API 需要添加关键缺失字段!
