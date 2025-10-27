/**
 * Discussions DAO - 讨论数据访问对象
 * 管理评论区的二级/三级回复和讨论
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { v4: uuidv4 } = require('uuid');

const logger = createLogger('discussions-dao');

class DiscussionsDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 插入单个讨论
   * @param {Object} discussion - 讨论对象
   * @returns {string} 讨论ID
   */
  insert(discussion) {
    try {
      const {
        id = uuidv4(),
        account_id,
        platform,
        platform_user_id,
        platform_discussion_id,
        parent_comment_id,
        content,
        author_name,
        author_id,
        author_avatar,
        content_id,
        post_id,
        post_title,
        stats_like_count = 0,
        is_read = 0,
        is_new = 1,
        push_count = 0,
        detected_at = Math.floor(Date.now() / 1000),
        created_at = Math.floor(Date.now() / 1000),
      } = discussion;

      // 验证必需字段
      if (!account_id || !platform || !parent_comment_id || !content) {
        throw new Error('Missing required fields: account_id, platform, parent_comment_id, content');
      }

      const stmt = this.db.prepare(`
        INSERT INTO discussions (
          id, account_id, platform, platform_user_id, platform_discussion_id,
          parent_comment_id, content, author_name, author_id, author_avatar,
          content_id, post_id, post_title,
          stats_like_count, is_read, is_new, push_count,
          detected_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id, account_id, platform, platform_user_id, platform_discussion_id,
        parent_comment_id, content, author_name, author_id, author_avatar,
        content_id, post_id, post_title,
        stats_like_count, is_read, is_new, push_count,
        detected_at, created_at
      );

      logger.info(`Discussion inserted: ${id} (reply to comment ${parent_comment_id})`);
      return id;
    } catch (error) {
      // 检查唯一约束冲突
      if (error.message.includes('UNIQUE constraint')) {
        logger.warn(`Discussion already exists: ${discussion.platform}/${discussion.platform_discussion_id}`);
        const existing = this.findByPlatformDiscussionId(
          discussion.account_id,
          discussion.platform_user_id,
          discussion.platform_discussion_id
        );
        return existing ? existing.id : null;
      }
      logger.error('Failed to insert discussion:', error);
      throw error;
    }
  }

  /**
   * 批量插入讨论
   * @param {Array} discussions - 讨论数组
   * @returns {Object} 插入结果统计
   */
  bulkInsert(discussions) {
    if (!Array.isArray(discussions) || discussions.length === 0) {
      logger.warn('No discussions to insert');
      return { inserted: 0, skipped: 0, failed: 0 };
    }

    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    const transaction = this.db.transaction((discussionsToInsert) => {
      for (const discussion of discussionsToInsert) {
        try {
          const id = this.insert(discussion);
          if (id) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (error) {
          if (error.message.includes('UNIQUE constraint')) {
            skipped++;
          } else {
            failed++;
            logger.error(`Failed to insert discussion ${discussion.platform_discussion_id}:`, error.message);
          }
        }
      }
    });

    try {
      transaction(discussions);
      logger.info(`Bulk insert completed: ${inserted} inserted, ${skipped} skipped, ${failed} failed`);
      return { inserted, skipped, failed };
    } catch (error) {
      logger.error('Bulk insert transaction failed:', error);
      throw error;
    }
  }

  /**
   * 根据ID查询讨论
   * @param {string} id - 讨论ID
   * @returns {Object|null}
   */
  findById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM discussions WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Failed to find discussion by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * 根据平台讨论ID查询
   * @param {string} accountId - 账户ID
   * @param {string} platformUserId - 平台用户ID
   * @param {string} platformDiscussionId - 平台讨论ID
   * @returns {Object|null}
   */
  findByPlatformDiscussionId(accountId, platformUserId, platformDiscussionId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM discussions
        WHERE account_id = ? AND platform_user_id = ? AND platform_discussion_id = ?
      `);
      return stmt.get(accountId, platformUserId, platformDiscussionId);
    } catch (error) {
      logger.error('Failed to find discussion by platform discussion ID:', error);
      return null;
    }
  }

  /**
   * 查询某评论下的所有讨论
   * @param {string} parentCommentId - 父评论ID
   * @param {Object} options - 查询选项
   * @returns {Array}
   */
  findByParentComment(parentCommentId, options = {}) {
    const {
      is_read,
      is_new,
      limit = 100,
      offset = 0,
      orderBy = 'created_at ASC',
    } = options;

    try {
      let sql = 'SELECT * FROM discussions WHERE parent_comment_id = ?';
      const params = [parentCommentId];

      if (is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(is_read ? 1 : 0);
      }

      if (is_new !== undefined) {
        sql += ' AND is_new = ?';
        params.push(is_new ? 1 : 0);
      }

      sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error(`Failed to find discussions by parent comment ${parentCommentId}:`, error);
      return [];
    }
  }

  /**
   * 查询某作品下的所有讨论
   * @param {string} workId - 作品ID
   * @param {Object} options - 查询选项
   * @returns {Array}
   */
  findByWork(workId, options = {}) {
    const { limit = 100, offset = 0 } = options;

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM discussions
        WHERE content_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);
      return stmt.all(workId, limit, offset);
    } catch (error) {
      logger.error(`Failed to find discussions by work ${workId}:`, error);
      return [];
    }
  }

  /**
   * 根据账户ID查询讨论
   * @param {string} accountId - 账户ID
   * @param {Object} options - 查询选项
   * @returns {Array}
   */
  findByAccount(accountId, options = {}) {
    const {
      platform,
      is_read,
      is_new,
      content_id,
      start_time,
      end_time,
      limit = 100,
      offset = 0,
      orderBy = 'created_at DESC',
    } = options;

    try {
      let sql = 'SELECT * FROM discussions WHERE account_id = ?';
      const params = [accountId];

      if (platform) {
        sql += ' AND platform = ?';
        params.push(platform);
      }

      if (is_read !== undefined) {
        sql += ' AND is_read = ?';
        params.push(is_read ? 1 : 0);
      }

      if (is_new !== undefined) {
        sql += ' AND is_new = ?';
        params.push(is_new ? 1 : 0);
      }

      if (content_id) {
        sql += ' AND content_id = ?';
        params.push(content_id);
      }

      if (start_time) {
        sql += ' AND detected_at >= ?';
        params.push(start_time);
      }

      if (end_time) {
        sql += ' AND detected_at <= ?';
        params.push(end_time);
      }

      sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error(`Failed to find discussions by account ${accountId}:`, error);
      return [];
    }
  }

  /**
   * 更新讨论信息
   * @param {string} id - 讨论ID
   * @param {Object} updates - 更新字段
   * @returns {boolean}
   */
  update(id, updates) {
    try {
      const allowedFields = [
        'content', 'author_name', 'author_id', 'author_avatar',
        'stats_like_count', 'is_read', 'is_new', 'push_count',
      ];

      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }

      if (fields.length === 0) {
        logger.warn('No valid fields to update');
        return false;
      }

      values.push(id);

      const sql = `UPDATE discussions SET ${fields.join(', ')} WHERE id = ?`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...values);

      logger.info(`Discussion updated: ${id}, changes: ${result.changes}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update discussion ${id}:`, error);
      throw error;
    }
  }

  /**
   * 删除讨论
   * @param {string} id - 讨论ID
   * @returns {boolean}
   */
  delete(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM discussions WHERE id = ?');
      const result = stmt.run(id);

      logger.info(`Discussion deleted: ${id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete discussion ${id}:`, error);
      throw error;
    }
  }

  /**
   * 标记为已读
   * @param {string} id - 讨论ID
   * @returns {boolean}
   */
  markAsRead(id) {
    return this.update(id, { is_read: 1, is_new: 0 });
  }

  /**
   * 批量标记为已读
   * @param {Array<string>} ids - 讨论ID数组
   * @returns {number} 更新数量
   */
  bulkMarkAsRead(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return 0;
    }

    try {
      const placeholders = ids.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        UPDATE discussions
        SET is_read = 1, is_new = 0
        WHERE id IN (${placeholders})
      `);

      const result = stmt.run(...ids);
      logger.info(`Bulk marked ${result.changes} discussions as read`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to bulk mark discussions as read:', error);
      throw error;
    }
  }

  /**
   * 标记为非新消息
   * @param {string} id - 讨论ID
   * @returns {boolean}
   */
  markAsNotNew(id) {
    return this.update(id, { is_new: 0 });
  }

  /**
   * 获取未读讨论数
   * @param {string} accountId - 账户ID
   * @param {Object} options - 过滤选项
   * @returns {number}
   */
  getUnreadCount(accountId, options = {}) {
    const { platform, content_id } = options;

    try {
      let sql = 'SELECT COUNT(*) as count FROM discussions WHERE account_id = ? AND is_read = 0';
      const params = [accountId];

      if (platform) {
        sql += ' AND platform = ?';
        params.push(platform);
      }

      if (content_id) {
        sql += ' AND content_id = ?';
        params.push(content_id);
      }

      const stmt = this.db.prepare(sql);
      const result = stmt.get(...params);
      return result ? result.count : 0;
    } catch (error) {
      logger.error(`Failed to get unread count for account ${accountId}:`, error);
      return 0;
    }
  }

  /**
   * 获取讨论统计
   * @param {string} accountId - 账户ID
   * @param {Object} options - 过滤选项
   * @returns {Object}
   */
  getDiscussionStats(accountId, options = {}) {
    const { platform, content_id } = options;

    try {
      let sql = `
        SELECT
          COUNT(*) as total_discussions,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_discussions,
          SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_discussions,
          SUM(stats_like_count) as total_likes
        FROM discussions
        WHERE account_id = ?
      `;
      const params = [accountId];

      if (platform) {
        sql += ' AND platform = ?';
        params.push(platform);
      }

      if (content_id) {
        sql += ' AND content_id = ?';
        params.push(content_id);
      }

      const stmt = this.db.prepare(sql);
      return stmt.get(...params) || {
        total_discussions: 0,
        unread_discussions: 0,
        new_discussions: 0,
        total_likes: 0,
      };
    } catch (error) {
      logger.error(`Failed to get discussion stats for account ${accountId}:`, error);
      return {
        total_discussions: 0,
        unread_discussions: 0,
        new_discussions: 0,
        total_likes: 0,
      };
    }
  }

  /**
   * 获取评论的回复统计
   * @param {string} parentCommentId - 父评论ID
   * @returns {Object}
   */
  getCommentReplyStats(parentCommentId) {
    try {
      const stmt = this.db.prepare(`
        SELECT
          COUNT(*) as total_replies,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_replies,
          SUM(stats_like_count) as total_likes
        FROM discussions
        WHERE parent_comment_id = ?
      `);

      return stmt.get(parentCommentId) || {
        total_replies: 0,
        unread_replies: 0,
        total_likes: 0,
      };
    } catch (error) {
      logger.error(`Failed to get reply stats for comment ${parentCommentId}:`, error);
      return {
        total_replies: 0,
        unread_replies: 0,
        total_likes: 0,
      };
    }
  }

  /**
   * 删除评论下的所有讨论（级联删除时使用）
   * @param {string} parentCommentId - 父评论ID
   * @returns {number} 删除数量
   */
  deleteByParentComment(parentCommentId) {
    try {
      const stmt = this.db.prepare('DELETE FROM discussions WHERE parent_comment_id = ?');
      const result = stmt.run(parentCommentId);

      logger.info(`Deleted ${result.changes} discussions for comment ${parentCommentId}`);
      return result.changes;
    } catch (error) {
      logger.error(`Failed to delete discussions for comment ${parentCommentId}:`, error);
      throw error;
    }
  }

  /**
   * 删除作品下的所有讨论
   * @param {string} workId - 作品ID
   * @returns {number} 删除数量
   */
  deleteByWork(workId) {
    try {
      const stmt = this.db.prepare('DELETE FROM discussions WHERE content_id = ?');
      const result = stmt.run(workId);

      logger.info(`Deleted ${result.changes} discussions for work ${workId}`);
      return result.changes;
    } catch (error) {
      logger.error(`Failed to delete discussions for work ${workId}:`, error);
      throw error;
    }
  }

  /**
   * 增加推送计数
   * @param {string} id - 讨论ID
   * @returns {boolean}
   */
  incrementPushCount(id) {
    try {
      const stmt = this.db.prepare(`
        UPDATE discussions
        SET push_count = push_count + 1
        WHERE id = ?
      `);

      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to increment push count for discussion ${id}:`, error);
      throw error;
    }
  }

  /**
   * 获取最近的讨论
   * @param {string} accountId - 账户ID
   * @param {number} limit - 限制数量
   * @returns {Array}
   */
  getRecentDiscussions(accountId, limit = 20) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM discussions
        WHERE account_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);

      return stmt.all(accountId, limit);
    } catch (error) {
      logger.error(`Failed to get recent discussions for account ${accountId}:`, error);
      return [];
    }
  }
}

module.exports = DiscussionsDAO;
