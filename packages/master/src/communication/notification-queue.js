/**
 * 通知队列管理器
 * 负责通知的入队、批处理和发送调度
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const Notification = require('@hiscrm-im/shared/models/Notification');
const NotificationsDAO = require('../database/notifications-dao');

const logger = createLogger('notification-queue');

class NotificationQueue {
  constructor(db, broadcaster) {
    this.db = db;
    this.broadcaster = broadcaster;
    this.notificationsDAO = new NotificationsDAO(db);

    // 内存队列（待发送的通知）
    this.pendingQueue = [];

    // 批处理配置
    this.batchSize = 50; // 每批处理的最大通知数
    this.batchInterval = 1000; // 批处理间隔（毫秒）

    // 定时器
    this.processTimer = null;
    this.isProcessing = false;
  }

  /**
   * 启动队列处理
   */
  start() {
    if (this.processTimer) {
      logger.warn('Notification queue already started');
      return;
    }

    logger.info('Starting notification queue processor');
    this.processTimer = setInterval(() => {
      this.processBatch();
    }, this.batchInterval);

    // 启动时立即加载未发送的通知
    this.loadPendingNotifications();
  }

  /**
   * 停止队列处理
   */
  stop() {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
      logger.info('Notification queue processor stopped');
    }
  }

  /**
   * 入队单个通知
   */
  enqueue(notification) {
    try {
      // 保存到数据库（返回完整的通知对象）
      const savedNotification = this.notificationsDAO.create(notification);

      // 添加到内存队列（使用数据库返回的对象）
      this.pendingQueue.push(savedNotification);

      logger.info(`✅ Notification enqueued: ${savedNotification.id} (${savedNotification.type}), queue size: ${this.pendingQueue.length}`);

      return savedNotification;
    } catch (error) {
      logger.error('Failed to enqueue notification:', error);
      throw error;
    }
  }

  /**
   * 批量入队通知
   */
  enqueueBatch(notifications) {
    const results = [];

    for (const notification of notifications) {
      try {
        const result = this.enqueue(notification);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to enqueue notification ${notification.id}:`, error);
      }
    }

    return results;
  }

  /**
   * 加载未发送的通知
   */
  loadPendingNotifications() {
    try {
      const unsent = this.notificationsDAO.findAll({ is_sent: false });

      if (unsent.length > 0) {
        this.pendingQueue.push(...unsent);
        logger.info(`Loaded ${unsent.length} pending notifications from database`);
      }
    } catch (error) {
      logger.error('Failed to load pending notifications:', error);
    }
  }

  /**
   * 处理一批通知
   */
  async processBatch() {
    if (this.isProcessing) {
      logger.debug(`Skipping batch processing - already processing`);
      return;
    }

    if (this.pendingQueue.length === 0) {
      // logger.debug(`Notification queue is empty, skipping batch processing`);
      return;
    }

    this.isProcessing = true;
    logger.info(`📥 Starting batch processing, queue size: ${this.pendingQueue.length}`);

    try {
      // 取出一批通知
      const batch = this.pendingQueue.splice(0, this.batchSize);

      logger.info(`🔔 Processing batch of ${batch.length} notifications from queue (remaining: ${this.pendingQueue.length})`);

      // 按账户分组
      const byAccount = new Map();
      for (const notification of batch) {
        if (!byAccount.has(notification.account_id)) {
          byAccount.set(notification.account_id, []);
        }
        byAccount.get(notification.account_id).push(notification);
      }

      // 广播每个账户的通知
      const sentIds = [];
      for (const [accountId, notifications] of byAccount.entries()) {
        try {
          const success = await this.broadcaster.broadcastNotifications(accountId, notifications);

          if (success) {
            // 记录已发送的通知ID
            sentIds.push(...notifications.map((n) => n.id));
          } else {
            // 广播失败，重新入队
            this.pendingQueue.push(...notifications);
          }
        } catch (error) {
          logger.error(`Failed to broadcast notifications for account ${accountId}:`, error);
          // 失败的通知重新入队
          this.pendingQueue.push(...notifications);
        }
      }

      // 标记已发送
      if (sentIds.length > 0) {
        this.notificationsDAO.markAsSent(sentIds);
        logger.info(`Successfully sent ${sentIds.length} notifications`);
      }
    } catch (error) {
      logger.error('Error processing notification batch:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 获取队列统计信息
   */
  getStats() {
    return {
      pending: this.pendingQueue.length,
      isProcessing: this.isProcessing,
      batchSize: this.batchSize,
      batchInterval: this.batchInterval,
    };
  }

  /**
   * 清空队列（用于测试）
   */
  clear() {
    this.pendingQueue = [];
    logger.info('Notification queue cleared');
  }
}

module.exports = NotificationQueue;
