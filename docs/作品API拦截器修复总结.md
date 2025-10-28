# 作品列表 API 拦截器修复总结

**日期**: 2025-10-28
**版本**: v1.0
**问题**: 作品列表 API 未被拦截
**状态**: ✅ 已修复并验证

---

## 📋 问题描述

用户报告：跳转到评论管理中心 `https://creator.douyin.com/creator-micro/interactive/comment` 后，页面会触发作品列表 API `https://creator.douyin.com/aweme/v1/creator/item/list/?cursor=...`，但我们的 API 拦截器没有拦截到这个请求。

---

## 🔍 根本原因分析

### 原因 1: API 模式匹配错误

**问题代码**:
```javascript
// packages/worker/src/platforms/douyin/platform.js:64
manager.register('**/creator/item/list/**', onWorksListAPI);
```

**实际 API URL**:
```
https://creator.douyin.com/aweme/v1/creator/item/list?cursor=&aid=2906&...
```

**分析**:
- Playwright 的 glob 模式 `**/creator/item/list/**` 要求路径以 `/` 结尾
- 但实际 URL 是 `item/list?cursor=...`（带查询参数，不以 `/` 结尾）
- 因此模式**不匹配**，导致拦截器不生效

**测试证据**:
```
捕获到的请求: https://creator.douyin.com/aweme/v1/creator/item/list?cursor=...
模式 **/creator/item/list/** → ❌ 不匹配
模式 **/creator/item/list?** → ✅ 匹配
```

### 原因 2: API 响应数据结构错误

**问题代码**:
```javascript
// packages/worker/src/platforms/douyin/crawl-contents.js:107
async function onWorksListAPI(body, route) {
  if (!body || !body.aweme_list) return;  // ❌ 错误的字段名
  // ...
}
```

**实际 API 响应结构**:
```json
{
  "cursor": "1758867587000",
  "has_more": false,
  "item_info_list": [  // ✅ 正确的字段名
    {
      "anchor_user_id": "3607962860399156",
      "comment_count": 0,
      "cover_image_url": "...",
      // ...
    }
  ],
  "total_count": 19,
  "status_code": 0,
  "status_msg": "success"
}
```

**分析**:
- 实际字段是 `item_info_list`，不是 `aweme_list`
- 回调函数检查 `aweme_list` 导致即使拦截成功，数据也无法收集

---

## ✅ 修复方案

### 修复 1: 更新 API 模式

**文件**: `packages/worker/src/platforms/douyin/platform.js`

```diff
  async registerAPIHandlers(manager, accountId) {
    logger.info(`Registering API handlers for account ${accountId}`);

    // 作品相关 API
-   manager.register('**/creator/item/list/**', onWorksListAPI);
+   manager.register('**/creator/item/list?**', onWorksListAPI);  // ✅ 匹配带查询参数的 API
    manager.register('**/aweme/v1/web/aweme/detail/**', onWorkDetailAPI);
```

**说明**:
- `**/creator/item/list?**` 能匹配 `item/list?cursor=...` 这种格式
- `?**` 表示可选的 `?` 后跟任意字符

### 修复 2: 更新回调函数数据结构

**文件**: `packages/worker/src/platforms/douyin/crawl-contents.js`

```diff
  /**
   * API 回调：作品列表
   * 由 platform.js 注册到 APIInterceptorManager
+  * API 返回格式: { item_info_list: [...], cursor, has_more, total_count, status_code }
   */
  async function onWorksListAPI(body, route) {
-   if (!body || !body.aweme_list) return;
+   // ✅ 修正：检查 item_info_list 而不是 aweme_list
+   if (!body || !body.item_info_list) return;

    const url = route.request().url();

    // URL 去重
    if (apiData.cache.has(url)) {
      return;
    }

    apiData.cache.add(url);
    apiData.worksList.push(body);

-   logger.debug(`收集到作品列表: ${body.aweme_list.length} 个`);
+   logger.debug(`收集到作品列表: ${body.item_info_list.length} 个，has_more: ${body.has_more}, total: ${body.total_count || 'N/A'}`);
  }
```

---

