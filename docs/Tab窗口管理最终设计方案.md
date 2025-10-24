# Tab 窗口管理最终设计方案

## 用户需求明确

### URL 纠正
- ❌ 私信页面：~~https://creator.douyin.com/im~~
- ✅ 私信页面：https://creator.douyin.com/creator-micro/data/following/chat
- ✅ 评论页面：https://creator.douyin.com/creator-micro/interactive/comment

### 任务自动包含关系
- **私信蜘蛛任务**：自动抓取私信 + 会话（在同一个任务中完成）
- **评论蜘蛛任务**：自动抓取评论 + 视频 + 讨论（在同一个任务中完成）

### Tab 管理需求

#### 1. 蜘蛛任务
- ✅ 独立窗口
- ✅ 长期运行
- ✅ 自己的任务用自己的窗口

#### 2. 登录任务
- ✅ 显示二维码
- ✅ 登录成功后关闭窗口

#### 3. 登录检测
- ✅ 如果有登录任务窗口 → 用登录窗口检测
- ✅ 如果没有登录任务窗口 → 启动新窗口检测
- ✅ 检测完成后，如果不是登录任务的窗口 → 关闭

#### 4. 私信/评论回复
- ✅ 启动新窗口
- ✅ 运行结束后关闭

#### 5. 保留最后一个窗口
- ⚠️ 关闭窗口时，需要保留至少一个
- ⚠️ 防止所有窗口关闭导致浏览器进程退出
- ✅ 蜘蛛任务的 2 个长期窗口会一直开着
- ⚠️ 未登录时没有蜘蛛窗口，需要保留一个占位窗口

## 核心设计

### getPageForTask() 接口设计

```javascript
/**
 * 根据任务获取页面
 *
 * @param {string} accountId - 账户ID
 * @param {Object} options - 选项
 * @param {string} options.tag - 窗口标记 ('spider_dm', 'spider_comment', 'login', 'reply_dm', 'reply_comment')
 * @param {boolean} options.persistent - 是否持久窗口（false = 用完后关闭）
 * @param {boolean} options.shareable - 是否可以公用
 * @param {boolean} options.forceNew - 是否强制启用新窗口
 * @returns {Object} { tabId, page, shouldClose }
 */
async getPageForTask(accountId, options = {}) {
  const {
    tag,              // 窗口标记
    persistent = false, // 是否持久
    shareable = false,  // 是否可公用
    forceNew = false,   // 强制新窗口
  } = options;

  // 实现逻辑...
}
```

### Tag 标记定义

```javascript
const TabTag = {
  // 蜘蛛任务（持久窗口）
  SPIDER_DM: 'spider_dm',           // 私信蜘蛛（私信 + 会话）
  SPIDER_COMMENT: 'spider_comment', // 评论蜘蛛（评论 + 视频 + 讨论）

  // 登录任务（非持久，登录成功后关闭）
  LOGIN: 'login',

  // 登录检测（可能持久，可能非持久）
  LOGIN_CHECK: 'login_check',

  // 回复任务（非持久，完成后关闭）
  REPLY_DM: 'reply_dm',             // 私信回复
  REPLY_COMMENT: 'reply_comment',   // 评论回复

  // 占位窗口（保证浏览器不退出）
  PLACEHOLDER: 'placeholder',
};
```

## 详细规则

### 规则 1：蜘蛛任务窗口

```javascript
// 私信蜘蛛任务
const { page } = await getPageForTask(accountId, {
  tag: TabTag.SPIDER_DM,
  persistent: true,    // ✅ 持久窗口
  shareable: false,    // ✅ 不可公用（独立窗口）
  forceNew: false,     // 如果已存在，复用
});

// 评论蜘蛛任务
const { page } = await getPageForTask(accountId, {
  tag: TabTag.SPIDER_COMMENT,
  persistent: true,
  shareable: false,
  forceNew: false,
});
```

**特点**：
- ✅ 独立窗口，互不干扰
- ✅ 长期运行，不关闭
- ✅ 每个任务固定使用自己的窗口

### 规则 2：登录任务窗口

```javascript
// 用户点击登录，显示二维码
const { page, tabId } = await getPageForTask(accountId, {
  tag: TabTag.LOGIN,
  persistent: false,   // ❌ 非持久窗口
  shareable: false,    // 不可公用
  forceNew: true,      // ✅ 强制创建新窗口
});

// 显示二维码
await page.goto('https://www.douyin.com/passport/web/login');

// 监听登录成功
await waitForLoginSuccess();

// ⭐ 登录成功后，关闭窗口
await closeTab(accountId, tabId);
```

