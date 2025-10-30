/**
 * Douyin Platform - 抖音平台脚本
 * 基于现有 DouyinLoginHandler 重构为平台模式
 */

const PlatformBase = require('../base/platform-base');
const DouyinLoginHandler = require('../../browser/douyin-login-handler');
const IncrementalCrawlService = require('../../services/incremental-crawl-service');
const { getCacheManager } = require('../../services/cache-manager');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { v4: uuidv4 } = require('uuid');
const { TabTag } = require('../../browser/tab-manager');

// 导入爬取函数
const { crawlContents } = require('./crawl-contents');
const { crawlComments: crawlCommentsV2 } = require('./crawl-comments');
const { crawlDirectMessagesV2 } = require('./crawl-direct-messages-v2');

// 导入 API 回调函数
const { onWorksListAPI, onWorkDetailAPI } = require('./crawl-contents');
const { onCommentsListAPI, onDiscussionsListAPI } = require('./crawl-comments');
const { onMessageInitAPI, onConversationListAPI, onMessageHistoryAPI } = require('./crawl-direct-messages-v2');

const logger = createLogger('douyin-platform');
const cacheManager = getCacheManager();

class DouyinPlatform extends PlatformBase {
  constructor(config, workerBridge, browserManager) {
    super(config, workerBridge, browserManager);

    // 复用现有的登录处理器（传入 bridge 的 socket）
    this.loginHandler = new DouyinLoginHandler(browserManager, workerBridge.socket);

    // ⭐ 页面现在由 BrowserManager 统一管理，不再需要 this.currentPage
  }

  /**
   * 初始化平台
   * @param {Object} account - 账户对象
   */
  async initialize(account) {
    logger.info(`Initializing Douyin platform for account ${account.id}`);

    // 调用基类初始化（初始化 DataManager）
    await super.initialize(account);

    // ✅ 设置全局 DataManager 上下文（供所有爬虫模块的 API 拦截器使用）
    const dataManager = this.dataManagers.get(account.id);
    if (dataManager) {
      // 导入各个爬虫模块的 globalContext 并设置
      const { globalContext: contentsContext } = require('./crawl-contents');
      const { globalContext: commentsContext } = require('./crawl-comments');
      const { globalContext: dmContext } = require('./crawl-direct-messages-v2');

      // 设置到所有爬虫模块的 globalContext（账户级别全局）
      contentsContext.dataManager = dataManager;
      contentsContext.accountId = account.id;

      commentsContext.dataManager = dataManager;
      commentsContext.accountId = account.id;

      dmContext.dataManager = dataManager;
      dmContext.accountId = account.id;

      logger.info(`✅ DataManager 已设置到所有爬虫模块的 globalContext (账户: ${account.id})`);
    } else {
      logger.warn(`⚠️  DataManager 未初始化 (账户: ${account.id})`);
    }

    // 页面和 API 拦截器会在爬虫函数中按需创建
    // 不需要在初始化时创建页面

    logger.info(`Douyin platform initialized for account ${account.id}`);
  }

  /**
   * 注册 API 拦截器处理函数
   * 统一注册所有抖音平台需要拦截的 API（pattern + callback）
   */
  async registerAPIHandlers(manager, accountId) {
    logger.info(`Registering API handlers for account ${accountId}`);

    // 作品相关 API
    manager.register('**/aweme/v1/creator/item/list{/,}?**', onWorksListAPI);  // ✅ 只匹配 /aweme/v1/creator/item/list
    manager.register('**/aweme/v1/web/aweme/detail/**', onWorkDetailAPI);

    // 评论相关 API
    manager.register('**/comment/list/select/**', onCommentsListAPI);  // 修正：匹配 /comment/list/select/
    manager.register('**/comment/reply/list/**', onDiscussionsListAPI);  // 修正：更宽松的模式

    // 私信相关 API
    manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);
    manager.register('**/creator/im/user_detail/**', onConversationListAPI);  // ✅ 修正：匹配实际的会话 API
    manager.register('**/v1/im/message/history**', onMessageHistoryAPI);

    logger.info(`✅ API handlers registered (7 total) for account ${accountId}`);
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

      // 1. 确保账户的浏览器上下文有效
      await this.ensureAccountContext(accountId, proxy);

      // 2. ⭐ 使用 TabManager 获取登录窗口
      // 登录窗口特性：
      // - 临时窗口 (persistent=false)，登录成功后会自动关闭
      // - 可复用（如果已有登录窗口）
      // - 不强制创建新窗口（复用已有登录窗口）
      logger.info('Getting login tab from TabManager...');
      const { page: loginPage, release } = await this.browserManager.tabManager.getPageForTask(accountId, {
        tag: TabTag.LOGIN,
        persistent: false,     // 登录成功后关闭
        shareable: true,       // 登录窗口可复用
        forceNew: false        // 如果已有登录窗口，复用它
      });

      try {
        // 导航到创作中心（登录窗口默认可能不在正确的页面）
        if (!loginPage.url().includes('creator.douyin.com')) {
          logger.info('Navigating to creator center for login check...');
          await loginPage.goto('https://creator.douyin.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
        }

        logger.info(`Page ready at: ${loginPage.url()}`);

        // 等待页面稳定
        await loginPage.waitForTimeout(2000);

        // 3. 截图用于调试
        await this.takeScreenshot(accountId, `login_start_${Date.now()}.png`);

        // 4. 检测登录状态（在当前页面）
        logger.info('Checking login status on current page...');
        const loginStatus = await this.checkLoginStatus(loginPage);

        if (loginStatus.isLoggedIn) {
          // ✅ 已登录：提取用户信息并关闭页面
          logger.info(`✓ Account ${accountId} is already logged in`);

          const userInfo = await this.extractUserInfo(loginPage);
          logger.info('Extracted user info:', JSON.stringify(userInfo));

          // ⭐ 使用 release() 告诉 TabManager 登录窗口已用完
          // 由于是 persistent=false，TabManager 会自动关闭此窗口
          logger.info('Releasing login window...');
          await release();
          logger.info('✅ Login window released (will be auto-closed)');

          // 发送登录成功状态给 Master
          await this.sendLoginStatus(sessionId, 'success', {
            account_id: accountId,
            user_info: userInfo,
            session_id: sessionId,
            message: '账户已登录',
          });

          return { status: 'success', userInfo };
        } else {
          // ❌ 未登录：在**当前页面**继续登录流程（不关闭、不新建）
          logger.info(`✗ Account ${accountId} is NOT logged in, starting login process...`);

          // 检测登录方式（当前页面可能已经在登录页面，或需要跳转）
          const currentUrl = loginPage.url();
          if (!currentUrl.includes('/login')) {
            // 如果不在登录页面，可能需要点击登录按钮或导航
            logger.info('Not on login page, page will auto-redirect or show login UI');
          }

          await loginPage.waitForTimeout(2000);

          // 检测登录方式
          const loginMethod = await this.detectLoginMethod(loginPage);
          logger.info(`Login method detected: ${loginMethod.type}`);

          if (loginMethod.type === 'qrcode') {
            // 显示二维码登录（在当前 loginPage 上）
            return await this.handleQRCodeLogin(loginPage, accountId, sessionId, {
              qrSelector: loginMethod.selector,
              expirySelector: loginMethod.expirySelector
            });
          } else if (loginMethod.type === 'sms') {
            // 显示 SMS 登录（在当前 loginPage 上）
            return await this.handleSMSLogin(loginPage, accountId, sessionId, {
              phoneInputSelector: loginMethod.phoneInputSelector,
              codeInputSelector: loginMethod.codeInputSelector
            });
          } else {
            throw new Error(`Unsupported login method: ${loginMethod.type}`);
          }
        }
      } catch (error) {
        // 确保登录页面被关闭 - 使用 TabManager
        try {
          await this.browserManager.tabManager.closeTab(accountId, tabId);
        } catch (e) {
          logger.warn('Failed to close login tab:', e.message);
        }
        throw error;
      }
      
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
   * 检查登录状态（检查用户信息容器）
   * 通过 Chrome DevTools 确认的精确选择器（2025-10-24）
   * @param {Page} page - Playwright 页面对象
   * @returns {boolean} true=已登录, false=未登录
   */
  /**
   * 检查抖音登录状态
   *
   * ⚠️ 重要：此函数**不负责导航**，只负责检测当前页面的登录状态
   *
   * 调用者应该在调用此函数前，确保页面已经导航到正确的 URL：
   * - 创作中心页面（https://creator.douyin.com/）
   * - 或登录页面（https://www.douyin.com/passport/web/login）
   *
   * @param {Page} page - Playwright 页面对象（已导航到目标页面）
   * @param {string} checkMethod - 检测方法（'auto' | 'element' | 'cookie' | 'url'）
   * @returns {Object} 登录状态 {isLoggedIn: boolean, status: string, userInfo?: Object}
   */
  async checkLoginStatus(page, checkMethod = 'auto') {
    try {
      const currentUrl = page.url();
      logger.info(`[checkLoginStatus] 📍 Checking login status on current page: ${currentUrl}`);
      logger.info(`[checkLoginStatus] 🔍 Detection method: ${checkMethod}`);

      // ⚠️ 不进行任何导航操作，直接检测当前页面
      // 调用者负责确保页面已在正确的 URL

      // ⭐ 优先检查：如果页面上有登录元素（二维码、登录按钮等），说明未登录
      const loginPageIndicators = [
        'text=扫码登录',
        'text=验证码登录',
        'text=密码登录',
        'text=我是创作者',
        'text=我是MCN机构',
        'text=需在手机上进行确认',
        '[class*="qrcode"]',  // 二维码相关元素
        '[class*="login-qrcode"]',
      ];

      for (const indicator of loginPageIndicators) {
        try {
          const element = await page.$(indicator);
          if (element && await element.isVisible()) {
            logger.info(`✗ [checkLoginStatus] Found login page indicator: ${indicator} - NOT logged in`);
            return { isLoggedIn: false, status: 'not_logged_in' };
          }
        } catch (e) {
          // 忽略错误，继续检查下一个
        }
      }

      // 方法1: 检查用户信息容器（最可靠）
      // 这个容器只有在登录后才会出现，包含用户昵称、抖音号、头像等
      const userContainerSelectors = [
        'div.container-vEyGlK',  // 用户信息容器的 class（Chrome DevTools 确认）
        'div[class*="container-"]',  // 容器 class 的模糊匹配（防止 class 名变化）
      ];

      for (const selector of userContainerSelectors) {
        try {
          const container = await page.$(selector);
          if (container) {
            const isVisible = await container.isVisible();
            if (isVisible) {
              // 进一步验证：检查容器中是否包含"抖音号："文本
              const text = await container.textContent();
              if (text && text.includes('抖音号：')) {
                logger.info(`✅ [checkLoginStatus] Found user info container with selector: ${selector} - logged in`);

                // 提取用户信息
                const userInfo = await this.extractUserInfo(page);
                return { isLoggedIn: true, status: 'logged_in', userInfo };
              }
            }
          }
        } catch (e) {
          logger.debug(`[checkLoginStatus] Failed to check container selector ${selector}: ${e.message}`);
        }
      }

      // 方法2: 直接检查"抖音号："元素
      const douyinIdSelectors = [
        'div.unique_id-EuH8eA',  // 抖音号元素的 class（Chrome DevTools 确认）
        'div[class*="unique_id-"]',  // 抖音号 class 的模糊匹配
      ];

      for (const selector of douyinIdSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              const text = await element.textContent();
              if (text && text.includes('抖音号：')) {
                logger.info(`✅ [checkLoginStatus] Found 抖音号 element with selector: ${selector} - logged in`);

                // 提取用户信息
                const userInfo = await this.extractUserInfo(page);
                return { isLoggedIn: true, status: 'logged_in', userInfo };
              }
            }
          }
        } catch (e) {
          logger.debug(`[checkLoginStatus] Failed to check douyinId selector ${selector}: ${e.message}`);
        }
      }

