/**
 * Worker注册逻辑
 */

const os = require('os');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage } = require('@hiscrm-im/shared/protocol/messages');
const { WORKER_REGISTER, WORKER_REGISTER_ACK } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('worker-registration');

class WorkerRegistration {
  constructor(socketClient, workerId, config = {}) {
    this.socketClient = socketClient;
    this.workerId = workerId;
    this.config = config;
    this.registered = false;
    this.assignedAccounts = [];
  }

  /**
   * 执行注册
   * @returns {Promise<Array>} 分配的账户列表
   */
  async register() {
    logger.info(`Registering worker ${this.workerId}`);

    return new Promise((resolve, reject) => {
      // 构造注册消息
      const registrationMessage = createMessage(WORKER_REGISTER, {
        worker_id: this.workerId,
        host: this.config.host || os.hostname(),
        port: this.config.port || parseInt(process.env.WORKER_PORT) || 4000,
        version: this.config.version || '1.0.0',
        capabilities: this.config.capabilities || ['douyin'],
        max_accounts: this.config.maxAccounts || 10,
      });

      // 注册ACK处理器
      this.socketClient.onMessage(WORKER_REGISTER_ACK, (msg) => {
        this.handleRegistrationAck(msg, resolve, reject);
      });

      // 发送注册消息
      this.socketClient.sendMessage(registrationMessage);

      // 设置超时
      setTimeout(() => {
        if (!this.registered) {
          reject(new Error('Registration timeout'));
        }
      }, 30000); // 30秒超时
    });
  }

  /**
   * 处理注册确认
   * @param {object} msg - ACK消息
   * @param {function} resolve - Promise resolve
   * @param {function} reject - Promise reject
   */
  handleRegistrationAck(msg, resolve, reject) {
    const { payload } = msg;

    if (!payload.success) {
      logger.error('Registration failed:', payload.error);
      reject(new Error(payload.error || 'Registration failed'));
      return;
    }

    logger.info('Registration successful');
    this.registered = true;
    this.assignedAccounts = payload.assigned_accounts || [];

    logger.info(`Assigned ${this.assignedAccounts.length} accounts:`, {
      accounts: this.assignedAccounts.map((a) => a.id),
    });

    resolve(this.assignedAccounts);
  }

  /**
   * 获取分配的账户
   * @returns {Array}
   */
  getAssignedAccounts() {
    return this.assignedAccounts;
  }

  /**
   * 添加分配的账户
   * @param {object} account - 账户对象
   */
  addAccount(account) {
    const existing = this.assignedAccounts.find((a) => a.id === account.id);
    if (!existing) {
      this.assignedAccounts.push(account);
      logger.info(`Added account ${account.id} to assigned list`);
    }
  }

  /**
   * 移除分配的账户
   * @param {string} accountId - 账户ID
   */
  removeAccount(accountId) {
    const index = this.assignedAccounts.findIndex((a) => a.id === accountId);
    if (index !== -1) {
      this.assignedAccounts.splice(index, 1);
      logger.info(`Removed account ${accountId} from assigned list`);
    }
  }

  /**
   * 检查是否已注册
   * @returns {boolean}
   */
  isRegistered() {
    return this.registered;
  }
}

module.exports = WorkerRegistration;
