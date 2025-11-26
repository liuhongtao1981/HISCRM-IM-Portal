/**
 * Tab 窗口管理器
 *
 * 核心功能：
 * 1. 根据任务类型获取/创建页面
 * 2. 管理持久/非持久窗口
 * 3. 防止浏览器进程退出（保留最后一个窗口）
 * 4. 复用/独立窗口管理
 *
 * 设计原则：
 * - 蜘蛛任务：独立窗口，长期运行
 * - 登录任务：登录成功后关闭
 * - 登录检测：优先复用登录窗口，否则新建检测窗口
 * - 回复任务：新建窗口，完成后关闭
 * - 保留最后一个窗口：防止浏览器进程退出
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('TabManager');

// Tab 标记枚举
const TabTag = {
  SPIDER_DM: 'spider_dm',           // 私信蜘蛛（私信 + 会话）
  SPIDER_COMMENT: 'spider_comment', // 评论蜘蛛（评论 + 视频 + 讨论）
  LOGIN: 'login',                   // 登录任务
  LOGIN_CHECK: 'login_check',       // 登录检测
  REPLY_DM: 'reply_dm',             // 私信回复
  REPLY_COMMENT: 'reply_comment',   // 评论回复
  REALTIME_MONITOR: 'realtime_monitor', // 实时监控常驻任务
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
   * @param {string} options.tag - 窗口标记 (TabTag.*)
   * @param {boolean} options.persistent - 是否持久窗口（false = 用完后关闭）
   * @param {boolean} options.shareable - 是否可以公用
   * @param {boolean} options.forceNew - 是否强制启用新窗口
   * @param {boolean} options.createIfNotExists - 如果不存在是否创建（默认 true）
   * @returns {Promise<Object|null>} { tabId, page, shouldClose } 或 null（如果不存在且 createIfNotExists=false）
   */
  async getPageForTask(accountId, options = {}) {
    const {
      tag,
      persistent = false,
      shareable = false,
      forceNew = false,
      createIfNotExists = true,  // 默认自动创建
    } = options;

    if (!tag) {
      throw new Error('Tag is required for getPageForTask');
    }

    logger.info(`📄 getPageForTask: account=${accountId}, tag=${tag}, persistent=${persistent}, shareable=${shareable}, forceNew=${forceNew}`);

    // 1. 如果可以公用，尝试查找已有的可公用窗口
    if (shareable && !forceNew) {
      const existingTab = this.findTabByTag(accountId, tag);
      if (existingTab) {
        logger.info(`♻️  Reusing shareable tab ${existingTab.tabId} for ${tag}`);
        return {
          tabId: existingTab.tabId,
          page: existingTab.page,
          shouldClose: false, // 公用的不关闭
          release: async () => {
            await this.releaseTab(accountId, existingTab.tabId);
          }
        };
      }
    }

    // 2. 如果不强制新建，尝试查找已有的同 tag 窗口
    if (!forceNew) {
      const existingTab = this.findTabByTag(accountId, tag);
      if (existingTab) {
        // ⚠️ 验证 page 是否仍然有效（防止浏览器断开连接）
        try {
          if (existingTab.page.isClosed()) {
            logger.warn(`⚠️  Tab ${existingTab.tabId} page is closed, removing from registry`);
            // 从注册表中移除已关闭的 tab
            const accountTabs = this.tabs.get(accountId);
            if (accountTabs) {
              accountTabs.delete(existingTab.tabId);
            }
            // 继续创建新 tab
          } else {
            logger.info(`♻️  Reusing existing tab ${existingTab.tabId} for ${tag}`);
            return {
              tabId: existingTab.tabId,
              page: existingTab.page,
              shouldClose: !persistent, // 非持久的需要关闭
              release: async () => {
                await this.releaseTab(accountId, existingTab.tabId);
              }
            };
          }
        } catch (error) {
          // page.isClosed() 可能抛出错误（比如浏览器已完全断开）
          logger.warn(`⚠️  Tab ${existingTab.tabId} page is inaccessible: ${error.message}, removing from registry`);
          // 从注册表中移除无效的 tab
          const accountTabs = this.tabs.get(accountId);
          if (accountTabs) {
            accountTabs.delete(existingTab.tabId);
          }
          // 继续创建新 tab
        }
      }
    }

    // 3. 如果不允许创建，返回 null
    if (!createIfNotExists) {
      logger.debug(`🚫 Tab ${tag} not found for account ${accountId}, createIfNotExists=false`);
      return null;
    }

    // 4. 创建新窗口
    const { tabId, page } = await this.createTab(accountId, tag, persistent);

    logger.info(`✨ Created new tab ${tabId} for ${tag}, persistent=${persistent}`);

    return {
      tabId,
      page,
      shouldClose: !persistent, // 非持久的需要关闭 (已废弃,使用 release 代替)
      release: async () => {
        await this.releaseTab(accountId, tabId);
      }
    };
  }

  /**
   * 创建新 Tab
   *
   * @param {string} accountId - 账户ID
   * @param {string} tag - Tab 标记
   * @param {boolean} persistent - 是否持久
   * @returns {Promise<Object>} { tabId, page }
   */
  async createTab(accountId, tag, persistent) {
    // ⭐ 获取或创建浏览器上下文
    let context = this.browserManager.contexts.get(accountId);

    // 🔍 验证 context 是否仍然有效
    if (context) {
      try {
        // 检查浏览器是否已断开
        const browser = context.browser();
        if (!browser || !browser.isConnected()) {
          logger.warn(`⚠️  Browser disconnected for account ${accountId}, recreating context...`);
          // 清理无效的 context
          this.browserManager.contexts.delete(accountId);
          this.browserManager.browsers.delete(accountId);
          // 清理所有已注册的 tabs（它们都已失效）
          this.tabs.delete(accountId);
          context = null;
        }
      } catch (error) {
        logger.warn(`⚠️  Failed to check context validity: ${error.message}, recreating...`);
        context = null;
      }
    }

    if (!context) {
      logger.warn(`Context not found or invalid for account ${accountId}, creating...`);
      context = await this.browserManager.createContextForAccount(accountId);

      if (!context) {
        throw new Error(`Failed to create context for account ${accountId}`);
      }
      logger.info(`✅ Context created for account ${accountId}`);
    }

    // 创建页面
    const page = await context.newPage();
    const tabId = `tab-${++this.tabIdCounter}`;

    // 注册 Tab
    if (!this.tabs.has(accountId)) {
      this.tabs.set(accountId, new Map());
    }

    const createdAt = Date.now();
    this.tabs.get(accountId).set(tabId, {
      tabId,
      page,
      tag,
      persistent,
      createdAt,
      status: 'ACTIVE',  // 'ACTIVE' | 'RELEASED' | 'CLOSED'
      releasedAt: null,
    });

    // 🔍 注入 Tab 信息到页面，方便调试
    await this._injectTabInfo(page, { tabId, tag, persistent, createdAt, accountId, source: 'createTab' });

    logger.info(`✅ Registered tab ${tabId}: tag=${tag}, persistent=${persistent}`);

    return { tabId, page };
  }

  /**
   * 注册已存在的 Page 到 TabManager
   * 用于将浏览器启动时自动创建的默认 tab 注册到管理系统
   *
   * ⭐ 行为：如果已存在相同 tag 的 Tab，返回已存在的 tabId（不会重复注册）
   *
   * @param {string} accountId - 账户ID
   * @param {Page} page - Playwright Page 对象
   * @param {string} tag - Tab 标记
   * @param {boolean} persistent - 是否持久
   * @returns {Promise<{tabId: string, isNew: boolean}>} tabId 和是否新注册
   */
  async registerExistingPage(accountId, page, tag, persistent = true) {
    // ⭐ 先检查是否已存在相同 tag 的 Tab
    const existingTab = this.findTabByTag(accountId, tag);
    if (existingTab) {
      logger.debug(`♻️ Tab ${tag} already exists (${existingTab.tabId}) for account ${accountId}, reusing`);
      return { tabId: existingTab.tabId, isNew: false };
    }

    const tabId = `tab-${++this.tabIdCounter}`;
    const createdAt = Date.now();

    // 注册 Tab
    if (!this.tabs.has(accountId)) {
      this.tabs.set(accountId, new Map());
    }

    this.tabs.get(accountId).set(tabId, {
      tabId,
      page,
      tag,
      persistent,
      createdAt,
      status: 'ACTIVE',
      releasedAt: null,
    });

    // 🔍 注入 Tab 信息到页面，方便调试
    await this._injectTabInfo(page, { tabId, tag, persistent, createdAt, accountId, source: 'registerExistingPage' });

    logger.info(`✅ Registered existing tab ${tabId}: tag=${tag}, persistent=${persistent}`);

    return { tabId, isNew: true };
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
   * 获取指定 Tab 信息
   *
   * @param {string} accountId - 账户ID
   * @param {string} tabId - Tab ID
   * @returns {Object|null} Tab 信息
   */
  getTab(accountId, tabId) {
    const accountTabs = this.tabs.get(accountId);
    if (!accountTabs) return null;

    return accountTabs.get(tabId) || null;
  }

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
      logger.debug(`🔒 Persistent tab ${tabId} (tag=${tab.tag}) - release ignored`);
    }
  }

  /**
   * ⭐ 安全关闭 Tab（保留最后一个窗口）
   *
   * ⚠️ 这是内部方法，业务代码应该使用 releaseTab() 而不是直接调用此方法
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
      // ⭐ 改进: 区分持久窗口和临时窗口
      if (tab.persistent) {
        // 持久窗口: 转换为 PLACEHOLDER (保持浏览器存活)
        logger.warn(`⚠️  Cannot close last persistent tab ${tabId} - converting to PLACEHOLDER`);
        tab.tag = TabTag.PLACEHOLDER;
        tab.status = 'ACTIVE';
        logger.info(`🔄 Tab ${tabId} converted to PLACEHOLDER to keep browser alive`);
        return false;
      } else {
        // 临时窗口: 允许关闭 (浏览器会退出，但这是预期行为)
        logger.warn(`⚠️  Closing last temporary tab ${tabId} - browser will exit`);
        // 继续执行关闭流程
      }
    }

    // 安全关闭
    try {
      if (!tab.page.isClosed()) {
        await tab.page.close();
        logger.info(`🗑️  Closed tab ${tabId} (tag=${tab.tag}) for account ${accountId}`);
      }

      tab.status = 'CLOSED';
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
   * 获取 Tab 数量
   *
   * @param {string} accountId - 账户ID
   * @returns {number} Tab 数量
   */
  getTabCount(accountId) {
    return this.getAccountTabs(accountId).size;
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
   * 清理占位窗口
   *
   * 当有持久窗口（蜘蛛任务）启动后，可以关闭占位窗口
   *
   * @param {string} accountId - 账户ID
   */
  async cleanupPlaceholder(accountId) {
    const accountTabs = this.getAccountTabs(accountId);

    // 统计持久窗口数量（不包括占位窗口）
    let persistentCount = 0;
    let placeholderTab = null;

    for (const [tabId, tabInfo] of accountTabs.entries()) {
      if (tabInfo.tag === TabTag.PLACEHOLDER) {
        placeholderTab = { tabId, ...tabInfo };
      } else if (tabInfo.persistent) {
        persistentCount++;
      }
    }

    // 如果有至少 1 个持久窗口（蜘蛛任务），可以关闭占位窗口
    if (persistentCount >= 1 && placeholderTab) {
      logger.info(`🧹 Cleaning up placeholder tab ${placeholderTab.tabId} (have ${persistentCount} persistent tabs)`);

      try {
        if (!placeholderTab.page.isClosed()) {
          await placeholderTab.page.close();
        }
        accountTabs.delete(placeholderTab.tabId);
        logger.info(`✅ Placeholder tab cleaned up successfully`);
      } catch (error) {
        logger.error(`Failed to cleanup placeholder tab:`, error);
      }
    }
  }

  /**
   * 清理账户的所有 Tab
   *
   * @param {string} accountId - 账户ID
   */
  async clearAccountTabs(accountId) {
    const accountTabs = this.getAccountTabs(accountId);

    logger.info(`🗑️  Clearing ${accountTabs.size} tabs for account ${accountId}...`);

    for (const [tabId, tabInfo] of accountTabs.entries()) {
      try {
        if (!tabInfo.page.isClosed()) {
          await tabInfo.page.close();
          logger.debug(`Closed tab ${tabId}`);
        }
      } catch (error) {
        logger.error(`Failed to close tab ${tabId}:`, error);
      }
    }

    this.tabs.delete(accountId);
    logger.info(`✅ Cleared all tabs for account ${accountId}`);
  }

  /**
   * 🔍 注入 Tab 信息到页面的 window 对象
   * 方便在浏览器控制台中调试查看 Tab 类型
   *
   * 使用 addInitScript 确保每次页面加载都会注入
   *
   * @param {Page} page - Playwright Page 对象
   * @param {Object} info - Tab 信息
   * @private
   */
  async _injectTabInfo(page, info) {
    try {
      // 使用 addInitScript 确保每次导航后都会重新注入
      await page.addInitScript((tabInfo) => {
        window._tabInfo = {
          ...tabInfo,
          injectedAt: new Date().toISOString()
        };
        // 在控制台打印提示
        console.log('%c[TabManager] Tab Info', 'color: #4CAF50; font-weight: bold;',
          `tag=${tabInfo.tag}, persistent=${tabInfo.persistent}, tabId=${tabInfo.tabId}, source=${tabInfo.source}`);
      }, info);

      // 同时立即注入到当前页面（如果页面已经加载）
      await page.evaluate((tabInfo) => {
        window._tabInfo = {
          ...tabInfo,
          injectedAt: new Date().toISOString()
        };
      }, info).catch(() => {}); // 忽略错误，页面可能还没准备好

      logger.debug(`✅ Injected _tabInfo for ${info.tabId}`);
    } catch (error) {
      // 页面可能还没准备好或已关闭，忽略错误
      logger.debug(`⚠️ Failed to inject _tabInfo: ${error.message}`);
    }
  }

  /**
   * 🔍 调试方法：打印所有 Tab 状态
   * @param {string} accountId - 账户ID（可选，不传则打印所有账户）
   */
  debugPrintTabs(accountId = null) {
    console.log('\n========== TAB MANAGER DEBUG ==========');
    console.log(`Total accounts: ${this.tabs.size}`);

    const accountsToShow = accountId ? [accountId] : Array.from(this.tabs.keys());

    for (const accId of accountsToShow) {
      const accountTabs = this.tabs.get(accId);
      if (!accountTabs) {
        console.log(`\n[Account: ${accId}] - No tabs registered`);
        continue;
      }

      console.log(`\n[Account: ${accId}] - ${accountTabs.size} tabs:`);
      console.log('─'.repeat(80));

      let index = 1;
      for (const [tabId, tabInfo] of accountTabs.entries()) {
        const url = tabInfo.page?.url?.() || 'unknown';
        const isClosed = tabInfo.page?.isClosed?.() ?? 'unknown';

        console.log(`  ${index}. TabID: ${tabId}`);
        console.log(`     Tag: ${tabInfo.tag}`);
        console.log(`     Persistent: ${tabInfo.persistent}`);
        console.log(`     Status: ${tabInfo.status}`);
        console.log(`     URL: ${url.substring(0, 60)}${url.length > 60 ? '...' : ''}`);
        console.log(`     Closed: ${isClosed}`);
        console.log(`     Created: ${new Date(tabInfo.createdAt).toLocaleTimeString()}`);
        console.log('');
        index++;
      }
    }
    console.log('========================================\n');
  }
}

module.exports = { TabManager, TabTag };
