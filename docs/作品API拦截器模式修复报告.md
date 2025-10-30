# 作品 API 拦截器模式修复报告

**日期**: 2025-10-29
**问题**: API 拦截器注册了但从未触发，作品数据为 0
**状态**: ✅ 已修复（模式不匹配问题）

---

## 问题描述

### 现象

DataManager 快照显示作品数据为 0，但是：
- ✅ API 拦截器已注册：`manager.register('**/creator/item/list?**', onWorksListAPI)`
- ✅ 回调函数已实现：`onWorksListAPI()` 完整且正确
- ❌ 日志文件完全为空：`crawl-contents.log: 0 字节`
- ❌ API 拦截器从未被触发

### 用户反馈

> 正常有 18-19 个作品，`https://creator.douyin.com/aweme/v1/creator/item/list?cursor=` 应该是整个 API 拦截回来的

用户提供了 F12 抓取的 HAR 文件 (`tests/creator.douyin.com.har`)，显示实际请求了作品 API 并成功返回 20 个作品数据。

---

## 根本原因分析

### HAR 文件分析

从 HAR 文件中发现了关键差异：

```
请求 1: https://creator.douyin.com/aweme/v1/creator/item/list?cursor=
        Method: GET
        Status: 301 Moved Permanently
        ↓
        重定向到：

请求 2: https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=
                                                             ↑
                                                        末尾有斜杠
        Method: GET
        Status: 200 OK
        Content-Type: application/json
        Response: { status_code: 0, item_info_list: [20个作品...] }
```

**关键发现**：抖音 API 会将 `list?` 重定向到 `list/?`（末尾加斜杠）。

### 模式匹配测试

创建了测试脚本 `tests/测试API模式匹配.js` 验证不同模式的匹配结果：

| 模式 | URL 1 (无斜杠) | URL 2 (有斜杠) | 匹配率 |
|------|----------------|----------------|--------|
| `**/creator/item/list?**` | ✅ | ❌ | 50% |
| `**/creator/item/list/?**` | ❌ | ✅ | 50% |
| `**/creator/item/list{/,}?**` | ✅ | ✅ | **100%** |

**结论**：
- 旧模式 `**/creator/item/list?**` 只能匹配**无斜杠**的 URL
- 实际 API 返回的是**有斜杠**的 URL（`list/?cursor=`）
- **模式不匹配** → API 拦截器从未触发 → 回调函数从未执行 → 数据为 0

---

## 修复方案

### 修改位置

文件：`packages/worker/src/platforms/douyin/platform.js`
行号：61

### 修复前

```javascript
// 作品相关 API
manager.register('**/creator/item/list?**', onWorksListAPI);
                                       ↑
                                   缺少斜杠
```

### 修复后

```javascript
// 作品相关 API
manager.register('**/creator/item/list{/,}?**', onWorksListAPI);  // ✅ 兼容模式：匹配有/无斜杠的 URL
                                       ↑↑↑↑
                                  兼容模式（可选斜杠）
```

### 模式说明

使用 glob 模式的 **brace expansion** 语法：
- `{/,}` 表示匹配 `/` 或空字符串（即可选的斜杠）
- 等价于两个模式的组合：
  - `**/creator/item/list?**`（无斜杠）
  - `**/creator/item/list/?**`（有斜杠）

---

## 验证结果

### 测试脚本输出

```bash
$ node tests/测试API模式匹配.js

🔍 API 模式匹配测试

模式 3: **/creator/item/list{/,}?**
================================================================================
✅ URL 1: https://creator.douyin.com/aweme/v1/creator/item/list?cursor=
✅ URL 2: https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=
✅ URL 3: https://creator.douyin.com/creator/item/list?cursor=
✅ URL 4: https://creator.douyin.com/creator/item/list/?cursor=

📊 统计结果:
================================================================================
模式 3 匹配: 4/4 个 URL

💡 结论:
================================================================================
🌟 兼容模式 (**/creator/item/list{/,}?**) 匹配所有 URL
   如果需要兼容两种格式，可以使用此模式
```

### HAR 文件数据验证

从 HAR 文件提取的实际响应数据：

```javascript
{
  "status_code": 0,
  "item_info_list": [20个作品],  // ✅ 总共 20 个作品
  "has_more": false,              // ✅ 没有更多了
  "cursor": "1758867587000"       // ✅ 分页游标
}
```

**作品数据示例**：

```javascript
作品 1:
  - item_id: @jfFo679LREb/sc9S5rruuNV5pyiWYi/3K6QvNqBpj6lIswSXR4wnWI00IRZ29Op55Vo7vwePIEQMQ5yWqXFFTQ==
  - title: 哈尔滨临终关怀医院 #临终关怀 #癌症晚期 #临终老人 #安宁疗护 #哈尔滨临终关怀医院
  - 评论数: 0
  - 媒体类型: 4 (视频)
  - 封面: https://p26-sign.douyinpic.com/tos-cn-i-dy/31bab240874b4e23a...

作品 2:
  - item_id: @jfFo679LREb/sc9S5rruuNV5pyiWZy3zJq0lOaBvja9GsAeXR4wnWI00IRZ29Op5SXd7a9JZczGG4j/PTCGKxA==
  - title: 用爱点亮归途 这里，是生命最后一程的温暖港湾.....
  - 评论数: 0
  - 媒体类型: 4 (视频)
  - 封面: https://p9-sign.douyinpic.com/tos-cn-i-dy/3faf905d8ac145e89d...

作品 3:
  - item_id: @jfFo679LREb/sc9S5rruuNV5pyiWYSvxLaopPa1ogKBEtwGWR4wnWI00IRZ29Op5QWyQ3wh3kGjPhP8m5vLd/w==
  - title: 哈尔滨临终关怀 守护生命最后的最严与安宁，我们，一直都在
  - 评论数: 1
  - 媒体类型: 4 (视频)
```

