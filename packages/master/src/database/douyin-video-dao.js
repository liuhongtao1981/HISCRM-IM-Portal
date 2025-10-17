/**
 * Douyin Video DAO - 抖音作品数据访问对象
 * 用于管理作品表的CRUD操作
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('douyin-video-dao');

class DouyinVideoDAO {
  constructor(db) {
    this.db = db;
  }

  /**
   * 创建或更新作品
   * @param {Object} video - 作品对象
   * @returns {Object} 作品记录
   */
  upsertVideo(video) {
    const {
      account_id,
      platform_user_id,
      aweme_id,
      title,
      cover,
      publish_time,
      total_comment_count = 0,
      like_count = 0,
      share_count = 0,
      play_count = 0,
    } = video;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO douyin_videos (
          account_id, platform_user_id, aweme_id, title, cover, publish_time,
          total_comment_count, like_count, share_count, play_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform_user_id, aweme_id) DO UPDATE SET
          title = excluded.title,
          cover = excluded.cover,
          total_comment_count = excluded.total_comment_count,
          like_count = excluded.like_count,
          share_count = excluded.share_count,
          play_count = excluded.play_count,
          updated_at = strftime('%s', 'now')
      `);

      const result = stmt.run(
        account_id,
        platform_user_id,
        aweme_id,
        title,
        cover,
        publish_time,
        total_comment_count,
        like_count,
        share_count,
        play_count
      );

      logger.info(`Upserted video: ${aweme_id} (${title}) for platform_user ${platform_user_id}`);

      return this.getVideoByAwemeId(aweme_id, platform_user_id);
    } catch (error) {
      logger.error(`Failed to upsert video ${aweme_id}:`, error);
      throw error;
    }
  }

  /**
   * 根据 aweme_id 获取作品
   * @param {string} awemeId - 作品ID
   * @param {string} platformUserId - 平台用户ID（可选）
   * @returns {Object|null} 作品记录
   */
  getVideoByAwemeId(awemeId, platformUserId = null) {
    try {
      let stmt;
      if (platformUserId) {
        stmt = this.db.prepare('SELECT * FROM douyin_videos WHERE aweme_id = ? AND platform_user_id = ?');
        return stmt.get(awemeId, platformUserId);
      } else {
        stmt = this.db.prepare('SELECT * FROM douyin_videos WHERE aweme_id = ?');
        return stmt.get(awemeId);
      }
    } catch (error) {
      logger.error(`Failed to get video ${awemeId}:`, error);
      return null;
    }
  }

  /**
   * 根据账户ID获取所有作品
   * @param {string} accountId - 账户ID
   * @param {Object} options - 查询选项
   * @param {string} options.platform_user_id - 平台用户ID（可选）
   * @returns {Array} 作品列表
   */
  getVideosByAccountId(accountId, options = {}) {
    const { platform_user_id, limit = 100, offset = 0, orderBy = 'created_at DESC' } = options;

    try {
      let sql = 'SELECT * FROM douyin_videos WHERE account_id = ?';
      const params = [accountId];

      // 如果指定了平台用户ID，添加过滤
      if (platform_user_id) {
        sql += ' AND platform_user_id = ?';
        params.push(platform_user_id);
      }

      sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const stmt = this.db.prepare(sql);
      return stmt.all(...params);
    } catch (error) {
      logger.error(`Failed to get videos for account ${accountId}:`, error);
      return [];
    }
  }

  /**
   * 更新作品爬取状态
   * @param {string} awemeId - 作品ID
   * @param {string} status - 爬取状态
   * @param {string} error - 错误信息（可选）
   */
  updateCrawlStatus(awemeId, status, error = null) {
    try {
      const stmt = this.db.prepare(`
        UPDATE douyin_videos
        SET crawl_status = ?,
            crawl_error = ?,
            last_crawl_time = strftime('%s', 'now')
        WHERE aweme_id = ?
      `);

      stmt.run(status, error, awemeId);
      logger.info(`Updated crawl status for video ${awemeId}: ${status}`);
    } catch (error) {
      logger.error(`Failed to update crawl status for video ${awemeId}:`, error);
      throw error;
    }
  }

  /**
   * 更新作品评论数
   * @param {string} awemeId - 作品ID
   * @param {number} newCommentCount - 新评论数
   */
  updateCommentCount(awemeId, newCommentCount) {
    try {
      const stmt = this.db.prepare(`
        UPDATE douyin_videos
        SET new_comment_count = ?,
            total_comment_count = total_comment_count + ?
        WHERE aweme_id = ?
      `);

      stmt.run(newCommentCount, newCommentCount, awemeId);
      logger.info(`Updated comment count for video ${awemeId}: +${newCommentCount}`);
    } catch (error) {
      logger.error(`Failed to update comment count for video ${awemeId}:`, error);
      throw error;
    }
  }

  /**
   * 重置新评论数（已读）
   * @param {string} awemeId - 作品ID
   */
  resetNewCommentCount(awemeId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE douyin_videos
        SET new_comment_count = 0
        WHERE aweme_id = ?
      `);

      stmt.run(awemeId);
      logger.info(`Reset new comment count for video ${awemeId}`);
    } catch (error) {
      logger.error(`Failed to reset new comment count for video ${awemeId}:`, error);
      throw error;
    }
  }

  /**
   * 获取需要爬取的作品（根据时间间隔）
   * @param {number} intervalSeconds - 爬取间隔（秒）
   * @returns {Array} 作品列表
   */
  getVideosToCrawl(intervalSeconds = 1800) {
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const stmt = this.db.prepare(`
        SELECT * FROM douyin_videos
        WHERE last_crawl_time IS NULL
          OR last_crawl_time < ?
        ORDER BY last_crawl_time ASC NULLS FIRST
        LIMIT 50
      `);

      return stmt.all(currentTime - intervalSeconds);
    } catch (error) {
      logger.error('Failed to get videos to crawl:', error);
      return [];
    }
  }

  /**
   * 删除作品
   * @param {string} awemeId - 作品ID
   */
  deleteVideo(awemeId) {
    try {
      const stmt = this.db.prepare('DELETE FROM douyin_videos WHERE aweme_id = ?');
      stmt.run(awemeId);
      logger.info(`Deleted video: ${awemeId}`);
    } catch (error) {
      logger.error(`Failed to delete video ${awemeId}:`, error);
      throw error;
    }
  }

  /**
   * 获取账户的作品统计
   * @param {string} accountId - 账户ID
   * @param {string} platformUserId - 平台用户ID（可选）
   * @returns {Object} 统计信息
   */
  getVideoStats(accountId, platformUserId = null) {
    try {
      let sql = `
        SELECT
          COUNT(*) as total_videos,
          SUM(total_comment_count) as total_comments,
          SUM(new_comment_count) as new_comments,
          SUM(like_count) as total_likes,
          SUM(play_count) as total_plays
        FROM douyin_videos
        WHERE account_id = ?
      `;
      const params = [accountId];

      // 如果指定了平台用户ID，添加过滤
      if (platformUserId) {
        sql += ' AND platform_user_id = ?';
        params.push(platformUserId);
      }

      const stmt = this.db.prepare(sql);
      return stmt.get(...params);
    } catch (error) {
      logger.error(`Failed to get video stats for account ${accountId}:`, error);
      return {
        total_videos: 0,
        total_comments: 0,
        new_comments: 0,
        total_likes: 0,
        total_plays: 0,
      };
    }
  }

  /**
   * 获取指定账号的所有视频ID列表（用于缓存预加载）
   * @param {string} accountId - 账号ID
   * @returns {Array<string>} aweme_id列表
   */
  getAllVideoIds(accountId) {
    try {
      const query = `SELECT aweme_id FROM douyin_videos WHERE account_id = ?`;
      const results = this.db.prepare(query).all(accountId);
      return results.map(row => row.aweme_id);
    } catch (error) {
      logger.error(`Failed to get video IDs for account ${accountId}:`, error);
      return [];
    }
  }
}

module.exports = DouyinVideoDAO;
