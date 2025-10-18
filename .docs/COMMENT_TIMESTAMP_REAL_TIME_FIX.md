# 评论时间戳修复方案

## 问题描述

在之前的实现中，Worker 获取的评论时间使用的是**抓取评论时的系统时间**，而不是**抖音平台上评论的真实发布时间**。

### 症状
- 数据库中的 `created_at` 字段显示的是爬虫运行的时间，而非评论实际发布的时间
- 评论时间与用户在抖音平台看到的发布时间不一致
- 历史评论被标记为"新评论"（is_new=true）

---

## 根本原因分析

### 之前的问题代码流程

```
Douyin API 返回 create_time ✓
    ↓
crawlComments() 提取 create_time ✓ (line 851: parseInt(c.create_time))
    ↓
评论对象中包含 create_time ✓
    ↓
❌ 评论解析器强制覆盖 created_at (line 58: random offset 5-60分钟前)
    ↓
❌ 真实时间被虚假随机时间替代
    ↓
数据库存储虚假时间 ✗
```

### 关键问题位置

**文件**: `packages/worker/src/parsers/comment-parser.js`

**原始代码** (第55-58行):
```javascript
// 强制使用随机时间偏移：5-60分钟前
// 原因：确保 created_at 不同于 detected_at，模拟从平台提取的相对时间
const minutesAgo = Math.floor(Math.random() * 55) + 5;  // 5-60 分钟
const createdAt = detectedAt - (minutesAgo * 60);
```

这段代码虽然有注释说是"模拟"，但实际上直接覆盖了 **来自 Douyin API 的真实时间戳**。

---

## 修复方案

### 修复内容

**修改文件**: `packages/worker/src/parsers/comment-parser.js`

#### 之前
```javascript
parseComment(item) {
  // ...
  const detectedAt = item.detected_at || Math.floor(Date.now() / 1000);

  // 强制使用随机时间偏移：5-60分钟前
  const minutesAgo = Math.floor(Math.random() * 55) + 5;
  const createdAt = detectedAt - (minutesAgo * 60);

  return {
    // ...
    detected_at: detectedAt,
    created_at: createdAt,  // ❌ 虚假时间
  };
}
```

#### 修复后
```javascript
parseComment(item) {
  // ...
  const detectedAt = item.detected_at || Math.floor(Date.now() / 1000);

  // 优先级：create_time（来自平台API） > item.time（相对时间） > detectedAt（默认值）
  let createdAt = detectedAt;

  if (item.create_time) {
    // 使用平台直接提供的时间戳（最准确）
    createdAt = item.create_time;
    logger.debug(`Comment: using platform create_time=${createdAt}`);
  } else if (item.time) {
    // 如果有相对时间字符串，使用时间解析器转换
    const parsedTime = parsePlatformTime(item.time);
    if (parsedTime && parsedTime > 0) {
      createdAt = parsedTime;
    }
  }

  return {
    // ...
    detected_at: detectedAt,
    created_at: createdAt,  // ✓ 平台真实时间
  };
}
```

### 修复流程

现在的数据流：

```
Douyin API 返回 create_time ✓
    ↓
crawlComments() 提取 create_time ✓ (line 851)
    ↓
评论对象中包含 create_time ✓
    ↓
✓ 评论解析器保留 create_time 字段
    ↓
✓ 设置 created_at = item.create_time
    ↓
主服务器插入 (comments-dao.js:337)
  优先级: created_at > create_time > 当前时间
    ↓
✓ 数据库存储真实时间
```

---

## 技术细节

### 时间字段说明

#### 1. `detected_at` - 爬虫检测时间
- **含义**: Worker 抓取评论的时间
- **值**: 当前系统时间戳（秒）
- **用途**: 排序、查询最近的爬虫运行
- **来源**: Worker 运行时 `Math.floor(Date.now() / 1000)`

#### 2. `created_at` - 评论发布时间
- **含义**: 评论在抖音平台的真实发布时间
- **值**: Douyin API 返回的 `create_time`（秒级 Unix 时间戳）
- **用途**: 显示评论时间、计算 `is_new` 标志
- **来源**:
  - 优先：`item.create_time`（来自 Douyin API）
  - 备选：解析 `item.time`（相对时间字符串）
  - 最后：`detected_at`（当无时间信息时）

### 数据流链

#### Worker 端 (platform.js:845-856)
```javascript
comments.push({
  platform_comment_id: c.comment_id,
  content: c.text,
  author_name: c.user_info?.screen_name,
  create_time: parseInt(c.create_time),  // ✓ 平台API时间戳
  detected_at: Math.floor(Date.now() / 1000),  // 爬虫检测时间
  // ... 其他字段
});
```

#### Parser 端 (comment-parser.js:59-74)
```javascript
if (item.create_time) {
  createdAt = item.create_time;  // ✓ 使用平台时间
}
```

