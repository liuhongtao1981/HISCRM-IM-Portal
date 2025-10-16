/**
 * Douyin Platform - 抖音平台脚本
 * 基于现有 DouyinLoginHandler 重构为平台模式
 */

const PlatformBase = require('../base/platform-base');
const DouyinLoginHandler = require('../../browser/douyin-login-handler');
const DouyinCrawler = require('../../crawlers/douyin-crawler');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('douyin-platform');

class DouyinPlatform extends PlatformBase {
  constructor(config, workerBridge, browserManager) {
    super(config, workerBridge, browserManager);
    
    // 复用现有的登录处理器（传入 bridge 的 socket）
    this.loginHandler = new DouyinLoginHandler(browserManager, workerBridge.socket);
    
    // 复用现有的爬虫
    this.crawler = new DouyinCrawler();
  }

  /**
   * 初始化平台
   * @param {Object} account - 账户对象
   */
  async initialize(account) {
    logger.info(`Initializing Douyin platform for account ${account.id}`);
    
    // 调用基类初始化（创建上下文、加载指纹）
    await super.initialize(account);
    
    // 初始化爬虫
    await this.crawler.initialize(account);
    
    logger.info(`Douyin platform initialized for account ${account.id}`);
  }

  /**
   * 启动登录流程
   * 使用通用登录框架，支持二维码和手机短信验证
   * @param {Object} options - 登录选项
   * @param {string} options.accountId - 账户 ID
   * @param {string} options.sessionId - 登录会话 ID
   * @param {Object} options.proxy - 代理配置
   */
  async startLogin(options) {
    const { accountId, sessionId, proxy } = options;

    try {
      logger.info(`Starting Douyin login for account ${accountId}, session ${sessionId}`);

      // 1. 确保账户的浏览器上下文有效（自动检测并重启）
      const context = await this.ensureAccountContext(accountId, proxy);

      // 2. 创建新页面
      const page = await context.newPage();
      
      // 3. 访问抖音创作者中心登录页
      logger.info('Navigating to Douyin Creator Center...');
      await page.goto('https://creator.douyin.com/', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // 等待页面加载完成
      await page.waitForTimeout(2000);
      
      // 截取登录页面以便调试
      logger.info('Taking screenshot of login page for debugging...');
      await this.takeScreenshot(accountId, `login_page_${Date.now()}.png`);
      
      // 4. 检测登录方式
      logger.info('Detecting login method...');
      const loginMethod = await this.detectLoginMethod(page);
      
      logger.info(`Login method detected: ${loginMethod.type}`, JSON.stringify(loginMethod));
      
      // 5. 根据登录方式处理
      if (loginMethod.type === 'logged_in') {
        // 已经登录，直接返回成功
        logger.info(`Account ${accountId} already logged in`);
        
        const userInfo = await this.extractUserInfo(page);
        await this.sendLoginStatus(sessionId, 'success', {
          account_id: accountId,
          user_info: userInfo,
          message: '账户已登录',
        });
        
        return { status: 'success', userInfo };
      }
      
      if (loginMethod.type === 'qrcode') {
        // 二维码登录
        logger.info('Using QR code login method');
        logger.info(`QR selector: ${loginMethod.selector}`);
        return await this.handleQRCodeLogin(page, accountId, sessionId, {
          qrSelector: loginMethod.selector,
          expirySelector: loginMethod.expirySelector,
        });
      }
      
      if (loginMethod.type === 'sms') {
        // 手机短信验证码登录
        logger.info('Using SMS verification login method');
        return await this.handleSMSLogin(page, accountId, sessionId, {
          phoneSelector: loginMethod.phoneSelector,
          codeSelector: loginMethod.codeSelector,
          getSMSButtonSelector: loginMethod.getSMSButtonSelector,
          loginButtonSelector: loginMethod.loginButtonSelector,
        });
      }
      
      // 未知登录方式
      throw new Error(`Unsupported login method: ${loginMethod.type}`);
      
    } catch (error) {
      logger.error(`Douyin login failed for account ${accountId}:`, error);
      
      // 保存错误截图
      await this.takeScreenshot(accountId, `login_error_${Date.now()}.png`);
      
      // 上报错误到 Master
      await this.sendLoginStatus(sessionId, 'failed', {
        account_id: accountId,
        error_message: error.message,
      });
      
      throw error;
    }
  }

  /**
   * 检测抖音创作者中心的登录方式
   * 优先级：已登录 > 二维码 > 手机短信
   * @param {Page} page - Playwright 页面对象
   * @returns {Object} 登录方式信息
   */
  async detectLoginMethod(page) {
    try {
      logger.info('Checking if already logged in...');
      
      // 1. 检查当前 URL（如果已经在首页，说明已登录）
      const currentUrl = page.url();
      if (currentUrl.includes('/creator-micro/home')) {
        logger.info('User already logged in (on home page)');
        return { type: 'logged_in' };
      }
      
      // 2. 检查是否已登录（只检测页面顶部导航栏的用户头像，避免误判）
      const avatarSelectors = [
        '#header-avatar > div',  // 抖音创作者中心实测选择器（2025年10月）- 顶部导航栏
        '#header-avatar',        // 顶部导航栏头像容器
        'header [class*="avatar"]',  // 在 header 标签内的头像
        '.header [class*="avatar"]', // 在 header 类内的头像
        // 不再使用通用的 [class*="avatar"]，因为会匹配到页面内容中的装饰性头像
      ];
      
      for (const selector of avatarSelectors) {
        const userAvatar = await page.$(selector);
        if (userAvatar) {
          const isVisible = await userAvatar.isVisible();
          if (isVisible) {
            logger.info(`User already logged in (found avatar: ${selector})`);
            return { type: 'logged_in' };
          }
        }
      }
      
      // 3. 等待登录模块加载
      await page.waitForTimeout(1000);
      
      // 4. 优先检查二维码登录
      logger.info('Checking for QR code login...');
      const qrCodeSelectors = [
        // 抖音创作者中心精确选择器（2025年10月实测）
        '#animate_qrcode_container > div[class*="qrcode"] > img',  // 使用属性选择器匹配动态类名
        '#animate_qrcode_container img',
        // 通用二维码选择器（备用）
        'img[class*="qrcode"]',
        'img[alt*="二维码"]',
        'canvas[class*="qrcode"]',
        '.qrcode-image',
        '.login-qrcode img',
        '[class*="qr-code"] img',
      ];
      
      for (const selector of qrCodeSelectors) {
        logger.debug(`Trying QR selector: ${selector}`);
        const qrElement = await page.$(selector);
        if (qrElement) {
          logger.debug(`QR element found with selector: ${selector}`);
          // 检查元素是否可见
          const isVisible = await qrElement.isVisible();
          logger.debug(`QR element visible: ${isVisible}`);
          if (isVisible) {
            logger.info(`✅ QR code found with selector: ${selector}`);
            
            // 查找过期时间提示（可选）
            const expirySelector = await page.$('.qrcode-expire, [class*="expire-tip"]');
            
            return { 
              type: 'qrcode', 
              selector,
              expirySelector: expirySelector ? '.qrcode-expire, [class*="expire-tip"]' : null,
            };
          }
        } else {
          logger.debug(`QR element NOT found with selector: ${selector}`);
        }
      }
      
      // 4. 检查是否有切换到二维码登录的按钮
      logger.info('Checking for QR code switch button...');
      const qrSwitchSelectors = [
        // 抖音创作者中心可能的切换按钮
        'text=二维码登录',
        'text=扫码登录',
        'button:has-text("二维码登录")',
        'button:has-text("扫码登录")',
        '[class*="qrcode-tab"]',
        '[class*="scan-login"]',
        '.tab-qrcode',
      ];
      
      for (const selector of qrSwitchSelectors) {
        try {
          const switchBtn = await page.$(selector);
          if (switchBtn) {
            const isVisible = await switchBtn.isVisible();
            if (isVisible) {
              logger.info(`Found QR code switch button: ${selector}`);
              // 点击切换到二维码登录
              await switchBtn.click();
              await page.waitForTimeout(1000);
              
              // 重新检查二维码
              for (const qrSelector of qrCodeSelectors) {
                const qrElement = await page.$(qrSelector);
                if (qrElement && await qrElement.isVisible()) {
                  logger.info('Switched to QR code login successfully');
                  return { 
                    type: 'qrcode', 
                    selector: qrSelector,
                  };
                }
              }
            }
          }
        } catch (e) {
          // 继续尝试其他选择器
        }
      }
      
      // 5. 检查手机短信登录
      logger.info('Checking for SMS login...');
      const phoneInputSelectors = [
        'input[placeholder*="手机号"]',
        'input[placeholder*="手机"]',
        'input[type="tel"]',
        'input[name="mobile"]',
        'input[name="phone"]',
      ];
      
      for (const selector of phoneInputSelectors) {
        const phoneInput = await page.$(selector);
        if (phoneInput) {
          const isVisible = await phoneInput.isVisible();
          if (isVisible) {
            logger.info(`SMS login found with phone selector: ${selector}`);
            
            // 查找验证码输入框
            const codeSelector = 'input[placeholder*="验证码"], input[name="code"]';
            
            // 查找获取验证码按钮
            const getSMSButtonSelectors = [
              'button:has-text("获取验证码")',
              'button:has-text("发送验证码")',
              '[class*="send-code"]',
            ];
            
            let getSMSButtonSelector = null;
            for (const btnSelector of getSMSButtonSelectors) {
              const btn = await page.$(btnSelector);
              if (btn) {
                getSMSButtonSelector = btnSelector;
                break;
              }
            }
            
            // 查找登录按钮
            const loginButtonSelectors = [
              'button:has-text("登录")',
              'button[type="submit"]',
              '[class*="login-button"]',
            ];
            
            let loginButtonSelector = null;
            for (const btnSelector of loginButtonSelectors) {
              const btn = await page.$(btnSelector);
              if (btn) {
                loginButtonSelector = btnSelector;
                break;
              }
            }
            
            return {
              type: 'sms',
              phoneSelector: selector,
              codeSelector,
              getSMSButtonSelector,
              loginButtonSelector,
            };
          }
        }
      }
      
      // 6. 未找到支持的登录方式
      logger.warn('No supported login method found');
      
      // 保存截图用于调试
      await page.screenshot({ 
        path: `./logs/unknown_login_page_${Date.now()}.png`,
        fullPage: true 
      });
      
      return { type: 'unknown' };
      
    } catch (error) {
      logger.error('Failed to detect login method:', error);
      throw error;
    }
  }

  /**
   * 检查抖音登录状态（覆盖基类方法）
   * @param {Page} page - Playwright 页面对象
   * @param {string} method - 检测方法
   * @returns {Object} 登录状态
   */
  async checkLoginStatus(page, method = 'auto') {
    try {
      const currentUrl = page.url();
      logger.debug(`[checkLoginStatus] Current URL: ${currentUrl}`);
      
      // 如果不在创作者中心页面，尝试导航到首页来验证登录状态
      if (!currentUrl.includes('/creator-micro/home') && !currentUrl.includes('/creator/')) {
        logger.debug('[checkLoginStatus] Not on creator page, navigating to home page to check login...');
        
        try {
          // 尝试导航到首页（如果已登录会成功，如果未登录会被重定向到登录页）
          await page.goto('https://creator.douyin.com/creator-micro/home', {
            waitUntil: 'networkidle',
            timeout: 10000
          });
          
          // 等待页面加载
          await page.waitForTimeout(1000);
          
          const newUrl = page.url();
          logger.debug(`[checkLoginStatus] After navigation, URL: ${newUrl}`);
          
          // 如果被重定向回登录页，说明未登录
          if (newUrl.includes('/login') || !newUrl.includes('/creator')) {
            logger.debug('[checkLoginStatus] Redirected to login page - not logged in yet');
            return { isLoggedIn: false, status: 'pending' };
          }
          
        } catch (error) {
          logger.warn('[checkLoginStatus] Navigation failed (may still be on login page):', error.message);
          return { isLoggedIn: false, status: 'pending' };
        }
      }
      
      // 方法1: 检查是否在创作者中心首页
      if (currentUrl.includes('/creator-micro/home') || page.url().includes('/creator-micro/home')) {
        logger.debug('[checkLoginStatus] On creator home page, checking page content...');
        
        // 最可靠的判断：检查"抖音号："文本（只有登录后才会显示）
        const pageText = await page.textContent('body');
        if (pageText && pageText.includes('抖音号：')) {
          logger.info('✅ [checkLoginStatus] Login successful - found "抖音号：" text on page');
          
          // 提取用户信息
          const userInfo = await this.extractUserInfo(page);
          if (userInfo && userInfo.douyin_id) {
            logger.info(`[checkLoginStatus] User: ${userInfo.nickname} (抖音号: ${userInfo.douyin_id})`);
          }
          
          return { isLoggedIn: true, status: 'logged_in', userInfo };
        }
        
        logger.warn('[checkLoginStatus] On home page but "抖音号：" text not found - may still be loading');
        return { isLoggedIn: false, status: 'pending' };
      }
      
      // 方法2: 检查其他创作者页面（非登录页）
      const finalUrl = page.url();
      if (finalUrl.includes('/creator/') && !finalUrl.includes('/login')) {
        logger.info('✅ [checkLoginStatus] Login successful - on creator page (not login)');
        const userInfo = await this.extractUserInfo(page);
        return { isLoggedIn: true, status: 'logged_in', userInfo };
      }
      
      logger.debug('[checkLoginStatus] URL check: still on login page or redirecting');

      
      // 方法4: 检查是否在扫码中
      logger.debug('[checkLoginStatus] Checking scanning status...');
      const scanningHint = await page.$('[class*="scan"], [class*="scanning"]');
      if (scanningHint) {
        logger.debug('[checkLoginStatus] Status: scanning');
        return { isLoggedIn: false, status: 'scanning' };
      }
      
      // 方法5: 检查二维码是否过期
      logger.debug('[checkLoginStatus] Checking QR code expiration...');
      const expiredHint = await page.$('[class*="expire"], [class*="invalid"]');
      if (expiredHint) {
        const text = await expiredHint.textContent();
        logger.debug(`[checkLoginStatus] Found expiry element with text: ${text}`);
        if (text.includes('过期') || text.includes('失效')) {
          logger.warn('[checkLoginStatus] Status: QR code expired');
          return { isLoggedIn: false, status: 'expired' };
        }
      }
      
      logger.debug('[checkLoginStatus] Status: pending (waiting for user action)');
      return { isLoggedIn: false, status: 'pending' };
      
    } catch (error) {
      logger.error('Failed to check login status:', error);
      return { isLoggedIn: false, status: 'error', error: error.message };
    }
  }

  /**
   * 提取抖音用户信息（覆盖基类方法）
   * @param {Page} page - Playwright 页面对象
   * @returns {Object} 用户信息
   */
  async extractUserInfo(page) {
    try {
      logger.debug('[extractUserInfo] Extracting user information from page...');
      
      const userInfo = await page.evaluate(() => {
        // 1. 提取抖音号（最可靠）- 从 HTML 结构: <div class="unique_id-EuH8eA">抖音号：1864722759</div>
        const douyinIdElement = document.querySelector('[class*="unique_id"]');
        let douyinId = null;
        if (douyinIdElement) {
          const text = douyinIdElement.textContent || '';
          // 从 "抖音号：1864722759" 中提取数字
          const match = text.match(/抖音号[：:]\s*(\S+)/);
          if (match) {
            douyinId = match[1].trim();
          }
        }
        
        // 2. 提取用户昵称 - 从 HTML 结构: <div class="name-_lSSDc">苏苏</div>
        const nicknameSelectors = [
          '[class*="name-"]',          // name-_lSSDc (最精确)
          '[class*="nickname"]',
          '[class*="user-name"]',
          '.username',
        ];
        let nickname = null;
        for (const selector of nicknameSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            const text = element.textContent.trim();
            // 排除"抖音号："等非昵称文本
            if (text && !text.includes('抖音号') && !text.includes('关注') && !text.includes('粉丝')) {
              nickname = text;
              break;
            }
          }
        }
        
        // 3. 提取用户头像 - 从 HTML 结构: <div class="avatar-XoPjK6"><img class="img-PeynF_" src="...">
        const avatarSelectors = [
          '[class*="avatar"] img',     // avatar-XoPjK6
          '.img-PeynF_',               // 抖音特定的图片class
          '#header-avatar img',
        ];
        let avatar = null;
        for (const selector of avatarSelectors) {
          const element = document.querySelector(selector);
          if (element && element.src) {
            avatar = element.src;
            break;
          }
        }
        
        // 4. 提取粉丝数和关注数（可选）
        let followers = null;
        let following = null;
        
        const fansElement = document.querySelector('#guide_home_fans [class*="number"]');
        if (fansElement) {
          followers = fansElement.textContent.trim();
        }
        
        const followingElement = document.querySelector('#guide_home_following [class*="number"]');
        if (followingElement) {
          following = followingElement.textContent.trim();
        }
        
        // 5. 提取个性签名（可选）
        let signature = null;
        const signatureElement = document.querySelector('[class*="signature"]');
        if (signatureElement) {
          signature = signatureElement.textContent.trim();
        }
        
        return { 
          avatar, 
          nickname, 
          uid: douyinId,           // 使用抖音号作为 UID
          douyin_id: douyinId,     // 抖音号
          followers,               // 粉丝数
          following,               // 关注数
          signature,               // 个性签名
        };
      });
      
      logger.info('[extractUserInfo] Extracted user info:', {
        nickname: userInfo.nickname,
        douyin_id: userInfo.douyin_id,
        followers: userInfo.followers,
        has_avatar: !!userInfo.avatar,
      });
      
      return userInfo;
      
    } catch (error) {
      logger.warn('Failed to extract user info:', error);
      return null;
    }
  }

