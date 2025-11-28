# API爬虫BrowserManager访问修复报告

## 问题描述

在修复完作品同步数量Bug后，API爬虫仍然无法正常运行，报错：

```
TypeError: this.platform.browserManager.getContext is not a function
at DouyinAPICrawler.refreshCookie (crawler-api.js:247:58)
```

**错误日志**：
```log
[09:51:23.992] [error] [acc-35e6ca87-d12d-4244-98fe-a11419b76253] 刷新Cookie失败:
  this.platform.browserManager.getContext is not a function
```

## 问题根本原因

**方法调用错误**：`refreshCookie()` 方法中试图调用 `this.platform.browserManager.getContext(accountId)`，但 BrowserManagerV2 类中**没有定义 `getContext()` 方法**。

### 代码分析

#### 错误的调用方式（Line 247）

```javascript
// ❌ 错误：BrowserManagerV2 没有 getContext() 方法
const context = this.platform.browserManager.getContext(this.account.id);
```

#### BrowserManagerV2 的实际实现

检查 `packages/worker/src/browser/browser-manager-v2.js`：

```javascript
// Line 34-35
class BrowserManagerV2 extends EventEmitter {
    constructor(workerId, config = {}) {
        super();
        // ...

        // Context管理 (accountId -> context)
        this.contexts = new Map();  // ✅ 使用 Map 存储 context

        // ...
    }
}
```

**关键发现**：
1. BrowserManagerV2 使用 `this.contexts` Map 存储浏览器上下文
2. Map 的键是 `accountId`，值是 `BrowserContext` 对象
3. **没有封装 `getContext()` 方法**，需要直接访问 Map

## 修复方案

**方案**：直接访问 `browserManager.contexts` Map，使用 `Map.get()` 方法获取上下文。

### 修复内容

#### packages/worker/src/platforms/douyin/crawler-api.js

**修复位置**：Line 247

**修复前**：
```javascript
// ❌ 调用不存在的方法
const context = this.platform.browserManager.getContext(this.account.id);
```

**修复后**：
```javascript
// ✅ 直接访问 contexts Map
const context = this.platform.browserManager.contexts.get(this.account.id);
```

**完整方法**（Line 242-278）：
```javascript
async refreshCookie() {
    logger.debug(`[${this.account.id}] 刷新Cookie...`);

    try {
        // ✅ 从BrowserManager的contexts Map获取账户的浏览器上下文（登录检测任务维护）
        const context = this.platform.browserManager.contexts.get(this.account.id);

        if (!context) {
            throw new Error('账户浏览器上下文不存在，请确保登录检测任务已运行');
        }

        // 获取最新Cookie
        const cookies = await context.cookies();
        this.cookie = cookies
            .filter(c => c.domain.includes('douyin.com'))
            .map(c => `${c.name}=${c.value}`)
            .join('; ');

        // 获取UserAgent（使用默认值或从配置获取）
        this.userAgent = this.platform.config?.userAgent ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

        logger.debug(`[${this.account.id}] Cookie已更新: ${cookies.length} 个`);

        // 更新 DouyinAPI 的Cookie
        if (this.douyinAPI) {
            this.douyinAPI.updateCookie(this.cookie);
        } else {
            // 首次创建 DouyinAPI 实例
            this.douyinAPI = new DouyinAPI(this.cookie, this.userAgent);
        }

    } catch (error) {
        logger.error(`[${this.account.id}] 刷新Cookie失败:`, error);
        throw error;
    }
}
```

## 修复验证

### 修复后的执行流程

1. **API爬虫启动**：`DouyinAPICrawler.start()` 被调用
2. **周期性执行**：每30秒调用一次 `runOnce()`
3. **Cookie刷新**：`refreshCookie()` 从浏览器上下文获取最新Cookie
   - ✅ `browserManager.contexts.get(accountId)` 成功获取上下文
   - ✅ `context.cookies()` 获取所有Cookie
   - ✅ 过滤出 `douyin.com` 域名的Cookie
   - ✅ 更新 `DouyinAPI` 实例的Cookie
