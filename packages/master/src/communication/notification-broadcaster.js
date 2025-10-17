/**
 * 通知广播器
 * 负责将通知推送到所有在线的客户端设备
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage, MASTER_NOTIFICATION_PUSH } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('notification-broadcaster');

class NotificationBroadcaster {
  constructor(sessionManager, clientNamespace, adminNamespace = null) {
    this.sessionManager = sessionManager;
    this.clientNamespace = clientNamespace;
    this.adminNamespace = adminNamespace; // Admin namespace for broadcasting to Admin UI

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

      logger.info(
        `Broadcasting ${notifications.length} notifications to ${onlineSessions.length} mobile/desktop clients`
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

      // 同时向 Admin UI 广播通知
      if (this.adminNamespace) {
        try {
          const adminClientsCount = this.adminNamespace.sockets.size;
          logger.info(`🔔 Broadcasting ${notifications.length} notifications to ${adminClientsCount} Admin UI clients`);

          for (const notification of notifications) {
            const payload = notification.toClientPayload();
            this.adminNamespace.emit('notification:new', payload);
            logger.debug(`Sent notification ${notification.id} (${notification.type}) to Admin UI`);
          }

          logger.info(`✅ Successfully broadcasted ${notifications.length} notifications to Admin UI`);
        } catch (error) {
          logger.error('❌ Failed to broadcast to Admin UI:', error);
        }
      } else {
        logger.warn('⚠️  Admin namespace not available for broadcasting');
      }

      logger.info(
        `Broadcast complete: ${successCount} successful, ${failCount} failed (${notifications.length} notifications to ${onlineSessions.length} clients)`
      );

      // 只要有一个成功，就认为广播成功
      // 如果没有客户端但有 Admin UI，也认为是成功（Admin UI 收到了）
      return successCount > 0 || (this.adminNamespace && this.adminNamespace.sockets.size > 0);
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
