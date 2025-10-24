# TabManager 自动生命周期管理设计

**设计时间**: 2025-10-24 20:45
**问题**: 当前设计存在职责不清,既有 `persistent` 参数又要手动 `closeTab()`
**目标**: 实现完全自动的生命周期管理,业务代码无需关心窗口关闭

---

## 问题分析

### 当前设计的问题

```javascript
// 业务代码需要做两件事:
// 1. 指定 persistent=false
const { tabId, page } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.LOGIN,
  persistent: false  // ← 告诉 TabManager 这是临时窗口
});

// 2. 使用完后还要手动关闭
await page.goto('https://...');
await extractUserInfo(page);
await tabManager.closeTab(accountId, tabId);  // ← 又要手动关闭?
```

**问题**: persistent 参数已经表达了"用完后关闭"的语义,为什么还要手动调用 closeTab()?

### 用户期望的设计

```javascript
// 业务代码只需要:
// 1. 获取页面并声明是临时窗口
const { page, release } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.LOGIN,
  persistent: false  // ← 临时窗口
});

// 2. 使用页面
await page.goto('https://...');
const userInfo = await extractUserInfo(page);

// 3. 告诉 TabManager: 我用完了
await release();  // ← 自动关闭临时窗口
```

---

## 核心设计

### 1. 窗口生命周期状态机

```
创建窗口 (persistent=false)
  ↓
ACTIVE (正在使用)
  ↓
release() 被调用
  ↓
RELEASED (标记为已释放)
  ↓
自动清理检查
  ↓
CLOSED (已关闭)
```

### 2. API 接口重新设计

#### getPageForTask() 返回值

```javascript
{
  tabId: string,          // Tab ID
  page: Page,             // Playwright Page 对象
  release: async () => {  // ⭐ 释放函数
    // 非持久窗口: 标记为已释放,触发自动清理
    // 持久窗口: 不做任何操作
  }
}
```

#### 业务代码使用模式

**模式A: 临时窗口 (登录/回复)**
```javascript
const { page, release } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.LOGIN,
  persistent: false  // 临时窗口
});

try {
  await page.goto('https://...');
  const userInfo = await extractUserInfo(page);
  return userInfo;
} finally {
  await release();  // 无论成功失败,都释放窗口
}
```

**模式B: 持久窗口 (爬虫)**
```javascript
const { page, release } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.SPIDER_DM,
  persistent: true  // 持久窗口
});

// 持久窗口不需要释放
await page.goto('https://...');
const messages = await crawlMessages(page);

// release() 对持久窗口无效,调用也不会关闭
```

### 3. 自动清理策略

#### 策略A: 立即清理 (推荐)
```javascript
async releaseTab(accountId, tabId) {
  const tab = this.getTab(accountId, tabId);

  if (!tab) return;

  if (!tab.persistent) {
    // 非持久窗口: 立即关闭
    await this.closeTab(accountId, tabId);
  }
  // 持久窗口: 什么都不做
}
```

**优点**:
- 简单直接
- 内存占用最小
- 行为可预测

#### 策略B: 延迟清理
```javascript
async releaseTab(accountId, tabId) {
  const tab = this.getTab(accountId, tabId);

  if (!tab) return;

  if (!tab.persistent) {
    // 标记为已释放
    tab.status = 'RELEASED';
    tab.releasedAt = Date.now();

    // 30秒后清理
    setTimeout(async () => {
      if (tab.status === 'RELEASED') {
        await this.closeTab(accountId, tabId);
      }
    }, 30000);
  }
}
```

**优点**:
- 可以在短时间内复用窗口
- 减少频繁创建/销毁

**缺点**:
- 内存占用更高
- 实现复杂

**推荐**: 使用策略A (立即清理)

---

## 实现细节

### 修改 1: Tab 信息结构

```javascript
// 原来
{
  tabId,
  page,
  tag,
  persistent,
  createdAt
}

// 现在
{
  tabId,
  page,
  tag,
  persistent,
  createdAt,
  status: 'ACTIVE' | 'RELEASED' | 'CLOSED',  // ← 新增状态
  releasedAt: null,  // ← 释放时间戳
}
```

### 修改 2: getPageForTask() 方法

```javascript
async getPageForTask(accountId, options = {}) {
  const {
    tag,
    persistent = false,
    shareable = false,
    forceNew = false,
  } = options;

  // ... 查找/创建逻辑不变 ...

  const { tabId, page } = await this.createTab(accountId, tag, persistent);

  // ⭐ 返回 release 函数
  return {
    tabId,
    page,
    release: async () => {
      await this.releaseTab(accountId, tabId);
    }
  };
}
```

### 修改 3: 新增 releaseTab() 方法

