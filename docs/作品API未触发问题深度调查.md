# 作品 API 未触发问题 - 深度调查报告

**日期**: 2025-10-29
**状态**: 🔍 调查中
**问题**: 虽然 API 拦截器已修复并注册，但作品 API 从未被触发

---

## 已确认的事实

### ✅ 1. API 拦截器模式已修复

**位置**: `packages/worker/src/platforms/douyin/platform.js:61`

```javascript
manager.register('**/creator/item/list{/,}?**', onWorksListAPI);
```

**测试结果**: 兼容模式匹配所有 URL 格式（4/4）

**证据**: `tests/测试API模式匹配.js` 输出
```
模式 3 匹配: 4/4 个 URL
🌟 兼容模式 (**/creator/item/list{/,}?**) 匹配所有 URL
```

### ✅ 2. API 拦截器已正确注册

**证据**: `packages/worker/logs/douyin-platform.log`
```json
{"message":"Registering API handlers for account acc-98296c87...","timestamp":"2025-10-29 15:03:58.776"}
{"message":"✅ API handlers registered (7 total) for account acc-98296c87...","timestamp":"2025-10-29 15:03:58.776"}
```

**确认**: 7 个 API 模式已注册，包括：
- 作品列表 API: `**/creator/item/list{/,}?**`
- 作品详情 API: `**/aweme/v1/web/aweme/detail/**`
- 评论相关 API (2 个)
- 私信相关 API (3 个)

### ✅ 3. 回调函数已正确实现

**位置**: `packages/worker/src/platforms/douyin/crawl-contents.js:136`

```javascript
async function onWorksListAPI(body, route) {
  if (!body || !body.item_info_list) return;

  if (globalContext.dataManager && body.item_info_list.length > 0) {
    const contents = globalContext.dataManager.batchUpsertContents(
      body.item_info_list,
      DataSource.API
    );
    logger.info(`✅ [API] 作品列表 -> DataManager: ${contents.length} 个作品`);
  }

  apiData.worksList.push(body);
  logger.debug(`收集到作品列表: ${body.item_info_list.length} 个...`);
}
```

**确认**:
- 函数已导出: `module.exports = { onWorksListAPI, ... }`
- 函数已导入: `const { onWorksListAPI, onWorkDetailAPI } = require('./crawl-contents');`

### ✅ 4. 评论爬虫会访问评论管理页面

**位置**: `packages/worker/src/platforms/douyin/crawl-comments.js:654-699`

```javascript
async function navigateToCommentManage(page) {
  logger.info('Navigating to comment management page (互动管理 - 评论管理)');

  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  logger.info('Successfully navigated to comment management page');
}
```

**证据**: `packages/worker/logs/douyin-crawl-comments.log`
```json
{"message":"Navigating to comment management page (互动管理 - 评论管理)","timestamp":"2025-10-29 15:15:38.632"}
{"message":"Successfully navigated to comment management page","timestamp":"2025-10-29 15:15:43.408"}
```

### ✅ 5. 评论爬虫会点击"选择作品"按钮

**位置**: `packages/worker/src/platforms/douyin/crawl-comments.js:153-160`

```javascript
// 点击"选择作品"按钮打开模态框
logger.info('Opening video selector modal');
try {
  await page.click('span:has-text("选择作品")', { timeout: 5000 });
  await page.waitForTimeout(2000);
} catch (error) {
  logger.warn('Failed to open video selector, videos may already be visible');
}
```

**预期行为**: 点击按钮 → 打开弹窗 → 显示作品列表 → 触发作品 API

---

## ❌ 问题现象

### 1. 作品 API 从未被拦截

**检查 API 拦截日志**:
```bash
$ grep "item/list" packages/worker/logs/api-interceptor.log
# 无输出
```

**检查作品爬取日志**:
```bash
$ ls -lh packages/worker/logs/crawl-contents.log
-rw-r--r-- 1 Administrator 197121 0 10月 29 15:02 crawl-contents.log
# 0 字节
```

**结论**: `onWorksListAPI` 回调函数从未被触发

### 2. DataManager 中作品数据为 0

