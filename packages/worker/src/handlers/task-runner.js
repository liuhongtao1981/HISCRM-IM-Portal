/**
 * 监控任务执行器
 * T052: 管理多个账户的监控任务
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const MonitorTask = require('./monitor-task');

const logger = createLogger('task-runner');

class TaskRunner {
  constructor(socketClient, heartbeatSender) {
    this.socketClient = socketClient;
    this.heartbeatSender = heartbeatSender;
    this.tasks = new Map(); // accountId -> MonitorTask
    this.running = false;
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

    // 创建并启动监控任务
    const monitorTask = new MonitorTask(account, this.socketClient);
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
