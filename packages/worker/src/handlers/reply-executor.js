/**
 * ReplyExecutor - 回复执行器
 * 在 Worker 进程中执行回复操作
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('reply-executor');

class ReplyExecutor {
  constructor(platformManager, browserManager, socketClient) {
    this.platformManager = platformManager;
    this.browserManager = browserManager;
    this.socketClient = socketClient;

    // 本地缓存：记录已处理的 request_id（防止重复处理）
    // key: request_id, value: { reply_id, status, timestamp }
    this.executedRequests = new Map();

    // 定期清理过期的缓存条目（每小时清理一次）
    this.startCacheCleanup();
  }

  /**
   * 启动缓存清理任务
   */
  startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [requestId, data] of this.executedRequests.entries()) {
        // 保留 24 小时内的缓存
        if (now - data.timestamp > 24 * 60 * 60 * 1000) {
          this.executedRequests.delete(requestId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
      }
    }, 60 * 60 * 1000); // 每小时执行一次
  }

  /**
   * 检查是否已经处理过该请求
   */
  isRequestAlreadyProcessing(requestId) {
    return this.executedRequests.has(requestId);
  }

  /**
   * 执行回复
   * @param {Object} replyRequest - 回复请求对象
   *   - reply_id: string
   *   - request_id: string
   *   - platform: string ('douyin', 'xiaohongshu', etc.)
   *   - account_id: string
   *   - target_type: string ('comment' | 'direct_message')
   *   - target_id: string
   *   - reply_content: string
   *   - context: object
   */
  async executeReply(replyRequest) {
    const { reply_id, request_id, platform, account_id, target_type, target_id, reply_content, context } = replyRequest;

    try {
      logger.info(`Executing reply: ${reply_id}`, {
        requestId: request_id,
        platform,
        accountId: account_id,
        targetType: target_type,
      });

      // 检查是否已经处理过
      if (this.isRequestAlreadyProcessing(request_id)) {
        const cached = this.executedRequests.get(request_id);
        logger.warn(`Request already processing, returning cached result: ${request_id}`, cached);
        // 返回缓存的结果
        return cached;
      }

      // 标记为处理中
      this.executedRequests.set(request_id, {
        reply_id,
        status: 'processing',
        timestamp: Date.now(),
      });

      // 获取平台实例
      const platformInstance = this.platformManager.getPlatform(platform);
      if (!platformInstance) {
        throw new Error(`Platform not found: ${platform}`);
      }

      // 验证平台是否支持回复功能
      if (target_type === 'comment' && !platformInstance.replyToComment) {
        throw new Error(`Platform ${platform} does not support comment replies`);
      }
      if (target_type === 'direct_message' && !platformInstance.replyToDirectMessage) {
        throw new Error(`Platform ${platform} does not support direct message replies`);
      }

      // 执行平台特定的回复操作
      let result;
      if (target_type === 'comment') {
        result = await platformInstance.replyToComment(account_id, {
          target_id,
          reply_content,
          context,
          browserManager: this.browserManager,
        });
      } else if (target_type === 'direct_message') {
        result = await platformInstance.replyToDirectMessage(account_id, {
          target_id,
          reply_content,
          context,
          browserManager: this.browserManager,
        });
      }

      // 成功
      const successResult = {
        reply_id,
        request_id,
        platform,
        account_id,
        status: 'success',
        platform_reply_id: result.platform_reply_id || null,
        data: result.data || {},
        timestamp: Date.now(),
      };

      // 更新缓存
      this.executedRequests.set(request_id, {
        reply_id,
        status: 'success',
        timestamp: Date.now(),
      });

      // 发送结果给 Master
      this.sendReplyResult(successResult);

      logger.info(`Reply executed successfully: ${reply_id}`, {
        platformReplyId: result.platform_reply_id,
      });

      return successResult;
    } catch (error) {
      logger.error(`Failed to execute reply: ${reply_id}`, error);

      // 失败
      const failureResult = {
        reply_id,
        request_id,
        platform,
        account_id,
        status: 'failed',
        error_code: this.getErrorCode(error),
        error_message: error.message,
        timestamp: Date.now(),
      };

      // 更新缓存
      this.executedRequests.set(request_id, {
        reply_id,
        status: 'failed',
        timestamp: Date.now(),
      });

      // 发送结果给 Master
      this.sendReplyResult(failureResult);

      return failureResult;
    }
  }

  /**
   * 从错误对象获取错误代码
   */
  getErrorCode(error) {
    if (error.message.includes('login') || error.message.includes('auth')) {
      return 'LOGIN_EXPIRED';
    }
    if (error.message.includes('network') || error.message.includes('timeout')) {
      return 'NETWORK_ERROR';
    }
    if (error.message.includes('quota') || error.message.includes('limit')) {
      return 'QUOTA_EXCEEDED';
    }
    if (error.message.includes('not found')) {
      return 'TARGET_NOT_FOUND';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * 发送回复结果给 Master
   */
  sendReplyResult(result) {
    try {
      if (this.socketClient && this.socketClient.socket && this.socketClient.socket.connected) {
        this.socketClient.socket.emit('worker:reply:result', result);
        logger.debug(`Sent reply result to master: ${result.reply_id}`);
      } else {
        logger.warn('Socket client not connected, cannot send reply result');
      }
    } catch (error) {
      logger.error('Failed to send reply result:', error);
    }
  }

  /**
   * 清空所有缓存（用于测试或重启）
   */
  clearCache() {
    this.executedRequests.clear();
    logger.info('Cleared reply executor cache');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return {
      cachedRequests: this.executedRequests.size,
      cacheSize: Math.round((new TextEncoder().encode(JSON.stringify(Array.from(this.executedRequests))).length) / 1024), // KB
    };
  }
}

module.exports = ReplyExecutor;
