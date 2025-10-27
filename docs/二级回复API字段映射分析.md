# 二级回复 (discussions) API 字段映射详细分析

**API 端点**: `/aweme/v1/creator/comment/reply/list/`
**用途**: 获取某条一级评论下的所有回复 (二级评论)
**分析日期**: 2025-10-27

---

## API 响应完整结构

```json
{
    "comment_info_list": [
        {
            "comment_id": "@j/du7rRFQE76t8pb8rzuuMx5qi+SYCr+K6slPaJuc8hgrMM=",
            "create_time": "1761313593",
            "digg_count": "0",
            "followed": false,
            "following": false,
            "is_author": true,
            "level": 2,
            "reply_count": "0",
            "reply_to_user_info": {
                "avatar_url": "",
                "screen_name": "",
                "user_id": "@j/du7rRFQE76t8pb8rvZjMCAoIyKkYvk3fauc8hgrMM="
            },
            "status": 1,
            "text": "谢谢你",
            "user_bury": false,
            "user_digg": false,
            "user_info": {
                "avatar_url": "https://p3.douyinpic.com/aweme/100x100/fa88000ec26f8c484cde.jpeg?from=2956013662",
                "screen_name": "苏苏",
                "user_id": "@j/du7rRFQE76t8pb8rrruMp8qiiQZS/xL5oaCJNev56KsZmx+8RYOKiR6pIzTNZU"
            }
        },
        {
            "comment_id": "@j/du7rRFQE76t8pb8rzuuMx5qyyUZyz0J6kkO6FtjKthkia+W5A7RJEoPQpq6PZlcOxAn2u2+vqnI/sB00gffw==",
            "create_time": "1761315490",
            "digg_count": "0",
            "followed": false,
            "following": false,
            "is_author": true,
            "level": 2,
            "reply_count": "0",
            "reply_to_user_info": {
                "avatar_url": "https://p3.douyinpic.com/aweme/100x100/fa88000ec26f8c484cde.jpeg?from=2956013662",
                "screen_name": "苏苏",
                "user_id": "@j/du7rRFQE76t8pb8rrruMp8qiiQZS/xL5oaCJNev56KsZmx+8RYOKiR6pIzTNZU"
            },
            "status": 1,
            "text": "[捂脸]",
            "user_bury": false,
            "user_digg": false,
            "user_info": {
                "avatar_url": "https://p3.douyinpic.com/aweme/100x100/fa88000ec26f8c484cde.jpeg?from=2956013662",
                "screen_name": "苏苏",
                "user_id": "@j/du7rRFQE76t8pb8rrruMp8qiiQZS/xL5oaCJNev56KsZmx+8RYOKiR6pIzTNZU"
            }
        },
        {
            "comment_id": "@j/du7rRFQE76t8pb8rzuuMx5qyyYZyjwK6QoN61ujqlhkia+W5A7RJEoPQpq6PZlueKvqso1XycKiLDHo5M+Og==",
            "create_time": "1761315581",
            "digg_count": "0",
            "followed": false,
            "following": false,
            "is_author": true,
            "level": 2,
            "reply_count": "0",
            "reply_to_user_info": {
                "avatar_url": "https://p3.douyinpic.com/aweme/100x100/fa88000ec26f8c484cde.jpeg?from=2956013662",
                "screen_name": "苏苏",
                "user_id": "@j/du7rRFQE76t8pb8rrruMp8qiiQZS/xL5oaCJNev56KsZmx+8RYOKiR6pIzTNZU"
            },
            "status": 1,
            "text": "[泣不成声][泣不成声]",
            "user_bury": false,
            "user_digg": false,
            "user_info": {
                "avatar_url": "https://p3.douyinpic.com/aweme/100x100/fa88000ec26f8c484cde.jpeg?from=2956013662",
                "screen_name": "苏苏",
                "user_id": "@j/du7rRFQE76t8pb8rrruMp8qiiQZS/xL5oaCJNev56KsZmx+8RYOKiR6pIzTNZU"
            }
        }
    ],
    "cursor": 3,
    "extra": {
        "now": 1761542496000
    },
    "has_more": false,
    "has_vcd_filter": false,
    "status_code": 0,
    "status_msg": "",
    "total_count": 3
}
```

