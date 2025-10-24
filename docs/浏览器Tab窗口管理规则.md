# 浏览器 Tab 窗口管理规则

## 设计原则

### 核心原则
1. **资源最小化**：每个账户最多 2-3 个 Tab，避免资源浪费
2. **复用优先**：能复用的 Tab 不创建新的
3. **职责明确**：每个 Tab 有明确的用途和生命周期
4. **智能转换**：临时 Tab 完成任务后，可转换为长期 Tab

## Tab 管理规则

### 规则 1：默认 Tab (Tab 1) 的生命周期

```
┌─────────────────────────────────────────────────────┐
│  Tab 1 生命周期（动态转换）                          │
└─────────────────────────────────────────────────────┘

1. 浏览器启动
   ↓
   Context 自动创建 Tab 1
   状态: INITIALIZATION
   用途: 待定

2. ⭐ Worker 启动检测
   ↓
   Tab 1 用于登录状态检测
   状态: LOGIN_CHECK
   用途: 访问 creator.douyin.com，检测登录状态
   ↓
   ├─ 检测完成：已登录 ✅
   │  ↓
   │  Tab 1 转换为 Spider1
   │  状态: SPIDER1
   │  用途: 私信爬取（长期运行）
   │
   └─ 检测完成：未登录 ❌
      ↓
      Tab 1 保持等待状态
      状态: WAITING_LOGIN
      用途: 等待用户登录
      ↓
      用户点击登录
      ↓
      Tab 1 显示二维码
      状态: QR_CODE_LOGIN
      用途: 登录界面
      ↓
      登录成功
      ↓
      Tab 1 转换为 Spider1
      状态: SPIDER1
      用途: 私信爬取（长期运行）
```

### 规则 2：Spider Tab 的创建时机

```
┌─────────────────────────────────────────────────────┐
│  Spider Tab 创建规则                                │
└─────────────────────────────────────────────────────┘

Spider1 (私信爬取)
├─ 来源: Tab 1 转换而来
├─ 创建时机: 登录成功后
├─ 生命周期: 长期运行，不关闭
└─ 关闭时机: 浏览器关闭

Spider2 (评论爬取)
├─ 来源: 按需创建新 Tab
├─ 创建时机: 首次需要评论爬取时
├─ 生命周期: 长期运行，不关闭
└─ 关闭时机: 浏览器关闭

Spider3+ (未来扩展)
├─ 来源: 按需创建
├─ 创建时机: 需要时
├─ 生命周期: 根据需求
└─ 关闭时机: 根据需求
```

### 规则 3：临时 Tab 的管理

```
┌─────────────────────────────────────────────────────┐
│  临时 Tab 管理规则                                   │
└─────────────────────────────────────────────────────┘

创建场景：
1. 回复评论/私信（需要访问特定页面）
2. 发送消息
3. 获取详细信息（作品详情、用户详情等）

生命周期：
创建 → 执行任务 → 立即关闭

示例：回复评论
┌─────────────────────────────────────┐
│ 1. 检测到需要回复的评论              │
│ 2. 创建临时 Tab 3                    │
│ 3. 导航到评论所在页面                │
│ 4. 执行回复操作                      │
│ 5. 等待操作成功                      │
│ 6. ⭐ 立即关闭 Tab 3（释放资源）     │
└─────────────────────────────────────┘
```

### 规则 4：Tab 数量限制

```
每个账户的 Tab 数量限制：

正常状态（已登录，爬虫运行中）：
├─ Tab 1: Spider1 (私信)
├─ Tab 2: Spider2 (评论)
└─ Tab 3: 临时任务（执行完立即关闭）
总计: 2-3 个

等待登录状态：
└─ Tab 1: 等待登录
总计: 1 个

登录中状态：
└─ Tab 1: 显示二维码
总计: 1 个

⚠️  超过限制时的处理：
- 关闭最早创建的临时 Tab
- 或者等待临时 Tab 完成任务
- 避免创建过多 Tab 导致资源耗尽
```

## 代码实现方案

### 方案 1：Tab 状态机管理

**新增文件**：`packages/worker/src/browser/tab-state-manager.js`

