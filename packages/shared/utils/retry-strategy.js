/**
 * 重试策略模块
 * 提供指数退避、重试限制等功能
 */

const { createLogger } = require('./logger');
const logger = createLogger('retry-strategy');

/**
 * 重试策略类
 */
class RetryStrategy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1秒
    this.maxDelay = options.maxDelay || 30000; // 30秒
    this.exponential = options.exponential !== false; // 默认使用指数退避
    this.jitter = options.jitter !== false; // 默认添加随机抖动
  }

  /**
   * 执行带重试的操作
   * @param {Function} fn - 要执行的异步函数
   * @param {Object} options - 重试选项
   * @returns {Promise<any>} 操作结果
   */
  async retry(fn, options = {}) {
    const {
      context = 'operation',
      onRetry = null,
      shouldRetry = this.defaultShouldRetry.bind(this),
    } = options;

    let lastError;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        logger.debug(`${context}: attempt ${attempt + 1}/${this.maxRetries + 1}`);
        return await fn(attempt);
      } catch (error) {
        lastError = error;
        attempt++;

        // 检查是否应该重试
        if (!shouldRetry(error) || attempt > this.maxRetries) {
          logger.error(`${context}: all attempts failed`, {
            totalAttempts: attempt,
            error: error.message,
          });
          throw error;
        }

        // 计算延迟时间
        const delay = this.calculateDelay(attempt);

        logger.warn(`${context}: attempt ${attempt} failed, retrying in ${delay}ms`, {
          error: error.message,
          nextAttempt: attempt + 1,
        });

        // 调用重试回调
        if (onRetry) {
          try {
            await onRetry(attempt, error, delay);
          } catch (callbackError) {
            logger.error(`${context}: onRetry callback failed`, callbackError);
          }
        }

        // 等待后重试
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * 计算延迟时间（指数退避 + 随机抖动）
   * @param {number} attempt - 当前尝试次数（从1开始）
   * @returns {number} 延迟时间（毫秒）
   */
  calculateDelay(attempt) {
    let delay;

    if (this.exponential) {
      // 指数退避: baseDelay * 2^(attempt-1)
      delay = this.baseDelay * Math.pow(2, attempt - 1);
    } else {
      // 线性延迟
      delay = this.baseDelay * attempt;
    }

    // 应用最大延迟限制
    delay = Math.min(delay, this.maxDelay);

    // 添加随机抖动（±20%）避免"惊群效应"
    if (this.jitter) {
      const jitterRange = delay * 0.2;
      const jitterOffset = Math.random() * jitterRange * 2 - jitterRange;
      delay = Math.round(delay + jitterOffset);
    }

    return delay;
  }

  /**
   * 默认的重试判断逻辑
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  defaultShouldRetry(error) {
    const message = error.message || '';

    // 可重试的错误模式
    const retriablePatterns = [
      /timeout/i,
      /timed out/i,
      /超时/i,
      /net::ERR/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /ENETUNREACH/i,
      /ENOTFOUND/i,
      /navigation/i,
      /failed to fetch/i,
    ];

    // 不可重试的错误模式
    const nonRetriablePatterns = [
      /authentication/i,
      /authorization/i,
      /forbidden/i,
      /401/,
      /403/,
      /404/,
    ];

    // 检查不可重试模式
    if (nonRetriablePatterns.some(pattern => pattern.test(message))) {
      return false;
    }

    // 检查可重试模式
    if (retriablePatterns.some(pattern => pattern.test(message))) {
      return true;
    }

    // 默认可以重试
    return true;
  }

  /**
   * 休眠指定时间
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建重试策略实例
 * @param {Object} options - 配置选项
 * @returns {RetryStrategy}
 */
function createRetryStrategy(options) {
  return new RetryStrategy(options);
}

/**
 * 快速创建常用的重试策略
 */
const RetryProfiles = {
  /**
   * 网络请求重试策略
   */
  network: () => new RetryStrategy({
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponential: true,
    jitter: true,
  }),

  /**
   * 页面加载重试策略
   */
  pageLoad: () => new RetryStrategy({
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 15000,
    exponential: true,
    jitter: true,
  }),

  /**
   * 元素查找重试策略（快速重试）
   */
  elementSearch: () => new RetryStrategy({
    maxRetries: 5,
    baseDelay: 500,
    maxDelay: 3000,
    exponential: false,
    jitter: false,
  }),

  /**
   * API 调用重试策略
   */
  apiCall: () => new RetryStrategy({
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponential: true,
    jitter: true,
  }),

  /**
   * 快速操作重试策略
   */
  quick: () => new RetryStrategy({
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    exponential: false,
    jitter: false,
  }),
};

module.exports = {
  RetryStrategy,
  createRetryStrategy,
  RetryProfiles,
};
