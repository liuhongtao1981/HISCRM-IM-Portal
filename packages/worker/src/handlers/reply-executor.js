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
      }
    }, 60 * 60 * 1000); // 每小时执行一次
  }

  /**
   * 规范化回复请求参数 (Phase 9: 支持新旧两种格式)
   * 向后兼容: target_id 可能是 platform_message_id (Phase 8) 或 conversation_id (Phase 9)
   *
   * @param {Object} request - 原始请求对象
   * @returns {Object} 规范化后的请求对象
   */
  normalizeReplyRequest(request) {
    const {
      target_id,           // Phase 8: platform_message_id 或 Phase 9: conversation_id
      conversation_id,     // Phase 9 新增
      platform_message_id, // Phase 9 新增
      ...rest
    } = request;

    // Phase 9 优先级: conversation_id > target_id
    const finalConversationId = conversation_id || target_id;
    const finalPlatformMessageId = platform_message_id ||
                                   (conversation_id ? null : target_id);
    return {
      ...rest,
      target_id,  // 保留原始值以兼容调试
      conversation_id: finalConversationId,
      platform_message_id: finalPlatformMessageId,
    };
  }

  /**
   * 检查是否已经处理过该请求
   */
  isRequestAlreadyProcessing(requestId) {
    return this.executedRequests.has(requestId);
  }

  /**
   * 执行回复 (Phase 9 改进版)
   * @param {Object} replyRequest - 回复请求对象
   *   - reply_id: string
   *   - request_id: string
   *   - platform: string ('douyin', 'xiaohongshu', etc.)
   *   - account_id: string
   *   - target_type: string ('comment' | 'direct_message')
   *   - target_id: string (向后兼容，旧版本为 platform_message_id)
   *   - conversation_id: string (Phase 9 新增，私信用)
   *   - platform_message_id: string (Phase 9 新增，私信用，可选)
   *   - reply_content: string
   *   - context: object
   */
  async executeReply(replyRequest) {
    // Phase 9: 规范化回复请求参数 (支持新旧两种格式)
    const normalizedRequest = this.normalizeReplyRequest(replyRequest);
    const {
      reply_id,
      request_id,
      platform,
      account_id,
      target_type,
      target_id,           // 向后兼容
      conversation_id,     // Phase 9 新增
      platform_message_id, // Phase 9 新增
      reply_content,
      context
    } = normalizedRequest;

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
        // Phase 9: 传递新的参数 (conversation_id + platform_message_id)
        result = await platformInstance.replyToDirectMessage(account_id, {
          target_id,           // 向后兼容
          conversation_id,     // Phase 9 新增
          platform_message_id, // Phase 9 新增 (可选)
          reply_content,
          context,
          browserManager: this.browserManager,
        });
      }

      // 检查操作结果
      if (!result.success) {
        // 操作被拦截或失败（但不是异常）
        const blockedResult = {
          reply_id,
          request_id,
          platform,
          account_id,
          status: result.status || 'blocked', // 'blocked', 'error', etc.
          error_code: result.status === 'blocked' ? 'REPLY_BLOCKED' : 'OPERATION_FAILED',
          error_message: result.reason || 'Operation blocked or failed',
          timestamp: Date.now(),
        };

        // 更新缓存
        this.executedRequests.set(request_id, {
          reply_id,
          status: result.status || 'blocked',
          timestamp: Date.now(),
        });

        // 发送结果给 Master
        this.sendReplyResult(blockedResult);

        logger.warn(`Reply operation blocked/failed: ${reply_id}`, {
          reason: result.reason,
          status: result.status,
        });

        return blockedResult;
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
