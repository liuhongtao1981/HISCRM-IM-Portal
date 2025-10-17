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
   * 分配账户给Worker（仅分配未手动指定的账户）
   * @param {string} workerId - Worker ID
   * @param {number} maxAccounts - 最大账户数
   * @returns {Array} 分配的账户列表
   */
  assignAccountsToWorker(workerId, maxAccounts = 10) {
    // 1. 先获取已经手动指定给该 Worker 的账户
    const manuallyAssignedAccounts = this.db
      .prepare(
        `SELECT * FROM accounts
         WHERE assigned_worker_id = ?
         AND status = 'active'`
      )
      .all(workerId);

    logger.info(`Worker ${workerId} has ${manuallyAssignedAccounts.length} manually assigned accounts`);

    // 2. 计算还能自动分配多少账户
    const remainingSlots = Math.max(0, maxAccounts - manuallyAssignedAccounts.length);

    logger.info(`Worker ${workerId} can auto-assign ${remainingSlots} more accounts`);

    // 3. 查找未分配的账户（assigned_worker_id IS NULL）
    const autoAssignAccounts = this.db
      .prepare(
        `SELECT * FROM accounts
         WHERE status = 'active'
         AND assigned_worker_id IS NULL
         LIMIT ?`
      )
      .all(remainingSlots);

    // 4. 更新自动分配账户的 assigned_worker_id
    const updateStmt = this.db.prepare(
      'UPDATE accounts SET assigned_worker_id = ?, updated_at = ? WHERE id = ?'
    );

    const now = Math.floor(Date.now() / 1000);
    const newlyAssignedAccounts = [];

    for (const account of autoAssignAccounts) {
      updateStmt.run(workerId, now, account.id);

      newlyAssignedAccounts.push(account); // 保留完整账号数据
    }

    logger.info(`Worker ${workerId} auto-assigned ${newlyAssignedAccounts.length} accounts`);

    // 5. 合并手动分配和自动分配的账户，返回给 Worker（包含完整数据）
    const allAssignedAccounts = [
      ...manuallyAssignedAccounts.map(acc => this._formatAccountForWorker(acc)),
      ...newlyAssignedAccounts.map(acc => this._formatAccountForWorker(acc)),
    ];

    // 6. 更新 Worker 的 assigned_accounts 计数
    this.db
      .prepare('UPDATE workers SET assigned_accounts = ? WHERE id = ?')
      .run(allAssignedAccounts.length, workerId);

    logger.info(`Worker ${workerId} total assigned accounts: ${allAssignedAccounts.length} (${manuallyAssignedAccounts.length} manual + ${newlyAssignedAccounts.length} auto)`);

    return allAssignedAccounts;
  }

  /**
   * 格式化账号数据发送给 Worker (包含完整配置信息)
   * @param {Object} account - 数据库账号记录
   * @returns {Object} 格式化后的账号数据
   */
  _formatAccountForWorker(account) {
    // 解析 credentials (包含 cookies 和 fingerprint)
    let parsedCredentials = {};
    try {
      parsedCredentials = typeof account.credentials === 'string'
        ? JSON.parse(account.credentials)
        : account.credentials || {};
    } catch (error) {
      logger.error(`Failed to parse credentials for account ${account.id}:`, error);
    }

    // 解析 user_info
    let parsedUserInfo = null;
    try {
      parsedUserInfo = account.user_info
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
      platform_user_id: account.platform_user_id, // 平台用户 ID (douyin_id)

      // 完整的凭证信息 (包含 cookies 和 fingerprint)
      credentials: {
        cookies: parsedCredentials.cookies || [],
        fingerprint: parsedCredentials.fingerprint || null,
        localStorage: parsedCredentials.localStorage || {},
      },

      // Cookie 有效期
      cookies_valid_until: account.cookies_valid_until,

      // 用户信息
      user_info: parsedUserInfo,

      // 最后检查时间
      last_check_time: account.last_check_time,
      last_login_time: account.last_login_time,
    };
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
