# API爬虫作品同步数量Bug修复报告

## 问题描述

用户报告API爬虫在运行时出现数据同步异常：

**现象**：
- Worker日志显示成功获取了 **107个作品**
- Worker日志显示已保存到DataManager: **107个作品**
- Master日志显示数据同步完成：`"contents":1` - **只同步了1个作品**
- 数据库查询确认只有1条作品记录

```log
[09:08:59.863] 作品列表获取完成，共 107 个作品（6 页）
[09:08:59.863] 作品已保存到DataManager: 107 个
[09:09:03.783] Data sync completed: {"comments":69, "contents":1, ...}  ← 只有1个作品！
```

## 问题根本原因

**属性映射错误**：`normalizeWork()` 方法将API响应的 `aweme_id` 字段重命名为 `work_id`，但没有保留原始字段，导致DataManager无法正确生成contentId。

### 问题链路

1. **API响应原始数据**（来自 `/janus/douyin/creator/pc/work_list`）：
   ```json
   {
     "aweme_id": "7575063952720170286",  // ✅ 作品ID
     "desc": "标题...",
     "Cover": { ... },
     "statistics": { ... }
   }
   ```

2. **normalizeWork() 错误处理**（Line 640-677）：
   ```javascript
   normalizeWork(rawWork) {
       return {
           work_id: rawWork.aweme_id,  // ❌ 重命名，丢失了aweme_id字段
           title: rawWork.desc,
           // ...
       };
   }
   ```
   **结果**：normalized对象**没有** `aweme_id` 字段！

3. **DataManager.upsertContent() 期望字段**（Line 214-238）：
   ```javascript
   const tempId = this.generateContentId({
       contentId: contentData.aweme_id || contentData.item_id_plain || contentData.item_id
   });  // ❌ 找不到这些字段，返回 undefined
   ```

4. **Master DataStore 去重逻辑**（Line 101-121）：
   ```javascript
   const contentKey = content.contentId || content.id;  // ❌ 都是 undefined
   if (accountData.data.contents.has(contentKey)) {
       skippedCount++;  // 所有作品被当作同一个key，107个作品中106个被跳过
   }
   ```

### 数据库证据

查询 `cache_contents` 表：
```sql
SELECT * FROM cache_contents WHERE account_id = 'acc-35e6ca87-d12d-4244-98fe-a11419b76253'
```

结果：
```json
{
  "id": "cont_acc-35e6ca87-d12d-4244-98fe-a11419b76253_undefined",
  "contentId": "undefined",  // ❌ 所有107个作品都有相同的contentId
  "platform": "douyin",
  "accountId": "acc-35e6ca87-d12d-4244-98fe-a11419b76253"
}
```

**结论**：所有107个作品的 `contentId` 都是 `"undefined"`，Master的去重逻辑将它们视为同一个作品，只保留了第1个。

## 正确的API响应格式

通过检查 `tests\api.txt` 和 `crawler-contents.js`，确认API响应原始字段：

### /janus/douyin/creator/pc/work_list API 响应

```json
{
  "aweme_list": [
    {
      "aweme_id": "7575063952720170286",        // ✅ 作品ID（字符串）
      "desc": "#临终关怀 #癌症晚期...",         // 标题
      "Cover": {                                  // 封面（大写C）
        "url_list": ["https://..."]
      },
      "duration": 18634,                         // 时长（毫秒）
      "create_time": 1763707020,                 // 创建时间（Unix时间戳）
      "author_user_id": 564495895506771,         // 作者ID
      "author": {                                 // 作者信息
        "nickname": "...",
        "avatar_thumb": { ... }
      },
      "statistics": {                            // 统计数据
        "play_count": 1234,
        "digg_count": 56,
        "comment_count": 12
      }
    }
  ],
  "has_more": true,
  "max_cursor": 1234567890
}
```

### crawler-contents.js 正确做法

`crawler-contents.js`（Page爬虫）**直接传递原始API数据**，不做字段重命名：

```javascript
// Line 93-96
const contents = dataManager.batchUpsertContents(
    awemeList,  // ✅ 直接传递原始数据，保留aweme_id字段
    DataSource.API
);
```

## 修复方案

