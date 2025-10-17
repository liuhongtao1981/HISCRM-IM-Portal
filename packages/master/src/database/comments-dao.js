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

      // 添加平台用户ID过滤
      if (filters.platform_user_id) {
        sql += ' AND platform_user_id = ?';
        params.push(filters.platform_user_id);
      }

      if (filters.is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(filters.is_read ? 1 : 0);
      }

      if (filters.is_new !== undefined) {
        sql += ' AND is_new = ?';
        params.push(filters.is_new ? 1 : 0);
      }

      if (filters.post_id) {
        sql += ' AND post_id = ?';
        params.push(filters.post_id);
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

      // 添加平台用户ID过滤
      if (filters.platform_user_id) {
        sql += ' AND platform_user_id = ?';
        params.push(filters.platform_user_id);
      }

      if (filters.is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(filters.is_read ? 1 : 0);
      }

      if (filters.is_new !== undefined) {
        sql += ' AND is_new = ?';
        params.push(filters.is_new ? 1 : 0);
      }

      if (filters.post_id) {
        sql += ' AND post_id = ?';
        params.push(filters.post_id);
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

  /**
   * 获取某个作品的所有评论ID（用于增量抓取）
   * @param {string} postId - 作品ID
   * @param {Object} options - 查询选项
   * @param {number} options.since_time - 只获取此时间之后的评论ID（性能优化）
   * @returns {Array<string>} 平台评论ID列表
   */
  getCommentIdsByPostId(postId, options = {}) {
    try {
      let sql = 'SELECT platform_comment_id FROM comments WHERE post_id = ?';
      const params = [postId];

      // 性能优化：如果提供了时间范围，只查询最近的评论ID
      // 适用场景：定期爬取（如每小时一次），只需要对比最近1-2小时的评论
      if (options.since_time) {
        sql += ' AND detected_at >= ?';
        params.push(options.since_time);
      }

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return rows.map(row => row.platform_comment_id).filter(id => id);
    } catch (error) {
      logger.error(`Failed to get comment IDs for post ${postId}:`, error);
      return [];
    }
  }

  /**
   * 批量插入评论（用于爬虫）
   * @param {Array} comments - 评论数组
   * @returns {Object} 插入结果 { inserted: number, skipped: number }
   */
  bulkInsert(comments) {
    let inserted = 0;
    let skipped = 0;

    try {
      const insertStmt = this.db.prepare(
        `INSERT OR IGNORE INTO comments (
          id, account_id, platform_user_id, platform_comment_id, content,
          author_name, author_id, post_id, post_title,
          is_new, is_read, detected_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const transaction = this.db.transaction((commentList) => {
        for (const comment of commentList) {
          const result = insertStmt.run(
            comment.id,
            comment.account_id,
            comment.platform_user_id || null,
            comment.platform_comment_id,
            comment.content,
            comment.author_name,
            comment.author_id,
            comment.post_id,
            comment.post_title,
            comment.is_new !== undefined ? comment.is_new : 1,
            comment.is_read !== undefined ? comment.is_read : 0,
            comment.detected_at,
            comment.created_at || Math.floor(Date.now() / 1000)
          );

          if (result.changes > 0) {
            inserted++;
          } else {
            skipped++;
          }
        }
      });

      transaction(comments);

      logger.info(`Bulk insert complete: ${inserted} inserted, ${skipped} skipped`);
      return { inserted, skipped };
    } catch (error) {
      logger.error('Failed to bulk insert comments:', error);
      throw error;
    }
  }

  /**
   * 标记所有新评论为已查看
   * @param {string} accountId - 账户ID（可选）
   * @param {string} platformUserId - 平台用户ID（可选）
   * @param {string} postId - 作品ID（可选）
   */
  markNewAsViewed(accountId = null, platformUserId = null, postId = null) {
    try {
      let sql = 'UPDATE comments SET is_new = 0 WHERE is_new = 1';
      const params = [];

      if (accountId) {
        sql += ' AND account_id = ?';
        params.push(accountId);
      }

      if (platformUserId) {
        sql += ' AND platform_user_id = ?';
        params.push(platformUserId);
      }

      if (postId) {
        sql += ' AND post_id = ?';
        params.push(postId);
      }

      const result = this.db.prepare(sql).run(...params);
      logger.info(`Marked ${result.changes} new comments as viewed`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to mark new comments as viewed:', error);
      throw error;
    }
  }

  /**
   * 获取新评论数量
   * @param {string} accountId - 账户ID（可选）
   * @param {string} platformUserId - 平台用户ID（可选）
   * @param {string} postId - 作品ID（可选）
   * @returns {number} 新评论数量
   */
  countNew(accountId = null, platformUserId = null, postId = null) {
    try {
      let sql = 'SELECT COUNT(*) as count FROM comments WHERE is_new = 1';
      const params = [];

      if (accountId) {
        sql += ' AND account_id = ?';
        params.push(accountId);
      }

      if (platformUserId) {
        sql += ' AND platform_user_id = ?';
        params.push(platformUserId);
      }

      if (postId) {
        sql += ' AND post_id = ?';
        params.push(postId);
      }

      const result = this.db.prepare(sql).get(...params);
      return result.count;
    } catch (error) {
      logger.error('Failed to count new comments:', error);
      return 0;
    }
  }

  /**
   * 根据作品ID查找评论
   * @param {string} postId - 作品ID
   * @param {Object} options - 查询选项
   * @param {string} options.platform_user_id - 平台用户ID（可选）
   * @returns {Array} 评论列表
   */
  findByPostId(postId, options = {}) {
    try {
      const { limit = 100, offset = 0, is_new = null, platform_user_id = null } = options;

      let sql = 'SELECT * FROM comments WHERE post_id = ?';
      const params = [postId];

      if (platform_user_id) {
        sql += ' AND platform_user_id = ?';
        params.push(platform_user_id);
      }

      if (is_new !== null) {
        sql += ' AND is_new = ?';
        params.push(is_new ? 1 : 0);
      }

      sql += ' ORDER BY detected_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows = this.db.prepare(sql).all(...params);
      return rows.map((row) => Comment.fromDbRow(row));
    } catch (error) {
      logger.error(`Failed to find comments for post ${postId}:`, error);
      return [];
    }
  }
}

module.exports = CommentsDAO;