```javascript
/**
 * Tab 状态管理器
 *
 * 管理每个账户的 Tab 状态和转换
 */

const logger = require('../utils/logger')('TabStateManager');

// Tab 状态枚举
const TabState = {
  INITIALIZATION: 'initialization',      // 初始化
  LOGIN_CHECK: 'login_check',           // 登录检测中
  WAITING_LOGIN: 'waiting_login',       // 等待登录
  QR_CODE_LOGIN: 'qr_code_login',       // 二维码登录中
  SPIDER1: 'spider1',                   // 私信爬取
  SPIDER2: 'spider2',                   // 评论爬取
  TEMPORARY: 'temporary',               // 临时任务
  CLOSED: 'closed',                     // 已关闭
};

class TabStateManager {
  constructor() {
    // { accountId -> { tabId -> { page, state, purpose, createdAt } } }
    this.tabs = new Map();
  }

  /**
   * 注册 Tab
   */
  registerTab(accountId, tabId, page, state, purpose = '') {
    if (!this.tabs.has(accountId)) {
      this.tabs.set(accountId, new Map());
    }

    this.tabs.get(accountId).set(tabId, {
      page,
      state,
      purpose,
      createdAt: Date.now(),
    });

    logger.info(`✅ Registered Tab ${tabId} for account ${accountId}: state=${state}, purpose=${purpose}`);
  }

  /**
   * 转换 Tab 状态
   *
   * @param {string} accountId - 账户ID
   * @param {string} tabId - Tab ID
   * @param {string} newState - 新状态
   * @param {string} newPurpose - 新用途
   */
  transitionTab(accountId, tabId, newState, newPurpose = '') {
    const accountTabs = this.tabs.get(accountId);
    if (!accountTabs || !accountTabs.has(tabId)) {
      logger.warn(`Tab ${tabId} not found for account ${accountId}`);
      return false;
    }

    const tab = accountTabs.get(tabId);
    const oldState = tab.state;

    // 验证状态转换是否合法
    if (!this.isValidTransition(oldState, newState)) {
      logger.error(`Invalid state transition for Tab ${tabId}: ${oldState} -> ${newState}`);
      return false;
    }

    tab.state = newState;
    tab.purpose = newPurpose || tab.purpose;

    logger.info(`🔄 Tab ${tabId} state transition: ${oldState} -> ${newState} (${newPurpose})`);
    return true;
  }

  /**
   * 验证状态转换是否合法
   */
  isValidTransition(oldState, newState) {
    const validTransitions = {
      [TabState.INITIALIZATION]: [
        TabState.LOGIN_CHECK,
        TabState.SPIDER1,
        TabState.CLOSED,
      ],
      [TabState.LOGIN_CHECK]: [
        TabState.SPIDER1,        // 检测通过 → Spider1
        TabState.WAITING_LOGIN,  // 未登录 → 等待登录
        TabState.CLOSED,
      ],
      [TabState.WAITING_LOGIN]: [
        TabState.QR_CODE_LOGIN,  // 用户点击登录
        TabState.CLOSED,
      ],
      [TabState.QR_CODE_LOGIN]: [
        TabState.SPIDER1,        // 登录成功 → Spider1
        TabState.WAITING_LOGIN,  // 登录失败 → 重新等待
        TabState.CLOSED,
      ],
      [TabState.SPIDER1]: [
        TabState.CLOSED,         // 只能关闭
      ],
      [TabState.SPIDER2]: [
        TabState.CLOSED,
      ],
      [TabState.TEMPORARY]: [
        TabState.CLOSED,         // 临时任务完成即关闭
      ],
    };

    const allowed = validTransitions[oldState] || [];
    return allowed.includes(newState);
  }

  /**
   * 获取账户的所有 Tab
   */
  getAccountTabs(accountId) {
    return this.tabs.get(accountId) || new Map();
  }

  /**
   * 获取特定状态的 Tab
   */
  getTabByState(accountId, state) {
    const accountTabs = this.getAccountTabs(accountId);
    for (const [tabId, tabInfo] of accountTabs.entries()) {
      if (tabInfo.state === state) {
        return { tabId, ...tabInfo };
      }
    }
    return null;
  }

  /**
   * 获取 Tab 数量
   */
  getTabCount(accountId) {
    return this.getAccountTabs(accountId).size;
  }

  /**
   * 移除 Tab
   */
  removeTab(accountId, tabId) {
    const accountTabs = this.tabs.get(accountId);
    if (accountTabs) {
      const removed = accountTabs.delete(tabId);
      if (removed) {
        logger.info(`🗑️  Removed Tab ${tabId} for account ${accountId}`);
      }
    }
  }

  /**
   * 清理账户的所有 Tab
   */
  clearAccountTabs(accountId) {
    this.tabs.delete(accountId);
    logger.info(`🗑️  Cleared all tabs for account ${accountId}`);
  }
}

module.exports = { TabStateManager, TabState };
```

### 方案 2：改进 BrowserManager

**修改文件**：`packages/worker/src/browser/browser-manager-v2.js`

