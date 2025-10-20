/**
 * Message Reporter
 * T054: 消息上报器 - 向 Master 发送检测到的消息
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const {
  WORKER_MESSAGE_DETECTED,
  createMessage,
} = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('message-reporter');

/**
 * Message Reporter 类
 * 负责将检测到的评论和私信上报给 Master
 */
class MessageReporter {
  constructor(socketClient) {
    this.socketClient = socketClient;
  }

  /**
   * 上报评论
   * @param {string} accountId - 账户ID
   * @param {Array} comments - 评论数组
   */
  reportComments(accountId, comments) {
    if (!Array.isArray(comments) || comments.length === 0) {
      return;
    }

    logger.info(`Reporting ${comments.length} comments for account ${accountId}`);

    for (const comment of comments) {
      this.reportMessage(accountId, 'comment', comment);
    }
  }

  /**
   * 上报私信
   * @param {string} accountId - 账户ID
   * @param {Array} messages - 私信数组
   */
  reportDirectMessages(accountId, messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    logger.info(`Reporting ${messages.length} direct messages for account ${accountId}`);

    for (const message of messages) {
      this.reportMessage(accountId, 'direct_message', message);
    }
  }

  /**
   * 上报会话 (Phase 8 新增)
   * @param {string} accountId - 账户ID
   * @param {Array} conversations - 会话数组
   */
  reportConversations(accountId, conversations) {
    if (!Array.isArray(conversations) || conversations.length === 0) {
      return;
    }

    logger.info(`Reporting ${conversations.length} conversations for account ${accountId}`);

    // 会话数据通过 worker:bulk_insert_conversations 直接发送到 Master
    // 这里只记录日志，实际数据通过 platform.js 的 sendConversationsToMaster 发送
    logger.debug(`Conversations data available for account ${accountId}:`, {
      count: conversations.length,
      platformUserIds: conversations.map(c => c.platform_user_id).slice(0, 5),
    });
  }

  /**
   * 上报单条消息
   * @param {string} accountId - 账户ID
   * @param {string} messageType - 消息类型 ('comment' | 'direct_message')
   * @param {object} data - 消息数据
   */
  reportMessage(accountId, messageType, data) {
    try {
      const message = createMessage(WORKER_MESSAGE_DETECTED, {
        account_id: accountId,
        message_type: messageType,
        data: data,
      });

      this.socketClient.sendMessage(message);

      logger.debug(`Reported ${messageType} to master:`, {
        account_id: accountId,
        message_id: data.platform_comment_id || data.platform_message_id,
      });
    } catch (error) {
      logger.error('Failed to report message:', error);
    }
  }

  /**
   * 批量上报消息
   * @param {string} accountId - 账户ID
   * @param {object} detectedMessages - 检测到的消息 { comments: [], directMessages: [], conversations: [] }
   */
  reportAll(accountId, detectedMessages) {
    if (detectedMessages.comments && detectedMessages.comments.length > 0) {
      this.reportComments(accountId, detectedMessages.comments);
    }

    if (detectedMessages.directMessages && detectedMessages.directMessages.length > 0) {
      this.reportDirectMessages(accountId, detectedMessages.directMessages);
    }

    // Phase 8 新增: 上报会话数据
    if (detectedMessages.conversations && detectedMessages.conversations.length > 0) {
      this.reportConversations(accountId, detectedMessages.conversations);
    }

    const totalReported =
      (detectedMessages.comments?.length || 0) +
      (detectedMessages.directMessages?.length || 0);

    logger.info(`Total reported ${totalReported} messages + ${detectedMessages.conversations?.length || 0} conversations for account ${accountId}`);
  }
}

module.exports = MessageReporter;
