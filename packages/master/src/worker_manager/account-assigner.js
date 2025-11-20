/**
 * 账户分配器
 * T040: 负责在账户创建/删除时触发任务分配/撤销
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('account-assigner');

class AccountAssigner {
  constructor(db, workerRegistry, taskScheduler, dataStore = null) {
    this.db = db;
    this.workerRegistry = workerRegistry;
    this.taskScheduler = taskScheduler;
    this.dataStore = dataStore;  // 添加 DataStore 支持
  }

  /**
   * 为新创建的账户分配Worker并发送任务（自动分配模式）
   * @param {Account} account - 新创建的账户
   * @returns {object|null} 分配结果 {worker_id, success}
   */
  assignNewAccount(account) {
    try {
      logger.info(`Auto-assigning new account ${account.id} (${account.account_name})`);

      // 如果账户已经指定了 Worker，跳过自动分配
      if (account.assigned_worker_id) {
        logger.info(`Account ${account.id} already has assigned worker: ${account.assigned_worker_id}, skipping auto-assignment`);
        return {
          worker_id: account.assigned_worker_id,
          success: true,
        };
      }

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
        `Account ${account.id} auto-assigned to worker ${selectedWorker.id} successfully`
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
   * 将账户分配到指定的Worker（手动指定模式）
   * @param {Account} account - 账户对象
   * @param {string} workerId - 指定的 Worker ID
   * @returns {object|null} 分配结果 {worker_id, success}
   */
  assignToSpecificWorker(account, workerId) {
    try {
      logger.info(`Manually assigning account ${account.id} to worker ${workerId}`);

      // 验证 Worker 是否在线
      const worker = this.db.prepare('SELECT * FROM workers WHERE id = ?').get(workerId);
      if (!worker) {
        throw new Error(`Worker not found: ${workerId}`);
      }

      if (worker.status !== 'online') {
        throw new Error(`Worker is not online: ${workerId} (status: ${worker.status})`);
      }

      // 更新账户的 assigned_worker_id（如果还没更新）
      const now = Math.floor(Date.now() / 1000);
      this.db
        .prepare('UPDATE accounts SET assigned_worker_id = ?, updated_at = ? WHERE id = ?')
        .run(workerId, now, account.id);

      // 重新计算 Worker 的 assigned_accounts 计数
      const count = this.db
        .prepare('SELECT COUNT(*) as count FROM accounts WHERE assigned_worker_id = ?')
        .get(workerId).count;

      this.db
        .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
        .run(count, workerId);

      // 发送任务分配消息给Worker
      this.taskScheduler.sendTaskAssignments(workerId, [account]);

      logger.info(
        `Account ${account.id} manually assigned to worker ${workerId} successfully`
      );

      return {
        worker_id: workerId,
        success: true,
      };
    } catch (error) {
      logger.error(`Failed to assign account ${account.id} to worker ${workerId}:`, error);
      throw error;
    }
  }

  /**
   * 从指定 Worker 撤销账户任务
   * @param {string} accountId - 账户 ID
   * @param {string} workerId - Worker ID
   * @returns {boolean} 是否成功
   */
  revokeFromWorker(accountId, workerId) {
    try {
      logger.info(`Revoking account ${accountId} from worker ${workerId}`);

      // 发送撤销消息
      this.taskScheduler.revokeTask(workerId, accountId);

      // 重新计算 Worker 的 assigned_accounts 计数
      const count = this.db
        .prepare('SELECT COUNT(*) as count FROM accounts WHERE assigned_worker_id = ?')
        .get(workerId).count;

      this.db
        .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
        .run(count, workerId);

      logger.info(`Account ${accountId} revoked from worker ${workerId} successfully`);

      return true;
    } catch (error) {
      logger.error(`Failed to revoke account ${accountId} from worker ${workerId}:`, error);
      return false;
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

        // ✅ 即使没有分配 Worker，也需要清除 DataStore 中的数据
        if (this.dataStore) {
          const deleted = this.dataStore.deleteAccount(accountId);
          if (deleted) {
            logger.info(`✓ Cleared DataStore for account ${accountId} (no worker assigned)`);
          }
        }

        return true; // 没有分配Worker，算作成功
      }

      const workerId = account.assigned_worker_id;

      // 撤销任务（通知 Worker 停止监控并关闭浏览器）
      this.taskScheduler.revokeTask(workerId, accountId);

      // 更新Worker的assigned_accounts计数
      const currentCount = this.db
        .prepare('SELECT assigned_accounts FROM workers WHERE id = ?')
        .get(workerId)?.assigned_accounts || 0;

      const newCount = Math.max(0, currentCount - 1);
      this.db
        .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
        .run(newCount, workerId);

      // ✅ 清除 DataStore 中的账号数据
      if (this.dataStore) {
        const deleted = this.dataStore.deleteAccount(accountId);
        if (deleted) {
          logger.info(`✓ Cleared DataStore for account ${accountId}`);
        } else {
          logger.warn(`Account ${accountId} not found in DataStore (may not have been crawled yet)`);
        }
      } else {
        logger.warn('DataStore not available, skipping memory cleanup');
      }

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
