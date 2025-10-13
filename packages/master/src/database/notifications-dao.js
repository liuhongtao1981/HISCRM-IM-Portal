/**
 * Notifications DAO
 * 管理通知的数据库操作
 */

const Notification = require('@hiscrm-im/shared/models/Notification');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('notifications-dao');

class NotificationsDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建通知
   */
  create(notification) {
    try {
      const validation = notification.validate();
      if (!validation.valid) {
        throw new Error(`Invalid notification: ${validation.errors.join(', ')}`);
      }

      const row = notification.toDbRow();
      const stmt = this.db.prepare(`
        INSERT INTO notifications (
          id, type, account_id, related_id, title, content, data,
          is_sent, sent_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        row.id,
        row.type,
        row.account_id,
        row.related_id,
        row.title,
        row.content,
        row.data,
        row.is_sent,
        row.sent_at,
        row.created_at
      );

      logger.info(`Notification created: ${notification.id} (${notification.type})`);
      return notification;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * 查询所有通知
   * @param {Object} filters - 过滤条件
   * @param {string} filters.account_id - 账户ID
   * @param {boolean} filters.is_sent - 是否已发送
   * @param {number} filters.since_timestamp - 从哪个时间开始
   * @param {number} filters.limit - 限制数量
   * @param {number} filters.offset - 偏移量
   */
  findAll(filters = {}) {
    try {
      const conditions = [];
      const params = [];

      if (filters.account_id) {
        conditions.push('account_id = ?');
        params.push(filters.account_id);
      }

      if (filters.is_sent !== undefined) {
        conditions.push('is_sent = ?');
        params.push(filters.is_sent ? 1 : 0);
      }

      if (filters.since_timestamp) {
        conditions.push('created_at > ?');
        params.push(filters.since_timestamp);
      }

      let sql = 'SELECT * FROM notifications';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY created_at DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);

        if (filters.offset) {
          sql += ' OFFSET ?';
          params.push(filters.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params);
      return rows.map((row) => Notification.fromDbRow(row));
    } catch (error) {
      logger.error('Failed to find notifications:', error);
      throw error;
    }
  }

  /**
   * 根据ID查找通知
   */
  findById(id) {
    try {
      const row = this.db
        .prepare('SELECT * FROM notifications WHERE id = ?')
        .get(id);
      return Notification.fromDbRow(row);
    } catch (error) {
      logger.error(`Failed to find notification ${id}:`, error);
      throw error;
    }
  }

  /**
   * 统计通知数量
   */
  count(filters = {}) {
    try {
      const conditions = [];
      const params = [];

      if (filters.account_id) {
        conditions.push('account_id = ?');
        params.push(filters.account_id);
      }

      if (filters.is_sent !== undefined) {
        conditions.push('is_sent = ?');
        params.push(filters.is_sent ? 1 : 0);
      }

      if (filters.since_timestamp) {
        conditions.push('created_at > ?');
        params.push(filters.since_timestamp);
      }

      let sql = 'SELECT COUNT(*) as count FROM notifications';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      const result = this.db.prepare(sql).get(...params);
      return result.count;
    } catch (error) {
      logger.error('Failed to count notifications:', error);
      throw error;
    }
  }

  /**
   * 标记通知为已发送
   */
  markAsSent(notificationIds) {
    try {
      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return 0;
      }

      const now = Math.floor(Date.now() / 1000);
      const placeholders = notificationIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        UPDATE notifications
        SET is_sent = 1, sent_at = ?
        WHERE id IN (${placeholders})
      `);

      const result = stmt.run(now, ...notificationIds);
      logger.info(`Marked ${result.changes} notifications as sent`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to mark notifications as sent:', error);
      throw error;
    }
  }

  /**
   * 批量标记通知为已发送（按账户和时间范围）
   */
  markAsSentByRange(accountId, sinceTimestamp) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const stmt = this.db.prepare(`
        UPDATE notifications
        SET is_sent = 1, sent_at = ?
        WHERE account_id = ? AND created_at > ? AND is_sent = 0
      `);

      const result = stmt.run(now, accountId, sinceTimestamp);
      logger.info(`Marked ${result.changes} notifications as sent for account ${accountId}`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to mark notifications as sent by range:', error);
      throw error;
    }
  }

  /**
   * 删除通知
   */
  delete(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM notifications WHERE id = ?');
      const result = stmt.run(id);
      logger.info(`Notification deleted: ${id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete notification ${id}:`, error);
      throw error;
    }
  }

  /**
   * 删除旧通知（按天数）
   */
  deleteOld(days = 30) {
    try {
      const cutoffTimestamp = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
      const stmt = this.db.prepare('DELETE FROM notifications WHERE created_at < ?');
      const result = stmt.run(cutoffTimestamp);
      logger.info(`Deleted ${result.changes} old notifications (older than ${days} days)`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to delete old notifications:', error);
      throw error;
    }
  }
}

module.exports = NotificationsDAO;
