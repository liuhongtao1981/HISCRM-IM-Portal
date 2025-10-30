# 评论和回复 API 拦截器修复报告

**日期**: 2025-10-30  
**问题**: DataManager 快照显示 `comments: 0` 和 `discussions: 0`  
**根本原因**: API 拦截器模式不匹配实际的 API 路径

---

## 问题发现过程

### 1. 初步调查

**症状**:
- DataManager 快照: `contents: 20` ✅ 正常
- DataManager 快照: `comments: 0` ❌ 异常
- DataManager 快照: `discussions: 0` ❌ 异常

**日志分析**:
```
# douyin-platform.log
[crawlComments] Crawler completed: 0 comments, 0 discussions, 0 contents

# api-interceptor.log
Enabled 7 API patterns
（未见任何评论 API 拦截日志）
```

### 2. 使用 MCP Playwright 工具人工验证

**操作步骤**:
1. 导航到评论管理页面: `https://creator.douyin.com/creator-micro/interactive/comment`
2. 点击"选择作品"按钮
3. 选择有评论的视频（22条评论）
4. 观察网络请求

**发现的实际 API**:

#### 评论列表 API ✅ 已发现

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
```

**关键路径部分**: `/comment/list/select/`

#### 回复/讨论 API ⏳ 待确认

**操作**:
- 点击"查看4条回复"按钮
- 回复成功展开（显示了4条回复）
- 但由于网络请求日志过多，未能直接捕获回复 API 路径

**推测的可能路径**:
```
/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/reply/list/
/web/api/third_party/aweme/api/comment/read/aweme/v1/web/reply/list/
/web/api/third_party/aweme/api/comment/reply/list/
```

---

## 根本原因分析

### 原拦截器模式（错误）

[platform.js:88-89](packages/worker/src/platforms/douyin/platform.js#L88-L89):
```javascript
manager.register('**/comment/list{/,}?**', onCommentsListAPI);  // ❌ 不匹配
manager.register('**/comment/reply/list{/,}?**', onDiscussionsListAPI);  // ❌ 可能不匹配
```

### 实际 API 路径结构

```
评论列表 API:
/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          包含 /comment/list/select/（不是 /comment/list）

回复列表 API（推测）:
/web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/reply/list/
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          包含 /comment/reply/list/
```

### 为什么不匹配

1. **评论 API**: 实际路径包含 `/select/` 后缀，而模式 `**/comment/list{/,}?**` 只匹配:
   - `**/comment/list`
   - `**/comment/list/`
   - `**/comment/list?**`
   
   但不匹配 `/comment/list/select/`

2. **回复 API**: 模式可能能匹配，但需要验证

---

## 修复方案

### 已应用的修复

[platform.js:88-89](packages/worker/src/platforms/douyin/platform.js#L88-L89):
```javascript
// 修复前
manager.register('**/comment/list{/,}?**', onCommentsListAPI);
manager.register('**/comment/reply/list{/,}?**', onDiscussionsListAPI);

// 修复后 ✅
manager.register('**/comment/list/select/**', onCommentsListAPI);  
manager.register('**/comment/reply/list/**', onDiscussionsListAPI); 
```

### 模式说明

**评论 API 模式**: `**/comment/list/select/**`
- 匹配任何包含 `/comment/list/select/` 的路径
- 精确匹配已发现的 API 路径
- 更严格，避免误匹配

**回复 API 模式**: `**/comment/reply/list/**`
- 更宽松的模式
- 可以匹配多种可能的回复 API 路径结构

### 备选方案（更宽松）

如果上述模式仍有问题，可使用更宽松的模式：
```javascript
manager.register('**comment**list**', onCommentsListAPI);
manager.register('**comment**reply**', onDiscussionsListAPI);
```

---

## 下一步验证

### 验证步骤

1. ✅ 修改 `platform.js` 中的 API 拦截器模式
2. ⏳ 重启 Master 服务器
3. ⏳ 清理日志文件
4. ⏳ 运行爬虫
5. ⏳ 检查日志:
   - `api-interceptor.log` 应显示: `🎯 [API] 评论列表 API 被触发！`
   - `api-interceptor.log` 应显示: `✅ [API] 评论列表 -> DataManager: X 条评论`
6. ⏳ 检查 DataManager 快照: `comments` 应 > 0

### 预期结果

```
DataManager 数据快照:
- comments: > 0 ✅
- discussions: > 0 ✅ (如果有回复)
- contents: 20 ✅
```

---

## 回复 API 待确认事项

### 需要确认的内容

1. **实际回复 API 路径**: 需要从网络请求中确认
2. **API 参数结构**: 确认回复 API 的参数格式
3. **模式匹配验证**: 验证新模式能否匹配回复 API

### 确认方法

**方法 1**: 使用 HAR 文件分析
```bash
cd tests
node 分析HAR文件查找回复API.js
```

**方法 2**: 浏览器开发者工具
1. 打开 Chrome DevTools (F12)
2. 切换到 Network 标签
3. 筛选: `comment` 或 `reply`
4. 点击"查看回复"按钮
5. 观察触发的 API 请求

**方法 3**: 检查运行时日志
修复后运行爬虫，如果回复 API 被触发，`api-interceptor.log` 会显示:
```
🎯 [API] 回复列表 API 被触发！
✅ [API] 回复列表 -> DataManager: X 条回复
```

---

## 修复时间线

| 时间 | 操作 | 状态 |
|------|------|------|
| 11:08 | 使用 MCP 工具发现评论 API 路径 | ✅ |
| 11:15 | 创建 `tests/检查评论API模式.md` | ✅ |
| 11:20 | 点击"查看回复"展开回复列表 | ✅ |
| 11:25 | 修改 `platform.js` API 拦截器模式 | ✅ |
| 待定 | 重启 Master 并验证 | ⏳ |

---

## 相关文档

- [tests/检查评论API模式.md](../tests/检查评论API模式.md) - MCP 工具调查报告
- [docs/评论数据零问题调查报告.md](评论数据零问题调查报告.md) - 初步调查
- [docs/作品API拦截器验证报告-最终版.md](作品API拦截器验证报告-最终版.md) - 作品 API 修复参考

---

## 总结

**问题根因**: 评论 API 实际路径包含 `/list/select/` 而不是 `/list`，导致拦截器模式不匹配

**解决方案**: 更新拦截器模式为 `**/comment/list/select/**`

**待验证**: 
1. 新模式是否能成功拦截评论 API
2. 回复 API 的实际路径和模式匹配情况

**下一步**: 重启 Master 服务器并运行爬虫验证修复结果
