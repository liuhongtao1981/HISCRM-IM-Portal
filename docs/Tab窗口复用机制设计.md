# Tab 窗口复用机制设计

## 用户需求

> "我的tab，私信+会话 的蜘蛛，评论+讨论+视频的蜘蛛，登录，登录状态检测，发送回复或者评论，这几种，应该有一条复用机制"

## 任务分类

根据用户需求，将所有任务分为以下几类：

| 任务类别 | 包含任务 | 页面类型 | 复用策略 |
|---------|---------|---------|---------|
| **IM 类** | 私信爬取、会话爬取 | IM 页面 | 复用同一个 Tab |
| **内容类** | 评论爬取、讨论爬取、视频爬取 | 作品列表/详情页 | 复用同一个 Tab |
| **登录类** | 登录状态检测、二维码登录 | 创作中心首页 | 复用 Tab 1，完成后转换 |
| **操作类** | 发送回复、发送评论、发送私信 | 特定页面 | 临时创建，完成后关闭 |

## Tab 复用规则

### 规则 1：Tab 1 的生命周期（动态转换）

```
┌─────────────────────────────────────────────────┐
│  Tab 1 生命周期（登录 → IM）                     │
└─────────────────────────────────────────────────┘

浏览器启动
   ↓
Tab 1 创建（默认页面）
状态: INITIALIZATION
   ↓
Worker 启动检测
   ↓
Tab 1 用于登录状态检测
状态: LOGIN_CHECK
页面: creator.douyin.com
   ↓
   ├─ 未登录 ❌
   │  ↓
   │  Tab 1 等待登录
   │  状态: WAITING_LOGIN
   │  ↓
   │  用户点击登录
   │  ↓
   │  Tab 1 显示二维码
   │  状态: QR_CODE_LOGIN
   │  ↓
   │  登录成功
   │  ↓
   ├─ 已登录 ✅
   │
   └───→ Tab 1 转换为 IM 蜘蛛
        状态: SPIDER_IM
        页面: creator.douyin.com/im
        任务: 私信爬取、会话爬取
        ↓
        长期运行，不关闭
```

### 规则 2：Tab 2 的专用任务（内容类）

```
┌─────────────────────────────────────────────────┐
│  Tab 2 生命周期（内容类）                        │
└─────────────────────────────────────────────────┘

首次需要内容爬取
   ↓
Tab 2 创建
状态: SPIDER_CONTENT
页面: creator.douyin.com/creator-micro/home
任务: 评论爬取、讨论爬取、视频爬取
   ↓
⭐ 复用机制：
   - 评论爬取 → Tab 2 访问作品列表 → 点击作品 → 爬取评论
   - 讨论爬取 → Tab 2 访问作品列表 → 点击作品 → 爬取讨论
   - 视频爬取 → Tab 2 访问作品列表 → 提取视频信息
   ↓
长期运行，不关闭
```

### 规则 3：Tab 3+ 的临时任务（操作类）

```
┌─────────────────────────────────────────────────┐
│  Tab 3+ 生命周期（操作类）                       │
└─────────────────────────────────────────────────┘

需要执行操作（回复、评论、私信）
   ↓
Tab 3 创建（临时）
状态: TEMPORARY_ACTION
任务: 发送回复/评论/私信
   ↓
⭐ 复用机制：
   - 发送回复评论 → Tab 3 访问评论页面 → 提交回复 → 关闭
   - 发送评论 → Tab 3 访问作品页面 → 提交评论 → 关闭
   - 发送私信 → Tab 3 访问 IM 页面 → 发送消息 → 关闭
   ↓
任务完成
   ↓
⭐ 立即关闭 Tab 3，释放资源
```

## 详细设计

### 任务到 Tab 的映射

