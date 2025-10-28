/**
 * DataPusher - 数据推送接口
 * 负责将标准化数据推送到 Master 服务器
 *
 * 使用方式：
 * const pusher = new DataPusher(workerBridge);
 * await pusher.pushData(accountId, { conversations: [...], messages: [...] });
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage, MessageTypes } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('data-pusher');

class DataPusher {
  constructor(workerBridge) {
    this.workerBridge = workerBridge;
    this.pushQueue = new Map(); // accountId -> pending data
    this.isPushing = false;
  }

  /**
   * 推送数据到 Master
   * @param {string} accountId - 账户 ID
   * @param {Object} data - 标准化数据对象
   * @param {Array} data.conversations - 会话列表
   * @param {Array} data.messages - 消息列表
   * @param {Array} data.contents - 作品列表
   * @param {Array} data.comments - 评论列表
   * @param {Array} data.notifications - 通知列表
   * @returns {Promise<Object>} 推送结果
   */
  async pushData(accountId, data) {
    try {
      const startTime = Date.now();

      // 统计数据量
      const stats = {
        conversations: data.conversations?.length || 0,
        messages: data.messages?.length || 0,
        contents: data.contents?.length || 0,
        comments: data.comments?.length || 0,
        notifications: data.notifications?.length || 0,
      };

      const totalItems = Object.values(stats).reduce((a, b) => a + b, 0);

      if (totalItems === 0) {
        logger.debug(`[${accountId}] No data to push`);
        return {
          success: true,
          syncedIds: {
            conversations: [],
            messages: [],
            contents: [],
            comments: [],
            notifications: [],
          },
          stats,
        };
      }

      logger.info(`[${accountId}] Pushing ${totalItems} items to Master`, stats);

      // 按类型推送数据
      const syncedIds = {
        conversations: [],
        messages: [],
        contents: [],
        comments: [],
        notifications: [],
      };

      // 推送会话
      if (stats.conversations > 0) {
        const conversationIds = await this.pushConversations(accountId, data.conversations);
        syncedIds.conversations = conversationIds;
      }

      // 推送消息
      if (stats.messages > 0) {
        const messageIds = await this.pushMessages(accountId, data.messages);
        syncedIds.messages = messageIds;
      }

      // 推送作品
      if (stats.contents > 0) {
        const contentIds = await this.pushContents(accountId, data.contents);
        syncedIds.contents = contentIds;
      }

      // 推送评论
      if (stats.comments > 0) {
        const commentIds = await this.pushComments(accountId, data.comments);
        syncedIds.comments = commentIds;
      }

      // 推送通知
      if (stats.notifications > 0) {
        const notificationIds = await this.pushNotifications(accountId, data.notifications);
        syncedIds.notifications = notificationIds;
      }

      const duration = Date.now() - startTime;
      logger.info(`[${accountId}] Push completed in ${duration}ms`, stats);

      return {
        success: true,
        syncedIds,
        stats,
        duration,
      };

    } catch (error) {
      logger.error(`[${accountId}] Push failed:`, error);
      return {
        success: false,
        error: error.message,
        stats: {
          conversations: 0,
          messages: 0,
          contents: 0,
          comments: 0,
          notifications: 0,
        },
      };
    }
  }

  /**
   * 推送会话列表
   */
  async pushConversations(accountId, conversations) {
    if (!conversations || conversations.length === 0) return [];

    logger.debug(`[${accountId}] Pushing ${conversations.length} conversations`);

    const message = createMessage(MessageTypes.WORKER_CONVERSATIONS_UPDATE, {
      accountId,
      conversations: conversations.map(conv => ({
        conversationId: conv.conversationId,
        type: conv.type,
        userId: conv.userId,
        userName: conv.userName,
        userAvatar: conv.userAvatar,
        unreadCount: conv.unreadCount,
        lastMessageContent: conv.lastMessageContent,
        lastMessageTime: conv.lastMessageTime,
        lastMessageType: conv.lastMessageType,
        status: conv.status,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      })),
      timestamp: Date.now(),
    });

    await this.workerBridge.sendToMaster(message);

    // 返回已同步的 ID
    return conversations.map(conv => conv.id);
  }

  /**
   * 推送消息列表
   */
  async pushMessages(accountId, messages) {
    if (!messages || messages.length === 0) return [];

    logger.debug(`[${accountId}] Pushing ${messages.length} messages`);

    const message = createMessage(MessageTypes.WORKER_MESSAGES_UPDATE, {
      accountId,
      messages: messages.map(msg => ({
        messageId: msg.messageId,
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderAvatar: msg.senderAvatar,
        content: msg.content,
        messageType: msg.messageType,
        mediaUrls: msg.mediaUrls,
        replyToMessageId: msg.replyToMessageId,
        status: msg.status,
        isRead: msg.isRead,
        createdAt: msg.createdAt,
      })),
      timestamp: Date.now(),
    });

    await this.workerBridge.sendToMaster(message);

    return messages.map(msg => msg.id);
  }

  /**
   * 推送作品列表
   */
  async pushContents(accountId, contents) {
    if (!contents || contents.length === 0) return [];

    logger.debug(`[${accountId}] Pushing ${contents.length} contents`);

    const message = createMessage(MessageTypes.WORKER_CONTENTS_UPDATE, {
      accountId,
      contents: contents.map(content => ({
        contentId: content.contentId,
        type: content.type,
        title: content.title,
        coverUrl: content.coverUrl,
        mediaUrls: content.mediaUrls,
        viewCount: content.viewCount,
        likeCount: content.likeCount,
        commentCount: content.commentCount,
        shareCount: content.shareCount,
        publishTime: content.publishTime,
        tags: content.tags,
        status: content.status,
      })),
      timestamp: Date.now(),
    });

    await this.workerBridge.sendToMaster(message);

    return contents.map(content => content.id);
  }

  /**
   * 推送评论列表
   */
  async pushComments(accountId, comments) {
    if (!comments || comments.length === 0) return [];

    logger.debug(`[${accountId}] Pushing ${comments.length} comments`);

    const message = createMessage(MessageTypes.WORKER_COMMENTS_UPDATE, {
      accountId,
      comments: comments.map(comment => ({
        commentId: comment.commentId,
        contentId: comment.contentId,
        userId: comment.userId,
        userName: comment.userName,
        userAvatar: comment.userAvatar,
        content: comment.content,
        likeCount: comment.likeCount,
        replyCount: comment.replyCount,
        parentCommentId: comment.parentCommentId,
        status: comment.status,
        createdAt: comment.createdAt,
      })),
      timestamp: Date.now(),
    });

    await this.workerBridge.sendToMaster(message);

    return comments.map(comment => comment.id);
  }

  /**
   * 推送通知列表
   */
  async pushNotifications(accountId, notifications) {
    if (!notifications || notifications.length === 0) return [];

    logger.debug(`[${accountId}] Pushing ${notifications.length} notifications`);

    const message = createMessage(MessageTypes.WORKER_NOTIFICATIONS_UPDATE, {
      accountId,
      notifications: notifications.map(notification => ({
        notificationId: notification.notificationId,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        relatedId: notification.relatedId,
        relatedType: notification.relatedType,
        isRead: notification.isRead,
        status: notification.status,
        createdAt: notification.createdAt,
      })),
      timestamp: Date.now(),
    });

    await this.workerBridge.sendToMaster(message);

    return notifications.map(notification => notification.id);
  }

  /**
   * 添加到推送队列（用于批量推送）
   */
  queuePush(accountId, data) {
    if (!this.pushQueue.has(accountId)) {
      this.pushQueue.set(accountId, {
        conversations: [],
        messages: [],
        contents: [],
        comments: [],
        notifications: [],
      });
    }

    const queue = this.pushQueue.get(accountId);

    if (data.conversations) queue.conversations.push(...data.conversations);
    if (data.messages) queue.messages.push(...data.messages);
    if (data.contents) queue.contents.push(...data.contents);
    if (data.comments) queue.comments.push(...data.comments);
    if (data.notifications) queue.notifications.push(...data.notifications);
  }

  /**
   * 刷新队列中的数据
   */
  async flushQueue(accountId) {
    if (!this.pushQueue.has(accountId)) return;

    const data = this.pushQueue.get(accountId);
    this.pushQueue.delete(accountId);

    return await this.pushData(accountId, data);
  }

  /**
   * 刷新所有队列
   */
  async flushAllQueues() {
    const results = [];
    for (const accountId of this.pushQueue.keys()) {
      const result = await this.flushQueue(accountId);
      results.push({ accountId, result });
    }
    return results;
  }
}

module.exports = { DataPusher };
