# API 拦截器生命周期说明

**日期**: 2025-10-28
**版本**: v1.0

---

## 🔍 核心问题

**Q: 我们是先注册 API 拦截器，还是先跳转页面？跳转后 API 拦截还会生效吗？**

**A: 先注册 API 拦截器，然后跳转页面。跳转后拦截器仍然生效。**

---

## 📋 执行顺序详解

### 1. 获取标签页并注册拦截器

```javascript
// 文件: packages/worker/src/platforms/douyin/platform.js

async crawlDirectMessages(account) {
  // Step 1: 获取页面 - 使用 getPageWithAPI 自动注册 API 拦截器
  const { page } = await this.getPageWithAPI(account.id, {
    tag: TabTag.SPIDER_DM,
    persistent: true,
    shareable: false,
    forceNew: false
  });
  // ✅ 此时 API 拦截器已注册到 page 对象上

  // Step 2: 执行爬虫（包括页面跳转）
  const crawlResult = await crawlDirectMessagesV2(page, account);
}
```

### 2. getPageWithAPI 内部流程

```javascript
// 文件: packages/worker/src/platforms/base/platform-base.js

async getPageWithAPI(accountId, options = {}) {
  const { tag } = options;

  // 1. 获取或创建标签页（可能是新建，也可能是复用）
  const result = await this.browserManager.tabManager.getPageForTask(accountId, options);
  const { tabId, page } = result;

  // 2. 为该标签页注册 API 拦截器（如果尚未注册）
  const managerKey = `${accountId}_${tag}`;
  if (!this.apiManagers.has(managerKey)) {
    // ⭐ 关键：在这里注册拦截器，在任何页面跳转之前
    await this.setupAPIInterceptors(managerKey, page);
    logger.info(`🔌 API interceptors auto-setup for tab: ${tag}`);
  }

  return result;
}
```

### 3. setupAPIInterceptors 注册流程

```javascript
// 文件: packages/worker/src/platforms/base/platform-base.js

async setupAPIInterceptors(accountId, page) {
  // 1. 创建管理器
  const manager = new APIInterceptorManager(page);

  // 2. 注册所有 API 模式和回调
  await this.registerAPIHandlers(manager, accountId);
  // 此时注册了 7 个 API 模式:
  // - **/creator/item/list/**
  // - **/aweme/v1/web/aweme/detail/**
  // - **/comment/list/**
  // - **/comment/reply/list/**
  // - **/v2/message/get_by_user_init**
  // - **/creator/im/user_detail/**
  // - **/v1/im/message/history**

  // 3. ⭐ 启用拦截器（关键步骤）
  await manager.enable();

  // 4. 保存管理器引用
  this.apiManagers.set(accountId, manager);
}
```

### 4. manager.enable() 实现

```javascript
// 文件: packages/worker/src/platforms/base/api-interceptor-manager.js

async enable() {
  for (const [pattern, handlers] of this.handlers.entries()) {
    const routeHandler = async (route) => {
      // 拦截匹配的 API 请求
      const response = await route.fetch();
      const body = await this.parseJSON(response);

      // 调用所有注册的处理器
      for (const handler of handlers) {
        await handler(body, route, response);
      }

      await route.fulfill({ response });
    };

    // ⭐ 关键：使用 Playwright 的 page.route() 注册路由拦截
    await this.page.route(pattern, routeHandler);
    this.routes.set(pattern, routeHandler);
  }
}
```

### 5. 页面跳转（拦截器已生效）

```javascript
// 文件: packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js

async function crawlDirectMessagesV2(page, account) {
  // ✅ 此时 API 拦截器已经注册到 page 对象上

  // 清空之前的数据
  apiData.conversations = [];

  // ⭐ 跳转到私信页面
  await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // ✅ 页面跳转后，所有匹配的 API 请求都会被拦截
  // ✅ 拦截器会自动调用 onConversationListAPI(body)
  // ✅ 数据被收集到 apiData.conversations 数组中

  await page.waitForTimeout(2000);

  // 使用收集到的 API 数据
  const conversations = await extractConversationsList(page, account, apiData);
  // apiData.conversations 已经包含了 8 个 API 响应 → 105 个会话
}
```

---

## 🔑 关键技术点

### Playwright 的 page.route() 机制

**特性**:
- ✅ **持久性**: 一旦注册，拦截器会一直生效，直到 `page.unroute()` 或页面关闭
- ✅ **跨导航**: 即使页面跳转（`page.goto()`），拦截器仍然有效
- ✅ **全局性**: 对该 `page` 对象的所有网络请求都会被检查

**工作原理**:
```javascript
// 注册拦截器（在页面跳转之前）
await page.route('**/creator/im/user_detail/**', async (route) => {
  const response = await route.fetch();
  const body = await response.json();

  // 收集数据
  apiData.conversations.push(body);

  // 继续请求
  await route.fulfill({ response });
});

// 之后的任何页面跳转，匹配的请求都会被拦截
await page.goto('https://creator.douyin.com/...');
await page.goto('https://creator.douyin.com/another-page');
// ✅ 拦截器仍然有效
```

### 为什么必须先注册再跳转？

如果顺序反了会怎样：

```javascript
// ❌ 错误的顺序
await page.goto('https://creator.douyin.com/...');
await manager.enable(); // 太晚了！

// 问题：
// 1. page.goto() 时页面已经开始加载
// 2. 页面加载期间发出的 API 请求不会被拦截
// 3. 只有跳转后的新请求才会被拦截
```

```javascript
// ✅ 正确的顺序
await manager.enable(); // 先注册
await page.goto('https://creator.douyin.com/...'); // 再跳转

// 效果：
// 1. 拦截器已就绪
// 2. 页面加载期间的所有 API 请求都会被拦截
// 3. 不会漏掉任何数据
```

