/**
 * Message Receiver
 * T059: Worker 消息接收和处理
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const {
  WORKER_MESSAGE_DETECTED,
  WORKER_MESSAGE_ACK,
  createMessage,
} = require('@hiscrm-im/shared/protocol/messages');
const { Comment } = require('@hiscrm-im/shared/models/Comment');
const { DirectMessage } = require('@hiscrm-im/shared/models/DirectMessage');
const Notification = require('@hiscrm-im/shared/models/Notification');
const CommentsDAO = require('../database/comments-dao');
const DirectMessagesDAO = require('../database/messages-dao');

const logger = createLogger('message-receiver');

/**
 * Message Receiver 类
 * 接收 Worker 上报的消息检测结果并保存到数据库
 */
class MessageReceiver {
  constructor(db, notificationQueue = null) {
    this.db = db;
    this.commentsDAO = new CommentsDAO(db);
    this.messagesDAO = new DirectMessagesDAO(db);
    this.notificationQueue = notificationQueue;
  }

  /**
   * 处理 worker:message:detected 消息
   * @param {Socket} socket - Worker socket
   * @param {object} message - 消息对象
   * @returns {Promise<void>}
   */
  async handleMessageDetected(socket, message) {
    const { payload } = message;
    const { account_id, message_type, data } = payload;

    try {
      logger.info(`Message detected from worker ${socket.workerId}:`, {
        account_id,
        message_type,
      });

      let savedMessage;

      if (message_type === 'comment') {
        savedMessage = await this.handleComment(account_id, data);
      } else if (message_type === 'direct_message') {
        savedMessage = await this.handleDirectMessage(account_id, data);
      } else {
        throw new Error(`Unknown message type: ${message_type}`);
      }

      // 发送 ACK 确认
      const ackMessage = createMessage(WORKER_MESSAGE_ACK, {
        success: true,
        message_id: savedMessage.id,
      });

      socket.emit('message', ackMessage);

      logger.info(`Message saved successfully: ${savedMessage.id}`);

      // 创建并入队通知 (Phase 5)
      if (this.notificationQueue) {
        try {
          const notification =
            message_type === 'comment'
              ? Notification.fromComment(savedMessage)
              : Notification.fromDirectMessage(savedMessage);

          this.notificationQueue.enqueue(notification);
          logger.info(`Notification enqueued: ${notification.id} (${notification.type})`);
        } catch (error) {
          logger.error('Failed to enqueue notification:', error);
          // 不影响消息保存流程
        }
      }
    } catch (error) {
      logger.error('Failed to handle message detected:', error);

      // 发送错误 ACK
      const errorMessage = createMessage(WORKER_MESSAGE_ACK, {
        success: false,
        error: error.message,
      });

      socket.emit('message', errorMessage);
    }
  }

  /**
   * 处理评论
   * @param {string} accountId - 账户ID
   * @param {object} data - 评论数据
   * @returns {Promise<Comment>}
   */
  async handleComment(accountId, data) {
    // 检查是否已存在(避免重复)
    if (data.platform_comment_id) {
      const exists = this.commentsDAO.exists(accountId, data.platform_comment_id);
      if (exists) {
        logger.debug(`Comment already exists: ${data.platform_comment_id}`);
        // 返回已存在的评论
        const comments = this.commentsDAO.findAll({
          account_id: accountId,
          limit: 1,
        });
        if (comments.length > 0) {
          return comments[0];
        }
      }
    }

    // 创建新评论
    const comment = Comment.fromWorkerMessage(accountId, data);
    return this.commentsDAO.create(comment);
  }

  /**
   * 处理私信
   * @param {string} accountId - 账户ID
   * @param {object} data - 私信数据
   * @returns {Promise<DirectMessage>}
   */
  async handleDirectMessage(accountId, data) {
    // 检查是否已存在(避免重复)
    if (data.platform_message_id) {
      const exists = this.messagesDAO.exists(accountId, data.platform_message_id);
      if (exists) {
        logger.debug(`Direct message already exists: ${data.platform_message_id}`);
        // 返回已存在的私信
        const messages = this.messagesDAO.findAll({
          account_id: accountId,
          limit: 1,
        });
        if (messages.length > 0) {
          return messages[0];
        }
      }
    }

    // 创建新私信
    const message = DirectMessage.fromWorkerMessage(accountId, data);
    return this.messagesDAO.create(message);
  }

  /**
   * 获取处理函数(用于注册到 Socket.IO)
   * @returns {function}
   */
  getHandler() {
    return (socket, message) => this.handleMessageDetected(socket, message);
  }
}

module.exports = MessageReceiver;
