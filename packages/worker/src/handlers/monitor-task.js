/**
 * Monitor Task
 * T052: 监控任务处理器 - 管理账户监控任务
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const CommentParser = require('../parsers/comment-parser');
const DMParser = require('../parsers/dm-parser');
const CacheHandler = require('./cache-handler');
const MessageReporter = require('../communication/message-reporter');
const debugConfig = require('../config/debug-config');

const logger = createLogger('monitor-task');

/**
 * Monitor Task 类
 * 管理单个账户的监控任务
 */
class MonitorTask {
  constructor(account, socketClient, platformManager, accountStatusReporter = null, browserManager = null) {
    this.account = account;
    this.socketClient = socketClient;
    this.platformManager = platformManager;
    this.accountStatusReporter = accountStatusReporter;
    this.browserManager = browserManager;  // 保存 browserManager 引用以便检查登录状态

    // 初始化组件
    // 注意: crawler 将通过 platformManager 获取，不再直接实例化
    this.commentParser = new CommentParser();
    this.dmParser = new DMParser();
    this.cacheHandler = new CacheHandler();
    this.messageReporter = new MessageReporter(socketClient);

    // 任务状态
    this.isRunning = false;
    this.timeoutId = null;
    this.executionCount = 0;

    // 累计统计
    this.totalComments = 0;
    this.totalWorks = 0;
    this.totalFollowers = 0;
    this.totalFollowing = 0;

    // 随机间隔配置 (15-30秒)
    this.minInterval = 15;  // 最小间隔15秒
    this.maxInterval = 30;  // 最大间隔30秒
  }

  /**
   * 生成随机间隔时间 (15-30秒)
   * @returns {number} 随机间隔时间(毫秒)
   */
  getRandomInterval() {
    const randomSeconds = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
    return Math.floor(randomSeconds * 1000);
  }

  /**
   * 调度下一次执行
   */
  scheduleNext() {
    if (!this.isRunning) {
      return;
    }

    const nextInterval = this.getRandomInterval();
    const nextIntervalSec = (nextInterval / 1000).toFixed(1);

    logger.info(`Scheduling next execution in ${nextIntervalSec}s for account ${this.account.id}`);

    this.timeoutId = setTimeout(() => {
      this.execute();
    }, nextInterval);
  }

  /**
   * 启动监控任务
   */
  async start() {
    if (this.isRunning) {
      logger.warn(`Monitor task for account ${this.account.id} is already running`);
      return;
    }

    logger.info(`Starting monitor task for account ${this.account.account_name}`, {
      account_id: this.account.id,
      interval_range: `${this.minInterval}-${this.maxInterval}s (random)`,
    });

    // 获取平台实例
    const platformInstance = this.platformManager.getPlatform(this.account.platform);
    if (!platformInstance) {
      logger.error(`Platform ${this.account.platform} not supported or not loaded`);
      return;
    }
    
    this.platformInstance = platformInstance;

    this.isRunning = true;

    // 不阻塞启动流程,直接调度第一次执行
    // 第一次执行会在随机延迟后自动开始
    this.scheduleNext();

    logger.info(`Monitor task started with random interval ${this.minInterval}-${this.maxInterval}s`);
  }

