# 数据 ID 映射关系问题分析报告

**日期**: 2025-10-30
**状态**: 🔴 待修复 - ID 格式不匹配

---

## 问题确认

### 最新验证结果 (2025-10-30 13:03)

```
✅ 评论收集: 2 条
✅ 作品收集: 5 个
✅ 会话收集: 29 个
✅ 私信收集: 6 条

❌ 孤儿评论: 2 条（无法匹配到作品）
❌ 孤儿私信: 6 条（无法匹配到会话）
```

### ID 格式对比

**评论数据 - contentId (纯数字)**:
```json
{
  "commentId": "7566864433692459826",
  "contentId": "7566840303458569498",
  "content": "在哪里"
}
```

**作品数据 - contentId (Base64)**:
```json
{
  "contentId": "@jfFo679LREb/sc9S5rruuNV5pyiWbi33...",
  "title": "大白们晨会交班...",
  "commentCount": 3
}
```

**结论**: ✅ 确认作品 API 返回的是 Base64 格式的 `item_id`，没有返回纯数字的 `aweme_id`

---

## 根本原因

### 抖音 API 的两种 ID 系统

1. **内部 ID (`aweme_id`)**: 纯数字，用于内部引用
   - 评论 API 使用此 ID 关联作品
   - 回复 API 使用此 ID 关联作品
   - 示例: `7566840303458569498`

2. **公开 ID (`sec_item_id` / `item_id`)**: Base64 编码，用于分享链接
   - 作品列表 API 返回此 ID
   - 用于生成分享链接
   - 示例: `@jfFo679LREb/sc9S5rruuNV5pyiWbi33...`

### 数据收集逻辑

**当前代码** (`douyin-data-manager.js:134`):
```javascript
contentId: String(douyinData.aweme_id || douyinData.item_id)
```

**实际情况**:
- 作品 API 只返回 `item_id` (Base64)
- 没有 `aweme_id` 字段
- 评论 API 返回 `aweme_id` (纯数字)

**导致**:
- 作品使用 Base64 ID
- 评论使用纯数字 ID
- 两者无法匹配！

---

## 解决方案

### 方案 A: 从作品详情 API 获取 aweme_id ⭐

**思路**: 作品详情 API 可能同时返回两种 ID

**实现步骤**:
1. 检查作品详情 API (`/aweme/v1/creator/aweme/detail/`) 响应
2. 确认是否包含 `aweme_id` 字段
3. 修改爬虫逻辑,收集作品列表后调用详情 API
4. 使用 `aweme_id` 作为主键

**优点**:
- ✅ 获取真实的数字 ID
- ✅ 与评论可以匹配
- ✅ 无需修改数据库

**缺点**:
- ❌ 增加 API 调用次数
- ❌ 爬虫速度变慢

### 方案 B: 从分享链接解析 aweme_id ⭐⭐

**思路**: 作品分享链接中包含 `aweme_id`

**示例链接**:
```
https://www.douyin.com/video/7566840303458569498
                            ^^^^^^^^^^^^^^^^^^
                            这就是 aweme_id
```

**实现步骤**:
1. 从作品数据的 `share_url` 字段提取 `aweme_id`
2. 使用正则表达式: `/video/(\d+)`
3. 将提取的 ID 作为 `contentId`

**代码修改** (`douyin-data-manager.js`):
```javascript
mapContentData(douyinData) {
  let awemeId = douyinData.aweme_id;
  
  // 如果没有 aweme_id，从分享链接提取
  if (!awemeId && douyinData.share_url) {
    const match = douyinData.share_url.match(/\/video\/(\d+)/);
    if (match) {
      awemeId = match[1];
    }
  }
  
  // 最终使用 awemeId 或 item_id
  const contentId = String(awemeId || douyinData.item_id);
  
  return {
    contentId,
    // ...
  };
}
```

**优点**:
- ✅ 无需额外 API 调用
- ✅ 速度快
- ✅ 100% 可靠（链接中一定有 ID）

