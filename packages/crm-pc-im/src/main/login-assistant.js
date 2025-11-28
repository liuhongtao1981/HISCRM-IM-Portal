/**
 * 登录助手 - 在用户本地启动浏览器完成手动登录
 * 支持短信验证、滑块验证、人脸识别等所有验证方式
 */

const { ipcMain, BrowserWindow } = require('electron');
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');

class LoginAssistant {
    constructor(socketClient) {
        this.socketClient = socketClient;
        this.activeBrowser = null;
        this.currentContext = null;      // 保存浏览器上下文引用
        this.currentPage = null;          // 保存页面引用
        this.currentPlatform = null;      // 保存平台信息
        this.loginSuccess = false;
        this.currentAccountId = null;
        this.currentTempDir = null;

        this.setupIPC();

        console.log('[登录助手] 已初始化');
    }

    /**
     * 设置 IPC 监听
     */
    setupIPC() {
        // 监听渲染进程的登录请求
        ipcMain.on('start-manual-login', async (event, { accountId, platform }) => {
            await this.startManualLogin(accountId, platform);
        });

        console.log('[登录助手] IPC 监听已设置');
    }

    /**
     * 启动手动登录流程
     */
    async startManualLogin(accountId, platform = 'douyin') {
        console.log(`[登录助手] 启动登录 - 账户: ${accountId}, 平台: ${platform}`);

        // 防止重复启动
        if (this.activeBrowser) {
            console.log('[登录助手] 已有浏览器在运行，先关闭');
            await this.cleanup();
        }

        this.currentAccountId = accountId;
        this.currentPlatform = platform;
        this.loginSuccess = false;

        try {
            // 1. 创建临时目录（完全隔离，不含用户本地数据）
            this.currentTempDir = path.join(
                os.tmpdir(),
                `douyin-login-${accountId}-${Date.now()}`
            );

            console.log(`[登录助手] 临时目录: ${this.currentTempDir}`);

            // 2. 启动完全干净的浏览器（使用 launchPersistentContext）
            const context = await chromium.launchPersistentContext(this.currentTempDir, {
                headless: false,  // 用户可见
                args: [
                    '--start-maximized',
                    '--disable-blink-features=AutomationControlled',  // 反检测
                    '--no-first-run',
                    '--no-default-browser-check'
                ],
                viewport: { width: 1920, height: 1080 },
                locale: 'zh-CN',
                timezoneId: 'Asia/Shanghai',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            // 保存引用（用于后续清理和断开连接时提取状态）
            this.activeBrowser = context;
            this.currentContext = context;

            // 3. 监听浏览器上下文关闭（用户手动关闭或程序关闭）
            context.on('close', () => {
                this.handleBrowserDisconnected();
            });

            // 4. 使用 launchPersistentContext 创建的默认页面
            const pages = context.pages();
            const page = pages.length > 0 ? pages[0] : await context.newPage();

            // 保存页面引用
            this.currentPage = page;

            // 5. 导航到登录页
            const loginUrl = this.getLoginUrl(platform);
            console.log(`[登录助手] 导航到登录页: ${loginUrl}`);

            await page.goto(loginUrl);

            console.log('[登录助手] 浏览器已打开，等待用户登录...');
            this.sendToRenderer('login-browser-opened', { accountId });

            // 6. 等待用户手动登录（支持所有验证方式）
            const success = await this.waitForLogin(page, platform);

            if (success) {
                // 7. 标记登录成功
                this.loginSuccess = true;

                // 8. 提取登录状态（只包含这次登录的数据）
                const storageState = await context.storageState();

                console.log(`[登录助手] ✅ 登录成功`);
                console.log(`   Cookies: ${storageState.cookies.length} 个`);
                console.log(`   Origins: ${storageState.origins.length} 个`);

                // 9. 发送给 Master（通过 Socket.IO）
                this.socketClient.emit('client:manual-login-success', {
                    accountId,
                    platform,
                    storageState,
                    timestamp: Date.now()
                });

                console.log('[登录助手] ✅ 登录数据已发送给 Master');

                // 10. 通知渲染进程
                this.sendToRenderer('login-success', { accountId });

                // 11. 等待 2 秒让用户看到登录成功提示
                console.log('[登录助手] ⏱️  2秒后自动关闭浏览器...');
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 12. 关闭浏览器（会触发 'close' 事件）
                await this.cleanup();

            } else {
                // URL 跳转超时 - 但再次检查 URL（可能已经跳转了）
                console.log('[登录助手] ⚠️  URL 跳转超时，检查当前页面...');

                // 最后检查：URL 是否已经在登录后页面
                const currentUrl = page.url();
                const isLoggedInUrl = this.checkIfLoggedInUrl(currentUrl, platform);

                if (isLoggedInUrl) {
                    console.log('[登录助手] ✅ 检测到用户已登录（URL 确认）');

                    // 标记登录成功
                    this.loginSuccess = true;

                    // 提取登录状态
                    const storageState = await context.storageState();

                    console.log(`[登录助手] ✅ 登录成功`);
                    console.log(`   Cookies: ${storageState.cookies.length} 个`);

                    // 发送给 Master
                    this.socketClient.emit('client:manual-login-success', {
                        accountId,
                        platform,
                        storageState,
                        timestamp: Date.now()
                    });

                    console.log('[登录助手] ✅ 登录数据已发送给 Master');
                    this.sendToRenderer('login-success', { accountId });

                } else {
                    console.log('[登录助手] ❌ 登录超时（URL 未跳转到登录后页面）');
                    this.sendToRenderer('login-timeout', { accountId });
                }

                // 关闭浏览器
                await this.cleanup();
            }

            // 重置标志
            this.loginSuccess = false;

        } catch (error) {
            console.error('[登录助手] 错误:', error);
            this.sendToRenderer('login-failed', {
                accountId,
                error: error.message
            });
            await this.cleanup();
        }
    }

    /**
     * 获取登录页面 URL
     */
    getLoginUrl(platform) {
        const urls = {
            'douyin': 'https://creator.douyin.com/',
            'xiaohongshu': 'https://creator.xiaohongshu.com/'
        };

        return urls[platform] || urls['douyin'];
    }

    /**
     * 等待登录成功（支持短信、滑块、人脸识别等所有验证方式）
     * 检测到登录成功后会自动关闭浏览器
     */
    async waitForLogin(page, platform, timeout = 10 * 60 * 1000) {
        console.log(`[登录助手] 等待登录完成（超时: ${timeout / 1000}秒）...`);
        console.log('[登录助手] 💡 登录成功后会自动关闭浏览器并保存登录状态');

        try {
            if (platform === 'douyin') {
                // 等待 URL 跳转到登录后页面（从根路径跳转到子路径）
                console.log('[登录助手] 等待 URL 跳转到创作者中心主页...');
                console.log('[登录助手] 当前 URL:', page.url());

                // 登录成功后会跳转到 /creator-micro/home
                await page.waitForURL('**/creator.douyin.com/creator-micro/**', { timeout });

                console.log('[登录助手] ✅ 检测到登录成功（URL 已跳转到:', page.url(), '）');

                // 在页面上显示登录成功提示
                try {
                    await page.evaluate(() => {
                        const banner = document.createElement('div');
                        banner.innerHTML = `
                            <div style="
                                position: fixed;
                                top: 20px;
                                left: 50%;
                                transform: translateX(-50%);
                                background: #52c41a;
                                color: white;
                                padding: 16px 24px;
                                border-radius: 8px;
                                font-size: 16px;
                                font-weight: bold;
                                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                                z-index: 999999;
                            ">
                                ✅ 登录成功！2秒后自动关闭浏览器...
                            </div>
                        `;
                        document.body.appendChild(banner);
                    });
                } catch (err) {
                    console.log('[登录助手] ⚠️  无法显示横幅提示:', err.message);
                }

                return true;

            } else if (platform === 'xiaohongshu') {
                await page.waitForURL('**/creator.xiaohongshu.com/**', { timeout });
                return true;
            }

            return false;

        } catch (error) {
            console.error('[登录助手] 等待登录超时:', error.message);
            return false;
        }
    }

    /**
     * 处理浏览器断开连接（用户手动关闭或程序关闭）
     */
    async handleBrowserDisconnected() {
        console.log('[登录助手] 🔴 浏览器已断开连接');

        // 如果还没标记为登录成功，尝试检查是否实际已登录
        if (!this.loginSuccess && this.currentAccountId && this.currentContext && this.currentPage) {
            try {
                // 检查页面 URL 是否已经跳转到登录后页面
                const currentUrl = this.currentPage.url();
                const isLoggedInUrl = this.checkIfLoggedInUrl(currentUrl, this.currentPlatform);

                if (isLoggedInUrl) {
                    console.log('[登录助手] ✅ 检测到用户已登录（URL 确认）');

                    // 尝试提取登录状态
                    const storageState = await this.currentContext.storageState();

                    console.log(`[登录助手] ✅ 登录状态已提取`);
                    console.log(`   Cookies: ${storageState.cookies.length} 个`);
                    console.log(`   Origins: ${storageState.origins.length} 个`);

                    // 发送给 Master
                    this.socketClient.emit('client:manual-login-success', {
                        accountId: this.currentAccountId,
                        platform: this.currentPlatform,
                        storageState,
                        timestamp: Date.now()
                    });

                    console.log('[登录助手] ✅ 登录数据已发送给 Master');

                    // 通知渲染进程
                    this.sendToRenderer('login-success', {
                        accountId: this.currentAccountId
                    });

                    this.loginSuccess = true;
                } else {
                    console.log('[登录助手] 用户取消登录（未检测到登录成功）');
                    this.sendToRenderer('login-cancelled', {
                        accountId: this.currentAccountId
                    });
                }
            } catch (error) {
                console.error('[登录助手] 检查登录状态失败:', error.message);
                this.sendToRenderer('login-cancelled', {
                    accountId: this.currentAccountId
                });
            }
        } else if (!this.loginSuccess && this.currentAccountId) {
            console.log('[登录助手] 用户取消登录（手动关闭了浏览器）');
            this.sendToRenderer('login-cancelled', {
                accountId: this.currentAccountId
            });
        }

        // 清理临时目录
        if (this.currentTempDir) {
            try {
                await fs.remove(this.currentTempDir);
                console.log('[登录助手] ✅ 临时目录已清理');
            } catch (err) {
                console.error('[登录助手] 清理临时目录失败:', err);
            }
        }

        // 重置状态
        this.activeBrowser = null;
        this.currentContext = null;
        this.currentPage = null;
        this.currentPlatform = null;
        this.currentAccountId = null;
        this.currentTempDir = null;
        this.loginSuccess = false;
    }

    /**
     * 检查 URL 是否是登录后页面
     */
    checkIfLoggedInUrl(url, platform) {
        if (platform === 'douyin') {
            // 登录成功后会跳转到 /creator-micro/home 等子路径
            return url.includes('creator.douyin.com/creator-micro/');
        } else if (platform === 'xiaohongshu') {
            return url.includes('creator.xiaohongshu.com') && !url.includes('/login');
        }
        return false;
    }

    /**
     * 清理资源
     */
    async cleanup() {
        if (this.activeBrowser) {
            try {
                await this.activeBrowser.close();
                console.log('[登录助手] 浏览器已关闭');
            } catch (err) {
                console.error('[登录助手] 关闭浏览器失败:', err);
            }
        }

        // 注意：临时目录在 handleBrowserDisconnected 中清理
    }

    /**
     * 发送消息到渲染进程
     */
    sendToRenderer(event, data) {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
            mainWindow.webContents.send(event, data);
        }
    }
}

module.exports = LoginAssistant;