---

## 当前代码的字段映射 (crawl-comments.js:636-656)

```javascript
replies.forEach((reply) => {
  // 检查是否为毫秒级时间戳并转换
  let createTimeSeconds = parseInt(reply.create_time || reply.created_at);
  if (createTimeSeconds > 9999999999) {
    createTimeSeconds = Math.floor(createTimeSeconds / 1000);
  }

  discussions.push({
    platform_discussion_id: reply.comment_id,      // ✅ 已映射
    parent_comment_id: parentCommentId,            // ✅ 已映射
    work_id: reply.aweme_id || null,              // ⚠️  API中无此字段
    content: reply.text || reply.content,          // ✅ 已映射
    author_name: reply.user_info?.screen_name,    // ✅ 已映射
    author_id: reply.user_info?.user_id,          // ✅ 已映射
    author_avatar: reply.user_info?.avatar_url,   // ✅ 已映射
    create_time: createTimeSeconds,                 // ✅ 已映射
    like_count: parseInt(reply.digg_count) || 0,  // ✅ 已映射
    reply_count: parseInt(reply.reply_count) || 0, // ✅ 已映射
    detected_at: Math.floor(Date.now() / 1000),
  });
});
```

---

## 详细字段对比

### ✅ 已完全映射的字段

| API 字段 | 代码提取 | 存储位置 (discussions表) | 状态 |
|----------|---------|------------------------|------|
| `comment_id` | `reply.comment_id` | `platform_discussion_id` | ✅ 完美 |
| `text` | `reply.text` | `content` | ✅ 完美 |
| `create_time` | `parseInt(reply.create_time)` + 格式转换 | `create_time` | ✅ 完美 |
| `digg_count` | `parseInt(reply.digg_count)` | `like_count` | ✅ 完美 |
| `reply_count` | `parseInt(reply.reply_count)` | `reply_count` | ✅ 完美 |
| `user_info.screen_name` | `reply.user_info?.screen_name` | `author_name` | ✅ 完美 |
| `user_info.user_id` | `reply.user_info?.user_id` | `author_id` | ✅ 完美 |
| `user_info.avatar_url` | `reply.user_info?.avatar_url` | `author_avatar` | ✅ 完美 |

---

### ⚠️  API 提供但未映射的字段

#### 1. 🔴 高优先级 - 强烈建议添加

##### `is_author` (是否为作者本人)

**API 值**: `true` / `false`
**含义**: 该回复是否为作者本人发布
**用途**:
- 区分作者回复和普通用户回复
- 避免回复自己的评论
- 统计作者互动率

**当前状态**: ❌ 未提取,未存储

**建议实现**:
```javascript
discussions.push({
  // ... 现有字段
  is_author: reply.is_author || false,  // ✅ 新增
  // ...
});
```

**数据库**: 需要在 `discussions` 表添加 `is_author BOOLEAN DEFAULT 0` 字段

##### `level` (评论层级)

**API 值**: `2` (二级评论固定为 2)
**含义**: 评论的层级 (1=一级评论, 2=二级回复)
**用途**:
- 明确标识评论层级
- 方便查询和筛选
- 数据统计

**当前状态**: ❌ 未提取,未存储

**建议实现**:
```javascript
discussions.push({
  // ... 现有字段
  level: reply.level || 2,  // ✅ 新增: 固定为2
  // ...
});
```

#### 2. 🟡 中优先级 - 有价值的字段

##### `reply_to_user_info` (被回复用户信息)

**API 结构**:
```json
"reply_to_user_info": {
    "avatar_url": "https://...",
    "screen_name": "苏苏",
    "user_id": "@j/..."
}
```