**数据快照**:
```
✅ 会话 (conversations): 28 条
✅ 消息 (messages): 28 条
✅ 评论 (comments): 4 条
❌ 作品 (contents): 0 条
```

**结论**: 没有作品数据入库

---

## 🔍 深度调查

### 调查 1: MCP 手动测试

**操作**:
1. 使用 Playwright MCP 访问评论管理页面
2. 点击"选择作品"按钮
3. 观察弹窗和网络请求

**结果**:
```
✅ 页面加载成功
✅ 点击按钮成功
✅ 弹窗打开并显示"共43个视频"
✅ 作品列表显示正常
```

**网络请求**:
```
[GET] /aweme/v1/creator/item/list?cursor=... => [301]
[GET] /aweme/v1/creator/item/list/?cursor=... => [200]
```

**关键发现**: ✅ MCP 测试中确实触发了作品 API！

### 调查 2: Worker 爬虫日志对比

**MCP 测试 (成功)**:
- 浏览器: Playwright MCP (独立进程)
- API 拦截: 无（MCP 不使用 API 拦截器）
- 结果: 看到了作品 API 被调用

**Worker 爬虫 (失败)**:
- 浏览器: Worker 的 Playwright 实例
- API 拦截: 已注册 7 个模式
- 结果: 作品 API 从未被触发

**差异**:
- MCP 测试证明 API **确实存在**且**会被触发**
- Worker 爬虫没有触发 API，说明**可能有其他问题**

---

## 🤔 可能的原因

### 假设 1: API 在页面首次加载时已被调用（缓存）

**分析**:
- 评论管理页面首次加载时可能就调用了作品 API
- 点击"选择作品"按钮时，数据从缓存中读取
- API 拦截器只在页面刷新时捕获一次

**验证方法**:
```javascript
// 在 navigateToCommentManage 之后立即检查日志
// 如果此时就有 API 记录，说明是首次加载触发的
```

**可能性**: ⭐⭐⭐⭐⭐ 非常高

**证据**:
- MCP 测试中，访问页面后**立即显示了一个已选中的作品**
- 这说明页面加载时就获取了作品数据
- 点击"选择作品"按钮可能只是显示缓存的数据

### 假设 2: API 在页面加载时被触发，但在 API 拦截器注册之前

**分析**:
- Worker 启动流程:
  1. 创建浏览器上下文
  2. 注册 API 拦截器
  3. 导航到页面

- 如果页面加载过快，API 可能在拦截器注册完成之前就被调用

**可能性**: ⭐⭐ 较低

**原因**:
- API 拦截器在 `platform.js` 的 `initialize` 方法中注册
- 应该在任何页面导航之前就完成

### 假设 3: 评论爬虫点击按钮时，弹窗数据来自缓存

**分析**:
- 首次访问页面: 触发 API，获取作品列表
- 点击"选择作品": 从缓存读取，不触发新的 API
- API 拦截器: 只捕获第一次（页面加载时）

**可能性**: ⭐⭐⭐⭐⭐ 非常高

**证据**:
- 评论爬虫日志显示"Successfully navigated to comment management page"
- 但没有任何"item/list" API 的记录
- 说明 API 可能在页面加载时就被调用了

### 假设 4: API 拦截器模式仍然不匹配

**分析**:
- 虽然测试脚本显示模式匹配成功
- 但 Playwright 的实际匹配逻辑可能不同

**可能性**: ⭐ 非常低

**原因**:
- `minimatch` 是 Playwright 内部使用的库
- 测试结果应该可靠
- 其他 API (评论、私信) 都能正常拦截，说明拦截器本身没问题

### 假设 5: Worker 浏览器和 MCP 浏览器行为不同

**分析**:
- Worker 使用持久化浏览器上下文（有 Cookie、缓存）
- MCP 使用全新的浏览器实例（无缓存）
- 持久化上下文可能导致缓存行为不同

**可能性**: ⭐⭐⭐ 中等

**证据**:
- Worker 的浏览器保留了登录状态和缓存
- 可能导致某些 API 不会重复调用

---

## 🎯 最可能的根本原因