4. **作品抓取**：调用 `fetchAllWorks()` 获取作品列表
5. **数据保存**：直接传递原始API数据给 DataManager（保留 `aweme_id` 字段）
6. **同步到Master**：107个作品都有唯一的 `contentId`

### 预期日志

```log
[HH:mm:ss] [debug] [acc-xxx] 刷新Cookie...
[HH:mm:ss] [debug] [acc-xxx] Cookie已更新: 15 个
[HH:mm:ss] [info] [作品列表] 请求: cursor=0, count=20
[HH:mm:ss] [debug] [作品列表] ✅ 获取 20 个作品
[HH:mm:ss] [info] [API] [acc-xxx] 作品已保存: 107 个 (原始: 107)
[HH:mm:ss] [info] Data sync completed: {"comments":69, "contents":107, ...}
```

## 技术要点

### 1. BrowserManagerV2 的上下文管理

```javascript
// BrowserManagerV2 架构
class BrowserManagerV2 extends EventEmitter {
    constructor(workerId, config = {}) {
        // Browser实例管理 (accountId -> browser)
        this.browsers = new Map();

        // Context管理 (accountId -> context)
        this.contexts = new Map();  // ← 这里！

        // ...
    }

    // 启动持久化上下文
    async launchPersistentContextForAccount(accountId, options = {}) {
        const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
        this.contexts.set(accountId, context);  // ← 保存到Map
        return context;
    }
}
```

**使用方式**：
```javascript
// ✅ 正确：直接访问Map
const context = browserManager.contexts.get(accountId);

// ❌ 错误：调用不存在的方法
const context = browserManager.getContext(accountId);
```

### 2. Cookie 刷新策略

**设计原则**：
- **不创建专门的Tab**：直接从登录检测任务维护的浏览器上下文获取Cookie
- **每次任务周期都刷新**：`refreshCookie()` 在每次 `runOnce()` 时调用
- **复用 DouyinAPI 实例**：首次创建后，后续只更新Cookie

**Cookie 获取流程**：
```javascript
// 1. 获取浏览器上下文
const context = browserManager.contexts.get(accountId);

// 2. 获取所有Cookie
const cookies = await context.cookies();

// 3. 过滤抖音Cookie
const douyinCookies = cookies
    .filter(c => c.domain.includes('douyin.com'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

// 4. 更新DouyinAPI
douyinAPI.updateCookie(douyinCookies);
```

### 3. 浏览器上下文的依赖关系

**前置条件**：登录检测任务必须先运行

API爬虫依赖登录检测任务维护的浏览器上下文：

1. **登录检测任务**（`LoginDetectionTask`）：
   - 创建并维护浏览器上下文
   - 监控登录状态
   - 保持会话活跃

2. **API爬虫**（`DouyinAPICrawler`）：
   - 从登录检测任务的上下文获取Cookie
   - 使用Cookie调用API
   - 不创建专门的浏览器Tab

**错误处理**：
```javascript
if (!context) {
    throw new Error('账户浏览器上下文不存在，请确保登录检测任务已运行');
}
```

## 修改的文件

### packages/worker/src/platforms/douyin/crawler-api.js

**修改位置**：Line 247

**修改类型**：BrowserManager API调用修复

**影响范围**：API爬虫的Cookie刷新机制

## 相关文件

- [crawler-api.js](../packages/worker/src/platforms/douyin/crawler-api.js) - API爬虫实现（修复位置）
- [browser-manager-v2.js](../packages/worker/src/browser/browser-manager-v2.js) - BrowserManager实现（上下文管理）
- [platform.js](../packages/worker/src/platforms/douyin/platform.js) - 抖音平台类（browserManager引用）
- [API爬虫作品同步数量Bug修复报告.md](./API爬虫作品同步数量Bug修复报告.md) - 上一次修复（字段映射问题）

## 经验教训

### 1. 理解第三方API的正确使用方式

在调用第三方类/模块的方法时，必须：
- **查看实际实现**：阅读源代码，了解可用的方法和属性
- **不要假设方法存在**：即使方法名看起来合理（如 `getContext()`），也要验证其是否真的存在
- **优先使用公共属性**：如果类暴露了公共属性（如 `contexts` Map），直接访问通常比封装方法更可靠

