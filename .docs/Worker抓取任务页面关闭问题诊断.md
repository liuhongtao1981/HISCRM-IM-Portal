# Worker 抓取任务页面关闭问题诊断

**问题**: 登录成功后，后续抓取任务无法执行，日志显示 "Target page, context or browser has been closed"

**根本原因**: 登录使用的页面对象在登录完成后没有被保存或被错误地关闭了，导致后续任务无法使用

---

## 🔍 问题分析

### 日志证据

```
✅ [checkLoginStatus] Login successful - found "抖音号：" text on page
✅ [extractUserInfo] Extracted user info
[Login Monitor] Sent login success with cookies and fingerprint

...然后立刻出现...

❌ Failed to check login status: page.textContent:
   Target page, context or browser has been closed
```

### 问题流程

```
startLogin()
  ↓
createAccountContext() ✅
  ↓
newPage()  ← 创建登录页面
  ↓
handleQRCodeLogin(page, ...)  ← 使用这个页面登录
  ↓
  waitForLogin()
    ↓
    检测到登录成功
    ↓
    clearInterval() ✅
    ↓
    resolve(true) ✅
  ↓
return { status: 'success' }  ← 返回成功
  ↓
loginSession 结束
  ↓
❌ 页面被关闭 / 上下文被清理???
  ↓
监控任务开始
  ↓
getOrCreatePage()
  ↓
❌ 发现页面已关闭
  ↓
❌ 创建新页面失败或上下文不可用
  ↓
❌ 导致抓取任务无法执行
```

---

## 📝 你提到的正确做法

> "不应该先看浏览器tab有没有打开嘛，没打开就去开一个嘛，或者第一个tab页面操作，然后在进行其他的"

**完全同意！** 正确的流程应该是：

```
监控任务开始
  ↓
1️⃣ 检查当前页面
  if (page && !page.isClosed()) {
    使用现有页面 ✅
  } else {
    2️⃣ 创建新页面 ✅
  }
  ↓
3️⃣ 使用页面进行操作（导航、抓取等）
  ↓
保持页面打开以供后续任务使用
```

---

## 🐛 当前代码问题

### getOrCreatePage() 的实现

**文件**: `packages/worker/src/platforms/douyin/platform.js:1096-1106`

```javascript
async getOrCreatePage(accountId) {
  if (this.currentPage && !this.currentPage.isClosed()) {
    return this.currentPage;  // ✅ 复用现有页面
  }

  const context = await this.ensureAccountContext(accountId);
  this.currentPage = await context.newPage();  // 创建新页面
  logger.info(`Created new page for crawling account ${accountId}`);

  return this.currentPage;
}
```

**问题**:
- ⚠️ 只保存一个 `this.currentPage`（共享变量）
- ⚠️ 登录时创建的页面和抓取时需要的页面可能是不同的
- ❌ 没有确保登录成功后页面仍然可用

---

## 🔧 修复方案

### 方案1: 确保页面在登录成功后被保存（推荐）

**文件**: `packages/worker/src/platforms/douyin/platform.js` - `startLogin()` 方法

```javascript
async startLogin(options) {
  const { accountId, sessionId, proxy } = options;

  try {
    logger.info(`Starting Douyin login for account ${accountId}`);

    // 1. 确保账户的浏览器上下文有效
    const context = await this.ensureAccountContext(accountId, proxy);

    // 2. 创建新页面
    const page = await context.newPage();

    // ✅ 新增：立即保存页面对象到 this.currentPage
    // 这样后续任务可以复用这个页面
    this.currentPage = page;
    logger.info(`Saved page object for account ${accountId}`);

    // 3. 导航到登录页
    await page.goto('https://creator.douyin.com/', { ... });

    // ... 其他登录逻辑 ...

    if (loginMethod.type === 'qrcode') {
      return await this.handleQRCodeLogin(page, accountId, sessionId, {
        qrSelector: loginMethod.selector,
      });
      // ✅ 登录成功后，page 对象仍然被保存在 this.currentPage 中
    }
  } catch (error) {
    logger.error(`Login failed for account ${accountId}:`, error);
    throw error;
  }
}
```