#### Master 端 (comments-dao.js:337)
```javascript
created_at: Number(comment.created_at || comment.create_time)
           || Math.floor(Date.now() / 1000)
```

#### 数据库 (schema.sql:33-48)
```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,  -- ✓ 平台发布时间
  detected_at INTEGER NOT NULL,  -- 爬虫检测时间
  ...
);
```

---

## 验证方法

### 1. 检查日志
修复后的日志应该显示：
```
Comment: using platform create_time=1726667890, detected_at=1726667920
```

而不是：
```
Comment: using random offset (23 mins ago), created_at=1726666500, detected_at=1726667920
```

### 2. 查看数据库
```sql
-- 查询最近的评论
SELECT
  id,
  content,
  created_at,
  detected_at,
  datetime(created_at, 'unixepoch', 'localtime') as publish_time,
  datetime(detected_at, 'unixepoch', 'localtime') as crawl_time
FROM comments
ORDER BY created_at DESC
LIMIT 5;

-- 应该看到 created_at < detected_at（评论发布在抓取之前）
-- 而不是 created_at ≈ detected_at - random_minutes
```

### 3. 验证 is_new 标志
```sql
-- 检查 is_new 标志是否正确
SELECT
  id,
  content,
  created_at,
  is_new,
  (julianday('now') - julianday(datetime(created_at, 'unixepoch'))) * 24 as hours_old
FROM comments
WHERE is_new = 1
LIMIT 10;

-- is_new=1 的评论应该 < 24 小时老
-- is_new=0 的评论应该 >= 24 小时老
```

---

## 影响范围

### 受影响的组件

1. **评论解析** (comment-parser.js)
   - 移除虚假时间覆盖逻辑
   - 实现正确的时间优先级

2. **直接消息处理** (类似逻辑已正确)
   - 代码已使用 `create_time` (line 1059)
   - 无需修改

3. **数据库** (已兼容)
   - 无需修改 schema
   - 仅存储数据改变

4. **UI 显示** (自动受益)
   - 将显示正确的评论发布时间

### 向后兼容性

✓ 完全向后兼容
- 新数据使用正确的时间
- 旧数据保持不变
- 代码优雅降级（无时间时使用 detected_at）

---

## 相关时间处理工具

### 时间解析工具

**文件**: `packages/shared/utils/time-parser.js`

提供的函数：
```javascript
// 解析相对时间字符串
parseRelativeTime(text)  // "刚刚", "2小时前", "3天前" -> Unix 时间戳

// 包装函数（带回退）
parsePlatformTime(timeString)  // 失败时返回 null
```

在新的修复中，这个工具作为备选方案：
```javascript
else if (item.time) {
  const parsedTime = parsePlatformTime(item.time);  // 使用备选解析
}
```

---

## 性能考虑

- **性能影响**: 无（移除了随机数生成，简化了逻辑）
- **数据库**: 无额外查询
- **内存**: 无额外占用

---

## 测试建议

### 1. 单元测试
```javascript
describe('CommentParser', () => {
  it('should use platform create_time when available', () => {
    const parser = new CommentParser();
    const comment = parser.parseComment({
      content: 'Test',
      create_time: 1726667890,
      detected_at: 1726667920
    });
    expect(comment.created_at).toBe(1726667890);
  });
});
```

### 2. 集成测试
运行完整的爬虫 -> 解析 -> 存储流程，验证时间戳

### 3. 手动测试
```bash
# 启动系统
npm run dev

# 监控日志
tail -f packages/worker/logs/worker.log | grep "Comment:"

# 抓取评论后检查数据库
```

---

## 总结

| 方面 | 之前 | 修复后 |
|------|------|--------|
| 评论时间来源 | 虚假随机时间 | 抖音平台 API |
| created_at 含义 | 抓取时间 ± 随机偏移 | 评论真实发布时间 |
| 时间精度 | ❌ 秒级随机 | ✓ 秒级精确 |
| is_new 计算 | ❌ 基于虚假时间 | ✓ 基于真实时间 |
| 数据准确性 | ❌ 低 | ✓ 高 |
| 用户体验 | ❌ 时间不准确 | ✓ 时间准确 |

---

## 后续改进方向

1. **毫秒级精度**: 如果 Douyin API 支持，可提升到毫秒级
2. **时区处理**: 确保客户端正确显示本地时区时间
3. **时间验证**: 添加时间合理性检查（不超过当前时间、不超过账户创建时间等）
4. **缓存优化**: 基于正确的时间进行评论去重和增量爬取

---

## 修改日期

- **修改人**: Claude Code
- **修改日期**: 2025-10-18
- **修改文件**: `packages/worker/src/parsers/comment-parser.js`
- **修改行数**: 44-90（parseComment 方法）
