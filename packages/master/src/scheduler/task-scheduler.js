/**
 * 任务调度器
 * 负责账户监控任务的分配和调度
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage } = require('@hiscrm-im/shared/protocol/messages');
const { MASTER_TASK_ASSIGN, MASTER_TASK_REVOKE } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('task-scheduler');

class TaskScheduler {
  constructor(db, workerRegistry) {
    this.db = db;
    this.workerRegistry = workerRegistry;
    this.schedulerInterval = null;
  }

  /**
   * 启动调度器
   */
  start() {
    logger.info('Starting task scheduler');

    // 初始分配
    this.scheduleAllTasks();

    // 定期检查和重新调度 (每60秒)
    this.schedulerInterval = setInterval(() => {
      this.rebalanceTasks();
    }, 60000);
  }

  /**
   * 停止调度器
   */
  stop() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      logger.info('Task scheduler stopped');
    }
  }

  /**
   * 调度所有任务
   */
  scheduleAllTasks() {
    logger.info('Scheduling all tasks');

    try {
      // 获取所有在线Worker
      const onlineWorkers = this.workerRegistry.getOnlineWorkers();

      if (onlineWorkers.length === 0) {
        logger.warn('No online workers available for task scheduling');
        return;
      }

      // 获取所有活跃账户
      const activeAccounts = this.db
        .prepare("SELECT * FROM accounts WHERE status = 'active'")
        .all();

      if (activeAccounts.length === 0) {
        logger.info('No active accounts to schedule');
        return;
      }

      logger.info(
        `Scheduling ${activeAccounts.length} accounts to ${onlineWorkers.length} workers`
      );

      // 负载均衡: 轮询分配
      this.distributeAccountsToWorkers(activeAccounts, onlineWorkers);
    } catch (error) {
      logger.error('Error scheduling tasks:', error);
    }
  }

  /**
   * 分配账户到Worker (负载均衡)
   * @param {Array} accounts - 账户列表
   * @param {Array} workers - Worker列表
   */
  distributeAccountsToWorkers(accounts, workers) {
    const now = Math.floor(Date.now() / 1000);

    // 按Worker当前负载排序 (assigned_accounts升序)
    workers.sort((a, b) => a.assigned_accounts - b.assigned_accounts);

    const updateStmt = this.db.prepare(
      'UPDATE accounts SET assigned_worker_id = ?, updated_at = ? WHERE id = ?'
    );

    let workerIndex = 0;
    let assignmentsByWorker = new Map();

    for (const account of accounts) {
      const worker = workers[workerIndex % workers.length];

      // 如果账户已分配给该Worker，跳过
      if (account.assigned_worker_id === worker.id) {
        workerIndex++;
        continue;
      }

      // 更新数据库
      updateStmt.run(worker.id, now, account.id);

      // 记录分配
      if (!assignmentsByWorker.has(worker.id)) {
        assignmentsByWorker.set(worker.id, []);
      }
      assignmentsByWorker.get(worker.id).push(account);

      logger.debug(`Assigned account ${account.id} to worker ${worker.id}`);

      workerIndex++;
    }

    // 更新Worker的assigned_accounts计数并发送任务分配消息
    for (const worker of workers) {
      const assignedAccounts = assignmentsByWorker.get(worker.id) || [];

      // 更新计数
      const totalCount = this.db
        .prepare('SELECT COUNT(*) as count FROM accounts WHERE assigned_worker_id = ?')
        .get(worker.id).count;

      this.db
        .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
        .run(totalCount, worker.id);

      // 发送任务分配消息给Worker
      if (assignedAccounts.length > 0) {
        this.sendTaskAssignments(worker.id, assignedAccounts);
      }

      logger.info(`Worker ${worker.id} now has ${totalCount} assigned accounts`);
    }
  }

  /**
   * 发送任务分配消息给Worker
   * @param {string} workerId - Worker ID
   * @param {Array} accounts - 分配的账户列表
   */
  sendTaskAssignments(workerId, accounts) {
    const socket = this.workerRegistry.getWorkerSocket(workerId);
    if (!socket) {
      logger.warn(`Cannot send task assignment: Worker ${workerId} socket not found`);
      return;
    }

    for (const account of accounts) {
      const message = createMessage(MASTER_TASK_ASSIGN, {
        account_id: account.id,
        platform: account.platform,
        account_credentials: account.credentials, // 加密的凭证
        monitor_interval: account.monitor_interval,
      });

      socket.emit('message', message);
      logger.debug(`Sent task assignment to worker ${workerId} for account ${account.id}`);
    }
  }

  /**
   * 重新平衡任务
   */
  rebalanceTasks() {
    logger.debug('Checking if task rebalancing is needed');

    try {
      const onlineWorkers = this.workerRegistry.getOnlineWorkers();

      if (onlineWorkers.length === 0) {
        return;
      }

      // 计算负载差异
      const loads = onlineWorkers.map((w) => w.assigned_accounts);
      const maxLoad = Math.max(...loads);
      const minLoad = Math.min(...loads);

      // 如果负载差异超过阈值 (例如3个账户)，重新平衡
      if (maxLoad - minLoad > 3) {
        logger.info(`Rebalancing tasks (max: ${maxLoad}, min: ${minLoad})`);

        const allAccounts = this.db
          .prepare("SELECT * FROM accounts WHERE status = 'active'")
          .all();

        this.distributeAccountsToWorkers(allAccounts, onlineWorkers);
      }
    } catch (error) {
      logger.error('Error rebalancing tasks:', error);
    }
  }

  /**
   * 撤销Worker的任务
   * @param {string} workerId - Worker ID
   * @param {string} accountId - 账户ID
   */
  revokeTask(workerId, accountId) {
    logger.info(`Revoking task for account ${accountId} from worker ${workerId}`);

    const socket = this.workerRegistry.getWorkerSocket(workerId);
    if (!socket) {
      logger.warn(`Cannot revoke task: Worker ${workerId} socket not found`);
      return;
    }

    const message = createMessage(MASTER_TASK_REVOKE, {
      account_id: accountId,
    });

    socket.emit('message', message);

    // 更新数据库
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare('UPDATE accounts SET assigned_worker_id = NULL, updated_at = ? WHERE id = ?')
      .run(now, accountId);

    logger.info(`Task revoked for account ${accountId}`);
  }

  /**
   * 获取调度统计
   * @returns {object}
   */
  getSchedulingStats() {
    const stats = this.db
      .prepare(
        `SELECT
           COUNT(*) as total_accounts,
           SUM(CASE WHEN assigned_worker_id IS NOT NULL THEN 1 ELSE 0 END) as assigned_accounts,
           SUM(CASE WHEN assigned_worker_id IS NULL THEN 1 ELSE 0 END) as unassigned_accounts
         FROM accounts
         WHERE status = 'active'`
      )
      .get();

    const workerStats = this.db
      .prepare(
        `SELECT
           id,
           assigned_accounts,
           status
         FROM workers
         ORDER BY assigned_accounts DESC`
      )
      .all();

    return {
      ...stats,
      workers: workerStats,
    };
  }
}

module.exports = TaskScheduler;
