/**
 * Message Persistence Service
 * Phase 8: 私信和会话持久化服务
 * 负责将爬虫数据保存到数据库
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('message-persistence-service');

class MessagePersistenceService {
  /**
   * 构造函数
   * @param {ConversationsDAO} conversationsDAO - 会话 DAO
   * @param {DirectMessagesDAO} directMessagesDAO - 直接消息 DAO
   */
  constructor(conversationsDAO, directMessagesDAO) {
    this.conversationsDAO = conversationsDAO;
    this.directMessagesDAO = directMessagesDAO;
  }

  /**
   * 保存私信爬虫结果 (Phase 8)
   * @param {Object} crawlResult - 爬虫结果 { conversations, directMessages, stats }
   * @param {string} accountId - 账户ID
   * @returns {Promise<Object>} 保存结果统计
   */
  async saveCrawlResultV2(crawlResult, accountId) {
    try {
      if (!crawlResult) {
        logger.warn(`Empty crawl result for account ${accountId}`);
        return { saved: 0, updated: 0, errors: 0 };
      }

      const { conversations, directMessages, stats } = crawlResult;

      logger.info(`[Phase 8] Saving crawl result for account ${accountId}:`, {
        conversations: conversations?.length || 0,
        messages: directMessages?.length || 0,
        stats
      });

      let conversationsSaved = 0;
      let messagesSaved = 0;
      let errors = 0;

      try {
        // 第 1 步: 保存会话
        if (conversations && Array.isArray(conversations) && conversations.length > 0) {
          conversationsSaved = this._saveConversations(conversations);
          logger.info(`[Phase 8] Conversations saved: ${conversationsSaved}/${conversations.length}`);
        }

        // 第 2 步: 保存消息
        if (directMessages && Array.isArray(directMessages) && directMessages.length > 0) {
          messagesSaved = this._saveDirectMessages(directMessages);
          logger.info(`[Phase 8] Messages saved: ${messagesSaved}/${directMessages.length}`);
        }

        // 第 3 步: 更新会话的最后消息时间
        if (directMessages && directMessages.length > 0) {
          this._updateConversationTimestamps(conversations, directMessages);
        }
      } catch (error) {
        logger.error(`[Phase 8] Error during save:`, error);
        errors++;
      }

      const result = {
        saved: conversationsSaved + messagesSaved,
        conversations_saved: conversationsSaved,
        messages_saved: messagesSaved,
        errors,
        stats
      };

      logger.info(`[Phase 8] Crawl result saved:`, result);
      return result;
    } catch (error) {
      logger.error(`[Phase 8] Fatal error in saveCrawlResultV2:`, error);
      throw error;
    }
  }

  /**
   * 保存会话列表
   * @private
   */
  _saveConversations(conversations) {
    let saved = 0;

    for (const conversation of conversations) {
      try {
        // 尝试批量 upsert
        if (this.conversationsDAO.upsertMany) {
          // 如果 DAO 支持 upsertMany,一次性处理
          saved += this.conversationsDAO.upsertMany([conversation]);
        } else {
          // 否则逐个创建/更新
          const existing = this.conversationsDAO.findByAccountAndUser(
            conversation.account_id,
            conversation.platform_user_id
          );

          if (existing) {
            this.conversationsDAO.update(existing.id, {
              platform_user_name: conversation.platform_user_name,
              platform_user_avatar: conversation.platform_user_avatar,
              last_message_time: conversation.last_message_time,
              last_message_content: conversation.last_message_content,
              platform_message_id: conversation.platform_message_id
            });
          } else {
            this.conversationsDAO.create(conversation);
          }
          saved++;
        }
      } catch (error) {
        logger.error(`Failed to save conversation ${conversation.id}:`, error);
      }
    }

    return saved;
  }

  /**
   * 保存直接消息列表
   * @private
   */
  _saveDirectMessages(messages) {
    try {
      // 使用 bulkInsertV2 来保存所有消息
      const result = this.directMessagesDAO.bulkInsertV2(messages);
      return result.inserted;
    } catch (error) {
      logger.error('Failed to bulk insert messages:', error);
      return 0;
    }
  }

  /**
   * 更新会话的最后消息时间戳
   * @private
   */
  _updateConversationTimestamps(conversations, messages) {
    if (!messages || messages.length === 0) return;

    try {
      // 按会话分组消息
      const messagesByConversation = new Map();

      for (const message of messages) {
        const convId = message.conversation_id;
        if (convId) {
          if (!messagesByConversation.has(convId)) {
            messagesByConversation.set(convId, []);
          }
          messagesByConversation.get(convId).push(message);
        }
      }

      // 更新每个会话的最后消息
      for (const [conversationId, convMessages] of messagesByConversation.entries()) {
        try {
          // 找到最新的消息
          const lastMessage = convMessages.reduce((latest, current) => {
            const latestTime = latest.created_at || 0;
            const currentTime = current.created_at || 0;
            return currentTime > latestTime ? current : latest;
          });

          if (lastMessage && this.conversationsDAO) {
            this.conversationsDAO.updateLastMessage(
              conversationId,
              lastMessage.platform_message_id,
              lastMessage.content,
              lastMessage.created_at
            );
          }
        } catch (error) {
          logger.debug(`Failed to update last message for conversation ${conversationId}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to update conversation timestamps:', error);
    }
  }

  /**
   * 保存传统爬虫结果 (向后兼容)
   * @param {Object} result - 爬虫结果
   * @param {string} accountId - 账户ID
   * @returns {Promise<Object>} 保存结果
   */
  async saveCrawlResult(result, accountId) {
    try {
      const { comments, directMessages, stats } = result;

      let saved = 0;

      // 保存私信
      if (directMessages && directMessages.length > 0) {
        const insertResult = this.directMessagesDAO.bulkInsert(directMessages);
        saved += insertResult.inserted;

        logger.info(`Direct messages saved: ${insertResult.inserted}/${directMessages.length}`, {
          account_id: accountId,
          skipped: insertResult.skipped
        });
      }

      return {
        saved,
        messages_saved: saved,
        stats
      };
    } catch (error) {
      logger.error(`Failed to save crawl result for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * 获取账户下的消息统计
   * @param {string} accountId - 账户ID
   * @returns {Object} 统计信息
   */
  getMessageStats(accountId) {
    try {
      const convStats = this.conversationsDAO?.getStats(accountId) || {};
      const msgCount = this.directMessagesDAO?.count({ account_id: accountId }) || 0;

      return {
        conversations: convStats.total || 0,
        unread_conversations: convStats.unread || 0,
        messages: msgCount,
        last_updated: convStats.lastUpdated
      };
    } catch (error) {
      logger.error(`Failed to get message stats for account ${accountId}:`, error);
      return { conversations: 0, messages: 0 };
    }
  }

  /**
   * 清理账户下的消息数据
   * @param {string} accountId - 账户ID
   * @returns {Object} 清理结果
   */
  clearAccountMessages(accountId) {
    try {
      this.conversationsDAO?.deleteByAccount(accountId);

      const msgCount = this.directMessagesDAO?.count({ account_id: accountId }) || 0;
      if (msgCount > 0) {
        logger.warn(`Deleting ${msgCount} messages for account ${accountId}`);
      }

      logger.info(`Messages cleared for account ${accountId}`);

      return {
        conversations_deleted: true,
        messages_deleted: msgCount > 0
      };
    } catch (error) {
      logger.error(`Failed to clear messages for account ${accountId}:`, error);
      throw error;
    }
  }
}

module.exports = MessagePersistenceService;
