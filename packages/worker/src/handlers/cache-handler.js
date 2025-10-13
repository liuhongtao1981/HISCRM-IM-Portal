/**
 * Cache Handler
 * T053: 缓存处理器 - 防止重复检测
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('cache-handler');

/**
 * Cache Handler 类
 * 使用内存缓存记录已检测的消息ID
 */
class CacheHandler {
  constructor() {
    // accountId -> Set<messageId>
    this.cache = new Map();

    // 缓存大小限制(每个账户最多缓存1000条)
    this.maxCacheSize = 1000;
  }

  /**
   * 检查消息是否已缓存
   * @param {string} accountId - 账户ID
   * @param {string} messageId - 消息ID (platform_comment_id 或 platform_message_id)
   * @returns {boolean}
   */
  has(accountId, messageId) {
    if (!messageId) {
      return false;
    }

    const accountCache = this.cache.get(accountId);
    if (!accountCache) {
      return false;
    }

    return accountCache.has(messageId);
  }

  /**
   * 添加消息到缓存
   * @param {string} accountId - 账户ID
   * @param {string} messageId - 消息ID
   */
  add(accountId, messageId) {
    if (!messageId) {
      return;
    }

    // 获取或创建账户缓存
    let accountCache = this.cache.get(accountId);
    if (!accountCache) {
      accountCache = new Set();
      this.cache.set(accountId, accountCache);
    }

    // 添加到缓存
    accountCache.add(messageId);

    // 检查缓存大小限制
    if (accountCache.size > this.maxCacheSize) {
      // 清理最旧的条目(简单实现: 清理前一半)
      const entriesToKeep = Array.from(accountCache).slice(
        Math.floor(this.maxCacheSize / 2)
      );
      this.cache.set(accountId, new Set(entriesToKeep));

      logger.info(
        `Cache size limit reached for account ${accountId}, cleaned up to ${entriesToKeep.length} entries`
      );
    }
  }

  /**
   * 过滤已缓存的消息
   * @param {string} accountId - 账户ID
   * @param {Array} messages - 消息数组
   * @param {string} idField - 消息ID字段名 ('platform_comment_id' 或 'platform_message_id')
   * @returns {Array} 未缓存的新消息
   */
  filterNew(accountId, messages, idField = 'platform_comment_id') {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    const newMessages = [];

    for (const message of messages) {
      const messageId = message[idField];

      if (!messageId) {
        // 如果没有ID，无法判断是否重复，保守地认为是新消息
        newMessages.push(message);
        continue;
      }

      if (!this.has(accountId, messageId)) {
        newMessages.push(message);
        this.add(accountId, messageId);
      } else {
        logger.debug(`Skipping duplicate message: ${messageId}`);
      }
    }

    logger.info(
      `Filtered ${messages.length} messages to ${newMessages.length} new messages for account ${accountId}`
    );

    return newMessages;
  }

  /**
   * 清除账户缓存
   * @param {string} accountId - 账户ID
   */
  clear(accountId) {
    this.cache.delete(accountId);
    logger.info(`Cleared cache for account ${accountId}`);
  }

  /**
   * 清除所有缓存
   */
  clearAll() {
    this.cache.clear();
    logger.info('Cleared all cache');
  }

  /**
   * 获取缓存统计
   * @returns {object}
   */
  getStats() {
    const stats = {
      accounts: this.cache.size,
      total_cached_messages: 0,
    };

    for (const [accountId, accountCache] of this.cache.entries()) {
      stats.total_cached_messages += accountCache.size;
    }

    return stats;
  }
}

module.exports = CacheHandler;
