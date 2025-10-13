/**
 * Douyin Crawler - Playwright Implementation
 *
 * 解决浏览器版本检测问题的实现方案
 */

const { chromium } = require('playwright');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('douyin-crawler-playwright');

/**
 * Douyin Crawler (Playwright版本)
 */
class DouyinCrawlerPlaywright {
  constructor(options = {}) {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.options = options;
  }

  /**
   * 初始化爬虫
   * @param {object} account - 账户对象
   */
  async initialize(account) {
    logger.info('Initializing Playwright Douyin crawler', {
      accountId: account.account_id,
      useProxy: !!this.options.proxy,
    });

    try {
      // 准备代理参数
      const proxyConfig = this.getProxyConfig(account);

      // 启动浏览器 - 关键配置来绕过检测
      const launchOptions = {
        headless: false, // 改为有头模式,抖音对无头模式检测严格
        args: [
          '--disable-blink-features=AutomationControlled', // 禁用自动化控制特征
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--start-maximized',
        ],
        ignoreDefaultArgs: ['--enable-automation'], // 忽略自动化标识
      };

      // 如果有代理配置,添加到启动选项(浏览器级别代理)
      if (proxyConfig && this.options.proxyLevel === 'browser') {
        launchOptions.proxy = proxyConfig;
        logger.info('Using browser-level proxy', {
          server: proxyConfig.server,
        });
      }

      this.browser = await chromium.launch(launchOptions);

      // 创建浏览器上下文 - 模拟真实用户
      const contextOptions = {
        viewport: { width: 1920, height: 1080 },
        userAgent: this.getRandomUserAgent(), // 使用真实UA
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        permissions: ['geolocation', 'notifications'],
        // 设置更真实的浏览器特征
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
      };

      // 如果有代理配置,添加到上下文选项(上下文级别代理 - 推荐)
      if (proxyConfig && this.options.proxyLevel !== 'browser') {
        contextOptions.proxy = proxyConfig;
        logger.info('Using context-level proxy', {
          server: proxyConfig.server,
        });
      }

      this.context = await this.browser.newContext(contextOptions);

      // 注入脚本移除webdriver等自动化特征
      await this.context.addInitScript(() => {
        // 删除 webdriver 标识
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // 覆盖 chrome 对象
        window.chrome = {
          runtime: {},
        };

        // 覆盖 permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);

        // 修改插件数量
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // 修改语言
        Object.defineProperty(navigator, 'languages', {
          get: () => ['zh-CN', 'zh', 'en'],
        });
      });

      // 创建页面
      this.page = await this.context.newPage();

      // 设置Cookie (如果有的话)
      if (account.credentials && account.credentials.cookies) {
        await this.setCookies(account.credentials.cookies);
      }

      logger.info('Playwright browser initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Playwright browser', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * 获取代理配置
   * @param {object} account - 账户对象
   * @returns {object|null} Playwright代理配置对象
   */
  getProxyConfig(account) {
    try {
      // 优先级1: 账户级别的代理配置
      if (account.proxy_config && account.proxy_config.server) {
        logger.info('Using account-level proxy', {
          accountId: account.account_id,
          server: account.proxy_config.server,
        });
        return this.normalizeProxyConfig(account.proxy_config);
      }

      // 优先级2: 全局代理配置(通过options传入)
      if (this.options.proxy && this.options.proxy.server) {
        logger.info('Using global proxy', {
          server: this.options.proxy.server,
        });
        return this.normalizeProxyConfig(this.options.proxy);
      }

      // 优先级3: 环境变量代理
      if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
        const proxyUrl =
          process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        logger.info('Using environment proxy', { proxyUrl });
        return this.normalizeProxyConfig({ server: proxyUrl });
      }

      // 没有代理配置
      return null;
    } catch (error) {
      logger.error('Failed to get proxy config', {
        error: error.message,
        accountId: account.account_id,
      });
      return null;
    }
  }

  /**
   * 标准化代理配置为Playwright格式
   * @param {object|string} proxyInput - 代理配置(对象或URL字符串)
   * @returns {object} Playwright代理配置对象
   */
  normalizeProxyConfig(proxyInput) {
    // 如果是字符串URL,解析为对象
    if (typeof proxyInput === 'string') {
      return { server: proxyInput };
    }

    // 已经是对象格式
    const config = {
      server: proxyInput.server,
    };

    // 添加认证信息(如果有)
    if (proxyInput.username) {
      config.username = proxyInput.username;
    }
    if (proxyInput.password) {
      config.password = proxyInput.password;
    }

    // 添加bypass列表(不走代理的域名)
    if (proxyInput.bypass) {
      config.bypass = proxyInput.bypass;
    }

    return config;
  }

  /**
   * 获取随机User-Agent (使用最新版本)
   * @returns {string}
   */
  getRandomUserAgent() {
    const userAgents = [
      // Chrome 120+ (2024最新版本)
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Edge 120+
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * 设置Cookies
   * @param {string|object} cookies - Cookie字符串或对象
   */
  async setCookies(cookies) {
    try {
      if (typeof cookies === 'string') {
        // 解析Cookie字符串
        const cookieArray = cookies.split(';').map((cookie) => {
          const [name, value] = cookie.trim().split('=');
          return {
            name,
            value,
            domain: '.douyin.com',
            path: '/',
          };
        });
        await this.context.addCookies(cookieArray);
      } else if (Array.isArray(cookies)) {
        await this.context.addCookies(cookies);
      }

      logger.info('Cookies set successfully');
    } catch (error) {
      logger.error('Failed to set cookies', { error: error.message });
    }
  }

  /**
   * 爬取评论
   * @param {object} account - 账户对象
   * @returns {Promise<Array>} 评论数据
   */
  async crawlComments(account) {
    logger.info('Crawling comments for account', {
      accountId: account.account_id,
    });

    try {
      // 访问抖音主页或消息页面
      const url = `https://www.douyin.com/user/${account.account_id}`;

      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // 等待页面加载
      await this.page.waitForTimeout(2000);

      // 检查是否需要登录
      const needLogin = await this.checkNeedLogin();
      if (needLogin) {
        logger.warn('Account needs login');
        throw new Error('需要登录账户');
      }

      // 导航到通知/评论页面
      await this.navigateToComments();

      // 提取评论数据
      const comments = await this.extractComments();

      logger.info('Comments crawled successfully', {
        count: comments.length,
      });

      return comments;
    } catch (error) {
      logger.error('Failed to crawl comments', {
        error: error.message,
        accountId: account.account_id,
      });
      throw error;
    }
  }

  /**
   * 检查是否需要登录
   * @returns {Promise<boolean>}
   */
  async checkNeedLogin() {
    try {
      // 检查登录按钮或登录框
      const loginButton = await this.page.$('text=登录');
      return !!loginButton;
    } catch (error) {
      return false;
    }
  }

  /**
   * 导航到评论页面
   */
  async navigateToComments() {
    try {
      // 点击消息/通知图标
      await this.page.click('text=消息', { timeout: 5000 });
      await this.page.waitForTimeout(1000);

      // 点击评论tab
      await this.page.click('text=评论', { timeout: 5000 });
      await this.page.waitForTimeout(1000);
    } catch (error) {
      logger.warn('Failed to navigate to comments page', {
        error: error.message,
      });
    }
  }

  /**
   * 提取评论数据
   * @returns {Promise<Array>}
   */
  async extractComments() {
    try {
      // 等待评论列表加载
      await this.page.waitForSelector('.comment-item, [class*="comment"]', {
        timeout: 5000,
      });

      // 提取评论
      const comments = await this.page.$$eval(
        '.comment-item, [class*="comment-list"] > div',
        (elements) => {
          return elements.map((el) => {
            // 提取评论信息 (需要根据实际DOM结构调整)
            const author = el.querySelector('[class*="author"], [class*="user-name"]')?.textContent || '';
            const content = el.querySelector('[class*="content"], [class*="text"]')?.textContent || '';
            const timeStr = el.querySelector('[class*="time"], [class*="date"]')?.textContent || '';

            return {
              platform_comment_id: `dy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              content: content.trim(),
              author_name: author.trim(),
              author_id: '', // 需要进一步提取
              post_id: '',
              post_title: '',
              detected_at: Math.floor(Date.now() / 1000),
            };
          }).filter((c) => c.content); // 过滤空内容
        }
      );

      return comments;
    } catch (error) {
      logger.warn('Failed to extract comments', { error: error.message });
      return [];
    }
  }

  /**
   * 爬取私信
   * @param {object} account - 账户对象
   * @returns {Promise<Array>} 私信数据
   */
  async crawlDirectMessages(account) {
    logger.info('Crawling direct messages for account', {
      accountId: account.account_id,
    });

    try {
      // 类似评论的实现逻辑
      // 这里简化处理,实际需要根据抖音的私信页面结构实现

      return [];
    } catch (error) {
      logger.error('Failed to crawl direct messages', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 清理资源
   */
  async cleanup() {
    logger.info('Cleaning up Playwright resources');

    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
    } catch (error) {
      logger.error('Failed to cleanup', { error: error.message });
    }
  }

  /**
   * 截图保存(用于调试)
   * @param {string} filename - 文件名
   */
  async screenshot(filename) {
    if (this.page) {
      await this.page.screenshot({
        path: `./screenshots/${filename}`,
        fullPage: true,
      });
      logger.info('Screenshot saved', { filename });
    }
  }
}

module.exports = DouyinCrawlerPlaywright;