### 2. Map vs 封装方法

BrowserManagerV2 选择**直接暴露 `contexts` Map**，而不是提供 `getContext()` 方法：

**优点**：
- 减少代码量
- 调用者可以使用Map的所有方法（`.get()`, `.has()`, `.keys()`, `.values()`）
- 更灵活

**缺点**：
- 调用者需要了解内部数据结构
- 没有封装，无法添加额外的验证/日志

**建议**：
- 如果需要频繁访问，可以考虑添加封装方法
- 或者在文档中明确说明使用方式

### 3. 错误信息的价值

本次修复非常直接，因为错误信息非常清晰：

```
this.platform.browserManager.getContext is not a function
```

**教训**：
- ✅ 永远保留完整的错误堆栈
- ✅ 日志中记录关键信息（如 accountId）
- ✅ 在catch块中重新抛出错误，而不是吞掉

### 4. 测试覆盖的重要性

如果有单元测试覆盖 `refreshCookie()` 方法，这个错误在开发阶段就能被发现：

```javascript
// 伪代码：单元测试
describe('DouyinAPICrawler', () => {
    it('should refresh cookie from browser context', async () => {
        const mockPlatform = {
            browserManager: {
                contexts: new Map([
                    ['acc-123', mockContext]
                ])
            }
        };

        const crawler = new DouyinAPICrawler(mockAccount, config, mockPlatform);
        await crawler.refreshCookie();

        expect(crawler.cookie).toBeDefined();
    });
});
```

## 后续优化建议

### 1. 在 BrowserManagerV2 中添加封装方法

为了提高可用性，可以添加一个 `getContext()` 方法：

```javascript
// packages/worker/src/browser/browser-manager-v2.js

/**
 * 获取账户的浏览器上下文
 * @param {string} accountId - 账户ID
 * @returns {BrowserContext|null} 浏览器上下文或null
 */
getContext(accountId) {
    return this.contexts.get(accountId);
}
```

**好处**：
- 与调用者的期望一致
- 未来可以添加验证/日志
- 不影响现有的直接访问方式

### 2. 添加上下文有效性检查

在 `refreshCookie()` 中添加更多检查：

```javascript
async refreshCookie() {
    const context = this.platform.browserManager.contexts.get(this.account.id);

    if (!context) {
        throw new Error('账户浏览器上下文不存在，请确保登录检测任务已运行');
    }

    // 🆕 检查上下文是否仍然有效
    const isValid = await this.platform.browserManager.isBrowserContextValid(this.account.id);
    if (!isValid) {
        throw new Error('浏览器上下文已失效，请重启登录检测任务');
    }

    // ...
}
```

### 3. 统一Cookie管理

考虑创建一个 `CookieManager` 类，统一管理Cookie的获取、刷新和更新：

```javascript
class CookieManager {
    constructor(browserManager) {
        this.browserManager = browserManager;
        this.cookieCache = new Map(); // accountId -> cookie
    }

    async getCookie(accountId, options = {}) {
        // 检查缓存
        // 从上下文获取
        // 过滤域名
        // 更新缓存
    }

    async refreshCookie(accountId) {
        // 强制刷新，不使用缓存
    }
}
```

### 4. 添加性能监控

记录Cookie刷新的耗时和频率：

```javascript
async refreshCookie() {
    const startTime = Date.now();

    try {
        // ... 刷新逻辑 ...

        const duration = Date.now() - startTime;
        logger.debug(`[${this.account.id}] Cookie刷新完成，耗时: ${duration}ms`);
    } catch (error) {
        // ...
    }
}
```

---

**报告生成时间**：2025-11-28
**修复状态**：✅ 已完成
**影响范围**：API爬虫的Cookie刷新功能
**修复作者**：Claude (AI Assistant)
**关联报告**：[API爬虫作品同步数量Bug修复报告.md](./API爬虫作品同步数量Bug修复报告.md)
