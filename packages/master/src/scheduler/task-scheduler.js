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

      // 获取所有活跃账户（只处理未手动指定 Worker 的账户）
      const activeAccounts = this.db
        .prepare("SELECT * FROM accounts WHERE status = 'active' AND assigned_worker_id IS NULL")
        .all();

      if (activeAccounts.length === 0) {
        logger.info('No active accounts to schedule (all accounts are either inactive or manually assigned)');
        return;
      }

      logger.info(
        `Scheduling ${activeAccounts.length} auto-assign accounts to ${onlineWorkers.length} workers`
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
      // 解析完整账号数据
      const accountData = this._formatAccountData(account);

      const message = createMessage(MASTER_TASK_ASSIGN, accountData);

      socket.emit('message', message);
      logger.debug(`Sent task assignment to worker ${workerId} for account ${account.id}`);
    }
  }

  /**
   * 格式化账号数据(包含完整配置)
   * @param {Object} account - 账号对象
   * @returns {Object} 格式化后的数据
   */
  _formatAccountData(account) {
    // 解析 credentials
    let credentials = {};
    try {
      credentials = typeof account.credentials === 'string'
        ? JSON.parse(account.credentials)
        : account.credentials || {};
    } catch (error) {
      logger.error(`Failed to parse credentials for account ${account.id}:`, error);
    }

    // 解析 user_info
    let userInfo = null;
    try {
      userInfo = account.user_info
        ? (typeof account.user_info === 'string' ? JSON.parse(account.user_info) : account.user_info)
        : null;
    } catch (error) {
      logger.debug(`No user_info for account ${account.id}`);
    }

    return {
      id: account.id,
      platform: account.platform,
      account_id: account.account_id,
      account_name: account.account_name,
      monitor_interval: account.monitor_interval || 30,
      status: account.status,
      login_status: account.login_status,
      credentials: {
        cookies: credentials.cookies || [],
        fingerprint: credentials.fingerprint || null,
        localStorage: credentials.localStorage || {},
      },
      cookies_valid_until: account.cookies_valid_until,
      user_info: userInfo,
      last_check_time: account.last_check_time,
      last_login_time: account.last_login_time,
      platform_user_id: account.platform_user_id,
      platform_username: account.platform_username,
    };
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

      // 计算负载差异（只计算自动分配的账号）
      const autoAssignedCounts = onlineWorkers.map(w => {
        const count = this.db
          .prepare('SELECT COUNT(*) as count FROM accounts WHERE assigned_worker_id = ? AND status = ?')
          .get(w.id, 'active').count;
        return count;
      });

      const maxLoad = Math.max(...autoAssignedCounts);
      const minLoad = Math.min(...autoAssignedCounts);

      // 如果负载差异超过阈值 (例如3个账户)，重新平衡
      if (maxLoad - minLoad > 3) {
        logger.info(`Rebalancing tasks (max: ${maxLoad}, min: ${minLoad})`);

        // 只重新分配未手动指定 Worker 的账号
        const autoAssignAccounts = this.db
          .prepare("SELECT * FROM accounts WHERE status = 'active' AND assigned_worker_id IS NULL")
          .all();

        if (autoAssignAccounts.length > 0) {
          this.distributeAccountsToWorkers(autoAssignAccounts, onlineWorkers);
        } else {
          logger.debug('No auto-assign accounts to rebalance');
        }
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