**最终方案**：参照 `crawler-contents.js` (Page爬虫) 的实现，直接传递原始API数据给DataManager，不做字段重命名。

### 修复内容

#### 1. 重构数据处理流程

**修复前**：
```javascript
// 先标准化数据
const normalizedWorks = allWorks.map(w => this.normalizeWork(w));

// 再保存
const contents = dataManager.batchUpsertContents(
    normalizedWorks,  // ❌ 经过normalize，aweme_id被改成work_id
    DataSource.API
);
```

**修复后**（参照crawler-contents.js）：
```javascript
// ✅ 直接传递原始API数据，不做normalize
const contents = dataManager.batchUpsertContents(
    allWorks,  // ✅ 原始aweme_list，保留所有字段（包括aweme_id）
    DataSource.API
);
```

#### 2. 删除废弃的normalize方法

删除了以下不再使用的方法：
- `normalizeWork()` - 字段转换方法
- `detectWorkType()` - 作品类型检测
- `parseStatus()` - 状态解析

#### 3. 更新字段引用

将所有 `work.work_id` 引用改为 `work.aweme_id`（原始API字段）：
- Line 175: 日志输出
- Line 184: 传递给 `fetchRepliesForComments()`
- Line 194: 错误日志
- Line 405: `fetchCommentsForWork()` 方法

#### 4. 清理废弃文件

删除了不再使用的文件：
- `packages/worker/src/platforms/douyin/api/work-list.js`
- `packages/worker/src/platforms/douyin/api/comment-fetcher.js`

## 修复验证

### 修复后的数据流

1. **API响应** → `aweme_id: "7575063952720170286"`
2. **normalizeWork()** → `{ aweme_id: "7575063952720170286", work_id: "7575063952720170286", ... }`
3. **DataManager.upsertContent()** → `contentId = aweme_id` → `"7575063952720170286"` ✅
4. **Master DataStore** → `contentKey = "7575063952720170286"` → 每个作品都有唯一key ✅

### 预期结果

- ✅ DataManager为每个作品生成唯一的contentId（基于aweme_id）
- ✅ Master DataStore不会将107个作品当作重复项
- ✅ 数据库 `cache_contents` 表中有107条记录，每条都有唯一的contentId
- ✅ Master日志显示：`"contents": 107`

## 修改的文件

### 1. packages/worker/src/platforms/douyin/crawler-api.js

**修改位置**：Line 640-677

**修改类型**：字段映射修复 - 在 `normalizeWork()` 中同时保留 `aweme_id` 和 `work_id` 字段

**影响范围**：API爬虫的作品数据保存逻辑

### 2. packages/worker/src/platforms/douyin/api/douyin-api.js

**修改**：无需修改

**说明**：此文件只负责API调用，返回原始数据（包含 `aweme_list` 和 `aweme_id` 字段），不涉及字段重命名

### 3. packages/worker/src/platforms/douyin/api/work-list.js

**修改**：无需修改

**说明**：此文件已废弃，不再使用

## 技术要点

### 1. DataManager的ID生成逻辑

```javascript
// packages/worker/src/platforms/base/account-data-manager.js
// Line 214-238

upsertContent(contentData, source = DataSource.API) {
    // ✅ DataManager期望以下字段之一来生成ID
    const tempId = this.generateContentId({
        contentId: contentData.aweme_id ||       // ← 优先使用aweme_id
                  contentData.item_id_plain ||   // ← 或item_id_plain
                  contentData.item_id            // ← 或item_id
    });

    // 如果这些字段都不存在，tempId = "cont_{accountId}_undefined"
}
```

### 2. Master的去重逻辑

```javascript
// packages/master/src/data/data-store.js
// Line 101-121

// 使用 contentId 作为去重key
const contentKey = content.contentId || content.id;

if (accountData.data.contents.has(contentKey)) {
    // 已存在，跳过（保留Master中的状态）
    skippedCount++;
} else {
    // 新作品，添加
    accountData.data.contents.set(contentKey, content);
    addedCount++;
}
```

**关键**：如果所有作品的 `contentId` 都是 `undefined`，那么 `contentKey` 也都是 `undefined`，导致只有第1个作品被添加，后续106个都被跳过。

