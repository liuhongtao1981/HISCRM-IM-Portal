/**
 * Direct Messages 数据访问对象(DAO)
 * T058: 私信数据库操作
 */

const { DirectMessage } = require('@hiscrm-im/shared/models/DirectMessage');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('messages-dao');

class DirectMessagesDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建私信
   * @param {DirectMessage} message - 私信对象
   * @returns {DirectMessage}
   */
  create(message) {
    try {
      const validation = message.validate();
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      const row = message.toDbRow();
      const stmt = this.db.prepare(
        `INSERT INTO direct_messages (
          id, account_id, platform_message_id, content,
          sender_name, sender_id, direction,
          is_read, detected_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run(
        row.id,
        row.account_id,
        row.platform_message_id,
        row.content,
        row.sender_name,
        row.sender_id,
        row.direction,
        row.is_read,
        row.detected_at,
        row.created_at
      );

      logger.info(`Direct message created: ${row.id}`);
      return message;
    } catch (error) {
      logger.error('Failed to create direct message:', error);
      throw error;
    }
  }

  /**
   * 根据ID查找私信
   * @param {string} id - 私信ID
   * @returns {DirectMessage|null}
   */
  findById(id) {
    try {
      const row = this.db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(id);

      if (!row) {
        return null;
      }

      return DirectMessage.fromDbRow(row);
    } catch (error) {
      logger.error(`Failed to find direct message by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 查找所有私信
   * @param {object} filters - 过滤条件
   * @returns {DirectMessage[]}
   */
  findAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM direct_messages WHERE 1=1';
      const params = [];

      if (filters.account_id) {
        sql += ' AND account_id = ?';
        params.push(filters.account_id);
      }

      if (filters.direction) {
        sql += ' AND direction = ?';
        params.push(filters.direction);
      }

      if (filters.is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(filters.is_read ? 1 : 0);
      }

      if (filters.since_timestamp) {
        sql += ' AND detected_at >= ?';
        params.push(filters.since_timestamp);
      }

      if (filters.start_time) {
        sql += ' AND detected_at >= ?';
        params.push(filters.start_time);
      }

      if (filters.end_time) {
        sql += ' AND detected_at <= ?';
        params.push(filters.end_time);
      }

      sql += ' ORDER BY detected_at DESC';

      if (filters.limit) {
        sql += ' LIMIT ?';
        params.push(filters.limit);
      }

      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }

      const rows = this.db.prepare(sql).all(...params);
      return rows.map((row) => DirectMessage.fromDbRow(row));
    } catch (error) {
      logger.error('Failed to find direct messages:', error);
      throw error;
    }
  }

  /**
   * 标记私信为已读
   * @param {string} id - 私信ID
   * @returns {boolean}
   */
  markAsRead(id) {
    try {
      const result = this.db
        .prepare('UPDATE direct_messages SET is_read = 1 WHERE id = ?')
        .run(id);

      if (result.changes === 0) {
        return false;
      }

      logger.info(`Direct message marked as read: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to mark direct message as read ${id}:`, error);
      throw error;
    }
  }

  /**
   * 删除私信
   * @param {string} id - 私信ID
   * @returns {boolean}
   */
  delete(id) {
    try {
      const result = this.db.prepare('DELETE FROM direct_messages WHERE id = ?').run(id);

      if (result.changes === 0) {
        return false;
      }

      logger.info(`Direct message deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete direct message ${id}:`, error);
      throw error;
    }
  }

  /**
   * 计数私信
   * @param {object} filters - 过滤条件
   * @returns {number}
   */
  count(filters = {}) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM direct_messages WHERE 1=1';
      const params = [];

      if (filters.account_id) {
        sql += ' AND account_id = ?';
        params.push(filters.account_id);
      }

      if (filters.direction) {
        sql += ' AND direction = ?';
        params.push(filters.direction);
      }

      if (filters.is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(filters.is_read ? 1 : 0);
      }

      const result = this.db.prepare(sql).get(...params);
      return result.count;
    } catch (error) {
      logger.error('Failed to count direct messages:', error);
      throw error;
    }
  }

  /**
   * 检查私信是否已存在（根据 platform_message_id）
   * @param {string} accountId - 账户ID
   * @param {string} platformMessageId - 平台私信ID
   * @returns {boolean}
   */
  exists(accountId, platformMessageId) {
    try {
      if (!platformMessageId) {
        return false;
      }

      const result = this.db
        .prepare(
          'SELECT COUNT(*) as count FROM direct_messages WHERE account_id = ? AND platform_message_id = ?'
        )
        .get(accountId, platformMessageId);

      return result.count > 0;
    } catch (error) {
      logger.error('Failed to check direct message existence:', error);
      throw error;
    }
  }
}

module.exports = DirectMessagesDAO;