**特点**：
- ✅ 强制创建新窗口
- ✅ 登录成功后立即关闭
- ⚠️ 关闭前检查是否是最后一个窗口

### 规则 3：登录检测窗口

```javascript
// 场景 1：有登录任务窗口（用户正在登录中）
const loginTab = findTabByTag(accountId, TabTag.LOGIN);
if (loginTab) {
  // ✅ 复用登录窗口进行检测
  const { page } = await getPageForTask(accountId, {
    tag: TabTag.LOGIN,        // 使用登录窗口
    shareable: true,           // ✅ 可以公用登录窗口
    forceNew: false,
  });

  // 检测登录状态
  const isLoggedIn = await checkLoginStatus(page);

  // ⚠️ 不关闭窗口（因为是登录任务的窗口）
}

// 场景 2：没有登录任务窗口（自动检测）
else {
  const { page, tabId, shouldClose } = await getPageForTask(accountId, {
    tag: TabTag.LOGIN_CHECK,
    persistent: false,         // ❌ 非持久
    shareable: false,
    forceNew: true,            // ✅ 启动新窗口
  });

  // 检测登录状态
  const isLoggedIn = await checkLoginStatus(page);

  // ⭐ 检测完成后关闭窗口
  if (shouldClose) {
    await closeTab(accountId, tabId);
  }
}
```

**特点**：
- ✅ 优先复用登录窗口
- ✅ 没有登录窗口时，创建新的检测窗口
- ✅ 检测完成后，非登录窗口需要关闭

### 规则 4：回复任务窗口

```javascript
// 私信回复
const { page, tabId } = await getPageForTask(accountId, {
  tag: TabTag.REPLY_DM,
  persistent: false,   // ❌ 非持久
  shareable: false,
  forceNew: true,      // ✅ 启动新窗口
});

try {
  // 发送私信回复
  await sendReply(page, messageId, replyText);
} finally {
  // ⭐ 运行结束后关闭
  await closeTab(accountId, tabId);
}

// 评论回复
const { page, tabId } = await getPageForTask(accountId, {
  tag: TabTag.REPLY_COMMENT,
  persistent: false,
  shareable: false,
  forceNew: true,
});

try {
  await sendCommentReply(page, commentId, replyText);
} finally {
  await closeTab(accountId, tabId);
}
```

**特点**：
- ✅ 每次创建新窗口
- ✅ 完成后立即关闭
- ⚠️ 关闭前检查是否是最后一个窗口

### 规则 5：保留最后一个窗口

```javascript
/**
 * 关闭窗口（安全关闭）
 *
 * @param {string} accountId - 账户ID
 * @param {string} tabId - Tab ID
 */
async closeTab(accountId, tabId) {
  const allTabs = getAccountTabs(accountId);

  // ⚠️ 如果只剩一个窗口，不能关闭
  if (allTabs.size <= 1) {
    logger.warn(`Cannot close last tab ${tabId} for account ${accountId} - would exit browser`);

    // ⭐ 将此窗口转换为占位窗口
    transitionTab(accountId, tabId, TabTag.PLACEHOLDER);
    logger.info(`Tab ${tabId} converted to placeholder to keep browser alive`);

    return false;
  }

  // 安全关闭
  const tab = allTabs.get(tabId);
  if (tab && !tab.page.isClosed()) {
    await tab.page.close();
    logger.info(`🗑️  Closed tab ${tabId} for account ${accountId}`);
  }

  removeTab(accountId, tabId);
  return true;
}
```

**特点**：
- ⚠️ 关闭前检查窗口数量
- ✅ 最后一个窗口转换为占位窗口
- ✅ 防止浏览器进程意外退出

## 完整实现

### 新增文件：`packages/worker/src/browser/tab-manager.js`

