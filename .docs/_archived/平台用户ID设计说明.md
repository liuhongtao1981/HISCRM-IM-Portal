# 平台用户ID (platform_user_id) 设计说明

## 🎯 问题背景

在实际使用中，一个系统账号可能会登录不同的平台账号（抖音账号），如果不区分平台用户ID，会导致数据混乱：

### 场景示例

```
时间线：
10:00 - 账号A 登录 → 抖音账号1（苏苏, douyin_id: 1864722759）
10:05 - 爬取评论 → 50条评论保存到数据库

12:00 - 账号A 退出，重新登录 → 抖音账号2（另一个账号）
12:05 - 爬取评论 → 30条评论保存到数据库

问题：
- 无法区分这80条评论分别属于哪个抖音账号
- 统计数据会混在一起
- 无法为特定抖音账号查询历史数据
```

## 💡 解决方案

添加 `platform_user_id` 和 `platform_username` 字段，用于标识当前登录的平台账号。

### platform_user_id 来源

对于抖音平台，使用以下字段作为唯一标识：
1. **抖音号** (`douyin_id`) - 优先使用，数字ID，唯一且不可更改
2. **UID** (`uid`) - 备选，平台内部用户ID
3. **sec_uid** - 加密的用户ID

### platform_username

用户昵称，用于展示（可以修改，仅用于显示）

## 📊 数据库设计

### Migration 008 - 添加 platform_user_id

**影响的表**：
1. `accounts` - 账户表
2. `comments` - 评论表
3. `direct_messages` - 私信表
4. `douyin_videos` - 作品表
5. `notifications` - 通知表

### 1. accounts 表

```sql
ALTER TABLE accounts ADD COLUMN platform_user_id TEXT;
ALTER TABLE accounts ADD COLUMN platform_username TEXT;

CREATE INDEX idx_accounts_platform_user ON accounts(platform_user_id);
```

**用途**：记录当前登录的平台账号

### 2. comments 表

```sql
ALTER TABLE comments ADD COLUMN platform_user_id TEXT;

CREATE INDEX idx_comments_platform_user ON comments(platform_user_id);
CREATE INDEX idx_comments_account_platform_user ON comments(account_id, platform_user_id);
```

**用途**：标识该评论属于哪个平台账号

### 3. direct_messages 表

```sql
ALTER TABLE direct_messages ADD COLUMN platform_user_id TEXT;
ALTER TABLE direct_messages ADD COLUMN conversation_id TEXT;

CREATE INDEX idx_dm_platform_user ON direct_messages(platform_user_id);
CREATE INDEX idx_dm_account_platform_user ON direct_messages(account_id, platform_user_id);
```

**用途**：标识该私信属于哪个平台账号

### 4. douyin_videos 表

```sql
ALTER TABLE douyin_videos ADD COLUMN platform_user_id TEXT;

CREATE INDEX idx_videos_platform_user ON douyin_videos(platform_user_id);
CREATE INDEX idx_videos_account_platform_user ON douyin_videos(account_id, platform_user_id);

-- 复合唯一索引：同一个平台用户下，作品ID唯一
CREATE UNIQUE INDEX idx_videos_platform_aweme ON douyin_videos(platform_user_id, aweme_id);
```

**用途**：标识该作品属于哪个平台账号

**重要**：作品ID在平台用户范围内唯一，而不是全局唯一

### 5. notifications 表

```sql
ALTER TABLE notifications ADD COLUMN platform_user_id TEXT;

CREATE INDEX idx_notifications_platform_user ON notifications(platform_user_id);
```

**用途**：标识该通知属于哪个平台账号

## 🔄 数据流程

### 1. 登录时保存 platform_user_id

```javascript
// Worker: 登录成功后提取用户信息
async onLoginSuccess(accountId, sessionId) {
  const page = await this.getPageForAccount(accountId);

  // 提取平台用户信息
  const userInfo = await this.extractUserInfo(page);
  // userInfo = {
  //   douyin_id: '1864722759',
  //   nickname: '苏苏',
  //   uid: 'xxx',
  //   avatar: 'https://...'
  // }

  // 发送给Master，更新账户信息
  await this.bridge.updateAccountPlatformUser(accountId, {
    platform_user_id: userInfo.douyin_id || userInfo.uid,
    platform_username: userInfo.nickname
  });
}
```

### 2. 爬取时使用 platform_user_id