**含义**: 该回复是回复给谁的 (A 回复 B 的评论)
**用途**:
- 显示完整的回复关系 "A 回复 B: 内容"
- 构建评论树
- 用户关系分析

**当前状态**: ❌ 未提取,未存储

**建议实现**:
```javascript
discussions.push({
  // ... 现有字段
  reply_to_user_id: reply.reply_to_user_info?.user_id || null,         // ✅ 新增
  reply_to_user_name: reply.reply_to_user_info?.screen_name || null,   // ✅ 新增
  reply_to_user_avatar: reply.reply_to_user_info?.avatar_url || null,  // ✅ 新增
  // ...
});
```

**数据库**: 需要添加字段
```sql
ALTER TABLE discussions
  ADD COLUMN reply_to_user_id TEXT,
  ADD COLUMN reply_to_user_name TEXT,
  ADD COLUMN reply_to_user_avatar TEXT;
```

##### `followed` / `following` (用户关系)

**API 值**: `true` / `false`
**含义**:
- `followed`: 该用户是否关注你
- `following`: 你是否关注该用户

**用途**:
- 识别粉丝回复
- 优先处理关注者
- 用户关系分析

**当前状态**: ❌ 未提取,未存储

**建议**: 🤔 根据业务需求决定是否添加

##### `status` (回复状态)

**API 值**: `1` (正常)
**含义**: 回复的状态 (可能: 1=正常, 0=已删除/隐藏)
**用途**:
- 识别已删除的回复
- 数据清洗

**当前状态**: ❌ 未提取,未存储

**建议**: 🤔 可选

#### 3. 🟢 低优先级/不需要

| 字段 | 原因 |
|------|------|
| `user_digg` | 个人行为,不需要 |
| `user_bury` | 个人行为,不需要 |
| `extra.now` | 服务器时间,不需要 |
| `cursor` | 分页已自动处理 |

---

## discussions 表当前 Schema

```sql
CREATE TABLE discussions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT,
  platform_discussion_id TEXT,
  parent_comment_id TEXT NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT,
  author_id TEXT,
  author_avatar TEXT,
  work_id TEXT,
  post_id TEXT,
  post_title TEXT,
  is_read BOOLEAN DEFAULT 0,
  is_new BOOLEAN DEFAULT 1,
  push_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE SET NULL
);
```

**缺少的字段**:
- ❌ `reply_count` - 三级回复数量 (API 已提供)
- ❌ `is_author` - 是否为作者 🔴
- ❌ `level` - 评论层级 🔴
- ❌ `reply_to_user_id` - 被回复用户ID 🟡
- ❌ `reply_to_user_name` - 被回复用户名 🟡
- ❌ `reply_to_user_avatar` - 被回复用户头像 🟡
- ❌ `followed` - 用户是否关注你 🟢
- ❌ `following` - 你是否关注用户 🟢
- ❌ `status` - 回复状态 🟢

---

## 建议的 Schema 更新

### 最小改动 (高优先级字段)

```sql
ALTER TABLE discussions ADD COLUMN is_author BOOLEAN DEFAULT 0;
ALTER TABLE discussions ADD COLUMN level INTEGER DEFAULT 2;
ALTER TABLE discussions ADD COLUMN reply_count INTEGER DEFAULT 0;
```

### 推荐改动 (包括中优先级)

```sql
-- 高优先级
ALTER TABLE discussions ADD COLUMN is_author BOOLEAN DEFAULT 0;
ALTER TABLE discussions ADD COLUMN level INTEGER DEFAULT 2;
ALTER TABLE discussions ADD COLUMN reply_count INTEGER DEFAULT 0;

-- 中优先级 (回复关系)
ALTER TABLE discussions ADD COLUMN reply_to_user_id TEXT;
ALTER TABLE discussions ADD COLUMN reply_to_user_name TEXT;
ALTER TABLE discussions ADD COLUMN reply_to_user_avatar TEXT;
```

