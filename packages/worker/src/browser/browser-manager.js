/**
 * BrowserManager - Playwright 浏览器管理器
 * 负责管理浏览器生命周期、上下文创建、代理配置
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('browser-manager');

class BrowserManager {
  constructor(workerId, config = {}) {
    this.workerId = workerId;
    this.config = {
      headless: config.headless !== undefined ? config.headless : true,
      browserType: config.browserType || 'chromium',
      dataDir: config.dataDir || './data/browser',
      slowMo: config.slowMo || 0,
      devtools: config.devtools || false,
      ...config,
    };

    // 浏览器实例
    this.browser = null;

    // 上下文管理 (accountId -> context)
    this.contexts = new Map();

    // Storage state 路径管理 (accountId -> path)
    this.storageStatePaths = new Map();

    // 确保数据目录存在
    this.ensureDataDir();
  }

  /**
   * 确保数据目录存在
   */
  ensureDataDir() {
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
      logger.info(`Created browser data directory: ${this.config.dataDir}`);
    }
  }

  /**
   * 启动浏览器
   */
  async launch() {
    try {
      if (this.browser) {
        logger.warn('Browser already launched');
        return this.browser;
      }

      logger.info(`Launching ${this.config.browserType} browser (headless: ${this.config.headless})...`);

      const launchOptions = {
        headless: this.config.headless,
        slowMo: this.config.slowMo,
        devtools: this.config.devtools,
        channel: 'chrome', // 使用系统安装的 Google Chrome
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      };

      // 根据浏览器类型启动
      if (this.config.browserType === 'chromium') {
        this.browser = await chromium.launch(launchOptions);
      } else {
        throw new Error(`Unsupported browser type: ${this.config.browserType}`);
      }

      logger.info('Browser launched successfully');
      return this.browser;

    } catch (error) {
      logger.error('Failed to launch browser:', error);
      throw error;
    }
  }

  /**
   * 创建浏览器上下文
   * @param {string} accountId - 账户ID
   * @param {Object} options - 上下文选项
   * @returns {BrowserContext}
   */
  async createContext(accountId, options = {}) {
    try {
      if (!this.browser) {
        await this.launch();
      }

      // 检查是否已存在上下文
      if (this.contexts.has(accountId)) {
        logger.warn(`Context already exists for account ${accountId}`);
        return this.contexts.get(accountId);
      }

      logger.info(`Creating browser context for account ${accountId}...`);

      // 准备上下文配置
      const contextOptions = {
        viewport: options.viewport || { width: 1920, height: 1080 },
        userAgent: options.userAgent || this.generateUserAgent(),
        locale: options.locale || 'zh-CN',
        timezoneId: options.timezoneId || 'Asia/Shanghai',
        permissions: options.permissions || [],
        bypassCSP: options.bypassCSP || false,
        ignoreHTTPSErrors: options.ignoreHTTPSErrors || true,
      };

      // 配置代理
      if (options.proxy) {
        contextOptions.proxy = {
          server: options.proxy.server,
          username: options.proxy.username,
          password: options.proxy.password,
        };
        logger.info(`Using proxy: ${options.proxy.server}`);
      }

      // 加载已保存的 storage state（如果存在）
      const storageStatePath = this.getStorageStatePath(accountId);
      if (fs.existsSync(storageStatePath)) {
        contextOptions.storageState = storageStatePath;
        logger.info(`Loading storage state from: ${storageStatePath}`);
      }

      // 创建上下文
      const context = await this.browser.newContext(contextOptions);

      // 反检测措施
      await this.applyAntiDetection(context);

      // 保存上下文引用
      this.contexts.set(accountId, context);
      this.storageStatePaths.set(accountId, storageStatePath);

      logger.info(`Context created successfully for account ${accountId}`);
      return context;

    } catch (error) {
      logger.error(`Failed to create context for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 应用反检测措施
   * @param {BrowserContext} context - 浏览器上下文
   */
  async applyAntiDetection(context) {
    try {
      // 为每个新页面应用反检测脚本
      context.on('page', async (page) => {
        // 覆盖 navigator.webdriver
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
          });
        });

        // 覆盖 navigator.plugins
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
          });
        });

        // 覆盖 navigator.languages
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'languages', {
            get: () => ['zh-CN', 'zh', 'en'],
          });
        });

        // 覆盖 Chrome 特征
        await page.addInitScript(() => {
          window.chrome = {
            runtime: {},
          };
        });

        logger.debug('Anti-detection scripts applied to page');
      });

    } catch (error) {
      logger.error('Failed to apply anti-detection:', error);
    }
  }

  /**
   * 生成随机 User-Agent
   * @returns {string}
   */
  generateUserAgent() {
    const chromeVersions = [
      '120.0.6099.109',
      '119.0.6045.123',
      '118.0.5993.88',
      '117.0.5938.132',
    ];

    const randomVersion = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];

    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${randomVersion} Safari/537.36`;
  }

  /**
   * 获取 Storage State 文件路径
   * @param {string} accountId - 账户ID
   * @returns {string}
   */
  getStorageStatePath(accountId) {
    return path.join(this.config.dataDir, `${accountId}_state.json`);
  }

  /**
   * 保存上下文的 Storage State
   * @param {string} accountId - 账户ID
   */
  async saveStorageState(accountId) {
    try {
      const context = this.contexts.get(accountId);
      if (!context) {
        logger.warn(`No context found for account ${accountId}`);
        return;
      }

      const storageStatePath = this.getStorageStatePath(accountId);
      await context.storageState({ path: storageStatePath });

      logger.info(`Storage state saved for account ${accountId}: ${storageStatePath}`);

    } catch (error) {
      logger.error(`Failed to save storage state for account ${accountId}:`, error);
    }
  }

  /**
   * 获取上下文
   * @param {string} accountId - 账户ID
   * @returns {BrowserContext|null}
   */
  getContext(accountId) {
    return this.contexts.get(accountId) || null;
  }

  /**
   * 关闭账户的上下文
   * @param {string} accountId - 账户ID
   * @param {boolean} saveState - 是否保存 storage state
   */
  async closeContext(accountId, saveState = true) {
    try {
      const context = this.contexts.get(accountId);
      if (!context) {
        logger.warn(`No context to close for account ${accountId}`);
        return;
      }

      // 保存 storage state
      if (saveState) {
        await this.saveStorageState(accountId);
      }

      // 关闭所有页面
      const pages = context.pages();
      for (const page of pages) {
        await page.close();
      }

      // 关闭上下文
      await context.close();

      // 清理引用
      this.contexts.delete(accountId);

      logger.info(`Context closed for account ${accountId}`);

    } catch (error) {
      logger.error(`Failed to close context for account ${accountId}:`, error);
    }
  }

  /**
   * 关闭所有上下文
   */
  async closeAllContexts() {
    logger.info('Closing all browser contexts...');

    const accountIds = Array.from(this.contexts.keys());
    for (const accountId of accountIds) {
      await this.closeContext(accountId, true);
    }

    logger.info('All contexts closed');
  }

  /**
   * 关闭浏览器
   */
  async close() {
    try {
      if (!this.browser) {
        logger.warn('Browser is not running');
        return;
      }

      // 关闭所有上下文
      await this.closeAllContexts();

      // 关闭浏览器
      await this.browser.close();
      this.browser = null;

      logger.info('Browser closed');

    } catch (error) {
      logger.error('Failed to close browser:', error);
    }
  }

  /**
   * 创建新页面
   * @param {string} accountId - 账户ID
   * @param {Object} options - 页面选项（会传递给 createContext）
   * @returns {Page}
   */
  async newPage(accountId, options = {}) {
    try {
      let context = this.getContext(accountId);

      // 如果上下文不存在，创建新的（传递 options 包括代理配置）
      if (!context) {
        context = await this.createContext(accountId, options);
      }

      const page = await context.newPage();
      logger.info(`New page created for account ${accountId}`);

      return page;

    } catch (error) {
      logger.error(`Failed to create new page for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 获取上下文的所有页面
   * @param {string} accountId - 账户ID
   * @returns {Page[]}
   */
  getPages(accountId) {
    const context = this.getContext(accountId);
    return context ? context.pages() : [];
  }

  /**
   * 检查账户是否有活动上下文
   * @param {string} accountId - 账户ID
   * @returns {boolean}
   */
  hasContext(accountId) {
    return this.contexts.has(accountId);
  }

  /**
   * 获取统计信息
   * @returns {Object}
   */
  getStats() {
    const contexts = Array.from(this.contexts.entries()).map(([accountId, context]) => ({
      accountId,
      pages: context.pages().length,
    }));

    return {
      isRunning: this.browser !== null,
      totalContexts: this.contexts.size,
      contexts,
    };
  }
}

module.exports = BrowserManager;
