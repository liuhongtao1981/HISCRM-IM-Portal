# 作品 API 拦截器验证报告 - 最终版

**日期**: 2025-10-29
**验证状态**: ✅ API 端点和重定向行为已确认
**修复状态**: ✅ 兼容模式修复正确

---

## 验证过程

### 1. 用户反馈的关键信息

用户指出了一个**重要细节**：

> 是跳转到评论管理页面 `https://creator.douyin.com/creator-micro/interactive/comment` 才会触发 API

这解释了为什么之前我们访问内容管理页面 (`/content/manage`) 看到了不同的 API (`/janus/douyin/creator/pc/work_list`)。

### 2. 实际验证测试

使用 Playwright MCP 访问评论管理页面：

```
URL: https://creator.douyin.com/creator-micro/interactive/comment
操作: 加载页面 → 点击作品 → 查看网络请求
```

### 3. 关键发现：API 调用序列

从网络请求日志中发现的**真实 API 调用**：

```
[GET] https://creator.douyin.com/aweme/v1/creator/item/list?cursor=&aid=2906&...
      => [301] Moved Permanently
      ↓
[GET] https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=&aid=2906&...
                                                             ↑
                                                        末尾有斜杠
      => [200] OK
```

**完整的重定向流程**：

1. 初始请求：`/creator/item/list?cursor=`（无斜杠）
2. 服务器响应：`301 Moved Permanently`
3. 浏览器自动重定向到：`/creator/item/list/?cursor=`（有斜杠）
4. 最终响应：`200 OK`（返回作品数据）

### 4. API 端点确认

✅ **确认的 API 端点**：
```
https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=...
```

✅ **确认的重定向行为**：
- 抖音服务器会将无斜杠的 URL 重定向到有斜杠的 URL
- 重定向状态码：301 (Moved Permanently)
- Playwright 拦截的是**最终请求**（有斜杠的 URL）

---

## 之前的修复验证

### 原始问题回顾

**问题**：API 拦截器注册了但从未触发，作品数据为 0

**原因分析**：
- 注册的模式：`**/creator/item/list?**`（只匹配无斜杠）
- 实际的 URL：`**/creator/item/list/?**`（有斜杠）
- **模式不匹配** → API 拦截器从未触发

### 应用的修复

**修复位置**：`packages/worker/src/platforms/douyin/platform.js:61`

**修复前**：
```javascript
manager.register('**/creator/item/list?**', onWorksListAPI);
```

**修复后**：
```javascript
manager.register('**/creator/item/list{/,}?**', onWorksListAPI);  // ✅ 兼容模式
```

**模式说明**：
- `{/,}` 表示匹配 `/` 或空字符串（可选的斜杠）
- 等价于两个模式的组合：
  - `**/creator/item/list?**`（无斜杠）
  - `**/creator/item/list/?**`（有斜杠）

### 修复验证

使用测试脚本 `tests/测试API模式匹配.js` 验证：

```bash
$ node tests/测试API模式匹配.js

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
```

**结论**：✅ 兼容模式可以匹配所有可能的 URL 格式

---

## 与其他 API 的对比

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

### 为什么作品 API 有这个问题？

作品 API 的特殊性：
1. 初始请求没有斜杠：`/creator/item/list?...`
2. 服务器强制重定向到有斜杠：`/creator/item/list/?...`
3. Playwright 拦截的是**最终请求**（有斜杠）
4. 如果模式只匹配无斜杠，拦截器永远不会触发

---

## 不同页面的 API 差异

### 评论管理页面 (✅ 正确的 API)

```
URL: https://creator.douyin.com/creator-micro/interactive/comment
API: https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=...
用途: 加载当前选中的作品信息
```

**这是我们需要拦截的 API** ✅

### 内容管理页面 (❌ 不同的 API)

```
URL: https://creator.douyin.com/creator-micro/content/manage
API: https://creator.douyin.com/janus/douyin/creator/pc/work_list?status=0&count=12&...
用途: 加载作品列表（批量）
```

**这是完全不同的 API 端点** ❌

### 为什么会有两个不同的 API？

| 页面 | API 端点 | 用途 | 数据量 |
|------|---------|------|--------|
| 评论管理 | `/creator/item/list/` | 获取单个或少量作品详情 | 小 |
| 内容管理 | `/janus/douyin/creator/pc/work_list` | 批量获取作品列表 | 大 |

