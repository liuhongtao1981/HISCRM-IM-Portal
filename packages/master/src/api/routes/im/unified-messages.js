/**
 * IM 统一消息 API 路由
 * 提供统一的消息查询接口，整合评论、讨论、私信
 */

const express = require('express');
const UnifiedMessageTransformer = require('../../transformers/unified-message-transformer');
const ResponseWrapper = require('../../transformers/response-wrapper');

function createIMUnifiedMessagesRouter(db) {
  const router = express.Router();

  /**
   * GET /api/im/unified-messages
   * 获取统一消息列表（包含评论、讨论、私信）
   */
  router.get('/', async (req, res) => {
    try {
      const {
        cursor = 0,
        count = 20,
        account_id,
        types, // 'comment,discussion,direct_message'
        is_new,
        is_read,
      } = req.query;

      const offset = parseInt(cursor);
      const limit = parseInt(count);

      // 解析消息类型
      let messageTypes = ['comment', 'discussion', 'direct_message'];
      if (types) {
        messageTypes = types.split(',').map(t => t.trim());
      }

      // 查询选项
      const options = {
        account_id,
        types: messageTypes,
        is_new: is_new !== undefined ? is_new === 'true' : undefined,
        is_read: is_read !== undefined ? is_read === 'true' : undefined,
        limit: limit + 1, // 多查询一条用于判断 has_more
        offset,
      };

      // 获取统一消息列表
      const messages = await UnifiedMessageTransformer.getUnifiedMessages(db, options);

      // 判断是否有更多
      const hasMore = messages.length > limit;
      if (hasMore) {
        messages.pop();
      }

      // 返回响应
      res.json(ResponseWrapper.success(
        { messages },
        {
          cursor: offset + messages.length,
          has_more: hasMore,
        }
      ));
    } catch (error) {
      console.error('[IM Unified Messages API] 获取统一消息列表失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * GET /api/im/unified-messages/stats
   * 获取未读消息统计
   */
  router.get('/stats', (req, res) => {
    try {
      const { account_id } = req.query;

      if (!account_id) {
        return res.status(400).json(ResponseWrapper.error(400, '缺少 account_id 参数'));
      }

      const stats = UnifiedMessageTransformer.getUnreadStats(db, account_id);

      res.json(ResponseWrapper.success(stats));
    } catch (error) {
      console.error('[IM Unified Messages API] 获取未读统计失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * PUT /api/im/unified-messages/:messageId/read
   * 标记消息为已读
   */
  router.put('/:messageId/read', (req, res) => {
    try {
      const { messageId } = req.params;
      const { business_type } = req.body;

      if (!business_type) {
        return res.status(400).json(ResponseWrapper.error(400, '缺少 business_type 参数'));
      }

      const success = UnifiedMessageTransformer.markAsRead(db, business_type, messageId);

      if (!success) {
        return res.status(404).json(ResponseWrapper.error(404, '消息不存在'));
      }

      res.json(ResponseWrapper.success({ marked: true }));
    } catch (error) {
      console.error('[IM Unified Messages API] 标记消息失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  /**
   * PUT /api/im/unified-messages/read-many
   * 批量标记消息为已读
   */
  router.put('/read-many', (req, res) => {
    try {
      const { message_ids, business_type } = req.body;

      if (!message_ids || !Array.isArray(message_ids)) {
        return res.status(400).json(ResponseWrapper.error(400, '缺少或无效的 message_ids 参数'));
      }

      if (!business_type) {
        return res.status(400).json(ResponseWrapper.error(400, '缺少 business_type 参数'));
      }

      const count = UnifiedMessageTransformer.markManyAsRead(db, business_type, message_ids);

      res.json(ResponseWrapper.success({ marked_count: count }));
    } catch (error) {
      console.error('[IM Unified Messages API] 批量标记消息失败:', error);
      res.status(500).json(ResponseWrapper.error(500, error.message));
    }
  });

  return router;
}

module.exports = createIMUnifiedMessagesRouter;
