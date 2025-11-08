/**
 * 监控任务执行器
 * T052: 管理多个账户的监控任务
 * 
 * 重构说明：
 * - 分离登录检测任务和爬虫任务
 * - 登录检测任务独立运行，控制爬虫任务的启停
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const MonitorTask = require('./monitor-task');
const LoginDetectionTask = require('./login-detection-task');
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
    
    // 登录检测任务和爬虫任务分离
    this.loginDetectionTasks = new Map(); // accountId -> LoginDetectionTask
    this.monitorTasks = new Map();        // accountId -> MonitorTask
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

    // 停止所有登录检测任务
    for (const [accountId, loginDetectionTask] of this.loginDetectionTasks.entries()) {
      await loginDetectionTask.stop();
    }

    // 停止所有爬虫任务
    for (const [accountId, monitorTask] of this.monitorTasks.entries()) {
      await monitorTask.stop();
    }

    this.loginDetectionTasks.clear();
    this.monitorTasks.clear();
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
   * 添加账户任务（分离登录检测和爬虫任务）
   * @param {object} account - 账户对象
   * @param {object} options - 选项
   * @param {boolean} options.startLoginDetection - 是否立即启动登录检测任务，默认true
   */
  async addTask(account, options = {}) {
    const { startLoginDetection = true } = options;
    const { id } = account;

    if (this.loginDetectionTasks.has(id)) {
      logger.warn(`Tasks for account ${id} already exist, updating`);
      await this.removeTask(id);
    }

    logger.info(`Adding tasks for account ${id}`, {
      platform: account.platform,
      interval: account.monitor_interval,
      startLoginDetection
    });

    // 🔥 预加载缓存（异步执行，不阻塞任务启动）
    this.preloadAccountCache(id).catch((err) => {
      logger.warn(`Cache preload failed for account ${id}, will continue without cache:`, err);
    });

    // 1. 创建登录检测任务（独立运行）
    const loginDetectionTask = new LoginDetectionTask(
      account,
      this.platformManager,
      this.browserManager,
      this.accountStatusReporter,
      this  // 传递TaskRunner实例用于控制爬虫任务
    );

    // 2. 创建爬虫任务（但不立即启动，由登录检测任务控制）
    const monitorTask = new MonitorTask(
      account,
      this.socketClient,
      this.platformManager,
      this.accountStatusReporter,
      this.browserManager
    );

    // 保存任务实例
    this.loginDetectionTasks.set(id, loginDetectionTask);
    this.monitorTasks.set(id, monitorTask);

    // 根据选项决定是否立即启动登录检测任务
    if (startLoginDetection) {
      await loginDetectionTask.start();
      logger.info(`Tasks added for account ${id} (login detection started)`);
    } else {
      logger.info(`Tasks added for account ${id} (login detection NOT started, call startLoginDetection() manually)`);
    }
  }

  /**
   * 手动启动账户的登录检测任务
   * @param {string} accountId - 账户ID
   */
  async startLoginDetection(accountId) {
    const loginDetectionTask = this.loginDetectionTasks.get(accountId);
    if (!loginDetectionTask) {
      logger.warn(`No login detection task found for account ${accountId}`);
      return;
    }

    if (loginDetectionTask.isRunning) {
      logger.warn(`Login detection task for account ${accountId} is already running`);
      return;
    }

    await loginDetectionTask.start();
    logger.info(`✓ Login detection started for account ${accountId}`);
  }

  /**
   * 移除账户的所有任务
   * @param {string} accountId - 账户ID
   */
  async removeTask(accountId) {
    // 停止登录检测任务
    const loginDetectionTask = this.loginDetectionTasks.get(accountId);
    if (loginDetectionTask) {
      await loginDetectionTask.stop();
      this.loginDetectionTasks.delete(accountId);
    }

    // 停止爬虫任务
    const monitorTask = this.monitorTasks.get(accountId);
    if (monitorTask) {
      await monitorTask.stop();
      this.monitorTasks.delete(accountId);
    }

    logger.info(`Removed all tasks for account ${accountId}`);
  }

  /**
   * 更新任务配置
   * @param {string} accountId - 账户ID
   * @param {object} updates - 更新的配置
   */
  updateTask(accountId, updates) {
    const monitorTask = this.monitorTasks.get(accountId);
    if (monitorTask) {
      monitorTask.updateAccount(updates);
      logger.info(`Updated monitor task for account ${accountId}`);
    }

    const loginDetectionTask = this.loginDetectionTasks.get(accountId);
    if (loginDetectionTask) {
      loginDetectionTask.account = { ...loginDetectionTask.account, ...updates };
      logger.info(`Updated login detection task for account ${accountId}`);
    }

    if (!monitorTask && !loginDetectionTask) {
      logger.warn(`No tasks found for account ${accountId}`);
    }
  }

  /**
   * 启动爬虫任务（由登录检测任务调用）
   * @param {string} accountId - 账户ID
   */
  async startMonitoringTask(accountId) {
    const monitorTask = this.monitorTasks.get(accountId);
    if (monitorTask) {
      if (!monitorTask.isRunning) {
        await monitorTask.start();
        logger.info(`✓ Started monitoring task for account ${accountId}`);
      } else {
      }
    } else {
      logger.warn(`No monitoring task found for account ${accountId}`);
    }
  }

  /**
   * 停止爬虫任务（由登录检测任务调用）
   * @param {string} accountId - 账户ID
   */
  async stopMonitoringTask(accountId) {
    const monitorTask = this.monitorTasks.get(accountId);
    if (monitorTask) {
      if (monitorTask.isRunning) {
        await monitorTask.stop();
        logger.info(`✓ Stopped monitoring task for account ${accountId}`);
      } else {
      }
    } else {
      logger.warn(`No monitoring task found for account ${accountId}`);
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
      total_accounts: this.loginDetectionTasks.size,
      login_detection_tasks: [],
      monitor_tasks: [],
    };

    // 登录检测任务统计
    for (const [accountId, loginDetectionTask] of this.loginDetectionTasks.entries()) {
      stats.login_detection_tasks.push({
        accountId,
        ...loginDetectionTask.getStatus()
      });
    }

    // 爬虫任务统计
    for (const [accountId, monitorTask] of this.monitorTasks.entries()) {
      stats.monitor_tasks.push({
        accountId,
        ...monitorTask.getStats()
      });
    }

    return stats;
  }

  /**
   * ⭐ 更新账户配置（用于配置热更新）
   * @param {string} accountId - 账户ID
   * @param {Object} updatedAccount - 更新后的账户对象
   */
  updateAccountConfig(accountId, updatedAccount) {
    try {
      const monitorTask = this.monitorTasks.get(accountId);
      if (monitorTask) {
        // 更新MonitorTask中的账户配置
        monitorTask.account = updatedAccount;
        logger.info(`✅ Updated account config in MonitorTask for ${accountId}`);
      }

      const loginDetectionTask = this.loginDetectionTasks.get(accountId);
      if (loginDetectionTask) {
        // 更新LoginDetectionTask中的账户配置
        loginDetectionTask.account = updatedAccount;
        logger.info(`✅ Updated account config in LoginDetectionTask for ${accountId}`);
      }

      if (!monitorTask && !loginDetectionTask) {
        logger.warn(`No tasks found for account ${accountId}, cannot update config`);
      }
    } catch (error) {
      logger.error(`Failed to update account config for ${accountId}:`, error);
    }
  }
}

module.exports = TaskRunner;
