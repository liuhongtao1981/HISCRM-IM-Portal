# Douyin API 拦截器统一管理重构方案

## 当前问题

目前每个爬虫文件（crawl-contents.js, crawl-comments.js, crawl-direct-messages-v2.js）都有自己的 `setupAPIInterceptors()` 函数，存在以下问题：

1. **代码重复**：每个文件都实现相似的拦截器逻辑
2. **管理分散**：无法统一管理所有 API 拦截器
3. **冲突风险**：多个拦截器可能监听相同的 API 路径
4. **难以复用**：拦截器逻辑无法跨文件共享

## 重构目标

将 API 拦截器管理统一到 `platform.js`，实现：

1. **统一注册**：所有 API 拦截器在 platform.js 中注册
2. **分离配置**：各个 crawl 文件提供拦截器配置，不直接操作 page.route()
3. **处理器复用**：多个拦截器可以监听相同的 API，各自处理
4. **生命周期管理**：支持拦截器的启用/禁用/清理

## 架构设计

### 1. 核心类：APIInterceptorManager

```javascript
// packages/worker/src/platforms/douyin/api-interceptor-manager.js

class APIInterceptorManager {
  constructor(page) {
    this.page = page;
    this.interceptors = new Map(); // pattern -> [handlers]
    this.activeRoutes = new Map(); // pattern -> route handler
  }

  /**
   * 注册拦截器
   * @param {Object} config - 拦截器配置
   * @param {string} config.pattern - API 路径模式
   * @param {string} config.name - 拦截器名称
   * @param {Function} config.handler - 处理函数 (response, route) => void
   * @param {Object} config.options - 可选配置
   */
  register(config) {
    const { pattern, name, handler, options = {} } = config;

    if (!this.interceptors.has(pattern)) {
      this.interceptors.set(pattern, []);
    }

    this.interceptors.get(pattern).push({
      name,
      handler,
      options,
      enabled: true
    });
  }

  /**
   * 批量注册拦截器
   */
  registerBatch(configs) {
    configs.forEach(config => this.register(config));
  }

  /**
   * 启用所有注册的拦截器
   */
  async enable() {
    for (const [pattern, handlers] of this.interceptors.entries()) {
      if (!this.activeRoutes.has(pattern)) {
        const routeHandler = await this.createRouteHandler(pattern, handlers);
        await this.page.route(pattern, routeHandler);
        this.activeRoutes.set(pattern, routeHandler);
      }
    }
  }

  /**
   * 创建路由处理器（支持多个 handler）
   */
  createRouteHandler(pattern, handlers) {
    return async (route) => {
      const request = route.request();

      try {
        // 执行原始请求
        const response = await route.fetch();
        const body = await this.parseResponse(response);

        // 调用所有启用的处理器
        const enabledHandlers = handlers.filter(h => h.enabled);
        await Promise.all(
          enabledHandlers.map(({ name, handler }) =>
            this.safeExecute(name, handler, body, route, response)
          )
        );

        // 返回响应
        await route.fulfill({ response });
      } catch (error) {
        logger.error(`Route handler error for ${pattern}:`, error);
        await route.continue();
      }
    };
  }

  /**
   * 安全执行处理器
   */
  async safeExecute(name, handler, body, route, response) {
    try {
      await handler(body, route, response);
    } catch (error) {
      logger.error(`Handler ${name} failed:`, error);
    }
  }

  /**
   * 解析响应（支持 JSON/Protobuf）
   */
  async parseResponse(response) {
    const contentType = response.headers()['content-type'] || '';

    if (contentType.includes('application/json')) {
      return await response.json();
    }

    try {
      const text = await response.text();
      return JSON.parse(text);
    } catch {
      return null; // Protobuf 或其他格式
    }
  }

  /**
   * 禁用拦截器
   */
  disable(name) {
    for (const handlers of this.interceptors.values()) {
      handlers.forEach(h => {
        if (h.name === name) h.enabled = false;
      });
    }
  }

  /**
   * 清理所有拦截器
   */
  async cleanup() {
    for (const [pattern, handler] of this.activeRoutes.entries()) {
      await this.page.unroute(pattern, handler);
    }
    this.activeRoutes.clear();
    this.interceptors.clear();
  }
}

module.exports = { APIInterceptorManager };
```