  /**
   * 爬取评论
   * @param {Object} account - 账户对象
   * @returns {Promise<Array>} 评论数据
   */
  async crawlComments(account) {
    try {
      logger.info(`Crawling comments for account ${account.id}`);
      
      // 使用现有的爬虫
      const comments = await this.crawler.crawlComments(account);
      
      logger.info(`Crawled ${comments.length} comments for account ${account.id}`);
      return comments;
    } catch (error) {
      logger.error(`Failed to crawl comments for account ${account.id}:`, error);
      throw error;
    }
  }

  /**
   * 爬取私信
   * @param {Object} account - 账户对象
   * @returns {Promise<Array>} 私信数据
   */
  async crawlDirectMessages(account) {
    try {
      logger.info(`Crawling direct messages for account ${account.id}`);
      
      // 使用现有的爬虫
      const directMessages = await this.crawler.crawlDirectMessages(account);
      
      logger.info(`Crawled ${directMessages.length} direct messages for account ${account.id}`);
      return directMessages;
    } catch (error) {
      logger.error(`Failed to crawl direct messages for account ${account.id}:`, error);
      throw error;
    }
  }

  /**
   * 登录成功回调
   * @param {string} accountId - 账户 ID
   * @param {string} sessionId - 登录会话 ID
   */
  async onLoginSuccess(accountId, sessionId) {
    try {
      logger.info(`Login successful for account ${accountId}`);
      
      // 1. 保存 Cookie 和存储状态
      await this.saveAccountState(accountId);
      
      // 2. 保存成功登录的截图
      await this.takeScreenshot(accountId, `login_success_${Date.now()}.png`);
      
      // 3. 发送登录成功状态到 Master
      await this.sendLoginStatus(sessionId, 'success', {
        timestamp: Date.now(),
        platform: 'douyin',
      });
      
      logger.info(`Login state saved for account ${accountId}`);
    } catch (error) {
      logger.error(`Failed to handle login success for account ${accountId}:`, error);
    }
  }

  /**
   * 清理资源
   * @param {string} accountId - 账户 ID
   */
  async cleanup(accountId) {
    logger.info(`Cleaning up Douyin platform for account ${accountId}`);
    
    // 清理爬虫资源
    try {
      await this.crawler.cleanup();
    } catch (error) {
      logger.error(`Failed to cleanup crawler for account ${accountId}:`, error);
    }
    
    // 调用基类清理（清理浏览器上下文等）
    await super.cleanup(accountId);
    
    logger.info(`Douyin platform cleaned up for account ${accountId}`);
  }
}

module.exports = DouyinPlatform;