      // 方法3: 检查用户头像（特定位置）
      const avatarSelectors = [
        'div.avatar-XoPjK6 img',  // 头像容器中的 img（Chrome DevTools 确认）
        'img.img-PeynF_',  // 头像 img 的 class（Chrome DevTools 确认）
        'div[class*="avatar-"] img[src*="douyinpic.com"]',  // 抖音 CDN 头像
      ];

      for (const selector of avatarSelectors) {
        try {
          const avatar = await page.$(selector);
          if (avatar) {
            const isVisible = await avatar.isVisible();
            if (isVisible) {
              const src = await avatar.getAttribute('src');
              if (src && src.includes('douyinpic.com')) {
                logger.info(`✅ [checkLoginStatus] Found user avatar with selector: ${selector} - logged in`);

                // 提取用户信息
                const userInfo = await this.extractUserInfo(page);
                return { isLoggedIn: true, status: 'logged_in', userInfo };
              }
            }
          }
        } catch (e) {
          logger.debug(`[checkLoginStatus] Failed to check avatar selector ${selector}: ${e.message}`);
        }
      }

      logger.info('✗ [checkLoginStatus] No user info indicators found - NOT logged in');
      return { isLoggedIn: false, status: 'not_logged_in' };

    } catch (error) {
      logger.error('[checkLoginStatus] Error checking login status:', error);
      return { isLoggedIn: false, status: 'error', error: error.message };
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

      // 1. 首要检查：用户头像（最可靠的登录状态判断）
      // 只检测页面顶部导航栏的用户头像，避免误判
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

      // 2. URL 检查作为辅助判断（仅在有头像的情况下才认为已登录）
      // 注意：creator-micro/home 页面可能显示登录界面，不能单独作为判断依据
      const currentUrl = page.url();
      logger.info(`Current URL: ${currentUrl}, no avatar found - showing login page`)
      
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
   * 爬取评论和讨论 - 使用"点击+拦截"策略
   * 导航到评论管理页面,点击视频选择器,拦截评论API获取数据
   *
   * ⭐ 新架构: 评论和讨论一起抓取（就像私信和会话一样）
   * - 评论爬虫逻辑已迁移到 crawl-comments.js
   * - platform.js 作为协调层，负责调用爬虫和数据上报
   *
   * @param {Object} account - 账户对象
   * @param {Object} options - 选项
   * @param {number} options.maxVideos - 最多爬取的作品数量（默认全部）
   * @param {boolean} options.includeDiscussions - 是否同时爬取讨论（默认true）
   * @returns {Promise<Object>} { comments: Array, discussions: Array, contents: Array, stats: Object }
   */
  async crawlComments(account, options = {}) {
    try {
      logger.info(`[crawlComments] Starting comments+discussions crawl for account ${account.id}`);

      // 确保账号有 platform_user_id
      if (!account.platform_user_id) {
        logger.error(`[crawlComments] Account ${account.id} missing platform_user_id`);
        throw new Error('Account missing platform_user_id - please login first to obtain douyin_id');
      }

      // 1. 获取页面 - 使用框架级别的 getPageWithAPI（自动注册 API 拦截器）
      // ⭐ 关键改进: 使用 getPageWithAPI 自动为标签页注册 API 拦截器
      logger.debug(`[crawlComments] Step 1: Getting spider_comment tab for account ${account.id}`);
      const { page } = await this.getPageWithAPI(account.id, {
        tag: TabTag.SPIDER_COMMENT,
        persistent: true,      // 长期运行，不关闭
        shareable: false,      // 独立窗口，不共享
        forceNew: false        // 复用已有窗口
      });
      logger.info(`[crawlComments] Spider comment tab retrieved successfully`);

      // 1.5. 获取 DataManager（使用新架构，自动创建）
      const dataManager = await this.getDataManager(account.id);
      if (dataManager) {
        logger.info(`✅ [crawlComments] DataManager 可用，使用统一数据管理架构`);
        // Note: crawl-contents.js 的 globalContext 已在 initialize() 时设置
      } else {
        logger.warn(`⚠️  [crawlComments] DataManager 创建失败，使用旧数据收集逻辑`);
      }

      // 2. 执行评论和讨论爬虫（新架构）
      logger.debug(`[crawlComments] Step 2: Running comments+discussions crawler (crawlCommentsV2)`);
      const crawlResult = await crawlCommentsV2(page, account, options, dataManager);

      const { comments, discussions, contents, stats: crawlStats } = crawlResult;
      logger.info(`[crawlComments] Crawler completed: ${comments.length} comments, ${discussions.length} discussions, ${contents.length} contents`);

      // 3. 发送评论数据到 Master
      logger.debug(`[crawlComments] Step 3: Sending ${comments.length} comments to Master`);
      await this.sendCommentsToMaster(account, comments, contents);
      logger.info(`[crawlComments] Comments sent to Master successfully`);

      // 4. 发送讨论数据到 Master
      if (discussions && discussions.length > 0) {
        logger.debug(`[crawlComments] Step 4: Sending ${discussions.length} discussions to Master`);
        await this.sendDiscussionsToMaster(account, discussions);
        logger.info(`[crawlComments] Discussions sent to Master successfully`);
      } else {
        logger.info(`[crawlComments] No discussions to send to Master`);
      }

      // 5. 构建统计数据
      const stats = {
        recent_comments_count: comments.length,
        recent_discussions_count: discussions.length,
        new_comments_count: comments.length, // TODO: 实现增量更新
        crawl_time: Math.floor(Date.now() / 1000),
        ...crawlStats,
      };

      logger.info(`[crawlComments] ✅ Comments+discussions crawl completed: ${comments.length} comments, ${discussions.length} discussions`);
      return {
        comments,
        discussions,
        contents,
        stats,
      };
    } catch (error) {
      logger.error(`[crawlComments] ❌ FATAL ERROR for account ${account.id}:`, error);
      logger.error(`[crawlComments] Error stack:`, error.stack);
      throw error;
    }
  }

  /**
   * ✨ 新增: 发送讨论数据到 Master
   * @param {Object} account - 账户对象
   * @param {Array} discussions - 讨论数组
   */
  async sendDiscussionsToMaster(account, discussions) {
    if (!discussions || discussions.length === 0) {
      logger.debug('No discussions to send to Master');
      return;
    }

    try {
      logger.info(`Sending ${discussions.length} discussions to Master for account ${account.id}`);

      // ⚠️ 为每个 discussion 添加必需的 account_id 和 platform 字段
      const discussionsWithAccount = discussions.map(d => ({
        ...d,
        account_id: account.id,
        platform: 'douyin',
        platform_user_id: account.platform_user_id,  // 添加 platform_user_id 用于唯一约束
      }));

      // 使用 Socket.IO 发送讨论数据
      this.bridge.socket.emit('worker:bulk_insert_discussions', {
        account_id: account.id,
        discussions: discussionsWithAccount,
      });

      logger.info(`✅ Sent ${discussionsWithAccount.length} discussions to Master`);
    } catch (error) {
      logger.error('Failed to send discussions to Master:', error);
      throw error;
    }
  }

  /**
   * ✨ 新增: 发送作品数据到 Master (使用新的 contents 表)
   * @param {Object} account - 账户对象
   * @param {Array} videos - 视频/作品数组
   */
  async sendWorksToMaster(account, videos) {
    if (!videos || videos.length === 0) {
      logger.debug('No contents to send to Master');
      return;
    }

    try {
      logger.info(`Sending ${videos.length} contents to Master for account ${account.id}`);

      // 将视频数据转换为 contents 表格式
      const contents = videos.map(video => ({
        account_id: account.id,
        platform: 'douyin',
        platform_content_id: video.aweme_id || video.item_id,
        platform_user_id: account.platform_user_id,
        content_type: 'video',
        title: video.title,
        stats_comment_count: video.total_count || video.comment_count || 0,
        detected_at: Math.floor(Date.now() / 1000),
      }));

      // 使用 Socket.IO 批量发送作品数据
      this.bridge.socket.emit('worker:bulk_insert_works', {
        account_id: account.id,
        contents: contents,
      });

      logger.info(`✅ Sent ${contents.length} contents to Master`);
    } catch (error) {
      logger.error('Failed to send contents to Master:', error);
      throw error;
    }
  }

  /**
   * 从URL提取item_id参数（保留用于向后兼容，实际逻辑已迁移到 crawl-comments.js）
   * @deprecated Use crawl-comments.js exports instead
   * @param {string} url - API URL
   * @returns {string|null} item_id
   */
  extractItemId(url) {
    const match = url.match(/item_id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * 从URL提取cursor参数（保留用于向后兼容，实际逻辑已迁移到 crawl-comments.js）
   * @deprecated Use crawl-comments.js exports instead
   * @param {string} url - API URL
   * @returns {number} cursor值
   */
  extractCursor(url) {
    const match = url.match(/cursor=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 按item_id分组API响应（保留用于向后兼容，实际逻辑已迁移到 crawl-comments.js）
   * @deprecated Use crawl-comments.js exports instead
   * @param {Array} responses - API响应数组
   * @returns {Object} 按item_id分组的响应
   */
  groupResponsesByItemId(responses) {
    const grouped = {};
    responses.forEach(resp => {
      if (resp.item_id) {
        if (!grouped[resp.item_id]) {
          grouped[resp.item_id] = [];
        }
        grouped[resp.item_id].push(resp);
      }
    });

    // 按cursor排序
    for (const itemId in grouped) {
      grouped[itemId].sort((a, b) => a.cursor - b.cursor);
    }

    return grouped;
  }

  /**
   * 爬取私信 - 导航到 互动管理 - 私信管理 页面，通过拦截API获取数据
   * @param {Object} account - 账户对象
   * @returns {Promise<Object>} { directMessages: Array, stats: Object }
   */
  /**
   * 爬取私信 - 导航到 互动管理 - 私信管理 页面，通过拦截API获取数据
   * @param {Object} account - 账户对象
   * @returns {Promise<Object>} { directMessages: Array, stats: Object }
   */
  async crawlDirectMessages(account) {
    try {
      logger.info(`[crawlDirectMessages] Starting Phase 8 implementation for account ${account.id}`);

      // 确保账号有 platform_user_id
      if (!account.platform_user_id) {
        logger.error(`[crawlDirectMessages] Account ${account.id} missing platform_user_id`);
        throw new Error('Account missing platform_user_id - please login first to obtain douyin_id');
      }

      // 1. 获取页面 - 使用框架级别的 getPageWithAPI（自动注册 API 拦截器）
      // ⭐ 关键改进: 使用 getPageWithAPI 自动为标签页注册 API 拦截器
      logger.debug(`[crawlDirectMessages] Step 1: Getting spider_dm tab for account ${account.id}`);
      const { page } = await this.getPageWithAPI(account.id, {
        tag: TabTag.SPIDER_DM,
        persistent: true,      // 长期运行，不关闭
        shareable: false,      // 独立窗口，不共享
        forceNew: false        // 复用已有窗口
      });
      logger.info(`[crawlDirectMessages] Spider DM tab retrieved successfully`);

      // 1.5. 获取 DataManager（使用新架构，自动创建）
      const dataManager = await this.getDataManager(account.id);
      if (dataManager) {
        logger.info(`✅ [crawlDirectMessages] DataManager 可用，使用统一数据管理架构`);
      } else {
        logger.warn(`⚠️  [crawlDirectMessages] DataManager 创建失败，使用旧数据收集逻辑`);
      }

      // 2. 执行 Phase 8 爬虫 (包括 API 拦截、虚拟列表提取、数据合并等)
      logger.debug(`[crawlDirectMessages] Step 2: Running Phase 8 crawler (crawlDirectMessagesV2)`);
      const crawlResult = await crawlDirectMessagesV2(page, account, dataManager);

      const { conversations, directMessages: rawDirectMessages, stats: crawlStats } = crawlResult;
      logger.info(`[crawlDirectMessages] Phase 8 crawler completed: ${conversations.length} conversations, ${rawDirectMessages.length} messages`);

      // 3. 处理直接消息数据 (添加 account_id 等字段)
      logger.debug(`[crawlDirectMessages] Step 3: Processing ${rawDirectMessages.length} direct messages`);

      const createIsNewFlag = (createdAt) => {
        const now = Math.floor(Date.now() / 1000);
        const ageSeconds = now - createdAt;
        const oneDaySeconds = 24 * 60 * 60;
        return ageSeconds < oneDaySeconds;
      };

      const directMessages = rawDirectMessages.map((msg) => {
        let createdAt = msg.created_at || msg.create_time || Math.floor(Date.now() / 1000);

        // 检查是否为毫秒级（13位数字）并转换为秒级
        if (createdAt > 9999999999) {
          createdAt = Math.floor(createdAt / 1000);
        }

        return {
          ...msg,
          account_id: account.id,
          is_read: false,
          created_at: createdAt,
          is_new: createIsNewFlag(createdAt),
          push_count: 0,
        };
      });
      logger.info(`[crawlDirectMessages] Processed ${directMessages.length} direct messages`);

      // 4. 将私信添加到缓存管理器（用于 IsNewPushTask）
      directMessages.forEach(msg => {
        cacheManager.addMessage(account.id, msg);
      });

      // 5. 发送私信数据到 Master
      logger.debug(`[crawlDirectMessages] Step 5: Sending ${directMessages.length} messages to Master`);
      await this.sendMessagesToMaster(account, directMessages);
      logger.info(`[crawlDirectMessages] Messages sent to Master successfully`);

      // 6. 发送会话数据到 Master (新增 Phase 8 功能)
      logger.debug(`[crawlDirectMessages] Step 6: Sending ${conversations.length} conversations to Master`);
      await this.sendConversationsToMaster(account, conversations);
      logger.info(`[crawlDirectMessages] Conversations sent to Master successfully`);

      // 构建统计数据
      const stats = {
        recent_dms_count: directMessages.length,
        conversations_count: conversations.length,
        crawl_time: Math.floor(Date.now() / 1000),
        ...crawlStats,
      };

      logger.info(`[crawlDirectMessages] ✅ Phase 8 completed: ${directMessages.length} messages, ${conversations.length} conversations`);
      return {
        conversations,
        directMessages,
        stats,
      };
    } catch (error) {
      logger.error(`[crawlDirectMessages] ❌ FATAL ERROR for account ${account.id}:`, error);
      logger.error(`[crawlDirectMessages] Error stack:`, error.stack);
      throw error;
    }
  }

  // ==================== 爬虫辅助方法 ====================

  /**
   * 获取或创建页面 - 支持指定蜘蛛类型
   * @param {string} accountId - 账户ID
   * @param {string} spiderType - 蜘蛛类型 ('spider1' 私信, 'spider2' 评论)
   * @returns {Promise<Page>}
   */
  async getOrCreatePage(accountId, spiderType = 'spider1') {
    // ⭐ 使用 BrowserManager 的蜘蛛页面管理系统
    // spider1 (Tab 1): 私信爬虫 - 长期运行
    // spider2 (Tab 2): 评论爬虫 - 长期运行
    if (this.browserManager && this.browserManager.getSpiderPage) {
      return await this.browserManager.getSpiderPage(accountId, spiderType);
    }

    // 降级: 使用 PlatformBase 的统一接口
    return await super.getAccountPage(accountId);
  }

  /**
   * 导航到评论管理页面 (互动管理 - 评论管理)
   * @param {Page} page
   */
  async navigateToCommentManage(page) {
    logger.info('Navigating to comment management page (互动管理 - 评论管理)');

    const currentUrl = page.url();

    // 如果已经在评论管理页面，直接返回
    if (currentUrl.includes('/interactive/comment')) {
      logger.info('Already on comment management page');
      return;
    }

    // 导航到创作者中心首页
    if (!currentUrl.includes('creator.douyin.com')) {
      await page.goto('https://creator.douyin.com/', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      await this.randomDelay(1000, 2000);
    }

    // 导航到评论管理页面
    // 路径: 互动管理 - 评论管理
    // URL: https://creator.douyin.com/creator-micro/interactive/comment
    try {
      await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      await this.randomDelay(2000, 3000);
      logger.info('Navigated to comment management page');
    } catch (error) {
      logger.error('Failed to navigate to comment management page:', error);
      throw error;
    }
  }

  /**
   * 导航到私信管理页面 (互动管理 - 私信管理)
   * @param {Page} page
   */
  async navigateToMessageManage(page) {
    logger.info('[navigateToMessageManage] Starting navigation to message management page');

    const currentUrl = page.url();
    logger.debug(`[navigateToMessageManage] Current URL: ${currentUrl}`);

    // 如果已经在私信管理页面，直接返回
    if (currentUrl.includes('/data/following/chat')) {
      logger.info('[navigateToMessageManage] Already on message management page, skipping navigation');
      return;
    }

    // 导航到私信管理页面
    // 路径: 互动管理 - 私信管理
    // URL: https://creator.douyin.com/creator-micro/data/following/chat
    try {
      logger.debug('[navigateToMessageManage] Navigating to https://creator.douyin.com/creator-micro/data/following/chat');
      await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      logger.debug('[navigateToMessageManage] Page loaded, adding random delay');
      await this.randomDelay(2000, 3000);
      logger.info('[navigateToMessageManage] ✅ Successfully navigated to message management page');
    } catch (error) {
      logger.error('[navigateToMessageManage] ❌ FAILED to navigate:', error);
      logger.error('[navigateToMessageManage] Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * 从评论管理页面获取作品列表
   * @param {Page} page
   * @returns {Promise<Array>} 作品列表
   */
  async randomDelay(min, max) {
    const delay = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 获取历史评论ID（通过 Worker Bridge 请求 Master）
   * @param {string} awemeId - 作品ID
   * @param {Object} options - 选项
   * @returns {Promise<Array<string>>} 评论ID列表
   */
  async getExistingCommentIds(awemeId, options = {}) {
    try {
      logger.debug(`Requesting existing comment IDs for video ${awemeId}`);

      // 通过 Worker Bridge 发送请求到 Master
      const response = await this.bridge.request('worker:get_comment_ids', {
        aweme_id: awemeId,
        options,
      });

      if (response.success) {
        logger.debug(`Received ${response.comment_ids.length} existing comment IDs for video ${awemeId}`);
        return response.comment_ids;
      } else {
        logger.warn(`Failed to get existing comment IDs: ${response.error}`);
        return [];
      }
    } catch (error) {
      logger.error(`Failed to get existing comment IDs for video ${awemeId}:`, error);
      return [];
    }
  }

  /**
   * 发送评论数据到 Master
   * @param {Object} account - 账户对象
   * @param {Array} comments - 评论列表
   * @param {Array} videos - 视频列表
   */
  async sendCommentsToMaster(account, comments, videos) {
    try {
      logger.info(`Processing ${comments.length} comments for account ${account.id} (platform_user_id: ${account.platform_user_id})`);

      // 🔥 使用缓存管理器过滤新评论 (三字段组合去重)
      const newComments = cacheManager.filterNewComments(account.id, comments, account.platform_user_id);

      if (newComments.length === 0) {
        logger.info(`No new comments to send (all ${comments.length} comments are duplicates)`);

        // 即使没有新评论，也发送作品信息更新 (使用新的 contents 表)
        if (videos && videos.length > 0) {
          await this.sendWorksToMaster(account, videos);
        }

        return;
      }

      logger.info(`Sending ${newComments.length} NEW comments (filtered from ${comments.length} total) and ${videos.length} videos to Master`);

      // 发送作品信息 (使用新的 contents 表)
      if (videos && videos.length > 0) {
        await this.sendWorksToMaster(account, videos);
      }

      // 计算 is_new 标志的辅助函数
      const createIsNewFlag = (createdAt) => {
        const now = Math.floor(Date.now() / 1000);
        const ageSeconds = now - createdAt;
        const oneDaySeconds = 24 * 60 * 60;  // 86400
        return ageSeconds < oneDaySeconds;
      };

      // 为评论添加必需的 id 和 account_id 字段，以及 is_new 和 push_count 字段
      // 使用 platform_comment_id 作为唯一标识
      const commentsWithIds = newComments.map((comment) => ({
        id: comment.platform_comment_id,  // 使用 platform_comment_id 作为唯一ID
        account_id: account.id,  // 添加账户ID
        is_new: createIsNewFlag(comment.create_time),  // 基于 create_time 计算 is_new
        push_count: 0,  // 初始推送计数为0
        ...comment,
      }));

      // 诊断：输出第一条评论的所有字段
      if (commentsWithIds.length > 0) {
        logger.info('\n🔥 First comment to send to Master:');
        const firstComment = commentsWithIds[0];
        logger.info(`   Keys: ${Object.keys(firstComment).join(', ')}`);
        logger.info(`   create_time: ${firstComment.create_time}`);
        logger.info(`   created_at: ${firstComment.created_at}`);
        logger.info(`   detected_at: ${firstComment.detected_at}`);
        logger.info(`   id: ${firstComment.id}`);
      }

      // 将评论添加到缓存管理器（用于 IsNewPushTask）
      commentsWithIds.forEach(comment => {
        cacheManager.addComment(account.id, comment);
      });

      // 🔥 只发送新评论
      this.bridge.socket.emit('worker:bulk_insert_comments', {
        account_id: account.id,
        platform_user_id: account.platform_user_id,
        comments: commentsWithIds,
      });

      logger.info(`✅ Successfully sent ${newComments.length} new comments and ${videos.length} videos to Master`);
    } catch (error) {
      logger.error('Failed to send comments to Master:', error);
    }
  }

  /**
   * 发送新评论通知
   * @param {Object} account - 账户对象
   * @param {Array} newComments - 新评论列表
   * @param {Array} videos - 视频列表
   */
  async sendNewCommentNotifications(account, newComments, videos) {
    try {
      logger.info(`Generating notifications for ${newComments.length} new comments`);

      // 按视频分组新评论
      const commentsByVideo = {};
      newComments.forEach((comment) => {
        if (!commentsByVideo[comment.post_id]) {
          commentsByVideo[comment.post_id] = [];
        }
        commentsByVideo[comment.post_id].push(comment);
      });

      // 为每个视频生成通知
      for (const [awemeId, comments] of Object.entries(commentsByVideo)) {
        const video = videos.find((v) => v.aweme_id === awemeId) || { title: '未知作品' };

        const notifications = IncrementalCrawlService.generateCommentNotifications(
          comments,
          video,
          account.id
        );

        // 发送通知到 Master
        for (const notification of notifications) {
          await this.bridge.pushNotification({
            ...notification,
            platform_user_id: account.platform_user_id,
          });
        }
      }

      logger.info(`Sent ${Object.keys(commentsByVideo).length} notification groups to Master`);
    } catch (error) {
      logger.error('Failed to send new comment notifications:', error);
    }
  }

  /**
   * 发送私信数据到 Master
   * @param {Object} account - 账户对象
   * @param {Array} messages - 私信列表
   */
  async sendMessagesToMaster(account, messages) {
    try {
      logger.info(`Processing ${messages.length} direct messages for account ${account.id} (platform_user_id: ${account.platform_user_id})`);

      // 🔥 使用缓存管理器过滤新私信 (三字段组合去重)
      const newMessages = cacheManager.filterNewDirectMessages(account.id, messages, account.platform_user_id);

      if (newMessages.length === 0) {
        logger.info(`No new direct messages to send (all ${messages.length} messages are duplicates)`);
        return;
      }

      logger.info(`Sending ${newMessages.length} NEW direct messages (filtered from ${messages.length} total) to Master`);

      // 🔥 只发送新私信
      this.bridge.socket.emit('worker:bulk_insert_messages', {
        account_id: account.id,
        platform_user_id: account.platform_user_id,
        messages: newMessages,
      });

      logger.info(`✅ Successfully sent ${newMessages.length} new messages to Master`);
    } catch (error) {
      logger.error('Failed to send messages to Master:', error);
    }
  }

  /**
   * 发送会话数据到 Master (Phase 8 新增)
   * @param {Object} account - 账户对象
   * @param {Array} conversations - 会话数组
   */
  async sendConversationsToMaster(account, conversations) {
    try {
      if (!conversations || conversations.length === 0) {
        logger.info('No conversations to send to Master');
        return;
      }

      logger.info(`Sending ${conversations.length} conversations for account ${account.id} to Master`);

      // 发送会话数据到 Master
      this.bridge.socket.emit('worker:bulk_insert_conversations', {
        account_id: account.id,
        conversations,
      });

      logger.info(`✅ Successfully sent ${conversations.length} conversations to Master`);
    } catch (error) {
      logger.error('Failed to send conversations to Master:', error);
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
   * 从虚拟列表中查找消息项 - 支持多维度匹配
   * @param {Page} page - Playwright 页面
   * @param {string} targetId - 目标消息 ID
   * @param {Object} criteria - 匹配条件 { content, senderName, timeIndicator, index }
   * @returns {Promise<ElementHandle>} 找到的消息项元素
   */
  async findMessageItemInVirtualList(page, targetId, criteria = {}) {
    // Phase 10: 增强 ID 处理，使用 API 拦截获取完整 ID 信息
    // 正确的虚拟列表选择器（已验证）
    // 抖音使用 ReactVirtualized，直接子元素是消息行，不是 [role="listitem"]
    const innerContainer = await page.$('.ReactVirtualized__Grid__innerScrollContainer');

    if (!innerContainer) {
      throw new Error('虚拟列表容器未找到');
    }

    const messageItems = await innerContainer.$$(':scope > div');

    if (messageItems.length === 0) {
      throw new Error('虚拟列表中没有消息');
    }

    // 如果只有一条消息且没有指定条件，返回第一条
    if (messageItems.length === 1 && !criteria.content) {
      logger.warn('虚拟列表中只有一条消息，使用它作为目标');
      return messageItems[0];
    }

    // 第一阶段：精确内容匹配
    if (criteria.content) {
      for (let i = 0; i < messageItems.length; i++) {
        const itemText = await messageItems[i].textContent();

        if (itemText.includes(criteria.content)) {
          // 如果有其他条件，进行二次检查
          if (criteria.senderName && !itemText.includes(criteria.senderName)) {
            continue;
          }
          if (criteria.timeIndicator && !itemText.includes(criteria.timeIndicator)) {
            continue;
          }

          logger.debug(`在索引 ${i} 找到精确匹配的消息`);
          return messageItems[i];
        }
      }
    }

    // 第二阶段：增强 ID 属性匹配 (Phase 10 改进)
    if (targetId && targetId !== 'first') {
      // Phase 10: 规范化 targetId (处理冒号分隔的 conversation_id)
      // 示例: "douyin:user_123:conv_456" → 提取最后部分 "conv_456"
      const normalizedTargetId = this.normalizeConversationId(targetId);
      logger.debug(`原始 ID: ${targetId}, 规范化 ID: ${normalizedTargetId}`);

      // 2a: 直接 HTML/文本匹配 (同时检查原始 ID 和规范化 ID)
      for (let i = 0; i < messageItems.length; i++) {
        const itemHTML = await messageItems[i].evaluate(el => el.outerHTML);
        const itemText = await messageItems[i].textContent();

        // 检查 ID 是否在 HTML 或文本中（原始和规范化都检查）
        if (itemHTML.includes(targetId) || itemText.includes(targetId) ||
            itemHTML.includes(normalizedTargetId) || itemText.includes(normalizedTargetId)) {
          logger.debug(`在索引 ${i} 找到 ID 匹配的消息`);
          return messageItems[i];
        }
      }

      // 2b: 使用 React Fiber 树提取 platform_message_id (Phase 10 新增)
      try {
        const fiberMessageIds = await this.extractMessageIdsFromReactFiber(page, messageItems);
        logger.debug(`从 React Fiber 提取的 ID 集合:`, fiberMessageIds);

        // 在 ID 集合中查找目标 ID (同时检查原始和规范化的 ID)
        for (let i = 0; i < messageItems.length; i++) {
          const messageIdData = fiberMessageIds[i];
          if (messageIdData) {
            // 对提取的 ID 也进行规范化处理
            const normalizedFiberId = this.normalizeConversationId(messageIdData.conversationId || '');

            if (messageIdData.id === targetId ||
                messageIdData.serverId === targetId ||
                messageIdData.platformMessageId === targetId ||
                messageIdData.conversationId === targetId ||
                // 规范化后的 ID 比对
                messageIdData.id === normalizedTargetId ||
                messageIdData.serverId === normalizedTargetId ||
                messageIdData.platformMessageId === normalizedTargetId ||
                messageIdData.conversationId === normalizedTargetId ||
                normalizedFiberId === normalizedTargetId
            ) {
              logger.debug(`通过 React Fiber 在索引 ${i} 找到 ID 匹配的消息`, {
                fiberConversationId: messageIdData.conversationId,
                normalizedFiberId,
                targetId,
                normalizedTargetId
              });
              return messageItems[i];
            }
          }
        }
      } catch (fiberError) {
        logger.debug(`React Fiber 提取失败:`, fiberError.message);
      }

      // 2c: 使用哈希匹配处理转换过的 ID (Phase 10 新增)
      try {
        const hashMatch = await this.findMessageByContentHash(page, messageItems, targetId);
        if (hashMatch) {
          logger.debug(`通过内容哈希在索引 ${hashMatch} 找到消息`);
          return messageItems[hashMatch];
        }
      } catch (hashError) {
        logger.debug(`内容哈希匹配失败:`, hashError.message);
      }
    }

    // 第三阶段：发送者 + 时间模糊匹配
    if (criteria.senderName && criteria.timeIndicator) {
      for (let i = 0; i < messageItems.length; i++) {
        const itemText = await messageItems[i].textContent();
        if (itemText.includes(criteria.senderName) && itemText.includes(criteria.timeIndicator)) {
          logger.debug(`在索引 ${i} 找到模糊匹配（发送者+时间）`);
          return messageItems[i];
        }
      }
    }

    // 第四阶段：使用索引作为备选
    if (typeof criteria.index === 'number' && criteria.index < messageItems.length) {
      logger.warn(`使用索引备选方案：${criteria.index}`);
      return messageItems[criteria.index];
    }

    // 最后备选：使用第一条消息
    logger.warn(`未找到匹配的消息，使用第一条作为备选`);
    return messageItems[0];
  }

  /**
   * 从 React Fiber 树中提取消息 ID 信息 (Phase 10)
   * @private
   */
  async extractMessageIdsFromReactFiber(page, messageItems) {
    try {
      const messageIds = await page.evaluate((items) => {
        const results = [];
        items.forEach((el, index) => {
          try {
            // 尝试访问 React Fiber 树
            const fiberKey = Object.keys(el).find(key => key.startsWith('__reactFiber'));
            if (fiberKey) {
              let fiber = el[fiberKey];
              let props = null;

              // 遍历 Fiber 树查找 props
              while (fiber && !props) {
                if (fiber.memoizedProps) {
                  props = fiber.memoizedProps;
                  break;
                }
                fiber = fiber.return;
              }

              if (props) {
                results.push({
                  index,
                  id: props.id || props.message_id,
                  serverId: props.serverId,
                  platformMessageId: props.platformMessageId || props.platform_message_id,
                  conversationId: props.conversationId || props.conversation_id,
                  content: props.content || props.text,
                  senderId: props.senderId || props.sender_id,
                  timestamp: props.timestamp || props.time
                });
              } else {
                results.push(null);
              }
            } else {
              results.push(null);
            }
          } catch (e) {
            results.push(null);
          }
        });
        return results;
      }, messageItems);

      return messageIds;
    } catch (error) {
      logger.warn(`Failed to extract IDs from React Fiber:`, error.message);
      return [];
    }
  }

  /**
   * 通过内容哈希查找消息 (Phase 10)
   * @private
   */
  async findMessageByContentHash(page, messageItems, targetId) {
    try {
      // 如果 targetId 看起来像是内容哈希（例如 msg_account_hash）
      if (!targetId.startsWith('msg_') && !targetId.includes('_')) {
        return null;
      }

      // 尝试从 targetId 中提取账户 ID
      const idParts = targetId.split('_');
      if (idParts.length < 2) {
        return null;
      }

      const hashPart = idParts[idParts.length - 1]; // 最后一部分应该是哈希

      // 遍历消息，计算内容哈希并比较
      for (let i = 0; i < messageItems.length; i++) {
        const itemText = await messageItems[i].textContent();
        const contentHash = this.hashContent(itemText);

        if (contentHash === hashPart) {
          logger.debug(`内容哈希匹配成功:`, contentHash);
          return i;
        }
      }

      return null;
    } catch (error) {
      logger.debug(`内容哈希查找失败:`, error.message);
      return null;
    }
  }

  /**
   * 规范化会话 ID (Phase 10)
   * 处理冒号分隔的 conversation_id 格式
   * 示例: "douyin:user_123:conv_456" → "conv_456"
   * @private
   */
  normalizeConversationId(conversationId) {
    if (!conversationId) return '';

    // 如果包含冒号，提取最后一部分
    if (typeof conversationId === 'string' && conversationId.includes(':')) {
      const parts = conversationId.split(':');
      return parts[parts.length - 1]; // 获取最后一部分
    }

    return conversationId;
  }

  /**
   * 计算内容哈希值 (复用 DM 提取的逻辑)
   * @private
   */
  hashContent(content) {
    if (!content) return 'empty';

    // 简单的哈希: 使用内容的前 100 个字符
    const str = content.substring(0, 100);
    return str.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0).toString(36);
  }

  /**
   * 设置私信 API 拦截器以获取完整 ID 信息 (Phase 10)
   * @private
   */
  async setupDMAPIInterceptors(page, apiResponses) {
    const requestCache = {
      conversations: new Set(),
      history: new Set()
    };

    const interceptAPI = async (route, apiType, cacheSet) => {
      const request = route.request();
      const method = request.method();
      const url = request.url();

      try {
        const response = await route.fetch();
        let body;

        const contentType = response.headers()['content-type'] || '';

        if (contentType.includes('application/json') || contentType.includes('json')) {
          body = await response.json();
        } else {
          try {
            const text = await response.text();
            body = JSON.parse(text);
          } catch (parseError) {
            logger.debug(`[${apiType}] Response is not JSON, skipping interception`);
            await route.fulfill({ response });
            return;
          }
        }

        // 验证响应
        if (!body || typeof body !== 'object') {
          await route.fulfill({ response });
          return;
        }

        // 生成请求签名用于去重
        const signature = JSON.stringify({ method, url, dataHash: this.hashContent(JSON.stringify(body)) });

        if (cacheSet.has(signature)) {
          logger.debug(`[${apiType}] Duplicate request detected`);
        } else {
          cacheSet.add(signature);
          apiResponses[apiType].push(body);
          logger.debug(`[${apiType}] Intercepted response`);
        }

        await route.fulfill({ response });

      } catch (error) {
        logger.debug(`[${apiType}] Interception error: ${error.message}`);
        try {
          await route.continue();
        } catch (continueError) {
          logger.debug(`[${apiType}] Failed to continue request`);
          await route.abort('failed');
        }
      }
    };

    // 配置 DM 相关 API 端点
    const apiConfigs = [
      {
        pattern: '**/v1/stranger/get_conversation_list**',
        type: 'conversations',
        description: '会话列表 API'
      },
      {
        pattern: '**/v1/im/message/history**',
        type: 'history',
        description: '消息历史 API'
      }
    ];

    for (const config of apiConfigs) {
      try {
        await page.route(config.pattern, async (route) => {
          await interceptAPI(route, config.type, requestCache[config.type] || new Set());
        });
        logger.debug(`[DM API] Registered interceptor for: ${config.description}`);
      } catch (error) {
        logger.warn(`[DM API] Failed to register interceptor: ${error.message}`);
      }
    }

    logger.debug(`✅ DM API interceptors configured`);
  }

  /**
   * 回复评论
   * @param {string} accountId - 账户 ID
   * @param {Object} options - 回复选项
   *   - target_id: string - 被回复的评论 ID
   *   - reply_content: string - 回复内容
   *   - context: object - 上下文信息 (video_id, user_id, etc.)
   *   - browserManager: BrowserManager
   * @returns {Promise<{platform_reply_id?, data?}>}
   */
  async replyToComment(accountId, options) {
    const { target_id, reply_content, context = {}, browserManager } = options;
    const { video_id, comment_user_id } = context;

    let page = null;

    // 在 try 块外定义 apiResponses，以便在 catch 和 finally 块中访问
    const apiResponses = {
      replySuccess: null,
      replyError: null
    };

    try {
      logger.info(`[Douyin] Replying to comment: ${target_id}`, {
        accountId,
        videoId: video_id,
        contextKeys: Object.keys(context),
        fullContext: context,
        replyContent: reply_content.substring(0, 50),
      });

      // 1. 获取临时标签页处理回复
      // ⭐ 使用 TabManager 获取评论回复专用临时窗口
      // 特性：临时窗口，回复完成后立即关闭，不干扰爬虫任务
      const { tabId, page: replyPage, shouldClose } = await this.browserManager.tabManager.getPageForTask(accountId, {
        tag: TabTag.REPLY_COMMENT,
        persistent: false,     // 回复完成后关闭
        shareable: false,      // 独立窗口
        forceNew: true         // 每次回复创建新窗口
      });

      page = replyPage;
      const replyTabId = tabId;

      logger.info(`[Douyin] 为评论回复任务获取临时标签页`, {
        accountId,
        purpose: 'comment_reply',
        commentId: target_id,
        tabId: replyTabId
      });

      // 设置超时
      page.setDefaultTimeout(30000);

      // 2. 设置 API 拦截器 - 监听回复发送的 API 响应
      logger.info('Setting up API interceptor for reply validation');

      // 定义 API 拦截处理器 - 注意：不能使用 async，Playwright 的 page.on('response') 不支持异步处理器
      const apiInterceptHandler = (response) => {
        const url = response.url();
        const status = response.status();

        // 添加详细日志以诊断 API 拦截 - 记录所有响应用于调试
        logger.debug(`[API Interceptor] All responses: ${url.substring(0, 100)}`);

        // 匹配回复 API: /aweme/v1/creator/comment/reply/ 或 /comment/reply
        if (url.includes('comment/reply')) {
          logger.info(`🔍 [API Interceptor] Found comment/reply API!`);
          logger.info(`    URL: ${url}`);
          logger.info(`    HTTP Status: ${status}`);

          // 异步处理 JSON 解析，但不阻塞处理器
          response.json().then((json) => {
            logger.info('✅ [API Interceptor] Successfully parsed JSON response');
            logger.info('    Response data:', {
              status_code: json.status_code,
              status_msg: json.status_msg,
              error_msg: json.error_msg,
              keys: Object.keys(json)
            });

            // ⭐ 改进: 正确处理成功和失败的状态返回
            // 成功响应: { status_code: 0, comment_info: {...}, ... }
            // 失败响应: { status_code: 15421, status_msg: "私密作品无法评论", ... }

            const statusCode = json.status_code;
            const statusMsg = json.status_msg || '';
            const commentInfo = json.comment_info;

            if (statusCode === 0 && commentInfo) {
              // ✅ 成功 - status_code=0 且有 comment_info
              apiResponses.replySuccess = {
                timestamp: Date.now(),
                url,
                status,
                statusCode: statusCode,
                statusMsg: statusMsg,
                commentId: commentInfo.comment_id,
                data: json
              };
              logger.info(`✅✅✅ Reply SUCCESS ✅✅✅`);
              logger.info(`    Status Code: ${statusCode}`);
              logger.info(`    Comment ID: ${commentInfo.comment_id}`);
              logger.info(`    Create Time: ${commentInfo.create_time}`);
              logger.info(`    Reply Text: ${commentInfo.text}`);
            } else if (statusCode !== 0 && statusCode !== undefined) {
              // ❌ 失败 - status_code 非 0（表示 API 错误）
              apiResponses.replyError = {
                timestamp: Date.now(),
                url,
                status,
                status_code: statusCode,
                status_msg: statusMsg,
                error_msg: statusMsg || '未知错误',
                data: json
              };
              logger.warn(`❌❌❌ Reply FAILED ❌❌❌`);
              logger.warn(`    Status Code: ${statusCode}`);
              logger.warn(`    Error Message: ${statusMsg}`);
            } else if (status >= 400) {
              // ❌ HTTP 错误状态码
              apiResponses.replyError = {
                timestamp: Date.now(),
                url,
                status,
                status_code: status,
                error_msg: json.error_msg || json.message || `HTTP ${status} Error`,
                data: json
              };
              logger.warn(`❌ HTTP Error: ${status}`);
            } else {
              logger.warn('⚠️ Unexpected response format');
              if (json.status_msg) {
                apiResponses.replyError = {
                  timestamp: Date.now(),
                  url,
                  status,
                  status_code: json.status_code || -1,
                  status_msg: json.status_msg,
                  error_msg: json.status_msg,
                  data: json
                };
                logger.warn(`❌ Found status_msg: ${json.status_msg}`);
              }
            }
          }).catch((parseError) => {
            logger.error('❌ Failed to parse reply API response:', parseError.message);
            // 尝试获取文本响应作为备选
            response.text().then((text) => {
              logger.error('    Response text:', text.substring(0, 200));
            }).catch(() => {
              logger.error('    Could not get response text either');
            });
          });
        }
      };

      page.on('response', apiInterceptHandler);
      logger.info('✅ API interceptor enabled for reply tracking');

      // 3. 导航到创作者中心评论管理页面（新标签页方式，与私信回复保持一致）
      const commentManagementUrl = 'https://creator.douyin.com/creator-micro/interactive/comment';
      logger.info('Navigating to creator center comment management page in new tab');

      try {
        await page.goto(commentManagementUrl, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        await page.waitForTimeout(2000);
        logger.info('✅ Successfully navigated to comment management page');
      } catch (navError) {
        logger.error('Navigation to comment management page failed:', navError.message);
        throw new Error(`Failed to navigate to comment page: ${navError.message}`);
      }

      // 3. 选择对应的视频（需要根据 video_id 查找并点击）
      if (video_id) {
        logger.info(`Selecting video: ${video_id}`);

        try {
          // 首先尝试点击"选择作品"按钮，可能有多种选择器
          let clickedSelectButton = false;

          // 尝试多个选择器
          const selectSelectors = [
            'button:has-text("选择作品")',
            'span:has-text("选择作品")',
            '[class*="select"][class*="work"]',
            'button[class*="SelectWork"]',
          ];

          for (const selector of selectSelectors) {
            try {
              const elements = await page.$$(selector);
              if (elements.length > 0) {
                logger.info(`Found select button with selector: ${selector}`);
                await page.click(selector, { timeout: 3000 });
                clickedSelectButton = true;
                break;
              }
            } catch (e) {
              logger.debug(`Selector ${selector} not found, trying next...`);
            }
          }

          if (clickedSelectButton) {
            await page.waitForTimeout(1500);
          }

          // 获取所有视频元素 - 使用更灵活的查询方式
          const result = await page.evaluate((vid) => {
            logger.info(`Looking for video with ID: ${vid}`);

            // 方法1：查找所有包含视频信息的容器
            const containers = document.querySelectorAll('[class*="container"], [class*="item"], .work-item, [class*="video"]');

            for (let i = 0; i < containers.length; i++) {
              const container = containers[i];
              const text = container.textContent || '';
              const html = container.outerHTML || '';

              // 在文本或HTML中查找video_id
              if (text.includes(vid) || html.includes(vid)) {
                logger.info(`Found video at index ${i}`);
                return { found: true, index: i, method: 'text_search' };
              }
            }

            // 方法2：如果第一个视频容器存在，就使用它
            if (containers.length > 0) {
              logger.info(`Using first video container (${containers.length} total found)`);
              return { found: true, index: 0, method: 'first_container' };
            }

            logger.warn(`Video ${vid} not found in DOM`);
            return { found: false };
          }, video_id);

          if (result && result.found) {
            logger.info(`Found video using method: ${result.method}, clicking index ${result.index}`);

            // 点击视频
            await page.evaluate((idx) => {
              const containers = document.querySelectorAll('[class*="container"], [class*="item"], .work-item, [class*="video"]');
              if (idx < containers.length) {
                containers[idx].click();
                logger.info(`Clicked video at index ${idx}`);
              }
            }, result.index);

            await page.waitForTimeout(2000);
            logger.info('✅ Video selected successfully');
          } else {
            logger.warn(`Video ${video_id} not found, continuing with current selection`);
          }
        } catch (selectError) {
          logger.warn(`Failed to select video: ${selectError.message}, continuing anyway`);
        }
      } else {
        logger.warn('No video_id provided, using current video selection');
      }

      // 4. 定位要回复的评论（从虚拟列表/DOM中查找）
      logger.info(`Locating comment: ${target_id}`);

      // 抖音创作者中心评论列表结构分析：
      // - 评论项 class: .container-sXKyMs
      // - 没有 data-comment-id 或 id 属性
      // - 通过内容（用户名、时间戳、评论文本）来定位

      // 方案 1: 通过 target_id 如果它是用户名或内容哈希
      let commentElement = null;

      // 首先尝试通过标准 data 属性（备选）
      const commentSelectors = [
        `[data-comment-id="${target_id}"]`,
        `[data-cid="${target_id}"]`,
        `[class*="comment"][id*="${target_id}"]`,
      ];

      for (const selector of commentSelectors) {
        try {
          commentElement = await page.$(selector);
          if (commentElement) {
            logger.debug(`Found comment with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      // 方案 2: 如果上述方法失败，通过内容在 .container-sXKyMs 中查找
      if (!commentElement) {
        logger.warn(`Comment not found via data attributes, trying content matching`);

        // 获取所有评论项
        const allComments = await page.$$('.container-sXKyMs');
        logger.info(`Found ${allComments.length} comment items in DOM`);

        // 尝试通过内容匹配找到目标评论
        for (let i = 0; i < allComments.length; i++) {
          const text = await allComments[i].textContent();
          // target_id 可能是用户名、或内容的一部分、或时间戳
          if (text.includes(target_id) || target_id.includes(text.substring(0, 10))) {
            commentElement = allComments[i];
            logger.info(`Found comment by content matching at index ${i}`);
            break;
          }
        }
      }

      // 方案 3: 备选方案 - 使用第一条评论
      if (!commentElement) {
        logger.warn(`Comment ${target_id} not found by content, will try first comment`);
        const comments = await page.$$('.container-sXKyMs');
        if (comments.length > 0) {
          commentElement = comments[0];
          logger.info(`Using first comment in list as fallback`);
        }
      }

      if (!commentElement) {
        throw new Error(`Comment ${target_id} not found on page`);
      }

      // 5. 点击回复按钮
      logger.info('Clicking reply button');

      // 抖音创作者中心的回复按钮结构：
      // - 在 operations-WFV7Am 容器中
      // - 是一个 div.item-M3fSkJ 元素
      // - 包含文本"回复"

      const replyButtonSelectors = [
        '.item-M3fSkJ',  // 抖音创作者中心的标准回复按钮 class
        'div:has-text("回复")',  // 包含"回复"文本的 div
        '[class*="reply"]',  // 通用回复按钮
        'button:has-text("回复")',
        '[class*="reply-btn"]',
      ];

      let replyBtn = null;
      for (const selector of replyButtonSelectors) {
        try {
          replyBtn = await commentElement.$(selector);
          if (replyBtn) {
            logger.debug(`Found reply button with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (!replyBtn) {
        // 尝试找到整个页面上的回复按钮（备选方案）
        replyBtn = await page.$('.item-M3fSkJ');
      }

      if (replyBtn) {
        try {
          // 检查并关闭可能阻挡交互的模态框
          const modalMasks = await page.$$('.douyin-creator-interactive-sidesheet-mask, [class*="mask"], [class*="modal"]');
          if (modalMasks.length > 0) {
            logger.info(`Found ${modalMasks.length} potential modal masks, attempting to close them`);

            // 尝试找到关闭按钮
            const closeButtons = await page.$$('[class*="close"], [aria-label*="close"], [title*="close"]');
            for (const closeBtn of closeButtons) {
              try {
                if (await closeBtn.isVisible()) {
                  await closeBtn.click();
                  await page.waitForTimeout(300);
                  logger.info('Closed modal via close button');
                  break;
                }
              } catch (e) {
                // Continue trying other close buttons
              }
            }
          }

          // 使用 JavaScript 点击而不是 Playwright 的 .click()
          const clicked = await page.evaluate((selector) => {
            const buttons = Array.from(document.querySelectorAll(selector));
            for (const btn of buttons) {
              if (btn.textContent.includes('回复')) {
                btn.click();
                return true;
              }
            }
            return false;
          }, '.item-M3fSkJ');

          if (clicked) {
            await page.waitForTimeout(1000);
            logger.info('Reply button clicked successfully via JavaScript');
          } else {
            // Fallback to Playwright click
            await replyBtn.click();
            await page.waitForTimeout(1000);
            logger.info('Reply button clicked successfully via Playwright');
          }
        } catch (error) {
          logger.warn(`Error clicking reply button: ${error.message}, will try to proceed with input`);
        }
      } else {
        logger.warn('Reply button not found, will try to proceed with input');
      }

      // 5. 定位并填充回复输入框
      logger.info('Locating reply input field');

      const inputSelectors = [
        'div[contenteditable="true"]',  // 抖音当前使用的输入框格式
        'textarea[placeholder*="回复"]',
        'input[placeholder*="回复"]',
        '[class*="reply-input"] textarea',
        '[class*="reply-input"] input',
        'textarea[class*="input"]',
        'input[class*="reply"]',
        'textarea',
        'input[type="text"]',
      ];

      let replyInput = null;
      for (const selector of inputSelectors) {
        try {
          replyInput = await page.$(selector);
          if (replyInput && await replyInput.isVisible()) {
            logger.debug(`Found reply input with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (!replyInput) {
        throw new Error('Reply input field not found');
      }

      // 清空输入框（防止有默认文本）
      await replyInput.fill('');
      await page.waitForTimeout(300);

      // 输入回复内容
      logger.info('Typing reply content');
      await replyInput.type(reply_content, { delay: 50 }); // 使用 type 而不是 fill，更真实
      await page.waitForTimeout(500);

      // 6. 提交回复
      logger.info('🔘 Submitting reply');

      // 先尝试在浏览器中直接点击发送按钮
      logger.debug('Attempting to click submit button via JavaScript...');
      const submitBtnClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn = buttons.find(btn =>
          btn.textContent.includes('发送') ||
          btn.textContent.includes('回复') ||
          btn.getAttribute('type') === 'submit'
        );

        if (submitBtn && !submitBtn.disabled) {
          console.log('[JS] Clicking submit button:', submitBtn.textContent);
          submitBtn.click();
          return true;
        }
        console.log('[JS] No valid submit button found. Found buttons:', buttons.map(b => b.textContent).join(', '));
        return false;
      });

      if (submitBtnClicked) {
        logger.info('✅ Submit button clicked via JavaScript - 🔴 **API 拦截器应该立即被触发！**');
        await page.waitForTimeout(500);
      } else {
        // 备选方案：通过选择器找到按钮后点击
        logger.warn('⚠️ JavaScript click failed, trying selector approach');

        let submitBtn = null;
        const submitButtonSelectors = [
          'button:has-text("发送")',  // Playwright 特定选择器
          '[class*="submit"] button',
          '[class*="send"] button',
          'button[type="submit"]',
          '[class*="reply-input"] button',
        ];

        for (const selector of submitButtonSelectors) {
          try {
            submitBtn = await page.$(selector);
            if (submitBtn && await submitBtn.isVisible()) {
              logger.debug(`Found submit button with selector: ${selector}`);
              await submitBtn.click();
              logger.info('Submit button clicked via selector');
              break;
            }
          } catch (e) {
            // 继续尝试
          }
        }

        // 最后的备选方案：按 Enter 键提交
        if (!submitBtn) {
          logger.info('No submit button found, trying Enter key');
          await replyInput.press('Enter');
        }
      }

      // 7. 等待 API 响应（最多 5 秒）
      logger.info('⏳ Waiting for reply API response (max 5 seconds)...');
      let waitCount = 0;
      const maxWait = 50; // 5 秒（50 × 100ms）

      while (
        !apiResponses.replySuccess &&
        !apiResponses.replyError &&
        waitCount < maxWait
      ) {
        if (waitCount % 10 === 0) {
          logger.debug(`⏳ Still waiting for API response... (${waitCount * 100}ms elapsed)`);
        }
        await page.waitForTimeout(100);
        waitCount++;
      }

      logger.info('📊 Reply API response check completed', {
        hasSuccess: !!apiResponses.replySuccess,
        hasError: !!apiResponses.replyError,
        waitTime: `${waitCount * 100}ms`,
        totalWaitIterations: waitCount,
        maxIterations: maxWait
      });

      // 8. 根据 API 响应判断成功或失败
      if (apiResponses.replySuccess) {
        logger.info('✅ Reply API response SUCCESS intercepted!', {
          commentId: target_id,
          statusCode: apiResponses.replySuccess.data?.status_code,
          replyId: apiResponses.replySuccess.data?.data?.reply_id,
          apiData: apiResponses.replySuccess.data
        });

        return {
          success: true,
          platform_reply_id: apiResponses.replySuccess.data?.data?.reply_id || `${target_id}_${Date.now()}`,
          data: {
            comment_id: target_id,
            reply_content,
            api_status_code: apiResponses.replySuccess.data?.status_code,
            api_response: apiResponses.replySuccess.data,
            timestamp: new Date().toISOString(),
          },
        };
      }

      if (apiResponses.replyError) {
        logger.warn('❌ Reply API response ERROR intercepted!', {
          commentId: target_id,
          statusCode: apiResponses.replyError.status_code,
          errorMsg: apiResponses.replyError.error_msg,
          apiData: apiResponses.replyError.data
        });

        return {
          success: false,
          status: 'blocked',
          reason: apiResponses.replyError.error_msg || '回复失败',
          data: {
            comment_id: target_id,
            reply_content,
            api_status_code: apiResponses.replyError.status_code,
            api_error_msg: apiResponses.replyError.error_msg,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // 9. 如果没有拦截到 API 响应，退回到 DOM 错误检查
      logger.warn('No reply API response intercepted, falling back to DOM error check');

      const replyStatus = await page.evaluate(() => {
        // 查找所有可能的错误或成功消息
        const errorSelectors = [
          '[class*="error"]',
          '[class*="alert"]',
          '[role="alert"]',
          '[class*="tip"]',
          '[class*="message"]'
        ];

        let errorMessage = null;
        let errorElement = null;

        for (const selector of errorSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent.trim();
            // 检查是否是错误信息
            if (text && (
              text.includes('无法') ||
              text.includes('失败') ||
              text.includes('error') ||
              text.includes('Error') ||
              text.includes('禁') ||
              text.includes('限制')
            )) {
              errorMessage = text;
              errorElement = el;
              break;
            }
          }
          if (errorMessage) break;
        }

        return {
          hasError: !!errorMessage,
          errorMessage: errorMessage,
          errorElement: errorElement ? {
            className: errorElement.className,
            text: errorElement.textContent.substring(0, 200)
          } : null
        };
      });

      // 检查是否有错误
      if (replyStatus.hasError && replyStatus.errorMessage) {
        logger.warn(`[Douyin] Reply blocked with error: ${replyStatus.errorMessage}`, {
          accountId,
          commentId: target_id,
          errorMessage: replyStatus.errorMessage,
        });

        // 保存错误状态截图
        try {
          await this.takeScreenshot(accountId, `reply_blocked_${Date.now()}.png`);
        } catch (screenshotError) {
          logger.warn('Failed to take screenshot:', screenshotError.message);
        }

        // 返回错误状态（不抛出异常）
        return {
          success: false,
          status: 'blocked',
          reason: replyStatus.errorMessage,
          data: {
            comment_id: target_id,
            reply_content,
            error_message: replyStatus.errorMessage,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // 如果没有错误，认为回复成功
      logger.info('Reply submitted successfully (fallback: no errors detected)', {
        commentId: target_id,
      });

      // 返回成功结果
      return {
        success: true,
        platform_reply_id: `${target_id}_${Date.now()}`, // 生成回复ID
        data: {
          comment_id: target_id,
          reply_content,
          timestamp: new Date().toISOString(),
        },
      };

    } catch (error) {
      logger.error(`❌ [Douyin] Failed to reply to comment: ${target_id}`, {
        error: error.message,
        errorStack: error.stack,
        accountId,
      });

      // 详细日志：捕获异常时检查 API 拦截器状态
      logger.error('⚠️ Exception occurred - checking API interceptor state', {
        hasReplySuccess: !!apiResponses?.replySuccess,
        hasReplyError: !!apiResponses?.replyError,
        errorName: error.name,
        errorMessage: error.message,
      });

      // 保存错误截图用于调试
      if (page) {
        try {
          await this.takeScreenshot(accountId, `reply_error_${Date.now()}.png`);
          logger.info('Error screenshot saved');
        } catch (screenshotError) {
          logger.warn('Failed to take screenshot:', screenshotError.message);
        }
      }

      // 返回错误状态而不是抛出异常
      return {
        success: false,
        status: 'error',
        reason: error.message,
        data: {
          comment_id: target_id,
          reply_content,
          error_message: error.message,
          timestamp: new Date().toISOString(),
        },
      };

    } finally {
      // 清理临时标签页 - 回复完成后立即关闭
      // ⭐ 使用 TabManager 关闭评论回复窗口
      if (page && replyTabId) {
        try {
          if (!page.isClosed()) {
            logger.info('✅ Comment reply task completed - closing reply tab', {
              hasReplySuccess: !!apiResponses?.replySuccess,
              hasReplyError: !!apiResponses?.replyError,
              accountId,
              tabId: replyTabId
            });
            // 使用 TabManager 关闭标签页
            await this.browserManager.tabManager.closeTab(accountId, replyTabId);
            logger.info('✅ Reply tab closed via TabManager');
          } else {
            logger.warn('ℹ️ Reply page was already closed');
          }
        } catch (closeError) {
          logger.warn('Error closing reply tab:', closeError.message);
        }
      }
    }
  }

  /**
   * 回复私信
   * @param {string} accountId - 账户 ID
   * @param {Object} options - 回复选项
   *   - target_id: string - 被回复的私信 ID
   *   - reply_content: string - 回复内容
   *   - context: object - 上下文信息
   *   - browserManager: BrowserManager
   * @returns {Promise<{platform_reply_id?, data?}>}
   */
  async replyToDirectMessage(accountId, options) {
    // Phase 10: 增强 ID 处理 + API 拦截 (支持 conversation_id 为主标识)
    const {
      target_id,           // 向后兼容
      conversation_id,     // Phase 9 新增 (优先使用)
      platform_message_id, // Phase 9 新增 (可选，用于精确定位消息)
      reply_content,
      context = {},
      browserManager
    } = options;

    // 确定最终使用的会话 ID
    const finalConversationId = conversation_id || target_id;
    const finalPlatformMessageId = platform_message_id;
    const { sender_id, platform_user_id } = context;

    let page = null;
    const apiResponses = { conversationMessages: [] }; // Phase 10: 新增 API 响应缓存

    try {
      logger.info(`[Douyin] Replying to conversation: ${finalConversationId}`, {
        accountId,
        conversationId: finalConversationId,
        platformMessageId: finalPlatformMessageId,  // Phase 9: 新增
        senderId: sender_id,
        replyContent: reply_content.substring(0, 50),
      });

      // 1. 获取临时标签页处理回复
      // ⭐ 使用 TabManager 获取私信回复专用临时窗口
      // 特性：临时窗口，回复完成后立即关闭，不干扰爬虫任务
      const { tabId, page: replyPage, shouldClose } = await this.browserManager.tabManager.getPageForTask(accountId, {
        tag: TabTag.REPLY_DM,
        persistent: false,     // 回复完成后关闭
        shareable: false,      // 独立窗口
        forceNew: true         // 每次回复创建新窗口
      });

      page = replyPage;
      const replyTabId = tabId;

      logger.info(`[Douyin] 为私信回复任务获取临时标签页`, {
        accountId,
        purpose: 'direct_message_reply',
        conversationId: finalConversationId,
        tabId: replyTabId
      });

      // 设置超时
      page.setDefaultTimeout(30000);

      // Phase 10: 新增 API 拦截以获取完整 ID 信息
      await this.setupDMAPIInterceptors(page, apiResponses);

      // 2. 导航到创作者中心私信管理页面（已验证的真实页面）
      const dmUrl = 'https://creator.douyin.com/creator-micro/data/following/chat';
      logger.info('Navigating to creator center direct message management page');

      try {
        await page.goto(dmUrl, {
          waitUntil: 'networkidle',
          timeout: 30000
        });
        await page.waitForTimeout(2000);
      } catch (navError) {
        logger.error('Navigation to creator center failed:', navError.message);
        throw new Error(`Failed to navigate to DM page: ${navError.message}`);
      }

      // 3. 定位私信列表中的消息项（已验证：[role="grid"] [role="listitem"]）
      logger.info(`Locating message in list: ${target_id}`);

      // 使用多维度匹配策略查找消息（优先级：内容 > ID > 发送者+时间 > 索引）
      const searchCriteria = {
        content: context.conversation_title,      // 从上下文获取对话主题
        senderName: context.sender_name,          // 发送者名称
        timeIndicator: context.message_time,      // 时间指示
        index: 0                                  // 索引作为最后备选
      };

      const targetMessageItem = await this.findMessageItemInVirtualList(
        page,
        target_id,
        searchCriteria
      );

      logger.debug(`Located target message item`);
      if (!targetMessageItem) {
        throw new Error(`Failed to locate message ${target_id} in virtual list`);
      }

      // 4. 点击消息项打开对话（已验证）
      logger.info('Clicking message item to open conversation');
      await targetMessageItem.click();
      await page.waitForTimeout(1500);

      // 5. 定位输入框（已验证的选择器：div[contenteditable="true"]）
      logger.info('Locating message input field');

      const inputSelectors = [
        'div[contenteditable="true"]',  // 抖音创作者中心已验证的选择器
        '[class*="chat-input"]',         // 备选
      ];

      let dmInput = null;
      for (const selector of inputSelectors) {
        try {
          dmInput = await page.$(selector);
          if (dmInput && await dmInput.isVisible()) {
            logger.debug(`Found input with selector: ${selector}`);
            break;
          }
        } catch (e) {
          logger.debug(`Selector ${selector} not found:`, e.message);
        }
      }

      if (!dmInput) {
        throw new Error('Message input field (contenteditable div) not found');
      }

      // 6. 激活输入框并清空
      logger.info('Activating input field');
      await dmInput.click();
      await page.waitForTimeout(500);

      // 清空任何现有内容
      await dmInput.evaluate(el => el.textContent = '');
      await page.waitForTimeout(300);

      // 7. 输入回复内容（改进：使用fill()支持正确的中文字符）
      logger.info('Typing reply content');
      // 使用fill()而不是type()，fill()对Unicode处理更好
      await dmInput.fill(reply_content);
      // 触发事件确保React检测到变化
      await dmInput.evaluate(el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // 也设置内部值以防某些框架需要
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      });
      await page.waitForTimeout(800);

      // 8. 查找并点击发送按钮
      logger.info('Looking for send button');

      let sendButtonClicked = false;

      // 方法1：使用 locator 查找包含"发送"文本的button并点击
      try {
        const btn = await page.locator('button').filter({ hasText: '发送' }).first();
        const isVisible = await btn.isVisible({ timeout: 3000 });
        if (isVisible) {
          logger.info('Found send button via locator, clicking it');
          await btn.click();
          sendButtonClicked = true;
        }
      } catch (e) {
        logger.debug('Locator method failed:', e.message);
      }

      // 方法2：如果locator失败，用evaluate直接点击
      if (!sendButtonClicked) {
        try {
          const clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const sendBtn = buttons.find(b => {
              const text = b.textContent?.trim() || '';
              return text === '发送' || text.includes('发送');
            });
            if (sendBtn && !sendBtn.disabled) {
              logger.info('Clicking send button via evaluate');
              sendBtn.click();
              return true;
            }
            return false;
          });
          if (clicked) {
            logger.info('Send button clicked via evaluate');
            sendButtonClicked = true;
          }
        } catch (e) {
          logger.debug('Evaluate method failed:', e.message);
        }
      }

      // 方法3：如果还是没点到，尝试按Enter键
      if (!sendButtonClicked) {
        logger.info('Send button not found, using Enter key as fallback');
        await dmInput.press('Enter');
      }

      // 9. 等待消息发送完成 - 监听网络活动或使用高级等待策略
      logger.info('Waiting for message to be sent - monitoring network activity');

      try {
        // 等待所有网络连接稳定（networkidle2 = 至少2个连接空闲）
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        logger.info('Network activity settled after sending message');
      } catch (networkError) {
        // 如果network idle超时，继续进行（可能有持久连接）
        logger.debug('Network idle timeout (may have persistent connections), continuing anyway');
        await page.waitForTimeout(2000);  // 至少等待2秒
      }

      // 10. 检查错误消息或限制提示
      logger.info('Checking for error messages or restrictions');

      const dmReplyStatus = await page.evaluate(() => {
        // 查找所有可能的错误或限制消息
        const errorSelectors = [
          '[class*="error"]',
          '[class*="alert"]',
          '[role="alert"]',
          '[class*="tip"]',
          '[class*="message"]',
          '[class*="toast"]',
          '[class*="notification"]'
        ];

        let errorMessage = null;
        let errorElement = null;

        for (const selector of errorSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent.trim();
            // 检查是否是错误或限制消息
            if (text && (
              text.includes('无法') ||
              text.includes('失败') ||
              text.includes('error') ||
              text.includes('Error') ||
              text.includes('禁') ||
              text.includes('限制') ||
              text.includes('超出') ||
              text.includes('blocked') ||
              text.includes('restricted')
            )) {
              errorMessage = text;
              errorElement = el;
              break;
            }
          }
          if (errorMessage) break;
        }

        return {
          hasError: !!errorMessage,
          errorMessage: errorMessage,
          errorElement: errorElement ? {
            className: errorElement.className,
            text: errorElement.textContent.substring(0, 200)
          } : null
        };
      });

      // 检查是否有错误
      if (dmReplyStatus.hasError && dmReplyStatus.errorMessage) {
        logger.warn(`[Douyin] DM reply blocked with error: ${dmReplyStatus.errorMessage}`, {
          accountId,
          messageId: target_id,
          senderId: sender_id,
          errorMessage: dmReplyStatus.errorMessage,
        });

        // 保存错误状态截图
        try {
          await this.takeScreenshot(accountId, `dm_reply_blocked_${Date.now()}.png`);
        } catch (screenshotError) {
          logger.warn('Failed to take screenshot:', screenshotError.message);
        }

        // 返回错误状态（不抛出异常）
        return {
          success: false,
          status: 'blocked',
          reason: dmReplyStatus.errorMessage,
          data: {
            message_id: target_id,
            sender_id,
            reply_content,
            error_message: dmReplyStatus.errorMessage,
            timestamp: new Date().toISOString(),
          },
        };
      }

      // 11. 验证消息发送成功
      const messageVerified = await page.evaluate((content) => {
        const messageElements = document.querySelectorAll('[class*="message"], [role="listitem"]');
        return Array.from(messageElements).some(msg => msg.textContent.includes(content));
      }, reply_content);

      logger.info(`Message sent ${messageVerified ? 'and verified' : '(verification pending)'}`);

      // 12. 返回成功结果
      return {
        success: true,
        platform_reply_id: `dm_${target_id || 'first'}_${Date.now()}`,
        data: {
          message_id: target_id,
          reply_content,
          sender_id,
          timestamp: new Date().toISOString(),
          url: dmUrl,
        },
      };

    } catch (error) {
      logger.error(`[Douyin] Failed to reply to direct message: ${target_id}`, {
        error: error.message,
        accountId,
        stack: error.stack,
      });

      // 保存错误截图用于诊断
      if (page) {
        try {
          await this.takeScreenshot(accountId, `dm_reply_error_${Date.now()}.png`);
          logger.info('Error screenshot saved');
        } catch (screenshotError) {
          logger.warn('Failed to take screenshot:', screenshotError.message);
        }
      }

      // 返回错误状态而不是抛出异常
      return {
        success: false,
        status: 'error',
        reason: error.message,
        data: {
          message_id: target_id,
          sender_id,
          reply_content,
          error_message: error.message,
          timestamp: new Date().toISOString(),
        },
      };

    } finally {
      // 清理临时标签页 - 回复完成后立即关闭
      // ⭐ 使用 TabManager 关闭私信回复窗口
      if (page && replyTabId) {
        try {
          // 确保只关闭这个特定的临时页面
          if (!page.isClosed()) {
            logger.info(`[Douyin] Closing temporary DM reply tab`, {
              accountId,
              conversationId: finalConversationId,
              tabId: replyTabId
            });
            // 使用 TabManager 关闭标签页
            await this.browserManager.tabManager.closeTab(accountId, replyTabId);
            logger.info('✅ DM reply tab closed via TabManager');
          }
        } catch (closeError) {
          // 页面可能已经关闭，忽略这个错误
          logger.debug('Error closing DM reply tab:', closeError.message);
        }
      }
    }
  }

  /**
   * 从 conversation_id 提取 platform_user_id (Phase 9 新增)
   * conversation_id 格式: conv_account-123_user-001
   *
   * @param {string} conversationId - 会话 ID
   * @returns {string|null} platform_user_id 或 null
   */
  extractUserIdFromConversationId(conversationId) {
    if (!conversationId) return null;
    const match = conversationId.match(/^conv_[^_]+_(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * 在虚拟列表中定位会话项 (Phase 9 新增)
   * 用于找到目标用户的对话
   *
   * @param {Page} page - Playwright 页面对象
   * @param {string} platformUserId - 平台用户 ID (要对话的用户)
   * @param {string} userName - 用户名 (可选，帮助定位)
   * @returns {Promise<Locator|null>} 会话项的 Locator 或 null
   */
  async findConversationByPlatformUser(page, platformUserId, userName) {
    logger.debug(`Finding conversation for platform user: ${platformUserId}`, {
      userName,
    });

    try {
      // 使用 Playwright Locator API 查找所有会话项
      const conversationItems = page.locator('[role="grid"] [role="listitem"]');
      const count = await conversationItems.count();

      logger.debug(`Found ${count} conversation items in virtual list`);

      // 逐个检查会话项是否匹配目标用户
      for (let i = 0; i < count; i++) {
        const item = conversationItems.nth(i);
        const text = await item.textContent();

        logger.debug(`Checking conversation item ${i}: ${text?.substring(0, 50)}...`);

        // 匹配条件: 用户名 或 用户 ID
        if ((userName && text?.includes(userName)) ||
            (platformUserId && text?.includes(platformUserId))) {
          logger.info(`Located conversation for user ${platformUserId} at index ${i}`);
          return item;
        }
      }

      logger.warn(`No conversation found for user ${platformUserId}`);
      return null;
    } catch (error) {
      logger.error('Error finding conversation by platform user:', error);
      return null;
    }
  }

  /**
   * 在已打开的对话中定位具体消息 (Phase 9 新增)
   * 用于精确定位要回复的消息
   *
   * @param {Page} page - Playwright 页面对象
   * @param {string} platformMessageId - 平台消息 ID
   * @param {Object} context - 上下文信息 (包含消息内容等)
   * @returns {Promise<Locator|null>} 消息项的 Locator 或 null
   */
  async findMessageInConversation(page, platformMessageId, context) {
    logger.debug(`Finding message in conversation: ${platformMessageId}`, {
      contentSnippet: context?.message_content?.substring(0, 30),
    });

    try {
      // 获取对话窗口中的所有消息项
      const messageItems = page.locator('[role="list"] [role="listitem"]');
      const count = await messageItems.count();

      logger.debug(`Found ${count} message items in conversation`);

      // 逐个检查消息项
      for (let i = 0; i < count; i++) {
        const item = messageItems.nth(i);
        const text = await item.textContent();

        logger.debug(`Checking message item ${i}: ${text?.substring(0, 50)}...`);

        // 匹配条件: 消息 ID 或 消息内容
        if ((platformMessageId && text?.includes(platformMessageId)) ||
            (context?.message_content && text?.includes(context.message_content))) {
          logger.info(`Located message ${platformMessageId} at index ${i}`);
          return item;
        }
      }

      logger.warn(`No message found with ID ${platformMessageId}`);
      return null;
    } catch (error) {
      logger.error('Error finding message in conversation:', error);
      return null;
    }
  }

  /**
   * 创建抖音平台的 DataManager
   * @param {string} accountId - 账户 ID
   * @returns {Promise<DouyinDataManager>}
   */
  async createDataManager(accountId) {
    const { DouyinDataManager } = require('./douyin-data-manager');
    logger.info(`Creating DouyinDataManager for account ${accountId}`);

    const dataManager = new DouyinDataManager(accountId, this.dataPusher);
    logger.info(`✅ DouyinDataManager created for account ${accountId}`);

    return dataManager;
  }

  /**
   * 清理资源
   * @param {string} accountId - 账户 ID
   */
  async cleanup(accountId) {
    logger.info(`Cleaning up Douyin platform for account ${accountId}`);

    // ⭐ 页面现在由 BrowserManager 统一管理和清理
    // 不再需要手动管理 this.currentPage

    // 调用基类清理（清理浏览器上下文等）
    await super.cleanup(accountId);

    logger.info(`Douyin platform cleaned up for account ${accountId}`);
  }
}

module.exports = DouyinPlatform;