### 2. Platform.js 集成

```javascript
// packages/worker/src/platforms/douyin/platform.js

const { APIInterceptorManager } = require('./api-interceptor-manager');

class DouyinPlatform extends PlatformBase {
  constructor(config, workerBridge, browserManager) {
    super(config, workerBridge, browserManager);
    this.apiInterceptorManager = null; // 每个账户独立的拦截器管理器
  }

  /**
   * 为指定账户创建并配置 API 拦截器管理器
   * @param {string} accountId - 账户 ID
   * @param {Object} page - Playwright Page 实例
   */
  async setupAPIInterceptors(accountId, page) {
    // 创建拦截器管理器
    this.apiInterceptorManager = new APIInterceptorManager(page);

    // 导入各个 crawl 文件的拦截器配置
    const { getContentsInterceptors } = require('./crawl-contents');
    const { getCommentsInterceptors } = require('./crawl-comments');
    const { getMessagesInterceptors } = require('./crawl-direct-messages-v2');

    // 注册所有拦截器
    this.apiInterceptorManager.registerBatch([
      ...getContentsInterceptors(accountId),
      ...getCommentsInterceptors(accountId),
      ...getMessagesInterceptors(accountId)
    ]);

    // 启用拦截器
    await this.apiInterceptorManager.enable();

    logger.info(`API interceptors setup complete for account ${accountId}`);
  }

  /**
   * 清理 API 拦截器
   */
  async cleanupAPIInterceptors() {
    if (this.apiInterceptorManager) {
      await this.apiInterceptorManager.cleanup();
      this.apiInterceptorManager = null;
    }
  }
}
```

### 3. crawl-contents.js 重构

```javascript
// packages/worker/src/platforms/douyin/crawl-contents.js

/**
 * 导出拦截器配置（不再直接操作 page.route）
 */
function getContentsInterceptors(accountId) {
  // 私有数据存储（闭包）
  const apiResponses = {
    worksList: [],
    workDetail: []
  };
  const requestCache = new Set();

  return [
    {
      pattern: '**/aweme/v1/web/aweme/post/**',
      name: `contents-list-${accountId}`,
      handler: async (body, route, response) => {
        if (!body || !body.aweme_list) return;

        const signature = route.request().url();
        if (requestCache.has(signature)) return;

        requestCache.add(signature);
        apiResponses.worksList.push(body);
        logger.debug(`Intercepted contents list: ${body.aweme_list.length} items`);
      }
    },
    {
      pattern: '**/aweme/v1/web/aweme/detail/**',
      name: `contents-detail-${accountId}`,
      handler: async (body, route, response) => {
        if (!body) return;

        apiResponses.workDetail.push(body);
        logger.debug('Intercepted work detail');
      }
    }
  ];
}

/**
 * 爬取作品（使用全局 API 拦截器）
 */
async function crawlContents(page, account, options = {}) {
  // 不再需要 setupAPIInterceptors
  // 直接访问页面，拦截器已经在 platform.js 中注册

  logger.info('Starting contents crawl');

  // 导航到作品管理页面
  await page.goto('https://creator.douyin.com/creator-micro/content/manage', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // ... 其余爬取逻辑
}

module.exports = {
  crawlContents,
  getContentsInterceptors  // 导出配置函数
};
```

### 4. crawl-direct-messages-v2.js 重构