### 完整改动 (所有可用字段)

```sql
-- 高优先级
ALTER TABLE discussions ADD COLUMN is_author BOOLEAN DEFAULT 0;
ALTER TABLE discussions ADD COLUMN level INTEGER DEFAULT 2;
ALTER TABLE discussions ADD COLUMN reply_count INTEGER DEFAULT 0;

-- 中优先级
ALTER TABLE discussions ADD COLUMN reply_to_user_id TEXT;
ALTER TABLE discussions ADD COLUMN reply_to_user_name TEXT;
ALTER TABLE discussions ADD COLUMN reply_to_user_avatar TEXT;

-- 低优先级 (用户关系)
ALTER TABLE discussions ADD COLUMN followed BOOLEAN DEFAULT 0;
ALTER TABLE discussions ADD COLUMN following BOOLEAN DEFAULT 0;
ALTER TABLE discussions ADD COLUMN status INTEGER DEFAULT 1;
```

---

## 建议的代码更新

### 最小改动版

```javascript
// crawl-comments.js:643-656
discussions.push({
  platform_discussion_id: reply.comment_id,
  parent_comment_id: parentCommentId,
  work_id: reply.aweme_id || null,
  content: reply.text || reply.content,
  author_name: reply.user_info?.screen_name || '匿名',
  author_id: reply.user_info?.user_id || '',
  author_avatar: reply.user_info?.avatar_url || '',
  create_time: createTimeSeconds,
  like_count: parseInt(reply.digg_count) || 0,
  reply_count: parseInt(reply.reply_count) || 0,  // ✅ 已有
  is_author: reply.is_author || false,             // ✅ 新增
  level: reply.level || 2,                         // ✅ 新增
  detected_at: Math.floor(Date.now() / 1000),
});
```

### 推荐改动版 (包括回复关系)

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

  // 被回复者信息 (新增)
  reply_to_user_id: reply.reply_to_user_info?.user_id || null,         // ✅ 新增
  reply_to_user_name: reply.reply_to_user_info?.screen_name || null,   // ✅ 新增
  reply_to_user_avatar: reply.reply_to_user_info?.avatar_url || null,  // ✅ 新增

  // 统计和状态
  create_time: createTimeSeconds,
  like_count: parseInt(reply.digg_count) || 0,
  reply_count: parseInt(reply.reply_count) || 0,
  is_author: reply.is_author || false,             // ✅ 新增
  level: reply.level || 2,                         // ✅ 新增

  detected_at: Math.floor(Date.now() / 1000),
});
```

---

## 字段利用率统计

### 当前状态

| 分类 | 总字段数 | 已映射 | 未映射 | 利用率 |
|------|---------|--------|--------|--------|
| **基本信息** | 5 | 5 | 0 | **100%** ✅ |
| **回复者信息** | 3 | 3 | 0 | **100%** ✅ |
| **被回复者信息** | 3 | 0 | 3 | **0%** ⚠️  |
| **状态标识** | 3 | 0 | 3 | **0%** ⚠️  |
| **用户关系** | 2 | 0 | 2 | **0%** 🤔 |
| **统计信息** | 2 | 2 | 0 | **100%** ✅ |
| **总计** | 18 | 10 | 8 | **56%** |

### 改进后 (推荐方案)

| 分类 | 总字段数 | 映射 | 利用率 |
|------|---------|------|--------|
| **基本信息** | 5 | 5 | **100%** ✅ |
| **回复者信息** | 3 | 3 | **100%** ✅ |
| **被回复者信息** | 3 | 3 | **100%** ✅ |
| **状态标识** | 3 | 2 | **67%** ✅ |
| **用户关系** | 2 | 0 | **0%** 🤔 |
| **统计信息** | 2 | 2 | **100%** ✅ |
| **总计** | 18 | 15 | **83%** |

---

## 业务价值分析

### `is_author` 字段的重要性

**场景 1**: 避免自动回复自己
```javascript
// 筛选需要回复的评论
const needReply = discussions.filter(d => !d.is_author);
```

**场景 2**: 统计作者互动率
```sql
SELECT
  COUNT(CASE WHEN is_author = 1 THEN 1 END) * 100.0 / COUNT(*) as author_reply_rate
