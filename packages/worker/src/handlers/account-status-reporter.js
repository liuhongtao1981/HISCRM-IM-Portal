/**
 * 账号状态上报器
 * 定期收集账号运行时状态并上报到 Master
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage, WORKER_ACCOUNT_STATUS } = require('@hiscrm-im/shared/protocol/messages');
const { MESSAGE } = require('@hiscrm-im/shared/protocol/events');

const logger = createLogger('account-status-reporter', './logs');

class AccountStatusReporter {
  constructor(socket, workerId) {
    this.socket = socket;
    this.workerId = workerId;
    // 从环境变量读取配置
    this.reportInterval = parseInt(process.env.ACCOUNT_STATUS_REPORT_INTERVAL) || 60000;  // 1分钟
    this.batchSize = parseInt(process.env.ACCOUNT_STATUS_BATCH_SIZE) || 50;
    this.accountStatuses = new Map();  // accountId -> status
    this.reportTimer = null;
  }

  /**
   * 启动定期上报
   */
  start() {
    if (this.reportTimer) {
      logger.warn('Account status reporter already started');
      return;
    }

    logger.info(`Starting account status reporter (interval: ${this.reportInterval}ms)`);

    // 立即上报一次
    this.reportStatuses();

    // 设置定期上报
    this.reportTimer = setInterval(() => {
      this.reportStatuses();
    }, this.reportInterval);
  }

  /**
   * 停止上报
   */
  stop() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
      logger.info('Account status reporter stopped');
    }
  }

  /**
   * 更新账号状态（本地缓存）
   * @param {string} accountId - 账号 ID
   * @param {object} status - 状态数据
   */
  updateAccountStatus(accountId, status) {
    const now = Math.floor(Date.now() / 1000);

    this.accountStatuses.set(accountId, {
      account_id: accountId,
      status: {
        ...status,
        last_heartbeat_time: now,
      },
      timestamp: Date.now(),
    });

    logger.debug(`Updated status for account ${accountId}`, status);
  }

  /**
   * 上报所有账号状态到 Master
   */
  async reportStatuses() {
    if (this.accountStatuses.size === 0) {
      logger.info('No account statuses to report (accountStatuses map is empty)');
      return;
    }

    const statusArray = Array.from(this.accountStatuses.values());
    logger.info(`Reporting ${statusArray.length} account statuses to Master`);

    // 分批上报
    for (let i = 0; i < statusArray.length; i += this.batchSize) {
      const batch = statusArray.slice(i, i + this.batchSize);

      const message = createMessage(WORKER_ACCOUNT_STATUS, {
        worker_id: this.workerId,
        account_statuses: batch.map(item => ({
          account_id: item.account_id,
          status: item.status,
        })),
      });

      try {
        this.socket.emit(MESSAGE, message);
        logger.info(`Successfully reported ${batch.length} account statuses to Master`);
      } catch (error) {
        logger.error('Failed to report account statuses:', error);
      }
    }
  }

  /**
   * 记录爬虫完成事件
   * @param {string} accountId - 账号 ID
   * @param {object} stats - 爬虫统计数据
   */
  recordCrawlComplete(accountId, stats) {
    const now = Math.floor(Date.now() / 1000);

    this.updateAccountStatus(accountId, {
      worker_status: 'online',
      total_comments: stats.total_comments,
      total_works: stats.total_works,
      total_followers: stats.total_followers,
      total_following: stats.total_following,
      recent_comments_count: stats.recent_comments_count || 0,
      recent_works_count: stats.recent_works_count || 0,
      last_crawl_time: now,
    });

    logger.info(`Recorded crawl complete for account ${accountId}`, {
      comments: stats.total_comments,
      works: stats.total_works,
    });
  }

  /**
   * 记录错误事件
   * @param {string} accountId - 账号 ID
   * @param {string} errorMessage - 错误信息
   */
  recordError(accountId, errorMessage) {
    const currentStatus = this.accountStatuses.get(accountId);
    const errorCount = (currentStatus?.status?.error_count || 0) + 1;

    this.updateAccountStatus(accountId, {
      worker_status: 'error',
      error_count: errorCount,
      last_error_message: errorMessage.substring(0, 500),  // 限制长度
    });

    logger.warn(`Recorded error for account ${accountId}: ${errorMessage}`);
  }

  /**
   * 设置账号在线
   * @param {string} accountId - 账号 ID
   */
  setAccountOnline(accountId) {
    this.updateAccountStatus(accountId, {
      worker_status: 'online',
    });
  }

  /**
   * 设置账号离线
   * @param {string} accountId - 账号 ID
   */
  setAccountOffline(accountId) {
    this.updateAccountStatus(accountId, {
      worker_status: 'offline',
    });

    // 从缓存中移除，避免继续上报
    // this.accountStatuses.delete(accountId);
  }

  /**
   * 清除所有账号状态
   */
  clearAll() {
    this.accountStatuses.clear();
    logger.info('Cleared all account statuses');
  }
}

module.exports = AccountStatusReporter;
