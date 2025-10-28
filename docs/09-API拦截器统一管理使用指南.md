# API 拦截器统一管理使用指南

## 设计理念

**极简设计**：
- **platform.js** = 唯一注册点（所有 API pattern + 回调函数都在这里注册）
- **crawl-*.js** = 只定义回调函数，不参与注册逻辑

## 核心用法

### 1. 基本使用

```javascript
const manager = new APIInterceptorManager(page);

// 注册处理器
manager.register('**/api/comments/**', async (body) => {
  console.log('评论数据:', body);
});

// 同一个 API 可以注册多个处理器
manager.register('**/api/comments/**', async (body) => {
  console.log('统计评论数:', body.comments.length);
});

// 启用拦截器
await manager.enable();
```

### 2. crawl 文件只定义回调函数

**crawl-contents.js** - 只定义回调函数，不参与注册：
```javascript
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('crawl-contents');

// 数据存储（模块级闭包）
const apiData = {
  worksList: [],
  workDetail: [],
  cache: new Set()
};

// API 回调函数：作品列表
async function onWorksListAPI(body, route) {
  if (!body || !body.aweme_list) return;

  const url = route.request().url();
  if (apiData.cache.has(url)) return;

  apiData.cache.add(url);
  apiData.worksList.push(body);
  logger.debug(`收集到作品列表: ${body.aweme_list.length} 个`);
}

// API 回调函数：作品详情
async function onWorkDetailAPI(body) {
  if (!body) return;

  apiData.workDetail.push(body);
  logger.debug(`收集到作品详情`);
}

// 只导出回调函数
module.exports = {
  onWorksListAPI,
  onWorkDetailAPI
};
```

**crawl-comments.js** - 只定义回调函数：
```javascript
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('crawl-comments');

const apiData = {
  comments: [],
  discussions: []
};

// API 回调函数：评论列表
async function onCommentsListAPI(body) {
  if (!body || !body.comment_info_list) return;

  apiData.comments.push(...body.comment_info_list);
  logger.debug(`收集到评论: ${body.comment_info_list.length} 条`);
}

// API 回调函数：回复列表
async function onDiscussionsListAPI(body) {
  if (!body || !body.comment_info_list) return;

  apiData.discussions.push(...body.comment_info_list);
  logger.debug(`收集到讨论: ${body.comment_info_list.length} 条`);
}

module.exports = {
  onCommentsListAPI,
  onDiscussionsListAPI
};
```

**crawl-direct-messages-v2.js** - 只定义回调函数：
```javascript
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('crawl-dm');

const apiData = {
  init: [],
  conversations: [],
  history: []
};

// API 回调函数：初始化消息
async function onMessageInitAPI(body) {
  if (!body || !body.data || !body.data.messages) return;
  apiData.init.push(body);
  logger.debug(`收集到初始化消息: ${body.data.messages.length} 条`);
}

// API 回调函数：会话列表
async function onConversationListAPI(body) {
  if (!body || !body.data) return;
  apiData.conversations.push(body);
  logger.debug(`收集到会话列表`);
}

// API 回调函数：消息历史
async function onMessageHistoryAPI(body) {
  if (!body || !body.data || !body.data.messages) return;
  apiData.history.push(body);
  logger.debug(`收集到历史消息: ${body.data.messages.length} 条`);
}

module.exports = {
  onMessageInitAPI,
  onConversationListAPI,
  onMessageHistoryAPI
};
```

### 3. platform.js 统一注册所有 API

**platform.js 是唯一的注册点** - 导入所有回调函数并注册：