**结论**：抖音在不同的页面使用不同的 API 端点来优化性能。

---

## 当前修复的有效性

### ✅ 已修复

1. **API 拦截器模式**：使用兼容模式 `{/,}` 匹配所有 URL 格式
2. **测试验证**：通过模式匹配测试，确认 100% 匹配率
3. **网络请求验证**：通过实际页面访问，确认 API 端点和重定向行为

### ⚠️  仍需实现

虽然 API 拦截器模式已修复，但**作品抓取功能仍未运行**：

**问题**：
- `crawlContents()` 方法未实现
- 未集成到监控任务循环中
- 没有代码去打开评论管理页面

**影响**：
- API 拦截器现在**可以**正常工作
- 但是**没有代码**去触发 API
- 所以 API 仍然不会被触发
- 作品数据仍然为 0

**解决方案**：参见 [视频作品数据零问题分析报告.md](./视频作品数据零问题分析报告.md)

---

## 技术要点总结

### 1. HTTP 重定向与 API 拦截

**关键概念**：Playwright 的 API 拦截器拦截的是**最终请求**，而不是初始请求。

```
初始请求:  /item/list?cursor=   (301 重定向) ← 不会被拦截
         ↓
最终请求:  /item/list/?cursor=  (200 成功)   ← API 拦截器拦截这个
```

**教训**：注册 API 拦截器时，需要考虑**服务器重定向**的情况。

### 2. Glob 模式最佳实践

| 语法 | 说明 | 示例 |
|------|------|------|
| `**` | 匹配任意路径 | `**/api/**` |
| `?` | 匹配任意单个字符 | `user?.json` |
| `{a,b}` | 匹配 a 或 b | `{http,https}://` |
| `{/,}` | 可选斜杠 | `list{/,}?` |

**推荐**：
- 使用 `{/,}` 处理可选的末尾斜杠
- 使用 `?**` 匹配查询参数
- 使用 `**` 匹配任意前缀路径

### 3. 不同页面不同 API

**发现**：抖音创作者中心在不同页面使用不同的 API 端点：

- **评论管理页面**：`/creator/item/list/`（少量作品）
- **内容管理页面**：`/janus/douyin/creator/pc/work_list`（批量作品）

**教训**：
- 不能仅依赖一个 HAR 文件
- 需要在不同的页面和场景下测试
- 相同功能可能有多个 API 版本

### 4. 测试驱动的验证

**验证流程**：
1. ✅ 用户提供 HAR 文件（初始证据）
2. ✅ 分析 HAR 文件发现 URL 差异
3. ✅ 创建测试脚本验证模式匹配
4. ✅ 实际访问页面确认 API 调用
5. ✅ 对比不同页面的 API 差异

**优势**：
- 基于真实数据（而非猜测）
- 可重现的测试
- 明确的验证标准
- 全面的场景覆盖

---

## 最终结论

### ✅ API 拦截器修复正确

**修复措施**：
```javascript
// 使用兼容模式：同时匹配有/无斜杠的 URL
manager.register('**/creator/item/list{/,}?**', onWorksListAPI);
```

**验证结果**：
- ✅ 模式匹配测试：100% 匹配率
- ✅ 网络请求验证：确认 API 端点和重定向
- ✅ 多场景验证：评论管理页面 + 内容管理页面

### ⚠️  下一步工作

虽然 API 拦截器已修复，但需要：

1. **短期**（可选）：手动触发作品 API 验证修复
2. **长期**（推荐）：完整实现作品抓取功能并集成到监控循环

详见：[视频作品数据零问题分析报告.md](./视频作品数据零问题分析报告.md)

---

## 相关文档

- [作品API拦截器模式修复报告.md](./作品API拦截器模式修复报告.md) - 初始修复报告
- [视频作品数据零问题分析报告.md](./视频作品数据零问题分析报告.md) - 完整问题分析
- [消息数据零问题修复报告.md](./消息数据零问题修复报告.md) - 类似问题案例
- [05-DOUYIN-平台实现技术细节.md](./05-DOUYIN-平台实现技术细节.md)
- [06-WORKER-爬虫调试指南.md](./06-WORKER-爬虫调试指南.md)

---

**维护者**: Claude Code
**版本**: v2.0
**最后更新**: 2025-10-29
