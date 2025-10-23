/**
 * IM 兼容层 - 消息API路由
 * 提供与原版 IM 100% 兼容的消息接口
 */

const express = require('express');
const MessagesDAO = require('../../../database/messages-dao');
const { MessageTransformer, ResponseWrapper } = require('../../transformers');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('im-messages-api');

/**
 * 创建 IM 消息路由
 * @param {Database} db - SQLite数据库实例
 * @returns {Router}
 */
function createIMMessagesRouter(db) {
  const router = express.Router();
  const messagesDAO = new MessagesDAO(db);

  /**
   * GET /api/im/messages - 获取消息列表（IM 格式）
   * 支持按会话、用户等过滤
   * Query Parameters:
   * - conversation_id: 会话ID
   * - sender_id: 发送者ID
   * - receiver_id: 接收者ID
   * - status: 消息状态 (sending/sent/delivered/read/failed)
   * - message_type: 消息类型 (text/image/video/audio/file/link)
   * - is_deleted: 是否已删除 (true/false)
   * - is_recalled: 是否已撤回 (true/false)
   * - since_time: 起始时间（毫秒时间戳）
   * - cursor: 分页游标
   * - count: 每页数量
   */
  router.get('/', (req, res) => {
    try {
      const {
        cursor = 0,
        count = 20,
        conversation_id,
        sender_id,
        receiver_id,
        status,
        message_type,
        is_deleted,
        is_recalled,
        since_time,
      } = req.query;

      const filters = {};
      if (conversation_id) filters.conversation_id = conversation_id;
      if (sender_id) filters.sender_id = sender_id;
      if (receiver_id) filters.receiver_id = receiver_id;
      if (status) filters.status = status;
      if (message_type) filters.message_type = message_type;
      if (is_deleted !== undefined) filters.is_deleted = is_deleted === 'true';
      if (is_recalled !== undefined) filters.is_recalled = is_recalled === 'true';
      if (since_time) {
        // 时间戳转换：毫秒 → 秒
        filters.since_timestamp = Math.floor(parseInt(since_time) / 1000);
      }

      // 查询 Master 消息
      const masterMessages = messagesDAO.findAll(filters);

      // 转换为 IM 消息格式
      const imMessages = MessageTransformer.toIMMessageList(masterMessages);

      // 分页处理
      const start = parseInt(cursor) || 0;
      const limit = parseInt(count) || 20;
      const paginatedMessages = imMessages.slice(start, start + limit);
      const hasMore = start + limit < imMessages.length;

      // 返回 IM 格式响应
      res.json(ResponseWrapper.list(paginatedMessages, 'messages', {
        cursor: start + paginatedMessages.length,
        has_more: hasMore,
      }));

    } catch (error) {
      logger.error('Failed to get messages:', error);
      res.status(500).json(
        ResponseWrapper.error('Internal server error', 500)
      );
    }
  });

  /**
   * GET /api/im/messages/:messageId - 获取单条消息（IM 格式）
   */
  router.get('/:messageId', (req, res) => {
    try {
      const { messageId } = req.params;

      // 查询 Master 消息
      const masterMessage = messagesDAO.findById(messageId);

      if (!masterMessage) {
        return res.status(404).json(
          ResponseWrapper.error('Message not found', 404)
        );
      }

      // 转换为 IM 消息格式
      const imMessage = MessageTransformer.toIMMessage(masterMessage);

      res.json(ResponseWrapper.success(imMessage));

    } catch (error) {
      logger.error('Failed to get message:', error);
      res.status(500).json(
        ResponseWrapper.error('Internal server error', 500)
      );
    }
  });

  /**
   * POST /api/im/messages - 发送消息（IM 格式）
   */
  router.post('/', (req, res) => {
    try {
      const imMessage = req.body;

      // 转换为 Master 消息格式
      const masterMessage = MessageTransformer.fromIMMessage(imMessage);

      // 创建消息
      const createdMessage = messagesDAO.create({
        ...masterMessage,
        timestamp: Math.floor(Date.now() / 1000),
        status: 'sent',
      });

      // 转换回 IM 格式
      const result = MessageTransformer.toIMMessage(createdMessage);

      res.status(201).json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to send message:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to send message', 500)
      );
    }
  });

  /**
   * PUT /api/im/messages/:messageId/read - 标记消息为已读（IM 格式）
   */
  router.put('/:messageId/read', (req, res) => {
    try {
      const { messageId } = req.params;

      // 检查消息是否存在
      const existingMessage = messagesDAO.findById(messageId);
      if (!existingMessage) {
        return res.status(404).json(
          ResponseWrapper.error('Message not found', 404)
        );
      }

      // 标记为已读
      messagesDAO.update(messageId, {
        is_read: true,
        status: 'read',
      });

      // 重新查询更新后的消息
      const updatedMessage = messagesDAO.findById(messageId);

      // 转换回 IM 格式
      const result = MessageTransformer.toIMMessage(updatedMessage);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to mark message as read:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to mark message as read', 500)
      );
    }
  });

  /**
   * DELETE /api/im/messages/:messageId - 删除消息（IM 格式）
   */
  router.delete('/:messageId', (req, res) => {
    try {
      const { messageId } = req.params;

      // 检查消息是否存在
      const existingMessage = messagesDAO.findById(messageId);
      if (!existingMessage) {
        return res.status(404).json(
          ResponseWrapper.error('Message not found', 404)
        );
      }

      // 删除消息
      messagesDAO.delete(messageId);

      res.json(ResponseWrapper.success({ deleted: true }));

    } catch (error) {
      logger.error('Failed to delete message:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to delete message', 500)
      );
    }
  });

  /**
   * GET /api/im/conversations/:conversationId/messages - 获取会话消息（IM 格式）
   * 便捷路由，直接获取特定会话的消息
   */
  router.get('/conversations/:conversationId/messages', (req, res) => {
    try {
      const { conversationId } = req.params;
      const {
        cursor = 0,
        count = 50,
        since_time,
      } = req.query;

      const filters = {
        conversation_id: conversationId,
      };

      if (since_time) {
        filters.since_timestamp = Math.floor(parseInt(since_time) / 1000);
      }

      // 查询 Master 消息
      const masterMessages = messagesDAO.findAll(filters);

      // 转换为 IM 消息格式
      const imMessages = MessageTransformer.toIMMessageList(masterMessages);

      // 分页处理
      const start = parseInt(cursor) || 0;
      const limit = parseInt(count) || 50;
      const paginatedMessages = imMessages.slice(start, start + limit);
      const hasMore = start + limit < imMessages.length;

      // 返回 IM 格式响应
      res.json(ResponseWrapper.list(paginatedMessages, 'messages', {
        cursor: start + paginatedMessages.length,
        has_more: hasMore,
      }));

    } catch (error) {
      logger.error('Failed to get conversation messages:', error);
      res.status(500).json(
        ResponseWrapper.error('Internal server error', 500)
      );
    }
  });

  /**
   * PUT /api/im/messages/:messageId/status - 更新消息状态
   * Body: { status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' }
   */
  router.put('/:messageId/status', (req, res) => {
    try {
      const { messageId } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json(
          ResponseWrapper.error('status is required', 400)
        );
      }

      // 检查消息是否存在
      const existingMessage = messagesDAO.findById(messageId);
      if (!existingMessage) {
        return res.status(404).json(
          ResponseWrapper.error('Message not found', 404)
        );
      }

      // 更新状态
      messagesDAO.updateStatus(messageId, status);

      // 获取更新后的消息
      const updatedMessage = messagesDAO.findById(messageId);
      const result = MessageTransformer.toIMMessage(updatedMessage);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to update message status:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to update message status', 500)
      );
    }
  });

  /**
   * PUT /api/im/messages/:messageId/recall - 撤回消息
   */
  router.put('/:messageId/recall', (req, res) => {
    try {
      const { messageId } = req.params;

      // 检查消息是否存在
      const existingMessage = messagesDAO.findById(messageId);
      if (!existingMessage) {
        return res.status(404).json(
          ResponseWrapper.error('Message not found', 404)
        );
      }

      // 撤回消息
      messagesDAO.recallMessage(messageId);

      // 获取更新后的消息
      const updatedMessage = messagesDAO.findById(messageId);
      const result = MessageTransformer.toIMMessage(updatedMessage);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to recall message:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to recall message', 500)
      );
    }
  });

  return router;
}

module.exports = createIMMessagesRouter;
