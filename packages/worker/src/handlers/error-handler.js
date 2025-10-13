/**
 * T060: Error Handler for Crawler Failures
 *
 * Purpose: 处理爬虫失败情况,包括网络错误、解析错误、认证失败等
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('error-handler');

/**
 * 错误类型枚举
 */
const ErrorType = {
  NETWORK_ERROR: 'network_error',           // 网络连接失败
  AUTH_ERROR: 'auth_error',                 // 认证失败,凭证过期
  PARSE_ERROR: 'parse_error',               // 数据解析失败
  RATE_LIMIT_ERROR: 'rate_limit_error',     // 触发限流
  TIMEOUT_ERROR: 'timeout_error',           // 请求超时
  UNKNOWN_ERROR: 'unknown_error',           // 未知错误
};

/**
 * 错误处理器类
 */
class ErrorHandler {
  constructor() {
    this.errorCounts = new Map(); // 错误计数: accountId -> count
    this.lastErrors = new Map();  // 最后错误: accountId -> error info
  }

  /**
   * 处理爬虫错误
   * @param {Error} error - 错误对象
   * @param {object} account - 账户对象
   * @param {string} operation - 操作类型 ('crawl_comments' 或 'crawl_messages')
   * @returns {object} 错误处理结果
   */
  handleCrawlerError(error, account, operation) {
    const errorType = this.classifyError(error);
    const accountId = account.id;

    // 增加错误计数
    const count = (this.errorCounts.get(accountId) || 0) + 1;
    this.errorCounts.set(accountId, count);

    // 记录最后错误
    const errorInfo = {
      type: errorType,
      message: error.message,
      operation,
      timestamp: Date.now(),
      count,
    };
    this.lastErrors.set(accountId, errorInfo);

    // 记录日志
    logger.error(`Crawler error for account ${accountId}`, {
      accountId,
      platform: account.platform,
      errorType,
      operation,
      errorMessage: error.message,
      errorCount: count,
    });

    // 决定如何处理
    const action = this.decideAction(errorType, count);

    return {
      errorType,
      errorMessage: error.message,
      errorCount: count,
      action,
      shouldRetry: action.retry,
      retryDelay: action.retryDelay,
      shouldPauseAccount: action.pauseAccount,
      shouldNotifyMaster: action.notifyMaster,
    };
  }

  /**
   * 分类错误类型
   * @param {Error} error - 错误对象
   * @returns {string} 错误类型
   */
  classifyError(error) {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
      return ErrorType.NETWORK_ERROR;
    }

    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) {
      return ErrorType.AUTH_ERROR;
    }

    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
      return ErrorType.RATE_LIMIT_ERROR;
    }

    if (message.includes('timeout') || message.includes('etimedout')) {
      return ErrorType.TIMEOUT_ERROR;
    }

    if (message.includes('parse') || message.includes('json') || message.includes('invalid')) {
      return ErrorType.PARSE_ERROR;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  /**
   * 决定错误处理动作
   * @param {string} errorType - 错误类型
   * @param {number} errorCount - 错误次数
   * @returns {object} 处理动作
   */
  decideAction(errorType, errorCount) {
    const action = {
      retry: false,
      retryDelay: 0,
      pauseAccount: false,
      notifyMaster: false,
    };

    switch (errorType) {
      case ErrorType.NETWORK_ERROR:
        // 网络错误: 重试3次,每次延迟递增
        if (errorCount <= 3) {
          action.retry = true;
          action.retryDelay = 5000 * errorCount; // 5秒, 10秒, 15秒
        } else {
          action.pauseAccount = true;
          action.notifyMaster = true;
        }
        break;

      case ErrorType.AUTH_ERROR:
        // 认证错误: 暂停账户,通知主控
        action.pauseAccount = true;
        action.notifyMaster = true;
        break;

      case ErrorType.RATE_LIMIT_ERROR:
        // 限流错误: 延长重试时间
        action.retry = true;
        action.retryDelay = 60000; // 60秒后重试
        action.notifyMaster = true;
        break;

      case ErrorType.TIMEOUT_ERROR:
        // 超时错误: 重试2次
        if (errorCount <= 2) {
          action.retry = true;
          action.retryDelay = 10000 * errorCount;
        } else {
          action.notifyMaster = true;
        }
        break;

      case ErrorType.PARSE_ERROR:
        // 解析错误: 记录日志,继续监控
        logger.warn('Parse error, continuing monitoring');
        break;

      case ErrorType.UNKNOWN_ERROR:
      default:
        // 未知错误: 重试1次
        if (errorCount <= 1) {
          action.retry = true;
          action.retryDelay = 5000;
        } else {
          action.notifyMaster = true;
        }
        break;
    }

    return action;
  }

  /**
   * 重置账户错误计数
   * @param {string} accountId - 账户ID
   */
  resetErrorCount(accountId) {
    this.errorCounts.delete(accountId);
    this.lastErrors.delete(accountId);
    logger.info(`Reset error count for account ${accountId}`);
  }

  /**
   * 获取账户错误信息
   * @param {string} accountId - 账户ID
   * @returns {object|null} 错误信息
   */
  getLastError(accountId) {
    return this.lastErrors.get(accountId) || null;
  }

  /**
   * 获取账户错误次数
   * @param {string} accountId - 账户ID
   * @returns {number} 错误次数
   */
  getErrorCount(accountId) {
    return this.errorCounts.get(accountId) || 0;
  }

  /**
   * 检查账户是否健康
   * @param {string} accountId - 账户ID
   * @returns {boolean} 是否健康
   */
  isAccountHealthy(accountId) {
    const count = this.getErrorCount(accountId);
    return count < 3;
  }

  /**
   * 清理过期错误记录(超过1小时的错误可以重置)
   */
  cleanupOldErrors() {
    const oneHourAgo = Date.now() - 3600000;

    for (const [accountId, errorInfo] of this.lastErrors.entries()) {
      if (errorInfo.timestamp < oneHourAgo) {
        this.resetErrorCount(accountId);
      }
    }
  }
}

// 导出单例
const errorHandler = new ErrorHandler();

module.exports = errorHandler;
module.exports.ErrorType = ErrorType;
module.exports.ErrorHandler = ErrorHandler;
