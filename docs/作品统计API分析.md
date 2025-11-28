# 抖音作品统计 API 分析

## API 端点

**URL**: `https://creator.douyin.com/janus/douyin/creator/pc/work_list`

**方法**: GET

## 请求参数

| 参数 | 值 | 说明 |
|------|-----|------|
| status | 0 | 作品状态（0=全部，1=公开，2=审核中，3=不通过等） |
| count | 12 | 每页数量 |
| max_cursor | 0 | 分页游标（首次为 0） |
| scene | star_atlas | 场景标识 |
| device_platform | android | 设备平台 |
| aid | 1128 | 应用 ID |

## 请求头

- **Referer**: `https://creator.douyin.com/creator-micro/content/manage`
- **User-Agent**: 标准浏览器 UA
- **Cookie**: 登录态 Cookie（必需）

## 响应结构

### 顶层字段

```json
{
  "status_code": 0,
  "aweme_list": [...],     // 作品列表
  "has_more": true,        // 是否有更多数据
  "max_cursor": 12,        // 下一页游标
  "min_cursor": 0,         // 最小游标
  "total": 100,            // 总数
  "activity_list": [...],
  "items": [...],
  "can_modify": true,
  "creator_self_tags_response": {...},
  "extra": {
    "logid": "...",
    "now": 1234567890
  }
}
```

### 作品对象 (aweme_list[i])

**完整字段列表**：
```
Cover, anchor_info, author, author_user_id, aweme_id, aweme_type,
caption, cha_list, chapter_bar_color, chapter_list, comment_list,
common_labels, create_time, creator_item_setting, danmaku_control,
desc, duration, extra, forward_id, geofencing, group_id, image_infos,
images, img_bitrate, interaction_stickers, is_charge_series,
is_live_replay, is_pic_word, is_preview, is_reward, is_slides,
is_story, item_id, item_title, label_top_text, long_video, misc_info,
music, next_info, poi_info, promotions, rate, risk_infos,
series_paid_info, share_info, share_url, statistics, status,
status_value, sync_struct, text_extra, type, video, video_control,
video_labels, video_text, xigua_base_info
```

### 核心字段说明

**基础信息**：
- `aweme_id`: 作品 ID（字符串）
- `desc`: 作品描述/标题
- `create_time`: 创建时间（Unix 时间戳）
- `duration`: 视频时长（毫秒）
- `type`: 作品类型（视频/图文）
- `status`: 作品状态

**统计数据** (`statistics` 对象)：
```json
{
  "aweme_id": "7576912411052100870",
  "collect_count": 0,      // 收藏数
  "comment_count": 0,      // 评论数
  "digg_count": 1,         // 点赞数
  "forward_count": 0,      // 转发数
  "live_watch_count": 0,   // 直播观看数
  "play_count": 836,       // 播放数
  "share_count": 0         // 分享数
}
```

**作者信息** (`author` 对象)：
- `uid`: 用户 ID
- `nickname`: 昵称
- `avatar_thumb`: 头像

**封面/媒体** (`Cover`, `video`, `images`)：
- `Cover`: 封面图 URL
- `video`: 视频信息（包含下载链接、清晰度等）
- `images`: 图文作品的图片列表

## 分页机制

1. 首次请求：`max_cursor=0`
2. 后续请求：使用上次响应的 `max_cursor` 值
3. 判断是否结束：检查 `has_more` 字段

## 使用场景

1. **获取作品列表**：用户的所有作品
2. **统计数据分析**：播放量、点赞数、评论数等
3. **内容管理**：批量管理作品状态
4. **数据监控**：定期获取作品数据变化

## 封装建议

### 方法签名

```javascript
async fetchWorkList(accountId, options = {}) {
    const {
        status = 0,      // 作品状态
        count = 20,      // 每页数量
        maxCursor = 0,   // 分页游标
        scene = 'star_atlas'
    } = options;

    // 实现...
}
```

### 返回格式

建议标准化为：

```javascript
{
    works: [
        {
            work_id: "7576912411052100870",
            title: "作品标题",
            cover: "封面URL",
            create_time: 1234567890,
            duration: 15000,
            statistics: {
                play_count: 836,
                digg_count: 1,
                comment_count: 0,
                share_count: 0,
                collect_count: 0
            },
            status: "published",
            _raw: { /* 原始数据 */ }
        }
    ],
    pagination: {
        has_more: true,
        max_cursor: 12,
        total: 100
    }
}
```

## 与现有系统集成

### 1. 数据库设计

建议新增 `works` 表：

```sql
CREATE TABLE works (
    id TEXT PRIMARY KEY,                   -- UUID
    platform TEXT NOT NULL,                -- 'douyin'
    account_id TEXT NOT NULL,              -- 关联 accounts 表
    platform_work_id TEXT NOT NULL,        -- 作品ID (aweme_id)

    -- 基础信息
    title TEXT,                            -- 作品标题/描述
    cover_url TEXT,                        -- 封面URL
    type TEXT,                             -- 'video' | 'image'
    duration INTEGER,                      -- 视频时长（毫秒）

    -- 统计数据
    play_count INTEGER DEFAULT 0,
    digg_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    collect_count INTEGER DEFAULT 0,

    -- 状态
    status TEXT,                           -- 'published', 'reviewing', 'rejected'
    create_time INTEGER NOT NULL,          -- 发布时间

    -- 更新记录
    last_synced_at INTEGER,                -- 最后同步时间
    updated_at INTEGER,                    -- 更新时间
    created_at INTEGER DEFAULT (strftime('%s', 'now')),

    -- 原始数据
    raw_data TEXT,                         -- JSON 格式原始数据

    UNIQUE(platform, account_id, platform_work_id)
);

CREATE INDEX idx_works_account ON works(account_id);
CREATE INDEX idx_works_create_time ON works(create_time DESC);
```

### 2. 与评论系统关联

`comments` 表中的 `aweme_id` 可以关联到 `works.platform_work_id`，实现：
- 查询某个作品的所有评论
- 统计作品的评论趋势
- 数据一致性校验

### 3. 监控场景

```javascript
// 定时任务：每小时同步一次作品统计
async syncWorkStatistics(accountId) {
    let cursor = 0;
    let hasMore = true;

    while (hasMore) {
        const result = await this.fetchWorkList(accountId, {
            maxCursor: cursor,
            count: 50
        });

        // 批量更新统计数据
        await this.batchUpdateWorkStatistics(result.works);

        cursor = result.pagination.max_cursor;
        hasMore = result.pagination.has_more;
    }
}
```

## 注意事项

1. **频率限制**：建议每个账号每小时不超过 10 次请求
2. **Cookie 有效期**：需要定期刷新登录态
3. **数据一致性**：统计数据存在延迟（约 5-10 分钟）
4. **大量数据**：如果作品数量较多，使用分页避免超时

## 相关 API

- **作品详情**: `/aweme/v1/web/aweme/detail/` - 获取单个作品详细信息
- **作品统计**: `/creator/data/work/item/analysis/` - 更详细的统计分析
- **评论列表**: `/comment/list/` - 作品的评论列表
- **数据概览**: `/creator/data/overview/` - 账号整体数据概览

---

**分析时间**: 2025-11-27
**数据来源**: tests/zuopin.har