---

## 预期效果

修复后，当作品抓取功能运行时：

### 数据流

```
爬虫打开作品列表页面
  ↓
触发 API: https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=
  ↓
301 重定向到: https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=
  ↓
API 拦截器匹配成功（兼容模式：**/creator/item/list{/,}?**）
  ↓
onWorksListAPI() 回调执行
  ↓
dataManager.batchUpsertContents(body.item_info_list, DataSource.API)
  ↓
DataManager 存储 20 个作品
  ↓
快照显示 contents: 20 条 ✅
```

### 日志示例

修复后应该看到：

```json
{"level":"info","message":"✅ [API] 作品列表 -> DataManager: 20 个作品","service":"crawl-contents","timestamp":"2025-10-29 ..."}
```

### DataManager 快照

```json
{
  "comments": 3,
  "conversations": 28,
  "messages": 42,
  "contents": 20,  // ✅ 从 0 变为 20
  "notifications": 0
}
```

---

## 技术要点

### 1. HTTP 重定向与 API 拦截

**问题**：Playwright 的 API 拦截器拦截的是**最终请求**，而不是初始请求。

```
初始请求:  /item/list?cursor=   (301 重定向)
         ↓
最终请求:  /item/list/?cursor=  (200 成功) ← API 拦截器拦截这个
```

**教训**：注册 API 拦截器时，需要考虑**服务器重定向**的情况。

### 2. Glob 模式匹配

Playwright 使用 `minimatch` 库进行 URL 模式匹配，支持 glob 语法：

| 语法 | 说明 | 示例 |
|------|------|------|
| `**` | 匹配任意路径 | `**/api/**` |
| `?` | 匹配任意单个字符 | `user?.json` |
| `{a,b}` | 匹配 a 或 b | `{http,https}://` |
| `{/,}` | 可选斜杠 | `list{/,}?` |

**最佳实践**：
- 使用 `{/,}` 处理可选的末尾斜杠
- 使用 `?**` 匹配查询参数
- 使用 `**` 匹配任意前缀路径

### 3. 测试驱动的修复

修复流程：
1. ✅ 用户提供 HAR 文件（真实数据）
2. ✅ 分析 HAR 文件发现 URL 差异
3. ✅ 创建测试脚本验证模式匹配
4. ✅ 选择最佳模式（兼容模式）
5. ✅ 应用修复并验证

这种方法确保了：
- 基于真实数据（而非猜测）
- 可重现的测试
- 明确的验证标准

---

## 相关问题

### 为什么评论 API 没有这个问题？

评论 API 的 URL 格式：
```
https://creator.douyin.com/aweme/v1/web/comment/list?item_id=...&cursor=...
```

抖音**不会重定向**评论 API，所以模式 `**/comment/list?**` 完全有效。

### 为什么私信 API 没有这个问题？

私信 API 的 URL 格式：
```
https://creator.douyin.com/aweme/v1/creator/im/user_detail/
                                                           ↑
                                                      末尾本就有斜杠
```

私信 API 本来就有末尾斜杠，所以模式自然匹配。

### 为什么不直接使用 `list/?` 而是 `list{/,}?`？

**兼容性考虑**：
- 抖音可能在不同环境（如测试/生产）使用不同的 URL 格式
- 未来 API 更新可能改变重定向行为
- 使用兼容模式可以避免未来的问题

---

## 剩余工作

### ⚠️  作品抓取功能仍未运行

虽然修复了 API 拦截器模式，但是：

**问题**：作品抓取功能 (`crawlContents`) 仍未集成到监控任务循环中。

**影响**：
- API 拦截器现在**可以**正常工作
- 但是**没有代码**去打开作品列表页面
- 所以 API 仍然不会被触发

**解决方案**：
1. 在 `platform-base.js` 中添加 `crawlContents()` 接口
2. 在 `douyin/platform.js` 中实现该方法
3. 在 `monitor-task.js` 中添加到并行任务中

详见：[视频作品数据零问题分析报告.md](./视频作品数据零问题分析报告.md)

---

## 总结

### 问题根源

**API 拦截器模式不匹配**：
- 注册的模式：`**/creator/item/list?**`（无斜杠）
- 实际的 URL：`**/creator/item/list/?**`（有斜杠）

### 修复措施

使用兼容模式：`**/creator/item/list{/,}?**`，同时匹配有/无斜杠的 URL。

### 修复状态

| 组件 | 状态 | 说明 |
|------|------|------|
| API 拦截器模式 | ✅ 已修复 | 使用兼容模式匹配所有 URL 格式 |
| 回调函数实现 | ✅ 正常 | `onWorksListAPI()` 完整且正确 |
| DataManager 存储 | ✅ 正常 | `batchUpsertContents()` 已实现 |
| 监控任务集成 | ❌ 待完成 | 需要实现 `crawlContents()` 并集成 |

### 下一步

1. **短期**（可选）：手动触发作品 API 验证修复
2. **长期**（推荐）：完整实现作品抓取功能并集成到监控循环

---

**维护者**: Claude Code
**版本**: v1.0
**最后更新**: 2025-10-29