```javascript
/**
 * Tab 窗口管理器
 *
 * 核心功能：
 * 1. 根据任务类型获取/创建页面
 * 2. 管理持久/非持久窗口
 * 3. 防止浏览器进程退出（保留最后一个窗口）
 * 4. 复用/独立窗口管理
 */

const logger = require('../utils/logger')('TabManager');

// Tab 标记枚举
const TabTag = {
  SPIDER_DM: 'spider_dm',           // 私信蜘蛛
  SPIDER_COMMENT: 'spider_comment', // 评论蜘蛛
  LOGIN: 'login',                   // 登录任务
  LOGIN_CHECK: 'login_check',       // 登录检测
  REPLY_DM: 'reply_dm',             // 私信回复
  REPLY_COMMENT: 'reply_comment',   // 评论回复
  PLACEHOLDER: 'placeholder',       // 占位窗口
};

class TabManager {
  constructor(browserManager) {
    this.browserManager = browserManager;

    // { accountId -> Map<tabId, tabInfo> }
    this.tabs = new Map();

    // 自增 Tab ID
    this.tabIdCounter = 0;
  }

  /**
   * ⭐ 根据任务获取页面（核心接口）
   *
   * @param {string} accountId - 账户ID
   * @param {Object} options - 选项
   * @param {string} options.tag - 窗口标记
   * @param {boolean} options.persistent - 是否持久窗口
   * @param {boolean} options.shareable - 是否可以公用
   * @param {boolean} options.forceNew - 是否强制新窗口
   * @returns {Object} { tabId, page, shouldClose }
   */
  async getPageForTask(accountId, options = {}) {
    const {
      tag,
      persistent = false,
      shareable = false,
      forceNew = false,
    } = options;

    logger.info(`📄 getPageForTask: account=${accountId}, tag=${tag}, persistent=${persistent}, shareable=${shareable}, forceNew=${forceNew}`);

    // 1. 如果可以公用，尝试查找已有的可公用窗口
    if (shareable && !forceNew) {
      const existingTab = this.findTabByTag(accountId, tag);
      if (existingTab) {
        logger.info(`♻️  Reusing existing tab ${existingTab.tabId} for ${tag}`);
        return {
          tabId: existingTab.tabId,
          page: existingTab.page,
          shouldClose: false, // 公用的不关闭
        };
      }
    }

    // 2. 如果不强制新建，尝试查找已有的同 tag 窗口
    if (!forceNew) {
      const existingTab = this.findTabByTag(accountId, tag);
      if (existingTab) {
        logger.info(`♻️  Reusing existing tab ${existingTab.tabId} for ${tag}`);
        return {
          tabId: existingTab.tabId,
          page: existingTab.page,
          shouldClose: !persistent, // 非持久的需要关闭
        };
      }
    }

    // 3. 创建新窗口
    const { tabId, page } = await this.createTab(accountId, tag, persistent);

    logger.info(`✨ Created new tab ${tabId} for ${tag}`);

    return {
      tabId,
      page,
      shouldClose: !persistent, // 非持久的需要关闭
    };
  }

  /**
   * 创建新 Tab
   *
   * @param {string} accountId - 账户ID
   * @param {string} tag - Tab 标记
   * @param {boolean} persistent - 是否持久
   * @returns {Object} { tabId, page }
   */
  async createTab(accountId, tag, persistent) {
    const context = this.browserManager.contexts.get(accountId);
    if (!context) {
      throw new Error(`Context not found for account ${accountId}`);
    }

    // 创建页面
    const page = await context.newPage();
    const tabId = `tab-${++this.tabIdCounter}`;

    // 注册 Tab
    if (!this.tabs.has(accountId)) {
      this.tabs.set(accountId, new Map());
    }

    this.tabs.get(accountId).set(tabId, {
      tabId,
      page,
      tag,
      persistent,
      createdAt: Date.now(),
    });

    logger.info(`✅ Registered tab ${tabId}: tag=${tag}, persistent=${persistent}`);

    return { tabId, page };
  }

  /**
   * 查找指定 tag 的 Tab
   *
   * @param {string} accountId - 账户ID
   * @param {string} tag - Tab 标记
   * @returns {Object|null} Tab 信息
   */
  findTabByTag(accountId, tag) {
    const accountTabs = this.tabs.get(accountId);
    if (!accountTabs) return null;

    for (const [tabId, tabInfo] of accountTabs.entries()) {
      if (tabInfo.tag === tag) {
        return tabInfo;
      }
    }

    return null;
  }

  /**
   * ⭐ 安全关闭 Tab（保留最后一个窗口）
   *
   * @param {string} accountId - 账户ID
   * @param {string} tabId - Tab ID
   * @returns {boolean} 是否成功关闭
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
      logger.warn(`Cannot close last tab ${tabId} for account ${accountId} - would exit browser`);

      // ⭐ 将此窗口转换为占位窗口
      tab.tag = TabTag.PLACEHOLDER;
      tab.persistent = true; // 占位窗口是持久的

      logger.info(`🔄 Tab ${tabId} converted to PLACEHOLDER to keep browser alive`);
      return false;
    }

    // 安全关闭
    try {
      if (!tab.page.isClosed()) {
        await tab.page.close();
        logger.info(`🗑️  Closed tab ${tabId} (tag=${tab.tag}) for account ${accountId}`);
      }

      accountTabs.delete(tabId);
      return true;

    } catch (error) {
      logger.error(`Failed to close tab ${tabId}:`, error);
      return false;
    }
  }

  /**
   * 获取账户的所有 Tab
   *
   * @param {string} accountId - 账户ID
   * @returns {Map} Tab Map
   */
  getAccountTabs(accountId) {
    return this.tabs.get(accountId) || new Map();
  }

  /**
   * 获取 Tab 统计信息
   *
   * @param {string} accountId - 账户ID
   * @returns {Object} 统计信息
   */
  getTabStats(accountId) {
    const accountTabs = this.getAccountTabs(accountId);
    const stats = {
      total: accountTabs.size,
      persistent: 0,
      temporary: 0,
      byTag: {},
    };

    for (const [tabId, tabInfo] of accountTabs.entries()) {
      if (tabInfo.persistent) {
        stats.persistent++;
      } else {
        stats.temporary++;
      }

      stats.byTag[tabInfo.tag] = (stats.byTag[tabInfo.tag] || 0) + 1;
    }

    return stats;
  }

  /**
   * 打印 Tab 列表（调试用）
   *
   * @param {string} accountId - 账户ID
   */
  printTabs(accountId) {
    const accountTabs = this.getAccountTabs(accountId);
    logger.info(`📊 Account ${accountId} has ${accountTabs.size} tabs:`);

    for (const [tabId, tabInfo] of accountTabs.entries()) {
      const age = Math.floor((Date.now() - tabInfo.createdAt) / 1000);
      const status = tabInfo.persistent ? '🔒 PERSISTENT' : '⏱️  TEMPORARY';
      logger.info(`   ${status} ${tabId}: tag=${tabInfo.tag}, age=${age}s`);
    }
  }

  /**
   * 清理账户的所有 Tab
   *
   * @param {string} accountId - 账户ID
   */
  async clearAccountTabs(accountId) {
    const accountTabs = this.getAccountTabs(accountId);

    for (const [tabId, tabInfo] of accountTabs.entries()) {
      try {
        if (!tabInfo.page.isClosed()) {
          await tabInfo.page.close();
        }
      } catch (error) {
        logger.error(`Failed to close tab ${tabId}:`, error);
      }
    }

    this.tabs.delete(accountId);
    logger.info(`🗑️  Cleared all tabs for account ${accountId}`);
  }
}

module.exports = { TabManager, TabTag };
```

