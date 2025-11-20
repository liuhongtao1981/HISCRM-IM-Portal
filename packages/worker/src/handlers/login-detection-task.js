/**
 * LoginDetectionTask - 独立的登录检测任务
 *
 * 功能：
 * 1. 定期检测账户登录状态（使用默认Tab）
 * 2. 登录成功时：启动爬虫任务，同步状态给Master
 * 3. 登录失败时：停止爬虫任务，清理相关Tab
 * 4. 与爬虫任务完全分离，独立运行
 * 5. 健康检查：监控实时监控任务状态，自动恢复已关闭的 Tab
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { TabTag } = require('../browser/tab-manager');

const logger = createLogger('login-detection-task');

class LoginDetectionTask {
  constructor(account, platformManager, browserManager, accountStatusReporter, taskRunner) {
    this.account = account;
    this.platformManager = platformManager;
    this.browserManager = browserManager;
    this.accountStatusReporter = accountStatusReporter;
    this.taskRunner = taskRunner; // 用于启动/停止爬虫任务

    this.isRunning = false;
    this.timeoutId = null;
    this.platformInstance = null;
    
    // 当前登录状态
    this.currentLoginStatus = 'unknown'; // 'logged_in' | 'not_logged_in' | 'unknown'
    this.lastCheckTime = null;
    this.executionCount = 0;

    // 从配置读取检测间隔（默认30秒）
    this.loginCheckInterval = this.parseLoginCheckInterval();
    
    logger.info(`LoginDetectionTask initialized for account ${account.id}`, {
      interval: `${this.loginCheckInterval/1000}s`,
      account_name: account.account_name
    });
  }

  /**
   * 解析登录检测间隔配置（从环境变量读取）
   * @returns {number} 间隔毫秒数
   */
  parseLoginCheckInterval() {
    // 从环境变量读取登录检测间隔（秒）
    const intervalSeconds = parseInt(process.env.LOGIN_CHECK_INTERVAL) || 30;
    
    logger.info(`Login check interval: ${intervalSeconds}s (from env LOGIN_CHECK_INTERVAL)`);
    
    return intervalSeconds * 1000; // 转换为毫秒
  }

  /**
   * 启动登录检测任务
   */
  async start() {
    if (this.isRunning) {
      logger.warn(`LoginDetectionTask for account ${this.account.id} is already running`);
      return;
    }

    logger.info(`Starting login detection task for account ${this.account.account_name}`, {
      account_id: this.account.id,
      interval: `${this.loginCheckInterval/1000}s`,
      platform: this.account.platform
    });

    // 获取平台实例
    this.platformInstance = this.platformManager.getPlatform(this.account.platform);
    if (!this.platformInstance) {
      logger.error(`Platform ${this.account.platform} not supported or not loaded`);
      return;
    }

    this.isRunning = true;
    
    // ⭐ 快速执行第一次检测（因为账户初始化时已经加载了创作中心）
    // 延迟 2 秒，等待页面稳定
    logger.info(`⏰ First login check will run in 2s (account already on creator center)`);
    this.scheduleNext(2000);
  }

  /**
   * 停止登录检测任务
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping login detection task for account ${this.account.id}`);
    this.isRunning = false;

    // 清除定时器
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 如果当前是已登录状态，需要停止爬虫任务
    if (this.currentLoginStatus === 'logged_in') {
      await this.onLoginStatusChanged('not_logged_in');
      // ⭐ 重置状态，以便重启后能检测到状态变化
      this.currentLoginStatus = 'not_logged_in';
    }

    logger.info(`Login detection task stopped for account ${this.account.id}`);
  }

  /**
   * 调度下次执行
   * @param {number} delay - 延迟毫秒数，默认使用配置的间隔
   */
  scheduleNext(delay = null) {
    if (!this.isRunning) {
      return;
    }

    const nextDelay = delay || this.loginCheckInterval;
    this.timeoutId = setTimeout(() => {
      this.execute();
    }, nextDelay);
  }

  /**
   * 执行一次登录状态检测
   */
  async execute() {
    if (!this.isRunning) {
      return;
    }

    this.executionCount++;
    this.lastCheckTime = Date.now();

    logger.debug(`Executing login detection for account ${this.account.id} (count: ${this.executionCount})`);

    try {
      // 获取默认Tab（PLACEHOLDER）进行登录检测
      const { tabId, page, shouldClose } = await this.browserManager.tabManager.getPageForTask(this.account.id, {
        tag: TabTag.PLACEHOLDER,  // 使用默认占位页
        persistent: true,          // 保持打开
        shareable: true,           // 可共享
        forceNew: false            // 优先复用
      });

      try {
        // ✅ 每次检测前都跳转到创作中心首页，确保获取最新状态
        // 获取创作中心URL
        const creatorCenterUrl = this.platformInstance.config?.urls?.creatorCenter;
        const currentUrl = page.url();

        if (creatorCenterUrl) {
          // ✅ 检查是否在创作中心首页（精确匹配路径）
          let isOnCreatorCenterHome = false;
          try {
            const currentUrlObj = new URL(currentUrl);
            const targetUrlObj = new URL(creatorCenterUrl);

            // 精确匹配：主机名 + 路径名（忽略查询参数）
            isOnCreatorCenterHome =
              currentUrlObj.hostname === targetUrlObj.hostname &&
              currentUrlObj.pathname === targetUrlObj.pathname;

            logger.debug(`URL check: current=${currentUrlObj.pathname}, target=${targetUrlObj.pathname}, match=${isOnCreatorCenterHome}`);
          } catch (urlError) {
            logger.warn(`URL parsing error: ${urlError.message}, fallback to simple string match`);
            // 回退：精确匹配整个URL（忽略查询参数）
            isOnCreatorCenterHome = currentUrl.split('?')[0] === creatorCenterUrl.split('?')[0];
          }

          if (isOnCreatorCenterHome) {
            // 已经在创作中心首页，执行刷新
            logger.debug(`Already on creator center home page, refreshing to get latest status`);
            try {
              await page.reload({
                waitUntil: 'domcontentloaded',
                timeout: 15000
              });
              logger.debug(`✓ Refreshed creator center page`);

              // ⚠️ 等待 React 渲染完成（抖音是 SPA 应用）
              // 方案A：等待用户信息容器或头像元素（主方案）
              try {
                await page.waitForSelector('div.container-vEyGlK, img.img-PeynF_', {
                  timeout: 5000,
                  state: 'visible'
                });
                logger.debug(`✓ User info elements loaded (React rendered)`);
              } catch (waitError) {
                logger.debug(`User info elements not found, trying fallback: ${waitError.message}`);
                // 方案B：检查活动列表容器（备用方案）
                try {
                  await page.waitForSelector('div.list-xkLunx', {
                    timeout: 3000,
                    state: 'visible'
                  });
                  logger.debug(`✓ Activity list loaded (fallback method)`);
                } catch (fallbackError) {
                  logger.debug(`Fallback method also failed (may be not logged in): ${fallbackError.message}`);
                }
              }
            } catch (reloadError) {
              logger.warn(`Failed to reload page (will check current state): ${reloadError.message}`);
            }
          } else {
            // 不在创作中心首页，导航过去
            logger.debug(`Not on creator center home page (current: ${currentUrl}), navigating to: ${creatorCenterUrl}`);
            try {
              await page.goto(creatorCenterUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 15000  // 15秒超时
              });
              logger.debug(`✓ Navigated to creator center (from: ${currentUrl})`);

              // ⚠️ 等待 React 渲染完成（抖音是 SPA 应用）
              // 方案A：等待用户信息容器或头像元素（主方案）
              try {
                await page.waitForSelector('div.container-vEyGlK, img.img-PeynF_', {
                  timeout: 5000,
                  state: 'visible'
                });
                logger.debug(`✓ User info elements loaded (React rendered)`);
              } catch (waitError) {
                logger.debug(`User info elements not found, trying fallback: ${waitError.message}`);
                // 方案B：检查活动列表容器（备用方案）
                try {
                  await page.waitForSelector('div.list-xkLunx', {
                    timeout: 3000,
                    state: 'visible'
                  });
                  logger.debug(`✓ Activity list loaded (fallback method)`);
                } catch (fallbackError) {
                  logger.debug(`Fallback method also failed (may be not logged in): ${fallbackError.message}`);
                }
              }
            } catch (navError) {
              logger.warn(`Failed to navigate to creator center (will check current page): ${navError.message}`);
              // 导航失败时仍然尝试在当前页面检测
            }
          }
        } else {
          logger.warn(`Creator center URL not configured for platform ${this.account.platform}`);
        }

        // 调用平台的登录状态检测方法
        const loginStatus = await this.platformInstance.checkLoginStatus(page);
        const newStatus = loginStatus.isLoggedIn ? 'logged_in' : 'not_logged_in';

        logger.debug(`Login status check result: ${newStatus} (previous: ${this.currentLoginStatus})`);

        // 检测状态变化
        if (newStatus !== this.currentLoginStatus) {
          logger.info(`Login status changed: ${this.currentLoginStatus} → ${newStatus} for account ${this.account.id}`);
          await this.onLoginStatusChanged(newStatus);
        }

        this.currentLoginStatus = newStatus;

        // 更新账户状态报告器
        if (this.accountStatusReporter) {
          this.accountStatusReporter.updateAccountStatus(this.account.id, {
            login_status: newStatus,
            last_login_check: Math.floor(Date.now() / 1000)
          });
        }

        // 不关闭默认Tab（持久化）
        if (shouldClose) {
          await this.browserManager.tabManager.closeTab(this.account.id, tabId);
        }

      } catch (error) {
        logger.error(`Failed to check login status for account ${this.account.id}:`, error);
        
        // 记录错误到状态报告器
        if (this.accountStatusReporter) {
          this.accountStatusReporter.recordError(this.account.id, `Login check failed: ${error.message}`);
        }

        // 关闭Tab（如果出错）
        if (tabId && shouldClose) {
          try {
            await this.browserManager.tabManager.closeTab(this.account.id, tabId);
          } catch (closeError) {
            logger.warn('Failed to close login check tab:', closeError.message);
          }
        }
      }

    } catch (outerError) {
      logger.error(`Fatal error in login detection for account ${this.account.id}:`, outerError);
      
      // 记录严重错误
      if (this.accountStatusReporter) {
        this.accountStatusReporter.recordError(this.account.id, `Fatal login check error: ${outerError.message}`);
      }
    }

    // ⭐ 健康检查：只在已登录状态下检查实时监控
    if (this.currentLoginStatus === 'logged_in') {
      await this.checkRealtimeMonitorHealth();
    }

    // 调度下次检测
    this.scheduleNext();
  }

  /**
   * 处理登录状态变化
   * @param {string} newStatus - 新的登录状态 'logged_in' | 'not_logged_in'
   */
  async onLoginStatusChanged(newStatus) {
    logger.info(`Handling login status change to '${newStatus}' for account ${this.account.id}`);

    try {
      if (newStatus === 'logged_in') {
        // 登录成功：启动所有常驻任务和爬虫任务
        logger.info(`✓ Account ${this.account.id} is now logged in - starting ALL tasks`);
        
        // 1. 启动爬虫任务（MonitorTask）
        if (this.taskRunner && typeof this.taskRunner.startMonitoringTask === 'function') {
          await this.taskRunner.startMonitoringTask(this.account.id);
          logger.info(`✓ Crawling tasks started for account ${this.account.id}`);
        }

        // 2. 启动实时监控任务（常驻任务）
        if (this.platformManager) {
          const platformInstance = this.platformManager.getPlatform(this.account.platform);
          if (platformInstance && typeof platformInstance.startRealtimeMonitor === 'function') {
            try {
              await platformInstance.startRealtimeMonitor(this.account);
              logger.info(`✓ Realtime monitor started for account ${this.account.id}`);
            } catch (error) {
              logger.warn(`Failed to start realtime monitor: ${error.message}`);
            }
          }
        }

        // 3. 同步登录成功状态给Master
        if (this.accountStatusReporter) {
          this.accountStatusReporter.updateAccountStatus(this.account.id, {
            worker_status: 'online',
            login_status: 'logged_in'
          });
        }

        logger.info(`🚀 All tasks started for logged-in account ${this.account.id}`);

      } else if (newStatus === 'not_logged_in') {
        // 登录失败：停止所有任务和清理Tab
        logger.info(`✗ Account ${this.account.id} is not logged in - stopping ALL tasks`);
        
        // 1. 停止爬虫任务（MonitorTask）
        if (this.taskRunner && typeof this.taskRunner.stopMonitoringTask === 'function') {
          await this.taskRunner.stopMonitoringTask(this.account.id);
          logger.info(`✓ Crawling tasks stopped for account ${this.account.id}`);
        }

        // 2. 停止实时监控任务（常驻任务）
        if (this.platformManager) {
          const platformInstance = this.platformManager.getPlatform(this.account.platform);
          if (platformInstance && typeof platformInstance.stopRealtimeMonitor === 'function') {
            try {
              await platformInstance.stopRealtimeMonitor(this.account.id);
              logger.info(`✓ Realtime monitor stopped for account ${this.account.id}`);
            } catch (error) {
              logger.warn(`Failed to stop realtime monitor: ${error.message}`);
            }
          }
        }

        // 3. 清理与任务相关的Tab（保留默认Tab用于登录检测）
        await this.cleanupAllTaskTabs();

        // 4. 同步登录失败状态给Master
        if (this.accountStatusReporter) {
          this.accountStatusReporter.updateAccountStatus(this.account.id, {
            worker_status: 'offline', 
            login_status: 'not_logged_in'
          });
        }

        logger.info(`🛑 All tasks stopped for not-logged-in account ${this.account.id}`);
      }

    } catch (error) {
      logger.error(`Failed to handle login status change for account ${this.account.id}:`, error);
      
      if (this.accountStatusReporter) {
        this.accountStatusReporter.recordError(this.account.id, `Login status change handling failed: ${error.message}`);
      }
    }
  }

  /**
   * 清理所有任务相关的Tab（登录失败时）
   * 只保留PLACEHOLDER（登录检测用）和LOGIN（登录用）Tab
   */
  async cleanupAllTaskTabs() {
    try {
      logger.info(`Cleaning up all task tabs for account ${this.account.id}`);
      
      const accountTabs = this.browserManager.tabManager.tabs.get(this.account.id);
      if (!accountTabs) {
        return;
      }

      // 需要清理的Tab类型（保留PLACEHOLDER用于登录检测，LOGIN用于手动登录）
      const tabsToClose = [
        TabTag.SPIDER_COMMENT,      // 评论爬虫
        TabTag.SPIDER_DM,           // 私信爬虫
        TabTag.REALTIME_MONITOR,    // 实时监控（常驻任务）
        TabTag.REPLY_COMMENT,       // 评论回复
        TabTag.REPLY_DM             // 私信回复
      ];

      const closePromises = [];
      let closedCount = 0;

      for (const [tabId, tabInfo] of accountTabs.entries()) {
        if (tabsToClose.includes(tabInfo.tag)) {
          closePromises.push(
            this.browserManager.tabManager.closeTab(this.account.id, tabId)
              .then(() => {
                closedCount++;
              })
              .catch(error => {
                logger.warn(`Failed to close tab ${tabId}:`, error.message);
              })
          );
        }
      }

      await Promise.all(closePromises);
      logger.info(`✓ Task tabs cleanup completed for account ${this.account.id} (${closedCount} tabs closed)`);

    } catch (error) {
      logger.error(`Failed to cleanup task tabs for account ${this.account.id}:`, error);
    }
  }

  /**
   * 检查实时监控健康状态
   * 如果实时监控不存在或 Tab 已关闭，尝试恢复
   */
  async checkRealtimeMonitorHealth() {
    try {
      const platformInstance = this.platformManager.getPlatform(this.account.platform);
      if (!platformInstance || typeof platformInstance.startRealtimeMonitor !== 'function') {
        // 平台不支持实时监控，跳过
        return;
      }

      const monitor = platformInstance.realtimeMonitors?.get(this.account.id);

      // 情况1：实时监控不存在（但应该存在）
      if (!monitor) {
        logger.warn(`实时监控不存在，尝试恢复 (账户: ${this.account.id})`);
        try {
          await platformInstance.startRealtimeMonitor(this.account);
          logger.info(`✅ 实时监控已自动恢复 (账户: ${this.account.id})`);
        } catch (error) {
          logger.error(`实时监控恢复失败 (账户: ${this.account.id}): ${error.message}`);
        }
        return;
      }

      // 情况2：实时监控存在，但 page 已关闭
      if (monitor.page) {
        try {
          if (monitor.page.isClosed()) {
            logger.warn(`实时监控 Tab 已关闭，尝试恢复 (账户: ${this.account.id})`);
            platformInstance.realtimeMonitors.delete(this.account.id);
            await platformInstance.startRealtimeMonitor(this.account);
            logger.info(`✅ 实时监控已自动恢复 (账户: ${this.account.id})`);
          }
        } catch (error) {
          // page.isClosed() 可能抛出错误（浏览器已断开）
          logger.warn(`实时监控 Tab 不可访问，尝试恢复 (账户: ${this.account.id}): ${error.message}`);
          platformInstance.realtimeMonitors.delete(this.account.id);
          try {
            await platformInstance.startRealtimeMonitor(this.account);
            logger.info(`✅ 实时监控已自动恢复 (账户: ${this.account.id})`);
          } catch (recoveryError) {
            logger.error(`实时监控恢复失败 (账户: ${this.account.id}): ${recoveryError.message}`);
          }
        }
      }

    } catch (error) {
      logger.error(`实时监控健康检查失败 (账户: ${this.account.id}):`, error);
    }
  }

  /**
   * 获取当前状态信息
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentLoginStatus: this.currentLoginStatus,
      lastCheckTime: this.lastCheckTime,
      executionCount: this.executionCount,
      loginCheckInterval: this.loginCheckInterval,
      nextCheckIn: this.timeoutId ? 'scheduled' : 'not_scheduled'
    };
  }
}

module.exports = LoginDetectionTask;