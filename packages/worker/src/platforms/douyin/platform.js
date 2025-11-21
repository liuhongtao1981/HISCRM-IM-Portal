/**
 * Douyin Platform - 抖音平台脚本
 * 基于现有 DouyinLoginHandler 重构为平台模式
 */

const PlatformBase = require('../base/platform-base');
const DouyinLoginHandler = require('./login-handler');
const IncrementalCrawlService = require('../../services/incremental-crawl-service');
const { getCacheManager } = require('../../services/cache-manager');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { v4: uuidv4 } = require('uuid');
const { TabTag } = require('../../browser/tab-manager');

// 导入爬取函数
const { crawlComments: crawlCommentsV2 } = require('./crawler-comments');
const { crawlDirectMessagesV2 } = require('./crawler-messages');

// 导入 API 回调函数
const { onWorksStatsAPI } = require('./crawler-contents');
const { onCommentsListV2API, onDiscussionsListV2API, onNoticeDetailAPI } = require('./crawler-comments');
const { onMessageInitAPI, onConversationListAPI, onMessageHistoryAPI } = require('./crawler-messages');

// 导入实时监控管理器
const DouyinRealtimeMonitor = require('./realtime-monitor');

// 导入回复功能模块
const { sendReplyToComment, onCommentReplyAPI } = require('./send-reply-to-comment');

const { sendReplyToDirectMessage } = require('./send-reply-to-message');
const logger = createLogger('douyin-platform');
const cacheManager = getCacheManager();

class DouyinPlatform extends PlatformBase {
    constructor(config, workerBridge, browserManager) {
        super(config, workerBridge, browserManager);

        // 复用现有的登录处理器（传入 bridge 的 socket）
        this.loginHandler = new DouyinLoginHandler(browserManager, workerBridge.socket);

        // ⭐ 页面现在由 BrowserManager 统一管理，不再需要 this.currentPage

        // 实时监控管理器集合 (accountId => DouyinRealtimeMonitor)
        this.realtimeMonitors = new Map();
    }

    /**
     * 初始化平台
     * @param {Object} account - 账户对象
     */
    async initialize(account) {
        logger.info(`Initializing Douyin platform for account ${account.id}`);

        // 调用基类初始化（初始化 DataManager）
        await super.initialize(account);

        // ⚠️  [已废弃] 旧的 globalContext 设置逻辑
        // 现在所有 API 回调函数都通过 page._accountContext 获取账号上下文
        // 这段代码保留仅用于向后兼容，实际运行中不再需要
        //
        // 废弃原因：
        // 1. globalContext 是模块级单例，多账号并发时存在竞态条件
        // 2. 账户 A 和账户 B 会相互覆盖 globalContext，导致数据混乱
        // 3. 新架构通过 platform-base.js 的 getPageWithAPI() 注入 page._accountContext
        //
        // 如需完全移除，请确认以下内容：
        // - crawler-contents.js: onWorkDetailAPI 已改为从 page._accountContext 读取 ✅
        // - crawler-messages.js: onMessageInitAPI 已改为从 page._accountContext 读取 ✅
        // - crawler-messages.js: onConversationListAPI 已改为从 page._accountContext 读取 ✅
        // - crawler-messages.js: onMessageHistoryAPI 已改为从 page._accountContext 读取 ✅

        logger.info(`✅ DataManager initialized for account ${account.id} (using page._accountContext injection)`)

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
        // ✨ 作品统计 API（推荐，数据最完整）
        manager.register('**/janus/douyin/creator/pc/work_list{/,}?**', onWorksStatsAPI);
        // 作品列表 API（备用，如果作品统计 API 正常工作则无需启用）
        // manager.register('**/aweme/v1/creator/item/list{/,}?**', onWorksListAPI);
        // ⚠️ 不使用 onWorkDetailAPI - 该 API 会在浏览 Feed 流时触发，抓取到其他人的作品

        // 评论相关 API（V2 web API - 通知页面触发）
        manager.register('**/aweme/v1/web/comment/list/select/**', onCommentsListV2API); //匹配 /web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/select/?aweme_id=7571732586456812800
        manager.register('**/aweme/v1/web/comment/list/reply/**', onDiscussionsListV2API); //匹配 /web/api/third_party/aweme/api/comment/read/aweme/v1/web/comment/list/reply/?comment_id=7572250319850095397

        manager.register('**/aweme/v1/web/notice/detail/**', onNoticeDetailAPI);  // 通知详情 API（评论通知）

        // 评论回复 API（回调函数内部会排除 /comment/reply/list 列表接口）
        manager.register('**/comment/reply{/,}?**', onCommentReplyAPI);

        // 私信相关 API
        manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);
        manager.register('**/creator/im/user_detail/**', onConversationListAPI);  // 修正：匹配实际的会话 API
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

