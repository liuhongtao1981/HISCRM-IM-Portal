/**
 * Cache DAO - 缓存数据访问层
 * 提供对缓存数据库表的 CRUD 操作
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('cache-dao');

class CacheDAO {
  constructor(db) {
    this.db = db;
    this.preparedStmts = this.prepareStatements();
  }

  /**
   * 预编译 SQL 语句
   */
  prepareStatements() {
    return {
      // Metadata
      upsertMetadata: this.db.prepare(`
        INSERT OR REPLACE INTO cache_metadata (
          account_id, platform, last_update, last_persist, last_load,
          comments_count, contents_count, conversations_count, messages_count, notifications_count,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      getMetadata: this.db.prepare(`
        SELECT * FROM cache_metadata WHERE account_id = ?
      `),

      getAllMetadata: this.db.prepare(`
        SELECT * FROM cache_metadata ORDER BY last_update DESC
      `),

      deleteMetadata: this.db.prepare(`
        DELETE FROM cache_metadata WHERE account_id = ?
      `),

      // Comments
      upsertComment: this.db.prepare(`
        INSERT OR REPLACE INTO cache_comments (
          id, account_id, content_id, data, created_at, updated_at, persist_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `),

      getCommentsByAccount: this.db.prepare(`
        SELECT * FROM cache_comments
        WHERE account_id = ?
        ORDER BY created_at DESC
      `),

      deleteCommentsByAccount: this.db.prepare(`
        DELETE FROM cache_comments WHERE account_id = ?
      `),

      cleanExpiredComments: this.db.prepare(`
        DELETE FROM cache_comments WHERE created_at < ?
      `),

      // Contents
      upsertContent: this.db.prepare(`
        INSERT OR REPLACE INTO cache_contents (
          id, account_id, data, publish_time, updated_at, persist_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `),

      getContentsByAccount: this.db.prepare(`
        SELECT * FROM cache_contents
        WHERE account_id = ?
        ORDER BY publish_time DESC
      `),

      deleteContentsByAccount: this.db.prepare(`
        DELETE FROM cache_contents WHERE account_id = ?
      `),

      cleanExpiredContents: this.db.prepare(`
        DELETE FROM cache_contents WHERE publish_time < ?
      `),

      // Conversations
      upsertConversation: this.db.prepare(`
        INSERT OR REPLACE INTO cache_conversations (
          id, account_id, user_id, data, last_message_time, updated_at, persist_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `),

      getConversationsByAccount: this.db.prepare(`
        SELECT * FROM cache_conversations
        WHERE account_id = ?
        ORDER BY last_message_time DESC
      `),

      deleteConversationsByAccount: this.db.prepare(`
        DELETE FROM cache_conversations WHERE account_id = ?
      `),

      cleanExpiredConversations: this.db.prepare(`
        DELETE FROM cache_conversations WHERE last_message_time < ?
      `),

      // Messages
      upsertMessage: this.db.prepare(`
        INSERT OR REPLACE INTO cache_messages (
          id, account_id, conversation_id, data, created_at, updated_at, persist_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `),

      getMessagesByAccount: this.db.prepare(`
        SELECT * FROM cache_messages
        WHERE account_id = ?
        ORDER BY created_at DESC
      `),

      deleteMessagesByAccount: this.db.prepare(`
        DELETE FROM cache_messages WHERE account_id = ?
      `),

      cleanExpiredMessages: this.db.prepare(`
        DELETE FROM cache_messages WHERE created_at < ?
      `),

      // Notifications
      upsertNotification: this.db.prepare(`
        INSERT OR REPLACE INTO cache_notifications (
          id, account_id, data, created_at, updated_at, persist_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `),

      getNotificationsByAccount: this.db.prepare(`
        SELECT * FROM cache_notifications
        WHERE account_id = ?
        ORDER BY created_at DESC
      `),

      deleteNotificationsByAccount: this.db.prepare(`
        DELETE FROM cache_notifications WHERE account_id = ?
      `),

      cleanExpiredNotifications: this.db.prepare(`
        DELETE FROM cache_notifications WHERE created_at < ?
      `),
    };
  }

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  /**
   * 插入或更新元数据
   */
  upsertMetadata(metadata) {
    const {
      account_id,
      platform,
      last_update,
      last_persist,
      last_load = null,
      comments_count = 0,
      contents_count = 0,
      conversations_count = 0,
      messages_count = 0,
      notifications_count = 0,
    } = metadata;

    const now = Math.floor(Date.now() / 1000);

    this.preparedStmts.upsertMetadata.run(
      account_id,
      platform,
      last_update,
      last_persist,
      last_load,
      comments_count,
      contents_count,
      conversations_count,
      messages_count,
      notifications_count,
      now,
      now
    );
  }

  /**
   * 获取账户元数据
   */
  getMetadata(accountId) {
    return this.preparedStmts.getMetadata.get(accountId);
  }

  /**
   * 获取所有元数据
   */
  getAllMetadata() {
    return this.preparedStmts.getAllMetadata.all();
  }

  /**
   * 删除账户元数据
   */
  deleteMetadata(accountId) {
    const result = this.preparedStmts.deleteMetadata.run(accountId);
    return result.changes;
  }

  // ============================================================================
  // Comments Operations
  // ============================================================================

  /**
   * 批量插入或更新评论
   */
  batchUpsertComments(accountId, comments) {
    if (!comments || comments.length === 0) return 0;

    const now = Date.now();
    let count = 0;

    const transaction = this.db.transaction((comments) => {
      for (const comment of comments) {
        this.preparedStmts.upsertComment.run(
          comment.id,
          accountId,
          comment.contentId || null,
          JSON.stringify(comment),
          comment.createdAt || now,
          now,
          now
        );
        count++;
      }
    });

    transaction(comments);
    return count;
  }

  /**
   * 获取账户的所有评论
   */
  getCommentsByAccount(accountId) {
    return this.preparedStmts.getCommentsByAccount.all(accountId);
  }

  /**
   * 删除账户的所有评论
   */
  deleteCommentsByAccount(accountId) {
    const result = this.preparedStmts.deleteCommentsByAccount.run(accountId);
    return result.changes;
  }

  /**
   * 清理过期评论
   */
  cleanExpiredComments(expireTime) {
    const result = this.preparedStmts.cleanExpiredComments.run(expireTime);
    return result.changes;
  }

  // ============================================================================
  // Contents Operations
  // ============================================================================

  /**
   * 批量插入或更新作品
   */
  batchUpsertContents(accountId, contents) {
    if (!contents || contents.length === 0) return 0;

    const now = Date.now();
    let count = 0;

    const transaction = this.db.transaction((contents) => {
      for (const content of contents) {
        this.preparedStmts.upsertContent.run(
          content.id,
          accountId,
          JSON.stringify(content),
          content.publishTime || now,
          now,
          now
        );
        count++;
      }
    });

    transaction(contents);
    return count;
  }

  /**
   * 获取账户的所有作品
   */
  getContentsByAccount(accountId) {
    return this.preparedStmts.getContentsByAccount.all(accountId);
  }

  /**
   * 删除账户的所有作品
   */
  deleteContentsByAccount(accountId) {
    const result = this.preparedStmts.deleteContentsByAccount.run(accountId);
    return result.changes;
  }

  /**
   * 清理过期作品
   */
  cleanExpiredContents(expireTime) {
    if (expireTime === 0) return 0; // 永久保留
    const result = this.preparedStmts.cleanExpiredContents.run(expireTime);
    return result.changes;
  }

  // ============================================================================
  // Conversations Operations
  // ============================================================================

  /**
   * 批量插入或更新会话
   */
  batchUpsertConversations(accountId, conversations) {
    if (!conversations || conversations.length === 0) return 0;

    const now = Date.now();
    let count = 0;

    const transaction = this.db.transaction((conversations) => {
      for (const conversation of conversations) {
        this.preparedStmts.upsertConversation.run(
          conversation.id,
          accountId,
          conversation.userId || '',
          JSON.stringify(conversation),
          conversation.lastMessageTime || null,
          now,
          now
        );
        count++;
      }
    });

    transaction(conversations);
    return count;
  }

  /**
   * 获取账户的所有会话
   */
  getConversationsByAccount(accountId) {
    return this.preparedStmts.getConversationsByAccount.all(accountId);
  }

  /**
   * 删除账户的所有会话
   */
  deleteConversationsByAccount(accountId) {
    const result = this.preparedStmts.deleteConversationsByAccount.run(accountId);
    return result.changes;
  }

  /**
   * 清理过期会话
   */
  cleanExpiredConversations(expireTime) {
    const result = this.preparedStmts.cleanExpiredConversations.run(expireTime);
    return result.changes;
  }

  // ============================================================================
  // Messages Operations
  // ============================================================================

  /**
   * 批量插入或更新私信
   */
  batchUpsertMessages(accountId, messages) {
    if (!messages || messages.length === 0) return 0;

    const now = Date.now();
    let count = 0;

    const transaction = this.db.transaction((messages) => {
      for (const message of messages) {
        this.preparedStmts.upsertMessage.run(
          message.id,
          accountId,
          message.conversationId || '',
          JSON.stringify(message),
          message.createdAt || now,
          now,
          now
        );
        count++;
      }
    });

    transaction(messages);
    return count;
  }

  /**
   * 获取账户的所有私信
   */
  getMessagesByAccount(accountId) {
    return this.preparedStmts.getMessagesByAccount.all(accountId);
  }

  /**
   * 删除账户的所有私信
   */
  deleteMessagesByAccount(accountId) {
    const result = this.preparedStmts.deleteMessagesByAccount.run(accountId);
    return result.changes;
  }

  /**
   * 清理过期私信
   */
  cleanExpiredMessages(expireTime) {
    const result = this.preparedStmts.cleanExpiredMessages.run(expireTime);
    return result.changes;
  }

  // ============================================================================
  // Notifications Operations
  // ============================================================================

  /**
   * 批量插入或更新通知
   */
  batchUpsertNotifications(accountId, notifications) {
    if (!notifications || notifications.length === 0) return 0;

    const now = Date.now();
    let count = 0;

    const transaction = this.db.transaction((notifications) => {
      for (const notification of notifications) {
        this.preparedStmts.upsertNotification.run(
          notification.id,
          accountId,
          JSON.stringify(notification),
          notification.createdAt || now,
          now,
          now
        );
        count++;
      }
    });

    transaction(notifications);
    return count;
  }

  /**
   * 获取账户的所有通知
   */
  getNotificationsByAccount(accountId) {
    return this.preparedStmts.getNotificationsByAccount.all(accountId);
  }

  /**
   * 删除账户的所有通知
   */
  deleteNotificationsByAccount(accountId) {
    const result = this.preparedStmts.deleteNotificationsByAccount.run(accountId);
    return result.changes;
  }

  /**
   * 清理过期通知
   */
  cleanExpiredNotifications(expireTime) {
    const result = this.preparedStmts.cleanExpiredNotifications.run(expireTime);
    return result.changes;
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * 删除账户的所有数据
   */
  deleteAccountData(accountId) {
    const transaction = this.db.transaction(() => {
      this.deleteCommentsByAccount(accountId);
      this.deleteContentsByAccount(accountId);
      this.deleteConversationsByAccount(accountId);
      this.deleteMessagesByAccount(accountId);
      this.deleteNotificationsByAccount(accountId);
      this.deleteMetadata(accountId);
    });

    transaction();
  }

  /**
   * 清理所有过期数据
   */
  cleanAllExpiredData(retentionConfig) {
    const now = Date.now();

    const results = {
      comments: 0,
      contents: 0,
      conversations: 0,
      messages: 0,
      notifications: 0,
    };

    const transaction = this.db.transaction(() => {
      // 清理评论
      if (retentionConfig.comments > 0) {
        const expireTime = now - retentionConfig.comments;
        results.comments = this.cleanExpiredComments(expireTime);
      }

      // 清理作品
      if (retentionConfig.contents > 0) {
        const expireTime = now - retentionConfig.contents;
        results.contents = this.cleanExpiredContents(expireTime);
      }

      // 清理会话
      if (retentionConfig.conversations > 0) {
        const expireTime = now - retentionConfig.conversations;
        results.conversations = this.cleanExpiredConversations(expireTime);
      }

      // 清理私信
      if (retentionConfig.messages > 0) {
        const expireTime = now - retentionConfig.messages;
        results.messages = this.cleanExpiredMessages(expireTime);
      }

      // 清理通知
      if (retentionConfig.notifications > 0) {
        const expireTime = now - retentionConfig.notifications;
        results.notifications = this.cleanExpiredNotifications(expireTime);
      }
    });

    transaction();

    return results;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * 获取数据库统计信息
   */
  getStatistics() {
    const stats = {
      tables: {},
      total: 0,
    };

    const tables = ['comments', 'contents', 'conversations', 'messages', 'notifications'];

    for (const table of tables) {
      const result = this.db.prepare(`SELECT COUNT(*) as count FROM cache_${table}`).get();
      stats.tables[table] = result.count;
      stats.total += result.count;
    }

    // 获取元数据统计
    const metadataResult = this.db.prepare('SELECT COUNT(*) as count FROM cache_metadata').get();
    stats.accounts = metadataResult.count;

    return stats;
  }
}

module.exports = CacheDAO;