## 使用示例

### 示例 1：私信蜘蛛任务

```javascript
// packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js

async crawl() {
  const { page } = await this.tabManager.getPageForTask(this.account.id, {
    tag: TabTag.SPIDER_DM,
    persistent: true,    // ✅ 持久窗口
    shareable: false,    // 独立窗口
    forceNew: false,
  });

  // 导航到私信页面
  await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  // 爬取私信数据
  const messages = await this.extractMessages(page);

  // ⭐ 持久窗口，不关闭
  return messages;
}
```

### 示例 2：评论蜘蛛任务

```javascript
// packages/worker/src/platforms/douyin/crawl-comments.js

async crawl() {
  const { page } = await this.tabManager.getPageForTask(this.account.id, {
    tag: TabTag.SPIDER_COMMENT,
    persistent: true,    // ✅ 持久窗口
    shareable: false,
    forceNew: false,
  });

  // 导航到评论页面
  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  // 爬取评论、视频、讨论数据
  const comments = await this.extractComments(page);
  const videos = await this.extractVideos(page);
  const discussions = await this.extractDiscussions(page);

  // ⭐ 持久窗口，不关闭
  return { comments, videos, discussions };
}
```

### 示例 3：登录任务

```javascript
// packages/worker/src/platforms/douyin/platform.js

async startLogin(accountId) {
  const { page, tabId } = await this.tabManager.getPageForTask(accountId, {
    tag: TabTag.LOGIN,
    persistent: false,   // ❌ 非持久
    shareable: false,
    forceNew: true,      // ✅ 强制新窗口
  });

  try {
    // 显示二维码
    await page.goto('https://www.douyin.com/passport/web/login');

    // 等待登录成功
    await this.waitForLoginSuccess(page);

    logger.info('✅ Login successful');

  } finally {
    // ⭐ 登录成功后，关闭窗口
    await this.tabManager.closeTab(accountId, tabId);
  }
}
```