```javascript
/**
 * ⭐ 释放 Tab（业务代码调用，表示已用完）
 *
 * 非持久窗口: 立即关闭
 * 持久窗口: 不做任何操作
 *
 * @param {string} accountId - 账户ID
 * @param {string} tabId - Tab ID
 */
async releaseTab(accountId, tabId) {
  const tab = this.getTab(accountId, tabId);

  if (!tab) {
    logger.warn(`Tab ${tabId} not found for account ${accountId}`);
    return;
  }

  if (tab.status === 'RELEASED' || tab.status === 'CLOSED') {
    logger.warn(`Tab ${tabId} already released/closed`);
    return;
  }

  if (!tab.persistent) {
    // 非持久窗口: 立即关闭
    logger.info(`🗑️  Releasing non-persistent tab ${tabId} (tag=${tab.tag})`);

    tab.status = 'RELEASED';
    tab.releasedAt = Date.now();

    // 立即清理
    await this.closeTab(accountId, tabId);
  } else {
    // 持久窗口: 不做任何操作
    logger.debug(`🔒 Persistent tab ${tabId} (tag=${tab.tag}) not released`);
  }
}
```

### 修改 4: 更新 closeTab() 方法

```javascript
/**
 * ⭐ 关闭 Tab（内部方法，通常不应该直接调用）
 *
 * @param {string} accountId - 账户ID
 * @param {string} tabId - Tab ID
 * @returns {Promise<boolean>} 是否成功关闭
 */
async closeTab(accountId, tabId) {
  const accountTabs = this.tabs.get(accountId);
  if (!accountTabs) {
    logger.warn(`No tabs found for account ${accountId}`);
    return false;
  }

  const tab = accountTabs.get(tabId);
  if (!tab) {
    logger.warn(`Tab ${tabId} not found for account ${accountId}`);
    return false;
  }

  // ⚠️ 检查是否是最后一个窗口
  if (accountTabs.size <= 1) {
    logger.warn(`⚠️  Cannot close last tab ${tabId} - would exit browser`);

    // ⭐ 将此窗口转换为占位窗口
    tab.tag = TabTag.PLACEHOLDER;
    tab.persistent = true;
    tab.status = 'ACTIVE';  // ← 重置状态

    logger.info(`🔄 Tab ${tabId} converted to PLACEHOLDER`);
    return false;
  }

  // 安全关闭
  try {
    if (!tab.page.isClosed()) {
      await tab.page.close();
      logger.info(`🗑️  Closed tab ${tabId} (tag=${tab.tag})`);
    }

    tab.status = 'CLOSED';
    accountTabs.delete(tabId);
    return true;

  } catch (error) {
    logger.error(`Failed to close tab ${tabId}:`, error);
    return false;
  }
}
```

---

## 业务代码改造

### 改造前: platform.js startLogin()

```javascript
async startLogin(options) {
  const { accountId, sessionId, proxy } = options;

  // 1. 获取登录窗口
  const { tabId, page: loginPage } = await this.browserManager.tabManager.getPageForTask(accountId, {
    tag: TabTag.LOGIN,
    persistent: false,
    shareable: true,
    forceNew: false
  });

  // 2. 登录流程
  const loginStatus = await this.checkLoginStatus(loginPage);

  if (loginStatus.isLoggedIn) {
    const userInfo = await this.extractUserInfo(loginPage);

    // ❌ 问题: 需要主动关闭窗口
    await this.browserManager.tabManager.closeTab(accountId, tabId);

    await this.sendLoginStatus(sessionId, 'success', { /*...*/ });
    return { status: 'success', userInfo };
  }

  // ...
}
```

### 改造后: platform.js startLogin()

```javascript
async startLogin(options) {
  const { accountId, sessionId, proxy } = options;

  // 1. 获取登录窗口 (包含 release 函数)
  const { page: loginPage, release } = await this.browserManager.tabManager.getPageForTask(accountId, {
    tag: TabTag.LOGIN,
    persistent: false,  // ← 临时窗口
    shareable: true,
    forceNew: false
  });

  try {
    // 2. 登录流程
    const loginStatus = await this.checkLoginStatus(loginPage);

    if (loginStatus.isLoggedIn) {
      const userInfo = await this.extractUserInfo(loginPage);

      // ✅ 告诉 TabManager: 登录窗口用完了
      await release();

      await this.sendLoginStatus(sessionId, 'success', { /*...*/ });
      return { status: 'success', userInfo };
    }

    // ... 其他逻辑 ...

  } finally {
    // ✅ 确保窗口被释放 (即使出错)
    await release();
  }
}
```

### 改造前: crawlDirectMessages()

```javascript
async crawlDirectMessages(accountId) {
  // 持久窗口,不需要关闭
  const { page } = await this.browserManager.tabManager.getPageForTask(accountId, {
    tag: TabTag.SPIDER_DM,
    persistent: true,  // ← 持久窗口
    shareable: false,
    forceNew: false
  });

  await page.goto('https://creator.douyin.com/...');
  const messages = await this.extractMessages(page);

  return messages;
  // ✅ 不需要关闭,窗口会一直保留
}
```

