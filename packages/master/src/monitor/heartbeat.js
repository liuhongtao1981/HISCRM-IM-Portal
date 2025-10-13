/**
 * Worker心跳监控
 * 检测Worker健康状态，处理超时和故障恢复
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage } = require('@hiscrm-im/shared/protocol/messages');
const { WORKER_HEARTBEAT, WORKER_HEARTBEAT_ACK } = require('@hiscrm-im/shared/protocol/messages');
const { sendMessage } = require('../communication/socket-server');

const logger = createLogger('heartbeat-monitor');

class HeartbeatMonitor {
  constructor(db, workerRegistry) {
    this.db = db;
    this.workerRegistry = workerRegistry;
    this.heartbeatTimeout = parseInt(process.env.WORKER_HEARTBEAT_TIMEOUT || '30000'); // 30秒
    this.checkInterval = null;
  }

  /**
   * 启动心跳监控
   */
  start() {
    logger.info(`Starting heartbeat monitor (timeout: ${this.heartbeatTimeout}ms)`);

    // 每10秒检查一次
    this.checkInterval = setInterval(() => {
      this.checkWorkerHealth();
    }, 10000);
  }

  /**
   * 停止心跳监控
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Heartbeat monitor stopped');
    }
  }

  /**
   * 处理Worker心跳消息
   * @param {Socket} socket - Worker Socket
   * @param {object} message - 心跳消息
   */
  handleHeartbeat(socket, message) {
    const { payload } = message;
    const { worker_id, status, active_tasks, memory_usage, cpu_usage } = payload;

    const now = Math.floor(Date.now() / 1000);

    try {
      // 更新Worker的last_heartbeat
      const result = this.db
        .prepare(
          `UPDATE workers
           SET last_heartbeat = ?, status = ?, metadata = json_set(
             COALESCE(metadata, '{}'),
             '$.active_tasks', ?,
             '$.memory_usage', ?,
             '$.cpu_usage', ?
           )
           WHERE id = ?`
        )
        .run(now, status, active_tasks || 0, memory_usage || 0, cpu_usage || 0, worker_id);

      if (result.changes === 0) {
        logger.warn(`Heartbeat from unknown worker: ${worker_id}`);
      } else {
        logger.debug(`Heartbeat received from ${worker_id}`, {
          active_tasks,
          memory_usage,
          cpu_usage,
        });
      }

      // 发送心跳确认
      const ackMessage = createMessage(WORKER_HEARTBEAT_ACK, {
        success: true,
      });

      sendMessage(socket, ackMessage);
    } catch (error) {
      logger.error(`Error handling heartbeat from ${worker_id}:`, error);
    }
  }

  /**
   * 检查所有Worker的健康状态
   */
  checkWorkerHealth() {
    const now = Math.floor(Date.now() / 1000);
    const timeoutThreshold = now - Math.floor(this.heartbeatTimeout / 1000);

    try {
      // 查找心跳超时的Worker
      const timedOutWorkers = this.db
        .prepare(
          `SELECT * FROM workers
           WHERE status = 'online'
           AND last_heartbeat < ?`
        )
        .all(timeoutThreshold);

      if (timedOutWorkers.length > 0) {
        logger.warn(`Found ${timedOutWorkers.length} workers with heartbeat timeout`);

        for (const worker of timedOutWorkers) {
          this.handleWorkerTimeout(worker);
        }
      }
    } catch (error) {
      logger.error('Error checking worker health:', error);
    }
  }

  /**
   * 处理Worker超时
   * @param {object} worker - Worker记录
   */
  handleWorkerTimeout(worker) {
    logger.warn(`Worker ${worker.id} heartbeat timeout (last: ${worker.last_heartbeat})`);

    try {
      // 标记Worker为offline
      this.db.prepare('UPDATE workers SET status = ? WHERE id = ?').run('offline', worker.id);

      // 重新分配该Worker的账户到其他在线Worker
      this.reassignWorkerAccounts(worker.id);

      logger.info(`Worker ${worker.id} marked as offline, accounts reassigned`);

      // 注意: 实际生产环境中，这里应该触发Worker进程重启
      // 这将在T020 (Worker进程管理器) 中实现
    } catch (error) {
      logger.error(`Error handling timeout for worker ${worker.id}:`, error);
    }
  }

  /**
   * 重新分配Worker的账户
   * @param {string} offlineWorkerId - 离线Worker的ID
   */
  reassignWorkerAccounts(offlineWorkerId) {
    // 查找该Worker负责的账户
    const accounts = this.db
      .prepare('SELECT * FROM accounts WHERE assigned_worker_id = ? AND status = "active"')
      .all(offlineWorkerId);

    if (accounts.length === 0) {
      logger.debug(`No accounts to reassign from worker ${offlineWorkerId}`);
      return;
    }

    logger.info(`Reassigning ${accounts.length} accounts from worker ${offlineWorkerId}`);

    // 清除这些账户的assigned_worker_id
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare('UPDATE accounts SET assigned_worker_id = NULL, updated_at = ? WHERE assigned_worker_id = ?')
      .run(now, offlineWorkerId);

    // 获取其他在线Worker
    const onlineWorkers = this.workerRegistry.getOnlineWorkers();

    if (onlineWorkers.length === 0) {
      logger.warn('No online workers available for reassignment');
      return;
    }

    // 简单的轮询分配策略
    let workerIndex = 0;
    const updateStmt = this.db.prepare(
      'UPDATE accounts SET assigned_worker_id = ?, updated_at = ? WHERE id = ?'
    );

    for (const account of accounts) {
      const targetWorker = onlineWorkers[workerIndex % onlineWorkers.length];
      updateStmt.run(targetWorker.id, now, account.id);

      logger.debug(`Reassigned account ${account.id} to worker ${targetWorker.id}`);

      workerIndex++;
    }

    // 更新Worker的assigned_accounts计数
    for (const worker of onlineWorkers) {
      const count = this.db
        .prepare('SELECT COUNT(*) as count FROM accounts WHERE assigned_worker_id = ?')
        .get(worker.id).count;

      this.db.prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?').run(count, worker.id);
    }

    logger.info('Account reassignment completed');
  }

  /**
   * 获取Worker统计信息
   * @returns {object} 统计信息
   */
  getStats() {
    const stats = this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
           SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
           SUM(assigned_accounts) as total_assigned_accounts
         FROM workers`
      )
      .get();

    return stats;
  }
}

module.exports = HeartbeatMonitor;
