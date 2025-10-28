# API 拦截器统一管理重构进度报告

## 重构目标

实现极简的 API 拦截器架构：
- **platform.js**: 唯一注册点（导入所有回调 + 注册到 API pattern）
- **crawl-*.js**: 只定义回调函数（不参与注册）
- **APIInterceptorManager**: 底层拦截机制（透明）

## 完成情况

### ✅ 已完成

#### 1. crawl-contents.js 重构 (100%)
- ✅ 添加模块级 API 数据存储 (apiData)
- ✅ 提取 API 回调函数：
  - `onWorksListAPI()` - 作品列表 API
  - `onWorkDetailAPI()` - 作品详情 API
- ✅ 移除旧的 `setupAPIInterceptors()` 函数
- ✅ 更新 `crawlContents()` 函数使用 apiData
- ✅ 更新 module.exports 导出回调函数

**文件路径**: `packages/worker/src/platforms/douyin/crawl-contents.js`

**API 回调函数**:
```javascript
// 已导出的回调函数
module.exports = {
  onWorksListAPI,      // **/aweme/v1/web/aweme/post/**
  onWorkDetailAPI,     // **/aweme/v1/web/aweme/detail/**
  crawlContents,
  ...
};
```

#### 2. crawl-comments.js 重构 (100%)
- ✅ 添加模块级 API 数据存储 (apiData)
- ✅ 提取 API 回调函数：
  - `onCommentsListAPI()` - 评论列表 API
  - `onDiscussionsListAPI()` - 回复列表 API
- ✅ 移除旧的 `page.on('response')` 监听器（行114-258）
- ✅ 更新 `crawlComments()` 函数使用 apiData
- ✅ 批量替换所有 `apiResponses.` 为 `apiData.`
- ✅ 更新 module.exports 导出回调函数

**文件路径**: `packages/worker/src/platforms/douyin/crawl-comments.js`

**API 回调函数**:
```javascript
// 已导出的回调函数
module.exports = {
  onCommentsListAPI,      // **/comment/list/**
  onDiscussionsListAPI,   // **/comment/reply/list/**
  crawlComments,
  ...
};
```

#### 3. 文档 (100%)
- ✅ 创建完整的使用指南：`docs/09-API拦截器统一管理使用指南.md`
- ✅ 包含设计理念、核心用法、完整示例
- ✅ 架构优势说明、数据流图、注意事项

### ⏳ 进行中

#### 4. crawl-direct-messages-v2.js 重构 (0%)
需要完成：
- [ ] 添加模块级 API 数据存储
- [ ] 提取 API 回调函数：
  - `onMessageInitAPI()` - 初始化消息 API
  - `onConversationListAPI()` - 会话列表 API
  - `onMessageHistoryAPI()` - 消息历史 API
- [ ] 移除旧的 `setupAPIInterceptors()` 函数
- [ ] 更新 `crawlDirectMessagesV2()` 函数
- [ ] 更新 module.exports

**API Patterns**:
```javascript
// 需要注册的 API
'**/v2/message/get_by_user_init**'         → onMessageInitAPI
'**/v1/stranger/get_conversation_list**'   → onConversationListAPI
'**/v1/im/message/history**'               → onMessageHistoryAPI
```

### ⏳ 待开始

#### 5. platform.js 更新 (0%)
需要完成：
- [ ] 导入所有 API 回调函数
- [ ] 更新 `registerAPIHandlers()` 方法
- [ ] 注册所有 7 个 API 回调

**目标代码结构**:
```javascript
// platform.js
const { onWorksListAPI, onWorkDetailAPI } = require('./crawl-contents');
const { onCommentsListAPI, onDiscussionsListAPI } = require('./crawl-comments');
const { onMessageInitAPI, onConversationListAPI, onMessageHistoryAPI } = require('./crawl-direct-messages-v2');

async registerAPIHandlers(manager, accountId) {
  logger.info(`Registering API handlers for account ${accountId}`);

  // 作品相关
  manager.register('**/aweme/v1/web/aweme/post/**', onWorksListAPI);
  manager.register('**/aweme/v1/web/aweme/detail/**', onWorkDetailAPI);

  // 评论相关
  manager.register('**/comment/list/**', onCommentsListAPI);
  manager.register('**/comment/reply/list/**', onDiscussionsListAPI);

  // 私信相关
  manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);
  manager.register('**/v1/stranger/get_conversation_list**', onConversationListAPI);
  manager.register('**/v1/im/message/history**', onMessageHistoryAPI);

  logger.info(`API handlers registered (7 total)`);
}
```

#### 6. 测试验证 (0%)
需要验证：
- [ ] Worker 启动无错误
- [ ] Platform 初始化成功
- [ ] API 拦截器正常工作
- [ ] 作品爬取功能正常
- [ ] 评论爬取功能正常
- [ ] 私信爬取功能正常

## API 回调函数汇总

| API Pattern | 回调函数 | 文件 | 状态 |
|------------|---------|------|------|
| `**/aweme/v1/web/aweme/post/**` | `onWorksListAPI` | crawl-contents.js | ✅ |
| `**/aweme/v1/web/aweme/detail/**` | `onWorkDetailAPI` | crawl-contents.js | ✅ |
| `**/comment/list/**` | `onCommentsListAPI` | crawl-comments.js | ✅ |
| `**/comment/reply/list/**` | `onDiscussionsListAPI` | crawl-comments.js | ✅ |
| `**/v2/message/get_by_user_init**` | `onMessageInitAPI` | crawl-direct-messages-v2.js | ⏳ |
| `**/v1/stranger/get_conversation_list**` | `onConversationListAPI` | crawl-direct-messages-v2.js | ⏳ |
| `**/v1/im/message/history**` | `onMessageHistoryAPI` | crawl-direct-messages-v2.js | ⏳ |

## 下一步行动

1. ✅ **完成 crawl-direct-messages-v2.js 重构**
   - 提取 3 个 API 回调函数
   - 更新数据引用

2. ✅ **更新 platform.js**
   - 导入所有回调函数
   - 在 registerAPIHandlers() 中注册

3. ✅ **测试验证**
   - 启动 Worker
   - 执行爬取任务
   - 验证数据收集

## 技术要点

### 数据存储模式
```javascript
// 每个 crawl 文件的模块级闭包
const apiData = {
  worksList: [],      // 存储 API 响应
  workDetail: [],
  cache: new Set()    // URL 去重
};
```

### 回调函数签名
```javascript
async function onXxxAPI(body, route, response) {
  // body: 解析后的 JSON 数据
  // route: Playwright Route 对象
  // response: Playwright Response 对象
}
```

### 清理模式
```javascript
async function crawlXxx(page, account) {
  // 清空之前的数据
  apiData.xxx = [];
  apiData.cache.clear();

  // 执行 DOM 操作...

  // 返回收集的数据
  return { data: apiData.xxx };
}
```

## 已知问题

### crawl-comments.js 特殊情况
- 原代码使用 `page.on('response')` 而不是 `page.route()`
- APIInterceptorManager 使用 `page.route()` 机制
- 已创建兼容的回调函数，但需要测试验证

### 建议
1. 测试时重点关注 comments API 拦截是否正常
2. 如有问题，可能需要 APIInterceptorManager 支持 response 监听模式

---

**最后更新**: 2025-10-28
**完成度**: 60% (2/5 任务完成)
