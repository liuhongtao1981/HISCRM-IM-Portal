/**
 * 缓存管理器
 * 为每个账号维护评论、私信、视频的 ID 缓存，用于去重
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('cache-manager');

class CacheManager {
  constructor() {
    // 账号缓存结构: { accountId: { comments: Set, videos: Set, directMessages: Set } }
    this.accountCaches = new Map();

    // 缓存统计
    this.stats = {
      hits: 0,      // 缓存命中次数（识别为旧数据）
      misses: 0,    // 缓存未命中次数（识别为新数据）
    };

    logger.info('Cache manager initialized');
  }

  /**
   * 获取或创建账号的缓存
   * @param {string} accountId - 账号ID
   * @returns {Object} 账号缓存对象
   */
  _getOrCreateCache(accountId) {
    if (!this.accountCaches.has(accountId)) {
      this.accountCaches.set(accountId, {
        comments: new Set(),
        videos: new Set(),
        directMessages: new Set(),
      });
    }
    return this.accountCaches.get(accountId);
  }

  /**
   * 过滤评论列表，只返回新评论
   * @param {string} accountId - 账号ID
   * @param {Array} comments - 评论列表
   * @returns {Array} 新评论列表
   */
  filterNewComments(accountId, comments) {
    if (!comments || comments.length === 0) {
      return [];
    }

    const cache = this._getOrCreateCache(accountId);
    const newComments = [];

    for (const comment of comments) {
      const commentId = comment.id || comment.platform_comment_id;

      if (!cache.comments.has(commentId)) {
        // 新评论
        newComments.push(comment);
        cache.comments.add(commentId);
        this.stats.misses++;
      } else {
        // 已存在的评论
        this.stats.hits++;
      }
    }

    if (newComments.length > 0) {
      logger.info(
        `Account ${accountId}: Filtered ${comments.length} comments -> ${newComments.length} new (${comments.length - newComments.length} duplicates)`
      );
    }

    return newComments;
  }

  /**
   * 过滤视频列表，只返回新视频
   * @param {string} accountId - 账号ID
   * @param {Array} videos - 视频列表
   * @returns {Array} 新视频列表
   */
  filterNewVideos(accountId, videos) {
    if (!videos || videos.length === 0) {
      return [];
    }

    const cache = this._getOrCreateCache(accountId);
    const newVideos = [];

    for (const video of videos) {
      const videoId = video.aweme_id || video.id;

      if (!cache.videos.has(videoId)) {
        // 新视频
        newVideos.push(video);
        cache.videos.add(videoId);
        this.stats.misses++;
      } else {
        // 已存在的视频
        this.stats.hits++;
      }
    }

    if (newVideos.length > 0) {
      logger.info(
        `Account ${accountId}: Filtered ${videos.length} videos -> ${newVideos.length} new (${videos.length - newVideos.length} duplicates)`
      );
    }

    return newVideos;
  }

  /**
   * 过滤私信列表，只返回新私信
   * @param {string} accountId - 账号ID
   * @param {Array} messages - 私信列表
   * @returns {Array} 新私信列表
   */
  filterNewDirectMessages(accountId, messages) {
    if (!messages || messages.length === 0) {
      return [];
    }

    const cache = this._getOrCreateCache(accountId);
    const newMessages = [];

    for (const message of messages) {
      const messageId = message.id || message.platform_message_id;

      if (!cache.directMessages.has(messageId)) {
        // 新私信
        newMessages.push(message);
        cache.directMessages.add(messageId);
        this.stats.misses++;
      } else {
        // 已存在的私信
        this.stats.hits++;
      }
    }

    if (newMessages.length > 0) {
      logger.info(
        `Account ${accountId}: Filtered ${messages.length} messages -> ${newMessages.length} new (${messages.length - newMessages.length} duplicates)`
      );
    }

    return newMessages;
  }

  /**
   * 预加载账号的缓存数据（从 Master 获取已有数据的 ID 列表）
   * @param {string} accountId - 账号ID
   * @param {Object} existingData - 已有数据 { commentIds: [], videoIds: [], messageIds: [] }
   */
  preloadCache(accountId, existingData) {
    const cache = this._getOrCreateCache(accountId);

    if (existingData.commentIds) {
      existingData.commentIds.forEach(id => cache.comments.add(id));
    }

    if (existingData.videoIds) {
      existingData.videoIds.forEach(id => cache.videos.add(id));
    }

    if (existingData.messageIds) {
      existingData.messageIds.forEach(id => cache.directMessages.add(id));
    }

    logger.info(`Cache preloaded for account ${accountId}: ${existingData.commentIds?.length || 0} comments, ${existingData.videoIds?.length || 0} videos, ${existingData.messageIds?.length || 0} messages`);
  }

  /**
   * 清除账号的缓存
   * @param {string} accountId - 账号ID
   */
  clearCache(accountId) {
    if (this.accountCaches.has(accountId)) {
      this.accountCaches.delete(accountId);
      logger.info(`Cleared cache for account ${accountId}`);
    }
  }

  /**
   * 清除所有缓存
   */
  clearAllCaches() {
    const count = this.accountCaches.size;
    this.accountCaches.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
    logger.info(`Cleared all caches (${count} accounts)`);
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      accounts: this.accountCaches.size,
      caches: Array.from(this.accountCaches.entries()).map(([accountId, cache]) => ({
        accountId,
        comments: cache.comments.size,
        videos: cache.videos.size,
        directMessages: cache.directMessages.size,
      })),
    };
  }

  /**
   * 获取指定账号的缓存大小
   * @param {string} accountId - 账号ID
   * @returns {Object|null} 缓存大小信息
   */
  getCacheSize(accountId) {
    const cache = this.accountCaches.get(accountId);
    if (!cache) {
      return null;
    }

    return {
      comments: cache.comments.size,
      videos: cache.videos.size,
      directMessages: cache.directMessages.size,
      total: cache.comments.size + cache.videos.size + cache.directMessages.size,
    };
  }

  // ============================================
  // 新数据推送系统方法 (IsNewPushTask)
  // ============================================

  /**
   * 获取或创建账号的数据存储
   * @private
   * @param {string} accountId - 账号ID
   * @returns {Object} 数据存储对象
   */
  _getOrCreateData(accountId) {
    if (!this.accountData) {
      this.accountData = new Map();
    }
    if (!this.accountData.has(accountId)) {
      this.accountData.set(accountId, {
        comments: new Map(),
        videos: new Map(),
        directMessages: new Map(),
      });
    }
    return this.accountData.get(accountId);
  }

  /**
   * 获取所有有数据的账号
   * @returns {Array} 账号ID 数组
   */
  getAllAccounts() {
    if (!this.accountData) {
      return [];
    }
    return Array.from(this.accountData.keys());
  }

  /**
   * 添加评论到数据存储
   * @param {string} accountId - 账号ID
   * @param {Object} comment - 评论对象（包含 is_new, push_count）
   */
  addComment(accountId, comment) {
    const data = this._getOrCreateData(accountId);
    data.comments.set(comment.id, {
      ...comment,
      is_new: comment.is_new !== undefined ? comment.is_new : true,
      push_count: comment.push_count !== undefined ? comment.push_count : 0
    });
  }

  /**
   * 添加私信到数据存储
   * @param {string} accountId - 账号ID
   * @param {Object} message - 私信对象（包含 is_new, push_count）
   */
  addMessage(accountId, message) {
    const data = this._getOrCreateData(accountId);
    data.directMessages.set(message.id, {
      ...message,
      is_new: message.is_new !== undefined ? message.is_new : true,
      push_count: message.push_count !== undefined ? message.push_count : 0
    });
  }

  /**
   * 添加视频到数据存储
   * @param {string} accountId - 账号ID
   * @param {Object} video - 视频对象（包含 is_new, push_count）
   */
  addVideo(accountId, video) {
    const data = this._getOrCreateData(accountId);
    data.videos.set(video.id, {
      ...video,
      is_new: video.is_new !== undefined ? video.is_new : true,
      push_count: video.push_count !== undefined ? video.push_count : 0
    });
  }

  /**
   * 获取 is_new=true 的评论
   * @param {string} accountId - 账号ID
   * @returns {Array} 新评论数组
   */
  getCommentsWithIsNew(accountId) {
    const data = this._getOrCreateData(accountId);
    return Array.from(data.comments.values()).filter(c => c.is_new === true);
  }

  /**
   * 获取 is_new=true 的私信
   * @param {string} accountId - 账号ID
   * @returns {Array} 新私信数组
   */
  getMessagesWithIsNew(accountId) {
    const data = this._getOrCreateData(accountId);
    return Array.from(data.directMessages.values()).filter(m => m.is_new === true);
  }

  /**
   * 获取 is_new=true 的视频
   * @param {string} accountId - 账号ID
   * @returns {Array} 新视频数组
   */
  getVideosWithIsNew(accountId) {
    const data = this._getOrCreateData(accountId);
    return Array.from(data.videos.values()).filter(v => v.is_new === true);
  }

  /**
   * 更新评论
   * @param {string} accountId - 账号ID
   * @param {string} commentId - 评论ID
   * @param {Object} updates - 更新字段
   */
  updateComment(accountId, commentId, updates) {
    const data = this._getOrCreateData(accountId);
    const comment = data.comments.get(commentId);
    if (comment) {
      data.comments.set(commentId, { ...comment, ...updates });
    }
  }

  /**
   * 更新私信
   * @param {string} accountId - 账号ID
   * @param {string} messageId - 私信ID
   * @param {Object} updates - 更新字段
   */
  updateMessage(accountId, messageId, updates) {
    const data = this._getOrCreateData(accountId);
    const message = data.directMessages.get(messageId);
    if (message) {
      data.directMessages.set(messageId, { ...message, ...updates });
    }
  }

  /**
   * 更新视频
   * @param {string} accountId - 账号ID
   * @param {string} videoId - 视频ID
   * @param {Object} updates - 更新字段
   */
  updateVideo(accountId, videoId, updates) {
    const data = this._getOrCreateData(accountId);
    const video = data.videos.get(videoId);
    if (video) {
      data.videos.set(videoId, { ...video, ...updates });
    }
  }

  /**
   * 根据 ID 获取评论完整数据
   * @param {string} accountId - 账号ID
   * @param {string} commentId - 评论ID
   * @returns {Object|null} 评论对象或 null
   */
  getCommentById(accountId, commentId) {
    if (!this.accountData || !this.accountData.has(accountId)) {
      return null;
    }
    const data = this.accountData.get(accountId);
    return data.comments.get(commentId) || null;
  }

  /**
   * 获取账号的所有评论
   * @param {string} accountId - 账号ID
   * @returns {Array} 所有评论数组
   */
  getAllComments(accountId) {
    if (!this.accountData || !this.accountData.has(accountId)) {
      return [];
    }
    const data = this.accountData.get(accountId);
    return Array.from(data.comments.values());
  }

  /**
   * 根据 ID 获取私信完整数据
   * @param {string} accountId - 账号ID
   * @param {string} messageId - 私信ID
   * @returns {Object|null} 私信对象或 null
   */
  getMessageById(accountId, messageId) {
    if (!this.accountData || !this.accountData.has(accountId)) {
      return null;
    }
    const data = this.accountData.get(accountId);
    return data.directMessages.get(messageId) || null;
  }
}

// 单例模式
let instance = null;

function getCacheManager() {
  if (!instance) {
    instance = new CacheManager();
  }
  return instance;
}

module.exports = {
  CacheManager,
  getCacheManager,
};
