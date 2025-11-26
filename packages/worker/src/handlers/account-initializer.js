/**
 * 账号初始化器
 * 负责为每个账号启动浏览器进程并加载 Cookie、指纹等配置
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { TabTag } = require('../browser/tab-manager');
const debugConfig = require('../config/debug-config');

const logger = createLogger('account-initializer');

class AccountInitializer {
  constructor(browserManager, platformManager, chromeDevToolsMCP = null) {
    this.browserManager = browserManager;
    this.platformManager = platformManager;
    this.chromeDevToolsMCP = chromeDevToolsMCP;

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

      // 6. 加载平台首页
      await this.loadPlatformHomepage(context, account);

      // 7. 初始化平台（设置 DataManager 等）
      try {
        const platformInstance = this.platformManager.getPlatform(account.platform);
        if (platformInstance && typeof platformInstance.initialize === 'function') {
          logger.info(`Initializing platform ${account.platform} for account ${account.id}...`);
          await platformInstance.initialize(account);
          logger.info(`Platform ${account.platform} initialized for account ${account.id}`);
        } else {
          logger.warn(`Platform ${account.platform} does not have initialize() method`);
        }
      } catch (error) {
        logger.error(`Failed to initialize platform ${account.platform} for account ${account.id}:`, error);
        // 平台初始化失败不影响浏览器启动，继续执行
      }

      // 8. 标记为已初始化
      this.initializedAccounts.add(account.id);

      // 9. 在 DEBUG 模式下通知 MCP 浏览器已就绪
      if (debugConfig.enabled && this.chromeDevToolsMCP) {
        this.notifyMCPBrowserReady(account.id);
      }

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
   * 加载平台首页
   * ⭐ 改进: 使用 Spider1 (Tab 1) 加载首页，而不是创建新页面
   * 这样充分利用默认标签页，避免浪费标签页资源
   * @param {BrowserContext} context - 浏览器上下文
   * @param {Object} account - 账号数据
   */
  async loadPlatformHomepage(context, account) {
    try {
      // 获取平台配置
      const platform = this.platformManager.getPlatform(account.platform);
      if (!platform || !platform.config) {
        logger.warn(`No platform config for ${account.platform}, skipping homepage load`);
        return;
      }

      // ⭐ 初始化时加载创作中心（用于登录检测），而不是首页
      const creatorCenterUrl = platform.config.urls.creatorCenter;
      if (!creatorCenterUrl) {
        logger.warn(`No creatorCenter URL configured for platform ${account.platform}`);
        return;
      }

      // Debug 模式下：使用更短的超时或跳过首页加载，避免反复失败导致浏览器重启
      const isDebugMode = process.env.DEBUG === 'true';
      const navigationTimeout = isDebugMode ? 10000 : 30000;  // Debug模式: 10秒，否则 30秒
      const waitUntilOption = isDebugMode ? 'domcontentloaded' : 'networkidle';  // Debug模式：DOM加载即可

      logger.info(`Loading creator center for account ${account.id}: ${creatorCenterUrl}`, {
        debugMode: isDebugMode,
        timeout: navigationTimeout,
        waitUntil: waitUntilOption
      });

      // ⭐ 使用浏览器启动时自动创建的默认 tab（spider1）
      // 不创建新 tab，直接使用已有的默认 tab
      const defaultPage = await this.browserManager.getSpiderPage(account.id, 'spider1');
      if (!defaultPage) {
        logger.error(`Default page (spider1) not found for account ${account.id}`);
        return;
      }

      logger.info(`📌 Using default browser tab (spider1) to load creator center for account ${account.id}`);

      try {
        // 导航到创作中心，设置合理的超时时间
        await defaultPage.goto(creatorCenterUrl, {
          waitUntil: waitUntilOption,  // Debug模式用 domcontentloaded，否则 networkidle
          timeout: navigationTimeout,   // Debug模式用 10秒，否则 30秒
        });

        logger.info(`✓ Loaded creator center for account ${account.id}`);

        // ⭐ 将这个默认 tab 注册到 TabManager 作为 PLACEHOLDER
        // 如果已存在会自动复用，不会重复注册
        const { isNew } = await this.browserManager.tabManager.registerExistingPage(
          account.id,
          defaultPage,
          TabTag.PLACEHOLDER,
          true  // persistent
        );
        if (isNew) {
          logger.info(`✓ Registered default tab as PLACEHOLDER for account ${account.id}`);
        }

        // 保存页面到浏览器管理器的页面池（这样其他操作可以复用）
        this.browserManager.savePageForAccount(account.id, defaultPage);

      } catch (error) {
        logger.warn(`Failed to navigate to creator center for account ${account.id}: ${error.message}`);
        // 即使导航失败，也注册这个 tab（如果已存在会自动复用）
        await this.browserManager.tabManager.registerExistingPage(
          account.id,
          defaultPage,
          TabTag.PLACEHOLDER,
          true
        );
        this.browserManager.savePageForAccount(account.id, defaultPage);
      }

    } catch (error) {
      logger.error(`Failed to load creator center for account ${account.id}:`, error);
      // 不抛出异常，初始化继续
    }
  }

  /**
   * 批量初始化账号
   * @param {Array} accounts - 账号列表
   * @returns {Promise<void>}
   */
  async initializeAccounts(accounts) {
    // Debug 模式：只初始化第一个账号
    let accountsToInitialize = accounts;

    if (debugConfig.enabled && debugConfig.singleAccount.enabled) {
      logger.info(`🔍 Debug 模式已启用：仅初始化第一个账号，其他账号浏览器将不启动`);
      if (accounts.length > 1) {
        logger.info(`   总共 ${accounts.length} 个账号，仅初始化第一个: ${accounts[0].id} (${accounts[0].account_name})`);
        logger.info(`   其他 ${accounts.length - 1} 个账号将被跳过（用于测试）`);
        accountsToInitialize = [accounts[0]];
      }
    }

    logger.info(`Initializing ${accountsToInitialize.length} accounts...`);

    const results = [];

    for (const account of accountsToInitialize) {
      try {
        await this.initializeAccount(account);
        results.push({ accountId: account.id, success: true });
      } catch (error) {
        logger.error(`Failed to initialize account ${account.id}:`, error);
        results.push({ accountId: account.id, success: false, error: error.message });
      }
    }

    // 对于被跳过的账号，记录为已初始化但不启动浏览器
    if (debugConfig.enabled && debugConfig.singleAccount.enabled && accounts.length > 1) {
      for (let i = 1; i < accounts.length; i++) {
        const account = accounts[i];
        logger.info(`⏭️  Debug 模式：账号 ${account.id} 被跳过（仅作记录，不启动浏览器）`);
        // 标记为已初始化（即使没有启动浏览器），这样任务系统仍然可以分配任务给这个账号
        this.initializedAccounts.add(account.id);
        results.push({ accountId: account.id, success: true, skipped: true, reason: 'Debug mode: only first account browser launched' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const skippedCount = results.filter(r => r.skipped).length;
    const failCount = results.filter(r => !r.success).length;

    if (skippedCount > 0) {
      logger.info(`Initialization complete: ${successCount - skippedCount} initialized, ${skippedCount} skipped (debug mode), ${failCount} failed`);
    } else {
      logger.info(`Initialization complete: ${successCount} succeeded, ${failCount} failed`);
    }

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
   * 通知 MCP 浏览器已就绪（仅在 DEBUG 模式）
   * 用于告知监控面板浏览器进程已启动并加载了平台首页
   * @param {string} accountId - 账号ID
   */
  notifyMCPBrowserReady(accountId) {
    try {
      if (!this.chromeDevToolsMCP || !this.chromeDevToolsMCP.broadcastToClients) {
        return;
      }

      // 广播浏览器就绪消息到所有连接的 MCP 客户端
      this.chromeDevToolsMCP.broadcastToClients({
        type: 'browser_ready',
        accountId,
        timestamp: Date.now(),
        message: `Browser initialized and homepage loaded for account ${accountId}`,
      });

      logger.info(`✓ Notified MCP: Browser ready for account ${accountId}`);

    } catch (error) {
      logger.warn(`Failed to notify MCP about browser ready for ${accountId}:`, error.message);
    }
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
