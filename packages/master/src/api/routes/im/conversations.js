/**
 * IM 兼容层 - 会话API路由
 * 提供与原版 IM 100% 兼容的会话接口
 */

const express = require('express');
const ConversationsDAO = require('../../../database/conversations-dao');
const { ConversationTransformer, ResponseWrapper } = require('../../transformers');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('im-conversations-api');

/**
 * 创建 IM 会话路由
 * @param {Database} db - SQLite数据库实例
 * @returns {Router}
 */
function createIMConversationsRouter(db) {
  const router = express.Router();
  const conversationsDAO = new ConversationsDAO(db);

  /**
   * GET /api/im/conversations - 获取会话列表（IM 格式）
   * Query Parameters:
   * - account_id: 账户ID
   * - status: 会话状态 (active/archived)
   * - is_pinned: 是否置顶 (true/false)
   * - is_muted: 是否免打扰 (true/false)
   * - cursor: 分页游标
   * - count: 每页数量
   */
  router.get('/', (req, res) => {
    try {
      const {
        cursor = 0,
        count = 20,
        account_id,
        status,
        is_pinned,
        is_muted,
      } = req.query;

      if (!account_id) {
        return res.status(400).json(
          ResponseWrapper.error('account_id is required', 400)
        );
      }

      const options = {
        limit: parseInt(count) + parseInt(cursor), // 查询到当前页为止的所有数据
      };

      // 添加过滤条件
      if (status) options.status = status;
      if (is_pinned !== undefined) options.is_pinned = is_pinned === 'true';
      if (is_muted !== undefined) options.is_muted = is_muted === 'true';

      // 查询 Master 会话（默认按置顶排序）
      const masterConversations = conversationsDAO.findByAccount(account_id, options);

      // 转换为 IM 会话格式
      const imConversations = ConversationTransformer.toIMConversationList(masterConversations);

      // 分页处理
      const start = parseInt(cursor) || 0;
      const limit = parseInt(count) || 20;
      const paginatedConversations = imConversations.slice(start, start + limit);
      const hasMore = start + limit < imConversations.length;

      // 返回 IM 格式响应
      res.json(ResponseWrapper.list(paginatedConversations, 'conversations', {
        cursor: start + paginatedConversations.length,
        has_more: hasMore,
      }));

    } catch (error) {
      logger.error('Failed to get conversations:', error);
      res.status(500).json(
        ResponseWrapper.error('Internal server error', 500)
      );
    }
  });

  /**
   * GET /api/im/conversations/:conversationId - 获取单个会话（IM 格式）
   */
  router.get('/:conversationId', (req, res) => {
    try {
      const { conversationId } = req.params;

      // 查询 Master 会话
      const masterConversation = conversationsDAO.findById(conversationId);

      if (!masterConversation) {
        return res.status(404).json(
          ResponseWrapper.error('Conversation not found', 404)
        );
      }

      // 转换为 IM 会话格式
      const imConversation = ConversationTransformer.toIMConversation(masterConversation);

      res.json(ResponseWrapper.success(imConversation));

    } catch (error) {
      logger.error('Failed to get conversation:', error);
      res.status(500).json(
        ResponseWrapper.error('Internal server error', 500)
      );
    }
  });

  /**
   * POST /api/im/conversations - 创建会话（IM 格式）
   */
  router.post('/', (req, res) => {
    try {
      const imConversation = req.body;

      // 转换为 Master 会话格式
      const masterConversation = ConversationTransformer.fromIMConversation(imConversation);

      // 创建会话
      const createdConversation = conversationsDAO.create({
        ...masterConversation,
        created_at: Math.floor(Date.now() / 1000),
      });

      // 转换回 IM 格式
      const result = ConversationTransformer.toIMConversation(createdConversation);

      res.status(201).json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to create conversation:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to create conversation', 500)
      );
    }
  });

  /**
   * PUT /api/im/conversations/:conversationId/read - 标记会话为已读（IM 格式）
   */
  router.put('/:conversationId/read', (req, res) => {
    try {
      const { conversationId } = req.params;

      // 检查会话是否存在
      const existingConversation = conversationsDAO.findById(conversationId);
      if (!existingConversation) {
        return res.status(404).json(
          ResponseWrapper.error('Conversation not found', 404)
        );
      }

      // 标记为已读（重置未读数）
      const updatedConversation = conversationsDAO.update(conversationId, {
        unread_count: 0,
        updated_at: Math.floor(Date.now() / 1000),
      });

      // 转换回 IM 格式
      const result = ConversationTransformer.toIMConversation(updatedConversation);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to mark conversation as read:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to mark conversation as read', 500)
      );
    }
  });

  /**
   * DELETE /api/im/conversations/:conversationId - 删除会话（IM 格式）
   */
  router.delete('/:conversationId', (req, res) => {
    try {
      const { conversationId } = req.params;

      // 检查会话是否存在
      const existingConversation = conversationsDAO.findById(conversationId);
      if (!existingConversation) {
        return res.status(404).json(
          ResponseWrapper.error('Conversation not found', 404)
        );
      }

      // 删除会话
      conversationsDAO.delete(conversationId);

      res.json(ResponseWrapper.success({ deleted: true }));

    } catch (error) {
      logger.error('Failed to delete conversation:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to delete conversation', 500)
      );
    }
  });

  /**
   * PUT /api/im/conversations/:conversationId/pin - 置顶会话
   */
  router.put('/:conversationId/pin', (req, res) => {
    try {
      const { conversationId } = req.params;

      // 检查会话是否存在
      const existingConversation = conversationsDAO.findById(conversationId);
      if (!existingConversation) {
        return res.status(404).json(
          ResponseWrapper.error('Conversation not found', 404)
        );
      }

      // 置顶会话
      conversationsDAO.pinConversation(conversationId);

      // 获取更新后的会话
      const updatedConversation = conversationsDAO.findById(conversationId);
      const result = ConversationTransformer.toIMConversation(updatedConversation);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to pin conversation:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to pin conversation', 500)
      );
    }
  });

  /**
   * DELETE /api/im/conversations/:conversationId/pin - 取消置顶会话
   */
  router.delete('/:conversationId/pin', (req, res) => {
    try {
      const { conversationId } = req.params;

      // 检查会话是否存在
      const existingConversation = conversationsDAO.findById(conversationId);
      if (!existingConversation) {
        return res.status(404).json(
          ResponseWrapper.error('Conversation not found', 404)
        );
      }

      // 取消置顶
      conversationsDAO.unpinConversation(conversationId);

      // 获取更新后的会话
      const updatedConversation = conversationsDAO.findById(conversationId);
      const result = ConversationTransformer.toIMConversation(updatedConversation);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to unpin conversation:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to unpin conversation', 500)
      );
    }
  });

  /**
   * PUT /api/im/conversations/:conversationId/mute - 免打扰会话
   */
  router.put('/:conversationId/mute', (req, res) => {
    try {
      const { conversationId } = req.params;

      // 检查会话是否存在
      const existingConversation = conversationsDAO.findById(conversationId);
      if (!existingConversation) {
        return res.status(404).json(
          ResponseWrapper.error('Conversation not found', 404)
        );
      }

      // 免打扰
      conversationsDAO.muteConversation(conversationId);

      // 获取更新后的会话
      const updatedConversation = conversationsDAO.findById(conversationId);
      const result = ConversationTransformer.toIMConversation(updatedConversation);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to mute conversation:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to mute conversation', 500)
      );
    }
  });

  /**
   * DELETE /api/im/conversations/:conversationId/mute - 取消免打扰会话
   */
  router.delete('/:conversationId/mute', (req, res) => {
    try {
      const { conversationId } = req.params;

      // 检查会话是否存在
      const existingConversation = conversationsDAO.findById(conversationId);
      if (!existingConversation) {
        return res.status(404).json(
          ResponseWrapper.error('Conversation not found', 404)
        );
      }

      // 取消免打扰
      conversationsDAO.unmuteConversation(conversationId);

      // 获取更新后的会话
      const updatedConversation = conversationsDAO.findById(conversationId);
      const result = ConversationTransformer.toIMConversation(updatedConversation);

      res.json(ResponseWrapper.success(result));

    } catch (error) {
      logger.error('Failed to unmute conversation:', error);
      res.status(500).json(
        ResponseWrapper.error('Failed to unmute conversation', 500)
      );
    }
  });

  return router;
}

module.exports = createIMConversationsRouter;
