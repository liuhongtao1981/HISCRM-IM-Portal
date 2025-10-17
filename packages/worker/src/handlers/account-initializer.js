/**
 * 账号初始化器
 * 负责为每个账号启动浏览器进程并加载 Cookie、指纹等配置
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('account-initializer');

class AccountInitializer {
  constructor(browserManager, platformManager) {
    this.browserManager = browserManager;
    this.platformManager = platformManager;

    // 记录已初始化的账号
    this.initializedAccounts = new Set();
  }

  /**
   * 为账号初始化浏览器环境
   * @param {Object} account - 账号完整数据
   * @returns {Promise<void>}
   */
  async initializeAccount(account) {
    try {
      logger.info(`Initializing browser for account ${account.id} (${account.account_name})`);

      // 检查是否已初始化
      if (this.initializedAccounts.has(account.id)) {
        logger.info(`Account ${account.id} already initialized, skipping`);
        return;
      }

      // 1. 准备浏览器启动选项
      const launchOptions = {};

      // 2. 处理指纹数据
      let fingerprintToUse = null;

      if (account.credentials && account.credentials.fingerprint) {
        // 使用 Master 传来的指纹
        fingerprintToUse = account.credentials.fingerprint;
        logger.info(`Using fingerprint from Master for account ${account.id}`);

        // 保存指纹配置到本地
        this.browserManager.saveFingerprintConfig(account.id, fingerprintToUse);
      } else {
        // 没有指纹,生成新的(或使用已保存的)
        fingerprintToUse = this.browserManager.getOrCreateFingerprintConfig(account.id);
        logger.info(`Generated new fingerprint for account ${account.id}`);
      }

      // 3. 启动浏览器 (PersistentContext)
      logger.info(`Launching browser for account ${account.id}...`);
      const context = await this.browserManager.launchPersistentContextForAccount(
        account.id,
        launchOptions
      );

      logger.info(`Browser launched for account ${account.id}`);

      // 4. 加载 Cookies (如果有的话)
      if (account.credentials && account.credentials.cookies && account.credentials.cookies.length > 0) {
        await this.loadCookies(context, account);
      } else {
        logger.info(`No cookies to load for account ${account.id}`);
      }

      // 5. 加载 localStorage (如果有的话)
      if (account.credentials && account.credentials.localStorage) {
        await this.loadLocalStorage(context, account);
      }

      // 6. 标记为已初始化
      this.initializedAccounts.add(account.id);

      logger.info(`✓ Account ${account.id} initialized successfully`);

    } catch (error) {
      logger.error(`Failed to initialize account ${account.id}:`, error);
      throw error;
    }
  }

  /**
   * 加载 Cookies 到浏览器
   * @param {BrowserContext} context - 浏览器上下文
   * @param {Object} account - 账号数据
   */
  async loadCookies(context, account) {
    try {
      const cookies = account.credentials.cookies;

      if (!cookies || cookies.length === 0) {
        return;
      }

      logger.info(`Loading ${cookies.length} cookies for account ${account.id}`);

      // Playwright addCookies 格式
      const formattedCookies = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        expires: cookie.expires || -1,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: cookie.sameSite || 'Lax',
      }));

      await context.addCookies(formattedCookies);

      logger.info(`✓ Loaded ${formattedCookies.length} cookies for account ${account.id}`);

      // 检查 Cookie 是否过期
      const now = Math.floor(Date.now() / 1000);
      if (account.cookies_valid_until && account.cookies_valid_until < now) {
        logger.warn(`Cookies for account ${account.id} have expired (valid until: ${new Date(account.cookies_valid_until * 1000).toLocaleString()})`);
      }

    } catch (error) {
      logger.error(`Failed to load cookies for account ${account.id}:`, error);
    }
  }

  /**
   * 加载 localStorage 到浏览器
   * @param {BrowserContext} context - 浏览器上下文
   * @param {Object} account - 账号数据
   */
  async loadLocalStorage(context, account) {
    try {
      const localStorage = account.credentials.localStorage;

      if (!localStorage || Object.keys(localStorage).length === 0) {
        return;
      }

      logger.info(`Loading localStorage for account ${account.id}`);

      // 获取平台配置,确定目标域名
      const platform = this.platformManager.getPlatform(account.platform);
      if (!platform || !platform.config) {
        logger.warn(`No platform config for ${account.platform}, skipping localStorage load`);
        return;
      }

      const homeUrl = platform.config.urls.home || platform.config.urls.login;

      // 创建临时页面并注入 localStorage
      const page = await context.newPage();
      await page.goto(homeUrl);

      // 注入 localStorage
      await page.evaluate((data) => {
        for (const [key, value] of Object.entries(data)) {
          localStorage.setItem(key, value);
        }
      }, localStorage);

      await page.close();

      logger.info(`✓ Loaded localStorage for account ${account.id}`);

    } catch (error) {
      logger.error(`Failed to load localStorage for account ${account.id}:`, error);
    }
  }

  /**
   * 批量初始化账号
   * @param {Array} accounts - 账号列表
   * @returns {Promise<void>}
   */
  async initializeAccounts(accounts) {
    logger.info(`Initializing ${accounts.length} accounts...`);

    const results = [];

    for (const account of accounts) {
      try {
        await this.initializeAccount(account);
        results.push({ accountId: account.id, success: true });
      } catch (error) {
        logger.error(`Failed to initialize account ${account.id}:`, error);
        results.push({ accountId: account.id, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`Initialization complete: ${successCount} succeeded, ${failCount} failed`);

    return results;
  }

  /**
   * 移除账号
   * @param {string} accountId - 账号ID
   */
  async removeAccount(accountId) {
    try {
      logger.info(`Removing account ${accountId}`);

      // 关闭浏览器
      await this.browserManager.closeBrowser(accountId);

      // 从已初始化集合中移除
      this.initializedAccounts.delete(accountId);

      logger.info(`✓ Account ${accountId} removed`);

    } catch (error) {
      logger.error(`Failed to remove account ${accountId}:`, error);
    }
  }

  /**
   * 检查账号是否已初始化
   * @param {string} accountId - 账号ID
   * @returns {boolean}
   */
  isInitialized(accountId) {
    return this.initializedAccounts.has(accountId);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      initializedAccounts: this.initializedAccounts.size,
      accounts: Array.from(this.initializedAccounts),
    };
  }
}

module.exports = AccountInitializer;
