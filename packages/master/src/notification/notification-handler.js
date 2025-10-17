/**
 * Notification Handler - 通知处理器
 * 负责接收 Worker 的通知消息，入库并转发到各个客户端
 */

const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('notification-handler');

class NotificationHandler {
  constructor(db, socketServer) {
    this.db = db;
    this.socketServer = socketServer;
  }

  /**
   * 处理来自 Worker 的通知推送
   * @param {Object} notification - 通知对象
   * @returns {Object} 创建的通知记录
   */
  async handleWorkerNotification(notification) {
    const {
      type,
      account_id,
      title,
      content,
      data,
      related_id,
      priority = 'normal',
      worker_id,
      timestamp,
    } = notification;

    try {
      logger.info(`Received notification from worker ${worker_id}: [${type}] ${title}`);

      // 1. 验证必填字段
      if (!type || !title || !content) {
        throw new Error('Missing required notification fields');
      }

      // 2. 创建通知记录
      const notificationId = uuidv4();
      const now = Date.now();

      const notificationRecord = {
        id: notificationId,
        type,
        account_id: account_id || null,
        related_id: related_id || null,
        title,
        content,
        data: data || null,
        priority,
        is_sent: 0,
        sent_at: null,
        created_at: now,
      };

      // 3. 保存到数据库
      await this.saveNotification(notificationRecord);
      logger.info(`Notification saved to database: ${notificationId}`);

      // 4. 实时转发到所有连接的客户端
      await this.broadcastNotification(notificationRecord);
      logger.info(`Notification broadcasted to clients: ${notificationId}`);

      // 5. 更新发送状态
      await this.markNotificationAsSent(notificationId);

      return notificationRecord;
    } catch (error) {
      logger.error('Failed to handle worker notification:', error);
      throw error;
    }
  }

  /**
   * 保存通知到数据库
   * @param {Object} notification - 通知对象
   */
  async saveNotification(notification) {
    const stmt = this.db.prepare(`
      INSERT INTO notifications (
        id, type, account_id, related_id, title, content, data,
        is_sent, sent_at, created_at
      ) VALUES (
        @id, @type, @account_id, @related_id, @title, @content, @data,
        @is_sent, @sent_at, @created_at
      )
    `);

    stmt.run({
      id: notification.id,
      type: notification.type,
      account_id: notification.account_id,
      related_id: notification.related_id,
      title: notification.title,
      content: notification.content,
      data: notification.data,
      is_sent: notification.is_sent,
      sent_at: notification.sent_at,
      created_at: notification.created_at,
    });
  }

  /**
   * 广播通知到所有连接的客户端
   * @param {Object} notification - 通知对象
   */
  async broadcastNotification(notification) {
    try {
      // 解析 data 字段
      let parsedData = null;
      if (notification.data) {
        try {
          parsedData = typeof notification.data === 'string'
            ? JSON.parse(notification.data)
            : notification.data;
        } catch (e) {
          logger.warn('Failed to parse notification data:', e);
        }
      }

      // 获取关联的账号信息（如果有）
      let accountInfo = null;
      if (notification.account_id) {
        try {
          accountInfo = this.db.prepare(`
            SELECT id, account_name, platform, user_info
            FROM accounts
            WHERE id = ?
          `).get(notification.account_id);

          // 解析 user_info
          if (accountInfo && accountInfo.user_info) {
            try {
              accountInfo.user_info = JSON.parse(accountInfo.user_info);
            } catch (e) {
              logger.warn('Failed to parse account user_info:', e);
            }
          }
        } catch (e) {
          logger.warn('Failed to get account info:', e);
        }
      }

      // 构造推送消息
      const pushMessage = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        data: parsedData,
        account: accountInfo,
        priority: notification.priority,
        created_at: notification.created_at,
        timestamp: Date.now(),
      };

      // 1. 推送到 Admin Web
      if (this.socketServer.adminNamespace) {
        this.socketServer.adminNamespace.emit('notification:new', pushMessage);
        logger.debug('Notification sent to admin web clients');
      }

      // 2. 推送到 Desktop/Mobile Clients
      if (this.socketServer.clientNamespace) {
        this.socketServer.clientNamespace.emit('notification:new', pushMessage);
        logger.debug('Notification sent to desktop/mobile clients');
      }

      return true;
    } catch (error) {
      logger.error('Failed to broadcast notification:', error);
      throw error;
    }
  }

  /**
   * 标记通知为已发送
   * @param {string} notificationId - 通知 ID
   */
  async markNotificationAsSent(notificationId) {
    const stmt = this.db.prepare(`
      UPDATE notifications
      SET is_sent = 1, sent_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), notificationId);
  }

  /**
   * 获取通知列表
   * @param {Object} options - 查询选项
   * @returns {Array} 通知列表
   */
  async getNotifications(options = {}) {
    const {
      type = null,
      accountId = null,
      limit = 50,
      offset = 0,
      unreadOnly = false,
    } = options;

    try {
      let query = `
        SELECT
          n.*,
          a.account_name,
          a.platform,
          a.user_info
        FROM notifications n
        LEFT JOIN accounts a ON n.account_id = a.id
        WHERE 1=1
      `;

      const params = [];

      if (type) {
        query += ` AND n.type = ?`;
        params.push(type);
      }

      if (accountId) {
        query += ` AND n.account_id = ?`;
        params.push(accountId);
      }

      query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const notifications = this.db.prepare(query).all(...params);

      // 解析 JSON 字段
      return notifications.map(n => {
        if (n.data) {
          try {
            n.data = JSON.parse(n.data);
          } catch (e) {
            logger.warn(`Failed to parse notification data for ${n.id}`);
          }
        }

        if (n.user_info) {
          try {
            n.user_info = JSON.parse(n.user_info);
          } catch (e) {
            logger.warn(`Failed to parse user_info for notification ${n.id}`);
          }
        }

        return n;
      });
    } catch (error) {
      logger.error('Failed to get notifications:', error);
      throw error;
    }
  }

  /**
   * 获取通知统计
   * @returns {Object} 统计信息
   */
  async getNotificationStats() {
    try {
      const total = this.db.prepare('SELECT COUNT(*) as count FROM notifications').get().count;
      const sent = this.db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_sent = 1').get().count;
      const pending = total - sent;

      // 按类型统计
      const byType = this.db.prepare(`
        SELECT type, COUNT(*) as count
        FROM notifications
        GROUP BY type
      `).all();

      // 今天的通知数
      const today = Date.now() - (24 * 60 * 60 * 1000);
      const todayCount = this.db.prepare(
        'SELECT COUNT(*) as count FROM notifications WHERE created_at > ?'
      ).get(today).count;

      return {
        total,
        sent,
        pending,
        today: todayCount,
        by_type: byType.reduce((acc, item) => {
          acc[item.type] = item.count;
          return acc;
        }, {}),
      };
    } catch (error) {
      logger.error('Failed to get notification stats:', error);
      throw error;
    }
  }

  /**
   * 删除旧通知
   * @param {number} daysToKeep - 保留天数
   * @returns {number} 删除的通知数
   */
  async cleanupOldNotifications(daysToKeep = 30) {
    try {
      const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

      const stmt = this.db.prepare(`
        DELETE FROM notifications
        WHERE created_at < ? AND is_sent = 1
      `);

      const result = stmt.run(cutoffTime);

      logger.info(`Cleaned up ${result.changes} old notifications (older than ${daysToKeep} days)`);

      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup old notifications:', error);
      throw error;
    }
  }
}

module.exports = NotificationHandler;