### 核心问题: 作品 API 在页面首次加载时就被调用，但此时 API 拦截器可能还未生效

**完整流程分析**:

#### Worker 启动流程

```
1. Worker 启动
   ↓
2. 创建平台实例 (platform.js)
   ↓
3. 调用 platform.initialize()
   ↓
4. 注册 API 拦截器
   ↓
5. 监控任务开始
   ↓
6. 执行 crawlComments()
   ↓
7. navigateToCommentManage(page)  ← 导航到评论管理页面
   ↓
8. 页面加载 → 触发作品 API  ← 问题可能在这里
   ↓
9. 点击"选择作品" → 从缓存读取，不触发新 API
```

**关键时间点**:

| 时间 | 事件 | API 拦截器状态 |
|------|------|----------------|
| T1 | Worker 启动 | 未注册 |
| T2 | 注册 API 拦截器 | ✅ 已注册 |
| T3 | 导航到评论页面 | ✅ 已注册 |
| T4 | **页面加载，触发作品 API** | ✅ 应该能拦截 |
| T5 | 点击"选择作品" | ✅ 已注册（但数据来自缓存） |

**问题点**: 如果 T4 时刻 API 被触发，但没有被拦截，说明：

1. API 拦截器可能针对特定的 Page 实例注册
2. `crawlComments` 使用的 Page 可能没有正确注册拦截器
3. 需要检查 API 拦截器的注册机制

---

## 🔧 下一步调查

### 调查 1: 检查 API 拦截器的注册时机

**目标**: 确认 API 拦截器何时注册，针对哪个 Page 实例

**方法**:
1. 查看 `platform.js` 的 `initialize` 方法
2. 查看 `registerAPIHandlers` 的调用时机
3. 确认拦截器是针对浏览器上下文还是特定 Page

**位置**: `packages/worker/src/platforms/douyin/platform.js`

### 调查 2: 检查评论爬虫使用的 Page 实例

**目标**: 确认 `crawlComments` 使用的 Page 是否已注册拦截器

**方法**:
1. 查看 `crawlComments` 如何获取 Page
2. 确认是否使用 TabManager 获取
3. 检查 TabManager 返回的 Page 是否有拦截器

**位置**: `packages/worker/src/platforms/douyin/crawl-comments.js`

### 调查 3: 添加详细日志

**目标**: 精确记录 API 拦截器的触发时机

**方法**:
```javascript
// 在 onWorksListAPI 开头添加
console.log('[DEBUG] onWorksListAPI called at:', new Date().toISOString());
console.log('[DEBUG] URL:', route.request().url());
console.log('[DEBUG] Body:', JSON.stringify(body).substring(0, 200));
```

**位置**: `packages/worker/src/platforms/douyin/crawl-contents.js:136`

### 调查 4: 强制刷新测试

**目标**: 测试强制刷新是否会触发 API

**方法**:
```javascript
// 在 navigateToCommentManage 中添加
await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
  waitUntil: 'networkidle',
  timeout: 30000,
});

// 添加强制刷新
await page.reload({ waitUntil: 'networkidle' });
```

**预期**: 如果刷新后能看到 API 拦截记录，说明问题确实是缓存

---

## 📝 临时结论

基于目前的调查，**最可能的情况**是：

1. ✅ API 拦截器模式正确
2. ✅ API 拦截器已注册
3. ✅ 回调函数已实现
4. ✅ 评论爬虫会访问页面
5. ❌ **作品 API 在某个时刻被调用了，但没有被拦截器捕获**

**可能原因**:
- API 在页面加载时就被调用（而非点击按钮时）
- API 拦截器可能针对特定的 Page 实例，而评论爬虫使用的 Page 没有注册
- 需要深入检查 API 拦截器的注册机制和 Page 管理

**下一步**:
1. 检查 API 拦截器是如何针对 Page 注册的
2. 检查评论爬虫获取的 Page 是否有拦截器
3. 添加详细日志验证 API 调用时机
4. 测试强制刷新是否能触发 API

---

**维护者**: Claude Code
**版本**: v1.0
**最后更新**: 2025-10-29