```javascript
// Worker: 爬取评论时
async crawlComments(account) {
  // 从账户信息中获取 platform_user_id
  const platformUserId = account.platform_user_id;

  if (!platformUserId) {
    throw new Error('Account not logged in or platform_user_id missing');
  }

  // 爬取评论
  const rawComments = await this.fetchComments();

  // 处理增量抓取
  const { newComments, allComments } =
    await IncrementalCrawlService.processCommentsIncremental(
      rawComments,
      video,
      account.id,
      platformUserId,  // ← 传入平台用户ID
      getExistingCommentIds
    );

  // 每条评论都会带上 platform_user_id
  // comment.platform_user_id = platformUserId
}
```

### 3. 查询时按 platform_user_id 过滤

```javascript
// Master: 查询某个平台账号的评论
const comments = commentsDAO.findAll({
  account_id: 'account-123',
  platform_user_id: '1864722759',  // 指定平台用户ID
  is_new: 1
});

// 统计某个平台账号的数据
const stats = douyinVideoDAO.getVideoStats(
  'account-123',
  '1864722759'  // 指定平台用户ID
);
```

## 📈 统计查询示例

### 按平台用户分组统计

```sql
-- 统计每个平台账号的评论数
SELECT
  platform_user_id,
  platform_username,
  COUNT(*) as total_comments,
  SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_comments
FROM comments
WHERE account_id = 'account-123'
GROUP BY platform_user_id;
```

### 查询特定平台账号的数据

```sql
-- 查询某个抖音账号的所有作品
SELECT * FROM douyin_videos
WHERE platform_user_id = '1864722759'
ORDER BY created_at DESC;

-- 查询某个抖音账号的新评论
SELECT * FROM comments
WHERE platform_user_id = '1864722759'
  AND is_new = 1
ORDER BY detected_at DESC;
```

## 🔍 数据隔离保证

### 唯一性约束

```sql
-- 作品表：同一平台用户下，作品ID唯一
CREATE UNIQUE INDEX idx_videos_platform_aweme
ON douyin_videos(platform_user_id, aweme_id);

-- 这样即使不同平台用户有相同的 aweme_id，也不会冲突
```

### 复合索引

```sql
-- 账号 + 平台用户 复合索引，提高查询性能
CREATE INDEX idx_comments_account_platform_user
ON comments(account_id, platform_user_id);
```

## 🎨 Web UI 展示

### 账号列表

```javascript
{
  account_id: 'account-123',
  account_name: '测试账号A',
  platform: 'douyin',
  platform_user_id: '1864722759',
  platform_username: '苏苏',
  login_status: 'logged_in'
}
```

显示为：
```
测试账号A (抖音: 苏苏 #1864722759)
```

### 评论列表

增加筛选器：
```javascript
<Select placeholder="选择抖音账号">
  <Option value="">全部账号</Option>
  <Option value="1864722759">苏苏 (#1864722759)</Option>
  <Option value="9876543210">另一个账号 (#9876543210)</Option>
</Select>
```

## 🚀 迁移步骤

### 1. 运行 Migration

重启 Master 服务，自动执行 `008_add_platform_user_id.sql`

### 2. 更新现有数据（可选）

如果有历史数据，可以通过以下方式更新：

```sql
-- 方式1: 如果账号表已有 platform_user_id
UPDATE comments
SET platform_user_id = (
  SELECT platform_user_id FROM accounts
  WHERE accounts.id = comments.account_id
)
WHERE platform_user_id IS NULL;

-- 方式2: 如果无法确定，可以设置为特殊值
UPDATE comments
SET platform_user_id = 'unknown-' || account_id
WHERE platform_user_id IS NULL;
```

### 3. 修改爬虫代码

确保所有爬虫方法都传入 `platform_user_id`

### 4. 更新 Web UI

添加平台用户筛选器和显示

## ⚠️ 注意事项

1. **登录时必须提取** - 登录成功后必须提取并保存 `platform_user_id`
2. **爬取时必须传入** - 所有爬虫操作都必须包含 `platform_user_id`
3. **历史数据处理** - 旧数据的 `platform_user_id` 可能为空，需要特殊处理
4. **跨平台唯一** - 不同平台的用户ID可能重复，建议加平台前缀（如 `douyin:1864722759`）

## 📝 相关文件

- Migration: `packages/master/src/database/migrations/008_add_platform_user_id.sql`
- DAO:
  - `packages/master/src/database/douyin-video-dao.js`
  - `packages/master/src/database/comments-dao.js`
- Service: `packages/worker/src/services/incremental-crawl-service.js`
- Platform: `packages/worker/src/platforms/douyin/platform.js`

## 🎯 总结

通过添加 `platform_user_id` 字段：

✅ **数据隔离** - 不同抖音账号的数据完全隔离
✅ **精确统计** - 可以按平台账号统计数据
✅ **灵活切换** - 支持同一系统账号登录不同平台账号
✅ **历史追溯** - 可以查询特定平台账号的历史数据
✅ **通知准确** - 通知可以关联到具体的平台账号