**缺点**:
- ⚠️ 依赖于链接格式不变

### 方案 C: 在数据库中建立 ID 映射表

**思路**: 同时保存两种 ID,建立映射关系

**实现**:
1. 修改 Content 模型,添加 `awemeId` 和 `secItemId` 字段
2. 作品使用 `secItemId` 作为主键
3. 评论存储时通过映射表找到对应的 `secItemId`

**优点**:
- ✅ 完整保留两种 ID
- ✅ 支持双向查询

**缺点**:
- ❌ 需要修改数据库结构
- ❌ 代码改动较大
- ❌ 依然需要获取 aweme_id

---

## 推荐方案: 方案 B - 从分享链接解析

### 实施步骤

#### 1. 修改数据映射代码

**文件**: `packages/worker/src/platforms/douyin/douyin-data-manager.js`

**位置**: 第119-165行 `mapContentData` 方法

```javascript
mapContentData(douyinData) {
  // 🔍 优先使用 aweme_id,如果没有则从分享链接提取
  let awemeId = douyinData.aweme_id || douyinData.item_id_plain;
  
  if (!awemeId && douyinData.share_url) {
    const match = douyinData.share_url.match(/\/video\/(\d+)/);
    if (match) {
      awemeId = match[1];
      this.logger.info(`✅ 从分享链接提取 aweme_id: ${awemeId}`);
    } else {
      this.logger.warn(`⚠️  无法从分享链接提取 aweme_id: ${douyinData.share_url}`);
    }
  }
  
  const secItemId = douyinData.sec_item_id || douyinData.item_id;
  
  // 调试日志
  this.logger.debug(`📝 [mapContentData] ID 字段:`, {
    aweme_id: awemeId,
    sec_item_id: secItemId?.substring(0, 40) + '...',
    share_url: douyinData.share_url
  });
  
  // 优先使用纯数字 ID（与评论匹配）
  const contentId = String(awemeId || secItemId);

  return {
    contentId,
    type: this.mapContentType(douyinData),
    title: douyinData.desc || douyinData.title || '',
    // ... 其他字段
  };
}
```

#### 2. 验证修复效果

```bash
# 1. 重启服务
cd packages/master && npm start

# 2. 等待爬虫运行

# 3. 导出数据验证
node tests/导出数据快照.js

# 4. 检查验证报告
cat packages/worker/data/snapshots/validation-report-*.txt
```

**预期结果**:
```
2. 作品 ↔ 评论
   ✓ 有评论的作品: 2 个
   ✓ 孤儿评论: 0 条 ✅

数据完整性
✅ 所有评论都能匹配到作品
```

---

## 会话和私信的 ID 问题

同样的问题也出现在会话和私信中:

- **私信 conversationId**: 某种格式
- **会话 conversationId**: 另一种格式

**需要同样的解决方案**:
1. 检查私信和会话 API 的响应
2. 找到 ID 映射关系
3. 统一使用同一种 ID 格式

---

## 测试数据

### 评论示例
```json
{
  "commentId": "7566864433692459826",
  "contentId": "7566840303458569498",  // 纯数字
  "content": "在哪里"
}
```

### 作品示例
```json
{
  "contentId": "@jfFo679LREb...",  // Base64
  "commentCount": 3,
  "title": "大白们晨会交班...",
  "share_url": "https://www.douyin.com/video/7566840303458569498"
}
```

如果修复成功,作品的 `contentId` 应该变为: `"7566840303458569498"`

---

## 相关文档

- [301重定向问题最终修复报告](./301重定向问题最终修复报告.md)
- [评论API问题最终分析报告](./评论API问题最终分析报告.md)
- [DataManager数据快照功能测试报告](./DataManager数据快照功能测试报告.md)

---

**报告时间**: 2025-10-30 13:10
**系统版本**: HisCRM-IM v1.0
**平台**: 抖音 (Douyin)
**下一步**: 实施方案 B - 从分享链接提取 aweme_id
