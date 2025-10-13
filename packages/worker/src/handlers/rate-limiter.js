/**
 * T061: Rate Limiting Detection and Auto-Adjustment
 *
 * Purpose: 检测平台限流并自动调整监控间隔,避免触发反爬机制
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('rate-limiter');

/**
 * 限流检测器类
 */
class RateLimiter {
  constructor() {
    // 账户监控间隔配置: accountId -> interval (秒)
    this.intervals = new Map();

    // 请求历史记录: accountId -> [timestamps]
    this.requestHistory = new Map();

    // 限流检测状态: accountId -> { detected, adjustedInterval, detectedAt }
    this.rateLimitStatus = new Map();

    // 默认配置
    this.defaultInterval = 30;  // 默认30秒间隔
    this.minInterval = 10;      // 最小间隔10秒
    this.maxInterval = 300;     // 最大间隔300秒(5分钟)
    this.historyWindow = 60000; // 历史记录窗口:60秒
  }

  /**
   * 初始化账户监控间隔
   * @param {string} accountId - 账户ID
   * @param {number} interval - 初始间隔(秒)
   */
  initialize(accountId, interval = this.defaultInterval) {
    this.intervals.set(accountId, interval);
    this.requestHistory.set(accountId, []);

    logger.info(`Initialized rate limiter for account ${accountId}`, {
      accountId,
      interval,
    });
  }

  /**
   * 记录请求
   * @param {string} accountId - 账户ID
   */
  recordRequest(accountId) {
    const now = Date.now();
    const history = this.requestHistory.get(accountId) || [];

    // 添加当前请求
    history.push(now);

    // 清理过期请求记录
    const cutoff = now - this.historyWindow;
    const filtered = history.filter((ts) => ts > cutoff);

    this.requestHistory.set(accountId, filtered);

    logger.debug(`Recorded request for account ${accountId}`, {
      accountId,
      requestCount: filtered.length,
    });
  }

  /**
   * 检测是否触发限流
   * @param {Error} error - 爬虫错误对象
   * @param {string} accountId - 账户ID
   * @returns {boolean} 是否检测到限流
   */
  detectRateLimit(error, accountId) {
    const message = error.message.toLowerCase();

    // 检测限流关键词
    const rateLimitKeywords = [
      'rate limit',
      'too many requests',
      '429',
      'throttle',
      'quota exceeded',
      'request limit',
    ];

    const isRateLimited = rateLimitKeywords.some((keyword) =>
      message.includes(keyword)
    );

    if (isRateLimited) {
      logger.warn(`Rate limit detected for account ${accountId}`, {
        accountId,
        errorMessage: error.message,
      });

      this.handleRateLimitDetection(accountId);
    }

    return isRateLimited;
  }

  /**
   * 处理限流检测
   * @param {string} accountId - 账户ID
   */
  handleRateLimitDetection(accountId) {
    const currentInterval = this.intervals.get(accountId) || this.defaultInterval;

    // 增加间隔时间(翻倍,最大不超过maxInterval)
    const newInterval = Math.min(currentInterval * 2, this.maxInterval);

    this.intervals.set(accountId, newInterval);

    // 记录限流状态
    this.rateLimitStatus.set(accountId, {
      detected: true,
      adjustedInterval: newInterval,
      detectedAt: Date.now(),
      previousInterval: currentInterval,
    });

    logger.info(`Adjusted interval due to rate limit`, {
      accountId,
      previousInterval: currentInterval,
      newInterval,
    });
  }

  /**
   * 获取账户当前监控间隔
   * @param {string} accountId - 账户ID
   * @returns {number} 监控间隔(秒)
   */
  getInterval(accountId) {
    return this.intervals.get(accountId) || this.defaultInterval;
  }

  /**
   * 更新账户监控间隔
   * @param {string} accountId - 账户ID
   * @param {number} interval - 新间隔(秒)
   */
  updateInterval(accountId, interval) {
    // 确保间隔在合理范围内
    const validInterval = Math.max(
      this.minInterval,
      Math.min(interval, this.maxInterval)
    );

    this.intervals.set(accountId, validInterval);

    logger.info(`Updated interval for account ${accountId}`, {
      accountId,
      newInterval: validInterval,
    });
  }

