/**
 * 监控任务执行器
 * T052: 管理多个账户的监控任务
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const MonitorTask = require('./monitor-task');
const ReplyExecutor = require('./reply-executor');
const { getCacheManager } = require('../services/cache-manager');

const logger = createLogger('task-runner');
const cacheManager = getCacheManager();

class TaskRunner {
  constructor(socketClient, heartbeatSender, platformManager, accountStatusReporter = null, browserManager = null) {
    this.socketClient = socketClient;
    this.heartbeatSender = heartbeatSender;
    this.platformManager = platformManager;
    this.accountStatusReporter = accountStatusReporter;
    this.browserManager = browserManager;
    this.tasks = new Map(); // accountId -> MonitorTask
    this.running = false;

    // 初始化回复执行器
    this.replyExecutor = new ReplyExecutor(platformManager, browserManager, socketClient);

    // 监听回复请求事件
    this.setupReplyHandlers();
  }

  /**
   * 启动任务执行器
   */
  start() {
    logger.info('Task runner started');
    this.running = true;
  }

  /**
   * 停止任务执行器
   */
  async stop() {
    logger.info('Stopping task runner');
    this.running = false;

    // 停止所有监控任务
    for (const [accountId, monitorTask] of this.tasks.entries()) {
      await monitorTask.stop();
      logger.debug(`Stopped task for account ${accountId}`);
    }

    this.tasks.clear();
    logger.info('Task runner stopped');
  }

  /**
   * 预加载账号的缓存数据
   * @param {string} accountId - 账户ID
   * @returns {Promise<void>}
   */
  async preloadAccountCache(accountId) {
    try {
      logger.info(`Preloading cache for account ${accountId}`);

      // 通过 Socket.IO 请求历史数据 ID
      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 10000);

        this.socketClient.socket.emit(
          'worker:get_history_ids',
          { account_id: accountId },
          (response) => {
            clearTimeout(timeout);
            resolve(response);
          }
        );
      });

      if (result.success) {
        // 预加载到缓存管理器
        cacheManager.preloadCache(accountId, {
          commentIds: result.commentIds || [],
          videoIds: result.videoIds || [],
          messageIds: result.messageIds || [],
        });

        logger.info(
          `Cache preloaded for account ${accountId}: ${result.commentIds?.length || 0} comments, ${result.videoIds?.length || 0} videos, ${result.messageIds?.length || 0} messages`
        );
      } else {
        logger.warn(`Failed to preload cache for account ${accountId}: ${result.error}`);
      }
    } catch (error) {
      logger.error(`Error preloading cache for account ${accountId}:`, error);
    }
  }

  /**
   * 添加监控任务
   * @param {object} account - 账户对象
   */
  async addTask(account) {
    const { id } = account;

    if (this.tasks.has(id)) {
      logger.warn(`Task for account ${id} already exists, updating`);
      await this.removeTask(id);
    }

    logger.info(`Adding monitoring task for account ${id}`, {
      platform: account.platform,
      interval: account.monitor_interval,
    });

    // 🔥 预加载缓存（异步执行，不阻塞任务启动）
    this.preloadAccountCache(id).catch((err) => {
      logger.warn(`Cache preload failed for account ${id}, will continue without cache:`, err);
    });

    // 创建并启动监控任务（传入 platformManager 和 accountStatusReporter）
    const monitorTask = new MonitorTask(
      account,
      this.socketClient,
      this.platformManager,
      this.accountStatusReporter
    );
    await monitorTask.start();

    this.tasks.set(id, monitorTask);

    logger.info(`Task added and started for account ${id}`);
  }

  /**
   * 移除监控任务
   * @param {string} accountId - 账户ID
   */
  async removeTask(accountId) {
    const monitorTask = this.tasks.get(accountId);
    if (monitorTask) {
      await monitorTask.stop();
      this.tasks.delete(accountId);
      logger.info(`Removed task for account ${accountId}`);
    }
  }

  /**
   * 更新任务配置
   * @param {string} accountId - 账户ID
   * @param {object} updates - 更新的配置
   */
  updateTask(accountId, updates) {
    const monitorTask = this.tasks.get(accountId);
    if (monitorTask) {
      monitorTask.updateAccount(updates);
      logger.info(`Updated task for account ${accountId}`);
    } else {
      logger.warn(`Task not found for account ${accountId}`);
    }
  }

  /**
   * 设置回复事件处理器
   */
  setupReplyHandlers() {
    try {
      if (!this.socketClient || !this.socketClient.socket) {
        logger.warn('Socket client not ready, reply handlers setup deferred');
        return;
      }

      // 监听 Master 发送的回复请求
      this.socketClient.socket.on('master:reply:request', async (data) => {
        logger.info(`Received reply request: ${data.reply_id}`, {
          requestId: data.request_id,
          platform: data.platform,
        });

        try {
          // 异步执行回复，不阻塞主线程
          setImmediate(() => {
            this.replyExecutor.executeReply(data).catch((error) => {
              logger.error('Failed to execute reply:', error);
            });
          });
        } catch (error) {
          logger.error('Failed to process reply request:', error);
        }
      });

      logger.info('Reply handlers setup completed');
    } catch (error) {
      logger.error('Failed to setup reply handlers:', error);
    }
  }

  /**
   * 获取任务统计
   * @returns {object}
   */
  getStats() {
    const stats = {
      total_tasks: this.tasks.size,
      tasks: [],
    };

    for (const [accountId, monitorTask] of this.tasks.entries()) {
      stats.tasks.push(monitorTask.getStats());
    }

    return stats;
  }
}

module.exports = TaskRunner;