```javascript
// Tab 类型枚举
const TabType = {
  SPIDER_IM: 'spider_im',           // IM 蜘蛛 (Tab 1)
  SPIDER_CONTENT: 'spider_content', // 内容蜘蛛 (Tab 2)
  TEMPORARY_ACTION: 'temporary',    // 临时操作 (Tab 3+)
};

// 任务到 Tab 类型的映射
const TaskToTabMapping = {
  // IM 类 → Tab 1
  'crawl_direct_messages': TabType.SPIDER_IM,
  'crawl_conversations': TabType.SPIDER_IM,

  // 内容类 → Tab 2
  'crawl_comments': TabType.SPIDER_CONTENT,
  'crawl_discussions': TabType.SPIDER_CONTENT,
  'crawl_videos': TabType.SPIDER_CONTENT,

  // 操作类 → Tab 3+ (临时)
  'send_reply': TabType.TEMPORARY_ACTION,
  'send_comment': TabType.TEMPORARY_ACTION,
  'send_direct_message': TabType.TEMPORARY_ACTION,

  // 登录类 → Tab 1 (转换前)
  'login_check': 'tab1_login_check',
  'qr_code_login': 'tab1_qr_code_login',
};
```

### Tab 状态定义

```javascript
const TabState = {
  // Tab 1 的状态（登录相关 + IM 蜘蛛）
  INITIALIZATION: 'initialization',      // 初始化
  LOGIN_CHECK: 'login_check',           // 登录检测中
  WAITING_LOGIN: 'waiting_login',       // 等待登录
  QR_CODE_LOGIN: 'qr_code_login',       // 二维码登录中
  SPIDER_IM: 'spider_im',               // IM 蜘蛛（私信+会话）

  // Tab 2 的状态（内容蜘蛛）
  SPIDER_CONTENT: 'spider_content',     // 内容蜘蛛（评论+讨论+视频）

  // Tab 3+ 的状态（临时操作）
  TEMPORARY_ACTION: 'temporary_action', // 临时操作

  // 通用状态
  CLOSED: 'closed',                     // 已关闭
};
```

## 代码实现

### 改进 BrowserManager

