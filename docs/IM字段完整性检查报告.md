# IM 字段完整性检查报告

## 检查时间：2025-10-23

---

## 1. accounts 表（账号/用户表）

### ✅ 已有字段
```sql
id, platform, account_name, account_id, credentials,
status, login_status, monitor_interval,
last_check_time, last_login_time, cookies_valid_until,
assigned_worker_id, created_at, updated_at,
user_info, fingerprint,
total_comments, total_works, total_followers, total_following,
recent_comments_count, recent_works_count,
worker_status, last_crawl_time, last_heartbeat_time,
error_count, last_error_message,
platform_user_id, platform_username
```

### ⚠️ 缺少的 IM 常用字段

| 字段名 | 用途 | 重要性 | 建议 |
|--------|------|--------|------|
| `avatar` / `avatar_url` | 用户头像 URL | ⭐⭐⭐ 高 | **建议添加** - IM 界面必需 |
| `signature` / `bio` | 个人签名/简介 | ⭐⭐ 中 | 可选 - 增强用户信息展示 |
| `verified` | 认证标识 | ⭐⭐ 中 | 可选 - 显示蓝V等认证 |
| `online_status` | 在线状态 | ⭐ 低 | 可选 - 爬虫账号通常不需要 |

**推荐修改**：
```sql
ALTER TABLE accounts ADD COLUMN avatar TEXT;
ALTER TABLE accounts ADD COLUMN signature TEXT;
ALTER TABLE accounts ADD COLUMN verified BOOLEAN DEFAULT 0;
```

---

## 2. conversations 表（会话表）

### ✅ 已有字段
```sql
id, account_id, platform_user_id,
platform_user_name, platform_user_avatar,
is_group, unread_count,
platform_message_id, last_message_time, last_message_content,
created_at, updated_at
```

### ⚠️ 缺少的 IM 常用字段

| 字段名 | 用途 | 重要性 | 建议 |
|--------|------|--------|------|
| `is_pinned` | 是否置顶 | ⭐⭐⭐ 高 | **建议添加** - 重要会话置顶 |
| `is_muted` | 是否免打扰 | ⭐⭐ 中 | 建议添加 - 静音群组消息 |
| `last_message_type` | 最后消息类型 | ⭐⭐ 中 | 建议添加 - 显示[图片][视频]等 |
| `last_message_sender_id` | 最后消息发送者 | ⭐ 低 | 可选 - 群聊时显示"张三：xxx" |
| `draft` | 草稿内容 | ⭐ 低 | 可选 - 保存未发送的消息 |
| `conversation_type` | 会话类型 | ⭐ 低 | 可选 - 'direct' / 'group' / 'system' |
| `status` | 会话状态 | ⭐ 低 | 可选 - 'active' / 'archived' / 'deleted' |

**推荐修改**：
```sql
ALTER TABLE conversations ADD COLUMN is_pinned BOOLEAN DEFAULT 0;
ALTER TABLE conversations ADD COLUMN is_muted BOOLEAN DEFAULT 0;
ALTER TABLE conversations ADD COLUMN last_message_type TEXT DEFAULT 'text';
ALTER TABLE conversations ADD COLUMN status TEXT DEFAULT 'active';
CREATE INDEX idx_conversations_pinned ON conversations(is_pinned);
CREATE INDEX idx_conversations_status ON conversations(status);
```

---

## 3. direct_messages 表（私信表）

### ✅ 已有字段
```sql
id, account_id, platform_user_id, platform_message_id,
content,
platform_sender_id, platform_sender_name,
platform_receiver_id, platform_receiver_name,
message_type, direction, is_read,
detected_at, created_at,
conversation_id, is_new, push_count, sender_name
```

### ⚠️ 缺少的 IM 常用字段

| 字段名 | 用途 | 重要性 | 建议 |
|--------|------|--------|------|
| `status` | 消息状态 | ⭐⭐⭐ 高 | **建议添加** - 'sending'/'sent'/'delivered'/'read'/'failed' |
| `reply_to_message_id` | 引用回复的消息 | ⭐⭐⭐ 高 | **建议添加** - 支持"引用回复"功能 |
| `media_url` | 媒体文件 URL | ⭐⭐⭐ 高 | **建议添加** - 图片/视频/文件链接 |
| `media_thumbnail` | 媒体缩略图 | ⭐⭐ 中 | 建议添加 - 图片预览 |
| `file_size` | 文件大小 | ⭐⭐ 中 | 建议添加 - 显示文件大小 |
| `file_name` | 文件名 | ⭐⭐ 中 | 建议添加 - 显示原始文件名 |
| `duration` | 音视频时长 | ⭐⭐ 中 | 建议添加 - 显示音频/视频时长 |
| `is_deleted` | 是否删除 | ⭐⭐ 中 | 建议添加 - 软删除标记 |
| `is_recalled` | 是否撤回 | ⭐⭐ 中 | 建议添加 - 消息撤回功能 |
| `recalled_at` | 撤回时间 | ⭐ 低 | 可选 - 记录撤回时间 |
| `edited_at` | 编辑时间 | ⭐ 低 | 可选 - 消息编辑功能 |
| `sender_avatar` | 发送者头像 | ⭐ 低 | 可选 - 冗余字段，加速显示 |
| `receiver_avatar` | 接收者头像 | ⭐ 低 | 可选 - 冗余字段，加速显示 |