## 🧪 测试验证

### 测试脚本

创建了专用测试脚本 `tests/测试作品API拦截.js`，测试内容：
1. 注册多种 API 模式
2. 导航到评论管理页面
3. 监听所有网络请求
4. 验证 API 拦截器是否工作
5. 检查响应数据结构

### 测试结果

**✅ 测试通过**：

```
🎯 拦截到请求: **/creator/item/list?**
   URL: https://creator.douyin.com/aweme/v1/creator/item/list?cursor=...

📦 API 响应数据结构:
   响应体键: cursor, extra, has_more, item_info_list, status_code, status_msg, total_count

✅ 收集到作品列表: 19 个作品
   has_more: false, total_count: 19

📊 测试结果:
   拦截到的 API 响应数量: 1
   捕获到的相关请求数量: 3

   ✅ API 拦截器工作正常！
```

### 测试环境

- **Worker PID**: 测试独立运行
- **账户**: acc-98296c87-2e42-447a-9d8b-8be008ddb6e4
- **测试页面**: https://creator.douyin.com/creator-micro/interactive/comment
- **测试时间**: 2025-10-28 14:10

---

## 📊 修复前后对比

| 指标 | 修复前 | 修复后 | 改进 |
|-----|-------|-------|------|
| **API 拦截成功率** | 0% | 100% | +100% |
| **作品数据收集** | 0 个 | 19 个 | ∞ |
| **模式匹配** | `**/creator/item/list/**` | `**/creator/item/list?**` | ✅ |
| **数据字段检查** | `aweme_list` | `item_info_list` | ✅ |
| **日志输出** | 无 | 详细统计 | ✅ |

---

## 🔑 关键技术点

### Playwright Route Matching

Playwright 的 glob 模式匹配规则：
- `**/path/**` - 要求路径以 `/` 结尾
- `**/path*` - 匹配以 `path` 开头的路径
- `**/path?**` - 匹配带查询参数的路径（推荐）
- `**/path/?**` - 匹配可选斜杠 + 查询参数

**最佳实践**:
对于 API 端点，总是使用 `**/path?**` 模式以匹配查询参数。

### API 响应数据结构差异

不同抖音 API 的数据结构：

| API | 数据字段 | 说明 |
|-----|---------|------|
| `/creator/item/list` | `item_info_list` | ✅ 作品列表（创作者平台） |
| `/aweme/v1/web/aweme/post` | `aweme_list` | 作品列表（Web 版） |
| `/comment/list` | `comment_info_list` | 评论列表 |
| `/comment/reply/list` | `reply_info_list` | 讨论回复列表 |
| `/creator/im/user_detail` | `user_list` | 私信会话列表 |

**教训**:
- 不要假设所有 API 使用相同的字段名
- 在拦截器中添加详细日志以便调试
- 验证实际 API 响应结构（使用 `tests/api.txt` 或网络面板）

---

## 🎯 影响范围

### 受益功能

1. **作品列表爬虫** (`crawl-contents.js`)
   - 现在可以正确拦截和收集 API 数据
   - 无需虚拟列表滚动即可获取完整作品列表
   - 性能提升：API 优先 > DOM 解析

2. **评论爬虫** (`crawl-comments.js`)
   - 评论管理页面加载时，作品列表 API 会被自动拦截
   - 可以获取作品元数据（标题、封面、统计数据等）
   - 与评论数据关联更准确

3. **所有使用 `getPageWithAPI` 的爬虫**
   - 框架级别的改进自动受益
   - 无需手动管理 API 拦截器

### 代码文件变更

✅ **已修改**:
- `packages/worker/src/platforms/douyin/platform.js` - API 模式注册
- `packages/worker/src/platforms/douyin/crawl-contents.js` - 回调函数数据结构

✅ **新增**:
- `tests/测试作品API拦截.js` - 专用测试脚本

📝 **相关文档**:
- `docs/API拦截器模式调整总结.md` - 之前的评论/私信 API 修复
- `docs/API拦截器验证报告.md` - 私信 API 拦截验证
- `docs/API拦截器生命周期说明.md` - 拦截器技术细节

