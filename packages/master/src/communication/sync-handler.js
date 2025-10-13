/**
 * T071: Client Sync Handler
 *
 * Purpose: 处理客户端离线同步请求,推送离线期间的未读通知
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const notificationsDao = require('../database/notifications-dao');
const sessionManager = require('./session-manager');

const logger = createLogger('sync-handler');

/**
 * 同步处理器类
 */
class SyncHandler {
  constructor(io) {
    this.io = io;
    this.setupHandlers();
  }

  /**
   * 设置Socket.IO事件处理器
   */
  setupHandlers() {
    this.io.on('connection', (socket) => {
      // 处理客户端同步请求
      socket.on('client:sync:request', (data) => {
        this.handleSyncRequest(socket, data);
      });

      // 处理客户端拉取通知请求
      socket.on('client:notifications:fetch', (data) => {
        this.handleFetchNotifications(socket, data);
      });
    });

    logger.info('Sync handlers setup complete');
  }

  /**
   * 处理同步请求
   * @param {Socket} socket - Socket.IO socket对象
   * @param {object} data - 同步请求数据
   */
  async handleSyncRequest(socket, data) {
    const deviceId = socket.deviceId;

    if (!deviceId) {
      logger.warn('Sync request from unregistered client', {
        socketId: socket.id,
      });
      return;
    }

    const { last_sync_time } = data;

    logger.info('Processing sync request', {
      socketId: socket.id,
      deviceId,
      lastSyncTime: last_sync_time,
    });

    try {
      // 获取离线期间的通知
      const offlineNotifications = await this.getOfflineNotifications(
        deviceId,
        last_sync_time
      );

      if (offlineNotifications.length > 0) {
        // 分批推送通知
        await this.pushNotifications(socket, offlineNotifications);

        logger.info('Pushed offline notifications', {
          deviceId,
          count: offlineNotifications.length,
        });
      } else {
        logger.debug('No offline notifications for client', {
          deviceId,
        });
      }

      // 发送同步完成事件
      socket.emit('client:sync:complete', {
        device_id: deviceId,
        notification_count: offlineNotifications.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Sync request failed', {
        deviceId,
        error: error.message,
        stack: error.stack,
      });

      socket.emit('client:sync:error', {
        error: 'Failed to sync notifications',
        message: error.message,
      });
    }
  }

  /**
   * 处理拉取通知请求
   * @param {Socket} socket - Socket.IO socket对象
   * @param {object} data - 请求数据
   */
  async handleFetchNotifications(socket, data) {
    const deviceId = socket.deviceId;

    if (!deviceId) {
      logger.warn('Fetch request from unregistered client', {
        socketId: socket.id,
      });
      return;
    }

    const { limit = 50, offset = 0, filter } = data;

    logger.debug('Fetching notifications', {
      deviceId,
      limit,
      offset,
      filter,
    });

    try {
      const notifications = await notificationsDao.getUnsentNotifications({
        limit,
        offset,
        filter,
      });

      socket.emit('client:notifications:data', {
        notifications,
        count: notifications.length,
        offset,
      });

      logger.debug('Sent notifications data', {
        deviceId,
        count: notifications.length,
      });
    } catch (error) {
      logger.error('Fetch notifications failed', {
        deviceId,
        error: error.message,
      });

      socket.emit('client:notifications:error', {
        error: 'Failed to fetch notifications',
      });
    }
  }

  /**
   * 获取离线通知
   * @param {string} deviceId - 设备ID
   * @param {number} lastSyncTime - 最后同步时间戳
   * @returns {Promise<Array>} 离线通知列表
   */
  async getOfflineNotifications(deviceId, lastSyncTime) {
    try {
      // 获取会话信息
      const session = sessionManager.getSession(deviceId);

      if (!session) {
        logger.warn('Session not found for device', { deviceId });
        return [];
      }

      // 确定查询起始时间
      const startTime = lastSyncTime || session.last_seen || session.connected_at;

      // 查询未发送的通知
      const notifications = await notificationsDao.getNotificationsSince(startTime);

      logger.debug('Retrieved offline notifications', {
        deviceId,
        startTime,
        count: notifications.length,
      });

      return notifications;
    } catch (error) {
      logger.error('Failed to get offline notifications', {
        deviceId,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * 推送通知列表
   * @param {Socket} socket - Socket.IO socket对象
   * @param {Array} notifications - 通知列表
   */
  async pushNotifications(socket, notifications) {
    const batchSize = 10; // 每批推送10条

    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);

      // 推送批次通知
      socket.emit('master:notification:push', {
        notifications: batch,
        is_batch: true,
        batch_index: Math.floor(i / batchSize),
        total_batches: Math.ceil(notifications.length / batchSize),
      });

      // 标记通知为已发送
      for (const notification of batch) {
        try {
          await notificationsDao.markAsSent(notification.id);
        } catch (error) {
          logger.error('Failed to mark notification as sent', {
            notificationId: notification.id,
            error: error.message,
          });
        }
      }

      // 短暂延迟,避免消息过快
      if (i + batchSize < notifications.length) {
        await this.delay(100);
      }
    }

    logger.debug('Pushed notification batches', {
      totalCount: notifications.length,
      batchCount: Math.ceil(notifications.length / batchSize),
    });
  }

  /**
   * 延迟工具函数
   * @param {number} ms - 毫秒数
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 触发指定设备的同步
   * @param {string} deviceId - 设备ID
   */
  triggerSync(deviceId) {
    const session = sessionManager.getSession(deviceId);

    if (!session || session.status !== 'online') {
      logger.debug('Cannot trigger sync for offline device', { deviceId });
      return false;
    }

    // 通过socket.io发送同步触发事件
    this.io.to(session.socket_id).emit('master:sync:trigger', {
      device_id: deviceId,
      timestamp: Date.now(),
    });

    logger.info('Triggered sync for device', { deviceId });
    return true;
  }

  /**
   * 广播同步触发给所有在线客户端
   */
  broadcastSyncTrigger() {
    const onlineSessions = sessionManager.getOnlineSessions();

    for (const session of onlineSessions) {
      this.triggerSync(session.device_id);
    }

    logger.info('Broadcast sync trigger to all online clients', {
      count: onlineSessions.length,
    });
  }
}

module.exports = SyncHandler;
