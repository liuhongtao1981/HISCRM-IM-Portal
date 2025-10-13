/**
 * 账户分配器
 * T040: 负责在账户创建/删除时触发任务分配/撤销
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('account-assigner');

class AccountAssigner {
  constructor(db, workerRegistry, taskScheduler) {
    this.db = db;
    this.workerRegistry = workerRegistry;
    this.taskScheduler = taskScheduler;
  }

  /**
   * 为新创建的账户分配Worker并发送任务
   * @param {Account} account - 新创建的账户
   * @returns {object|null} 分配结果 {worker_id, success}
   */
  assignNewAccount(account) {
    try {
      logger.info(`Assigning new account ${account.id} (${account.account_name})`);

      // 获取在线Worker
      const onlineWorkers = this.workerRegistry.getOnlineWorkers();

      if (onlineWorkers.length === 0) {
        logger.warn(`No online workers available to assign account ${account.id}`);
        return null;
      }

      // 选择负载最低的Worker (轮询策略)
      onlineWorkers.sort((a, b) => a.assigned_accounts - b.assigned_accounts);
      const selectedWorker = onlineWorkers[0];

      logger.info(
        `Selected worker ${selectedWorker.id} (load: ${selectedWorker.assigned_accounts})`
      );

      // 更新账户的assigned_worker_id
      const now = Math.floor(Date.now() / 1000);
      this.db
        .prepare('UPDATE accounts SET assigned_worker_id = ?, updated_at = ? WHERE id = ?')
        .run(selectedWorker.id, now, account.id);

      // 更新Worker的assigned_accounts计数
      const newCount = selectedWorker.assigned_accounts + 1;
      this.db
        .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
        .run(newCount, selectedWorker.id);

      // 发送任务分配消息给Worker
      this.taskScheduler.sendTaskAssignments(selectedWorker.id, [account]);

      logger.info(
        `Account ${account.id} assigned to worker ${selectedWorker.id} successfully`
      );

      return {
        worker_id: selectedWorker.id,
        success: true,
      };
    } catch (error) {
      logger.error(`Failed to assign account ${account.id}:`, error);
      return null;
    }
  }

  /**
   * 撤销已删除账户的任务
   * @param {string} accountId - 账户ID
   * @returns {boolean} 是否成功撤销
   */
  revokeDeletedAccount(accountId) {
    try {
      logger.info(`Revoking tasks for deleted account ${accountId}`);

      // 查找账户的assigned_worker_id
      const account = this.db
        .prepare('SELECT assigned_worker_id FROM accounts WHERE id = ?')
        .get(accountId);

      if (!account || !account.assigned_worker_id) {
        logger.warn(`Account ${accountId} has no assigned worker, skipping revoke`);
        return true; // 没有分配Worker，算作成功
      }

      const workerId = account.assigned_worker_id;

      // 撤销任务
      this.taskScheduler.revokeTask(workerId, accountId);

      // 更新Worker的assigned_accounts计数
      const currentCount = this.db
        .prepare('SELECT assigned_accounts FROM workers WHERE id = ?')
        .get(workerId)?.assigned_accounts || 0;

      const newCount = Math.max(0, currentCount - 1);
      this.db
        .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
        .run(newCount, workerId);

      logger.info(`Tasks revoked for account ${accountId} from worker ${workerId}`);

      return true;
    } catch (error) {
      logger.error(`Failed to revoke account ${accountId}:`, error);
      return false;
    }
  }

  /**
   * 处理账户状态变更 (active <-> paused)
   * @param {string} accountId - 账户ID
   * @param {string} newStatus - 新状态
   */
  handleAccountStatusChange(accountId, newStatus) {
    try {
      logger.info(`Handling account ${accountId} status change to ${newStatus}`);

      if (newStatus === 'paused') {
        // 暂停账户: 撤销任务但保留assigned_worker_id
        const account = this.db
          .prepare('SELECT assigned_worker_id FROM accounts WHERE id = ?')
          .get(accountId);

        if (account && account.assigned_worker_id) {
          const workerId = account.assigned_worker_id;
          const socket = this.workerRegistry.getWorkerSocket(workerId);

          if (socket) {
            // 发送撤销消息
            const { createMessage } = require('@hiscrm-im/shared/protocol/messages');
            const { MASTER_TASK_REVOKE } = require('@hiscrm-im/shared/protocol/messages');

            const message = createMessage(MASTER_TASK_REVOKE, {
              account_id: accountId,
            });

            socket.emit('message', message);
            logger.info(`Sent pause task for account ${accountId} to worker ${workerId}`);
          }
        }
      } else if (newStatus === 'active') {
        // 恢复账户: 重新分配任务
        const account = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);

        if (account && account.assigned_worker_id) {
          const workerId = account.assigned_worker_id;

          // 重新发送任务
          this.taskScheduler.sendTaskAssignments(workerId, [account]);
          logger.info(`Sent resume task for account ${accountId} to worker ${workerId}`);
        }
      }
    } catch (error) {
      logger.error(`Failed to handle status change for account ${accountId}:`, error);
    }
  }
}

module.exports = AccountAssigner;
