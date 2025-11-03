/**
 * Cache Data API 路由
 * 提供对 cache_* 表的 HTTP REST API 访问（用于 Admin Web 前端）
 *
 * 端点:
 * - GET /api/v1/cache/comments - 获取缓存评论列表
 * - GET /api/v1/cache/messages - 获取缓存私信列表
 * - GET /api/v1/cache/stats - 获取缓存数据统计
 */

const express = require('express');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('cache-data-api');

/**
 * 创建 Cache Data API 路由
 * @param {Database} db - SQLite 数据库实例
 * @param {CacheDAO} cacheDAO - CacheDAO 实例（可选，提供额外功能）
 * @returns {Router} Express 路由器
 */
function createCacheDataRouter(db, cacheDAO = null) {
  const router = express.Router();

  /**
   * GET /api/v1/cache/comments
   * 获取缓存评论列表
   *
   * 查询参数:
   * - account_id: 账户ID过滤
   * - platform: 平台过滤 (douyin, xiaohongshu)
   * - is_read: 已读状态过滤 (0=未读, 1=已读)
   * - created_at_start: 开始时间戳 (秒)
   * - created_at_end: 结束时间戳 (秒)
   * - sort: 排序字段 (默认: created_at)
   * - order: 排序方向 (asc/desc，默认: desc)
   * - limit: 返回数量 (默认: 100)
   * - offset: 偏移量 (默认: 0)
   */
  router.get('/comments', (req, res) => {
    try {
      const {
        account_id,
        platform,
        is_read,
        created_at_start,
        created_at_end,
        sort = 'created_at',
        order = 'desc',
        limit = 100,
        offset = 0,
      } = req.query;

      // 构建 WHERE 条件
      const conditions = [];
      const params = [];

      if (account_id) {
        conditions.push('account_id = ?');
        params.push(account_id);
      }

      if (platform) {
        conditions.push('platform = ?');
        params.push(platform);
      }

      if (is_read !== undefined) {
        conditions.push('is_read = ?');
        params.push(parseInt(is_read));
      }

      if (created_at_start) {
        conditions.push('created_at >= ?');
        params.push(parseInt(created_at_start) * 1000); // 转换为毫秒
      }

      if (created_at_end) {
        conditions.push('created_at <= ?');
        params.push(parseInt(created_at_end) * 1000); // 转换为毫秒
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 查询评论
      const sql = `
        SELECT
          id,
          account_id,
          platform,
          platform_comment_id,
          content,
          author_name,
          author_id,
          post_title,
          post_id,
          created_at,
          is_read,
          read_at
        FROM cache_comments
        ${whereClause}
        ORDER BY ${sort} ${order.toUpperCase()}
        LIMIT ? OFFSET ?
      `;

      params.push(parseInt(limit), parseInt(offset));

      const comments = db.prepare(sql).all(...params);

      // 转换时间戳为秒（前端兼容）
      const formattedComments = comments.map(comment => ({
        ...comment,
        created_at: Math.floor(comment.created_at / 1000), // 毫秒 → 秒
        read_at: comment.read_at ? Math.floor(comment.read_at / 1000) : null,
      }));

      // 查询总数
      const countSql = `SELECT COUNT(*) as count FROM cache_comments ${whereClause}`;
      const countParams = params.slice(0, -2); // 移除 limit 和 offset
      const { count } = db.prepare(countSql).get(...countParams);

      logger.debug('Fetched cache comments', {
        count: formattedComments.length,
        total: count,
        filters: { account_id, platform, is_read },
      });

      res.json({
        success: true,
        data: formattedComments,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      logger.error('Failed to fetch cache comments:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/v1/cache/messages
   * 获取缓存私信列表
   *
   * 查询参数: 同 /comments
   */
  router.get('/messages', (req, res) => {
    try {
      const {
        account_id,
        platform,
        is_read,
        created_at_start,
        created_at_end,
        sort = 'created_at',
        order = 'desc',
        limit = 100,
        offset = 0,
      } = req.query;

      // 构建 WHERE 条件
      const conditions = [];
      const params = [];

      if (account_id) {
        conditions.push('account_id = ?');
        params.push(account_id);
      }

      if (platform) {
        conditions.push('platform = ?');
        params.push(platform);
      }

      if (is_read !== undefined) {
        conditions.push('is_read = ?');
        params.push(parseInt(is_read));
      }

      if (created_at_start) {
        conditions.push('created_at >= ?');
        params.push(parseInt(created_at_start) * 1000); // 转换为毫秒
      }

      if (created_at_end) {
        conditions.push('created_at <= ?');
        params.push(parseInt(created_at_end) * 1000); // 转换为毫秒
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 查询私信
      const sql = `
        SELECT
          id,
          account_id,
          platform,
          platform_message_id,
          conversation_id,
          content,
          sender_name,
          sender_id,
          direction,
          created_at,
          is_read,
          read_at
        FROM cache_messages
        ${whereClause}
        ORDER BY ${sort} ${order.toUpperCase()}
        LIMIT ? OFFSET ?
      `;

      params.push(parseInt(limit), parseInt(offset));

      const messages = db.prepare(sql).all(...params);

      // 转换时间戳为秒（前端兼容）
      const formattedMessages = messages.map(message => ({
        ...message,
        created_at: Math.floor(message.created_at / 1000), // 毫秒 → 秒
        read_at: message.read_at ? Math.floor(message.read_at / 1000) : null,
      }));

      // 查询总数
      const countSql = `SELECT COUNT(*) as count FROM cache_messages ${whereClause}`;
      const countParams = params.slice(0, -2); // 移除 limit 和 offset
      const { count } = db.prepare(countSql).get(...countParams);

      logger.debug('Fetched cache messages', {
        count: formattedMessages.length,
        total: count,
        filters: { account_id, platform, is_read },
      });

      res.json({
        success: true,
        data: formattedMessages,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      logger.error('Failed to fetch cache messages:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/v1/cache/stats
   * 获取缓存数据统计
   */
  router.get('/stats', (req, res) => {
    try {
      const { account_id } = req.query;

      // 构建 WHERE 条件
      const whereClause = account_id ? 'WHERE account_id = ?' : '';
      const params = account_id ? [account_id] : [];

      // 统计评论
      const commentStats = db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
        FROM cache_comments
        ${whereClause}
      `
        )
        .get(...params);

      // 统计私信
      const messageStats = db
        .prepare(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
        FROM cache_messages
        ${whereClause}
      `
        )
        .get(...params);

      // 今日统计
      const today = Date.now() - (Date.now() % (86400 * 1000));
      const todayParams = account_id ? [today, account_id] : [today];
      const todayWhereClause = account_id
        ? 'WHERE created_at >= ? AND account_id = ?'
        : 'WHERE created_at >= ?';

      const todayComments = db
        .prepare(`SELECT COUNT(*) as count FROM cache_comments ${todayWhereClause}`)
        .get(...todayParams);

      const todayMessages = db
        .prepare(`SELECT COUNT(*) as count FROM cache_messages ${todayWhereClause}`)
        .get(...todayParams);

      const stats = {
        comments: commentStats.total || 0,
        comments_unread: commentStats.unread || 0,
        messages: messageStats.total || 0,
        messages_unread: messageStats.unread || 0,
        today_comments: todayComments.count || 0,
        today_messages: todayMessages.count || 0,
        total: (commentStats.total || 0) + (messageStats.total || 0),
        total_unread: (commentStats.unread || 0) + (messageStats.unread || 0),
      };

      logger.debug('Fetched cache stats', { stats, account_id });

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to fetch cache stats:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

module.exports = createCacheDataRouter;
