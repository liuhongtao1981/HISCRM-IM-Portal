/**
 * Comments 数据访问对象(DAO)
 * T057: 评论数据库操作
 */

const { Comment } = require('@hiscrm-im/shared/models/Comment');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('comments-dao');

class CommentsDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建评论
   * @param {Comment} comment - 评论对象
   * @returns {Comment}
   */
  create(comment) {
    try {
      const validation = comment.validate();
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      const row = comment.toDbRow();
      const stmt = this.db.prepare(
        `INSERT INTO comments (
          id, account_id, platform_comment_id, content,
          author_name, author_id, post_id, post_title,
          is_read, detected_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run(
        row.id,
        row.account_id,
        row.platform_comment_id,
        row.content,
        row.author_name,
        row.author_id,
        row.post_id,
        row.post_title,
        row.is_read,
        row.detected_at,
        row.created_at
      );

      logger.info(`Comment created: ${row.id}`);
      return comment;
    } catch (error) {
      logger.error('Failed to create comment:', error);
      throw error;
    }
  }

  /**
   * 根据ID查找评论
   * @param {string} id - 评论ID
   * @returns {Comment|null}
   */
  findById(id) {
    try {
      const row = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(id);

      if (!row) {
        return null;
      }

      return Comment.fromDbRow(row);
    } catch (error) {
      logger.error(`Failed to find comment by ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 查找所有评论
   * @param {object} filters - 过滤条件
   * @returns {Comment[]}
   */
  findAll(filters = {}) {
    try {
      let sql = 'SELECT * FROM comments WHERE 1=1';
      const params = [];

      if (filters.account_id) {
        sql += ' AND account_id = ?';
        params.push(filters.account_id);
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
      return rows.map((row) => Comment.fromDbRow(row));
    } catch (error) {
      logger.error('Failed to find comments:', error);
      throw error;
    }
  }

  /**
   * 标记评论为已读
   * @param {string} id - 评论ID
   * @returns {boolean}
   */
  markAsRead(id) {
    try {
      const result = this.db
        .prepare('UPDATE comments SET is_read = 1 WHERE id = ?')
        .run(id);

      if (result.changes === 0) {
        return false;
      }

      logger.info(`Comment marked as read: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to mark comment as read ${id}:`, error);
      throw error;
    }
  }

  /**
   * 删除评论
   * @param {string} id - 评论ID
   * @returns {boolean}
   */
  delete(id) {
    try {
      const result = this.db.prepare('DELETE FROM comments WHERE id = ?').run(id);

      if (result.changes === 0) {
        return false;
      }

      logger.info(`Comment deleted: ${id}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete comment ${id}:`, error);
      throw error;
    }
  }

  /**
   * 计数评论
   * @param {object} filters - 过滤条件
   * @returns {number}
   */
  count(filters = {}) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM comments WHERE 1=1';
      const params = [];

      if (filters.account_id) {
        sql += ' AND account_id = ?';
        params.push(filters.account_id);
      }

      if (filters.is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(filters.is_read ? 1 : 0);
      }

      const result = this.db.prepare(sql).get(...params);
      return result.count;
    } catch (error) {
      logger.error('Failed to count comments:', error);
      throw error;
    }
  }

  /**
   * 检查评论是否已存在（根据 platform_comment_id）
   * @param {string} accountId - 账户ID
   * @param {string} platformCommentId - 平台评论ID
   * @returns {boolean}
   */
  exists(accountId, platformCommentId) {
    try {
      if (!platformCommentId) {
        return false;
      }

      const result = this.db
        .prepare(
          'SELECT COUNT(*) as count FROM comments WHERE account_id = ? AND platform_comment_id = ?'
        )
        .get(accountId, platformCommentId);

      return result.count > 0;
    } catch (error) {
      logger.error('Failed to check comment existence:', error);
      throw error;
    }
  }
}

module.exports = CommentsDAO;
