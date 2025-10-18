# 评论时间戳快速修复参考

## 问题
评论显示的是 Worker 抓取时间，而不是抖音平台上的真实发布时间。

## 解决方案

### 修改文件
`packages/worker/src/parsers/comment-parser.js`

### 关键改动
**第 55-58 行**: 移除虚假时间覆盖

```diff
- // 强制使用随机时间偏移：5-60分钟前
- const minutesAgo = Math.floor(Math.random() * 55) + 5;
- const createdAt = detectedAt - (minutesAgo * 60);

+ // 使用平台提供的真实时间
+ let createdAt = detectedAt;
+ if (item.create_time) {
+   createdAt = item.create_time;  // ✓ 来自 Douyin API
+ }
```

## 验证

### 数据库查询
```sql
SELECT id, content,
       datetime(created_at, 'unixepoch', 'localtime') as publish_time,
       datetime(detected_at, 'unixepoch', 'localtime') as crawl_time
FROM comments LIMIT 5;
```

**期望**: `publish_time` 早于 `crawl_time`（评论发布在抓取之前）

### 日志检查
```
Comment: using platform create_time=1726667890, detected_at=1726667920
```

## 时间字段说明

| 字段 | 含义 | 来源 |
|------|------|------|
| `created_at` | 评论在平台的发布时间 | Douyin API: `create_time` |
| `detected_at` | Worker 抓取评论的时间 | 当前系统时间 |

## 代码流程

```
Douyin API create_time ✓
    ↓
platform.js (line 851) 提取
    ↓
comment-parser.js (line 59-62) 保留
    ↓
comments-dao.js (line 337) 入库
    ↓
数据库 created_at 字段 ✓ 真实时间
```

## 影响

- ✓ 评论显示时间准确
- ✓ `is_new` 标志计算正确
- ✓ 向后兼容
- ✓ 无性能影响

---

**修改完成**: 2025-10-18
**文件**: [COMMENT_TIMESTAMP_REAL_TIME_FIX.md](./COMMENT_TIMESTAMP_REAL_TIME_FIX.md) (详细文档)
