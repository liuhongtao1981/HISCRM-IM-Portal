/**
 * Monitor Task
 * T052: 监控任务处理器 - 管理账户监控任务
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const DouyinCrawler = require('../crawlers/douyin-crawler');
const CommentParser = require('../parsers/comment-parser');
const DMParser = require('../parsers/dm-parser');
const CacheHandler = require('./cache-handler');
const MessageReporter = require('../communication/message-reporter');

const logger = createLogger('monitor-task');

/**
 * Monitor Task 类
 * 管理单个账户的监控任务
 */
class MonitorTask {
  constructor(account, socketClient) {
    this.account = account;
    this.socketClient = socketClient;

    // 初始化组件
    this.crawler = new DouyinCrawler();
    this.commentParser = new CommentParser();
    this.dmParser = new DMParser();
    this.cacheHandler = new CacheHandler();
    this.messageReporter = new MessageReporter(socketClient);

    // 任务状态
    this.isRunning = false;
    this.timeoutId = null;
    this.executionCount = 0;

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

    // 初始化爬虫
    try {
      await this.crawler.initialize(this.account);
    } catch (error) {
      logger.error('Failed to initialize crawler:', error);
      return;
    }

    this.isRunning = true;

    // 立即执行第一次
    await this.execute();

    // 调度下一次执行 (使用随机间隔)
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

    // 清理爬虫资源
    try {
      await this.crawler.cleanup();
    } catch (error) {
      logger.error('Failed to cleanup crawler:', error);
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
      // 1. 爬取评论
      const rawComments = await this.crawler.crawlComments(this.account);

      // 2. 解析评论
      const parsedComments = this.commentParser.parse(rawComments);

      // 3. 过滤已缓存的评论
      const newComments = this.cacheHandler.filterNew(
        this.account.id,
        parsedComments,
        'platform_comment_id'
      );

      // 4. 爬取私信
      const rawDMs = await this.crawler.crawlDirectMessages(this.account);

      // 5. 解析私信
      const parsedDMs = this.dmParser.parse(rawDMs);

      // 6. 过滤已缓存的私信
      const newDMs = this.cacheHandler.filterNew(
        this.account.id,
        parsedDMs,
        'platform_message_id'
      );

      // 7. 上报新消息
      if (newComments.length > 0 || newDMs.length > 0) {
        this.messageReporter.reportAll(this.account.id, {
          comments: newComments,
          directMessages: newDMs,
        });
      }

      logger.info(`Monitor execution completed`, {
        account_id: this.account.id,
        new_comments: newComments.length,
        new_dms: newDMs.length,
      });
    } catch (error) {
      logger.error('Monitor execution failed:', error);
      // TODO: T060 - 错误处理逻辑(重试、报警等)
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
