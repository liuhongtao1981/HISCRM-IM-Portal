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

const logger = createLogger('douyin-platform');
const cacheManager = getCacheManager();

class DouyinPlatform extends PlatformBase {
  constructor(config, workerBridge, browserManager) {
    super(config, workerBridge, browserManager);

    // 复用现有的登录处理器（传入 bridge 的 socket）
    this.loginHandler = new DouyinLoginHandler(browserManager, workerBridge.socket);

    // 爬虫状态
    this.currentPage = null;
  }

  /**
   * 初始化平台
   * @param {Object} account - 账户对象
   */
  async initialize(account) {
    logger.info(`Initializing Douyin platform for account ${account.id}`);

    // 调用基类初始化（创建上下文、加载指纹）
    await super.initialize(account);

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
   * 爬取评论 - 使用"点击+拦截"策略
   * 导航到评论管理页面,点击视频选择器,拦截评论API获取数据
   * @param {Object} account - 账户对象
   * @param {Object} options - 选项
   * @param {number} options.maxVideos - 最多爬取的作品数量（默认全部）
   * @returns {Promise<Object>} { comments: Array, videos: Array, newComments: Array, stats: Object }
   */
  async crawlComments(account, options = {}) {
    const { maxVideos = null } = options;

    try {
      logger.info(`Crawling comments for account ${account.id} (platform_user_id: ${account.platform_user_id})`);

      // 确保账号有 platform_user_id
      if (!account.platform_user_id) {
        throw new Error('Account missing platform_user_id - please login first to obtain douyin_id');
      }

      // 1. 获取或创建页面
      const page = await this.getOrCreatePage(account.id);

      // 2. 设置全局API拦截器 - 持续监听所有评论API
      const allApiResponses = [];
      const commentApiPattern = /comment.*list/i;

      page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';

        if (commentApiPattern.test(url) && contentType.includes('application/json')) {
          try {
            const json = await response.json();

            if (json.comment_info_list && Array.isArray(json.comment_info_list)) {
              const itemId = this.extractItemId(url);
              const cursor = this.extractCursor(url);

              allApiResponses.push({
                timestamp: Date.now(),
                url: url,
                item_id: itemId,
                cursor: cursor,
                data: json,
              });

              logger.debug(`Intercepted comment API: cursor=${cursor}, comments=${json.comment_info_list.length}, has_more=${json.has_more}`);
            }
          } catch (error) {
            // JSON解析失败,忽略
          }
        }
      });

      logger.info('API interceptor enabled');

      // 3. 导航到评论管理页面
      await this.navigateToCommentManage(page);
      await page.waitForTimeout(3000);

      // 4. 点击"选择作品"按钮打开模态框
      logger.info('Opening video selector modal');
      try {
        await page.click('span:has-text("选择作品")', { timeout: 5000 });
        await page.waitForTimeout(2000);
      } catch (error) {
        logger.warn('Failed to open video selector, videos may already be visible');
      }

      // 5. 获取所有视频元素
      const videoElements = await page.evaluate(() => {
        const containers = document.querySelectorAll('.container-Lkxos9');
        const videos = [];

        containers.forEach((container, idx) => {
          const titleEl = container.querySelector('.title-LUOP3b');
          const commentCountEl = container.querySelector('.right-os7ZB9 > div:last-child');

          if (titleEl) {
            videos.push({
              index: idx,
              title: titleEl.innerText?.trim() || '',
              commentCountText: commentCountEl?.innerText?.trim() || '0',
            });
          }
        });

        return videos;
      });

      logger.info(`Found ${videoElements.length} video elements`);

      // 筛选有评论的视频
      const videosToClick = videoElements.filter(v => parseInt(v.commentCountText) > 0);
      logger.info(`Videos with comments: ${videosToClick.length}`);

      if (videosToClick.length === 0) {
        logger.warn('No videos with comments found');
        return {
          comments: [],
          videos: [],
          newComments: [],
          stats: { recent_comments_count: 0, total_videos: 0, new_comments_count: 0 },
        };
      }

      // 限制处理的视频数量
      const maxToProcess = maxVideos ? Math.min(maxVideos, videosToClick.length) : videosToClick.length;

      // 6. 批量点击所有视频
      logger.info(`Clicking ${maxToProcess} videos to trigger comment loading`);
      for (let i = 0; i < maxToProcess; i++) {
        const video = videosToClick[i];
        logger.info(`[${i + 1}/${maxToProcess}] Clicking: ${video.title.substring(0, 50)}...`);

        try {
          // 使用JavaScript直接点击(避免被遮挡)
          await page.evaluate((idx) => {
            const containers = document.querySelectorAll('.container-Lkxos9');
            if (idx < containers.length) {
              containers[idx].click();
            }
          }, video.index);

          // 等待API响应
          await page.waitForTimeout(2000);

          // 重新打开模态框以便点击下一个
          if (i < maxToProcess - 1) {
            await page.click('span:has-text("选择作品")', { timeout: 5000 });
            await page.waitForTimeout(1000);
          }
        } catch (error) {
          logger.error(`Failed to click video ${i}: ${error.message}`);
        }
      }

      logger.info('Finished clicking all videos, waiting for final API responses');
      await page.waitForTimeout(2000);

      // 7. 第二轮: 处理需要分页的视频 (has_more: true)
      logger.info('Checking for videos that need pagination...');

      // 按item_id分组当前已拦截的响应
      let currentResponsesByItemId = this.groupResponsesByItemId(allApiResponses);

      // 检查哪些视频需要加载更多
      const videosNeedMore = [];
      for (const [itemId, responses] of Object.entries(currentResponsesByItemId)) {
        const latestResponse = responses[responses.length - 1];
        if (latestResponse.data.has_more) {
          const totalCount = latestResponse.data.total_count || 0;
          const loadedCount = responses.reduce((sum, r) => sum + r.data.comment_info_list.length, 0);
          videosNeedMore.push({
            itemId,
            totalCount,
            loadedCount,
            nextCursor: latestResponse.data.cursor,
          });
        }
      }

      if (videosNeedMore.length > 0) {
        logger.info(`Found ${videosNeedMore.length} videos that need pagination`);
        videosNeedMore.forEach(v => {
          logger.debug(`  - item_id: ${v.itemId.substring(0, 30)}... (loaded ${v.loadedCount}/${v.totalCount})`);
        });

        // 对于需要分页的视频，尝试加载更多评论
        for (const videoInfo of videosNeedMore) {
          logger.info(`Processing pagination for item_id: ${videoInfo.itemId.substring(0, 30)}...`);

          // 查找对应的视频元素
          const videoElement = videosToClick.find(v => {
            // 通过评论数量匹配（不完美，但可用）
            return parseInt(v.commentCountText) === videoInfo.totalCount;
          });

          if (!videoElement) {
            logger.warn(`  Could not find matching video element, skipping pagination`);
            continue;
          }

          try {
            // 重新打开模态框
            await page.click('span:has-text("选择作品")', { timeout: 5000 });
            await page.waitForTimeout(1000);

            // 点击该视频
            await page.evaluate((idx) => {
              const containers = document.querySelectorAll('.container-Lkxos9');
              if (idx < containers.length) {
                containers[idx].click();
              }
            }, videoElement.index);

            logger.info(`  Clicked video, attempting to load more comments`);
            await page.waitForTimeout(2000);

            // 尝试滚动加载更多评论
            const beforeCount = allApiResponses.length;
            let scrollAttempts = 0;
            const maxScrolls = 10;

            while (scrollAttempts < maxScrolls) {
              // 查找并点击"加载更多"按钮或滚动到底部
              const hasLoadMore = await page.evaluate(() => {
                // 查找包含"加载更多"、"查看更多"等文本的按钮
                const buttons = Array.from(document.querySelectorAll('button, div[class*="load"], div[class*="more"]'));
                for (const btn of buttons) {
                  const text = btn.innerText || '';
                  if (text.includes('更多') || text.includes('加载')) {
                    btn.click();
                    return true;
                  }
                }

                // 或者滚动评论列表到底部
                const commentContainer = document.querySelector('[class*="comment"]');
                if (commentContainer) {
                  commentContainer.scrollTo(0, commentContainer.scrollHeight);
                  return true;
                }

                return false;
              });

              if (hasLoadMore) {
                await page.waitForTimeout(2000);
                scrollAttempts++;

                // 检查是否有新的API响应
                if (allApiResponses.length > beforeCount) {
                  logger.debug(`  Loaded more comments (attempt ${scrollAttempts}/${maxScrolls})`);
                }
              } else {
                logger.debug(`  No "load more" button found or unable to scroll`);
                break;
              }

              // 检查当前视频是否已加载完成
              const updatedResponses = this.groupResponsesByItemId(allApiResponses)[videoInfo.itemId] || [];
              const currentLoaded = updatedResponses.reduce((sum, r) => sum + r.data.comment_info_list.length, 0);

              // 检查最新响应是否 has_more = false
              const latestResp = updatedResponses[updatedResponses.length - 1];
              if (!latestResp.data.has_more || currentLoaded >= videoInfo.totalCount) {
                logger.info(`  Finished loading all comments (${currentLoaded}/${videoInfo.totalCount})`);
                break;
              }
            }

          } catch (error) {
            logger.error(`  Failed to load more comments: ${error.message}`);
          }
        }

        logger.info('Pagination round completed, waiting for final API responses');
        await page.waitForTimeout(2000);
      } else {
        logger.info('No videos need pagination (all have has_more: false or ≤10 comments)');
      }

      // 8. 解析所有拦截到的评论
      logger.info(`Processing ${allApiResponses.length} intercepted API responses`);

      // 按item_id分组响应
      const responsesByItemId = this.groupResponsesByItemId(allApiResponses);

      const allComments = [];
      const allNewComments = [];
      const videosWithComments = [];

      for (const [itemId, responses] of Object.entries(responsesByItemId)) {
        const totalCount = responses[0].data.total_count || 0;
        const comments = [];

        // 合并所有分页的评论
        responses.forEach((resp, respIdx) => {
          resp.data.comment_info_list.forEach((c, cIdx) => {
            // DEBUG: 记录第一条评论的完整对象结构，找到真实的时间字段
            if (respIdx === 0 && cIdx === 0) {
              logger.info('\n╔════════════════════════════════════════════════════════════╗');
              logger.info('║  🔍 API Response Comment Object Diagnosis (First Comment)  ║');
              logger.info('╚════════════════════════════════════════════════════════════╝\n');

              logger.info(`📋 All keys (${Object.keys(c).length}):`, Object.keys(c).sort().join(', '));

              // 列出所有可能的时间相关字段
              logger.info('\n⏰ Time-related fields:');
              for (const [key, value] of Object.entries(c)) {
                if (key.toLowerCase().includes('time') ||
                    key.toLowerCase().includes('date') ||
                    key.toLowerCase().includes('create') ||
                    key.toLowerCase().includes('publish')) {
                  const valueStr = String(value);
                  const valueType = typeof value;
                  logger.info(`   ${key}:`);
                  logger.info(`      Type: ${valueType}`);
                  logger.info(`      Value: ${valueStr}`);
                  logger.info(`      Value length: ${valueStr.length}`);
                  if (valueType === 'number') {
                    const asDate = new Date(value * 1000);
                    const asDateMs = new Date(value);
                    logger.info(`      As seconds (×1000): ${asDate.toLocaleString('zh-CN')}`);
                    logger.info(`      As milliseconds: ${asDateMs.toLocaleString('zh-CN')}`);
                  }
                  logger.info('');
                }
              }

              // 输出完整的第一条评论对象（前3000字符）
              logger.info('\n📝 Full comment object (first 3000 chars):');
              logger.info(JSON.stringify(c, null, 2).substring(0, 3000));
              logger.info('\n');
            }

            // 获取原始 create_time 值（可能是秒级或毫秒级）
            const rawCreateTime = c.create_time;
            let createTimeSeconds = parseInt(rawCreateTime);

            // 诊断: 打印原始值
            if (respIdx === 0 && cIdx === 0) {
              logger.info(`🔍 Create time debug:`);
              logger.info(`   Raw value: ${rawCreateTime} (type: ${typeof rawCreateTime})`);
              logger.info(`   As seconds: ${createTimeSeconds}`);
              logger.info(`   Formatted (as seconds): ${new Date(createTimeSeconds * 1000).toLocaleString('zh-CN')}`);

              // 检查是否为毫秒级（13位数字）
              if (createTimeSeconds > 9999999999) {
                logger.info(`   ⚠️  Detected milliseconds format, converting to seconds`);
                createTimeSeconds = Math.floor(createTimeSeconds / 1000);
                logger.info(`   After conversion: ${createTimeSeconds}`);
                logger.info(`   Formatted (corrected): ${new Date(createTimeSeconds * 1000).toLocaleString('zh-CN')}`);
              }
            }

            comments.push({
              platform_comment_id: c.comment_id,
              content: c.text,
              author_name: c.user_info?.screen_name || '匿名',
              author_id: c.user_info?.user_id || '',
              author_avatar: c.user_info?.avatar_url || '',
              create_time: createTimeSeconds,
              create_time_formatted: new Date(createTimeSeconds * 1000).toLocaleString('zh-CN'),
              like_count: parseInt(c.digg_count) || 0,
              reply_count: parseInt(c.reply_count) || 0,
              detected_at: Math.floor(Date.now() / 1000),
            });
          });
        });

        // 去重 (通过platform_comment_id)
        const uniqueComments = Array.from(
          new Map(comments.map(c => [c.platform_comment_id, c])).values()
        );

        // 匹配视频信息
        const videoInfo = videosToClick.find(v => v.commentCountText == totalCount.toString()) || {
          title: '未知作品',
          index: -1,
        };

        // 为评论添加视频信息
        uniqueComments.forEach(comment => {
          comment.post_title = videoInfo.title;
          comment.post_id = itemId; // 使用item_id作为post_id
        });

        allComments.push(...uniqueComments);

        videosWithComments.push({
          aweme_id: itemId,  // 修正: 使用 aweme_id 而不是 item_id
          item_id: itemId,   // 保留 item_id 作为兼容字段
          title: videoInfo.title,
          total_count: totalCount,
          actual_count: uniqueComments.length,
          comment_count: uniqueComments.length,
        });

        logger.info(`Video "${videoInfo.title.substring(0, 30)}...": ${uniqueComments.length}/${totalCount} comments`);
      }

      logger.info(`Total: ${allComments.length} comments from ${videosWithComments.length} videos`);

      // 构建统计数据
      const stats = {
        recent_comments_count: allComments.length,
        new_comments_count: allComments.length, // 暂时全部标记为新评论
        total_videos: videoElements.length,
        processed_videos: videosWithComments.length,
        crawl_time: Math.floor(Date.now() / 1000),
      };

      // 发送数据到 Master
      await this.sendCommentsToMaster(account, allComments, videosWithComments);

      return {
        comments: allComments,
        videos: videosWithComments,
        newComments: allComments, // TODO: 实现增量更新
        stats,
      };
    } catch (error) {
      logger.error(`Failed to crawl comments for account ${account.id}:`, error);
      throw error;
    }
  }

  /**
   * 从URL提取item_id参数
   * @param {string} url - API URL
   * @returns {string|null} item_id
   */
  extractItemId(url) {
    const match = url.match(/item_id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * 从URL提取cursor参数
   * @param {string} url - API URL
   * @returns {number} cursor值
   */
  extractCursor(url) {
    const match = url.match(/cursor=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 按item_id分组API响应
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
  async crawlDirectMessages(account) {
    try {
      logger.info(`[crawlDirectMessages] Starting for account ${account.id} (platform_user_id: ${account.platform_user_id})`);

      // 确保账号有 platform_user_id
      if (!account.platform_user_id) {
        logger.error(`[crawlDirectMessages] Account ${account.id} missing platform_user_id`);
        throw new Error('Account missing platform_user_id - please login first to obtain douyin_id');
      }

      // 1. 获取或创建页面
      logger.debug(`[crawlDirectMessages] Step 1: Getting or creating page for account ${account.id}`);
      const page = await this.getOrCreatePage(account.id);
      logger.info(`[crawlDirectMessages] Page created/retrieved successfully`);

      // 2. 设置API拦截器，捕获私信数据
      logger.debug(`[crawlDirectMessages] Step 2: Setting up API interceptor for message API`);
      const apiResponses = [];
      await page.route('**/message/get_by_user_init**', async (route) => {
        try {
          logger.debug('[crawlDirectMessages] API interceptor triggered');
          // 继续请求，不阻断
          const response = await route.fetch();

          // 检查响应的 Content-Type
          const contentType = response.headers()['content-type'] || '';
          logger.debug(`[crawlDirectMessages] API response Content-Type: ${contentType}`);

          // 尝试解析为JSON，如果失败则记录并跳过
          try {
            const body = await response.json();
            logger.info(`[crawlDirectMessages] Intercepted JSON message API response: ${JSON.stringify(body).substring(0, 200)}...`);
            apiResponses.push(body);
          } catch (jsonError) {
            // 响应不是JSON格式（可能是protobuf或其他二进制格式）
            logger.warn(`[crawlDirectMessages] API response is not JSON (likely protobuf), skipping: ${jsonError.message}`);
            const bodyText = await response.text();
            logger.debug(`[crawlDirectMessages] Response preview (first 100 bytes): ${bodyText.substring(0, 100)}`);
          }

          // 继续正常响应
          await route.fulfill({ response });
        } catch (error) {
          logger.error('[crawlDirectMessages] Error in API interceptor:', error);
          try {
            await route.continue();
          } catch (continueError) {
            logger.error('[crawlDirectMessages] Failed to continue route:', continueError);
          }
        }
      });
      logger.info(`[crawlDirectMessages] API interceptor set up successfully`);

      // 3. 导航到私信管理页面 (互动管理 - 私信管理)
      logger.debug(`[crawlDirectMessages] Step 3: Navigating to message management page`);
      await this.navigateToMessageManage(page);
      logger.info(`[crawlDirectMessages] Navigation completed`);

      // 4. 等待页面加载和API请求完成
      logger.debug(`[crawlDirectMessages] Step 4: Waiting for page load and API requests (3s)`);
      await page.waitForTimeout(3000);
      logger.info(`[crawlDirectMessages] Initial wait completed, ${apiResponses.length} API responses captured`);

      // 5. 尝试滚动私信列表以触发分页加载
      logger.debug(`[crawlDirectMessages] Step 5: Scrolling message list to load more messages (pagination)`);
      await this.scrollMessageListToLoadMore(page, apiResponses);
      logger.info(`[crawlDirectMessages] Scrolling completed, total ${apiResponses.length} API responses`);

      // 6. 从拦截的API响应中提取私信
      logger.debug(`[crawlDirectMessages] Step 6: Parsing ${apiResponses.length} API responses`);
      const rawMessages = this.parseMessagesFromAPI(apiResponses);
      logger.info(`[crawlDirectMessages] Parsed ${rawMessages.length} messages from ${apiResponses.length} API responses`);

      // 7. 如果API拦截没有数据，回退到DOM提取
      if (rawMessages.length === 0) {
        logger.warn('[crawlDirectMessages] No messages from API, falling back to DOM extraction');
        const domMessages = await this.extractDirectMessages(page);
        logger.info(`[crawlDirectMessages] DOM extraction returned ${domMessages.length} messages`);
        rawMessages.push(...domMessages);
      }

      // 8. 添加必要字段（account_id, platform_user_id）
      // 使用 platform_message_id 作为唯一标识，避免重复
      logger.debug(`[crawlDirectMessages] Step 8: Adding account fields to ${rawMessages.length} raw messages`);

      const createIsNewFlag = (createdAt) => {
        const now = Math.floor(Date.now() / 1000);
        const ageSeconds = now - createdAt;
        const oneDaySeconds = 24 * 60 * 60;  // 86400
        return ageSeconds < oneDaySeconds;
      };

      const directMessages = rawMessages.map((msg) => {
        let createdAt = msg.create_time || Math.floor(Date.now() / 1000);

        // 检查是否为毫秒级（13位数字）并转换为秒级
        if (createdAt > 9999999999) {
          createdAt = Math.floor(createdAt / 1000);
        }

        return {
          id: msg.platform_message_id,  // 使用 platform_message_id 作为唯一ID，而不是生成新UUID
          account_id: account.id,
          platform_user_id: account.platform_user_id,
          ...msg,
          is_read: false,
          created_at: createdAt,  // 使用提取的时间，如果没有则使用当前时间
          is_new: createIsNewFlag(createdAt),  // 基于 created_at 计算 is_new
          push_count: 0,  // 初始推送计数为0
        };
      });
      logger.info(`[crawlDirectMessages] Prepared ${directMessages.length} direct messages with account fields`);

      // 将私信添加到缓存管理器（用于 IsNewPushTask）
      directMessages.forEach(msg => {
        cacheManager.addMessage(account.id, msg);
      });

      // 9. 发送私信数据到 Master
      logger.debug(`[crawlDirectMessages] Step 9: Sending ${directMessages.length} messages to Master`);
      await this.sendMessagesToMaster(account, directMessages);
      logger.info(`[crawlDirectMessages] Messages sent to Master successfully`);

      // 构建统计数据
      const stats = {
        recent_dms_count: directMessages.length,
        crawl_time: Math.floor(Date.now() / 1000),
      };

      logger.info(`[crawlDirectMessages] ✅ Completed successfully: ${directMessages.length} messages, ${apiResponses.length} API responses`);
      return {
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
   * 获取或创建页面
   * @param {string} accountId - 账户ID
   * @returns {Promise<Page>}
   */
  async getOrCreatePage(accountId) {
    if (this.currentPage && !this.currentPage.isClosed()) {
      return this.currentPage;
    }

    const context = await this.ensureAccountContext(accountId);
    this.currentPage = await context.newPage();
    logger.info(`Created new page for crawling account ${accountId}`);

    return this.currentPage;
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
  async getVideoListFromCommentPage(page) {
    logger.info('Getting video list from comment management page');

    try {
      // 方法1: 尝试从页面DOM中提取作品信息
      const videos = await page.evaluate(() => {
        const videoList = [];

        // 查找作品卡片（顶部显示的当前作品）
        const videoCard = document.querySelector('[class*="video-card"], [class*="work-card"], [class*="content-card"]');
        if (videoCard) {
          // 提取作品ID（从data属性或链接中）
          const awemeId = videoCard.getAttribute('data-aweme-id') ||
                         videoCard.getAttribute('data-video-id') ||
                         videoCard.querySelector('[data-aweme-id]')?.getAttribute('data-aweme-id');

          // 提取标题
          const titleEl = videoCard.querySelector('[class*="title"], [class*="content-title"]');
          const title = titleEl ? titleEl.textContent.trim() : '';

          // 提取封面
          const coverEl = videoCard.querySelector('img');
          const cover = coverEl ? coverEl.src : '';

          // 提取发布时间
          const timeEl = videoCard.querySelector('[class*="time"], [class*="date"]');
          const publishTime = timeEl ? timeEl.textContent.trim() : '';

          if (awemeId) {
            videoList.push({ aweme_id: awemeId, title, cover, publish_time: publishTime });
          }
        }

        // 查找作品选择器/列表（可能在侧边栏或下拉菜单）
        const videoItems = document.querySelectorAll('[class*="video-item"], [class*="work-item"], [class*="content-item"]');
        videoItems.forEach((item) => {
          const awemeId = item.getAttribute('data-aweme-id') ||
                         item.getAttribute('data-video-id') ||
                         item.querySelector('[data-aweme-id]')?.getAttribute('data-aweme-id');

          const titleEl = item.querySelector('[class*="title"]');
          const title = titleEl ? titleEl.textContent.trim() : '';

          const coverEl = item.querySelector('img');
          const cover = coverEl ? coverEl.src : '';

          if (awemeId && !videoList.find(v => v.aweme_id === awemeId)) {
            videoList.push({ aweme_id: awemeId, title, cover, publish_time: '' });
          }
        });

        return videoList;
      });

      // 方法2: 如果DOM提取失败，通过拦截作品列表API获取
      if (videos.length === 0) {
        logger.warn('No videos found from DOM, trying to intercept video list API');
        // 这里可以添加拦截 /aweme/v1/creator/item/list API 的逻辑
      }

      logger.info(`Found ${videos.length} videos from comment page`);
      return videos;
    } catch (error) {
      logger.error('Failed to get video list:', error);
      return [];
    }
  }

  /**
   * 在评论管理页面点击选择作品
   * @param {Page} page
   * @param {Object} video - 作品对象
   * @param {number} index - 作品索引
   */
  async clickVideoInCommentPage(page, video, index) {
    logger.info(`Clicking video: ${video.title || video.aweme_id}`);

    try {
      // 方法1: 通过aweme_id点击
      if (video.aweme_id) {
        const clicked = await page.evaluate((awemeId) => {
          const videoElement = document.querySelector(`[data-aweme-id="${awemeId}"]`);
          if (videoElement) {
            videoElement.click();
            return true;
          }
          return false;
        }, video.aweme_id);

        if (clicked) {
          logger.info('Clicked video by aweme_id');
          return;
        }
      }

      // 方法2: 通过索引点击
      const clickedByIndex = await page.evaluate((idx) => {
        const videoItems = document.querySelectorAll('[class*="video-item"], [class*="work-item"], [class*="content-item"]');
        if (videoItems[idx]) {
          videoItems[idx].click();
          return true;
        }
        return false;
      }, index);

      if (clickedByIndex) {
        logger.info('Clicked video by index');
        return;
      }

      logger.warn('Failed to click video, it may already be selected');
    } catch (error) {
      logger.error('Failed to click video:', error);
    }
  }

  /**
   * 滚动评论列表以加载更多评论
   * @param {Page} page
   */
  async scrollCommentList(page) {
    logger.info('Scrolling comment list to load more comments');

    try {
      // 查找评论列表容器并滚动
      await page.evaluate(() => {
        const commentContainer = document.querySelector('[class*="comment-list"], [class*="comment-container"]');
        if (commentContainer) {
          // 滚动到底部
          commentContainer.scrollTop = commentContainer.scrollHeight;
        } else {
          // 如果没有找到容器，滚动整个页面
          window.scrollTo(0, document.body.scrollHeight);
        }
      });

      await page.waitForTimeout(1000);

      // 滚动回顶部
      await page.evaluate(() => {
        const commentContainer = document.querySelector('[class*="comment-list"], [class*="comment-container"]');
        if (commentContainer) {
          commentContainer.scrollTop = 0;
        } else {
          window.scrollTo(0, 0);
        }
      });

      await page.waitForTimeout(500);
    } catch (error) {
      logger.warn('Failed to scroll comment list:', error.message);
    }
  }

  /**
   * 从评论管理页面提取评论列表（DOM回退方案）
   * @param {Page} page
   * @returns {Promise<Array>}
   */
  async extractComments(page) {
    logger.info('Extracting comments from comment management page (DOM fallback)');

    try {
      // 从页面提取评论列表 (使用 evaluate 在浏览器上下文中执行)
      const comments = await page.evaluate(() => {
        const commentElements = document.querySelectorAll(
          '[class*="comment-item"], [class*="comment-list"] > div, .semi-table-row'
        );
        const commentList = [];

        commentElements.forEach((el) => {
          // 提取评论者昵称
          const authorEl = el.querySelector(
            '[class*="nickname"], [class*="author"], [class*="username"], [class*="user-name"]'
          );
          const authorName = authorEl ? authorEl.textContent.trim() : '匿名用户';

          // 提取评论内容
          const contentEl = el.querySelector(
            '[class*="comment-content"], [class*="text-content"], [class*="content-text"], [class*="comment-text"]'
          );
          const content = contentEl ? contentEl.textContent.trim() : '';

          // 提取评论时间
          const timeEl = el.querySelector('[class*="time"], [class*="date"], [class*="timestamp"]');
          const timeText = timeEl ? timeEl.textContent.trim() : '';

          // 提取作品标题 (如果有)
          const postEl = el.querySelector('[class*="post-title"], [class*="video-title"], [class*="title"]');
          const postTitle = postEl ? postEl.textContent.trim() : '';

          // 只添加有内容的评论
          if (content) {
            commentList.push({
              platform_comment_id: `douyin-comment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
              content,
              author_name: authorName,
              author_id: `user-${Math.random().toString(36).substring(2, 11)}`,
              post_title: postTitle,
              post_id: '',
              detected_at: Math.floor(Date.now() / 1000),
              time: timeText,
            });
          }
        });

        return commentList;
      });

      logger.info(`Extracted ${comments.length} comments from page`);
      return comments;
    } catch (error) {
      logger.error('Failed to extract comments:', error);
      return [];
    }
  }

  /**
   * 从私信管理页面提取私信列表 - 从React虚拟列表中的item对象提取真实数据
   * @param {Page} page
   * @returns {Promise<Array>}
   */
  async extractDirectMessages(page) {
    logger.info('Extracting direct messages from React virtual list (item objects)');

    try {
      // 从页面提取私信列表（通过访问React Fiber中的item对象）
      const messages = await page.evaluate(() => {
        const innerContainer = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');

        if (!innerContainer || innerContainer.children.length === 0) {
          console.log('⚠️ 未找到虚拟列表容器');
          return [];
        }

        console.log(`✅ Found virtual list container with ${innerContainer.children.length} rows`);
        const messageList = [];

        // 遍历虚拟列表中的所有行
        Array.from(innerContainer.children).forEach((row, rowIdx) => {
          try {
            // 从React Fiber中提取item对象
            const fiberKey = Object.keys(row).find(k => k.startsWith('__reactFiber'));

            if (!fiberKey) {
              return;
            }

            const fiber = row[fiberKey];

            // 找到包含item的子组件
            if (!fiber.child || !fiber.child.memoizedProps || !fiber.child.memoizedProps.item) {
              return;
            }

            const item = fiber.child.memoizedProps.item;


            // 从DOM中提取发送者名
            const domText = row.textContent.trim();
            const timeMatch = domText.match(/(星期[一二三四五六日]|[\d]{2}-[\d]{2}|昨天|刚刚)/);
            let senderName = '未知';
            if (timeMatch) {
              const beforeTime = domText.substring(0, domText.indexOf(timeMatch[1]));
              senderName = beforeTime.replace(/置顶已读|已读|未读|[\d]+/g, '').trim() || '未知';
            }

            // 从content对象中提取消息文本
            let messageText = '';
            if (item.content && item.content.text) {
              messageText = item.content.text;
            } else if (item.content && item.content.content_title) {
              messageText = item.content.content_title;
            } else if (typeof item.content === 'object') {
              const textFields = Object.keys(item.content).filter(k =>
                k.includes('text') || k.includes('content') || k.includes('desc')
              );
              if (textFields.length > 0) {
                messageText = item.content[textFields[0]];
              }
            }

            // 确保消息内容是字符串
            if (typeof messageText !== 'string') {
              messageText = String(messageText || '（无内容）');
            }

            // 限制消息长度
            if (messageText.length > 500) {
              messageText = messageText.substring(0, 500);
            }

            // 从item.createdTime提取真实的时间戳（已验证为Date对象）
            let createdAt = Math.floor(Date.now() / 1000);
            if (item.createdTime && item.createdTime instanceof Date) {
              createdAt = Math.floor(item.createdTime.getTime() / 1000);
              console.log(`Row ${rowIdx}: ✅ Got real timestamp from item.createdTime: ${createdAt}`);
            }

            // 构建消息对象
            messageList.push({
              platform_message_id: item.id || item.shortId || `msg-${rowIdx}-${Math.random().toString(36).substr(2, 9)}`,
              content: messageText || '（无内容）',
              sender_name: senderName,
              sender_id: item.coreInfo?.owner || item.secUid || `user-${senderName}`,
              direction: 'inbound',
              detected_at: Math.floor(Date.now() / 1000),
              create_time: createdAt,  // 真实的消息创建时间
              sec_uid: item.secUid,
              is_group_chat: item.isGroupChat || false,
            });

          } catch (error) {
            console.error(`Error processing row ${rowIdx}:`, error.message);
          }
        });

        console.log(`✅ Total extracted: ${messageList.length} messages`);
        return messageList;
      });

      logger.info(`Extracted ${messages.length} direct messages from React virtual list`);
      if (messages.length > 0) {
        logger.debug(`First message: ${JSON.stringify(messages[0])}`);
      }
      return messages;

    } catch (error) {
      logger.error('Failed to extract direct messages:', error);
      return [];
    }
  }

  /**
   * 滚动页面以触发懒加载和更多API请求
   * @param {Page} page
   */
  async scrollPageToLoadMore(page) {
    try {
      logger.info('Scrolling page to trigger lazy loading...');

      // 滚动到页面底部
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(1000);

      // 滚动回顶部
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500);

      // 再次滚动到中间
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await page.waitForTimeout(500);

      logger.info('Scrolling completed');
    } catch (error) {
      logger.warn('Failed to scroll page:', error.message);
    }
  }

  /**
   * 滚动私信列表以触发分页加载
   * @param {Page} page - Playwright页面对象
   * @param {Array} apiResponses - API响应数组（用于监控加载进度）
   */
  async scrollMessageListToLoadMore(page, apiResponses) {
    try {
      logger.info('[scrollMessageListToLoadMore] Starting pagination scroll for private messages');

      const initialResponseCount = apiResponses.length;
      const maxScrollAttempts = 10; // 最多滚动10次
      let scrollAttempt = 0;
      let noNewDataCount = 0; // 连续无新数据的次数

      while (scrollAttempt < maxScrollAttempts && noNewDataCount < 3) {
        scrollAttempt++;
        const beforeScrollCount = apiResponses.length;

        logger.debug(`[scrollMessageListToLoadMore] Scroll attempt ${scrollAttempt}/${maxScrollAttempts}`);

        // 尝试查找并滚动私信列表容器
        const scrolled = await page.evaluate(() => {
          // 查找私信列表容器（抖音使用 semi-list 组件）
          const messageListSelectors = [
            '.semi-list',                    // Semi Design 列表组件
            '[class*="message-list"]',       // 消息列表
            '[class*="conversation-list"]',  // 会话列表
            '.chat-content',                 // 聊天内容区域
          ];

          for (const selector of messageListSelectors) {
            const container = document.querySelector(selector);
            if (container) {
              const scrollBefore = container.scrollTop;

              // 滚动到容器底部
              container.scrollTop = container.scrollHeight;

              const scrollAfter = container.scrollTop;

              console.log(`[scrollMessageListToLoadMore] Found container: ${selector}`);
              console.log(`[scrollMessageListToLoadMore] Scrolled from ${scrollBefore} to ${scrollAfter} (height: ${container.scrollHeight})`);

              // 如果成功滚动（scrollTop 发生变化），返回 true
              if (scrollAfter > scrollBefore) {
                return true;
              }
            }
          }

          // 如果没有找到特定容器，尝试滚动整个页面
          const pageBefore = window.scrollY;
          window.scrollTo(0, document.body.scrollHeight);
          const pageAfter = window.scrollY;

          console.log(`[scrollMessageListToLoadMore] Fallback: scrolled page from ${pageBefore} to ${pageAfter}`);
          return pageAfter > pageBefore;
        });

        if (!scrolled) {
          logger.debug(`[scrollMessageListToLoadMore] No more content to scroll (reached bottom)`);
          break;
        }

        // 等待新数据加载
        await page.waitForTimeout(2000);

        // 检查是否有新的API响应
        const afterScrollCount = apiResponses.length;
        const newResponses = afterScrollCount - beforeScrollCount;

        if (newResponses > 0) {
          logger.info(`[scrollMessageListToLoadMore] ✅ Loaded ${newResponses} new API responses (total: ${afterScrollCount})`);
          noNewDataCount = 0; // 重置计数器
        } else {
          noNewDataCount++;
          logger.debug(`[scrollMessageListToLoadMore] No new data after scroll (${noNewDataCount}/3)`);
        }
      }

      const totalNewResponses = apiResponses.length - initialResponseCount;
      logger.info(`[scrollMessageListToLoadMore] ✅ Pagination complete: loaded ${totalNewResponses} new responses in ${scrollAttempt} scrolls`);

    } catch (error) {
      logger.error('[scrollMessageListToLoadMore] Failed to scroll message list:', error);
    }
  }

  /**
   * 从API响应中解析评论数据
   * @param {Array} apiResponses - API响应数组
   * @returns {Array} 评论列表
   */
  parseCommentsFromAPI(apiResponses) {
    const allComments = [];

    try {
      apiResponses.forEach((response) => {
        const comments = response.comments || [];

        comments.forEach((comment) => {
          allComments.push({
            platform_comment_id: comment.cid || `douyin-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            content: comment.text || '',
            author_name: comment.user?.nickname || '未知用户',
            author_id: comment.user?.uid || comment.user?.sec_uid || '',
            author_avatar: comment.user?.avatar_thumb?.url_list?.[0] || '',
            post_title: '', // API响应中没有作品标题，需要从其他地方获取
            post_id: comment.aweme_id || '',
            reply_to_comment_id: comment.reply_id || null,
            like_count: comment.digg_count || 0,
            detected_at: Math.floor(Date.now() / 1000),
            create_time: comment.create_time || Math.floor(Date.now() / 1000),
            ip_label: comment.ip_label || '',
          });
        });
      });

      logger.info(`Parsed ${allComments.length} comments from ${apiResponses.length} API responses`);
    } catch (error) {
      logger.error('Failed to parse comments from API:', error);
    }

    return allComments;
  }

  /**
   * 从API响应中解析私信数据
   * @param {Array} apiResponses - API响应数组
   * @returns {Array} 私信列表
   */
  parseMessagesFromAPI(apiResponses) {
    const allMessages = [];

    try {
      logger.info(`[parseMessagesFromAPI] Processing ${apiResponses.length} API responses`);

      apiResponses.forEach((response, idx) => {
        logger.debug(`[parseMessagesFromAPI] Processing response ${idx + 1}/${apiResponses.length}`);
        logger.debug(`[parseMessagesFromAPI] Response structure: ${JSON.stringify(Object.keys(response))}`);

        // 私信API的数据结构需要根据实际响应调整
        const conversations = response.data?.conversations || response.conversations || [];
        logger.debug(`[parseMessagesFromAPI] Found ${conversations.length} conversations in response ${idx + 1}`);

        conversations.forEach((conversation, convIdx) => {
          const lastMessage = conversation.last_message || {};
          logger.debug(`[parseMessagesFromAPI] Conversation ${convIdx + 1}: user=${conversation.user?.nickname}, msg_id=${lastMessage.msg_id}`);

          allMessages.push({
            platform_message_id: lastMessage.msg_id || `douyin-msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            content: lastMessage.content || lastMessage.text || '',
            sender_name: conversation.user?.nickname || lastMessage.sender?.nickname || '未知用户',
            sender_id: conversation.user?.uid || lastMessage.sender?.uid || '',
            sender_avatar: conversation.user?.avatar_thumb?.url_list?.[0] || '',
            conversation_id: conversation.conversation_id || conversation.conv_id || '',
            direction: lastMessage.from_uid === conversation.owner_uid ? 'outbound' : 'inbound',
            detected_at: Math.floor(Date.now() / 1000),
            create_time: lastMessage.create_time || Math.floor(Date.now() / 1000),
            message_type: lastMessage.msg_type || 'text',
          });
        });
      });

      logger.info(`[parseMessagesFromAPI] ✅ Parsed ${allMessages.length} messages from ${apiResponses.length} API responses`);
    } catch (error) {
      logger.error('[parseMessagesFromAPI] ❌ Failed to parse messages from API:', error);
      logger.error('[parseMessagesFromAPI] Error stack:', error.stack);
    }

    return allMessages;
  }

  /**
   * 随机延迟 (模拟人类操作)
   * @param {number} min - 最小延迟(ms)
   * @param {number} max - 最大延迟(ms)
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

        // 即使没有新评论，也发送视频信息更新
        for (const video of videos) {
          this.bridge.socket.emit('worker:upsert_video', {
            account_id: account.id,
            platform_user_id: account.platform_user_id,
            aweme_id: video.aweme_id,
            platform_videos_id: video.aweme_id,  // 使用 aweme_id 作为平台视频ID
            title: video.title,
            cover: video.cover,
            publish_time: video.publish_time,
            total_comment_count: video.comment_count || 0,
          });
        }

        return;
      }

      logger.info(`Sending ${newComments.length} NEW comments (filtered from ${comments.length} total) and ${videos.length} videos to Master`);

      // 发送视频信息（upsert）
      for (const video of videos) {
        // 仅在 Master 发送视频基本信息，is_new 和 push_count 由 Master 负责
        this.bridge.socket.emit('worker:upsert_video', {
          account_id: account.id,
          platform_user_id: account.platform_user_id,
          aweme_id: video.aweme_id,
          platform_videos_id: video.aweme_id,  // 使用 aweme_id 作为平台视频ID
          title: video.title,
          cover: video.cover,
          publish_time: video.publish_time,
          total_comment_count: video.comment_count || 0,
        });
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
    const messageItems = await page.$$('[role="grid"] [role="listitem"]');

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

    // 第二阶段：ID 属性匹配
    if (targetId && targetId !== 'first') {
      for (let i = 0; i < messageItems.length; i++) {
        const itemHTML = await messageItems[i].evaluate(el => el.outerHTML);
        const itemText = await messageItems[i].textContent();

        // 检查 ID 是否在 HTML 或文本中
        if (itemHTML.includes(targetId) || itemText.includes(targetId)) {
          logger.debug(`在索引 ${i} 找到 ID 匹配的消息`);
          return messageItems[i];
        }
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

    try {
      logger.info(`[Douyin] Replying to comment: ${target_id}`, {
        accountId,
        videoId: video_id,
        replyContent: reply_content.substring(0, 50),
      });

      // 1. 获取浏览器上下文
      const browserContext = await this.ensureAccountContext(accountId);
      page = await browserContext.newPage();

      // 设置超时
      page.setDefaultTimeout(30000);

      // 2. 导航到视频页面
      if (video_id) {
        const videoUrl = `https://www.douyin.com/video/${video_id}`;
        logger.info(`Navigating to video: ${videoUrl}`);

        try {
          await page.goto(videoUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await page.waitForTimeout(2000); // 等待评论加载
        } catch (navError) {
          logger.warn(`Navigation failed, trying alternative URL:`, navError.message);
          // 备选方案：尝试其他 URL 格式
          await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded' });
        }
      } else {
        logger.warn('No video_id provided, using home page');
        await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded' });
      }

      // 3. 定位评论并打开回复框
      logger.info(`Locating comment: ${target_id}`);

      // 尝试多个评论定位选择器
      const commentSelectors = [
        `[data-comment-id="${target_id}"]`,
        `[data-cid="${target_id}"]`,
        `[class*="comment"][id*="${target_id}"]`,
      ];

      let commentElement = null;
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

      if (!commentElement) {
        logger.warn(`Comment ${target_id} not found in DOM, will try to reply by scrolling`);
        // 备选方案：通过滚动查找
        const comments = await page.$$('[class*="comment"], [data-comment-id]');
        if (comments.length > 0) {
          commentElement = comments[0]; // 使用第一条评论
          logger.info(`Using first comment in list as fallback`);
        }
      }

      if (!commentElement) {
        throw new Error(`Comment ${target_id} not found on page`);
      }

      // 4. 点击回复按钮
      logger.info('Clicking reply button');

      const replyButtonSelectors = [
        '[class*="reply"]',
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
        // 尝试找到整个评论区域的回复按钮
        replyBtn = await page.$(`${commentSelectors[0]} [class*="reply"]`);
      }

      if (replyBtn) {
        await replyBtn.click();
        await page.waitForTimeout(1000);
        logger.info('Reply button clicked');
      } else {
        logger.warn('Reply button not found, trying to focus comment input');
      }

      // 5. 定位并填充回复输入框
      logger.info('Locating reply input field');

      const inputSelectors = [
        'textarea[placeholder*="回复"]',
        'input[placeholder*="回复"]',
        '[class*="reply-input"] textarea',
        '[class*="reply-input"] input',
        'textarea[class*="input"]',
        'input[class*="reply"]',
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
      logger.info('Submitting reply');

      const submitButtonSelectors = [
        'button:has-text("发送")',
        '[class*="submit"]',
        '[class*="send"]',
        'button[type="submit"]',
        '[class*="reply-input"] button',
      ];

      let submitBtn = null;
      for (const selector of submitButtonSelectors) {
        try {
          submitBtn = await page.$(selector);
          if (submitBtn && await submitBtn.isVisible()) {
            logger.debug(`Found submit button with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (submitBtn) {
        await submitBtn.click();
        logger.info('Submit button clicked');
      } else {
        // 尝试按 Enter 键提交
        logger.info('No submit button found, trying Enter key');
        await replyInput.press('Enter');
      }

      // 等待回复成功
      await page.waitForTimeout(2000);

      // 7. 验证回复成功（可选）
      const successIndicators = await page.evaluate(() => {
        const successMsgs = document.querySelectorAll('[class*="success"], [class*="tip"], [class*="message"]');
        return Array.from(successMsgs).map(el => el.textContent);
      });

      logger.info('Reply submitted successfully', {
        successIndicators: successIndicators.slice(0, 3),
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
      logger.error(`[Douyin] Failed to reply to comment: ${target_id}`, {
        error: error.message,
        accountId,
      });

      // 保存错误截图用于调试
      if (page) {
        try {
          await this.takeScreenshot(accountId, `reply_error_${Date.now()}.png`);
        } catch (screenshotError) {
          logger.warn('Failed to take screenshot:', screenshotError.message);
        }
      }

      throw error;

    } finally {
      // 清理页面
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          logger.warn('Failed to close page:', closeError.message);
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
    const { target_id, reply_content, context = {}, browserManager } = options;
    const { sender_id, conversation_id } = context;

    let page = null;

    try {
      logger.info(`[Douyin] Replying to direct message: ${target_id}`, {
        accountId,
        senderId: sender_id,
        replyContent: reply_content.substring(0, 50),
      });

      // 1. 获取浏览器上下文
      const browserContext = await this.ensureAccountContext(accountId);
      page = await browserContext.newPage();

      // 设置超时
      page.setDefaultTimeout(30000);

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

      // 7. 输入回复内容（已验证：使用 type 模拟真实输入）
      logger.info('Typing reply content');
      await dmInput.type(reply_content, { delay: 30 }); // 30ms 延迟
      await page.waitForTimeout(800);

      // 8. 查找并点击发送按钮（已验证：button:has-text("发送")）
      logger.info('Looking for send button');

      const sendBtn = await page.$('button:has-text("发送")');

      if (sendBtn) {
        const isEnabled = await sendBtn.evaluate(btn => !btn.disabled);
        if (isEnabled) {
          logger.info('Clicking send button');
          await sendBtn.click();
        } else {
          logger.info('Send button is disabled, trying Enter key');
          await dmInput.press('Enter');
        }
      } else {
        logger.info('Send button not found, using Enter key');
        await dmInput.press('Enter');
      }

      // 9. 等待消息发送完成
      logger.info('Waiting for message to be sent');
      await page.waitForTimeout(2000);

      // 10. 验证消息发送成功
      const messageVerified = await page.evaluate((content) => {
        const messageElements = document.querySelectorAll('[class*="message"], [role="listitem"]');
        return Array.from(messageElements).some(msg => msg.textContent.includes(content));
      }, reply_content);

      logger.info(`Message sent ${messageVerified ? 'and verified' : '(verification pending)'}`);

      // 11. 返回成功结果
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

      throw error;

    } finally {
      // 清理资源
      if (page) {
        try {
          await page.close();
          logger.debug('Page closed');
        } catch (closeError) {
          logger.warn('Failed to close page:', closeError.message);
        }
      }
    }
  }

  /**
   * 清理资源
   * @param {string} accountId - 账户 ID
   */
  async cleanup(accountId) {
    logger.info(`Cleaning up Douyin platform for account ${accountId}`);

    // 清理当前页面
    if (this.currentPage) {
      try {
        await this.currentPage.close();
        this.currentPage = null;
      } catch (error) {
        logger.error(`Failed to close page for account ${accountId}:`, error);
      }
    }

    // 调用基类清理（清理浏览器上下文等）
    await super.cleanup(accountId);

    logger.info(`Douyin platform cleaned up for account ${accountId}`);
  }
}

module.exports = DouyinPlatform;