```javascript
class BrowserManager {
  constructor(config = {}) {
    // ... 现有代码 ...

    // ⭐ Tab 管理
    this.tabStateManager = new TabStateManager();

    // ⭐ Tab 池：按类型管理
    this.tabPools = new Map(); // { accountId -> { im: page, content: page } }
  }

  /**
   * ⭐ 根据任务类型获取页面（核心复用逻辑）
   *
   * @param {string} accountId - 账户ID
   * @param {string} taskType - 任务类型
   * @returns {Page} 页面对象
   */
  async getPageForTask(accountId, taskType) {
    // 1. 确定 Tab 类型
    const tabType = this.getTabTypeForTask(taskType);

    // 2. 根据 Tab 类型获取或创建页面
    switch (tabType) {
      case TabType.SPIDER_IM:
        return await this.getIMSpiderPage(accountId);

      case TabType.SPIDER_CONTENT:
        return await this.getContentSpiderPage(accountId);

      case TabType.TEMPORARY_ACTION:
        return await this.createTemporaryActionPage(accountId, taskType);

      default:
        throw new Error(`Unknown tab type: ${tabType} for task: ${taskType}`);
    }
  }

  /**
   * ⭐ 获取 IM 蜘蛛页面（Tab 1）
   *
   * 复用规则：
   * - 私信爬取、会话爬取共用此页面
   * - 页面固定在 IM 页面 (creator.douyin.com/im)
   * - 长期运行，不关闭
   */
  async getIMSpiderPage(accountId) {
    let pool = this.tabPools.get(accountId);
    if (!pool) {
      pool = {};
      this.tabPools.set(accountId, pool);
    }

    // 检查是否已有 IM 蜘蛛页面
    if (pool.im && !pool.im.isClosed()) {
      logger.debug(`♻️  Reusing IM spider page (Tab 1) for account ${accountId}`);
      return pool.im;
    }

    // 获取 Tab 1
    const tab1 = this.tabStateManager.getTabByState(accountId, TabState.SPIDER_IM);
    if (!tab1) {
      throw new Error(`Tab 1 not in SPIDER_IM state for account ${accountId} - may not be logged in`);
    }

    pool.im = tab1.page;

    // ⭐ 确保页面在 IM 页面
    const currentUrl = pool.im.url();
    if (!currentUrl.includes('creator.douyin.com/im')) {
      logger.info(`📍 Navigating IM spider page to IM page for ${accountId}...`);
      await pool.im.goto('https://creator.douyin.com/im', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await pool.im.waitForTimeout(2000);
    }

    logger.info(`🕷️  IM spider page (Tab 1) ready for account ${accountId}`);
    return pool.im;
  }

  /**
   * ⭐ 获取内容蜘蛛页面（Tab 2）
   *
   * 复用规则：
   * - 评论爬取、讨论爬取、视频爬取共用此页面
   * - 页面在作品列表页面 (creator.douyin.com/creator-micro/home)
   * - 根据任务需要，导航到不同的作品页面
   * - 长期运行，不关闭
   */
  async getContentSpiderPage(accountId) {
    let pool = this.tabPools.get(accountId);
    if (!pool) {
      pool = {};
      this.tabPools.set(accountId, pool);
    }

    // 检查是否已有内容蜘蛛页面
    if (pool.content && !pool.content.isClosed()) {
      logger.debug(`♻️  Reusing content spider page (Tab 2) for account ${accountId}`);
      return pool.content;
    }

    // 检查 Tab 2 是否已创建
    let tab2 = this.tabStateManager.getTabByState(accountId, TabState.SPIDER_CONTENT);

    if (!tab2) {
      // 创建 Tab 2
      const context = this.contexts.get(accountId);
      if (!context) {
        throw new Error(`Context not found for account ${accountId}`);
      }

      const page = await context.newPage();

      // 注册 Tab 2
      this.tabStateManager.registerTab(
        accountId,
        'tab2',
        page,
        TabState.SPIDER_CONTENT,
        'Content spider (comments + discussions + videos)'
      );

      pool.content = page;

      logger.info(`🕷️  Created content spider page (Tab 2) for account ${accountId}`);
    } else {
      pool.content = tab2.page;
    }

    // ⭐ 确保页面在作品列表页
    const currentUrl = pool.content.url();
    if (!currentUrl.includes('creator.douyin.com/creator-micro/home')) {
      logger.info(`📍 Navigating content spider page to home for ${accountId}...`);
      await pool.content.goto('https://creator.douyin.com/creator-micro/home', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await pool.content.waitForTimeout(2000);
    }

    logger.info(`🕷️  Content spider page (Tab 2) ready for account ${accountId}`);
    return pool.content;
  }

  /**
   * ⭐ 创建临时操作页面（Tab 3+）
   *
   * 复用规则：
   * - 临时创建，任务完成后立即关闭
   * - 每个操作独立使用一个 Tab
   * - 释放资源，避免 Tab 数量无限增长
   */
  async createTemporaryActionPage(accountId, taskType) {
    try {
      // 检查 Tab 数量限制
      const tabCount = this.tabStateManager.getTabCount(accountId);
      if (tabCount >= 3) {
        logger.warn(`Account ${accountId} already has ${tabCount} tabs, waiting for cleanup...`);
        await this.waitForTabRelease(accountId, 10000);
      }

      const context = this.contexts.get(accountId);
      if (!context) {
        throw new Error(`Context not found for account ${accountId}`);
      }

      const page = await context.newPage();
      const tabId = `temp-${Date.now()}`;

      // 注册临时 Tab
      this.tabStateManager.registerTab(
        accountId,
        tabId,
        page,
        TabState.TEMPORARY_ACTION,
        `Temporary: ${taskType}`
      );

      logger.info(`✨ Created temporary action page (${tabId}) for ${accountId}: ${taskType}`);

      return { tabId, page };

    } catch (error) {
      logger.error(`Failed to create temporary action page for ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * ⭐ 关闭临时操作页面
   *
   * @param {string} accountId - 账户ID
   * @param {string} tabId - Tab ID
   */
  async closeTemporaryActionPage(accountId, tabId) {
    try {
      const tab = this.tabStateManager.getTab(accountId, tabId);
      if (!tab) {
        logger.warn(`Tab ${tabId} not found for account ${accountId}`);
        return;
      }

      if (tab.state !== TabState.TEMPORARY_ACTION) {
        logger.error(`Tab ${tabId} is not a temporary action tab (state: ${tab.state})`);
        return;
      }

      // 关闭页面
      if (!tab.page.isClosed()) {
        await tab.page.close();
        logger.info(`🗑️  Closed temporary action page (${tabId}) for ${accountId}`);
      }

      // 移除记录
      this.tabStateManager.removeTab(accountId, tabId);

    } catch (error) {
      logger.error(`Failed to close temporary action page ${tabId} for ${accountId}:`, error);
    }
  }

  /**
   * ⭐ Tab 1 从登录检测转换为 IM 蜘蛛
   */
  async convertTab1ToIMSpider(accountId) {
    const tab = this.tabStateManager.getTabByState(accountId, TabState.LOGIN_CHECK);
    if (!tab) {
      logger.warn(`Tab 1 not in LOGIN_CHECK state for account ${accountId}`);
      return null;
    }

    // 转换状态
    this.tabStateManager.transitionTab(
      accountId,
      'tab1',
      TabState.SPIDER_IM,
      'IM spider (direct messages + conversations)'
    );

    // 导航到 IM 页面
    await tab.page.goto('https://creator.douyin.com/im', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await tab.page.waitForTimeout(2000);

    logger.info(`✅ Tab 1 converted to IM spider for account ${accountId}`);

    // 保存到 Tab 池
    let pool = this.tabPools.get(accountId);
    if (!pool) {
      pool = {};
      this.tabPools.set(accountId, pool);
    }
    pool.im = tab.page;

    return tab.page;
  }

  /**
   * 根据任务类型确定 Tab 类型
   */
  getTabTypeForTask(taskType) {
    const mapping = {
      // IM 类
      'crawl_direct_messages': TabType.SPIDER_IM,
      'crawl_conversations': TabType.SPIDER_IM,

      // 内容类
      'crawl_comments': TabType.SPIDER_CONTENT,
      'crawl_discussions': TabType.SPIDER_CONTENT,
      'crawl_videos': TabType.SPIDER_CONTENT,

      // 操作类
      'send_reply': TabType.TEMPORARY_ACTION,
      'send_comment': TabType.TEMPORARY_ACTION,
      'send_direct_message': TabType.TEMPORARY_ACTION,
    };

    return mapping[taskType] || TabType.TEMPORARY_ACTION;
  }

  /**
   * 等待 Tab 释放
   */
  async waitForTabRelease(accountId, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const tabCount = this.tabStateManager.getTabCount(accountId);
      if (tabCount < 3) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    logger.warn(`Timeout waiting for tab release for account ${accountId}`);
    return false;
  }
}

