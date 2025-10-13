/**
 * Messages API Routes
 * T080: 消息查询和管理端点
 */

const express = require('express');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const CommentsDAO = require('../../database/comments-dao');
const DirectMessagesDAO = require('../../database/messages-dao');

const logger = createLogger('messages-api');

/**
 * 创建消息路由
 * @param {Database} db - SQLite 数据库实例
 * @returns {express.Router}
 */
function createMessagesRouter(db) {
  const router = express.Router();
  const commentsDAO = new CommentsDAO(db);
  const messagesDAO = new DirectMessagesDAO(db);

  /**
   * GET /api/v1/messages
   * 查询消息历史（评论和私信）
   *
   * Query Parameters:
   * - account_id: 账户ID筛选
   * - type: 消息类型筛选 (comment | direct_message)
   * - start_time: 开始时间（Unix时间戳）
   * - end_time: 结束时间（Unix时间戳）
   * - is_read: 已读状态筛选 (true | false)
   * - page: 页码（默认1）
   * - limit: 每页数量（默认20）
   */
  router.get('/', async (req, res) => {
    try {
      const {
        account_id,
        type,
        start_time,
        end_time,
        is_read,
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const offset = (pageNum - 1) * limitNum;

      // 构建查询过滤器
      const filters = {};
      if (account_id) filters.account_id = account_id;
      if (start_time) filters.start_time = parseInt(start_time, 10);
      if (end_time) filters.end_time = parseInt(end_time, 10);
      if (is_read !== undefined) filters.is_read = is_read === 'true';

      let messages = [];
      let total = 0;

      if (!type || type === 'comment') {
        // 查询评论
        const comments = commentsDAO.findAll({
          ...filters,
          limit: limitNum * 2, // 查询更多以便合并排序
        });

        messages.push(
          ...comments.map((c) => ({
            ...c,
            type: 'comment',
          }))
        );
      }

      if (!type || type === 'direct_message') {
        // 查询私信
        const directMessages = messagesDAO.findAll({
          ...filters,
          limit: limitNum * 2,
        });

        messages.push(
          ...directMessages.map((dm) => ({
            ...dm,
            type: 'direct_message',
          }))
        );
      }

      // 按时间倒序排序
      messages.sort((a, b) => b.detected_at - a.detected_at);

      // 统计总数
      let commentCount = 0;
      let dmCount = 0;

      if (!type || type === 'comment') {
        commentCount = commentsDAO.count(filters);
      }

      if (!type || type === 'direct_message') {
        dmCount = messagesDAO.count(filters);
      }

      total = commentCount + dmCount;

      // 分页切片
      const paginatedMessages = messages.slice(offset, offset + limitNum);

      res.json({
        success: true,
        data: {
          messages: paginatedMessages,
          total,
          page: pageNum,
          limit: limitNum,
          total_pages: Math.ceil(total / limitNum),
        },
      });

      logger.info(
        `Messages queried: ${paginatedMessages.length} messages (page ${pageNum}, total ${total})`
      );
    } catch (error) {
      logger.error('Failed to query messages:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to query messages',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/v1/messages/:id/read
   * 标记消息为已读
   *
   * Body:
   * - type: 消息类型 (comment | direct_message)
   */
  router.post('/:id/read', async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.body;

      if (!type) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: type',
        });
      }

      let message;

      if (type === 'comment') {
        message = commentsDAO.findById(id);
        if (!message) {
          return res.status(404).json({
            success: false,
            error: 'Comment not found',
          });
        }
        commentsDAO.markAsRead([id]);
      } else if (type === 'direct_message') {
        message = messagesDAO.findById(id);
        if (!message) {
          return res.status(404).json({
            success: false,
            error: 'Direct message not found',
          });
        }
        messagesDAO.markAsRead([id]);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid message type',
        });
      }

      res.json({
        success: true,
        data: {
          id,
          type,
          is_read: true,
        },
      });

      logger.info(`Message marked as read: ${type} ${id}`);
    } catch (error) {
      logger.error('Failed to mark message as read:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark message as read',
        message: error.message,
      });
    }
  });

  return router;
}

module.exports = createMessagesRouter;
