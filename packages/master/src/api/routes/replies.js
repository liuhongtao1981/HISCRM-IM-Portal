/**
 * 回复功能API路由
 * 处理客户端的回复请求
 */

const express = require('express');
const ReplyDAO = require('../../database/reply-dao');
const AccountsDAO = require('../../database/accounts-dao');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('replies-api');

/**
 * 创建回复路由
 * @param {Database} db - SQLite数据库实例
 * @param {Object} options - 配置选项
 * @param {Function} options.getSocketServer - 获取 Socket 服务器的函数
 * @returns {Router}
 */
function createRepliesRouter(db, options = {}) {
  const router = express.Router();
  const replyDAO = new ReplyDAO(db);
  const accountsDAO = new AccountsDAO(db);
  const { getSocketServer } = options;

  /**
   * POST /api/replies
   * 提交回复请求
   *
   * 请求体:
   * {
   *   request_id: string,           // 必填: 客户端生成的唯一请求ID
   *   account_id: string,           // 必填: 账户ID
   *   target_type: 'comment'|'direct_message', // 必填: 目标类型
   *   target_id: string,            // 必填: 被回复的消息ID
   *   reply_content: string,        // 必填: 回复内容
   *   video_id?: string,            // 可选: 视频ID (抖音)
   *   user_id?: string,             // 可选: 用户ID
   *   platform_target_id?: string   // 可选: 平台特定的目标ID
   * }
   */
  router.post('/', async (req, res) => {
    try {
      const {
        request_id,
        account_id,
        target_type,
        target_id,
        reply_content,
        video_id,
        user_id,
        platform_target_id,
      } = req.body;

      // 验证必填字段
      if (!request_id || !account_id || !target_type || !target_id || !reply_content) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          required: ['request_id', 'account_id', 'target_type', 'target_id', 'reply_content'],
        });
      }

      // 验证 target_type
      if (!['comment', 'direct_message'].includes(target_type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid target_type. Must be "comment" or "direct_message"',
        });
      }

      // 检查账户是否存在
      const account = accountsDAO.findById(account_id);
      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Account not found',
        });
      }

      // 检查账户状态
      if (account.status !== 'active') {
        return res.status(400).json({
          success: false,
          error: 'Account is not active',
          account_status: account.status,
        });
      }

      // 检查是否已有相同的 request_id（防止重复提交）
      const existingReply = replyDAO.checkDuplicateRequest(request_id);
      if (existingReply) {
        logger.warn(`Duplicate request detected: ${request_id}`, {
          existingReplyId: existingReply.id,
          existingStatus: existingReply.reply_status,
        });

        return res.status(409).json({
          success: false,
          error: 'Duplicate request',
          reply_id: existingReply.id,
          status: existingReply.reply_status,
          message: 'You have already submitted this reply',
        });
      }

      // 创建回复记录
      const reply = replyDAO.createReply({
        requestId: request_id,
        platform: account.platform,
        accountId: account_id,
        targetType: target_type,
        targetId: target_id,
        replyContent: reply_content,
        videoId: video_id,
        userId: user_id,
        platformTargetId: platform_target_id,
        assignedWorkerId: account.assigned_worker_id,
      });

      logger.info(`Created reply request: ${reply.id}`, {
        accountId: account_id,
        requestId: request_id,
        platform: account.platform,
      });

      // 立即转发给 Worker（异步）
      setImmediate(() => {
        forwardReplyToWorker(db, reply.id, account, getSocketServer());
      });

      // 返回响应给客户端
      res.status(201).json({
        success: true,
        reply_id: reply.id,
        request_id: reply.request_id,
        status: 'pending',
        message: 'Reply request submitted',
      });
    } catch (error) {
      logger.error('Failed to submit reply:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/replies/:replyId
   * 查询回复状态
   */
  router.get('/:replyId', (req, res) => {
    try {
      const reply = replyDAO.getReplyById(req.params.replyId);

      if (!reply) {
        return res.status(404).json({
          success: false,
          error: 'Reply not found',
        });
      }

      res.json({
        success: true,
        data: {
          reply_id: reply.id,
          request_id: reply.request_id,
          status: reply.reply_status,
          created_at: reply.created_at,
          updated_at: reply.updated_at,
          executed_at: reply.executed_at,
          error_code: reply.error_code,
          error_message: reply.error_message,
          platform_reply_id: reply.platform_reply_id,
          submitted_count: reply.submitted_count,
        },
      });
    } catch (error) {
      logger.error(`Failed to get reply ${req.params.replyId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/replies
   * 查询回复列表（带过滤条件）
   */
  router.get('/', (req, res) => {
    try {
      const { account_id, status, limit = 100 } = req.query;

      let stmt;
      let params = [];

      // 构建查询语句
      let query = 'SELECT * FROM replies WHERE 1=1';

      if (account_id) {
        query += ' AND account_id = ?';
        params.push(account_id);
      }

      if (status) {
        query += ' AND reply_status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(parseInt(limit) || 100);

      stmt = db.prepare(query);
      const replies = stmt.all(...params);

      res.json({
        success: true,
        data: replies.map((reply) => ({
          reply_id: reply.id,
          request_id: reply.request_id,
          status: reply.reply_status,
          account_id: reply.account_id,
          target_type: reply.target_type,
          target_id: reply.target_id,
          created_at: reply.created_at,
          updated_at: reply.updated_at,
          executed_at: reply.executed_at,
          error_code: reply.error_code,
          error_message: reply.error_message,
        })),
        total: replies.length,
      });
    } catch (error) {
      logger.error('Failed to get replies:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/replies/account/:accountId/stats
   * 获取账户回复统计
   */
  router.get('/account/:accountId/stats', (req, res) => {
    try {
      const stats = replyDAO.getReplyStatsByAccount(req.params.accountId);

      res.json({
        success: true,
        data: {
          account_id: req.params.accountId,
          total_replies: stats.total || 0,
          success_count: stats.success_count || 0,
          failed_count: stats.failed_count || 0,
          pending_count: stats.pending_count || 0,
          avg_execution_time_ms: Math.round(stats.avg_execution_time || 0),
          success_rate: stats.total ? ((stats.success_count / stats.total) * 100).toFixed(2) + '%' : 'N/A',
        },
      });
    } catch (error) {
      logger.error(`Failed to get reply stats for account ${req.params.accountId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}

/**
 * 转发回复请求给 Worker
 * @private
 */
function forwardReplyToWorker(db, replyId, account, socketServer) {
  try {
    const replyDAO = new ReplyDAO(db);
    const reply = replyDAO.getReplyById(replyId);

    if (!reply) {
      logger.error(`Reply not found: ${replyId}`);
      return;
    }

    // 更新状态为 executing
    replyDAO.updateReplyStatusToExecuting(replyId);

    // 获取分配的 Worker
    const workerId = account.assigned_worker_id;
    if (!workerId) {
      logger.warn(`No worker assigned for account ${account.id}, marking reply as failed`);
      replyDAO.updateReplyFailed(
        replyId,
        'NO_WORKER_ASSIGNED',
        'No worker is assigned to this account'
      );
      return;
    }

    // 通过 Socket.IO 转发给 Worker
    if (socketServer) {
      socketServer.to(`worker:${workerId}`).emit('master:reply:request', {
        type: 'master:reply:request',
        reply_id: reply.id,
        request_id: reply.request_id,
        platform: reply.platform,
        account_id: reply.account_id,
        target_type: reply.target_type,
        target_id: reply.target_id,
        reply_content: reply.reply_content,
        context: {
          video_id: reply.video_id,
          user_id: reply.user_id,
          platform_target_id: reply.platform_target_id,
        },
        timestamp: Date.now(),
      });

      logger.info(`Forwarded reply to worker: ${workerId}`, {
        replyId,
        accountId: account.id,
      });
    } else {
      logger.warn('Socket server not available, cannot forward reply to worker');
      replyDAO.updateReplyFailed(
        replyId,
        'SOCKET_SERVER_UNAVAILABLE',
        'Socket server is not available'
      );
    }
  } catch (error) {
    logger.error(`Failed to forward reply to worker: ${error.message}`);
  }
}

module.exports = createRepliesRouter;
