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

      // 注意: platform 过滤需要在 JavaScript 层面处理，因为它在 JSON data 中
      // 这里先不在 SQL 中过滤，稍后会在结果中过滤

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

      // 查询评论 - 获取 id, account_id, data, created_at, is_read, read_at
      const sql = `
        SELECT
          id,
          account_id,
          data,
          created_at,
          is_read,
          read_at
        FROM cache_comments
        ${whereClause}
        ORDER BY ${sort} ${order.toUpperCase()}
        LIMIT ? OFFSET ?
      `;

      params.push(parseInt(limit), parseInt(offset));

      const rawComments = db.prepare(sql).all(...params);

      // 解析 JSON data 并构建前端需要的格式
      let formattedComments = rawComments.map(row => {
        let commentData = {};
        try {
          commentData = JSON.parse(row.data);
        } catch (e) {
          logger.warn('Failed to parse comment data JSON', { id: row.id, error: e.message });
        }

        return {
          id: row.id,
          account_id: row.account_id,
          platform: commentData.platform || 'unknown',
          platform_comment_id: commentData.id || commentData.platformCommentId || '',
          content: commentData.content || '',
          author_name: commentData.authorName || '',
          author_id: commentData.authorId || '',
          post_title: commentData.postTitle || commentData.contentTitle || '',
          post_id: commentData.contentId || commentData.postId || '',
          created_at: row.created_at, // 数据库已存储秒级时间戳
          is_read: row.is_read,
          read_at: row.read_at || null,
        };
      });

      // 在 JavaScript 中进行 platform 过滤（如果需要）
      if (platform) {
        formattedComments = formattedComments.filter(c => c.platform === platform);
      }

      // 查询总数（不包括 platform 过滤）
      const countSql = `SELECT COUNT(*) as count FROM cache_comments ${whereClause}`;
      const countParams = params.slice(0, -2); // 移除 limit 和 offset
      let { count } = db.prepare(countSql).get(...countParams);

      // 如果有 platform 过滤，需要重新计算总数
      if (platform) {
        // 这种情况下我们需要获取所有记录来准确计数（性能考虑：应该使用 json_extract）
        // 为了简化，这里使用已过滤的结果长度
        // TODO: 优化为使用 SQLite json_extract 在数据库层面过滤
        count = formattedComments.length;
      }

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

      // 注意: platform 过滤需要在 JavaScript 层面处理，因为它在 JSON data 中
      // 这里先不在 SQL 中过滤，稍后会在结果中过滤

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

      // 查询私信 - 获取 id, account_id, data, created_at, is_read, read_at
      const sql = `
        SELECT
          id,
          account_id,
          data,
          created_at,
          is_read,
          read_at
        FROM cache_messages
        ${whereClause}
        ORDER BY ${sort} ${order.toUpperCase()}
        LIMIT ? OFFSET ?
      `;

      params.push(parseInt(limit), parseInt(offset));

      const rawMessages = db.prepare(sql).all(...params);

      // 解析 JSON data 并构建前端需要的格式
      let formattedMessages = rawMessages.map(row => {
        let messageData = {};
        try {
          messageData = JSON.parse(row.data);
        } catch (e) {
          logger.warn('Failed to parse message data JSON', { id: row.id, error: e.message });
        }

        // 转换时间戳：如果是 ISO 8601 字符串，转换为秒级时间戳
        let createdAtTimestamp = row.created_at;
        let readAtTimestamp = row.read_at;

        if (typeof row.created_at === 'string') {
          createdAtTimestamp = Math.floor(new Date(row.created_at).getTime() / 1000);
        }
        if (row.read_at && typeof row.read_at === 'string') {
          readAtTimestamp = Math.floor(new Date(row.read_at).getTime() / 1000);
        }

        // ⭐ 统一消息方向命名: incoming → inbound, outgoing → outbound
        let normalizedDirection = messageData.direction || 'inbound';
        if (normalizedDirection === 'incoming') {
          normalizedDirection = 'inbound';
        } else if (normalizedDirection === 'outgoing') {
          normalizedDirection = 'outbound';
        }

        return {
          id: row.id,
          account_id: row.account_id,
          platform: messageData.platform || 'unknown',
          platform_message_id: messageData.id || messageData.platformMessageId || '',
          conversation_id: messageData.conversationId || '',
          content: messageData.content || '',
          sender_name: messageData.senderName || '',
          sender_id: messageData.senderId || '',
          direction: normalizedDirection,
          created_at: createdAtTimestamp, // 统一为秒级时间戳
          is_read: row.is_read,
          read_at: readAtTimestamp || null,
          data: messageData, // ⭐ 返回完整的 data 对象（包含 rawData）
        };
      });

      // 在 JavaScript 中进行 platform 过滤（如果需要）
      if (platform) {
        formattedMessages = formattedMessages.filter(m => m.platform === platform);
      }

      // 查询总数（不包括 platform 过滤）
      const countSql = `SELECT COUNT(*) as count FROM cache_messages ${whereClause}`;
      const countParams = params.slice(0, -2); // 移除 limit 和 offset
      let { count } = db.prepare(countSql).get(...countParams);

      // 如果有 platform 过滤，需要重新计算总数
      if (platform) {
        // 这种情况下我们需要获取所有记录来准确计数（性能考虑：应该使用 json_extract）
        // 为了简化，这里使用已过滤的结果长度
        // TODO: 优化为使用 SQLite json_extract 在数据库层面过滤
        count = formattedMessages.length;
      }

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