// Tab 类型枚举
const TabType = {
  SPIDER_IM: 'spider_im',
  SPIDER_CONTENT: 'spider_content',
  TEMPORARY_ACTION: 'temporary',
};

module.exports = BrowserManager;
```

## 使用示例

### 私信爬取（使用 IM 蜘蛛，Tab 1）

```javascript
// packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js

async crawl() {
  try {
    // ⭐ 获取 IM 蜘蛛页面（Tab 1）
    const page = await this.browserManager.getPageForTask(this.account.id, 'crawl_direct_messages');

    // 页面已经在 IM 页面上了，直接爬取
    const messages = await this.extractMessages(page);

    return messages;
  } catch (error) {
    logger.error('Failed to crawl direct messages:', error);
    throw error;
  }
}
```

### 会话爬取（复用 IM 蜘蛛，Tab 1）

```javascript
// packages/worker/src/platforms/douyin/crawl-conversations.js

async crawl() {
  try {
    // ⭐ 复用同一个 IM 蜘蛛页面（Tab 1）
    const page = await this.browserManager.getPageForTask(this.account.id, 'crawl_conversations');

    // 页面已经在 IM 页面上，直接爬取会话列表
    const conversations = await this.extractConversations(page);

    return conversations;
  } catch (error) {
    logger.error('Failed to crawl conversations:', error);
    throw error;
  }
}
```

### 评论爬取（使用内容蜘蛛，Tab 2）

```javascript
// packages/worker/src/platforms/douyin/crawl-comments.js

