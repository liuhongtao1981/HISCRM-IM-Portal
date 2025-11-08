# 抖音通知详情 API 集成文档

## 概述

本文档描述了如何将抖音通知详情 API (`/aweme/v1/web/notice/detail/`) 集成到评论爬虫系统中。

## API 信息

### 端点
```
GET https://www.douyin.com/aweme/v1/web/notice/detail/
```

### 触发场景
- 用户在抖音首页收到评论通知时触发
- 用户主动查看通知列表时触发

### 请求参数
- `device_platform`: webapp
- `aid`: 6383
- `channel`: channel_pc_web
- `id_list`: URL 编码的 JSON 数组，格式：`[{"notice_id_str":"7569492244785513522","type":0}]`

### 响应结构
```json
{
  "status_code": 0,
  "notice_list_v2": [
    {
      "nid": 7569492244785513522,
      "type": 31,
      "create_time": 1762409752,
      "comment": {
        "comment": {
          "cid": "7569492209544741684",
          "text": "[比心][比心][比心]加油",
          "aweme_id": "7554278747340459302",
          "user": {
            "uid": "xxx",
            "nickname": "用户名",
            "avatar_thumb": { "url_list": [...] }
          }
        },
        "aweme": {
          "aweme_id": "7554278747340459302",
          "desc": "9月26日 #敬畏生命 #临终关怀",
          "author": {
            "uid": "xxx",
            "nickname": "作者名"
          },
          "video": {
            "play_addr": { "url_list": [...] },
            "cover": { "url_list": [...] }
          }
        }
      }
    }
  ]
}
```

### 通知类型
- `type: 31` - 评论通知
- 其他类型的通知会被过滤掉

## 实现细节

### 1. API 回调函数 (`onNoticeDetailAPI`)

位置：`packages/worker/src/platforms/douyin/crawler-comments.js`

功能：
- 解析 `notice_list_v2` 数组
- 过滤出评论类型通知 (`type === 31`)
- 提取评论数据 (`notice.comment.comment`)
- 提取作品数据 (`notice.comment.aweme`)
- 通过 DataManager 存储到数据库

关键逻辑：
```javascript
async function onNoticeDetailAPI(body, response) {
  // 1. 验证响应结构
  if (!body || !body.notice_list_v2 || !Array.isArray(body.notice_list_v2)) {
    return;
  }

  // 2. 过滤评论类型通知
  const commentNotices = body.notice_list_v2.filter(
    notice => notice.type === 31 && notice.comment
  );

  // 3. 提取评论和作品数据
  const comments = [];
  const contents = [];
  
  for (const notice of commentNotices) {
    if (notice.comment?.comment) {
      comments.push(notice.comment.comment);
    }
    if (notice.comment?.aweme) {
      contents.push(notice.comment.aweme);
    }
  }

  // 4. 存储到 DataManager
  if (globalContext.dataManager) {
    globalContext.dataManager.batchUpsertComments(comments, DataSource.API);
    globalContext.dataManager.batchUpsertContents(contents, DataSource.API);
  }
}
```

### 2. API 注册

位置：`packages/worker/src/platforms/douyin/platform.js`

在 `registerAPIHandlers()` 方法中注册：
```javascript
// 导入回调函数
const { 
  onCommentsListAPI, 
  onDiscussionsListAPI, 
  onNoticeDetailAPI  // 新增
} = require('./crawler-comments');

// 注册 API 模式
async registerAPIHandlers(manager, accountId) {
  // ... 其他 API ...
  
  // 评论相关 API
  manager.register('**/comment/list/select/**', onCommentsListAPI);
  manager.register('**/comment/reply/list/**', onDiscussionsListAPI);
  manager.register('**/aweme/v1/web/notice/detail/**', onNoticeDetailAPI);  // 新增
  
  // ... 其他 API ...
}
```

### 3. 数据流

```
用户查看通知
    ↓
抖音前端发起 API 请求
    ↓
APIInterceptorManager 拦截请求
    ↓
匹配到 **/aweme/v1/web/notice/detail/** 模式
    ↓
调用 onNoticeDetailAPI 回调
    ↓
解析 notice_list_v2
    ↓
过滤评论类型通知 (type === 31)
    ↓
提取 comment 和 aweme 数据
    ↓
DataManager.batchUpsertComments()
DataManager.batchUpsertContents()
    ↓
存储到数据库
```

## 数据模型验证 ✅

### Comment (评论数据)
来源：`notice.comment.comment`

**✅ 包含的关键字段** (与 `mapCommentData` 兼容):
- `cid` - 评论 ID → `commentId`
- `aweme_id` - 关联作品 ID → `contentId`
- `text` - 评论内容 → `content`
- `user.uid` - 评论者 ID → `authorId`
- `user.nickname` - 评论者昵称 → `authorName`
- `user.avatar_thumb` - 评论者头像 → `authorAvatar`
- `user_digged` - 是否点赞 → `isLiked`
- `reply_to_userid` - 回复目标用户 ID → `replyToUserId`
- `reply_to_username` - 回复目标用户名 → `replyToUserName`
- `create_time` - 创建时间 → `createdAt`

