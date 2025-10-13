/**
 * Worker心跳发送器
 */

const os = require('os');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage } = require('@hiscrm-im/shared/protocol/messages');
const { WORKER_HEARTBEAT, WORKER_HEARTBEAT_ACK } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('worker-heartbeat');

class HeartbeatSender {
  constructor(socketClient, workerId) {
    this.socketClient = socketClient;
    this.workerId = workerId;
    this.heartbeatInterval = null;
    this.activeTasks = 0;
    this.heartbeatFrequency = 10000; // 10秒
    this.missedAcks = 0;
    this.maxMissedAcks = 3;
  }

  /**
   * 启动心跳发送
   */
  start() {
    logger.info(`Starting heartbeat sender (interval: ${this.heartbeatFrequency}ms)`);

    // 立即发送一次心跳
    this.sendHeartbeat();

    // 定期发送心跳
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatFrequency);

    // 注册ACK处理器
    this.socketClient.onMessage(WORKER_HEARTBEAT_ACK, (msg) => {
      this.handleHeartbeatAck(msg);
    });
  }

  /**
   * 停止心跳发送
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Heartbeat sender stopped');
    }
  }

  /**
   * 发送心跳消息
   */
  sendHeartbeat() {
    if (!this.socketClient.isConnected()) {
      logger.debug('Skipping heartbeat: not connected to master');
      return;
    }

    // 获取系统信息
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const heartbeatMessage = createMessage(WORKER_HEARTBEAT, {
      worker_id: this.workerId,
      status: 'online',
      active_tasks: this.activeTasks,
      memory_usage: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      cpu_usage: this.calculateCpuPercent(cpuUsage),
    });

    this.socketClient.sendMessage(heartbeatMessage);
    logger.debug('Heartbeat sent', {
      active_tasks: this.activeTasks,
      memory_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    });

    this.missedAcks++;

    // 检查连接健康
    if (this.missedAcks > this.maxMissedAcks) {
      logger.warn(`Missed ${this.missedAcks} heartbeat ACKs, connection may be unhealthy`);
    }
  }

  /**
   * 处理心跳确认
   * @param {object} msg - ACK消息
   */
  handleHeartbeatAck(msg) {
    if (msg.payload.success) {
      logger.debug('Heartbeat ACK received');
      this.missedAcks = 0; // 重置计数
    } else {
      logger.warn('Heartbeat ACK failed:', msg.payload.error);
    }
  }

  /**
   * 计算CPU使用百分比
   * @param {object} cpuUsage - process.cpuUsage()返回值
   * @returns {number} CPU使用百分比
   */
  calculateCpuPercent(cpuUsage) {
    const totalCpuTime = cpuUsage.user + cpuUsage.system;
    const totalTime = process.uptime() * 1000000; // 微秒

    return Math.round((totalCpuTime / totalTime) * 100 * 100) / 100;
  }

  /**
   * 设置活跃任务数
   * @param {number} count - 任务数量
   */
  setActiveTasks(count) {
    this.activeTasks = count;
  }

  /**
   * 增加活跃任务
   */
  incrementActiveTasks() {
    this.activeTasks++;
  }

  /**
   * 减少活跃任务
   */
  decrementActiveTasks() {
    if (this.activeTasks > 0) {
      this.activeTasks--;
    }
  }

  /**
   * 获取活跃任务数
   * @returns {number}
   */
  getActiveTasks() {
    return this.activeTasks;
  }
}

module.exports = HeartbeatSender;