FROM discussions;
```

**场景 3**: 显示标识
```javascript
// 前端显示
{d.is_author && <Badge>作者</Badge>}
```

### `reply_to_user_info` 的重要性

**场景 1**: 完整显示回复关系
```
张三 回复 李四: 我也觉得很好看
```

**场景 2**: 构建评论树
```
一级评论 (李四): 这个视频很棒
  └─ 二级回复 (张三 → 李四): 我也觉得
  └─ 二级回复 (王五 → 李四): 同感
  └─ 二级回复 (张三 → 王五): 对的
```

**场景 3**: 用户互动分析
- 谁最常回复谁
- 用户互动网络图

### `level` 字段的重要性

**场景**: 分层查询和显示
```sql
-- 只查询一级评论
SELECT * FROM comments;

-- 只查询二级回复
SELECT * FROM discussions WHERE level = 2;

-- 未来如果有三级回复
SELECT * FROM discussions WHERE level = 3;
```

---

## 实施建议

### 阶段 1: 最小改动 (立即实施) 🔴

**改动内容**:
1. 添加 3 个字段: `is_author`, `level`, `reply_count` (实际上 `reply_count` 代码已有)
2. 更新代码提取这 2 个字段

**工作量**: 1-2 小时
**风险**: 极低
**收益**: 高 (避免回复自己,明确层级)

### 阶段 2: 推荐改动 (1周内实施) 🟡

**改动内容**:
1. 阶段1 的所有内容
2. 添加 `reply_to_user_*` 3 个字段
3. 更新代码提取回复关系信息

**工作量**: 3-4 小时
**风险**: 低
**收益**: 很高 (完整的回复关系,更好的用户体验)

### 阶段 3: 可选改动 (按需实施) 🟢

**改动内容**:
1. 添加用户关系字段 `followed`, `following`
2. 添加状态字段 `status`

**工作量**: 2 小时
**风险**: 极低
**收益**: 中 (用户关系分析,数据清洗)

---

## 总结

### ✅ 当前做得好的地方

1. **核心字段 100% 映射** ✅
   - 回复ID、内容、时间、点赞、回复数
   - 回复者的所有信息

2. **时间戳处理完美** ✅
   - 自动格式转换
   - 兼容秒/毫秒

### ⚠️  关键缺失

1. **is_author 字段** 🔴
   - API 已提供,但未使用
   - **强烈建议添加** - 避免回复自己

2. **reply_to_user_info** 🟡
   - API 已提供完整的被回复用户信息
   - **建议添加** - 完整的回复关系

3. **level 字段** 🔴
   - API 已提供,标识评论层级
   - **建议添加** - 明确数据结构

### 📊 最终评分

| 维度 | 当前 | 改进后 |
|------|------|--------|
| **字段映射完整性** | ⭐⭐⭐ 3/5 | ⭐⭐⭐⭐⭐ 5/5 |
| **业务功能完整性** | ⭐⭐⭐ 3/5 | ⭐⭐⭐⭐⭐ 5/5 |
| **数据准确性** | ⭐⭐⭐⭐⭐ 5/5 | ⭐⭐⭐⭐⭐ 5/5 |
| **总体评分** | ⭐⭐⭐⭐ 3.7/5 | ⭐⭐⭐⭐⭐ 5/5 |

---

**分析完成时间**: 2025-10-27
**分析人员**: Claude
**结论**: API 提供了丰富的字段,建议添加 `is_author`, `level`, `reply_to_user_info` 字段以提升功能完整性!