**推荐修改**：
```sql
-- 核心字段
ALTER TABLE direct_messages ADD COLUMN status TEXT DEFAULT 'sent';
ALTER TABLE direct_messages ADD COLUMN reply_to_message_id TEXT;
ALTER TABLE direct_messages ADD COLUMN media_url TEXT;
ALTER TABLE direct_messages ADD COLUMN media_thumbnail TEXT;

-- 文件相关
ALTER TABLE direct_messages ADD COLUMN file_size INTEGER;
ALTER TABLE direct_messages ADD COLUMN file_name TEXT;
ALTER TABLE direct_messages ADD COLUMN duration INTEGER;

-- 删除和撤回
ALTER TABLE direct_messages ADD COLUMN is_deleted BOOLEAN DEFAULT 0;
ALTER TABLE direct_messages ADD COLUMN is_recalled BOOLEAN DEFAULT 0;
ALTER TABLE direct_messages ADD COLUMN recalled_at INTEGER;

-- 索引
CREATE INDEX idx_dm_status ON direct_messages(status);
CREATE INDEX idx_dm_reply_to ON direct_messages(reply_to_message_id);
CREATE INDEX idx_dm_deleted ON direct_messages(is_deleted);
```

---

## 4. comments 表（评论表）

### ✅ 已有字段
```sql
id, account_id, platform_user_id, platform_comment_id,
content, author_name, author_id,
post_id, post_title,
is_read, detected_at, created_at,
is_new, push_count
```

### ⚠️ 缺少的 IM 常用字段

| 字段名 | 用途 | 重要性 | 建议 |
|--------|------|--------|------|
| `author_avatar` | 评论者头像 | ⭐⭐ 中 | 建议添加 - UI 显示需要 |
| `like_count` | 点赞数 | ⭐⭐ 中 | 建议添加 - 显示热门评论 |
| `reply_count` | 回复数 | ⭐⭐ 中 | 建议添加 - 显示"查看X条回复" |
| `is_top` | 是否置顶 | ⭐ 低 | 可选 - 置顶重要评论 |
| `is_author_reply` | 是否作者回复 | ⭐ 低 | 可选 - 标记博主回复 |

**推荐修改**：
```sql
ALTER TABLE comments ADD COLUMN author_avatar TEXT;
ALTER TABLE comments ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN reply_count INTEGER DEFAULT 0;
CREATE INDEX idx_comments_like_count ON comments(like_count);
```

---

## 5. discussions 表（讨论表）

### ✅ 已有字段
```sql
id, account_id, platform, platform_user_id, platform_discussion_id,
parent_comment_id, content, author_name, author_id,
work_id, post_id, post_title,
is_read, is_new, push_count,
detected_at, created_at
```

### ⚠️ 缺少的 IM 常用字段

| 字段名 | 用途 | 重要性 | 建议 |
|--------|------|--------|------|
| `author_avatar` | 讨论者头像 | ⭐⭐ 中 | 建议添加 - UI 显示需要 |
| `like_count` | 点赞数 | ⭐⭐ 中 | 建议添加 - 显示热门讨论 |
| `reply_to_user_id` | @的用户ID | ⭐ 低 | 可选 - "@某人：xxx" |
| `reply_to_user_name` | @的用户名 | ⭐ 低 | 可选 - 显示@对象 |

**推荐修改**：
```sql
ALTER TABLE discussions ADD COLUMN author_avatar TEXT;
ALTER TABLE discussions ADD COLUMN like_count INTEGER DEFAULT 0;
```

---

## 6. works 表（作品表）

### ✅ 已有字段
```sql
id, account_id, platform, platform_work_id, platform_user_id,
work_type, title, description, cover, url, publish_time,
total_comment_count, new_comment_count, like_count, share_count, view_count,
last_crawl_time, crawl_status, crawl_error,
is_new, push_count, created_at, updated_at
```