---

## 🚀 后续建议

### 1. 完善测试覆盖

建议为所有 7 个 API 拦截器创建独立测试：
- ✅ `/creator/im/user_detail/` - 已验证（私信会话）
- ✅ `/creator/item/list?**` - 已验证（作品列表）
- ⏳ `/comment/list/**` - 待验证（需大量评论的视频）
- ⏳ `/comment/reply/list/**` - 待验证（讨论回复）
- ⏳ `/aweme/v1/web/aweme/detail/**` - 待验证（作品详情）
- ⏳ `/v2/message/get_by_user_init**` - 待验证（私信初始化）
- ⏳ `/v1/im/message/history**` - 待验证（消息历史）

### 2. 增强日志系统

建议在 APIInterceptorManager 中添加：
```javascript
async enable() {
  for (const [pattern, handlers] of this.handlers.entries()) {
    const routeHandler = async (route) => {
      const url = route.request().url();
      logger.debug(`🎯 Pattern matched: ${pattern} → ${url}`);  // ✅ 添加调试日志

      const response = await route.fetch();
      const body = await this.parseJSON(response);

      for (const handler of handlers) {
        await handler(body, route, response);
      }

      await route.fulfill({ response });
    };

    await this.page.route(pattern, routeHandler);
  }
}
```

### 3. API 响应数据字典

建议创建 `API_RESPONSE_SCHEMA.md` 文档记录所有 API 的响应结构：
- 字段名称和类型
- 示例响应
- 字段用途说明
- 版本历史（如果有变化）

---

## 📝 相关文档

### 本次修复系列

1. [API拦截器模式调整总结.md](./API拦截器模式调整总结.md) - 评论/讨论/私信 API 修复
2. [API拦截器验证报告.md](./API拦截器验证报告.md) - 私信 API 拦截验证（105 会话）
3. [API拦截器生命周期说明.md](./API拦截器生命周期说明.md) - 拦截器技术原理
4. **本文档** - 作品列表 API 修复

### 技术参考

- [04-WORKER-平台扩展指南.md](./04-WORKER-平台扩展指南.md) - 平台扩展指南
- [05-DOUYIN-平台实现技术细节.md](./05-DOUYIN-平台实现技术细节.md) - 抖音平台技术细节
- [06-WORKER-爬虫调试指南.md](./06-WORKER-爬虫调试指南.md) - 爬虫调试指南

---

## ✅ 总结

### 修复成功

1. ✅ **API 模式修正**: `**/creator/item/list/**` → `**/creator/item/list?**`
2. ✅ **数据结构修正**: `aweme_list` → `item_info_list`
3. ✅ **功能验证**: 成功拦截 19 个作品数据
4. ✅ **测试脚本**: 创建独立测试脚本验证功能

### 核心教训

1. **模式匹配细节很重要**: glob 模式需要精确匹配实际 URL 格式
2. **不要假设数据结构**: 不同 API 可能使用不同的字段名
3. **测试驱动调试**: 独立测试脚本极大提高了调试效率
4. **详细日志**: 输出完整的数据结构帮助快速定位问题

### 系统状态

| API 拦截器 | 状态 | 验证时间 |
|-----------|------|---------|
| 作品列表 `/creator/item/list?**` | ✅ 工作正常 | 2025-10-28 14:10 |
| 作品详情 `/aweme/v1/web/aweme/detail/**` | 🔄 待验证 | - |
| 评论列表 `/comment/list/**` | ⚠️ 未触发（评论数少） | 2025-10-28 13:30 |
| 讨论回复 `/comment/reply/list/**` | ⚠️ 未触发（评论数少） | 2025-10-28 13:30 |
| 私信会话 `/creator/im/user_detail/**` | ✅ 工作正常 | 2025-10-28 13:30 |
| 私信初始化 `/v2/message/get_by_user_init**` | 🔄 待验证 | - |
| 消息历史 `/v1/im/message/history**` | 🔄 待验证 | - |

---

**修复人**: Claude Code
**验证时间**: 2025-10-28 14:10
**状态**: ✅ 已完成并验证
**版本**: 1.0