  /**
   * 停止监控任务
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping monitor task for account ${this.account.id}`);

    this.isRunning = false;

    // 清除定时器
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 清理缓存
    this.cacheHandler.clear(this.account.id);

    logger.info(`Monitor task stopped for account ${this.account.id}`);
  }

  /**
   * 执行一次监控
   */
  async execute() {
    if (!this.isRunning) {
      return;
    }

    this.executionCount++;

    logger.info(`Executing monitor task for account ${this.account.id} (count: ${this.executionCount})`);

    try {
      // 0. Debug 模式：检查是否是被跳过的账户（无浏览器）
      if (debugConfig.enabled && debugConfig.singleAccount.enabled) {
        // 检查浏览器是否存在
        const browserContext = this.platformInstance?.browserContext;
        if (!browserContext) {
          logger.debug(`Debug 模式：账号 ${this.account.id} 没有浏览器，跳过本次爬取`);
          // 不报错，仅跳过本次执行，下次继续尝试
          return;
        }
      }

      // 1. 实时检查登录状态 - 在每次爬取前验证
      logger.info(`Checking real-time login status for account ${this.account.id}...`);

      let loginCheckTabId = null;
      let loginCheckPage = null;

      try {
        // ⭐ 使用 TabManager 获取登录检测窗口
        // 登录检测规则:
        // - 如果有登录任务窗口,复用它
        // - 如果没有登录任务窗口,创建新的检测窗口
        // - 检测后如果不是登录任务窗口,关闭它
        const { TabTag } = require('../browser/tab-manager');
        const { tabId, page, shouldClose } = await this.browserManager.tabManager.getPageForTask(this.account.id, {
          tag: TabTag.LOGIN_CHECK,
          persistent: false,     // 检测完关闭
          shareable: true,       // 可以复用登录窗口
          forceNew: false        // 优先复用已有窗口
        });

        loginCheckTabId = tabId;
        loginCheckPage = page;

        // 导航到创作中心（如果还没在那里）
        if (!page.url().includes('creator.douyin.com')) {
          logger.info('Navigating to creator center for login check...');
          await page.goto('https://creator.douyin.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await page.waitForTimeout(2000);
        }

        // 调用平台的登录状态检测方法
        const loginStatus = await this.platformInstance.checkLoginStatus(page);

        if (!loginStatus.isLoggedIn) {
          logger.warn(`✗ Account ${this.account.id} is NOT logged in (real-time check), skipping crawl`);

          // 记录到状态报告器并更新为离线
          if (this.accountStatusReporter) {
            this.accountStatusReporter.recordError(this.account.id, 'Not logged in - login required');
            this.accountStatusReporter.updateAccountStatus(this.account.id, {
              worker_status: 'offline',
              login_status: 'not_logged_in'
            });
          }

          // ⭐ 关闭登录检测窗口（如果不是登录任务窗口）
          if (loginCheckTabId && shouldClose) {
            await this.browserManager.tabManager.closeTab(this.account.id, loginCheckTabId);
          }

          return;  // 跳过本次执行,等待下次调度
        }

        logger.info(`✓ Account ${this.account.id} is logged in, starting crawl...`);

        // 确保登录状态被正确设置
        if (this.accountStatusReporter) {
          this.accountStatusReporter.updateAccountStatus(this.account.id, {
            login_status: 'logged_in'
          });
        }

        // ⭐ 关闭登录检测窗口（如果不是登录任务窗口）
        if (loginCheckTabId && shouldClose) {
          await this.browserManager.tabManager.closeTab(this.account.id, loginCheckTabId);
        }
      } catch (error) {
        logger.error(`Failed to check login status for account ${this.account.id}:`, error);

        // 检查失败也跳过本次爬取
        if (this.accountStatusReporter) {
          this.accountStatusReporter.recordError(this.account.id, `Login check failed: ${error.message}`);
        }

        // ⭐ 关闭登录检测窗口（如果不是登录任务窗口）
        if (loginCheckTabId) {
          try {
            await this.browserManager.tabManager.closeTab(this.account.id, loginCheckTabId);
          } catch (e) {
            logger.warn('Failed to close login check tab:', e.message);
          }
        }

        return;
      }

      // ⭐ 关键改进: 并行执行评论和私信爬取 (使用 Promise.all)
      // 现在评论爬虫 (spider2) 和私信爬虫 (spider1) 可以独立运行，互不干扰
      logger.info(`Starting parallel crawling: spider1 (DM) and spider2 (Comments)`);

      const [commentResult, dmResult] = await Promise.all([
        // 1. 爬取评论（通过平台实例）- 返回 { comments, stats }
        // 使用 spider2 (Tab 2) 独立运行
        (async () => {
          try {
            logger.info(`Spider2 (Comments) started for account ${this.account.id}`);
            const result = await this.platformInstance.crawlComments(this.account);
            logger.info(`Spider2 (Comments) completed for account ${this.account.id}`);
            return result;
          } catch (error) {
            logger.error(`Spider2 (Comments) failed: ${error.message}`);
            throw error;
          }
        })(),

        // 4. 爬取私信（通过平台实例）- 返回 { conversations, directMessages, stats } (Phase 8)
        // 使用 spider1 (Tab 1) 独立运行
        (async () => {
          try {
            logger.info(`Spider1 (DM) started for account ${this.account.id}`);
            const result = await this.platformInstance.crawlDirectMessages(this.account);
            logger.info(`Spider1 (DM) completed for account ${this.account.id}`);
            return result;
          } catch (error) {
            logger.error(`Spider1 (DM) failed: ${error.message}`);
            throw error;
          }
        })(),
      ]);

      const rawComments = commentResult.comments || commentResult;  // 兼容旧版本
      const commentStats = commentResult.stats || {};

      // 2. 解析评论
      const parsedComments = this.commentParser.parse(rawComments);

      // 3. 过滤已缓存的评论
      const newComments = this.cacheHandler.filterNew(
        this.account.id,
        parsedComments,
        'platform_comment_id'
      );

      const conversations = dmResult.conversations || [];  // Phase 8 新增
      const rawDMs = dmResult.directMessages || dmResult;  // 兼容旧版本
      const dmStats = dmResult.stats || {};

      // 5. 解析私信
      const parsedDMs = this.dmParser.parse(rawDMs);

      // 6. 过滤已缓存的私信
      const newDMs = this.cacheHandler.filterNew(
        this.account.id,
        parsedDMs,
        'platform_message_id'
      );

      // 7. 上报新消息和会话 (Phase 8: 添加会话报告)
      if (newComments.length > 0 || newDMs.length > 0 || conversations.length > 0) {
        this.messageReporter.reportAll(this.account.id, {
          comments: newComments,
          directMessages: newDMs,
          conversations,  // Phase 8 新增: 上报会话数据
        });
      }

      // 8. 更新累计统计
      this.totalComments += newComments.length;
      // totalWorks 可以从平台特定的统计中获取（暂时使用 mock 数据）
      this.totalWorks += Math.floor(Math.random() * 2);  // Mock: 随机0-1个作品

      // 9. 上报爬虫统计到 AccountStatusReporter
      if (this.accountStatusReporter) {
        this.accountStatusReporter.recordCrawlComplete(this.account.id, {
          total_comments: this.totalComments,
          total_contents: this.totalWorks,
          total_followers: this.totalFollowers,  // 可从 userInfo 获取
          total_following: this.totalFollowing,  // 可从 userInfo 获取
          recent_comments_count: commentStats.recent_comments_count || newComments.length,
          recent_contents_count: 0,  // 暂时未实现作品爬取
        });
      }

      logger.info(`Monitor execution completed`, {
        account_id: this.account.id,
        new_comments: newComments.length,
        new_dms: newDMs.length,
        total_comments: this.totalComments,
        total_contents: this.totalWorks,
      });
    } catch (error) {
      logger.error('Monitor execution failed:', error);

      // 记录错误到 AccountStatusReporter
      if (this.accountStatusReporter) {
        this.accountStatusReporter.recordError(this.account.id, error.message);
      }
    } finally {
      // 执行完成后调度下一次执行 (无论成功或失败)
      this.scheduleNext();
    }
  }

  /**
   * 更新账户配置
   * @param {object} updates - 更新的配置
   */
  updateAccount(updates) {
    const oldInterval = this.account.monitor_interval;

    Object.assign(this.account, updates);

    // 如果监控间隔改变,重启任务
    if (updates.monitor_interval && updates.monitor_interval !== oldInterval) {
      logger.info(`Restarting task due to interval change: ${oldInterval}s -> ${updates.monitor_interval}s`);

      this.stop().then(() => {
        this.start();
      });
    }
  }

  /**
   * 获取任务统计
   * @returns {object}
   */
  getStats() {
    return {
      account_id: this.account.id,
      account_name: this.account.account_name,
      is_running: this.isRunning,
      execution_count: this.executionCount,
      cache_stats: this.cacheHandler.getStats(),
    };
  }
}

module.exports = MonitorTask;