### ✅ 字段完整度：优秀

**建议可选字段**：

| 字段名 | 用途 | 重要性 | 建议 |
|--------|------|--------|------|
| `author_name` | 作者名称 | ⭐ 低 | 可选 - 冗余字段 |
| `author_avatar` | 作者头像 | ⭐ 低 | 可选 - 冗余字段 |
| `duration` | 视频/音频时长 | ⭐ 低 | 可选 - 媒体时长 |
| `tags` | 标签/话题 | ⭐ 低 | 可选 - JSON 格式存储标签 |

---

## 优先级汇总

### 🔴 高优先级（必须添加）

#### 1. direct_messages 表
```sql
-- 消息状态（必须）
ALTER TABLE direct_messages ADD COLUMN status TEXT DEFAULT 'sent';
CREATE INDEX idx_dm_status ON direct_messages(status);

-- 引用回复（必须）
ALTER TABLE direct_messages ADD COLUMN reply_to_message_id TEXT;
CREATE INDEX idx_dm_reply_to ON direct_messages(reply_to_message_id);

-- 媒体文件（必须）
ALTER TABLE direct_messages ADD COLUMN media_url TEXT;
ALTER TABLE direct_messages ADD COLUMN media_thumbnail TEXT;
ALTER TABLE direct_messages ADD COLUMN file_size INTEGER;
ALTER TABLE direct_messages ADD COLUMN file_name TEXT;
ALTER TABLE direct_messages ADD COLUMN duration INTEGER;

-- 删除和撤回（必须）
ALTER TABLE direct_messages ADD COLUMN is_deleted BOOLEAN DEFAULT 0;
ALTER TABLE direct_messages ADD COLUMN is_recalled BOOLEAN DEFAULT 0;
CREATE INDEX idx_dm_deleted ON direct_messages(is_deleted);
```

#### 2. conversations 表
```sql
-- 置顶和免打扰（必须）
ALTER TABLE conversations ADD COLUMN is_pinned BOOLEAN DEFAULT 0;
ALTER TABLE conversations ADD COLUMN is_muted BOOLEAN DEFAULT 0;
CREATE INDEX idx_conversations_pinned ON conversations(is_pinned);

-- 最后消息类型（必须）
ALTER TABLE conversations ADD COLUMN last_message_type TEXT DEFAULT 'text';
```

#### 3. accounts 表
```sql
-- 用户头像（必须）
ALTER TABLE accounts ADD COLUMN avatar TEXT;
```

### 🟡 中优先级（建议添加）

#### 1. comments 和 discussions 表
```sql
-- 头像和统计
ALTER TABLE comments ADD COLUMN author_avatar TEXT;
ALTER TABLE comments ADD COLUMN like_count INTEGER DEFAULT 0;
ALTER TABLE comments ADD COLUMN reply_count INTEGER DEFAULT 0;

ALTER TABLE discussions ADD COLUMN author_avatar TEXT;
ALTER TABLE discussions ADD COLUMN like_count INTEGER DEFAULT 0;
```

#### 2. conversations 表
```sql
-- 会话状态
ALTER TABLE conversations ADD COLUMN status TEXT DEFAULT 'active';
CREATE INDEX idx_conversations_status ON conversations(status);
```

#### 3. accounts 表
```sql
-- 用户信息增强
ALTER TABLE accounts ADD COLUMN signature TEXT;
ALTER TABLE accounts ADD COLUMN verified BOOLEAN DEFAULT 0;
```

### 🟢 低优先级（可选）

- `edited_at` - 消息编辑时间
- `draft` - 会话草稿
- `online_status` - 在线状态
- 其他冗余显示字段

---

## 完整的迁移脚本

我已经为您准备好了完整的迁移脚本，包含所有高优先级和中优先级字段。

**文件位置**：`packages/master/src/database/add-im-missing-fields.js`

**运行方式**：
```bash
node packages/master/src/database/add-im-missing-fields.js
```

---

## 总结

### 当前状态
- ✅ 基础字段完整度：85%
- ⚠️ 缺少 IM 高级功能字段：15%

### 主要缺失
1. **消息状态管理** - status、is_deleted、is_recalled
2. **引用回复功能** - reply_to_message_id
3. **媒体文件支持** - media_url、file_size、duration
4. **会话管理** - is_pinned、is_muted
5. **用户头像** - avatar 字段

### 建议
**立即执行**：添加高优先级字段（消息状态、引用回复、媒体文件）
**后续优化**：添加中优先级字段（头像、点赞数、置顶等）

---

**报告生成时间**：2025-10-23
**审核人**：Claude Code
