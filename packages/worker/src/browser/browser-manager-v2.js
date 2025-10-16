/**
 * BrowserManager V2 - 每账户独立Browser实例
 * 每个账户使用独立的Browser进程,实现完全的指纹隔离
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('browser-manager-v2');

class BrowserManagerV2 {
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

    // Browser实例管理 (accountId -> browser)
    this.browsers = new Map();

    // Context管理 (accountId -> context)
    this.contexts = new Map();

    // 指纹配置管理 (accountId -> fingerprintConfig)
    this.fingerprintConfigs = new Map();

    // Storage state 路径管理 (accountId -> path)
    this.storageStatePaths = new Map();

    // 确保数据目录存在
    this.ensureDataDir();

    // 加载已保存的指纹配置
    this.loadFingerprintConfigs();
  }

  /**
   * 确保数据目录存在
   */
  ensureDataDir() {
    if (!fs.existsSync(this.config.dataDir)) {
      fs.mkdirSync(this.config.dataDir, { recursive: true });
      logger.info(`Created browser data directory: ${this.config.dataDir}`);
    }

    // 确保指纹配置目录存在
    const fingerprintDir = path.join(this.config.dataDir, 'fingerprints');
    if (!fs.existsSync(fingerprintDir)) {
      fs.mkdirSync(fingerprintDir, { recursive: true });
    }
  }

  /**
   * 加载已保存的指纹配置
   */
  loadFingerprintConfigs() {
    const fingerprintDir = path.join(this.config.dataDir, 'fingerprints');

    if (!fs.existsSync(fingerprintDir)) {
      return;
    }

    const files = fs.readdirSync(fingerprintDir);

    for (const file of files) {
      if (file.endsWith('_fingerprint.json')) {
        const accountId = file.replace('_fingerprint.json', '');
        const configPath = path.join(fingerprintDir, file);

        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          this.fingerprintConfigs.set(accountId, config);
          logger.info(`Loaded fingerprint config for account ${accountId}`);
        } catch (error) {
          logger.error(`Failed to load fingerprint config for ${accountId}:`, error);
        }
      }
    }
  }

  /**
   * 保存指纹配置
   * @param {string} accountId - 账户ID
   * @param {Object} config - 指纹配置
   */
  saveFingerprintConfig(accountId, config) {
    const fingerprintDir = path.join(this.config.dataDir, 'fingerprints');
    const configPath = path.join(fingerprintDir, `${accountId}_fingerprint.json`);

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      this.fingerprintConfigs.set(accountId, config);
      logger.info(`Saved fingerprint config for account ${accountId}`);
    } catch (error) {
      logger.error(`Failed to save fingerprint config for ${accountId}:`, error);
    }
  }

  /**
   * 生成或获取账户的指纹配置
   * @param {string} accountId - 账户ID
   * @returns {Object} 指纹配置
   */
  getOrCreateFingerprintConfig(accountId) {
    // 如果已有配置,直接返回(保证稳定性)
    if (this.fingerprintConfigs.has(accountId)) {
      logger.info(`Using existing fingerprint for account ${accountId}`);
      return this.fingerprintConfigs.get(accountId);
    }

    // 生成新的指纹配置
    logger.info(`Generating new fingerprint for account ${accountId}`);

    // 使用账户ID作为随机种子,确保一致性
    const seed = this.hashString(accountId);
    const random = this.seededRandom(seed);

    const config = {
      accountId,
      createdAt: Date.now(),

      // User-Agent
      userAgent: this.randomUserAgent(random),

      // Viewport
      viewport: this.randomViewport(random),

      // WebGL
      webgl: {
        vendor: this.randomWebGLVendor(random),
        renderer: this.randomWebGLRenderer(random),
      },

      // Canvas
      canvas: {
        noise: this.generateCanvasNoise(random),
      },

      // Audio
      audio: {
        noise: (random() - 0.5) * 0.001,
      },

      // 硬件信息
      hardware: {
        cores: this.randomCPUCores(random),
        memory: this.randomDeviceMemory(random),
      },

      // 屏幕信息
      screen: {
        width: this.randomScreenWidth(random),
        height: this.randomScreenHeight(random),
        colorDepth: this.randomColorDepth(random),
        pixelRatio: this.randomPixelRatio(random),
      },

      // 语言和时区
      locale: this.randomLocale(random),
      timezone: this.randomTimezone(random),

      // 字体
      fonts: this.randomFonts(random),

      // 插件
      plugins: this.randomPlugins(random),

      // 电池
      battery: {
        level: 0.5 + (random() - 0.5) * 0.5,
        charging: random() > 0.5,
      },
    };

    // 保存配置
    this.saveFingerprintConfig(accountId, config);

    return config;
  }

  /**
   * 为账户启动独立的Browser实例（已废弃，使用 launchPersistentContextForAccount 代替）
   * @deprecated
   */
  async launchBrowserForAccount(accountId, options = {}) {
    // 直接调用 launchPersistentContextForAccount
    const context = await this.launchPersistentContextForAccount(accountId, options);
    // 返回 context 的 browser 以保持兼容性
    return context.browser();
  }

  /**
   * 检查浏览器上下文是否有效
   * @param {string} accountId - 账户ID
   * @returns {Promise<boolean>}
   */
  async isBrowserContextValid(accountId) {
    try {
      const context = this.contexts.get(accountId);
      if (!context) {
        return false;
      }

      // 检查 browser 是否连接
      const browser = context.browser();
      if (!browser || !browser.isConnected()) {
        logger.warn(`Browser disconnected for account ${accountId}`);
        return false;
      }

      // 尝试获取页面列表（这会失败如果 context 已关闭）
      await context.pages();
      return true;

    } catch (error) {
      logger.warn(`Browser context invalid for account ${accountId}:`, error.message);
      return false;
    }
  }

  /**
   * 强制清理无效的浏览器上下文
   * @param {string} accountId - 账户ID
   */
  async forceCleanupContext(accountId) {
    try {
      logger.info(`Force cleaning up invalid context for account ${accountId}...`);

      // 移除引用
      this.contexts.delete(accountId);
      this.browsers.delete(accountId);

      logger.info(`Cleaned up context references for account ${accountId}`);
    } catch (error) {
      logger.error(`Failed to force cleanup context for account ${accountId}:`, error);
    }
  }

  /**
   * 为账户启动 PersistentContext（推荐方法）
   * 使用 launchPersistentContext 可以直接指定 userDataDir，无需通过 args
   * @param {string} accountId - 账户ID
   * @param {Object} options - 启动选项
   * @returns {BrowserContext}
   */
  async launchPersistentContextForAccount(accountId, options = {}) {
    try {
      // 检查是否已启动且有效
      if (this.contexts.has(accountId)) {
        const isValid = await this.isBrowserContextValid(accountId);
        if (isValid) {
          logger.info(`Reusing valid context for account ${accountId}`);
          return this.contexts.get(accountId);
        } else {
          // 浏览器已关闭，需要重启
          logger.warn(`Context exists but invalid for account ${accountId}, restarting...`);
          await this.forceCleanupContext(accountId);
        }
      }

      logger.info(`Launching persistent context for account ${accountId}...`);

      // 获取或生成指纹配置
      const fingerprint = this.getOrCreateFingerprintConfig(accountId);

      // 账户专属的用户数据目录
      const userDataDir = path.join(this.config.dataDir, `browser_${accountId}`);
      if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
      }

      // 配置启动参数
      const launchOptions = {
        headless: this.config.headless,
        slowMo: this.config.slowMo,
        devtools: this.config.devtools,

        // 使用指纹配置
        userAgent: fingerprint.userAgent,
        viewport: fingerprint.viewport,
        locale: fingerprint.locale,
        timezoneId: fingerprint.timezone,
        colorScheme: 'light',
        deviceScaleFactor: fingerprint.screen.pixelRatio,

        // 安全和反检测参数
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          
          // 根据指纹配置设置窗口大小
          `--window-size=${fingerprint.viewport.width},${fingerprint.viewport.height}`,

          // 禁用WebRTC(防止IP泄露)
          options.disableWebRTC ? '--disable-webrtc' : '',
        ].filter(Boolean),

        // 其他选项
        bypassCSP: options.bypassCSP || false,
        ignoreHTTPSErrors: options.ignoreHTTPSErrors || true,
      };

      // 如果指定了代理
      if (options.proxy) {
        launchOptions.proxy = {
          server: options.proxy.server,
          username: options.proxy.username,
          password: options.proxy.password,
        };
        logger.info(`Using proxy for account ${accountId}: ${options.proxy.server}`);
      }

      // 启动 PersistentContext（会自动创建并管理 Browser）
      const context = await chromium.launchPersistentContext(userDataDir, launchOptions);

      // 注入指纹脚本
      await this.applyFingerprintScripts(context, fingerprint);

      // 反检测措施
      await this.applyAntiDetection(context);

      // 监听浏览器关闭事件
      const browser = context.browser();
      browser.on('disconnected', () => {
        logger.warn(`Browser disconnected for account ${accountId}, cleaning up...`);
        this.contexts.delete(accountId);
        this.browsers.delete(accountId);
      });

      // 保存引用
      this.contexts.set(accountId, context);
      this.browsers.set(accountId, browser);

      logger.info(`Persistent context launched successfully for account ${accountId}`);
      return context;

    } catch (error) {
      logger.error(`Failed to launch persistent context for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 为账户创建Context
   * 使用 launchPersistentContext，context 已经在启动时创建
   * @param {string} accountId - 账户ID
   * @param {Object} options - Context选项
   * @returns {BrowserContext}
   */
  async createContextForAccount(accountId, options = {}) {
    try {
      // 检查是否已有Context
      if (this.contexts.has(accountId)) {
        logger.info(`Reusing existing context for account ${accountId}`);
        return this.contexts.get(accountId);
      }

      logger.info(`Creating context for account ${accountId}...`);

      // 使用 launchPersistentContext 直接创建带 userDataDir 的 context
      const context = await this.launchPersistentContextForAccount(accountId, options);

      logger.info(`Context created successfully for account ${accountId}`);
      return context;

    } catch (error) {
      logger.error(`Failed to create context for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 应用指纹脚本
   * @param {BrowserContext} context - 浏览器上下文
   * @param {Object} fingerprint - 指纹配置
   */
  async applyFingerprintScripts(context, fingerprint) {
    try {
      await context.addInitScript((fp) => {
        // WebGL指纹
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
          if (parameter === 37445) return fp.webgl.vendor;
          if (parameter === 37446) return fp.webgl.renderer;
          return getParameter.call(this, parameter);
        };

        // Canvas指纹
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
          const dataURL = originalToDataURL.apply(this, args);
          return dataURL.slice(0, -3) + fp.canvas.noise;
        };

        // 硬件并发
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => fp.hardware.cores,
        });

        // 设备内存
        if (navigator.deviceMemory) {
          Object.defineProperty(navigator, 'deviceMemory', {
            get: () => fp.hardware.memory,
          });
        }

        // 屏幕信息
        Object.defineProperty(screen, 'width', {
          get: () => fp.screen.width,
        });
        Object.defineProperty(screen, 'height', {
          get: () => fp.screen.height,
        });
        Object.defineProperty(screen, 'colorDepth', {
          get: () => fp.screen.colorDepth,
        });
        Object.defineProperty(window, 'devicePixelRatio', {
          get: () => fp.screen.pixelRatio,
        });

        // 语言
        Object.defineProperty(navigator, 'languages', {
          get: () => [fp.locale, 'en-US', 'en'],
        });

        logger.debug(`Fingerprint scripts applied for ${fp.accountId}`);
      }, fingerprint);

      logger.info(`Fingerprint scripts applied for account ${fingerprint.accountId}`);

    } catch (error) {
      logger.error('Failed to apply fingerprint scripts:', error);
    }
  }

  /**
   * 应用反检测措施
   */
  async applyAntiDetection(context) {
    try {
      await context.addInitScript(() => {
        // 覆盖webdriver标识
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // Chrome特征
        window.chrome = {
          runtime: {},
        };

        // 权限API
        const originalQuery = navigator.permissions.query;
        navigator.permissions.query = (parameters) => {
          return parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
        };
      });

      logger.debug('Anti-detection measures applied');

    } catch (error) {
      logger.error('Failed to apply anti-detection:', error);
    }
  }

  /**
   * 获取Storage State路径
   */
  getStorageStatePath(accountId) {
    return path.join(this.config.dataDir, `${accountId}_state.json`);
  }

  /**
   * 保存Storage State
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

      logger.info(`Storage state saved for account ${accountId}`);

    } catch (error) {
      logger.error(`Failed to save storage state for account ${accountId}:`, error);
    }
  }

  /**
   * 创建新页面
   */
  async newPage(accountId, options = {}) {
    try {
      let context = this.contexts.get(accountId);

      // 检查 context 是否存在且有效
      if (context) {
        const isValid = await this.isBrowserContextValid(accountId);
        if (!isValid) {
          logger.warn(`Context invalid for account ${accountId}, recreating...`);
          await this.forceCleanupContext(accountId);
          context = null;
        }
      }

      // 如果没有 context 或 context 无效，创建新的
      if (!context) {
        context = await this.createContextForAccount(accountId, options);
      }

      const page = await context.newPage();
      logger.info(`New page created for account ${accountId}`);

      return page;

    } catch (error) {
      logger.error(`Failed to create page for account ${accountId}:`, error);

      // 如果是 "Target closed" 或 "Browser has been closed" 错误，尝试重新创建
      if (error.message.includes('closed') || error.message.includes('disconnected')) {
        logger.warn(`Browser closed detected, attempting to recreate context for account ${accountId}...`);
        try {
          await this.forceCleanupContext(accountId);
          const newContext = await this.createContextForAccount(accountId, options);
          const page = await newContext.newPage();
          logger.info(`Successfully recreated context and page for account ${accountId}`);
          return page;
        } catch (retryError) {
          logger.error(`Failed to recreate context for account ${accountId}:`, retryError);
          throw retryError;
        }
      }

      throw error;
    }
  }

  /**
   * 关闭账户的Context
   */
  async closeContext(accountId, saveState = true) {
    try {
      const context = this.contexts.get(accountId);
      if (!context) return;

      if (saveState) {
        await this.saveStorageState(accountId);
      }

      await context.close();
      this.contexts.delete(accountId);

      logger.info(`Context closed for account ${accountId}`);

    } catch (error) {
      logger.error(`Failed to close context for account ${accountId}:`, error);
    }
  }

  /**
   * 关闭账户的Browser
   */
  async closeBrowser(accountId) {
    try {
      // 先关闭Context
      await this.closeContext(accountId, true);

      // 关闭Browser
      const browser = this.browsers.get(accountId);
      if (browser) {
        await browser.close();
        this.browsers.delete(accountId);
        logger.info(`Browser closed for account ${accountId}`);
      }

    } catch (error) {
      logger.error(`Failed to close browser for account ${accountId}:`, error);
    }
  }

  /**
   * 关闭所有Browser实例
   */
  async closeAll() {
    logger.info('Closing all browsers...');

    const accountIds = Array.from(this.browsers.keys());
    for (const accountId of accountIds) {
      await this.closeBrowser(accountId);
    }

    logger.info('All browsers closed');
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const browsers = Array.from(this.browsers.entries()).map(([accountId, browser]) => {
      const context = this.contexts.get(accountId);
      return {
        accountId,
        isConnected: browser.isConnected(),
        pages: context ? context.pages().length : 0,
      };
    });

    return {
      totalBrowsers: this.browsers.size,
      totalContexts: this.contexts.size,
      browsers,
    };
  }

  // ============ 辅助方法 ============

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  seededRandom(seed) {
    let current = seed;
    return function() {
      current = (current * 9301 + 49297) % 233280;
      return current / 233280;
    };
  }

  randomUserAgent(random) {
    const versions = ['120.0.6099.109', '119.0.6045.123', '118.0.5993.88'];
    const version = versions[Math.floor(random() * versions.length)];
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  }

  randomViewport(random) {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 1680, height: 1050 },
      { width: 1440, height: 900 },
    ];
    return viewports[Math.floor(random() * viewports.length)];
  }

  randomWebGLVendor(random) {
    const vendors = ['Google Inc.', 'Intel Inc.', 'NVIDIA Corporation', 'AMD'];
    return vendors[Math.floor(random() * vendors.length)];
  }

  randomWebGLRenderer(random) {
    const renderers = [
      'ANGLE (Intel, Intel(R) UHD Graphics 630)',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti)',
      'ANGLE (AMD, AMD Radeon RX 580)',
      'ANGLE (NVIDIA GeForce RTX 3060 Ti)',
    ];
    return renderers[Math.floor(random() * renderers.length)];
  }

  generateCanvasNoise(random) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let noise = '';
    for (let i = 0; i < 3; i++) {
      noise += chars[Math.floor(random() * chars.length)];
    }
    return noise;
  }

  randomCPUCores(random) {
    const cores = [4, 6, 8, 12, 16];
    return cores[Math.floor(random() * cores.length)];
  }

  randomDeviceMemory(random) {
    const memories = [4, 8, 16, 32];
    return memories[Math.floor(random() * memories.length)];
  }

  randomScreenWidth(random) {
    const widths = [1920, 2560, 3840, 1680, 1440];
    return widths[Math.floor(random() * widths.length)];
  }

  randomScreenHeight(random) {
    const heights = [1080, 1440, 2160, 1050, 900];
    return heights[Math.floor(random() * heights.length)];
  }

  randomColorDepth(random) {
    return random() > 0.5 ? 24 : 30;
  }

  randomPixelRatio(random) {
    const ratios = [1, 1.25, 1.5, 2];
    return ratios[Math.floor(random() * ratios.length)];
  }

  randomLocale(random) {
    const locales = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
    return locales[Math.floor(random() * locales.length)];
  }

  randomTimezone(random) {
    const timezones = ['Asia/Shanghai', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
    return timezones[Math.floor(random() * timezones.length)];
  }

  randomFonts(random) {
    // 简化处理,返回字体列表
    return ['Arial', 'Helvetica', 'Times New Roman', 'Courier New'];
  }

  randomPlugins(random) {
    // 简化处理,返回插件数量
    return Math.floor(random() * 5) + 3;
  }
}

module.exports = BrowserManagerV2;
