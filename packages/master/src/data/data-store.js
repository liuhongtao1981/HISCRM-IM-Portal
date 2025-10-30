/**
 * Data Store - Master 端内存数据存储
 * 存储 Worker 推送的爬虫数据，供 IM 接口快速访问
 *
 * 数据结构:
 * accounts: Map<accountId, AccountData>
 * AccountData = {
 *   accountId, platform, lastUpdate,
 *   data: { comments: Map, contents: Map, conversations: Map, messages: Map }
 * }
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('data-store');

class DataStore {
  constructor() {
    // 账户数据存储: accountId -> AccountData
    this.accounts = new Map();

    // 统计信息
    this.stats = {
      totalAccounts: 0,
      totalComments: 0,
      totalContents: 0,
      totalConversations: 0,
      totalMessages: 0,
      lastUpdate: null,
    };
  }

  /**
   * 更新账户数据（接收 Worker 完整快照）
   * @param {string} accountId - 账户ID
   * @param {object} snapshot - 数据快照 { platform, data: { comments, contents, conversations, messages } }
   */
  updateAccountData(accountId, snapshot) {
    try {
      const { platform, data } = snapshot;

      // 创建或获取账户数据
      let accountData = this.accounts.get(accountId);
      if (!accountData) {
        accountData = {
          accountId,
          platform,
          lastUpdate: Date.now(),
          data: {
            comments: new Map(),
            contents: new Map(),
            conversations: new Map(),
            messages: new Map(),
            notifications: new Map(),
          },
        };
        this.accounts.set(accountId, accountData);
        this.stats.totalAccounts++;
        logger.info(`Created new account data store: ${accountId} (${platform})`);
      }

      // 更新数据（完全替换）
      accountData.lastUpdate = Date.now();
      accountData.platform = platform;

      // 更新评论
      if (data.comments && Array.isArray(data.comments)) {
        accountData.data.comments.clear();
        data.comments.forEach((comment) => {
          accountData.data.comments.set(comment.id, comment);
        });
        logger.debug(`Updated ${data.comments.length} comments for ${accountId}`);
      }

      // 更新作品
      if (data.contents && Array.isArray(data.contents)) {
        accountData.data.contents.clear();
        data.contents.forEach((content) => {
          accountData.data.contents.set(content.id, content);
        });
        logger.debug(`Updated ${data.contents.length} contents for ${accountId}`);
      }

      // 更新会话
      if (data.conversations && Array.isArray(data.conversations)) {
        accountData.data.conversations.clear();
        data.conversations.forEach((conversation) => {
          accountData.data.conversations.set(conversation.id, conversation);
        });
        logger.debug(`Updated ${data.conversations.length} conversations for ${accountId}`);
      }

      // 更新私信
      if (data.messages && Array.isArray(data.messages)) {
        accountData.data.messages.clear();
        data.messages.forEach((message) => {
          accountData.data.messages.set(message.id, message);
        });
        logger.debug(`Updated ${data.messages.length} messages for ${accountId}`);
      }

      // 更新通知
      if (data.notifications && Array.isArray(data.notifications)) {
        accountData.data.notifications.clear();
        data.notifications.forEach((notification) => {
          accountData.data.notifications.set(notification.id, notification);
        });
        logger.debug(`Updated ${data.notifications.length} notifications for ${accountId}`);
      }

      // 更新统计
      this.updateStats();

      logger.info(`Account data updated: ${accountId}`, {
        comments: accountData.data.comments.size,
        contents: accountData.data.contents.size,
        conversations: accountData.data.conversations.size,
        messages: accountData.data.messages.size,
      });

      return true;
    } catch (error) {
      logger.error(`Failed to update account data: ${accountId}`, error);
      return false;
    }
  }

  /**
   * 更新统计信息
   */
  updateStats() {
    this.stats.totalComments = 0;
    this.stats.totalContents = 0;
    this.stats.totalConversations = 0;
    this.stats.totalMessages = 0;

    for (const accountData of this.accounts.values()) {
      this.stats.totalComments += accountData.data.comments.size;
      this.stats.totalContents += accountData.data.contents.size;
      this.stats.totalConversations += accountData.data.conversations.size;
      this.stats.totalMessages += accountData.data.messages.size;
    }

    this.stats.lastUpdate = Date.now();
  }

  /**
   * 获取会话列表
   * @param {string} accountId - 账户ID
   * @param {object} filters - 过滤条件 { status, is_pinned, is_muted, limit, offset }
   * @returns {Array} 会话数组
   */
  getConversations(accountId, filters = {}) {
    const accountData = this.accounts.get(accountId);
    if (!accountData) {
      logger.warn(`Account not found: ${accountId}`);
      return [];
    }

    let conversations = Array.from(accountData.data.conversations.values());

    // 应用过滤条件
    if (filters.status) {
      conversations = conversations.filter((c) => c.status === filters.status);
    }

    if (filters.is_pinned !== undefined) {
      conversations = conversations.filter((c) => c.is_pinned === filters.is_pinned);
    }

    if (filters.is_muted !== undefined) {
      conversations = conversations.filter((c) => c.is_muted === filters.is_muted);
    }

    // 排序：置顶 > 最后消息时间
    conversations.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) {
        return a.is_pinned ? -1 : 1;
      }
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });

    // 分页
    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    return conversations.slice(offset, offset + limit);
  }

  /**
   * 获取单个会话
   * @param {string} accountId - 账户ID
   * @param {string} conversationId - 会话ID
   * @returns {object|null} 会话对象
   */
  getConversation(accountId, conversationId) {
    const accountData = this.accounts.get(accountId);
    if (!accountData) return null;

    return accountData.data.conversations.get(conversationId) || null;
  }

  /**
   * 获取私信列表
   * @param {string} accountId - 账户ID
   * @param {string} conversationId - 会话ID
   * @param {object} filters - 过滤条件 { limit, offset, before, after }
   * @returns {Array} 私信数组
   */
  getMessages(accountId, conversationId, filters = {}) {
    const accountData = this.accounts.get(accountId);
    if (!accountData) {
      logger.warn(`Account not found: ${accountId}`);
      return [];
    }

    let messages = Array.from(accountData.data.messages.values());

    // 过滤会话
    if (conversationId) {
      messages = messages.filter((m) => m.conversationId === conversationId);
    }

    // 时间过滤
    if (filters.before) {
      messages = messages.filter((m) => new Date(m.createdAt).getTime() < filters.before);
    }

    if (filters.after) {
      messages = messages.filter((m) => new Date(m.createdAt).getTime() > filters.after);
    }

    // 按时间排序（倒序）
    messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 分页
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    return messages.slice(offset, offset + limit);
  }

  /**
   * 获取作品列表
   * @param {string} accountId - 账户ID
   * @param {object} filters - 过滤条件 { type, status, limit, offset }
   * @returns {Array} 作品数组
   */
  getContents(accountId, filters = {}) {
    const accountData = this.accounts.get(accountId);
    if (!accountData) {
      logger.warn(`Account not found: ${accountId}`);
      return [];
    }

    let contents = Array.from(accountData.data.contents.values());

    // 类型过滤
    if (filters.type) {
      contents = contents.filter((c) => c.type === filters.type);
    }

    // 状态过滤
    if (filters.status) {
      contents = contents.filter((c) => c.status === filters.status);
    }

    // 按发布时间排序（倒序）
    contents.sort((a, b) => {
      const timeA = new Date(a.publishTime).getTime() || 0;
      const timeB = new Date(b.publishTime).getTime() || 0;
      return timeB - timeA;
    });

    // 分页
    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    return contents.slice(offset, offset + limit);
  }

  /**
   * 获取单个作品
   * @param {string} accountId - 账户ID
   * @param {string} contentId - 作品ID
   * @returns {object|null} 作品对象
   */
  getContent(accountId, contentId) {
    const accountData = this.accounts.get(accountId);
    if (!accountData) return null;

    return accountData.data.contents.get(contentId) || null;
  }

  /**
   * 获取评论列表
   * @param {string} accountId - 账户ID
   * @param {string} contentId - 作品ID（可选）
   * @param {object} filters - 过滤条件 { status, limit, offset }
   * @returns {Array} 评论数组
   */
  getComments(accountId, contentId = null, filters = {}) {
    const accountData = this.accounts.get(accountId);
    if (!accountData) {
      logger.warn(`Account not found: ${accountId}`);
      return [];
    }

    let comments = Array.from(accountData.data.comments.values());

    // 过滤作品
    if (contentId) {
      comments = comments.filter((c) => c.contentId === contentId);
    }

    // 状态过滤
    if (filters.status) {
      comments = comments.filter((c) => c.status === filters.status);
    }

    // 按创建时间排序（倒序）
    comments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // 分页
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    return comments.slice(offset, offset + limit);
  }

  /**
   * 获取通知列表
   * @param {string} accountId - 账户ID
   * @param {object} filters - 过滤条件 { type, is_read, limit, offset }
   * @returns {Array} 通知数组
   */
  getNotifications(accountId, filters = {}) {
    const accountData = this.accounts.get(accountId);
    if (!accountData) {
      logger.warn(`Account not found: ${accountId}`);
      return [];
    }

    let notifications = Array.from(accountData.data.notifications.values());

    // 类型过滤
    if (filters.type) {
      notifications = notifications.filter((n) => n.type === filters.type);
    }

    // 已读过滤
    if (filters.is_read !== undefined) {
      notifications = notifications.filter((n) => n.is_read === filters.is_read);
    }

    // 按时间排序（倒序）
    notifications.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    // 分页
    const offset = filters.offset || 0;
    const limit = filters.limit || 20;
    return notifications.slice(offset, offset + limit);
  }

  /**
   * 获取统计信息
   * @returns {object} 统计对象
   */
  getStats() {
    return {
      ...this.stats,
      totalAccounts: this.accounts.size,
    };
  }

  /**
   * 清空指定账户数据
   * @param {string} accountId - 账户ID
   */
  clearAccount(accountId) {
    const accountData = this.accounts.get(accountId);
    if (accountData) {
      accountData.data.comments.clear();
      accountData.data.contents.clear();
      accountData.data.conversations.clear();
      accountData.data.messages.clear();
      accountData.data.notifications.clear();

      logger.info(`Cleared data for account: ${accountId}`);
      this.updateStats();
    }
  }

  /**
   * 删除账户数据
   * @param {string} accountId - 账户ID
   */
  deleteAccount(accountId) {
    if (this.accounts.delete(accountId)) {
      logger.info(`Deleted account data: ${accountId}`);
      this.updateStats();
      return true;
    }
    return false;
  }

  /**
   * 清空所有数据
   */
  clearAll() {
    this.accounts.clear();
    this.stats = {
      totalAccounts: 0,
      totalComments: 0,
      totalContents: 0,
      totalConversations: 0,
      totalMessages: 0,
      lastUpdate: null,
    };
    logger.warn('All data cleared');
  }

  /**
   * 导出快照（用于持久化）
   * @returns {object} 完整快照对象
   */
  exportSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      stats: this.getStats(),
      accounts: {},
    };

    for (const [accountId, accountData] of this.accounts.entries()) {
      snapshot.accounts[accountId] = {
        accountId: accountData.accountId,
        platform: accountData.platform,
        lastUpdate: accountData.lastUpdate,
        data: {
          comments: Array.from(accountData.data.comments.values()),
          contents: Array.from(accountData.data.contents.values()),
          conversations: Array.from(accountData.data.conversations.values()),
          messages: Array.from(accountData.data.messages.values()),
          notifications: Array.from(accountData.data.notifications.values()),
        },
      };
    }

    return snapshot;
  }

  /**
   * 导入快照（从持久化恢复）
   * @param {object} snapshot - 快照对象
   */
  importSnapshot(snapshot) {
    try {
      this.clearAll();

      for (const [accountId, accountData] of Object.entries(snapshot.accounts)) {
        this.updateAccountData(accountId, accountData);
      }

      logger.info('Snapshot imported successfully', {
        accounts: this.accounts.size,
        timestamp: snapshot.timestamp,
      });

      return true;
    } catch (error) {
      logger.error('Failed to import snapshot:', error);
      return false;
    }
  }
}

module.exports = DataStore;