**❌ 缺失字段** (不影响核心功能):
- `digg_count` - 点赞数 (默认 0)
- `reply_comment_total` - 回复数 (默认 0)

### Content (作品数据)
来源：`notice.comment.aweme`

**✅ 包含的关键字段** (与 `mapContentData` 兼容):
- `aweme_id` - 作品 ID → `contentId`
- `desc` - 作品描述 → `title` / `description`
- `create_time` - 创建时间 → `publishTime` / `createdAt`
- `author.uid` - 作者 ID → `authorId`
- `author.nickname` - 作者昵称 → `authorName`
- `author.avatar_thumb` - 作者头像 → `authorAvatar`
- `video.cover` - 视频封面 → `coverUrl`
- `media_type` - 媒体类型 → `type`
- `author_user_id` - 作者 ID (备用) → `authorId`
- `status.allow_comment` - 是否允许评论 → `allowComment`
- `status.allow_share` - 是否允许分享 → `allowShare`
- `status.is_private` - 是否私密 → `visibility`

**❌ 缺失字段** (不影响核心功能):
- `comment_count` - 评论数 (默认 0)
- `like_count` - 点赞数 (默认 0)
- `share_count` - 分享数 (默认 0)
- `view_count` - 播放数 (默认 0)

### 关系验证 ✅
- **评论 → 作品关联**: `comment.aweme_id` === `aweme.aweme_id` ✅
- **数据完整性**: 评论和作品通过 `aweme_id` 正确关联
- **DataManager 兼容**: 两者都能被 `mapCommentData()` 和 `mapContentData()` 正确映射

## 与现有 API 的对比

| API | 触发场景 | 数据格式 | 包含字段 | 用途 |
|-----|---------|---------|---------|------|
| `/comment/list/select/` | 评论管理页面 | `{ comments: [...] }` | 评论完整数据 | 批量获取作品评论列表 |
| `/comment/reply/list/` | 展开回复按钮 | `{ comments: [...] }` | 评论完整数据 | 获取评论的回复（讨论） |
| `/item/list/` | 作品管理页面 | `{ item_info_list: [...] }` | 作品完整数据+统计 | 批量获取作品列表 |
| `/notice/detail/` | 首页通知 | `{ notice_list_v2: [...] }` | 评论+作品基础数据 | 实时获取评论通知+作品信息 |

**关键特点**：
- ✅ **数据结构兼容**: 通知 API 的数据结构与爬虫 API 一致,可被 DataManager 处理
- ✅ **双重数据**: 同时返回评论和作品数据（嵌套结构 `comment.comment` + `comment.aweme`）
- ✅ **关系完整**: 评论通过 `aweme_id` 正确关联作品
- ✅ **实时性**: 触发于首页，无需导航到评论管理页
- ⚠️  **统计缺失**: 不含互动统计数据（评论数、点赞数等），但不影响核心功能

## 测试验证

### 手动测试步骤
1. 启动 Worker 并登录抖音账号
2. 打开抖音首页
3. 查看通知列表（点击右上角铃铛图标）
4. 观察日志输出：
   ```
   🎯 [API] 通知详情 API 触发：X 条通知
   📝 [API] 找到 X 条评论通知
   ✅ [API] 通知详情 -> DataManager: X 条评论
   ✅ [API] 通知详情 -> DataManager: X 条作品
   ```

### 预期结果
- 评论数据成功存储到 `comments` 表
- 作品数据成功存储到 `contents` 表
- 无错误日志输出

## 相关文件

- `packages/worker/src/platforms/douyin/crawler-comments.js` - API 回调实现
- `packages/worker/src/platforms/douyin/platform.js` - API 注册
- `tests/www.douyin.com.har` - HAR 文件（包含 API 示例）

## 注意事项

1. **通知类型过滤**：目前只处理 `type === 31` 的评论通知，未来如需支持其他类型通知（如点赞、关注等），需要扩展过滤逻辑

2. **数据去重**：DataManager 会自动根据 `cid` (评论 ID) 和 `aweme_id` (作品 ID) 进行去重

3. **错误处理**：回调函数包含完整的错误处理逻辑，解析失败不会影响其他通知的处理

4. **向后兼容**：保留了旧的 `apiData` 存储机制，确保与现有代码的兼容性

## 未来优化

1. 支持更多通知类型（点赞、关注、@提及等）
2. 添加通知去重机制（避免重复处理相同通知）
3. 支持通知历史记录的批量拉取
4. 添加单元测试覆盖

## 版本历史

- **v1.0** (2024-01-XX) - 初始版本，支持评论通知拦截