```javascript
const { APIInterceptorManager } = require('../base/api-interceptor-manager');

// 导入所有 API 回调函数
const { onWorksListAPI, onWorkDetailAPI } = require('./crawl-contents');
const { onCommentsListAPI, onDiscussionsListAPI } = require('./crawl-comments');
const { onMessageInitAPI, onConversationListAPI, onMessageHistoryAPI } = require('./crawl-direct-messages-v2');

class DouyinPlatform extends PlatformBase {
  async initialize(account) {
    await super.initialize(account);

    const { page } = await this.browserManager.tabManager.getPageForTask(account.id, {
      tag: TabTag.MAIN,
      persistent: true
    });

    const manager = new APIInterceptorManager(page);

    // 统一注册所有 API（pattern + callback）
    manager.register('**/aweme/v1/web/aweme/post/**', onWorksListAPI);
    manager.register('**/aweme/v1/web/aweme/detail/**', onWorkDetailAPI);
    manager.register('**/comment/list/**', onCommentsListAPI);
    manager.register('**/comment/reply/list/**', onDiscussionsListAPI);
    manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);
    manager.register('**/v1/stranger/get_conversation_list**', onConversationListAPI);
    manager.register('**/v1/im/message/history**', onMessageHistoryAPI);

    await manager.enable();
    this.apiManager = manager;
  }

  async cleanup() {
    if (this.apiManager) {
      await this.apiManager.cleanup();
    }
  }
}
```

**就这么简单！**
- crawl 文件只定义 `onXxxAPI()` 函数并导出
- platform.js 导入所有回调 + 注册到对应的 API pattern
- 不需要其他中间步骤

## 高级用法

### 1. 多个回调处理同一个 API

```javascript
// crawl-contents.js
async function onWorksListAPI(body) {
  // 收集作品基本信息
  collectWorkInfo(body);
}

// crawl-comments.js
async function onWorksStatsAPI(body) {
  // 收集评论统计信息
  collectCommentStats(body);
}

// platform.js 中注册
manager.register('**/aweme/v1/web/aweme/post/**', onWorksListAPI);
manager.register('**/aweme/v1/web/aweme/post/**', onWorksStatsAPI);

// 两个回调会同时执行
```

### 2. 处理器访问完整响应

处理器函数签名：`async (body, route, response) => {}`

```javascript
manager.register('**/api/**', async (body, route, response) => {
  // body: 解析后的 JSON 数据
  // route: Playwright Route 对象
  // response: Playwright Response 对象

  const url = route.request().url();
  const status = response.status();
  const headers = response.headers();

  console.log(`拦截到 ${url}, 状态码 ${status}`);
});
```

### 3. 去重逻辑

```javascript
// crawl-contents.js
const cache = new Set();

async function onWorksListAPI(body, route) {
  const url = route.request().url();

  // 简单 URL 去重
  if (cache.has(url)) {
    return; // 跳过重复请求
  }

  cache.add(url);
  processData(body);
}

module.exports = { onWorksListAPI };
```

### 4. 条件处理

```javascript
// crawl-direct-messages-v2.js
async function onMessageHistoryAPI(body) {
  // 只处理有新消息的响应
  if (!body || !body.data || body.data.messages.length === 0) {
    return;
  }

  processMessages(body.data.messages);
}

module.exports = { onMessageHistoryAPI };
```

## 完整示例

### crawl-contents.js - 只定义回调函数

```javascript
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('crawl-contents');

// 数据存储（模块级闭包）
const apiData = {
  worksList: [],
  workDetail: [],
  cache: new Set()
};

// API 回调函数：作品列表
async function onWorksListAPI(body, route) {
  if (!body || !body.aweme_list) return;

  const url = route.request().url();
  if (apiData.cache.has(url)) return;

  apiData.cache.add(url);
  apiData.worksList.push(body);
  logger.debug(`收集到作品列表: ${body.aweme_list.length} 个`);
}

// API 回调函数：作品详情
async function onWorkDetailAPI(body) {
  if (!body) return;
  apiData.workDetail.push(body);
  logger.debug(`收集到作品详情`);
}

// 爬取函数（只处理 DOM 操作）
async function crawlContents(page, account) {
  logger.info('开始爬取作品 - 只处理 DOM 操作');

  // 清空之前的数据
  apiData.worksList = [];
  apiData.workDetail = [];
  apiData.cache.clear();

  // 导航到页面
  await page.goto('https://creator.douyin.com/creator-micro/content/manage');
  await page.waitForTimeout(3000);

  // DOM 操作：点击"全部"标签
  await clickAllWorksTab(page);

  // DOM 操作：滚动加载虚拟列表
  await scrollToLoadAll(page);

  // 等待 API 数据收集完成
  await page.waitForTimeout(2000);

  // 返回收集的数据
  logger.info(`爬取完成: ${apiData.worksList.length} 个作品`);
  return {
    works: apiData.worksList,
    details: apiData.workDetail
  };
}

// 只导出回调函数和爬取函数
module.exports = {
  onWorksListAPI,
  onWorkDetailAPI,
  crawlContents
};
```