### 示例 4：登录检测

```javascript
// packages/worker/src/handlers/initial-login-check.js

async check(account) {
  // 场景 1：有登录任务窗口
  const loginTab = this.tabManager.findTabByTag(account.id, TabTag.LOGIN);

  let page, tabId, shouldClose;

  if (loginTab) {
    // ✅ 复用登录窗口
    ({ page, tabId, shouldClose } = await this.tabManager.getPageForTask(account.id, {
      tag: TabTag.LOGIN,
      shareable: true,   // ✅ 可以公用登录窗口
      forceNew: false,
    }));
  } else {
    // ✅ 启动新窗口检测
    ({ page, tabId, shouldClose } = await this.tabManager.getPageForTask(account.id, {
      tag: TabTag.LOGIN_CHECK,
      persistent: false,
      shareable: false,
      forceNew: true,
    }));
  }

  try {
    // 导航到创作中心
    await page.goto('https://creator.douyin.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 检测登录状态
    const loginStatus = await this.platformInstance.checkLoginStatus(page);

    return loginStatus;

  } finally {
    // ⭐ 如果应该关闭（非登录窗口），则关闭
    if (shouldClose) {
      await this.tabManager.closeTab(account.id, tabId);
    }
  }
}
```

### 示例 5：回复任务

```javascript
// packages/worker/src/platforms/douyin/send-reply-comment.js

async sendReply(commentId, replyText) {
  const { page, tabId } = await this.tabManager.getPageForTask(this.account.id, {
    tag: TabTag.REPLY_COMMENT,
    persistent: false,   // ❌ 非持久
    shareable: false,
    forceNew: true,      // ✅ 启动新窗口
  });

  try {
    // 发送回复
    await page.goto(`https://creator.douyin.com/comment/${commentId}`);
    await page.fill('textarea', replyText);
    await page.click('button[type="submit"]');

    logger.info('✅ Reply sent successfully');
    return { success: true };

  } catch (error) {
    logger.error('Failed to send reply:', error);
    return { success: false, error: error.message };

  } finally {
    // ⭐ 运行结束后关闭
    await this.tabManager.closeTab(this.account.id, tabId);
  }
}
```

## Tab 生命周期图

```
浏览器启动
   ↓
创建默认 Tab（占位）
   ↓
┌─────────────────────────────────────────────┐
│  私信蜘蛛启动                                │
│  创建 Tab (SPIDER_DM, persistent=true)     │
│  → 长期运行，不关闭                          │
└─────────────────────────────────────────────┘
   ↓
┌─────────────────────────────────────────────┐
│  评论蜘蛛启动                                │
│  创建 Tab (SPIDER_COMMENT, persistent=true)│
│  → 长期运行，不关闭                          │
└─────────────────────────────────────────────┘
   ↓
关闭占位 Tab（因为有 2 个持久窗口）
   ↓
正常运行中...
   ↓
┌─────────────────────────────────────────────┐
│  需要回复评论                                │
│  创建 Tab (REPLY_COMMENT, persistent=false)│
│  → 执行回复                                  │
│  → 完成后关闭 Tab                            │
└─────────────────────────────────────────────┘
   ↓
┌─────────────────────────────────────────────┐
│  用户点击登录                                │
│  创建 Tab (LOGIN, persistent=false)        │
│  → 显示二维码                                │
│  → 登录成功                                  │
│  → 关闭 Tab                                  │
└─────────────────────────────────────────────┘
   ↓
继续正常运行...
```

## 优势总结

### 1. 灵活性 ✅
- 通过参数控制 Tab 行为
- 支持持久/非持久窗口
- 支持公用/独立窗口
- 支持强制新建/复用

### 2. 安全性 ✅
- 自动保留最后一个窗口
- 防止浏览器进程意外退出
- 占位窗口机制

### 3. 资源优化 ✅
- 蜘蛛任务：2 个持久窗口
- 临时任务：用完即关闭
- 最小化内存占用

### 4. 代码简洁 ✅
```javascript
const { page, tabId, shouldClose } = await tabManager.getPageForTask(accountId, options);
// 使用 page...
if (shouldClose) await tabManager.closeTab(accountId, tabId);
```

---

**文档时间**：2025-10-24 19:45
**文档作者**：Claude Code
**文档版本**：1.0