### 方案2: 改进 getOrCreatePage 的逻辑

**更安全的页面管理**:

```javascript
async getOrCreatePage(accountId) {
  // 1️⃣ 先检查现有页面
  if (this.currentPage && !this.currentPage.isClosed()) {
    logger.debug(`Reusing existing page for account ${accountId}`);
    return this.currentPage;
  }

  logger.info(`Current page is closed or not available, creating new page`);

  // 2️⃣ 检查上下文是否还活着
  let context = this.getAccountContext(accountId);

  if (!context) {
    logger.warn(`No context for account ${accountId}, recreating...`);
    // 3️⃣ 如果上下文也没了，重建上下文
    context = await this.ensureAccountContext(accountId);
  }

  // 4️⃣ 创建新页面
  try {
    this.currentPage = await context.newPage();
    logger.info(`✅ Created new page for account ${accountId}`);
    return this.currentPage;
  } catch (error) {
    logger.error(`Failed to create new page: ${error.message}`);

    // 5️⃣ 如果创建失败，重新确保上下文有效
    context = await this.ensureAccountContext(accountId);
    this.currentPage = await context.newPage();

    logger.info(`✅ Recovered and created new page for account ${accountId}`);
    return this.currentPage;
  }
}
```

### 方案3: 在每个任务开始前检查页面状态

**文件**: `packages/worker/src/handlers/task-runner.js`

```javascript
async executeMonitoringTask(account) {
  logger.info(`Starting monitoring task for account ${account.id}`);

  try {
    // ✅ 第一步：确保有可用的页面
    const platform = this.platformManager.getPlatform(account.platform);
    const page = await platform.getOrCreatePage(account.id);

    if (!page) {
      logger.error(`Failed to get or create page for account ${account.id}`);
      return;
    }

    if (page.isClosed()) {
      logger.warn(`Page is closed for account ${account.id}, recreating...`);
      const newPage = await platform.getOrCreatePage(account.id);
      if (!newPage) throw new Error('Failed to create new page');
    }

    // ✅ 第二步：现在确认页面可用后再进行其他操作
    logger.info(`✅ Page is ready for account ${account.id}`);

    // 进行爬取操作
    await platform.crawlComments(account);
    await platform.crawlDirectMessages(account);

  } catch (error) {
    logger.error(`Monitoring task failed for account ${account.id}:`, error);
  }
}
```

---

## 📊 问题根因总结

| 问题 | 原因 | 症状 |
|------|------|------|
| **页面被关闭** | 登录完成后，页面对象没有被妥善保存 | "Target page has been closed" 错误 |
| **上下文不可用** | 登录使用的上下文可能被误关闭 | "Target context or browser has been closed" 错误 |
| **没有页面复用** | 每次任务都尝试创建新页面，但上下文已不可用 | 频繁出现创建失败 |

---

## ✅ 修复步骤

1. **保存登录后的页面**
   - 在 `startLogin()` 中立即保存 `page` 到 `this.currentPage`
   - 确保登录成功后页面对象不被丢弃

2. **改进 getOrCreatePage 逻辑**
   - 先检查页面是否可用
   - 如果页面关闭，检查上下文
   - 如果上下文也没了，重建整个环境

3. **在任务前检查页面**
   - 每个监控任务开始时，先调用 `getOrCreatePage()`
   - 验证页面状态后再进行操作
   - 如果页面不可用，立即创建新的

4. **保持页面生命周期**
   - 不要在登录后立即关闭页面
   - 让页面为后续的抓取任务服务
   - 只在账户卸载时才关闭

---

## 🎯 预期效果

修复后：
```
✅ 登录成功
✅ 页面被保存
✅ 抓取任务开始
✅ 检查页面状态 - 页面仍然打开 ✅
✅ 执行抓取操作 - 成功 ✅
✅ 评论和私信被正确抓取 ✅
```

而不是现在的：
```
✅ 登录成功
❌ 页面被关闭
❌ 抓取任务开始
❌ 检查页面状态 - 页面已关闭 ❌
❌ 创建新页面失败 ❌
❌ 抓取任务无法执行 ❌
```