### 改造后: crawlDirectMessages()

```javascript
async crawlDirectMessages(accountId) {
  // 持久窗口,不需要关闭
  const { page, release } = await this.browserManager.tabManager.getPageForTask(accountId, {
    tag: TabTag.SPIDER_DM,
    persistent: true,  // ← 持久窗口
    shareable: false,
    forceNew: false
  });

  await page.goto('https://creator.douyin.com/...');
  const messages = await this.extractMessages(page);

  // release() 对持久窗口无效,可以不调用
  // 即使调用了也不会关闭窗口
  return messages;
}
```

---

## 优势对比

### 旧设计 (手动管理)

```javascript
// ❌ 职责不清
const { tabId, page } = await getPageForTask(accountId, {
  persistent: false  // 告诉要关闭
});

await doSomething(page);

await closeTab(accountId, tabId);  // 又手动关闭?
```

**问题**:
1. persistent 参数和 closeTab() 职责重复
2. 容易忘记调用 closeTab(),导致窗口泄漏
3. 没有强制性的资源释放机制

### 新设计 (自动管理)

```javascript
// ✅ 职责清晰
const { page, release } = await getPageForTask(accountId, {
  persistent: false  // 告诉是临时窗口
});

try {
  await doSomething(page);
} finally {
  await release();  // 明确告知已用完,自动决定是否关闭
}
```

**优势**:
1. persistent 参数控制生命周期策略
2. release() 函数表达"我用完了"的语义
3. try-finally 确保窗口一定被释放
4. 对持久窗口调用 release() 无效,不会误关闭

---

## 迁移计划

### Phase 1: 实现新 API (兼容旧 API)

1. 修改 TabManager:
   - 添加 Tab 状态字段
   - 实现 releaseTab() 方法
   - getPageForTask() 返回 release 函数
   - 保留 closeTab() 方法 (兼容旧代码)

2. 测试新 API:
   - 单元测试 releaseTab()
   - 集成测试登录流程

### Phase 2: 改造业务代码

1. 改造 platform.js:
   - startLogin() - 使用 release()
   - startLoginCheck() - 使用 release()
   - sendReply*() - 使用 release()
   - crawlDirectMessages() - 不调用 release (持久)
   - crawlComments() - 不调用 release (持久)

2. 删除手动 closeTab() 调用

### Phase 3: 废弃 closeTab() 公开 API

1. 将 closeTab() 标记为内部方法
2. 更新文档,说明应该使用 release()
3. 添加弃用警告

---

## 未来优化

### 1. 窗口池管理

对于频繁创建/销毁的临时窗口,可以实现窗口池:

```javascript
// 释放时放回池中
await release();
  ↓
窗口不立即关闭,放入池中
  ↓
下次需要同类窗口时,从池中取出
  ↓
减少创建/销毁开销
```

### 2. 自动清理定时任务

定期检查长时间未使用的窗口:

```javascript
setInterval(() => {
  for (const [accountId, accountTabs] of this.tabs) {
    for (const [tabId, tab] of accountTabs) {
      // 非持久窗口超过 5 分钟未释放 → 警告
      if (!tab.persistent && tab.status === 'ACTIVE') {
        const age = Date.now() - tab.createdAt;
        if (age > 5 * 60 * 1000) {
          logger.warn(`⚠️  Tab ${tabId} not released after 5 minutes`);
        }
      }
    }
  }
}, 60000);  // 每分钟检查一次
```

### 3. 资源泄漏检测

检测未释放的临时窗口:

```javascript
getUnreleasedTabs(accountId) {
  const accountTabs = this.getAccountTabs(accountId);
  const unreleased = [];

  for (const [tabId, tab] of accountTabs) {
    if (!tab.persistent && tab.status === 'ACTIVE') {
      const age = Date.now() - tab.createdAt;
      if (age > 60000) {  // 超过 1 分钟
        unreleased.push({ tabId, tag: tab.tag, age });
      }
    }
  }

  return unreleased;
}
```

---

## 总结

### 核心改进

1. **语义清晰**: persistent 参数控制生命周期,release() 表达使用完毕
2. **自动管理**: TabManager 自动决定是否关闭窗口
3. **防止泄漏**: try-finally 确保资源释放
4. **向后兼容**: 保留 closeTab() 方法,逐步迁移

### 最佳实践

```javascript
// ✅ 临时窗口
const { page, release } = await getPageForTask(accountId, {
  tag: TabTag.LOGIN,
  persistent: false
});

try {
  await doSomething(page);
} finally {
  await release();  // 确保释放
}

// ✅ 持久窗口
const { page } = await getPageForTask(accountId, {
  tag: TabTag.SPIDER_DM,
  persistent: true
});

await doSomething(page);
// 不需要 release,窗口保持打开
```

---

**报告生成时间**: 2025-10-24 20:45
**设计状态**: ✅ 设计完成,等待实现
**下一步**: 实现新的 TabManager API
