/**
 * DouyinLoginHandler - 抖音登录处理器
 * 负责自动化抖音登录流程：
 * 1. 打开登录页面
 * 2. 提取 QR 码并上报
 * 3. 轮询检测登录状态
 * 4. 保存登录凭证
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { ErrorClassifier, ErrorTypes, LoginError } = require('@hiscrm-im/shared/utils/error-handler');
const { RetryProfiles } = require('@hiscrm-im/shared/utils/retry-strategy');
const ProxyManager = require('./proxy-manager');

const logger = createLogger('douyin-login');

class DouyinLoginHandler {
  constructor(browserManager, socketClient) {
    this.browserManager = browserManager;
    this.socketClient = socketClient;

    // 登录会话管理 (accountId -> session)
    this.loginSessions = new Map();

    // 代理管理器
    this.proxyManager = new ProxyManager(browserManager);

    // 抖音 URLs
    this.DOUYIN_HOME = 'https://www.douyin.com/';

    // 超时配置
    this.QR_CODE_TIMEOUT = 30000; // 30秒等待 QR 码加载
    this.POPUP_WAIT_TIME = 5000; // 等待登录浮层弹出的时间
    this.LOGIN_CHECK_INTERVAL = 2000; // 2秒检查一次登录状态
    this.LOGIN_TIMEOUT = 300000; // 5分钟登录超时
    this.QR_CODE_LIFETIME = 150000; // 二维码有效期：2分30秒

    // 重试策略
    this.retryStrategies = {
      pageLoad: RetryProfiles.pageLoad(),
      elementSearch: RetryProfiles.elementSearch(),
      network: RetryProfiles.network(),
    };
  }

  /**
   * 启动登录流程
   * @param {string} accountId - 账户ID
   * @param {string} sessionId - 登录会话ID
   * @param {Object} proxyConfig - 代理配置（可选）
   * @returns {Promise<Object>} 登录结果
   */
  async startLogin(accountId, sessionId, proxyConfig = null) {
    try {
      logger.info(`Starting login for account ${accountId}, session ${sessionId}`);

      if (proxyConfig) {
        logger.info(`Using proxy: ${proxyConfig.server}`);
      }

      // 创建登录会话记录
      const session = {
        accountId,
        sessionId,
        status: 'pending',
        startTime: Date.now(),
        qrCodeGeneratedAt: null,      // 二维码生成时间
        qrCodeRefreshCount: 0,        // 二维码刷新次数
        maxQRCodeRefreshes: 3,        // 最大刷新次数
        page: null,
        qrCodeData: null,
        proxy: proxyConfig,
        pollInterval: null,
      };

      this.loginSessions.set(accountId, session);

      // 使用代理管理器创建页面（带降级策略）
      let page;
      if (proxyConfig) {
        try {
          // 使用降级策略创建上下文
          const { context, proxyUsed, fallbackLevel } = await this.proxyManager.createContextWithFallback(
            accountId,
            proxyConfig
          );

          // 保存实际使用的代理信息
          session.proxyUsed = proxyUsed;
          session.fallbackLevel = fallbackLevel;

          logger.info(`Using ${fallbackLevel} proxy: ${proxyUsed || 'none'}`);

          // 创建页面
          page = await context.newPage();
        } catch (proxyError) {
          logger.error('Failed to create context with proxy fallback:', proxyError);

          // 如果代理完全失败,尝试不使用代理
          logger.warn('Attempting direct connection as last resort');
          page = await this.browserManager.newPage(accountId, {});
          session.proxyUsed = null;
          session.fallbackLevel = 'emergency_direct';
        }
      } else {
        // 没有配置代理,直接创建页面
        page = await this.browserManager.newPage(accountId, {});
        session.proxyUsed = null;
        session.fallbackLevel = 'none';
      }

      session.page = page;

      // 监听页面事件
      this.setupPageListeners(page, accountId);

      // 打开抖音首页（带重试）
      await this.retryStrategies.pageLoad.retry(
        async () => {
          logger.info(`Navigating to Douyin homepage: ${this.DOUYIN_HOME}`);
          await page.goto(this.DOUYIN_HOME, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
        },
        { context: 'Page navigation' }
      );

      // 等待登录浮层弹出（根据用户反馈需要等待几秒）
      logger.info(`Waiting ${this.POPUP_WAIT_TIME}ms for login popup...`);
      await page.waitForTimeout(this.POPUP_WAIT_TIME);

      // 等待 QR 码加载（带重试）
      await this.retryStrategies.elementSearch.retry(
        async () => await this.waitForQRCode(page),
        { context: 'QR code detection' }
      );

      // 提取 QR 码（带重试）
      const qrCodeData = await this.retryStrategies.elementSearch.retry(
        async () => await this.extractQRCode(page, accountId, sessionId),
        { context: 'QR code extraction' }
      );
      session.qrCodeData = qrCodeData;
      session.qrCodeGeneratedAt = Date.now(); // 记录二维码生成时间
      session.status = 'scanning';

      // 开始轮询登录状态
      this.startLoginStatusPolling(accountId, sessionId);

      return {
        success: true,
        sessionId,
        status: 'scanning',
      };

    } catch (error) {
      // 分类错误
      const errorType = ErrorClassifier.classify(error);
      logger.error(`Failed to start login for account ${accountId} [${errorType}]:`, error);

      // 创建详细的错误对象
      const loginError = new LoginError(errorType, error.message, {
        accountId,
        sessionId,
        proxyUsed: proxyConfig ? proxyConfig.server : null,
      });

      // 通知 Master 登录失败（包含错误类型）
      this.notifyLoginFailed(accountId, sessionId, loginError.message, errorType);

      // 清理会话
      this.cleanupSession(accountId);

      throw loginError;
    }
  }

  /**
   * 设置页面事件监听器
   */
  setupPageListeners(page, accountId) {
    // 监听控制台输出（用于调试）
    page.on('console', (msg) => {
      logger.debug(`[Page Console] ${msg.type()}: ${msg.text()}`);
    });

    // 监听页面错误
    page.on('pageerror', (error) => {
      logger.error(`[Page Error] ${accountId}:`, error);
    });

    // 监听导航
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        logger.info(`Page navigated to: ${frame.url()}`);
      }
    });
  }

  /**
   * 点击登录按钮
   */
  async clickLoginButton(page) {
    try {
      logger.info('Looking for login button...');

      // 抖音登录按钮可能的选择器
      const loginButtonSelectors = [
        'text=登录',
        'button:has-text("登录")',
        '.login-button',
        '[class*="login"]',
        'a:has-text("登录")',
      ];

      // 尝试每个选择器
      for (const selector of loginButtonSelectors) {
        try {
          const button = await page.waitForSelector(selector, { timeout: 3000 });
          if (button) {
            await button.click();
            logger.info(`Clicked login button with selector: ${selector}`);
            await page.waitForTimeout(2000);
            return;
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      logger.warn('Login button not found, assuming already on login page');

    } catch (error) {
      logger.error('Failed to click login button:', error);
      throw error;
    }
  }

  /**
   * 等待 QR 码加载
   */
  async waitForQRCode(page) {
    try {
      logger.info('Waiting for QR code to load...');

      // 抖音 QR 码可能的选择器（基于用户反馈的实际页面结构）
      const qrCodeSelectors = [
        'img[alt="二维码"]',           // 精确匹配：用户反馈的选择器
        'img[aria-label="二维码"]',    // 精确匹配：ARIA 标签
        'img[src^="data:image/png"]',  // 匹配 base64 PNG 图片
        '.qrcode',
        '.qrcode-img',
        'canvas[class*="qr"]',
        'img[class*="qr"]',
        '[class*="QRCode"]',
        'img[alt*="二维码"]',
      ];

      // 尝试每个选择器
      for (const selector of qrCodeSelectors) {
        try {
          const element = await page.waitForSelector(selector, {
            timeout: 5000,
            state: 'visible',
          });
          if (element) {
            logger.info(`QR code found with selector: ${selector}`);
            return element;
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      throw new Error('QR code not found within timeout');

    } catch (error) {
      logger.error('Failed to find QR code:', error);
      throw error;
    }
  }

  /**
   * 提取 QR 码（截图并转 Base64）
   * @param {Page} page - Playwright 页面
   * @param {string} accountId - 账户ID
   * @param {string} sessionId - 会话ID
   * @returns {Promise<string>} Base64 编码的 QR 码图片
   */
  async extractQRCode(page, accountId, sessionId) {
    try {
      logger.info('Extracting QR code...');

      // 查找 QR 码元素（基于用户反馈的实际页面结构）
      const qrCodeSelectors = [
        'img[alt="二维码"]',           // 精确匹配：用户反馈的选择器
        'img[aria-label="二维码"]',    // 精确匹配：ARIA 标签
        'img[src^="data:image/png"]',  // 匹配 base64 PNG 图片
        '.qrcode',
        '.qrcode-img',
        'canvas[class*="qr"]',
        'img[class*="qr"]',
        '[class*="QRCode"]',
      ];

      let qrElement = null;
      for (const selector of qrCodeSelectors) {
        try {
          qrElement = await page.$(selector);
          if (qrElement) {
            logger.info(`Found QR element with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // 继续
        }
      }

      // 如果找不到特定元素，尝试截取整个登录区域
      if (!qrElement) {
        logger.warn('QR element not found, trying to find login container');
        const loginContainerSelectors = [
          '.login-container',
          '[class*="login"]',
          'main',
        ];

        for (const selector of loginContainerSelectors) {
          try {
            qrElement = await page.$(selector);
            if (qrElement) break;
          } catch (e) {}
        }
      }

      // 截取元素图片
      let screenshot;
      if (qrElement) {
        screenshot = await qrElement.screenshot({ type: 'png' });
        logger.info('QR code screenshot taken (element)');
      } else {
        // 最后手段：截取整个视口
        logger.warn('No specific element found, taking full page screenshot');
        screenshot = await page.screenshot({ type: 'png' });
      }

      // 转换为 Base64
      const qrCodeBase64 = screenshot.toString('base64');
      const qrCodeData = `data:image/png;base64,${qrCodeBase64}`;

      logger.info(`QR code extracted, size: ${qrCodeBase64.length} bytes`);

      // 上报 QR 码给 Master
      this.notifyQRCodeReady(accountId, sessionId, qrCodeData);

      return qrCodeData;

    } catch (error) {
      logger.error('Failed to extract QR code:', error);
      throw error;
    }
  }

  /**
   * 通知 Master QR 码已准备就绪
   */
  notifyQRCodeReady(accountId, sessionId, qrCodeData) {
    try {
      logger.info(`Sending QR code to Master for session ${sessionId}`);

      this.socketClient.emit('worker:login:qrcode:ready', {
        account_id: accountId,
        session_id: sessionId,
        qr_code_data: qrCodeData,
        timestamp: Date.now(),
      });

    } catch (error) {
      logger.error('Failed to notify QR code ready:', error);
    }
  }

  /**
   * 刷新二维码
   * @param {string} accountId - 账户ID
   * @param {string} sessionId - 会话ID
   */
  async refreshQRCode(accountId, sessionId) {
    try {
      logger.info(`Refreshing QR code for session ${sessionId}`);

      const session = this.loginSessions.get(accountId);
      if (!session) {
        throw new Error(`Session not found for account ${accountId}`);
      }

      // 1. 重新加载页面
      await session.page.reload({ waitUntil: 'domcontentloaded' });
      logger.info('Page reloaded for QR code refresh');

      // 2. 等待登录浮层弹出
      await session.page.waitForTimeout(this.POPUP_WAIT_TIME);

      // 3. 等待新二维码加载（带重试）
      await this.retryStrategies.elementSearch.retry(
        async () => await this.waitForQRCode(session.page),
        { context: 'QR code detection after refresh' }
      );

      // 4. 提取新二维码（带重试）
      const qrCodeData = await this.retryStrategies.elementSearch.retry(
        async () => await this.extractQRCode(session.page, accountId, sessionId),
        { context: 'QR code extraction after refresh' }
      );

      // 5. 更新会话信息
      session.qrCodeData = qrCodeData;
      session.qrCodeGeneratedAt = Date.now();
      session.qrCodeRefreshCount++;

      // 6. 通知 Master 二维码已刷新
      this.notifyQRCodeRefreshed(accountId, sessionId, qrCodeData);

      logger.info(`QR code refreshed successfully (count: ${session.qrCodeRefreshCount})`);

    } catch (error) {
      logger.error('Failed to refresh QR code:', error);
      throw error;
    }
  }

  /**
   * 通知 Master 二维码已刷新
   */
  notifyQRCodeRefreshed(accountId, sessionId, qrCodeData) {
    try {
      const session = this.loginSessions.get(accountId);

      this.socketClient.emit('worker:login:qrcode:refreshed', {
        account_id: accountId,
        session_id: sessionId,
        qr_code_data: qrCodeData,
        refresh_count: session ? session.qrCodeRefreshCount : 0,
        timestamp: Date.now(),
      });

      logger.info(`QR code refreshed notification sent for session ${sessionId} (count: ${session ? session.qrCodeRefreshCount : 0})`);

    } catch (error) {
      logger.error('Failed to notify QR code refreshed:', error);
    }
  }

  /**
   * 开始轮询登录状态
   */
  startLoginStatusPolling(accountId, sessionId) {
    const session = this.loginSessions.get(accountId);
    if (!session) {
      logger.warn(`No session found for account ${accountId}`);
      return;
    }

    logger.info(`Starting login status polling for session ${sessionId}`);

    const pollInterval = setInterval(async () => {
      try {
        const isLoggedIn = await this.checkLoginStatus(session.page);

        if (isLoggedIn) {
          // 登录成功
          clearInterval(pollInterval);
          await this.handleLoginSuccess(accountId, sessionId);
          return;
        }

        // 检查二维码是否过期（需要刷新）
        if (session.qrCodeGeneratedAt) {
          const qrCodeAge = Date.now() - session.qrCodeGeneratedAt;

          if (qrCodeAge > this.QR_CODE_LIFETIME) {
            // 二维码已过期
            if (session.qrCodeRefreshCount < session.maxQRCodeRefreshes) {
              // 尝试刷新二维码
              logger.info(`QR code expired (age: ${Math.floor(qrCodeAge / 1000)}s), refreshing...`);
              clearInterval(pollInterval);

              try {
                await this.refreshQRCode(accountId, sessionId);
                // 刷新成功后，重新开始轮询
                this.startLoginStatusPolling(accountId, sessionId);
              } catch (refreshError) {
                logger.error('Failed to refresh QR code:', refreshError);
                this.notifyLoginFailed(accountId, sessionId, 'QR code refresh failed', ErrorTypes.QR_CODE_EXPIRED);
                this.cleanupSession(accountId);
              }
              return;
            } else {
              // 超过最大刷新次数
              clearInterval(pollInterval);
              logger.error(`QR code refresh limit reached (${session.qrCodeRefreshCount} times)`);
              this.notifyLoginFailed(accountId, sessionId, 'QR code refresh limit exceeded', ErrorTypes.QR_CODE_EXPIRED);
              this.cleanupSession(accountId);
              return;
            }
          }
        }

        // 检查总登录超时
        const elapsed = Date.now() - session.startTime;
        if (elapsed > this.LOGIN_TIMEOUT) {
          clearInterval(pollInterval);
          logger.error(`Login timeout for session ${sessionId} (elapsed: ${Math.floor(elapsed / 1000)}s)`);
          this.notifyLoginFailed(accountId, sessionId, 'Login timeout', ErrorTypes.LOGIN_TIMEOUT);
          this.cleanupSession(accountId);
        }

      } catch (error) {
        clearInterval(pollInterval);
        const errorType = ErrorClassifier.classify(error);
        logger.error(`Error during login status polling [${errorType}]:`, error);
        this.notifyLoginFailed(accountId, sessionId, error.message, errorType);
        this.cleanupSession(accountId);
      }
    }, this.LOGIN_CHECK_INTERVAL);

    // 保存 interval ID 以便后续清理
    session.pollInterval = pollInterval;
  }

  /**
   * 检查登录状态
   * @param {Page} page - Playwright 页面
   * @returns {Promise<boolean>} 是否已登录
   */
  async checkLoginStatus(page) {
    try {
      const url = page.url();

      // 检查 URL 是否跳转（登录成功通常会跳转）
      if (url !== this.DOUYIN_HOME && !url.includes('login')) {
        logger.info('URL changed, likely logged in');
        return true;
      }

      // 检查是否有用户信息元素
      const userInfoSelectors = [
        '.user-info',
        '.avatar',
        '[class*="user"]',
        '[class*="profile"]',
      ];

      for (const selector of userInfoSelectors) {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            logger.info('User info element found, logged in');
            return true;
          }
        }
      }

      // 检查 cookies 中是否有 sessionid 或 token
      const cookies = await page.context().cookies();
      const hasSessionCookie = cookies.some(
        (cookie) => cookie.name.includes('session') || cookie.name.includes('token')
      );

      if (hasSessionCookie) {
        logger.info('Session cookie found, likely logged in');
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Error checking login status:', error);
      return false;
    }
  }

  /**
   * 处理登录成功
   */
  async handleLoginSuccess(accountId, sessionId) {
    try {
      logger.info(`Login successful for account ${accountId}, session ${sessionId}`);

      const session = this.loginSessions.get(accountId);
      if (!session) return;

      // 保存 storage state（包含 cookies 和 localStorage）
      await this.browserManager.saveStorageState(accountId);

      // 获取 cookies 信息
      const cookies = await session.page.context().cookies();
      const cookiesValidUntil = this.calculateCookiesExpiry(cookies);

      // 通知 Master 登录成功
      this.notifyLoginSuccess(accountId, sessionId, cookies, cookiesValidUntil);

      // 更新会话状态
      session.status = 'success';

      // 清理会话（但保留 context）
      this.cleanupSession(accountId, false);

    } catch (error) {
      logger.error('Error handling login success:', error);
    }
  }

  /**
   * 计算 Cookies 过期时间
   */
  calculateCookiesExpiry(cookies) {
    if (!cookies || cookies.length === 0) {
      // 默认 7 天
      return Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    }

    // 找到最晚的 expires 时间
    const expiryTimes = cookies
      .filter((c) => c.expires && c.expires > 0)
      .map((c) => c.expires);

    if (expiryTimes.length === 0) {
      return Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    }

    return Math.max(...expiryTimes);
  }

  /**
   * 通知 Master 登录成功
   */
  notifyLoginSuccess(accountId, sessionId, cookies, cookiesValidUntil) {
    try {
      this.socketClient.emit('worker:login:success', {
        account_id: accountId,
        session_id: sessionId,
        cookies_valid_until: cookiesValidUntil,
        timestamp: Date.now(),
      });

      logger.info(`Login success notification sent for session ${sessionId}`);

    } catch (error) {
      logger.error('Failed to notify login success:', error);
    }
  }

  /**
   * 通知 Master 登录失败
   */
  notifyLoginFailed(accountId, sessionId, errorMessage, errorType = 'unknown_error') {
    try {
      this.socketClient.emit('worker:login:failed', {
        account_id: accountId,
        session_id: sessionId,
        error_message: errorMessage,
        error_type: errorType,
        timestamp: Date.now(),
      });

      logger.info(`Login failed notification sent for session ${sessionId} [${errorType}]`);

    } catch (error) {
      logger.error('Failed to notify login failed:', error);
    }
  }

  /**
   * 清理登录会话
   * @param {string} accountId - 账户ID
   * @param {boolean} closeContext - 是否关闭浏览器上下文
   */
  async cleanupSession(accountId, closeContext = true) {
    try {
      const session = this.loginSessions.get(accountId);
      if (!session) return;

      // 停止轮询
      if (session.pollInterval) {
        clearInterval(session.pollInterval);
      }

      // 关闭页面
      if (session.page && !session.page.isClosed()) {
        await session.page.close();
      }

      // 关闭上下文（可选）
      if (closeContext) {
        await this.browserManager.closeContext(accountId, false);
      }

      // 删除会话记录
      this.loginSessions.delete(accountId);

      logger.info(`Session cleaned up for account ${accountId}`);

    } catch (error) {
      logger.error('Error cleaning up session:', error);
    }
  }

  /**
   * 取消登录
   */
  async cancelLogin(accountId) {
    logger.info(`Cancelling login for account ${accountId}`);
    await this.cleanupSession(accountId, true);
  }

  /**
   * 获取登录会话状态
   */
  getSessionStatus(accountId) {
    const session = this.loginSessions.get(accountId);
    return session ? session.status : null;
  }
}

module.exports = DouyinLoginHandler;