  /**
   * 尝试恢复正常监控频率
   * @param {string} accountId - 账户ID
   * @returns {boolean} 是否恢复成功
   */
  tryRecover(accountId) {
    const status = this.rateLimitStatus.get(accountId);

    if (!status || !status.detected) {
      return false;
    }

    const elapsedTime = Date.now() - status.detectedAt;
    const recoveryThreshold = 300000; // 5分钟后尝试恢复

    if (elapsedTime < recoveryThreshold) {
      return false;
    }

    const currentInterval = this.intervals.get(accountId);
    const targetInterval = Math.max(
      status.previousInterval,
      this.defaultInterval
    );

    // 逐步降低间隔时间
    const newInterval = Math.ceil((currentInterval + targetInterval) / 2);

    this.intervals.set(accountId, newInterval);

    logger.info(`Attempting to recover normal interval`, {
      accountId,
      currentInterval,
      newInterval,
      targetInterval,
    });

    // 如果恢复到正常间隔,清除限流状态
    if (newInterval <= targetInterval) {
      this.rateLimitStatus.delete(accountId);
      logger.info(`Recovered to normal interval for account ${accountId}`);
      return true;
    }

    return false;
  }

  /**
   * 检查请求频率是否过高
   * @param {string} accountId - 账户ID
   * @returns {boolean} 是否频率过高
   */
  isRequestTooFrequent(accountId) {
    const history = this.requestHistory.get(accountId) || [];
    const now = Date.now();
    const interval = this.getInterval(accountId) * 1000; // 转换为毫秒

    if (history.length === 0) {
      return false;
    }

    const lastRequest = history[history.length - 1];
    const timeSinceLastRequest = now - lastRequest;

    return timeSinceLastRequest < interval;
  }

  /**
   * 获取下次请求的延迟时间
   * @param {string} accountId - 账户ID
   * @returns {number} 延迟时间(毫秒)
   */
  getNextRequestDelay(accountId) {
    const history = this.requestHistory.get(accountId) || [];

    if (history.length === 0) {
      return 0;
    }

    const now = Date.now();
    const interval = this.getInterval(accountId) * 1000; // 转换为毫秒
    const lastRequest = history[history.length - 1];
    const timeSinceLastRequest = now - lastRequest;

    if (timeSinceLastRequest >= interval) {
      return 0;
    }

    return interval - timeSinceLastRequest;
  }

  /**
   * 获取账户限流状态
   * @param {string} accountId - 账户ID
   * @returns {object|null} 限流状态
   */
  getRateLimitStatus(accountId) {
    return this.rateLimitStatus.get(accountId) || null;
  }

  /**
   * 重置账户限流状态
   * @param {string} accountId - 账户ID
   */
  reset(accountId) {
    this.intervals.set(accountId, this.defaultInterval);
    this.requestHistory.set(accountId, []);
    this.rateLimitStatus.delete(accountId);

    logger.info(`Reset rate limiter for account ${accountId}`);
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();

    for (const [accountId, history] of this.requestHistory.entries()) {
      const cutoff = now - this.historyWindow;
      const filtered = history.filter((ts) => ts > cutoff);

      if (filtered.length === 0) {
        this.requestHistory.delete(accountId);
      } else {
        this.requestHistory.set(accountId, filtered);
      }
    }

    logger.debug('Cleaned up rate limiter history');
  }

  /**
   * 获取统计信息
   * @returns {object} 统计信息
   */
  getStats() {
    const stats = {
      totalAccounts: this.intervals.size,
      rateLimitedAccounts: this.rateLimitStatus.size,
      accounts: [],
    };

    for (const [accountId, interval] of this.intervals.entries()) {
      const status = this.rateLimitStatus.get(accountId);
      const history = this.requestHistory.get(accountId) || [];

      stats.accounts.push({
        accountId,
        interval,
        isRateLimited: !!status,
        requestCount: history.length,
      });
    }

    return stats;
  }
}

// 导出单例
const rateLimiter = new RateLimiter();

module.exports = rateLimiter;
module.exports.RateLimiter = RateLimiter;
