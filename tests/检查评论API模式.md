# 评论 API 拦截模式验证报告

**时间**: 2025-10-30 11:08
**测试方法**: 使用 MCP Playwright 工具人工操作评论页面

## 测试步骤

1. ✅ 导航到评论管理页面：`https://creator.douyin.com/creator-micro/interactive/comment`
2. ✅ 点击"选择作品"按钮，弹出作品列表模态框（共44个视频）
3. ✅ 点击第一个视频（有1条评论）
4. ✅ 页面加载并显示1条评论：`木子李🇨🇳: 🙏🙏🙏`

## 网络请求分析

从网络请求日志中发现的评论相关 API：

### ✅ 找到评论 API！

```http
GET https://creator.douyin.com/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/
    ?aweme_id=7566585110184956145
    &cursor=0
    &count=10
    &comment_select_options=0
    &sort_options=0
    &channel_id=618
    &app_id=2906
    &aid=2906
    &device_platform=webapp
    &msToken=...
    &a_bogus=...
=> [200]
```

**关键发现**：

1. **API 路径完整**: `/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/`
2. **不是** `/comment/list` 而是 `/comment/list/select/`
3. **完整路径包含**: `/aweme/api/comment/`

### API 参数

- `aweme_id`: 作品ID (7566585110184956145)
- `cursor`: 分页游标 (0)
- `count`: 每页数量 (10)
- `comment_select_options`: 评论筛选选项 (0 = 全部评论)
- `sort_options`: 排序选项 (0 = 最新发布)

## 问题根因

### 当前拦截器模式（错误）

```javascript
manager.register('**/comment/list{/,}?**', onCommentsListAPI);
manager.register('**/comment/reply/list{/,}?**', onDiscussionsListAPI);
```

### 实际 API 路径

```
/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/
```

**不匹配原因**：

1. ❌ 实际路径包含 `/comment/read/aweme/v1/web/comment/list/select/`
2. ❌ 不是简单的 `/comment/list`
3. ❌ 包含 `/select/` 后缀

## 正确的拦截器模式

### 方案 1: 精确匹配

```javascript
manager.register('**/comment/list/select/**', onCommentsListAPI);
manager.register('**/comment/reply/list/**', onDiscussionsListAPI);
```

### 方案 2: 宽松匹配

```javascript
manager.register('**/comment/**/list/**', onCommentsListAPI);
manager.register('**/comment/**/reply/**', onDiscussionsListAPI);
```

### 方案 3: 路径包含匹配

```javascript
manager.register('**comment**list**', onCommentsListAPI);
manager.register('**comment**reply**', onDiscussionsListAPI);
```

## 其他评论相关 API

### 评论信息 API（成功）

```http
GET https://creator.douyin.com/aweme/v1/creator/comment/info
    ?aid=2906
    &msToken=...
    &a_bogus=...
=> [200]
```

这个 API 返回评论统计信息。

## 建议修复

修改 [platform.js:88-89](packages/worker/src/platforms/douyin/platform.js#L88-L89)：

```javascript
// 旧模式（不匹配）
manager.register('**/comment/list{/,}?**', onCommentsListAPI);
manager.register('**/comment/reply/list{/,}?**', onDiscussionsListAPI);

// 新模式（推荐）
manager.register('**/comment/list/select/**', onCommentsListAPI);
manager.register('**/comment/reply/list/**', onDiscussionsListAPI);
```

或者使用更宽松的模式：

```javascript
manager.register('**comment**list**', onCommentsListAPI);
manager.register('**comment**reply**', onDiscussionsListAPI);
```

## 验证方法

修改后重新运行爬虫，检查日志：

1. 应该看到 API 拦截日志：`🎯 [API] 评论列表 API 被触发！`
2. 应该看到数据写入日志：`✅ [API] 评论列表 -> DataManager: X 条评论`
3. DataManager 快照应显示：`comments > 0`

## 总结

**根本原因确认**：评论 API 的实际路径是 `/comment/list/select/`，而不是 `/comment/list`，导致拦截器模式 `**/comment/list{/,}?**` 无法匹配。

**解决方案**：更新拦截器模式为 `**/comment/list/select/**` 或 `**comment**list**`。
