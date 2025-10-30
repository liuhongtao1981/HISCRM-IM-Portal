/**
 * IM 统一消息 API 路由
 * 提供统一的消息查询接口，整合评论、讨论、私信
 */

const express = require('express');
const UnifiedMessageTransformer = require('../../transformers/unified-message-transformer');
const ResponseWrapper = require('../../transformers/response-wrapper');

/**
 * 创建 IM 统一消息路由
 * @param {Database} db - SQLite数据库实例
 * @param {DataStore} dataStore - 内存数据存储（可选，用于高性能查询）
 * @returns {Router}
 */
function createIMUnifiedMessagesRouter(db, dataStore = null) {
  const router = express.Router();

  /**
   * GET /api/im/unified-messages
   * 获取统一消息列表（包含评论、讨论、私信）
   * Query Parameters:
   * - account_id: 账户ID（必需）
   * - cursor: 分页游标
   * - count: 每页数量
   * - types: 消息类型列表（逗号分隔：comment,discussion,direct_message）
   * - is_new: 是否新消息
   * - is_read: 是否已读
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

      if (!account_id) {
        return res.status(400).json(ResponseWrapper.error(400, 'account_id is required'));
      }

      const offset = parseInt(cursor);
      const limit = parseInt(count);

      // 解析消息类型
      let messageTypes = ['comment', 'discussion', 'direct_message'];
      if (types) {
        messageTypes = types.split(',').map(t => t.trim());
      }

      let messages;

      // ✅ 优先从 DataStore 聚合数据（内存，高性能）
      if (dataStore) {
        const accountData = dataStore.accounts.get(account_id);
        if (!accountData) {
          return res.json(ResponseWrapper.success({ messages: [] }, { cursor: 0, has_more: false }));
        }

        // 聚合不同类型的消息
        let allMessages = [];

        // 添加评论
        if (messageTypes.includes('comment') || messageTypes.includes('discussion')) {
          const comments = Array.from(accountData.data.comments.values()).map(c => ({
            ...c,
            business_type: 'comment',
            message_type: 'comment',
            created_at: c.createdAt,
          }));
          allMessages.push(...comments);
        }

        // 添加私信
        if (messageTypes.includes('direct_message')) {
          const directMessages = Array.from(accountData.data.messages.values()).map(m => ({
            ...m,
            business_type: 'direct_message',
            message_type: 'direct_message',
            created_at: new Date(m.createdAt).getTime() / 1000, // 转为秒时间戳
          }));
          allMessages.push(...directMessages);
        }

        // 过滤条件
        if (is_new !== undefined) {
          allMessages = allMessages.filter(m => m.status === (is_new === 'true' ? 'new' : 'read'));
        }
        if (is_read !== undefined) {
          allMessages = allMessages.filter(m => m.is_read === (is_read === 'true'));
        }

        // 按时间排序（倒序）
        allMessages.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        // 分页
        messages = allMessages.slice(offset, offset + limit);

        console.log(`[IM Unified Messages API] Fetched ${messages.length} unified messages from DataStore for ${account_id}`);
      } else {
        // ⚠️ 降级到数据库查询（兼容性保留）
        const options = {
          account_id,
          types: messageTypes,
          is_new: is_new !== undefined ? is_new === 'true' : undefined,
          is_read: is_read !== undefined ? is_read === 'true' : undefined,
          limit: limit + 1,
          offset,
        };

        messages = await UnifiedMessageTransformer.getUnifiedMessages(db, options);

        // 判断是否有更多
        const hasMore = messages.length > limit;
        if (hasMore) {
          messages.pop();
        }

        console.log(`[IM Unified Messages API] Fetched ${messages.length} unified messages from database for ${account_id}`);
      }

      // 计算分页信息
      const hasMore = messages.length >= limit;

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
   * Query Parameters:
   * - account_id: 账户ID（必需）
   */
  router.get('/stats', (req, res) => {
    try {
      const { account_id } = req.query;

      if (!account_id) {
        return res.status(400).json(ResponseWrapper.error(400, '缺少 account_id 参数'));
      }

      let stats;

      // ✅ 优先从 DataStore 计算统计（内存，高性能）
      if (dataStore) {
        const accountData = dataStore.accounts.get(account_id);
        if (!accountData) {
          stats = {
            total_unread: 0,
            unread_comments: 0,
            unread_discussions: 0,
            unread_direct_messages: 0,
          };
        } else {
          // 计算未读数
          const unreadComments = Array.from(accountData.data.comments.values()).filter(c => c.status === 'new').length;
          const unreadMessages = Array.from(accountData.data.messages.values()).filter(m => m.status === 'unread').length;

          stats = {
            total_unread: unreadComments + unreadMessages,
            unread_comments: unreadComments,
            unread_discussions: unreadComments, // 暂时与 comments 相同
            unread_direct_messages: unreadMessages,
          };
        }

        console.log(`[IM Unified Messages API] Calculated stats from DataStore for ${account_id}:`, stats);
      } else {
        // ⚠️ 降级到数据库查询（兼容性保留）
        stats = UnifiedMessageTransformer.getUnreadStats(db, account_id);
        console.log(`[IM Unified Messages API] Fetched stats from database for ${account_id}`);
      }

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