```javascript
const { TabStateManager, TabState } = require('./tab-state-manager');

class BrowserManager {
  constructor(config = {}) {
    // ... 现有代码 ...

    // ⭐ 新增：Tab 状态管理器
    this.tabStateManager = new TabStateManager();
  }

  /**
   * ⭐ 改进：启动 PersistentContext 并初始化 Tab 1
   */
  async launchPersistentContextForAccount(accountId, options = {}) {
    try {
      // ... 现有代码：启动 Context ...

      // 📌 获取第一个默认标签页
      const pages = context.pages();
      if (pages.length > 0) {
        const defaultPage = pages[0];
        const tabId = 'tab1';

        // ⭐ 注册 Tab 1，状态为 INITIALIZATION
        this.tabStateManager.registerTab(accountId, tabId, defaultPage, TabState.INITIALIZATION, 'Default tab');

        // 将 Tab 1 保存到 spiderPages（未来可能转换为 Spider1）
        if (!this.spiderPages.has(accountId)) {
          this.spiderPages.set(accountId, {});
        }
        this.spiderPages.get(accountId).spider1 = defaultPage;

        logger.info(`📌 Tab 1 initialized for account ${accountId}`);
      }

      // ... 继续现有代码 ...

    } catch (error) {
      logger.error(`Failed to launch persistent context for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * ⭐ 新增：将 Tab 1 转换为登录检测模式
   */
  async prepareTab1ForLoginCheck(accountId) {
    const tab = this.tabStateManager.getTabByState(accountId, TabState.INITIALIZATION);
    if (!tab) {
      throw new Error(`Tab 1 not found for account ${accountId}`);
    }

    // 转换状态
    this.tabStateManager.transitionTab(accountId, 'tab1', TabState.LOGIN_CHECK, 'Login status check');

    // 返回 Tab 1 页面
    return tab.page;
  }

  /**
   * ⭐ 新增：登录检测完成后，转换 Tab 1 为 Spider1
   */
  async convertTab1ToSpider1(accountId) {
    const tab = this.tabStateManager.getTabByState(accountId, TabState.LOGIN_CHECK);
    if (!tab) {
      logger.warn(`Tab 1 not in LOGIN_CHECK state for account ${accountId}, cannot convert to Spider1`);
      return null;
    }

    // 转换状态
    this.tabStateManager.transitionTab(accountId, 'tab1', TabState.SPIDER1, 'Direct messages crawling');

    logger.info(`✅ Tab 1 converted to Spider1 for account ${accountId}`);
    return tab.page;
  }

  /**
   * ⭐ 新增：登录检测失败，Tab 1 进入等待登录状态
   */
  async setTab1WaitingLogin(accountId) {
    const tab = this.tabStateManager.getTabByState(accountId, TabState.LOGIN_CHECK);
    if (tab) {
      this.tabStateManager.transitionTab(accountId, 'tab1', TabState.WAITING_LOGIN, 'Waiting for user login');
      logger.info(`⏳ Tab 1 waiting for login for account ${accountId}`);
    }
  }

  /**
   * ⭐ 新增：用户登录时，Tab 1 进入二维码登录状态
   */
  async setTab1QRCodeLogin(accountId) {
    const tab = this.tabStateManager.getTabByState(accountId, TabState.WAITING_LOGIN);
    if (tab) {
      this.tabStateManager.transitionTab(accountId, 'tab1', TabState.QR_CODE_LOGIN, 'QR code login in progress');
      logger.info(`📱 Tab 1 showing QR code for account ${accountId}`);
      return tab.page;
    }
    return null;
  }

  /**
   * ⭐ 改进：获取 Spider 页面
   */
  async getSpiderPage(accountId, spiderType = 'spider1') {
    try {
      let spiders = this.spiderPages.get(accountId);

      if (!spiders) {
        spiders = {};
        this.spiderPages.set(accountId, spiders);
      }

      // Spider1 应该已经由 Tab 1 转换而来
      if (spiderType === 'spider1') {
        if (!spiders.spider1) {
          throw new Error(`Spider1 page not found for account ${accountId} - Tab 1 may not have been converted yet`);
        }
        if (spiders.spider1.isClosed()) {
          throw new Error(`Spider1 page is closed for account ${accountId}`);
        }
        logger.debug(`🕷️ Using Spider1 (Tab 1) for account ${accountId}`);
        return spiders.spider1;
      }

      // Spider2 按需创建
      if (spiderType === 'spider2') {
        if (!spiders.spider2 || spiders.spider2.isClosed()) {
          const context = this.contexts.get(accountId);
          if (!context) {
            throw new Error(`Context not found for account ${accountId}`);
          }

          spiders.spider2 = await context.newPage();

          // ⭐ 注册 Tab 2
          this.tabStateManager.registerTab(accountId, 'tab2', spiders.spider2, TabState.SPIDER2, 'Comments crawling');

          logger.info(`🕷️ Created Spider2 (Tab 2) for account ${accountId}`);
        }
        logger.debug(`🕷️ Using Spider2 (Tab 2) for account ${accountId}`);
        return spiders.spider2;
      }

      throw new Error(`Unknown spider type: ${spiderType}`);

    } catch (error) {
      logger.error(`Failed to get spider page for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * ⭐ 改进：创建临时页面
   */
  async createTemporaryPage(accountId, purpose = 'temporary task') {
    try {
      // 检查 Tab 数量限制
      const tabCount = this.tabStateManager.getTabCount(accountId);
      if (tabCount >= 3) {
        logger.warn(`Account ${accountId} already has ${tabCount} tabs, waiting for cleanup...`);
        // 等待临时 Tab 释放（最多等待 10 秒）
        await this.waitForTemporaryTabRelease(accountId, 10000);
      }

      const context = this.contexts.get(accountId);
      if (!context) {
        throw new Error(`Context not found for account ${accountId}`);
      }

      const page = await context.newPage();
      const tabId = `temp-${Date.now()}`;

      // ⭐ 注册临时 Tab
      this.tabStateManager.registerTab(accountId, tabId, page, TabState.TEMPORARY, purpose);

      logger.info(`✨ Created temporary Tab ${tabId} for account ${accountId}: ${purpose}`);

      // 记录临时页面
      if (!this.temporaryPages.has(accountId)) {
        this.temporaryPages.set(accountId, []);
      }
      this.temporaryPages.get(accountId).push({ tabId, page });

      return { tabId, page };

    } catch (error) {
      logger.error(`Failed to create temporary page for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * ⭐ 新增：关闭临时页面
   */
  async closeTemporaryPage(accountId, tabId) {
    try {
      const accountTabs = this.tabStateManager.getAccountTabs(accountId);
      const tabInfo = accountTabs.get(tabId);

      if (!tabInfo) {
        logger.warn(`Temporary tab ${tabId} not found for account ${accountId}`);
        return;
      }

      if (tabInfo.state !== TabState.TEMPORARY) {
        logger.error(`Tab ${tabId} is not a temporary tab (state: ${tabInfo.state}), cannot close`);
        return;
      }

      // 关闭页面
      if (!tabInfo.page.isClosed()) {
        await tabInfo.page.close();
        logger.info(`🗑️  Closed temporary Tab ${tabId} for account ${accountId}`);
      }

      // 移除记录
      this.tabStateManager.removeTab(accountId, tabId);

      // 从 temporaryPages 中移除
      const temps = this.temporaryPages.get(accountId);
      if (temps) {
        const index = temps.findIndex(t => t.tabId === tabId);
        if (index !== -1) {
          temps.splice(index, 1);
        }
      }

    } catch (error) {
      logger.error(`Failed to close temporary page ${tabId} for account ${accountId}:`, error);
    }
  }

  /**
   * ⭐ 新增：等待临时 Tab 释放
   */
  async waitForTemporaryTabRelease(accountId, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const tabCount = this.tabStateManager.getTabCount(accountId);
      if (tabCount < 3) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    logger.warn(`Timeout waiting for temporary tab release for account ${accountId}`);
    return false;
  }
}

module.exports = BrowserManager;
```

### 方案 3：改进初始登录检测

**修改文件**：`packages/worker/src/handlers/initial-login-check.js`

```javascript
async check(account, platformInstance) {
  try {
    logger.info(`🔍 Starting initial login check for account ${account.id}...`);

    // ⭐ 1. 准备 Tab 1 用于登录检测
    const page = await this.browserManager.prepareTab1ForLoginCheck(account.id);

    // 2. 访问创作中心页面
    logger.info(`🌐 Navigating to creator center for ${account.id}...`);
    await page.goto('https://creator.douyin.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 3. 等待页面稳定
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      logger.warn('Timeout waiting for networkidle, continuing anyway');
    });
    await page.waitForTimeout(3000);

    // 4. 执行登录状态检测
    logger.info(`🔍 Checking login status for ${account.id}...`);
    const loginStatus = await platformInstance.checkLoginStatus(page);

    // 5. 根据检测结果，转换 Tab 1 状态
    if (loginStatus.isLoggedIn) {
      logger.info(`✅ Account ${account.id} is logged in`);

      // ⭐ Tab 1 转换为 Spider1
      await this.browserManager.convertTab1ToSpider1(account.id);

      this.accountStatusReporter.updateAccountStatus(account.id, {
        login_status: 'logged_in',
        worker_status: 'online'
      });

      return {
        isLoggedIn: true,
        userInfo: loginStatus.userInfo
      };

    } else {
      logger.info(`❌ Account ${account.id} is NOT logged in`);

      // ⭐ Tab 1 进入等待登录状态
      await this.browserManager.setTab1WaitingLogin(account.id);

      this.accountStatusReporter.updateAccountStatus(account.id, {
        login_status: 'not_logged_in',
        worker_status: 'offline'
      });

      return {
        isLoggedIn: false
      };
    }

  } catch (error) {
    logger.error(`Failed to check initial login status for ${account.id}:`, error);

    this.accountStatusReporter.updateAccountStatus(account.id, {
      login_status: 'not_logged_in',
      worker_status: 'offline'
    });

    return {
      isLoggedIn: false,
      error: error.message
    };
  }
}
```

### 方案 4：改进回复功能（使用临时 Tab）

**修改文件**：`packages/worker/src/platforms/douyin/send-reply-comment.js`

```javascript
async sendReply(commentId, replyText) {
  let tempTab = null;

  try {
    logger.info(`📝 Sending reply to comment ${commentId}...`);

    // ⭐ 1. 创建临时 Tab
    tempTab = await this.browserManager.createTemporaryPage(
      this.account.id,
      `Reply to comment ${commentId}`
    );

    const { tabId, page } = tempTab;

    // 2. 导航到评论页面
    await page.goto(`https://creator.douyin.com/comment/${commentId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 3. 执行回复操作
    await page.fill('textarea.reply-input', replyText);
    await page.click('button.submit-reply');

    // 4. 等待回复成功
    await page.waitForSelector('.reply-success', { timeout: 10000 });

    logger.info(`✅ Reply sent successfully to comment ${commentId}`);

    return { success: true };

  } catch (error) {
    logger.error(`Failed to send reply to comment ${commentId}:`, error);
    return { success: false, error: error.message };

  } finally {
    // ⭐ 5. 关闭临时 Tab（无论成功或失败）
    if (tempTab) {
      await this.browserManager.closeTemporaryPage(this.account.id, tempTab.tabId);
      logger.info(`🗑️  Released temporary tab after reply task`);
    }
  }
}
```

## Tab 管理流程图

```
┌─────────────────────────────────────────────────────────────┐
│  完整的 Tab 生命周期                                         │
└─────────────────────────────────────────────────────────────┘

浏览器启动
   ↓
创建 Tab 1 (INITIALIZATION)
   ↓
   ├─────────────────────────────────────┐
   │                                     │
   ↓                                     ↓
Worker 启动检测                    用户主动登录
   ↓                                     ↓
Tab 1 → LOGIN_CHECK              Tab 1 → QR_CODE_LOGIN
   ↓                                     ↓
检测登录状态                          显示二维码
   ↓                                     ↓
   ├─ 已登录 ✅                         扫码确认
   │  ↓                                  ↓
   │  Tab 1 → SPIDER1              登录成功
   │  (私信爬取)                          ↓
   │  ↓                              Tab 1 → SPIDER1
   │  长期运行                        (私信爬取)
   │                                     ↓
   │                                  长期运行
   │
   └─ 未登录 ❌
      ↓
      Tab 1 → WAITING_LOGIN
      (等待用户登录)
      ↓
      合并到上方"用户主动登录"流程

需要评论爬取
   ↓
创建 Tab 2 (SPIDER2)
   ↓
评论爬取
   ↓
长期运行

需要回复评论
   ↓
创建 Tab 3 (TEMPORARY)
   ↓
执行回复操作
   ↓
⭐ 立即关闭 Tab 3
   ↓
释放资源
```

## 优势总结

### 1. 资源优化 ✅
- 每个账户最多 2-3 个 Tab
- 临时任务完成后立即释放
- 避免 Tab 数量无限增长

### 2. 状态清晰 ✅
- 每个 Tab 有明确的状态
- 状态转换有严格的规则
- 易于调试和监控

### 3. 复用优先 ✅
- Tab 1 从登录检测转换为 Spider1
- 不需要额外创建新 Tab
- 减少浏览器开销

### 4. 智能管理 ✅
- Tab 数量限制
- 自动等待临时 Tab 释放
- 防止资源耗尽

---

**文档时间**：2025-10-24 19:30
**文档作者**：Claude Code
**文档版本**：1.0