---

## 📊 实际执行时间轴

根据日志分析实际执行顺序：

```
13:30:06.451 | ✅ API handlers registered (7 total) for acc-xxx_spider_dm
13:30:06.477 | 🔌 API interceptors auto-setup for tab: spider_dm
              ⬆️ API 拦截器注册完成

13:30:06.478 | API 拦截器已全局启用（由 platform.js 管理）
              ⬆️ 爬虫确认拦截器状态

13:30:06.xxx | [跳转到私信页面] page.goto(...)
              ⬇️ 页面开始加载

13:30:xx.xxx | [页面加载中，触发多个 API 请求]
              ⬇️ /creator/im/user_detail/ 请求被拦截 (8 次)
              ⬇️ 每次拦截调用 onConversationListAPI(body)
              ⬇️ 数据被收集到 apiData.conversations

13:30:15.079 | [extractConversationsList] Using API data: 8 responses
13:30:15.082 | [extractConversationsList] ✅ Extracted 105 conversations from API
              ⬆️ 成功使用拦截到的数据
```

**关键观察**:
1. 拦截器在 `13:30:06.477` 注册
2. 页面跳转在注册之后
3. API 请求在页面加载期间被拦截
4. 最终成功收集到 105 个会话

---

## 🔄 拦截器生命周期管理

### 创建时机

```javascript
// 首次访问标签页时创建
const { page } = await this.getPageWithAPI(account.id, {
  tag: TabTag.SPIDER_DM,
  persistent: true  // ⭐ 标签页持久化
});

// managerKey = "acc-xxx_spider_dm"
// ✅ 第一次访问：创建 APIInterceptorManager 并注册
// ✅ 后续访问：复用已有的标签页和拦截器
```

### 复用机制

```javascript
// getPageWithAPI 中的检查
if (!this.apiManagers.has(managerKey)) {
  // 只在第一次时注册
  await this.setupAPIInterceptors(managerKey, page);
} else {
  // 已存在，直接复用
  // ✅ 拦截器仍然在 page 对象上有效
}
```

### 清理时机

```javascript
// 当标签页关闭或账户登出时
async cleanup() {
  for (const [pattern, handler] of this.routes.entries()) {
    await this.page.unroute(pattern, handler);  // 移除拦截器
  }
  this.handlers.clear();
  this.routes.clear();
}
```

---

## 💡 设计优势

### 1. 自动化

```javascript
// 开发者只需：
const { page } = await this.getPageWithAPI(account.id, { tag: 'spider_dm' });

// 框架自动：
// ✅ 检查是否已注册
// ✅ 注册所有 7 个 API 模式
// ✅ 启用拦截器
// ✅ 管理生命周期
```

### 2. 持久性

```javascript
// 标签页持久化，拦截器也持久化
persistent: true

// 效果：
// ✅ 标签页不关闭
// ✅ 拦截器一直有效
// ✅ 多次爬虫循环无需重新注册
```

### 3. 隔离性

```javascript
// 每个标签页独立的拦截器
acc-xxx_main         → APIInterceptorManager (7 patterns)
acc-xxx_spider_dm    → APIInterceptorManager (7 patterns)
acc-xxx_spider_comment → APIInterceptorManager (7 patterns)

// ✅ 互不干扰
// ✅ 数据不串
// ✅ 并发安全
```

---

## 🎯 最佳实践

### ✅ 推荐做法

1. **使用 getPageWithAPI 获取页面**
   ```javascript
   const { page } = await this.getPageWithAPI(account.id, { tag: 'spider_dm' });
   // ✅ 自动注册拦截器
   ```

2. **在页面跳转前确认拦截器状态**
   ```javascript
   logger.info('API 拦截器已全局启用（由 platform.js 管理）');
   await page.goto(targetUrl);
   // ✅ 拦截器已就绪，不会漏数据
   ```

3. **使用持久化标签页**
   ```javascript
   persistent: true
   // ✅ 标签页和拦截器都持久化，高效复用
   ```

### ❌ 避免做法

1. **不要在跳转后才注册**
   ```javascript
   // ❌ 错误
   await page.goto(url);
   await manager.enable(); // 太晚了
   ```

2. **不要手动管理拦截器**
   ```javascript
   // ❌ 不推荐
   const manager = new APIInterceptorManager(page);
   await manager.register(...);
   await manager.enable();

   // ✅ 推荐
   await this.getPageWithAPI(account.id, options);
   ```

3. **不要重复注册**
   ```javascript
   // ❌ 会导致内存泄漏
   await this.setupAPIInterceptors(key, page);
   await this.setupAPIInterceptors(key, page); // 重复
   ```

---

## 📝 总结

### 回答原问题

**Q: 我们是先注册 API 拦截器，还是先跳转页面？**

**A**: **先注册 API 拦截器**，然后跳转页面。

**Q: 跳转后 API 拦截还会生效吗？**

**A**: **会生效**。Playwright 的 `page.route()` 机制确保拦截器在页面跳转后仍然有效。

### 核心原理

1. **注册时机**: 在获取标签页时（`getPageWithAPI`）自动注册
2. **生效时机**: 注册后立即生效，持续到标签页关闭
3. **跨导航**: 页面跳转不影响拦截器，所有匹配的请求都会被拦截
4. **数据收集**: 回调函数将数据收集到模块级变量（如 `apiData.conversations`）

### 验证结果

✅ **私信会话**: 105 个会话 from API (8 次拦截)
✅ **拦截器持久性**: 页面跳转后仍然有效
✅ **自动化管理**: 框架级别，开发者无需关心细节

---

**文档版本**: 1.0
**最后更新**: 2025-10-28 13:50
**作者**: Claude Code