async crawl() {
  try {
    // ⭐ 获取内容蜘蛛页面（Tab 2）
    const page = await this.browserManager.getPageForTask(this.account.id, 'crawl_comments');

    // 页面在作品列表页，点击进入作品详情
    await page.click('.work-item:first-child');
    await page.waitForTimeout(2000);

    // 爬取评论
    const comments = await this.extractComments(page);

    return comments;
  } catch (error) {
    logger.error('Failed to crawl comments:', error);
    throw error;
  }
}
```

### 讨论爬取（复用内容蜘蛛，Tab 2）

```javascript
// packages/worker/src/platforms/douyin/crawl-discussions.js

async crawl() {
  try {
    // ⭐ 复用同一个内容蜘蛛页面（Tab 2）
    const page = await this.browserManager.getPageForTask(this.account.id, 'crawl_discussions');

    // 页面在作品列表页，点击进入作品详情
    await page.click('.work-item:nth-child(2)');
    await page.waitForTimeout(2000);

    // 爬取讨论
    const discussions = await this.extractDiscussions(page);

    return discussions;
  } catch (error) {
    logger.error('Failed to crawl discussions:', error);
    throw error;
  }
}
```

### 发送回复（临时 Tab 3，完成后关闭）

```javascript
// packages/worker/src/platforms/douyin/send-reply.js

async sendReply(commentId, replyText) {
  let tempTab = null;

  try {
    // ⭐ 创建临时操作页面（Tab 3）
    tempTab = await this.browserManager.getPageForTask(this.account.id, 'send_reply');

    const { tabId, page } = tempTab;

    // 导航到评论页面
    await page.goto(`https://creator.douyin.com/comment/${commentId}`);

    // 发送回复
    await page.fill('textarea', replyText);
    await page.click('button[type="submit"]');

    logger.info(`✅ Reply sent successfully`);

    return { success: true };

  } catch (error) {
    logger.error('Failed to send reply:', error);
    return { success: false, error: error.message };

  } finally {
    // ⭐ 关闭临时 Tab（无论成功或失败）
    if (tempTab && tempTab.tabId) {
      await this.browserManager.closeTemporaryActionPage(this.account.id, tempTab.tabId);
      logger.info(`🗑️  Temporary tab closed after reply task`);
    }
  }
}
```

## 优势总结

### 1. 资源最优 ✅
- 每个账户固定 2 个长期 Tab（IM + 内容）
- 临时操作完成后立即释放
- 避免 Tab 数量无限增长

### 2. 复用高效 ✅
- 私信 + 会话 共用 Tab 1
- 评论 + 讨论 + 视频 共用 Tab 2
- 减少页面创建和销毁的开销

### 3. 职责清晰 ✅
- Tab 1: IM 类任务
- Tab 2: 内容类任务
- Tab 3+: 临时操作

### 4. 代码简洁 ✅
```javascript
// 统一接口，自动复用
const page = await browserManager.getPageForTask(accountId, taskType);
```

---

**文档时间**：2025-10-24 19:35
**文档作者**：Claude Code
**文档版本**：1.0
