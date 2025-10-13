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
   * @param {object} detectedMessages - 检测到的消息 { comments: [], directMessages: [] }
   */
  reportAll(accountId, detectedMessages) {
    if (detectedMessages.comments && detectedMessages.comments.length > 0) {
      this.reportComments(accountId, detectedMessages.comments);
    }

    if (detectedMessages.directMessages && detectedMessages.directMessages.length > 0) {
      this.reportDirectMessages(accountId, detectedMessages.directMessages);
    }

    const totalReported =
      (detectedMessages.comments?.length || 0) +
      (detectedMessages.directMessages?.length || 0);

    logger.info(`Total reported ${totalReported} messages for account ${accountId}`);
  }
}

module.exports = MessageReporter;
