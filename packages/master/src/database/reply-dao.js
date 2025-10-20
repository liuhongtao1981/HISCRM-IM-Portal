const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('reply-dao');

/**
 * ReplyDAO - 回复数据访问层
 * 管理回复的所有数据库操作
 */
class ReplyDAO {
  constructor(db) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * 生成 idempotency_key
   * 基于账户、目标和内容生成唯一 key
   */
  generateIdempotencyKey(accountId, targetType, targetId, replyContent) {
    const data = `${accountId}:${targetType}:${targetId}:${replyContent}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * 检查是否有重复的 request_id
   * @returns {Object|null} - 存在返回记录，不存在返回 null
   */
  checkDuplicateRequest(requestId) {
    try {
      const stmt = this.db.prepare(`
        SELECT id, reply_status, created_at
        FROM replies
        WHERE request_id = ?
        LIMIT 1
      `);
      return stmt.get(requestId) || null;
    } catch (error) {
      this.logger.error('Failed to check duplicate request:', error);
      throw error;
    }
  }

  /**
   * 创建新的回复记录
   */
  createReply({
    requestId,
    platform,
    accountId,
    targetType,
    targetId,
    replyContent,
    videoId = null,
    userId = null,
    platformTargetId = null,
    assignedWorkerId = null,
  }) {
    try {
      const replyId = `reply-${uuidv4()}`;
      const now = Date.now();
      const idempotencyKey = this.generateIdempotencyKey(
        accountId,
        targetType,
        targetId,
        replyContent
      );

      const stmt = this.db.prepare(`
        INSERT INTO replies (
          id,
          request_id,
          idempotency_key,
          platform,
          account_id,
          target_type,
          target_id,
          platform_target_id,
          video_id,
          user_id,
          reply_content,
          reply_status,
          submitted_count,
          assigned_worker_id,
          first_submitted_at,
          last_submitted_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        replyId,
        requestId,
        idempotencyKey,
        platform,
        accountId,
        targetType,
        targetId,
        platformTargetId,
        videoId,
        userId,
        replyContent,
        'pending',
        1,
        assignedWorkerId,
        now,
        now,
        now,
        now
      );

      this.logger.info(`Created reply: ${replyId}`, {
        requestId,
        accountId,
        platform,
      });

      return {
        id: replyId,
        request_id: requestId,
        reply_status: 'pending',
        created_at: now,
      };
    } catch (error) {
      this.logger.error('Failed to create reply:', error);
      throw error;
    }
  }

  /**
   * 更新回复状态为 executing
   */
  updateReplyStatusToExecuting(replyId) {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        UPDATE replies
        SET reply_status = 'executing', updated_at = ?
        WHERE id = ?
      `);

      stmt.run(now, replyId);

      this.logger.info(`Updated reply status to executing: ${replyId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to update reply status to executing:', error);
      throw error;
    }
  }

  /**
   * 更新回复为成功
   */
  updateReplySuccess(replyId, platformReplyId, replyData = null) {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        UPDATE replies
        SET
          reply_status = 'success',
          platform_reply_id = ?,
          reply_data = ?,
          executed_at = ?,
          updated_at = ?
        WHERE id = ?
      `);

      stmt.run(
        platformReplyId,
        replyData ? JSON.stringify(replyData) : null,
        now,
        now,
        replyId
      );

      this.logger.info(`Updated reply to success: ${replyId}`, {
        platformReplyId,
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to update reply to success:', error);
      throw error;
    }
  }

  /**
   * 更新回复为失败
   */
  updateReplyFailed(replyId, errorCode, errorMessage, retryCount = 0) {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        UPDATE replies
        SET
          reply_status = 'failed',
          error_code = ?,
          error_message = ?,
          retry_count = ?,
          executed_at = ?,
          updated_at = ?
        WHERE id = ?
      `);

      stmt.run(errorCode, errorMessage, retryCount, now, now, replyId);

      this.logger.info(`Updated reply to failed: ${replyId}`, {
        errorCode,
        errorMessage,
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to update reply to failed:', error);
      throw error;
    }
  }

  /**
   * 增加重复提交计数
   */
  incrementSubmittedCount(replyId) {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        UPDATE replies
        SET
          submitted_count = submitted_count + 1,
          last_submitted_at = ?,
          updated_at = ?
        WHERE id = ?
      `);

      stmt.run(now, now, replyId);

      this.logger.debug(`Incremented submitted_count for reply: ${replyId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to increment submitted count:', error);
      throw error;
    }
  }

  /**
   * 获取回复详情
   */
  getReplyById(replyId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM replies WHERE id = ? LIMIT 1
      `);
      return stmt.get(replyId) || null;
    } catch (error) {
      this.logger.error('Failed to get reply by id:', error);
      throw error;
    }
  }

  /**
   * 按 request_id 获取回复
   */
  getReplyByRequestId(requestId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM replies WHERE request_id = ? LIMIT 1
      `);
      return stmt.get(requestId) || null;
    } catch (error) {
      this.logger.error('Failed to get reply by request_id:', error);
      throw error;
    }
  }

  /**
   * 获取待处理的回复列表
   */
  getPendingReplies(limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM replies
        WHERE reply_status IN ('pending', 'executing')
        ORDER BY created_at ASC
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (error) {
      this.logger.error('Failed to get pending replies:', error);
      throw error;
    }
  }

  /**
   * 获取某个账户最近的回复（用于检查频率）
   */
  getRecentRepliesByAccount(accountId, minutes = 5) {
    try {
      const cutoffTime = Date.now() - minutes * 60 * 1000;
      const stmt = this.db.prepare(`
        SELECT * FROM replies
        WHERE account_id = ? AND created_at > ?
        ORDER BY created_at DESC
        LIMIT 100
      `);
      return stmt.all(accountId, cutoffTime);
    } catch (error) {
      this.logger.error('Failed to get recent replies by account:', error);
      throw error;
    }
  }

  /**
   * 获取某个目标的所有回复
   */
  getRepliesByTarget(targetType, targetId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM replies
        WHERE target_type = ? AND target_id = ?
        ORDER BY created_at DESC
      `);
      return stmt.all(targetType, targetId);
    } catch (error) {
      this.logger.error('Failed to get replies by target:', error);
      throw error;
    }
  }

  /**
   * 获取某个账户的回复统计
   */
  getReplyStatsByAccount(accountId) {
    try {
      const stmt = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN reply_status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN reply_status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          SUM(CASE WHEN reply_status IN ('pending', 'executing') THEN 1 ELSE 0 END) as pending_count,
          AVG(CAST(executed_at - first_submitted_at AS FLOAT)) as avg_execution_time
        FROM replies
        WHERE account_id = ?
      `);
      return stmt.get(accountId) || {};
    } catch (error) {
      this.logger.error('Failed to get reply stats by account:', error);
      throw error;
    }
  }

  /**
   * 清理长期失败的回复记录（可选的清理策略）
   */
  cleanupFailedReplies(daysOld = 30) {
    try {
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
      const stmt = this.db.prepare(`
        DELETE FROM replies
        WHERE reply_status = 'failed' AND updated_at < ?
      `);

      const result = stmt.run(cutoffTime);
      this.logger.info(`Cleaned up ${result.changes} failed replies older than ${daysOld} days`);
      return result.changes;
    } catch (error) {
      this.logger.error('Failed to cleanup failed replies:', error);
      throw error;
    }
  }

  /**
   * 检查回复是否需要重试
   */
  shouldRetry(replyId) {
    try {
      const reply = this.getReplyById(replyId);
      if (!reply) return false;

      const { retry_count, max_retries, reply_status } = reply;
      return reply_status === 'failed' && retry_count < max_retries;
    } catch (error) {
      this.logger.error('Failed to check if should retry:', error);
      throw error;
    }
  }

  /**
   * 重试回复
   */
  retryReply(replyId) {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        UPDATE replies
        SET
          reply_status = 'pending',
          retry_count = retry_count + 1,
          executed_at = NULL,
          updated_at = ?
        WHERE id = ?
      `);

      stmt.run(now, replyId);
      this.logger.info(`Retried reply: ${replyId}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to retry reply:', error);
      throw error;
    }
  }
}

module.exports = ReplyDAO;