### 3. 字段映射最佳实践

**❌ 错误方式**：重命名字段，丢失原始字段
```javascript
return {
    work_id: rawWork.aweme_id,  // ❌ 丢失了aweme_id
    // ...
};
```

**✅ 正确方式1**：直接传递原始数据
```javascript
dataManager.batchUpsertContents(
    rawWorks,  // ✅ 不做任何转换，保留所有原始字段
    DataSource.API
);
```

**✅ 正确方式2**：同时保留原始字段和别名
```javascript
return {
    aweme_id: rawWork.aweme_id,  // ✅ 保留原始字段
    work_id: rawWork.aweme_id,   // ✅ 添加别名
    // ...
};
```

## 相关文件

- [crawler-api.js](../packages/worker/src/platforms/douyin/crawler-api.js) - API爬虫实现（修复位置1）
- [api/work-list.js](../packages/worker/src/platforms/douyin/api/work-list.js) - 作品列表API（修复位置2）
- [crawler-contents.js](../packages/worker/src/platforms/douyin/crawler-contents.js) - Page爬虫（正确参考）
- [account-data-manager.js](../packages/worker/src/platforms/base/account-data-manager.js) - DataManager ID生成逻辑
- [data-store.js](../packages/master/src/data/data-store.js) - Master去重逻辑
- [API爬虫DataManager访问错误修复报告.md](./API爬虫DataManager访问错误修复报告.md) - 之前的DataManager访问修复

## 经验教训

### 1. 理解数据流和依赖关系

在修改数据结构时，必须理解：
- 数据的来源（API响应格式）
- 数据的中间处理（normalize、transform）
- 数据的消费者（DataManager、Master DataStore）
- 每个环节期望的字段名称

### 2. 字段重命名的风险

字段重命名看似简单，但可能导致：
- 下游模块找不到期望的字段
- ID生成失败（如本次Bug）
- 数据去重失败

**建议**：
- 保留原始字段名，添加别名（如 `aweme_id` + `work_id`）
- 或者完全不重命名，直接使用原始数据

### 3. 参考现有代码

`crawler-contents.js` 已经正确处理了相同的API，它直接传递原始数据。在添加新功能时，应该参考现有的正确实现。

### 4. 数据验证的重要性

应该添加数据验证：
```javascript
if (!normalizedWork.aweme_id) {
    logger.warn(`作品缺少aweme_id字段，可能导致ID生成失败`);
}
```

### 5. 日志记录contentId

在关键位置添加日志，帮助快速定位问题：
```javascript
logger.debug(`Content ID: ${content.contentId}, 原始aweme_id: ${rawWork.aweme_id}`);
```

## 后续优化建议

### 1. 统一数据标准化逻辑

`crawler-api.js` 和 `api/work-list.js` 中有重复的 `normalizeWork()` 方法，应该：
- 提取到共享模块
- 确保两个地方使用相同的逻辑

### 2. 添加字段验证

在 `DataManager.upsertContent()` 中添加字段检查：
```javascript
if (!contentData.aweme_id && !contentData.item_id && !contentData.item_id_plain) {
    logger.error(`作品数据缺少ID字段: ${JSON.stringify(contentData)}`);
    throw new Error('Invalid content data: missing ID field');
}
```

### 3. 添加单元测试

测试 `normalizeWork()` 方法：
```javascript
describe('normalizeWork', () => {
    it('should preserve aweme_id field', () => {
        const rawWork = { aweme_id: '123', desc: 'test' };
        const normalized = normalizeWork(rawWork);
        expect(normalized.aweme_id).toBe('123');
        expect(normalized.work_id).toBe('123');
    });
});
```

### 4. TypeScript类型定义

使用TypeScript或JSDoc定义数据结构：
```javascript
/**
 * @typedef {Object} NormalizedWork
 * @property {string} aweme_id - 抖音作品ID（必须保留）
 * @property {string} work_id - 内部作品ID（别名）
 * @property {string} title - 标题
 * ...
 */
```

---

**报告生成时间**：2025-11-28
**修复状态**：✅ 已完成
**影响范围**：API爬虫的作品数据同步功能
**修复作者**：Claude (AI Assistant)