                    let loginResult;
                    if (loginMethod.type === 'qrcode') {
                        // 显示二维码登录（在当前 loginPage 上）
                        loginResult = await this.handleQRCodeLogin(loginPage, accountId, sessionId, {
                            qrSelector: loginMethod.selector,
                            expirySelector: loginMethod.expirySelector
                        });
                    } else if (loginMethod.type === 'sms') {
                        // 显示 SMS 登录（在当前 loginPage 上）
                        loginResult = await this.handleSMSLogin(loginPage, accountId, sessionId, {
                            phoneInputSelector: loginMethod.phoneInputSelector,
                            codeInputSelector: loginMethod.codeInputSelector
                        });
                    } else {
                        throw new Error(`Unsupported login method: ${loginMethod.type}`);
                    }

                    // ✅ 登录成功后释放登录窗口（非持久化窗口会自动关闭）
                    logger.info('Releasing login window after successful login...');
                    await release();
                    logger.info('✅ Login window released (will be auto-closed)');

                    return loginResult;
                }
            } catch (error) {
                // 确保登录页面被关闭 - 使用 release()
                try {
                    logger.warn('Login failed, releasing login window...');
                    await release();
                } catch (e) {
                    logger.warn('Failed to release login tab:', e.message);
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

            // ⚠️ 不进行任何导航操作，直接检测当前页面
            // 调用者负责确保页面已在正确的 URL

            // 🐛 调试：检查页面上是否有任何包含"抖音号"的元素
            try {
                const debugInfo = await page.evaluate(() => {
                    const allDivs = Array.from(document.querySelectorAll('div'));
                    const containerDivs = allDivs.filter(el =>
                        el.className && el.className.includes('container')
                    );
                    const douyinDivs = Array.from(document.querySelectorAll('*')).filter(el =>
                        el.textContent && el.textContent.includes('抖音号')
                    );
                    return {
                        totalDivs: allDivs.length,
                        containerDivs: containerDivs.map(el => el.className).slice(0, 10),
                        hasDouyinText: douyinDivs.length > 0,
                        douyinClasses: douyinDivs.map(el => `${el.tagName}.${el.className}`).slice(0, 5)
                    };
                });
                logger.info(`[checkLoginStatus] 🐛 Debug info: ${JSON.stringify(debugInfo)}`);
            } catch (debugError) {
                logger.warn(`[checkLoginStatus] Debug failed: ${debugError.message}`);
            }

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
        let page = null;
        let crawlTabId = null;

        try {
            logger.info(`[crawlComments] Starting comments+discussions crawl for account ${account.id}`);

            // 确保账号有 platform_user_id
            if (!account.platform_user_id) {
                logger.error(`[crawlComments] Account ${account.id} missing platform_user_id`);
                throw new Error('Account missing platform_user_id - please login first to obtain douyin_id');
            }

            // 1. 获取页面 - 使用框架级别的 getPageWithAPI（自动注册 API 拦截器）
            // ⭐ 关键改进: 使用 getPageWithAPI 自动为标签页注册 API 拦截器
            // ⭐ 修复: 设置 persistent=true，保持标签页打开以确保API拦截器不失效
            logger.debug(`[crawlComments] Step 1: Getting spider_comment tab for account ${account.id}`);
            const pageResult = await this.getPageWithAPI(account.id, {
                tag: TabTag.SPIDER_COMMENT,
                persistent: false,      // ✅ 修复: 保持标签页打开，避免API拦截器失效
                shareable: false,      // 独立窗口，不共享
                forceNew: false        // 复用已有窗口
            });
            page = pageResult.page;
            crawlTabId = pageResult.tabId;
            logger.info(`[crawlComments] Spider comment tab retrieved successfully (tabId: ${crawlTabId})`);

            // 1.5. 获取 DataManager（使用新架构，自动创建）
            const dataManager = await this.getDataManager(account.id);
            if (dataManager) {
                logger.info(`✅ [crawlComments] DataManager 可用，使用统一数据管理架构`);
                // Note: crawl-contents.js 的 globalContext 已在 initialize() 时设置
            } else {
                logger.warn(`⚠️  [crawlComments] DataManager 创建失败，使用旧数据收集逻辑`);
            }

            // 1.8. ✨ 在评论爬虫前触发作品统计 API（通过访问页面触发拦截）
            logger.debug(`[crawlComments] Step 1.8: Triggering works statistics API by visiting content manage page`);
            try {
                // 访问作品管理页面，触发作品统计 API 拦截
                await page.goto('https://creator.douyin.com/creator-micro/content/manage', {
                    waitUntil: 'networkidle',
                    timeout: 15000
                });
                logger.info(`✅ [crawlComments] 作品管理页面访问成功，开始滚动加载所有作品`);

                // 🔄 滚动到底部加载所有作品（分页触发）
                let previousHeight = 0;
                let currentHeight = await page.evaluate(() => document.body.scrollHeight);
                let scrollAttempts = 0;
                const maxScrollAttempts = 50; // 最多滚动 50 次（支持更多作品）
                let noMoreDataFound = false;
                let heightUnchangedCount = 0; // 记录高度连续未变化的次数

                while (scrollAttempts < maxScrollAttempts && !noMoreDataFound) {
                    previousHeight = currentHeight;

                    // 滚动到底部
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });

                    // 等待新内容加载
                    await page.waitForTimeout(1500);

                    // 检查是否有"没有更多"的提示
                    noMoreDataFound = await page.evaluate(() => {
                        const body = document.body.innerText;
                        // 检查常见的"没有更多"提示文本
                        return body.includes('没有更多') ||
                               body.includes('已经到底了') ||
                               body.includes('暂无更多') ||
                               body.includes('没有更多作品') ||
                               body.includes('到底了');
                    });

                    currentHeight = await page.evaluate(() => document.body.scrollHeight);
                    scrollAttempts++;

                    // 检查高度是否变化
                    if (previousHeight === currentHeight) {
                        heightUnchangedCount++;
                        logger.debug(`[crawlComments] 滚动进度: ${scrollAttempts}/${maxScrollAttempts}, 高度未变化 (${heightUnchangedCount}/3)`);

                        // 如果连续3次高度不变，认为已到底
                        if (heightUnchangedCount >= 3) {
                            logger.info(`[crawlComments] 检测到高度连续3次未变化，判断已到底`);
                            break;
                        }
                    } else {
                        heightUnchangedCount = 0; // 重置计数器
                        logger.debug(`[crawlComments] 滚动进度: ${scrollAttempts}/${maxScrollAttempts}, 高度: ${currentHeight}px`);
                    }

                    if (noMoreDataFound) {
                        logger.info(`[crawlComments] 检测到"没有更多"提示，停止滚动`);
                        break;
                    }
                }

                logger.info(`✅ [crawlComments] 滚动完成，共滚动 ${scrollAttempts} 次，最终高度: ${currentHeight}px${noMoreDataFound ? '（检测到"没有更多"提示）' : ''}`);

                // 等待一小段时间让 API 拦截器处理所有数据
                await page.waitForTimeout(2000);

                // 数据已通过 onWorksStatsAPI 拦截器自动处理并同步到 DataManager
                logger.debug(`[crawlComments] 作品数据已通过 API 拦截器自动同步`);
            } catch (worksError) {
                logger.error(`⚠️  [crawlComments] 作品统计页面访问失败（不影响评论爬取）:`, {
                    error: worksError.message,
                    stack: worksError.stack
                });
                // 继续执行评论爬虫
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
        } finally {
            // 清理临时标签页 - 爬虫任务完成后立即关闭，减少资源占用
            // ⭐ 使用 TabManager 关闭评论爬虫窗口
            if (page && crawlTabId) {
                try {
                    if (!page.isClosed()) {
                        logger.info('✅ Comment crawl task completed - closing crawl tab', {
                            accountId: account.id,
                            tabId: crawlTabId
                        });
                        // 使用 TabManager 关闭标签页
                        await this.browserManager.tabManager.closeTab(account.id, crawlTabId);
                        logger.info('✅ Comment crawl tab closed via TabManager');
                    } else {
                        logger.debug('ℹ️ Crawl page was already closed');
                    }
                } catch (closeError) {
                    logger.warn('Error closing crawl tab:', closeError.message);
                }
            }
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
     * 爬取私信 - 导航到 互动管理 - 私信管理 页面，通过拦截API获取数据
     * @param {Object} account - 账户对象
     * @returns {Promise<Object>} { directMessages: Array, stats: Object }
     */
    async crawlDirectMessages(account) {
        let page = null;
        let crawlTabId = null;

        try {
            logger.info(`[crawlDirectMessages] Starting Phase 8 implementation for account ${account.id}`);

            // 确保账号有 platform_user_id
            if (!account.platform_user_id) {
                logger.error(`[crawlDirectMessages] Account ${account.id} missing platform_user_id`);
                throw new Error('Account missing platform_user_id - please login first to obtain douyin_id');
            }

            // 1. 获取页面 - 使用框架级别的 getPageWithAPI（自动注册 API 拦截器）
            // ⭐ 关键改进: 使用 getPageWithAPI 自动为标签页注册 API 拦截器
            // ⭐ 优化: 设置 persistent=false，爬虫任务完成后关闭标签页，减少资源占用
            logger.debug(`[crawlDirectMessages] Step 1: Getting spider_dm tab for account ${account.id}`);
            const pageResult = await this.getPageWithAPI(account.id, {
                tag: TabTag.SPIDER_DM,
                persistent: false,     // 爬虫任务完成后关闭，减少资源占用
                shareable: false,      // 独立窗口，不共享
                forceNew: false        // 复用已有窗口（如果 persistent=false 则每次创建新窗口）
            });
            page = pageResult.page;
            crawlTabId = pageResult.tabId;
            logger.info(`[crawlDirectMessages] Spider DM tab retrieved successfully (tabId: ${crawlTabId})`);

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

            // ✅ 优化: is_new 表示"首次抓取"，而不是基于时间判断
            // Worker 只负责数据完整性，不关心业务逻辑（时效性由 Master 处理）
            const directMessages = rawDirectMessages.map((msg) => {
                let createdAt = msg.created_at || msg.create_time || Math.floor(Date.now() / 1000);

                // 检查是否为毫秒级（13位数字）并转换为秒级
                if (createdAt > 9999999999) {
                    createdAt = Math.floor(createdAt / 1000);
                }

                // 🔧 时区修正: 抖音API返回的时间戳是UTC+8时区的
                // 需要减去8小时（28800秒）转换为标准UTC时间戳
                const TIMEZONE_OFFSET = 8 * 3600; // 8小时 = 28800秒
                createdAt = createdAt - TIMEZONE_OFFSET;

                return {
                    ...msg,
                    account_id: account.id,
                    is_read: false,
                    created_at: createdAt,
                    is_new: true,  // ✅ 修改: 首次抓取的私信 is_new = true（时效性由 Master 判断）
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
        } finally {
            // 清理临时标签页 - 爬虫任务完成后立即关闭，减少资源占用
            // ⭐ 使用 TabManager 关闭私信爬虫窗口
            if (page && crawlTabId) {
                try {
                    if (!page.isClosed()) {
                        logger.info('✅ DM crawl task completed - closing crawl tab', {
                            accountId: account.id,
                            tabId: crawlTabId
                        });
                        // 使用 TabManager 关闭标签页
                        await this.browserManager.tabManager.closeTab(account.id, crawlTabId);
                        logger.info('✅ DM crawl tab closed via TabManager');
                    } else {
                        logger.debug('ℹ️ Crawl page was already closed');
                    }
                } catch (closeError) {
                    logger.warn('Error closing crawl tab:', closeError.message);
                }
            }
        }
    }

    // ==================== 爬虫辅助方法 ====================

    /**
     * 随机延迟
     * @param {number} min - 最小延迟(毫秒)
     * @param {number} max - 最大延迟(毫秒)
     */
    async randomDelay(min, max) {
        const delay = min + Math.random() * (max - min);
        await new Promise((resolve) => setTimeout(resolve, delay));
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

            // ✅ 优化: is_new 表示"首次抓取"，而不是基于时间判断
            // Worker 只负责数据完整性，不关心业务逻辑（时效性由 Master 处理）
            // 由于 newComments 已经是通过 cacheManager.filterNewComments() 过滤的首次抓取数据
            // 所以这里的 is_new 应该全部为 true
            const commentsWithIds = newComments.map((comment) => ({
                id: comment.platform_comment_id,  // 使用 platform_comment_id 作为唯一ID
                account_id: account.id,  // 添加账户ID
                is_new: true,  // ✅ 修改: 首次抓取的评论 is_new = true
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
 * 回复评论
 *
 * @param {string} accountId - 账户 ID
 * @param {Object} options - 回复选项
 * @param {string} [options.target_id] - 评论 ID（可选，不提供则回复作品）
 * @param {string} options.reply_content - 回复内容
 * @param {Object} [options.context] - 上下文信息
 * @param {string} [options.context.video_title] - 视频标题
 * @returns {Promise<{success: boolean, platform_reply_id?: string, data?: Object, reason?: string}>}
 */
async replyToComment(accountId, options) {
    const { target_id, reply_content, context = {} } = options;
    const { video_title } = context;

    let page = null;
    let replyTabId = null;

    try {
        // 1. 获取临时标签页
        const { tabId, page: replyPage } = await this.browserManager.tabManager.getPageForTask(accountId, {
            tag: TabTag.REPLY_COMMENT,
            persistent: false,
            shareable: false,
            forceNew: true
        });

        page = replyPage;
        replyTabId = tabId;

        logger.info(`[Douyin] 开始回复${target_id ? '评论' : '作品'}`, {
            accountId,
            commentId: target_id,
            videoTitle: video_title?.substring(0, 50),
            tabId: replyTabId
        });

        // 2. 调用新的回复模块
        const result = await sendReplyToComment(page, {
            commentId: target_id,
            replyContent: reply_content,
            videoTitle: video_title,
            accountId
        });

        if (result.success) {
            return {
                success: true,
                platform_reply_id: result.data?.platform_reply_id || `${target_id}_${Date.now()}`,
                data: result.data
            };
        } else {
            return {
                success: false,
                status: 'error',
                reason: result.error,
                data: {
                    comment_id: target_id,
                    reply_content,
                    error_message: result.error,
                    timestamp: new Date().toISOString()
                }
            };
        }

    } catch (error) {
        logger.error(`❌ [Douyin] 回复评论失败`, {
            accountId,
            commentId: target_id,
            error: error.message
        });

        // 保存错误截图
        if (page && !page.isClosed()) {
            try {
                await this.takeScreenshot(accountId, `reply_error_${Date.now()}.png`);
            } catch (e) {
                logger.warn('截图失败:', e.message);
            }
        }

        return {
            success: false,
            status: 'error',
            reason: error.message,
            data: {
                comment_id: target_id,
                reply_content,
                error_message: error.message,
                timestamp: new Date().toISOString()
            }
        };

    } finally {
        // 3. 关闭临时标签页
        if (page && replyTabId && !page.isClosed()) {
            try {
                await this.browserManager.tabManager.closeTab(accountId, replyTabId);
                logger.info('✅ 回复标签页已关闭');
            } catch (e) {
                logger.warn('关闭标签页失败:', e.message);
            }
        }
    }
}

    /**
     * 回复私信
     * @param {string} accountId - 账户 ID
     * @param {Object} options - 回复选项
     * @returns {Promise<{success: boolean, platform_reply_id?: string, data?: Object, reason?: string}>}
     */
    async replyToDirectMessage(accountId, options) {
        const { target_id, conversation_id, platform_message_id, reply_content, context = {} } = options;

        let page = null;
        let replyTabId = null;

        try {
            // 1. 获取临时标签页
            const { tabId, page: replyPage } = await this.browserManager.tabManager.getPageForTask(accountId, {
                tag: TabTag.REPLY_DM,
                persistent: false,
                shareable: false,
                forceNew: true
            });

            page = replyPage;
            replyTabId = tabId;

            logger.info(`[Douyin] 开始回复私信`, {
                accountId,
                conversationId: conversation_id || target_id,
                platformMessageId: platform_message_id,
                tabId: replyTabId
            });

            // 2. 调用新的回复模块
            const result = await sendReplyToDirectMessage(page, {
                accountId,
                target_id,
                conversation_id,
                platform_message_id,
                reply_content,
                context,
                takeScreenshot: (accId, filename) => this.takeScreenshot(accId, filename)
            });

            return result;

        } catch (error) {
            logger.error(`❌ [Douyin] 回复私信失败`, {
                accountId,
                conversationId: conversation_id || target_id,
                error: error.message
            });

            // 保存错误截图
            if (page && !page.isClosed()) {
                try {
                    await this.takeScreenshot(accountId, `dm_reply_error_${Date.now()}.png`);
                } catch (e) {
                    logger.warn('截图失败:', e.message);
                }
            }

            return {
                success: false,
                status: 'error',
                reason: error.message,
                data: {
                    message_id: target_id || conversation_id,
                    reply_content,
                    error_message: error.message,
                    timestamp: new Date().toISOString()
                }
            };

        } finally {
            // 3. 关闭临时标签页
            if (page && replyTabId && !page.isClosed()) {
                try {
                    await this.browserManager.tabManager.closeTab(accountId, replyTabId);
                    logger.info('✅ 私信回复标签页已关闭');
                } catch (e) {
                    logger.warn('关闭标签页失败:', e.message);
                }
            }
        }
    }
    /**
     * 创建抖音平台的 DataManager
     * @param {string} accountId - 账户 ID
     * @returns {Promise<DouyinDataManager>}
     */
    async createDataManager(accountId) {
        const { DouyinDataManager } = require('./data-manager');
        logger.info(`Creating DouyinDataManager for account ${accountId}`);

        const dataManager = new DouyinDataManager(accountId, this.dataPusher);
        logger.info(`✅ DouyinDataManager created for account ${accountId}`);

        return dataManager;
    }

    // ============================================================================
    // 实时监控管理
    // ============================================================================

    /**
     * 启动实时监控
     * @param {Object} account - 账户对象
     * @param {Object} page - Playwright Page 实例 (可选,如未提供则自动创建)
     */
    async startRealtimeMonitor(account, page = null) {
        logger.info(`启动实时监控 (账户: ${account.id})`);

        // 检查配置
        const config = this.parseMonitoringConfig(account);
        if (!config.enableRealtimeMonitor) {
            logger.info(`实时监控未启用 (账户: ${account.id})`);
            return;
        }

        // 检查是否已存在
        if (this.realtimeMonitors.has(account.id)) {
            logger.warn(`实时监控已存在 (账户: ${account.id})`);
            return;
        }

        try {
            // 获取 DataManager
            const dataManager = this.dataManagers.get(account.id);
            if (!dataManager) {
                throw new Error(`DataManager 未初始化 (账户: ${account.id})`);
            }

            // 1. 获取或创建常驻页面
            let realtimePage = page;
            let realtimeTabId = null;

            if (!realtimePage) {
                logger.info(`查找或创建实时监控页面 (账户: ${account.id})`);

                // 🔍 查找已存在的 REALTIME_MONITOR Tab（避免重复创建）
                const accountTabs = this.browserManager.tabManager.tabs.get(account.id);
                if (accountTabs) {
                    for (const [tabId, tabInfo] of accountTabs.entries()) {
                        try {
                            // 只复用已标记为 REALTIME_MONITOR 的 Tab
                            if (tabInfo.tag === TabTag.REALTIME_MONITOR && !tabInfo.page.isClosed()) {
                                logger.info(`♻️  复用现有实时监控 Tab ${tabId}`);
                                realtimePage = tabInfo.page;
                                realtimeTabId = tabId;
                                break;
                            }
                        } catch (error) {
                            logger.warn(`检查 Tab ${tabId} 失败: ${error.message}`);
                        }
                    }
                }

                // 如果没找到，强制创建新的独立 Tab
                if (!realtimePage) {
                    logger.info(`创建独立的实时监控 Tab (账户: ${account.id})`);
                    // ⭐ 使用 getPageWithAPI 自动设置 API 拦截器
                    const result = await this.getPageWithAPI(
                        account.id,
                        {
                            tag: TabTag.REALTIME_MONITOR,
                            persistent: true,
                            shareable: false,
                            forceNew: true  // ⭐ 强制创建新 Tab，不复用其他 Tag 的 Tab
                        }
                    );
                    realtimePage = result.page;
                    realtimeTabId = result.tabId;
                    logger.info(`✅ 独立实时监控 Tab 创建成功 (tabId: ${realtimeTabId})`);
                    logger.info(`✅ API 拦截器已自动设置 (tag: ${TabTag.REALTIME_MONITOR})`);
                }
            }

            // 2. 导航到抖音首页（实时监控在首页监听通知）
            const targetUrl = 'https://www.douyin.com/';
            const currentUrl = realtimePage.url();

            if (!currentUrl.includes('www.douyin.com')) {
                logger.info(`导航到抖音首页进行实时监控...`);
                await realtimePage.goto(targetUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                await realtimePage.waitForTimeout(2000);
                logger.info(`✅ 页面导航完成: ${targetUrl}`);
            } else {
                logger.info(`页面已在抖音首页，跳过导航`);
            }

            // 3. 创建实时监控管理器
            const monitor = new DouyinRealtimeMonitor(account, realtimePage, dataManager);

            // 4. 启动监控 (注入 Hook)
            await monitor.start();

            // 5. 保存到集合
            this.realtimeMonitors.set(account.id, monitor);

            logger.info(`✅ 实时监控启动成功 (账户: ${account.id})`);
        } catch (error) {
            logger.error(`❌ 实时监控启动失败 (账户: ${account.id}):`, error);
            throw error;
        }
    }

    /**
     * 停止实时监控
     * @param {string} accountId - 账户 ID
     */
    async stopRealtimeMonitor(accountId) {
        const monitor = this.realtimeMonitors.get(accountId);
        if (!monitor) {
            logger.warn(`实时监控不存在 (账户: ${accountId})`);
            return;
        }

        logger.info(`停止实时监控 (账户: ${accountId})`);

        try {
            await monitor.stop();
            this.realtimeMonitors.delete(accountId);

            logger.info(`✅ 实时监控已停止 (账户: ${accountId})`);
        } catch (error) {
            logger.error(`停止实时监控失败 (账户: ${accountId}):`, error);
            throw error;
        }
    }

    /**
     * 获取实时监控状态
     * @param {string} accountId - 账户 ID
     * @returns {Object|null}
     */
    getRealtimeMonitorStatus(accountId) {
        const monitor = this.realtimeMonitors.get(accountId);
        if (!monitor) {
            return null;
        }

        return monitor.getStats();
    }

    /**
     * 解析监控配置
     * @param {Object} account - 账户对象
     * @returns {Object} 配置对象
     */
    parseMonitoringConfig(account) {
        // 默认配置
        const defaultConfig = {
            enableRealtimeMonitor: true,
            crawlIntervalMin: 0.5,  // 0.5分钟 = 30秒
            crawlIntervalMax: 0.5   // 0.5分钟 = 30秒
        };

        if (!account.monitoring_config) {
            return defaultConfig;
        }

        try {
            const config = typeof account.monitoring_config === 'string'
                ? JSON.parse(account.monitoring_config)
                : account.monitoring_config;

            return { ...defaultConfig, ...config };
        } catch (error) {
            logger.warn(`解析 monitoring_config 失败: ${error.message}，使用默认配置`);
            return defaultConfig;
        }
    }

    // ============================================================================
    // 清理资源
    // ============================================================================

    /**
     * 清理资源
     * @param {string} accountId - 账户 ID
     */
    async cleanup(accountId) {
        logger.info(`Cleaning up Douyin platform for account ${accountId}`);

        // 停止实时监控
        if (this.realtimeMonitors.has(accountId)) {
            await this.stopRealtimeMonitor(accountId);
        }

        // ⭐ 页面现在由 BrowserManager 统一管理和清理
        // 不再需要手动管理 this.currentPage

        // 调用基类清理（清理浏览器上下文等）
        await super.cleanup(accountId);

        logger.info(`Douyin platform cleaned up for account ${accountId}`);
    }
}

module.exports = DouyinPlatform;
