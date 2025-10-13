/**
 * Worker注册处理器
 */

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage } = require('@hiscrm-im/shared/protocol/messages');
const { WORKER_REGISTER, WORKER_REGISTER_ACK } = require('@hiscrm-im/shared/protocol/messages');
const { sendMessage } = require('../communication/socket-server');

const logger = createLogger('worker-registration');

/**
 * Worker注册数据结构
 */
class WorkerRegistry {
  constructor(db) {
    this.db = db;
    this.workerSockets = new Map(); // workerId -> socket映射
  }

  /**
   * 处理Worker注册请求
   * @param {Socket} socket - Worker的Socket连接
   * @param {object} message - 注册消息
   */
  async handleRegistration(socket, message) {
    const { payload } = message;
    const { worker_id, host, port, version, capabilities, max_accounts } = payload;

    logger.info(`Worker registration request: ${worker_id}`, {
      host,
      port,
      version,
      capabilities,
    });

    try {
      // 检查Worker是否已注册
      const existingWorker = this.db
        .prepare('SELECT * FROM workers WHERE id = ?')
        .get(worker_id);

      const now = Math.floor(Date.now() / 1000);

      if (existingWorker) {
        // 更新现有Worker
        this.db
          .prepare(
            `UPDATE workers
             SET status = ?, last_heartbeat = ?, host = ?, port = ?, version = ?
             WHERE id = ?`
          )
          .run('online', now, host, port, version, worker_id);

        logger.info(`Worker ${worker_id} re-registered (was ${existingWorker.status})`);
      } else {
        // 注册新Worker
        this.db
          .prepare(
            `INSERT INTO workers (id, host, port, status, assigned_accounts, last_heartbeat, started_at, version, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            worker_id,
            host,
            port,
            'online',
            0,
            now,
            now,
            version,
            JSON.stringify({ capabilities, max_accounts })
          );

        logger.info(`Worker ${worker_id} registered successfully`);
      }

      // 保存Socket映射
      this.workerSockets.set(worker_id, socket);
      socket.workerId = worker_id; // 在socket上标记workerId

      // 分配账户给Worker
      const assignedAccounts = this.assignAccountsToWorker(worker_id, max_accounts || 10);

      // 发送注册确认
      const ackMessage = createMessage(WORKER_REGISTER_ACK, {
        success: true,
        assigned_accounts: assignedAccounts,
      });

      sendMessage(socket, ackMessage);

      logger.info(`Worker ${worker_id} assigned ${assignedAccounts.length} accounts`);
    } catch (error) {
      logger.error(`Worker registration failed for ${worker_id}:`, error);

      const errorMessage = createMessage(WORKER_REGISTER_ACK, {
        success: false,
        error: error.message,
      });

      sendMessage(socket, errorMessage);
    }
  }

  /**
   * 分配账户给Worker
   * @param {string} workerId - Worker ID
   * @param {number} maxAccounts - 最大账户数
   * @returns {Array} 分配的账户列表
   */
  assignAccountsToWorker(workerId, maxAccounts = 10) {
    // 查找未分配或分配给离线Worker的账户
    const unassignedAccounts = this.db
      .prepare(
        `SELECT a.* FROM accounts a
         LEFT JOIN workers w ON a.assigned_worker_id = w.id
         WHERE a.status = 'active'
         AND (a.assigned_worker_id IS NULL OR w.status = 'offline')
         LIMIT ?`
      )
      .all(maxAccounts);

    // 更新账户的assigned_worker_id
    const updateStmt = this.db.prepare(
      'UPDATE accounts SET assigned_worker_id = ?, updated_at = ? WHERE id = ?'
    );

    const now = Math.floor(Date.now() / 1000);
    const assignedAccounts = [];

    for (const account of unassignedAccounts) {
      updateStmt.run(workerId, now, account.id);

      assignedAccounts.push({
        id: account.id,
        platform: account.platform,
        account_id: account.account_id,
        credentials: account.credentials, // 已加密
        monitor_interval: account.monitor_interval,
      });
    }

    // 更新Worker的assigned_accounts计数
    this.db
      .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
      .run(assignedAccounts.length, workerId);

    return assignedAccounts;
  }

  /**
   * 处理Worker断开连接
   * @param {Socket} socket - Worker的Socket连接
   */
  handleDisconnect(socket) {
    const workerId = socket.workerId;
    if (!workerId) return;

    logger.warn(`Worker ${workerId} disconnected`);

    // 从映射中移除
    this.workerSockets.delete(workerId);

    // 更新数据库状态为offline
    this.db.prepare('UPDATE workers SET status = ? WHERE id = ?').run('offline', workerId);

    // 注意: 不立即重新分配账户，由心跳监控处理超时后的重新分配
  }

  /**
   * 获取在线Worker列表
   * @returns {Array} Worker列表
   */
  getOnlineWorkers() {
    return this.db.prepare("SELECT * FROM workers WHERE status = 'online'").all();
  }

  /**
   * 获取Worker的Socket
   * @param {string} workerId - Worker ID
   * @returns {Socket|null} Socket实例或null
   */
  getWorkerSocket(workerId) {
    return this.workerSockets.get(workerId) || null;
  }
}

module.exports = WorkerRegistry;
