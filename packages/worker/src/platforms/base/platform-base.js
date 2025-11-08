/**
 * Platform Base - 平台基类
 * 提供统一的平台接口和公共功能
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const path = require('path');
const fs = require('fs');
const { APIInterceptorManager } = require('./api-interceptor-manager');
const { DataPusher } = require('./data-pusher');

const logger = createLogger('platform-base');

class PlatformBase {
  constructor(config, workerBridge, browserManager) {
    this.config = config;
    this.bridge = workerBridge;
    this.browserManager = browserManager;
    this.accountSessions = new Map(); // accountId -> sessionData
    this.accountContexts = new Map(); // accountId -> context
    this.apiManagers = new Map(); // accountId -> APIInterceptorManager
    this.dataManagers = new Map(); // accountId -> AccountDataManager

    // 创建统一的 DataPusher 实例
    this.dataPusher = new DataPusher(workerBridge);
  }

  /**
   * 初始化平台
   * 注意：浏览器和上下文已经在 AccountInitializer 中初始化过了
   * 这里只需要初始化平台特定的组件（如 DataManager）
   * @param {Object} account - 账户对象
   */
  async initialize(account) {
    logger.info(`初始化 ${this.config.platform} 平台，账号 ${account.id}`);

    // 初始化平台特定的数据管理器
    await this.initializeDataManager(account.id);

    logger.info(`${this.config.platform} 平台初始化完成`);
  }

  /**
   * 初始化账户的数据管理器
   * 子类应该覆盖 createDataManager() 方法来创建平台特定的 DataManager
   * @param {string} accountId - 账户 ID
   */
  async initializeDataManager(accountId) {
    try {
      // 检查是否已经存在
      if (this.dataManagers.has(accountId)) {
        return this.dataManagers.get(accountId);
      }

      // 调用子类的工厂方法创建平台特定的 DataManager
      const dataManager = await this.createDataManager(accountId);

      if (!dataManager) {
        throw new Error('createDataManager() must return a valid DataManager instance');
      }

      // 保存到 Map
      this.dataManagers.set(accountId, dataManager);

      // 启动自动同步（如果配置了）
      if (dataManager.pushConfig.autoSync) {
        dataManager.startAutoSync();
      }

      logger.info(`DataManager 初始化完成 (账号 ${accountId})`);

      return dataManager;

    } catch (error) {
      logger.error(`初始化 DataManager 失败 (账号 ${accountId}): ${error.message}`);
      throw error;
    }
  }

  /**
   * 创建平台特定的 DataManager（由子类实现）
   * 子类应该覆盖此方法来返回平台特定的 DataManager 实例
   *
   * 示例：
   * async createDataManager(accountId) {
   *   const { DouyinDataManager } = require('./data-manager');
   *   return new DouyinDataManager(accountId, this.dataPusher);
   * }
   *
   * @param {string} accountId - 账户 ID
   * @returns {Promise<AccountDataManager>} DataManager 实例
   */
  async createDataManager(accountId) {
    throw new Error('createDataManager() must be implemented by subclass');
  }

  /**
   * 获取账户的 DataManager（懒加载，自动创建）
   * @param {string} accountId - 账户 ID
   * @returns {Promise<AccountDataManager>}
   */
  async getDataManager(accountId) {
    // 如果已存在，直接返回
    if (this.dataManagers.has(accountId)) {
      return this.dataManagers.get(accountId);
    }

    // 自动创建 DataManager
    console.log(`[DEBUG] Auto-creating DataManager for account ${accountId}...`);
    logger.info(`Auto-creating DataManager for account ${accountId}`);

    try {
      await this.initializeDataManager(accountId);
      return this.dataManagers.get(accountId);
    } catch (error) {
      logger.error(`Failed to auto-create DataManager for account ${accountId}:`, error);
      return null;
    }
  }

  /**
   * ⭐ 获取页面并自动注册 API 拦截器（框架级别）
   * 所有爬虫方法应使用此方法而不是直接调用 TabManager.getPageForTask
   *
   * @param {string} accountId - 账户 ID
   * @param {Object} options - 选项（同 TabManager.getPageForTask）
   * @returns {Promise<Object>} { tabId, page, shouldClose, release }
   */
  async getPageWithAPI(accountId, options = {}) {
    const { tag } = options;

    // 1. 获取或创建标签页
    const result = await this.browserManager.tabManager.getPageForTask(accountId, options);
    const { tabId, page } = result;

    // 2. 为该标签页注册 API 拦截器（如果尚未注册）
    const managerKey = `${accountId}_${tag}`;
    if (!this.apiManagers.has(managerKey)) {
      await this.setupAPIInterceptors(managerKey, page);
      logger.info(`🔌 API interceptors auto-setup for tab: ${tag} (key: ${managerKey})`);
    }

    return result;
  }

  /**
   * 启动登录流程（需要子类实现）
   * @param {string} accountId - 账户 ID
   * @param {string} sessionId - 登录会话 ID
   * @param {Object} proxyConfig - 代理配置
   */
  async startLogin(accountId, sessionId, proxyConfig) {
    throw new Error('startLogin must be implemented by subclass');
  }

  // ==================== 通用登录框架方法 ====================

  /**
   * 检测登录方式
   * 子类需要覆盖此方法以实现平台特定的检测逻辑
   * @param {Page} page - Playwright 页面对象
   * @returns {Object} { type: 'qrcode'|'sms'|'password'|'logged_in'|'unknown', element?, data? }
   */
  async detectLoginMethod(page) {
    throw new Error('detectLoginMethod must be implemented by subclass');
  }

  /**
   * 心跳检测登录状态（通用框架方法）
   * 所有平台都可以使用这个方法
   * @param {Page} page - Playwright 页面对象
   * @param {string} accountId - 账户 ID
   * @param {string} sessionId - 登录会话 ID
   * @param {Object} options - 配置选项
   * @returns {Promise<boolean>} 是否登录成功
   */
  async waitForLogin(page, accountId, sessionId, options = {}) {
    const {
      timeout = 300000,        // 默认5分钟超时
      checkInterval = 2000,    // 默认每2秒检查一次登录状态
      checkMethod = 'auto',    // 'auto' | 'element' | 'cookie' | 'url'
      qrSelector = null,       // 二维码选择器（用于监控变化）
      qrRefreshInterval = 3000, // 二维码刷新检查间隔（3秒）
    } = options;
    
    logger.info(`[Login Monitor] Starting for account ${accountId}, timeout: ${timeout}ms`);
    
    const startTime = Date.now();
    let lastStatus = null;
    let lastQrBase64 = null;  // 保存上次的二维码Base64用于对比
    let qrCheckCounter = 0;   // 二维码检查计数器
    
    return new Promise((resolve, reject) => {
      const checkTimer = setInterval(async () => {
        try {
          // 检查是否超时
          if (Date.now() - startTime > timeout) {
            clearInterval(checkTimer);
            this.sendLoginStatus(sessionId, 'timeout', {
              account_id: accountId,
              message: '登录超时，请重试',
            });
            reject(new Error('Login timeout'));
            return;
          }
          
          // 🆕 优化：每隔 qrRefreshInterval 检查二维码是否变化（使用高效的src比对）
          qrCheckCounter++;
          const shouldCheckQR = qrSelector && (qrCheckCounter * checkInterval >= qrRefreshInterval);

          if (shouldCheckQR) {
            qrCheckCounter = 0; // 重置计数器

            try {
              const qrElement = await page.$(qrSelector);

              if (qrElement) {
                // 🆕 改进v3：直接从浏览器canvas提取base64（无URL，完全离线）
                const qrBase64Data = await page.evaluate((selector) => {
                  const element = document.querySelector(selector);
                  if (!element) return null;

                  let base64String = null;

                  // 情况1: CANVAS 标签 - 直接转换为base64（推荐）
                  if (element.tagName === 'CANVAS') {
                    try {
                      base64String = element.toDataURL('image/png');
                    } catch (e) {
                      return null;
                    }
                  }
                  // 情况2: IMG 标签 - 只有当src已是base64时才使用，否则无效
                  else if (element.tagName === 'IMG') {
                    const src = element.src;
                    // 只接受已经是base64的src（以data:开头）
                    if (src && src.startsWith('data:image')) {
                      base64String = src;
                    }
                  }

                  if (base64String) {
                    // 计算hash用于快速对比（只用前300个字符作为指纹）
                    const hash = base64String.substring(0, 300);
                    return {
                      hash,
                      data: base64String, // 完整的 data:image/png;base64,...
                    };
                  }

                  return null;
                }, qrSelector);

                // 对比二维码base64是否变化
                if (qrBase64Data && lastQrBase64 && qrBase64Data.hash !== lastQrBase64.hash) {
                  logger.info(`[QR Monitor] 🔄 QR code change detected! Base64 hash changed`);
                  logger.info(`[QR Monitor] ⚠️  Sending updated QR code (base64) to client...`);

                  // 发送新的二维码到前端
                  // qrBase64Data.data 是完整的 data:image/png;base64,... 格式
                  // 可直接在 <img src="..."/> 中使用，或通过 Socket 发送给 Web 客户端
                  await this.sendLoginStatus(sessionId, 'qrcode_refreshed', {
                    account_id: accountId,
                    qr_code_data: qrBase64Data.data,
                    expires_at: Math.floor((Date.now() + 300000) / 1000),
                    message: '二维码已刷新',
                  });

                  lastQrBase64 = qrBase64Data;
                } else if (qrBase64Data && !lastQrBase64) {
                  // 首次记录hash
                  lastQrBase64 = qrBase64Data;
                }
              }
            } catch (qrError) {
              logger.warn(`[QR Monitor] Failed to check QR code:`, qrError.message);
            }
          }
          
          // 执行登录状态检查
          const loginStatus = await this.checkLoginStatus(page, checkMethod);
          
          if (loginStatus.isLoggedIn) {
            // 登录成功！
            clearInterval(checkTimer);

            logger.info(`[Login Monitor] Login successful for account ${accountId}`);

            // 🆕 确保导航到创作中心首页（如果当前不在）
            const currentUrl = page.url();
            if (!currentUrl.includes('/creator-micro/home') && !currentUrl.includes('/creator/')) {
              logger.info(`[Login Monitor] Navigating to creator center home page...`);
              try {
                await page.goto('https://creator.douyin.com/creator-micro/home', {
                  waitUntil: 'networkidle',
                  timeout: 10000
                });
                logger.info(`[Login Monitor] Navigation complete: ${page.url()}`);
              } catch (navError) {
                logger.warn(`[Login Monitor] Navigation to home page failed:`, navError.message);
                // 继续执行，不阻塞登录流程
              }
            }

            // 保存登录状态（Cookie、Storage）
            await this.saveLoginState(page, accountId);

            // 获取 Cookie 和指纹数据以发送到 Master
            const cookies = await page.context().cookies();
            const fingerprint = this.browserManager.getOrCreateFingerprintConfig(accountId);

            // 通知 Master → Admin Web (包含 Cookie、用户信息、指纹)
            this.sendLoginStatus(sessionId, 'success', {
              account_id: accountId,
              user_info: loginStatus.userInfo,
              cookies: cookies,  // 发送 Cookie 数组
              fingerprint: fingerprint,  // 发送指纹配置
              cookies_valid_until: Math.floor(Date.now() / 1000) + (86400 * 7), // 7天有效期
              timestamp: Date.now(),
            });

            logger.info(`[Login Monitor] Sent login success with ${cookies.length} cookies and fingerprint`);

            resolve(true);
            
          } else if (loginStatus.status !== lastStatus) {
            // 状态变化，通知前端
            lastStatus = loginStatus.status;
            
            if (loginStatus.status === 'scanning') {
              this.sendLoginStatus(sessionId, 'scanning', {
                account_id: accountId,
                message: '正在扫码中...',
              });
            } else if (loginStatus.status === 'expired') {
              clearInterval(checkTimer);
              this.sendLoginStatus(sessionId, 'expired', {
                account_id: accountId,
                message: '二维码已过期，请重新获取',
              });
              reject(new Error('QR code expired'));
            }
          }
          
        } catch (error) {
          logger.error(`[Login Monitor] Check failed for account ${accountId}:`, error);
          clearInterval(checkTimer);
          
          this.sendLoginStatus(sessionId, 'failed', {
            account_id: accountId,
            error_message: error.message,
          });
          
          reject(error);
        }
      }, checkInterval);
    });
  }

  /**
   * 检查登录状态的多种方法（通用框架方法）
   * 子类可以覆盖此方法以实现平台特定的检测逻辑
   * @param {Page} page - Playwright 页面对象
   * @param {string} method - 检测方法
   * @returns {Object} { isLoggedIn: boolean, status: string, userInfo? }
   */
  async checkLoginStatus(page, method = 'auto') {
    // 方法1: 检查特定元素（最常用）
    if (method === 'auto' || method === 'element') {
      const userInfo = await page.$('.user-info, .user-avatar, [data-e2e="user-info"]');
      if (userInfo) {
        const userData = await this.extractUserInfo(page);
        return { isLoggedIn: true, status: 'logged_in', userInfo: userData };
      }
    }
    
    // 方法2: 检查 Cookie
    if (method === 'auto' || method === 'cookie') {
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(c => 
        c.name.includes('session') || 
        c.name.includes('token') ||
        c.name.includes('sid')
      );
      
      if (sessionCookie && sessionCookie.value) {
        return { isLoggedIn: true, status: 'logged_in' };
      }
    }
    
    // 方法3: 检查 URL 变化
    if (method === 'auto' || method === 'url') {
      const currentUrl = page.url();
      if (!currentUrl.includes('/login') && !currentUrl.includes('/passport')) {
        // URL 不再是登录页，可能已登录
        const userInfo = await page.$('.user-info, .user-avatar');
        if (userInfo) {
          return { isLoggedIn: true, status: 'logged_in' };
        }
      }
    }
    
    // 方法4: 检查是否在扫码中
    const scanningHint = await page.$('.qr-scanning, .scan-success');
    if (scanningHint) {
      return { isLoggedIn: false, status: 'scanning' };
    }
    
    // 方法5: 检查是否过期
    const expiredHint = await page.$('.qr-expired, .expired-tip');
    if (expiredHint) {
      return { isLoggedIn: false, status: 'expired' };
    }
    
    return { isLoggedIn: false, status: 'pending' };
  }

  /**
   * 处理二维码登录（通用框架方法）
   * 子类可以覆盖或调用此方法
   * @param {Page} page - Playwright 页面对象
   * @param {string} accountId - 账户 ID
   * @param {string} sessionId - 登录会话 ID
   * @param {Object} options - 配置选项
   */
  async handleQRCodeLogin(page, accountId, sessionId, options = {}) {
    const { qrSelector = '.qrcode-img', expirySelector = null } = options;
    
    logger.info(`[QRCode Login] Starting for account ${accountId}`);
    logger.info(`[QRCode Login] Using selector: ${qrSelector}`);
    
    // 1. 等待二维码元素
    logger.info(`[QRCode Login] Waiting for QR element...`);
    const qrElement = await page.waitForSelector(qrSelector, { 
      timeout: 10000 
    });
    
    if (!qrElement) {
      throw new Error('QR code element not found');
    }
    
    logger.info(`[QRCode Login] QR element found, taking screenshot...`);
    
    // 2. 截取二维码图片
    const qrImage = await qrElement.screenshot();
    const qrBase64 = qrImage.toString('base64');
    
    logger.info(`[QRCode Login] QR image captured, size: ${qrBase64.length} chars`);
    
    // 3. 获取过期时间（如果页面有显示）
    let expiresAt = Date.now() + 300000; // 默认5分钟
    if (expirySelector) {
      try {
        const expiryText = await page.$eval(expirySelector, el => el.textContent);
        // 子类可以实现解析过期时间的逻辑
        expiresAt = this.parseExpiryTime(expiryText);
      } catch (e) {
        logger.warn('Failed to parse expiry time, using default 5 minutes');
      }
    }
    
    // 4. 发送二维码到 Master → Admin Web
    logger.info(`[QRCode Login] Sending QR code to Master...`);
    await this.sendLoginStatus(sessionId, 'qrcode_ready', {
      account_id: accountId,
      qr_code_data: `data:image/png;base64,${qrBase64}`,
      expires_at: Math.floor(expiresAt / 1000),
      login_method: 'qrcode',
    });
    
    logger.info(`[QRCode Login] QR code sent for account ${accountId}`);
    
    // 5. 启动二维码监控和登录监控（并行）
    logger.info(`[QRCode Login] Starting QR code monitoring and login monitoring...`);
    const loginSuccess = await this.waitForLogin(page, accountId, sessionId, {
      timeout: 300000, // 5分钟
      checkInterval: 2000, // 每2秒检查一次登录状态
      qrSelector,  // 传递二维码选择器用于监控变化
      qrRefreshInterval: 500,  // 🆕 极速刷新：每500ms检查一次二维码变化（响应延迟 < 600ms）
    });

    return loginSuccess;
  }

  /**
   * 处理短信验证码登录（通用框架方法）
   * 子类可以覆盖或调用此方法
   * @param {Page} page - Playwright 页面对象
   * @param {string} accountId - 账户 ID
   * @param {string} sessionId - 登录会话 ID
   * @param {Object} options - 配置选项
   */
  async handleSMSLogin(page, accountId, sessionId, options = {}) {
    logger.info(`[SMS Login] Starting for account ${accountId}`);
    
    const {
      phoneSelector = 'input[placeholder*="手机号"]',
      codeSelector = 'input[placeholder*="验证码"]',
      getSMSButtonSelector = 'button:has-text("获取验证码")',
      loginButtonSelector = 'button:has-text("登录")',
    } = options;
    
    // 1. 检测手机号输入框
    const phoneInput = await page.waitForSelector(phoneSelector);
    
    // 2. 通知 Web 端需要输入手机号
    await this.sendLoginStatus(sessionId, 'sms_input_required', {
      account_id: accountId,
      login_method: 'sms',
      step: 'phone_number',
      message: '请输入手机号',
    });
    
    // 3. 等待 Web 端用户输入手机号
    const phoneNumber = await this.waitForUserInput(sessionId, 'phone_number', {
      timeout: 120000, // 2分钟
    });
    
    // 4. 在页面输入手机号
    await phoneInput.fill(phoneNumber);
    
    // 5. 点击"获取验证码"按钮
    const getSMSButton = await page.$(getSMSButtonSelector);
    await getSMSButton.click();
    
    // 6. 等待验证码输入框出现
    await page.waitForSelector(codeSelector);
    
    // 7. 通知 Web 端需要输入验证码
    await this.sendLoginStatus(sessionId, 'sms_input_required', {
      account_id: accountId,
      login_method: 'sms',
      step: 'verification_code',
      message: `验证码已发送至 ${phoneNumber}`,
      phone_number: phoneNumber,
    });
    
    // 8. 等待 Web 端用户输入验证码
    const verificationCode = await this.waitForUserInput(sessionId, 'verification_code', {
      timeout: 120000,
    });
    
    // 9. 在页面输入验证码
    const codeInput = await page.$(codeSelector);
    await codeInput.fill(verificationCode);
    
    // 10. 点击"登录"按钮
    const loginButton = await page.$(loginButtonSelector);
    await loginButton.click();
    
    // 11. 等待登录成功
    const loginSuccess = await this.waitForLogin(page, accountId, sessionId, {
      timeout: 30000,
    });
    
    return loginSuccess;
  }

  /**
   * 等待用户输入（用于短信验证码等场景）
   * @param {string} sessionId - 登录会话 ID
   * @param {string} inputType - 输入类型
   * @param {Object} options - 配置选项
   * @returns {Promise<string>} 用户输入的值
   */
  async waitForUserInput(sessionId, inputType, options = {}) {
    const { timeout = 120000 } = options;
    
    return new Promise((resolve, reject) => {
      const timeoutTimer = setTimeout(() => {
        this.bridge.removeUserInputListener(sessionId, inputType);
        reject(new Error(`User input timeout for ${inputType}`));
      }, timeout);
      
      // 监听用户输入
      this.bridge.onUserInput(sessionId, inputType, (value) => {
        clearTimeout(timeoutTimer);
        resolve(value);
      });
    });
  }

  /**
   * 保存登录状态（Cookie、Storage）
   * @param {Page} page - Playwright 页面对象
   * @param {string} accountId - 账户 ID
   */
  async saveLoginState(page, accountId) {
    logger.info(`[Storage] Saving login state for account ${accountId}`);
    
    try {
      // 1. 保存 Storage State（包含 Cookies、LocalStorage、SessionStorage）
      const storageStatePath = this.getStorageStatePath(accountId);
      
      // 确保目录存在
      const storageDir = path.dirname(storageStatePath);
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      
      await page.context().storageState({ path: storageStatePath });
      
      logger.info(`[Storage] Saved storage state to ${storageStatePath}`);
      
      // 2. 提取用户信息（可选）
      const userInfo = await this.extractUserInfo(page);
      if (userInfo) {
        const userInfoPath = path.join(
          this.browserManager.config.dataDir,
          'user-info',
          `${accountId}_user.json`
        );
        
        // 确保目录存在
        const userInfoDir = path.dirname(userInfoPath);
        if (!fs.existsSync(userInfoDir)) {
          fs.mkdirSync(userInfoDir, { recursive: true });
        }
        
        fs.writeFileSync(userInfoPath, JSON.stringify(userInfo, null, 2));
        logger.info(`[Storage] Saved user info for account ${accountId}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`[Storage] Failed to save login state for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 提取用户信息
   * 子类应该覆盖此方法以实现平台特定的提取逻辑
   * @param {Page} page - Playwright 页面对象
   * @returns {Object} 用户信息
   */
  async extractUserInfo(page) {
    try {
      // 尝试从页面中提取用户信息（通用方法）
      const userInfo = await page.evaluate(() => {
        const avatar = document.querySelector('.user-avatar img, .avatar img')?.src;
        const nickname = document.querySelector('.user-nickname, .nickname, .username')?.textContent;
        const uid = document.querySelector('[data-user-id]')?.dataset.userId;
        
        return { avatar, nickname, uid };
      });
      
      return userInfo;
    } catch (error) {
      logger.warn('Failed to extract user info:', error);
      return null;
    }
  }

  /**
   * 解析过期时间
   * 子类可以覆盖此方法以实现平台特定的解析逻辑
   * @param {string} expiryText - 过期时间文本
   * @returns {number} 过期时间戳（毫秒）
   */
  parseExpiryTime(expiryText) {
    // 默认返回5分钟后
    return Date.now() + 300000;
  }

  /**
   * 爬取评论（需要子类实现）
   * @param {Object} account - 账户对象
   */
  async crawlComments(account) {
    throw new Error('crawlComments must be implemented by subclass');
  }

  /**
   * 爬取私信（需要子类实现）
   * @param {Object} account - 账户对象
   */
  async crawlDirectMessages(account) {
    throw new Error('crawlDirectMessages must be implemented by subclass');
  }

  /**
   * 回复评论（需要子类实现）
   * @param {string} accountId - 账户 ID
   * @param {Object} options - 回复选项
   *   - target_id: string - 被回复的评论 ID
   *   - reply_content: string - 回复内容
   *   - context: object - 上下文信息
   *   - browserManager: BrowserManager - 浏览器管理器
   * @returns {Promise<{platform_reply_id?: string, data?: object}>}
   */
  async replyToComment(accountId, options) {
    throw new Error('replyToComment must be implemented by subclass');
  }

  /**
   * 回复私信（需要子类实现）
   * @param {string} accountId - 账户 ID
   * @param {Object} options - 回复选项
   *   - target_id: string - 被回复的私信 ID
   *   - reply_content: string - 回复内容
   *   - context: object - 上下文信息
   *   - browserManager: BrowserManager - 浏览器管理器
   * @returns {Promise<{platform_reply_id?: string, data?: object}>}
   */
  async replyToDirectMessage(accountId, options) {
    throw new Error('replyToDirectMessage must be implemented by subclass');
  }

  /**
   * 清理资源
   * @param {string} accountId - 账户 ID
   */
  async cleanup(accountId) {
    logger.info(`Cleaning up resources for account ${accountId}`);

    // 清理 DataManager
    const dataManager = this.dataManagers.get(accountId);
    if (dataManager) {
      try {
        // 停止自动同步
        dataManager.stopAutoSync();
        // 执行最后一次同步
        await dataManager.syncAll();
        this.dataManagers.delete(accountId);
        logger.info(`Cleaned up DataManager for account ${accountId}`);
      } catch (error) {
        logger.error(`Failed to cleanup DataManager for account ${accountId}:`, error);
      }
    }

    // 清理 API 拦截器
    const apiManager = this.apiManagers.get(accountId);
    if (apiManager) {
      try {
        await apiManager.cleanup();
        this.apiManagers.delete(accountId);
        logger.info(`Cleaned up API interceptors for account ${accountId}`);
      } catch (error) {
        logger.error(`Failed to cleanup API interceptors for account ${accountId}:`, error);
      }
    }

    // 清理会话数据
    this.accountSessions.delete(accountId);

    // 关闭浏览器上下文
    const context = this.accountContexts.get(accountId);
    if (context) {
      try {
        await context.close();
        this.accountContexts.delete(accountId);
        logger.info(`Closed browser context for account ${accountId}`);
      } catch (error) {
        logger.error(`Failed to close context for account ${accountId}:`, error);
      }
    }
  }

  // ==================== 账户独立数据管理 ====================

  /**
   * 检查并确保账户的浏览器上下文有效
   * @param {string} accountId - 账户 ID
   * @param {Object} proxyConfig - 代理配置
   * @returns {Promise<BrowserContext>}
   */
  async ensureAccountContext(accountId, proxyConfig) {
    try {
      // 检查是否已有上下文
      let context = this.accountContexts.get(accountId);

      if (context) {
        // 检查上下文是否仍然有效
        const isValid = await this.browserManager.isBrowserContextValid(accountId);

        if (isValid) {
          logger.info(`Reusing existing valid context for account ${accountId}`);
          return context;
        } else {
          logger.warn(`Context invalid for account ${accountId}, recreating...`);
          this.accountContexts.delete(accountId);
        }
      }

      // 创建新的上下文
      logger.info(`Creating new context for account ${accountId}...`);
      context = await this.createAccountContext(accountId, proxyConfig);

      return context;
    } catch (error) {
      logger.error(`Failed to ensure context for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 创建账户专属的浏览器上下文
   * @param {string} accountId - 账户 ID
   * @param {Object} proxyConfig - 代理配置
   */
  async createAccountContext(accountId, proxyConfig) {
    try {
      // 使用 BrowserManager 创建上下文
      // BrowserManagerV2 的方法名是 createContextForAccount
      const context = await this.browserManager.createContextForAccount(accountId, {
        proxy: proxyConfig,
        storageState: this.getStorageStatePath(accountId),
      });

      this.accountContexts.set(accountId, context);
      logger.info(`Created browser context for account ${accountId}`);

      return context;
    } catch (error) {
      logger.error(`Failed to create context for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 获取账户的浏览器上下文
   * @param {string} accountId - 账户 ID
   */
  getAccountContext(accountId) {
    return this.accountContexts.get(accountId);
  }

  /**
   * 加载或生成账户专属的指纹配置
   * @param {string} accountId - 账户 ID
   */
  async loadAccountFingerprint(accountId) {
    try {
      // BrowserManager 会自动处理指纹
      // BrowserManagerV2 的方法名是 getOrCreateFingerprintConfig
      const fingerprint = await this.browserManager.getOrCreateFingerprintConfig(accountId);
      logger.info(`Loaded fingerprint for account ${accountId}`);
      return fingerprint;
    } catch (error) {
      logger.error(`Failed to load fingerprint for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 保存账户状态（Cookie 和存储）
   * @param {string} accountId - 账户 ID
   */
  async saveAccountState(accountId) {
    try {
      await this.browserManager.saveStorageState(accountId);
      logger.info(`Saved storage state for account ${accountId}`);
    } catch (error) {
      logger.error(`Failed to save state for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 获取或创建账户页面（统一的页面管理接口）
   * ⭐ 所有平台应该使用这个方法而不是自己创建页面
   *
   * 这个方法会：
   * 1. 检查是否已有页面在池中
   * 2. 如果没有，创建新页面
   * 3. 将页面保存到池中供后续使用
   * 4. 在失败时自动恢复
   *
   * @param {string} accountId - 账户 ID
   * @param {Object} options - 选项
   * @returns {Promise<Page>} Playwright 页面对象
   */
  async getAccountPage(accountId, options = {}) {
    try {
      // 使用 BrowserManager 的统一页面管理接口
      const page = await this.browserManager.getAccountPage(accountId, options);
      logger.info(`[PlatformBase] Got page for account ${accountId} from unified manager`);
      return page;
    } catch (error) {
      logger.error(`[PlatformBase] Failed to get page for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 获取存储状态文件路径
   * @param {string} accountId - 账户 ID
   */
  getStorageStatePath(accountId) {
    const dataDir = this.browserManager.config.dataDir;
    return path.join(dataDir, 'storage-states', `${accountId}_storage.json`);
  }

  /**
   * 获取账户指纹文件路径
   * @param {string} accountId - 账户 ID
   */
  getFingerprintPath(accountId) {
    const dataDir = this.browserManager.config.dataDir;
    return path.join(dataDir, 'fingerprints', `${accountId}_fingerprint.json`);
  }

  // ==================== 公共工具方法 ====================

  /**
   * 发送二维码到 Master
   * @param {string} sessionId - 登录会话 ID
   * @param {Object} qrCodeData - 二维码数据
   */
  async sendQRCode(sessionId, qrCodeData) {
    return await this.bridge.sendQRCode(sessionId, qrCodeData);
  }

  /**
   * 发送登录状态
   * @param {string} sessionId - 登录会话 ID
   * @param {string} status - 状态
   * @param {Object} data - 附加数据
   */
  async sendLoginStatus(sessionId, status, data = {}) {
    return await this.bridge.sendLoginStatus(sessionId, status, data);
  }

  /**
   * 上报错误
   * @param {string} sessionId - 登录会话 ID
   * @param {Error} error - 错误对象
   */
  async reportError(sessionId, error) {
    return await this.bridge.reportError(sessionId, error);
  }

  /**
   * 发送监控数据
   * @param {string} accountId - 账户 ID
   * @param {Array} comments - 评论数据
   * @param {Array} directMessages - 私信数据
   */
  async sendMonitorData(accountId, comments, directMessages) {
    return await this.bridge.sendMonitorData(accountId, comments, directMessages);
  }

  /**
   * 推送实时通知消息
   * @param {Object} notification - 通知对象
   * @param {string} notification.type - 通知类型: 'comment' | 'direct_message' | 'system' | 'account_status'
   * @param {string} notification.accountId - 关联账户 ID
   * @param {string} notification.title - 通知标题
   * @param {string} notification.content - 通知内容
   * @param {Object} notification.data - 附加数据 (评论/私信原始数据)
   * @param {string} notification.relatedId - 关联的评论/私信 ID
   * @param {string} notification.priority - 优先级: 'low' | 'normal' | 'high' | 'urgent'
   */
  async pushNotification(notification) {
    return await this.bridge.pushNotification(notification);
  }

  /**
   * 更新心跳统计
   * @param {Object} stats - 统计数据
   */
  async updateHeartbeat(stats) {
    return await this.bridge.updateHeartbeat(stats);
  }

  /**
   * 记录日志
   * @param {string} message - 日志消息
   * @param {string} level - 日志级别
   */
  log(message, level = 'info') {
    this.bridge.log(`[${this.config.platform}] ${message}`, level);
  }

  // ==================== 调试支持 ====================

  /**
   * 截图保存
   * @param {string} accountId - 账户 ID
   * @param {string} filename - 文件名
   */
  async takeScreenshot(accountId, filename) {
    try {
      const context = this.getAccountContext(accountId);
      if (context && context.pages().length > 0) {
        const page = context.pages()[0];
        const screenshotDir = path.join(this.browserManager.config.dataDir, 'screenshots');
        
        // 确保截图目录存在
        if (!fs.existsSync(screenshotDir)) {
          fs.mkdirSync(screenshotDir, { recursive: true });
        }
        
        const screenshotPath = path.join(screenshotDir, `${accountId}_${filename}`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        this.log(`Screenshot saved: ${screenshotPath}`);
        return screenshotPath;
      }
    } catch (error) {
      logger.error(`Failed to take screenshot for account ${accountId}:`, error);
    }
  }

  // ==================== API 拦截器管理 ====================

  /**
   * 为账户设置 API 拦截器
   * 子类应该在 registerAPIHandlers() 中注册自己的拦截器
   *
   * @param {string} accountId - 账户 ID
   * @param {Object} page - Playwright Page 对象
   */
  async setupAPIInterceptors(accountId, page) {
    // 如果已经为该账户创建了管理器，先清理
    if (this.apiManagers.has(accountId)) {
      const oldManager = this.apiManagers.get(accountId);
      await oldManager.cleanup();
    }

    // 创建新的管理器
    const manager = new APIInterceptorManager(page);

    // 调用子类的注册方法
    await this.registerAPIHandlers(manager, accountId);

    // 启用拦截器
    await manager.enable();

    // 保存管理器
    this.apiManagers.set(accountId, manager);

    logger.info(`API interceptors setup complete for account ${accountId}`);
  }

  /**
   * 注册 API 拦截器处理函数（子类实现）
   *
   * 示例：
   * async registerAPIHandlers(manager, accountId) {
   *   manager.register('** /api/path/**', async (body) => {
   *     // 处理逻辑
   *   });
   * }
   *
   * @param {APIInterceptorManager} manager - API 拦截器管理器
   * @param {string} accountId - 账户 ID
   */
  async registerAPIHandlers(manager, accountId) {
    // 默认不注册任何拦截器
    // 子类应该覆盖此方法来注册自己的拦截器
  }

  /**
   * 获取账户的 API 管理器
   * @param {string} accountId - 账户 ID
   * @returns {APIInterceptorManager|null}
   */
  getAPIManager(accountId) {
    return this.apiManagers.get(accountId) || null;
  }
}

module.exports = PlatformBase;