```javascript
// packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js

/**
 * 导出拦截器配置
 */
function getMessagesInterceptors(accountId) {
  const apiResponses = {
    init: [],
    conversations: [],
    history: [],
    query: []
  };

  const requestCache = {
    init: new Set(),
    conversations: new Set(),
    history: new Set()
  };

  // 通用处理函数
  const createHandler = (apiType, cacheSet) => async (body, route, response) => {
    if (!isValidResponse(body, apiType)) return;

    const signature = generateRequestSignature(
      route.request().method(),
      route.request().url(),
      body
    );

    if (cacheSet.has(signature)) return;

    cacheSet.add(signature);
    apiResponses[apiType].push(body);

    const messageCount = getMessageCount(body, apiType);
    logger.debug(`[${apiType}] Intercepted: ${messageCount} items`);
  };

  return [
    {
      pattern: '**/v2/message/get_by_user_init**',
      name: `dm-init-${accountId}`,
      handler: createHandler('init', requestCache.init)
    },
    {
      pattern: '**/v1/stranger/get_conversation_list**',
      name: `dm-conversations-${accountId}`,
      handler: createHandler('conversations', requestCache.conversations)
    },
    {
      pattern: '**/v1/im/message/history**',
      name: `dm-history-${accountId}`,
      handler: createHandler('history', requestCache.history)
    },
    {
      pattern: '**/v1/im/query_conversation**',
      name: `dm-query-${accountId}`,
      handler: createHandler('query', new Set())
    }
  ];
}

// 辅助函数
function isValidResponse(body, apiType) { /* ... */ }
function getMessageCount(body, apiType) { /* ... */ }
function generateRequestSignature(method, url, body) { /* ... */ }

module.exports = {
  crawlDirectMessagesV2,
  getMessagesInterceptors
};
```

## 调用流程

### 初始化阶段（账户登录后）

```javascript
// platform.js - initialize()
async initialize(account) {
  await super.initialize(account);

  // 获取账户专用页面
  const { page } = await this.browserManager.tabManager.getPageForTask(account.id, {
    tag: TabTag.MAIN,
    persistent: true
  });

  // 设置 API 拦截器（一次性）
  await this.setupAPIInterceptors(account.id, page);
}
```

### 爬取阶段

```javascript
// platform.js - crawlComments()
async crawlComments(account, options = {}) {
  const { page } = await this.browserManager.tabManager.getPageForTask(account.id, {
    tag: TabTag.SPIDER_COMMENT
  });

  // 直接调用 crawl 函数，不需要再设置拦截器
  const result = await crawlCommentsV2(page, account, options);

  return result;
}
```

## 优势

### 1. 代码复用
- 拦截器逻辑统一管理
- 处理器可以共享

### 2. 灵活性
- 多个处理器可以监听同一个 API
- 可以动态启用/禁用拦截器

### 3. 可维护性
- 拦截器配置清晰
- 易于调试和测试

### 4. 性能优化
- 避免重复注册路由
- 支持拦截器缓存

## 实施步骤

1. ✅ 创建 `api-interceptor-manager.js`
2. ✅ 在 `platform.js` 中集成管理器
3. ✅ 重构 `crawl-contents.js`
4. ✅ 重构 `crawl-direct-messages-v2.js`
5. ✅ 重构 `crawl-comments.js`
6. ✅ 测试所有爬虫功能
7. ✅ 清理旧代码
8. ✅ 更新文档

## 兼容性考虑

- 保持现有 API 不变
- 新旧代码可以共存（渐进式迁移）
- 测试覆盖所有场景

## 示例：多处理器共享 API

```javascript
// 场景：作品列表 API 同时被 contents 和 comments 使用

// crawl-contents.js
function getContentsInterceptors(accountId) {
  return [{
    pattern: '**/aweme/v1/web/aweme/post/**',
    name: `contents-collector-${accountId}`,
    handler: async (body) => {
      // 收集作品基本信息
      collectWorkInfo(body);
    }
  }];
}

// crawl-comments.js
function getCommentsInterceptors(accountId) {
  return [{
    pattern: '**/aweme/v1/web/aweme/post/**',  // 相同的 API
    name: `comments-collector-${accountId}`,
    handler: async (body) => {
      // 收集评论统计
      collectCommentStats(body);
    }
  }];
}

// 两个处理器会同时处理同一个 API 响应
```

## 注意事项

1. **闭包数据隔离**：每个拦截器配置函数返回的处理器通过闭包保存自己的数据
2. **账户隔离**：拦截器名称包含 accountId，确保多账户场景下的数据隔离
3. **错误处理**：每个处理器独立捕获错误，不影响其他处理器
4. **生命周期**：在账户登出或浏览器关闭时清理拦截器

---

**文档版本**: v1.0
**创建时间**: 2025-10-27
**作者**: Claude Code
