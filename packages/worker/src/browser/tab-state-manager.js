/**
 * Tab 状态管理器
 *
 * 管理每个账户的 Tab 状态和转换
 *
 * 核心原则：
 * 1. 资源最小化 - 每个账户最多 2-3 个 Tab
 * 2. 复用优先 - Tab 1 从登录检测转换为 Spider1
 * 3. 职责明确 - 每个 Tab 有明确的用途和生命周期
 * 4. 智能转换 - 临时 Tab 完成任务后立即关闭
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
   * @param {string} accountId - 账户ID
   * @param {string} tabId - Tab ID
   * @param {Page} page - Playwright Page 对象
   * @param {string} state - Tab 状态
   * @param {string} purpose - Tab 用途描述
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
   * @returns {boolean} 转换是否成功
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
   * @param {string} oldState - 旧状态
   * @param {string} newState - 新状态
   * @returns {boolean} 转换是否合法
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
   * @param {string} accountId - 账户ID
   * @returns {Map} Tab Map
   */
  getAccountTabs(accountId) {
    return this.tabs.get(accountId) || new Map();
  }

  /**
   * 获取特定状态的 Tab
   * @param {string} accountId - 账户ID
   * @param {string} state - Tab 状态
   * @returns {Object|null} Tab 信息
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
   * 获取 Tab 信息
   * @param {string} accountId - 账户ID
   * @param {string} tabId - Tab ID
   * @returns {Object|null} Tab 信息
   */
  getTab(accountId, tabId) {
    const accountTabs = this.getAccountTabs(accountId);
    return accountTabs.get(tabId) || null;
  }

  /**
   * 获取 Tab 数量
   * @param {string} accountId - 账户ID
   * @returns {number} Tab 数量
   */
  getTabCount(accountId) {
    return this.getAccountTabs(accountId).size;
  }

  /**
   * 移除 Tab
   * @param {string} accountId - 账户ID
   * @param {string} tabId - Tab ID
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
   * @param {string} accountId - 账户ID
   */
  clearAccountTabs(accountId) {
    this.tabs.delete(accountId);
    logger.info(`🗑️  Cleared all tabs for account ${accountId}`);
  }

  /**
   * 获取账户的 Tab 统计信息
   * @param {string} accountId - 账户ID
   * @returns {Object} 统计信息
   */
  getTabStats(accountId) {
    const accountTabs = this.getAccountTabs(accountId);
    const stats = {
      total: accountTabs.size,
      byState: {},
    };

    for (const [tabId, tabInfo] of accountTabs.entries()) {
      const state = tabInfo.state;
      stats.byState[state] = (stats.byState[state] || 0) + 1;
    }

    return stats;
  }

  /**
   * 打印账户的 Tab 列表
   * @param {string} accountId - 账户ID
   */
  printAccountTabs(accountId) {
    const accountTabs = this.getAccountTabs(accountId);
    logger.info(`📊 Account ${accountId} has ${accountTabs.size} tabs:`);

    for (const [tabId, tabInfo] of accountTabs.entries()) {
      const age = Math.floor((Date.now() - tabInfo.createdAt) / 1000);
      logger.info(`   - ${tabId}: state=${tabInfo.state}, purpose="${tabInfo.purpose}", age=${age}s`);
    }
  }
}

module.exports = { TabStateManager, TabState };
