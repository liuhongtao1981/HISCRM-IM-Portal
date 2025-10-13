/**
 * 通知广播器
 * 负责将通知推送到所有在线的客户端设备
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage, MASTER_NOTIFICATION_PUSH } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('notification-broadcaster');

class NotificationBroadcaster {
  constructor(sessionManager, clientNamespace) {
    this.sessionManager = sessionManager;
    this.clientNamespace = clientNamespace;

    // 广播统计
    this.stats = {
      totalBroadcasts: 0,
      successfulBroadcasts: 0,
      failedBroadcasts: 0,
    };
  }

  /**
   * 广播通知到所有该账户的在线客户端
   * @param {string} accountId - 账户ID
   * @param {Array<Notification>} notifications - 通知列表
   * @returns {boolean} 是否成功广播到至少一个客户端
   */
  async broadcastNotifications(accountId, notifications) {
    try {
      if (!notifications || notifications.length === 0) {
        return true;
      }

      // 获取所有在线的客户端会话
      const onlineSessions = this.sessionManager.getOnlineSessions();

      if (onlineSessions.length === 0) {
        logger.debug(`No online clients to broadcast ${notifications.length} notifications`);
        return false; // 没有在线客户端，不标记为已发送
      }

      logger.info(
        `Broadcasting ${notifications.length} notifications to ${onlineSessions.length} online clients`
      );

      let successCount = 0;
      let failCount = 0;

      // 向每个在线客户端发送通知
      for (const session of onlineSessions) {
        try {
          for (const notification of notifications) {
            const message = createMessage(MASTER_NOTIFICATION_PUSH, notification.toClientPayload());

            // 获取客户端socket
            const socket = this.clientNamespace.sockets.get(session.socket_id);

            if (socket && socket.connected) {
              socket.emit('message', message);
              successCount++;
              logger.debug(
                `Notification ${notification.id} sent to client ${session.device_id} (socket: ${session.socket_id})`
              );
            } else {
              failCount++;
              logger.warn(
                `Client ${session.device_id} socket not connected (socket: ${session.socket_id})`
              );
              // 标记会话为离线
              this.sessionManager.markSessionOffline(session.device_id);
            }
          }
        } catch (error) {
          failCount++;
          logger.error(`Failed to send notification to client ${session.device_id}:`, error);
        }
      }

      // 更新统计
      this.stats.totalBroadcasts++;
      if (successCount > 0) {
        this.stats.successfulBroadcasts++;
      } else {
        this.stats.failedBroadcasts++;
      }

      logger.info(
        `Broadcast complete: ${successCount} successful, ${failCount} failed (${notifications.length} notifications to ${onlineSessions.length} clients)`
      );

      // 只要有一个成功，就认为广播成功
      return successCount > 0;
    } catch (error) {
      logger.error('Failed to broadcast notifications:', error);
      this.stats.failedBroadcasts++;
      return false;
    }
  }

  /**
   * 广播单个通知
   */
  async broadcastNotification(accountId, notification) {
    return this.broadcastNotifications(accountId, [notification]);
  }

  /**
   * 向特定设备发送通知（用于离线同步）
   * @param {string} deviceId - 设备ID
   * @param {Array<Notification>} notifications - 通知列表
   */
  async sendToDevice(deviceId, notifications) {
    try {
      const session = this.sessionManager.getSession(deviceId);

      if (!session || session.status !== 'online') {
        logger.warn(`Cannot send to device ${deviceId}: not online`);
        return false;
      }

      const socket = this.clientNamespace.sockets.get(session.socket_id);

      if (!socket || !socket.connected) {
        logger.warn(`Socket for device ${deviceId} not connected`);
        this.sessionManager.markSessionOffline(deviceId);
        return false;
      }

      logger.info(`Sending ${notifications.length} notifications to device ${deviceId}`);

      for (const notification of notifications) {
        const message = createMessage(MASTER_NOTIFICATION_PUSH, notification.toClientPayload());
        socket.emit('message', message);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to send notifications to device ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * 获取广播统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalBroadcasts: 0,
      successfulBroadcasts: 0,
      failedBroadcasts: 0,
    };
    logger.info('Broadcast stats reset');
  }
}

module.exports = NotificationBroadcaster;
