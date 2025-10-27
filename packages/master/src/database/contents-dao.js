/**
 * Works DAO - 作品数据访问对象
 * 通用作品管理，支持多平台多类型作品（视频/图文/音频等）
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { v4: uuidv4 } = require('uuid');

const logger = createLogger('contents-dao');

class ContentsDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 插入单个作品
   * @param {Object} work - 作品对象
   * @returns {string} 作品ID
   */
  insert(work) {
    try {
      const {
        id = uuidv4(),
        account_id,
        platform,
        platform_content_id,
        platform_user_id,
        content_type,
        title,
        description,
        cover,
        url,
        publish_time,
        stats_comment_count = 0,
        stats_new_comment_count = 0,
        stats_like_count = 0,
        stats_share_count = 0,
        stats_view_count = 0,
        last_crawl_time,
        crawl_status = 'pending',
        crawl_error,
        is_new = 1,
        push_count = 0,
        created_at = Math.floor(Date.now() / 1000),
        updated_at = Math.floor(Date.now() / 1000),
      } = work;

      // 验证必需字段
      if (!account_id || !platform || !platform_content_id || !content_type) {
        throw new Error('Missing required fields: account_id, platform, platform_content_id, content_type');
      }

      // 验证 content_type
      const validTypes = ['video', 'article', 'image', 'audio', 'text'];
      if (!validTypes.includes(content_type)) {
        throw new Error(`Invalid content_type: ${content_type}. Must be one of: ${validTypes.join(', ')}`);
      }

      const stmt = this.db.prepare(`
        INSERT INTO contents (
          id, account_id, platform, platform_content_id, platform_user_id,
          content_type, title, description, cover, url, publish_time,
          stats_comment_count, stats_new_comment_count, stats_like_count, stats_share_count, stats_view_count,
          last_crawl_time, crawl_status, crawl_error,
          is_new, push_count, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id, account_id, platform, platform_content_id, platform_user_id,
        content_type, title, description, cover, url, publish_time,
        stats_comment_count, stats_new_comment_count, stats_like_count, stats_share_count, stats_view_count,
        last_crawl_time, crawl_status, crawl_error,
        is_new, push_count, created_at, updated_at
      );

      logger.info(`Work inserted: ${id} (${platform}/${content_type}: ${title || platform_content_id})`);
      return id;
    } catch (error) {
      // 检查是否是唯一约束冲突
      if (error.message.includes('UNIQUE constraint')) {
        logger.warn(`Work already exists: ${work.platform}/${work.platform_content_id} for account ${work.account_id}`);
        // 返回现有作品的ID
        const existing = this.findByPlatformWorkId(work.account_id, work.platform, work.platform_content_id);
        return existing ? existing.id : null;
      }
      logger.error('Failed to insert work:', error);
      throw error;
    }
  }

  /**
   * 批量插入作品
   * @param {Array} contents - 作品数组
   * @returns {Object} 插入结果统计
   */
  bulkInsert(contents) {
    if (!Array.isArray(contents) || contents.length === 0) {
      logger.warn('No contents to insert');
      return { inserted: 0, skipped: 0, failed: 0 };
    }

    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    const transaction = this.db.transaction((worksToInsert) => {
      for (const work of worksToInsert) {
        try {
          const id = this.insert(work);
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
            logger.error(`Failed to insert work ${work.platform_content_id}:`, error.message);
          }
        }
      }
    });

    try {
      transaction(contents);
      logger.info(`Bulk insert completed: ${inserted} inserted, ${skipped} skipped, ${failed} failed`);
      return { inserted, skipped, failed };
    } catch (error) {
      logger.error('Bulk insert transaction failed:', error);
      throw error;
    }
  }

  /**
   * 根据ID查询作品
   * @param {string} id - 作品ID
   * @returns {Object|null}
   */
  findById(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM contents WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      logger.error(`Failed to find work by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * 根据平台作品ID查询（唯一约束查询）
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台名称
   * @param {string} platformWorkId - 平台作品ID
   * @returns {Object|null}
   */
  findByPlatformWorkId(accountId, platform, platformWorkId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM contents
        WHERE account_id = ? AND platform = ? AND platform_content_id = ?
      `);
      return stmt.get(accountId, platform, platformWorkId);
    } catch (error) {
      logger.error(`Failed to find work by platform work ID:`, error);
      return null;
    }
  }

  /**
   * 根据账户ID查询作品
   * @param {string} accountId - 账户ID
   * @param {Object} options - 查询选项
   * @returns {Array}
   */
  findByAccount(accountId, options = {}) {
    const {
      platform,
      content_type,
      is_new,
      crawl_status,
      limit = 100,
      offset = 0,
      orderBy = 'created_at DESC',
    } = options;

    try {
      let sql = 'SELECT * FROM contents WHERE account_id = ?';
      const params = [accountId];

      if (platform) {
        sql += ' AND platform = ?';
        params.push(platform);
      }

      if (content_type) {
        sql += ' AND content_type = ?';
        params.push(content_type);
      }

      if (is_new !== undefined) {
        sql += ' AND is_new = ?';
        params.push(is_new ? 1 : 0);
      }

      if (crawl_status) {
        sql += ' AND crawl_status = ?';
        params.push(crawl_status);
      }

      sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error(`Failed to find contents by account ${accountId}:`, error);
      return [];
    }
  }

  /**
   * 根据平台查询作品
   * @param {string} platform - 平台名称
   * @param {Object} options - 查询选项
   * @returns {Array}
   */
  findByPlatform(platform, options = {}) {
    const { content_type, limit = 100, offset = 0 } = options;

    try {
      let sql = 'SELECT * FROM contents WHERE platform = ?';
      const params = [platform];

      if (content_type) {
        sql += ' AND content_type = ?';
        params.push(content_type);
      }

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error(`Failed to find contents by platform ${platform}:`, error);
      return [];
    }
  }

  /**
   * 根据作品类型查询
   * @param {string} workType - 作品类型
   * @param {Object} options - 查询选项
   * @returns {Array}
   */
  findByWorkType(workType, options = {}) {
    const { limit = 100, offset = 0 } = options;

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM contents
        WHERE content_type = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);
      return stmt.all(workType, limit, offset);
    } catch (error) {
      logger.error(`Failed to find contents by type ${workType}:`, error);
      return [];
    }
  }

  /**
   * 更新作品信息
   * @param {string} id - 作品ID
   * @param {Object} updates - 更新字段
   * @returns {boolean}
   */
  update(id, updates) {
    try {
      const allowedFields = [
        'title', 'description', 'cover', 'url', 'publish_time',
        'stats_comment_count', 'stats_new_comment_count', 'stats_like_count', 'stats_share_count', 'stats_view_count',
        'last_crawl_time', 'crawl_status', 'crawl_error',
        'is_new', 'push_count', 'updated_at',
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

      // 自动更新 updated_at
      if (!updates.updated_at) {
        fields.push('updated_at = ?');
        values.push(Math.floor(Date.now() / 1000));
      }

      values.push(id);

      const sql = `UPDATE contents SET ${fields.join(', ')} WHERE id = ?`;
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...values);

      logger.info(`Work updated: ${id}, changes: ${result.changes}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update work ${id}:`, error);
      throw error;
    }
  }

  /**
   * 删除作品
   * @param {string} id - 作品ID
   * @returns {boolean}
   */
  delete(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM contents WHERE id = ?');
      const result = stmt.run(id);

      logger.info(`Work deleted: ${id}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to delete work ${id}:`, error);
      throw error;
    }
  }

  /**
   * 获取作品统计
   * @param {string} accountId - 账户ID
   * @param {Object} options - 过滤选项
   * @returns {Object}
   */
  getWorkStats(accountId, options = {}) {
    const { platform, content_type } = options;

    try {
      let sql = `
        SELECT
          COUNT(*) as total_contents,
          SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_works,
          SUM(stats_comment_count) as total_comments,
          SUM(stats_new_comment_count) as new_comments,
          SUM(stats_like_count) as total_likes,
          SUM(stats_share_count) as total_shares,
          SUM(stats_view_count) as total_views
        FROM contents
        WHERE account_id = ?
      `;
      const params = [accountId];

      if (platform) {
        sql += ' AND platform = ?';
        params.push(platform);
      }

      if (content_type) {
        sql += ' AND content_type = ?';
        params.push(content_type);
      }

      const stmt = this.db.prepare(sql);
      return stmt.get(...params) || {
        total_contents: 0,
        new_works: 0,
        total_comments: 0,
        new_comments: 0,
        total_likes: 0,
        total_shares: 0,
        total_views: 0,
      };
    } catch (error) {
      logger.error(`Failed to get work stats for account ${accountId}:`, error);
      return {
        total_contents: 0,
        new_works: 0,
        total_comments: 0,
        new_comments: 0,
        total_likes: 0,
        total_shares: 0,
        total_views: 0,
      };
    }
  }

  /**
   * 更新评论数
   * @param {string} workId - 作品ID
   * @param {number} count - 评论数增量
   * @returns {boolean}
   */
  updateCommentCount(workId, count) {
    try {
      const stmt = this.db.prepare(`
        UPDATE contents
        SET stats_comment_count = stats_comment_count + ?,
            stats_new_comment_count = stats_new_comment_count + ?,
            updated_at = ?
        WHERE id = ?
      `);

      const result = stmt.run(count, count, Math.floor(Date.now() / 1000), workId);
      logger.info(`Updated comment count for work ${workId}: +${count}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update comment count for work ${workId}:`, error);
      throw error;
    }
  }

  /**
   * 更新浏览数
   * @param {string} workId - 作品ID
   * @param {number} count - 浏览数
   * @returns {boolean}
   */
  updateViewCount(workId, count) {
    try {
      const stmt = this.db.prepare(`
        UPDATE contents
        SET stats_view_count = ?,
            updated_at = ?
        WHERE id = ?
      `);

      const result = stmt.run(count, Math.floor(Date.now() / 1000), workId);
      logger.info(`Updated view count for work ${workId}: ${count}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update view count for work ${workId}:`, error);
      throw error;
    }
  }

  /**
   * 更新爬取状态
   * @param {string} workId - 作品ID
   * @param {string} status - 爬取状态
   * @param {string} error - 错误信息
   * @returns {boolean}
   */
  updateCrawlStatus(workId, status, error = null) {
    try {
      const stmt = this.db.prepare(`
        UPDATE contents
        SET crawl_status = ?,
            crawl_error = ?,
            last_crawl_time = ?,
            updated_at = ?
        WHERE id = ?
      `);

      const now = Math.floor(Date.now() / 1000);
      const result = stmt.run(status, error, now, now, workId);

      logger.info(`Updated crawl status for work ${workId}: ${status}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to update crawl status for work ${workId}:`, error);
      throw error;
    }
  }

  /**
   * 获取待爬取的作品
   * @param {number} limit - 限制数量
   * @param {number} intervalSeconds - 爬取间隔（秒）
   * @returns {Array}
   */
  getPendingWorks(limit = 50, intervalSeconds = 1800) {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const stmt = this.db.prepare(`
        SELECT * FROM contents
        WHERE crawl_status = 'pending'
          OR (last_crawl_time IS NOT NULL AND last_crawl_time < ?)
        ORDER BY last_crawl_time ASC NULLS FIRST
        LIMIT ?
      `);

      return stmt.all(currentTime - intervalSeconds, limit);
    } catch (error) {
      logger.error('Failed to get pending contents:', error);
      return [];
    }
  }

  /**
   * 重置新评论数（标记为已读）
   * @param {string} workId - 作品ID
   * @returns {boolean}
   */
  resetNewCommentCount(workId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE contents
        SET stats_new_comment_count = 0,
            is_new = 0,
            updated_at = ?
        WHERE id = ?
      `);

      const result = stmt.run(Math.floor(Date.now() / 1000), workId);
      logger.info(`Reset new comment count for work ${workId}`);
      return result.changes > 0;
    } catch (error) {
      logger.error(`Failed to reset new comment count for work ${workId}:`, error);
      throw error;
    }
  }

  /**
   * 获取账户的所有作品ID列表
   * @param {string} accountId - 账户ID
   * @param {string} platform - 平台名称（可选）
   * @returns {Array<string>}
   */
  getAllWorkIds(accountId, platform = null) {
    try {
      let sql = 'SELECT platform_content_id FROM contents WHERE account_id = ?';
      const params = [accountId];

      if (platform) {
        sql += ' AND platform = ?';
        params.push(platform);
      }

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params);
      return results.map(row => row.platform_content_id);
    } catch (error) {
      logger.error(`Failed to get work IDs for account ${accountId}:`, error);
      return [];
    }
  }

  /**
   * 标记作品为已读
   * @param {string} workId - 作品ID
   * @returns {boolean}
   */
  markAsRead(workId) {
    return this.update(workId, {
      is_new: 0,
      stats_new_comment_count: 0,
      updated_at: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * 批量标记作品为已读
   * @param {Array<string>} workIds - 作品ID数组
   * @returns {number} 更新数量
   */
  bulkMarkAsRead(workIds) {
    if (!Array.isArray(workIds) || workIds.length === 0) {
      return 0;
    }

    try {
      const placeholders = workIds.map(() => '?').join(',');
      const stmt = this.db.prepare(`
        UPDATE contents
        SET is_new = 0,
            stats_new_comment_count = 0,
            updated_at = ?
        WHERE id IN (${placeholders})
      `);

      const result = stmt.run(Math.floor(Date.now() / 1000), ...workIds);
      logger.info(`Bulk marked ${result.changes} contents as read`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to bulk mark contents as read:', error);
      throw error;
    }
  }
}

module.exports = ContentsDAO;