### platform.js - 统一注册所有 API

```javascript
const { APIInterceptorManager } = require('../base/api-interceptor-manager');
const { TabTag } = require('../../browser/constants');

// 导入所有 API 回调函数
const { onWorksListAPI, onWorkDetailAPI, crawlContents } = require('./crawl-contents');
const { onCommentsListAPI, onDiscussionsListAPI, crawlComments } = require('./crawl-comments');
const { onMessageInitAPI, onConversationListAPI, onMessageHistoryAPI, crawlDirectMessages } = require('./crawl-direct-messages-v2');

class DouyinPlatform extends PlatformBase {
  async initialize(account) {
    await super.initialize(account);

    const { page } = await this.browserManager.tabManager.getPageForTask(account.id, {
      tag: TabTag.MAIN,
      persistent: true
    });

    const manager = new APIInterceptorManager(page);

    // 统一注册所有 API（pattern + callback）
    manager.register('**/aweme/v1/web/aweme/post/**', onWorksListAPI);
    manager.register('**/aweme/v1/web/aweme/detail/**', onWorkDetailAPI);
    manager.register('**/comment/list/**', onCommentsListAPI);
    manager.register('**/comment/reply/list/**', onDiscussionsListAPI);
    manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);
    manager.register('**/v1/stranger/get_conversation_list**', onConversationListAPI);
    manager.register('**/v1/im/message/history**', onMessageHistoryAPI);

    await manager.enable();
    this.apiManager = manager;

    logger.info(`[${account.id}] API 拦截器已启用 (7 个)`);
  }

  async crawlContents(account) {
    const { page } = await this.getPage(account.id);
    return await crawlContents(page, account);
  }

  async crawlComments(account) {
    const { page } = await this.getPage(account.id);
    return await crawlComments(page, account);
  }

  async crawlDirectMessages(account) {
    const { page } = await this.getPage(account.id);
    return await crawlDirectMessages(page, account);
  }

  async cleanup() {
    if (this.apiManager) {
      await this.apiManager.cleanup();
    }
    await super.cleanup();
  }
}

module.exports = DouyinPlatform;
```

## 架构优势

1. **极简 API**:
   - 只需 `register(pattern, callback)` 和 `enable()` 两个方法
   - 没有复杂的配置对象

2. **职责清晰**:
   - **platform.js**: 唯一的注册点（导入 + 注册）
   - **crawl-*.js**: 只定义回调函数（不参与注册）
   - **APIInterceptorManager**: 底层拦截机制（透明）

3. **易于维护**:
   - 新增 API 拦截：在 crawl 文件中定义回调 → platform.js 中一行注册
   - 所有 API 注册集中在 platform.js，一目了然

4. **技术特性**:
   - 同一个 API 可以注册多个回调
   - 错误隔离：单个回调失败不影响其他回调
   - 自动解析：自动处理 JSON/Protobuf 响应
   - 去重支持：回调函数内部自己实现去重逻辑

## 数据流

```
用户触发 DOM 操作（crawl 函数）
         ↓
   触发页面 API 请求
         ↓
APIInterceptorManager 拦截
         ↓
    调用注册的回调函数
         ↓
  回调函数处理并存储数据
         ↓
crawl 函数返回收集的数据
```

## 注意事项

1. **数据存储**: 使用模块级闭包保存数据（`const apiData = {}`）
2. **去重处理**: 在回调函数内部实现去重逻辑（使用 Set 或 URL 判断）
3. **错误处理**: 回调函数内部应该 try-catch，避免影响其他回调
4. **清理资源**: 在 platform cleanup() 中调用 `manager.cleanup()`
5. **回调命名**: 使用 `onXxxAPI` 命名规范（如 `onWorksListAPI`）

---

**版本**: v1.0
**日期**: 2025-10-28
**设计理念**: platform.js 统一注册，crawl 文件只定义回调
