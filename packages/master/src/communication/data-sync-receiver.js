/**
 * Data Sync Receiver
 * 接收 Worker 推送的完整数据快照，更新到 DataStore
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { createMessage } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('data-sync-receiver');

class DataSyncReceiver {
  constructor(dataStore, imWebSocketServer = null) {
    this.dataStore = dataStore;
    this.imWebSocketServer = imWebSocketServer; // IM WebSocket 服务器实例
    this.stats = {
      totalReceived: 0,
      lastReceiveTime: null,
      receivedByAccount: new Map(), // accountId -> count
    };
  }

  /**
   * 设置 IM WebSocket 服务器实例（延迟注入）
   * @param {IMWebSocketServer} imWebSocketServer - IM WebSocket 服务器实例
   */
  setIMWebSocketServer(imWebSocketServer) {
    this.imWebSocketServer = imWebSocketServer;
    logger.info('✅ IM WebSocket Server injected into DataSyncReceiver');
  }

  /**
   * 处理 Worker 数据同步
   * @param {Socket} socket - Worker socket
   * @param {object} message - WORKER_DATA_SYNC 消息
   */
  async handleWorkerDataSync(socket, message) {
    try {
      const { payload } = message;
      const { accountId, platform, snapshot, timestamp } = payload;

      logger.info(`📥 Receiving data sync from ${socket.workerId}`, {
        accountId,
        platform,
        timestamp: new Date(timestamp).toISOString(),
      });

      // ✅ 在存入 DataStore 之前，标记客服发送的消息为已读
      if (snapshot && snapshot.data) {
        let outboundCommentCount = 0;
        let outboundMessageCount = 0;

        // 处理评论：将 direction='outbound' 的评论标记为已读
        if (snapshot.data.comments) {
          const commentsList = snapshot.data.comments instanceof Map ? 
            Array.from(snapshot.data.comments.values()) : snapshot.data.comments;
          
          commentsList.forEach(comment => {
            if (comment.direction === 'outbound' && !comment.isRead) {
              comment.isRead = true;
              outboundCommentCount++;
            }
          });
        }

        // 处理私信：将 direction='outbound' 的消息标记为已读
        if (snapshot.data.messages) {
          const messagesList = snapshot.data.messages instanceof Map ? 
            Array.from(snapshot.data.messages.values()) : snapshot.data.messages;
          
          messagesList.forEach(msg => {
            if (msg.direction === 'outbound' && !msg.isRead) {
              msg.isRead = true;
              outboundMessageCount++;
            }
          });
        }

        if (outboundCommentCount > 0 || outboundMessageCount > 0) {
          logger.info(`✅ 标记客服消息为已读: ${outboundCommentCount} 条评论, ${outboundMessageCount} 条私信`);
        }
      }

      // ✨ 更新 DataStore 并获取新增的数据（单一职责，onChange 模式）
      const updateResult = this.dataStore.updateAccountData(accountId, snapshot);

      if (updateResult.success) {
        const { addedData } = updateResult;

        // 更新统计
        this.stats.totalReceived++;
        this.stats.lastReceiveTime = Date.now();
        this.stats.receivedByAccount.set(
          accountId,
          (this.stats.receivedByAccount.get(accountId) || 0) + 1
        );

        // 获取最新统计
        const storeStats = this.dataStore.getStats();

        logger.info(`✅ Data sync completed for ${accountId}`, {
          workerId: socket.workerId,
          comments: snapshot.data?.comments?.length || 0,
          contents: snapshot.data?.contents?.length || 0,
          conversations: snapshot.data?.conversations?.length || 0,
          messages: snapshot.data?.messages?.length || 0,
          addedComments: addedData.comments.length,
          addedMessages: addedData.messages.length,
          totalAccounts: storeStats.totalAccounts,
          totalComments: storeStats.totalComments,
          totalContents: storeStats.totalContents,
          totalConversations: storeStats.totalConversations,
          totalMessages: storeStats.totalMessages,
        });

        // ✨ 检测新增数据中是否有需要推送的消息（入站且在10分钟内）
        logger.info(`[DataSync] imWebSocketServer 状态: ${this.imWebSocketServer ? '✅ 已注入' : '❌ 未注入'}`);

        if (this.imWebSocketServer) {
          const now = Date.now();
          const timeThreshold = now - 10 * 60 * 1000; // 10分钟窗口

          // 过滤需要推送的评论
          const newComments = addedData.comments.filter(comment => {
            const isInbound = comment.direction !== 'outbound';
            let commentTimestamp = comment.createdAt;
            if (commentTimestamp && commentTimestamp < 10000000000) {
              commentTimestamp = commentTimestamp * 1000;
            }
            const isRecent = commentTimestamp && commentTimestamp > timeThreshold;

            logger.info(`[AddedComment] ${comment.commentId}: isInbound=${isInbound}, isRecent=${isRecent}, createdAt=${comment.createdAt} → ${commentTimestamp}`);

            return isInbound && isRecent;
          });

          // 过滤需要推送的私信
          const newMessages = addedData.messages.filter(message => {
            const isInbound = message.direction !== 'outbound';
            let messageTimestamp = message.createdAt;
            if (messageTimestamp && messageTimestamp < 10000000000) {
              messageTimestamp = messageTimestamp * 1000;
            }
            const isRecent = messageTimestamp && messageTimestamp > timeThreshold;

            logger.info(`[AddedMessage] ${message.messageId}: isInbound=${isInbound}, isRecent=${isRecent}, createdAt=${message.createdAt} → ${messageTimestamp}`);

            return isInbound && isRecent;
          });

          logger.info(`[DataSync] 检测到新增数据: comments=${newComments.length}, messages=${newMessages.length}`);

          if (newComments.length > 0 || newMessages.length > 0) {
            // ✨ 构建并广播消息提示
            const hints = this.buildNewMessageHints(accountId, snapshot.platform, {
              comments: newComments,
              messages: newMessages,
              hasNew: true,
            });
            logger.info(`[DataSync] 构建了 ${hints.length} 个消息提示，准备广播`);

            for (const hint of hints) {
              this.imWebSocketServer.broadcastToMonitors('monitor:new_message_hint', hint);
            }

            logger.info(`📤 Broadcasted ${hints.length} new message hints for ${accountId}`);
          } else {
            logger.info(`[DataSync] 没有需要推送的新消息 for ${accountId}`);
          }
        } else {
          logger.error(`[DataSync] ❌ imWebSocketServer 未注入，无法广播新消息提示！`);
        }

        // 发送 ACK 确认
        const ackMessage = createMessage('WORKER_DATA_SYNC_ACK', {
          success: true,
          accountId,
          timestamp: Date.now(),
          stats: storeStats,
        });

        socket.emit('message', ackMessage);
      } else {
        throw new Error('Failed to update DataStore');
      }

    } catch (error) {
      logger.error('Failed to handle worker data sync:', error);

      // 发送错误 ACK
      const errorMessage = createMessage('WORKER_DATA_SYNC_ACK', {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      });

      socket.emit('message', errorMessage);
    }
  }

  /**
   * 检测是否有新消息（新评论或新私信）
   * @param {object} oldData - 更新前的数据
   * @param {object} newSnapshot - 更新后的数据快照
   * @returns {object} { hasNew: boolean, comments: [], messages: [] }
   */
  detectNewMessages(oldData, newSnapshot) {
    try {
      const result = {
        hasNew: false,
        comments: [],   // 新增的评论列表
        messages: [],   // 新增的私信列表
      };

      // 时间阈值：只检测最近 10 分钟内的消息（避免 Master 重启后误判历史消息为新消息）
      const timeThreshold = Date.now() - 10 * 60 * 1000; // 10分钟

      // 检测新评论
      if (newSnapshot.data?.comments) {
        const oldComments = oldData?.data?.comments || [];
        const oldCommentIds = new Set(
          (Array.isArray(oldComments) ? oldComments : Array.from(oldComments.values())).map(c => c.commentId)
        );

        const newCommentsList = Array.isArray(newSnapshot.data.comments)
          ? newSnapshot.data.comments
          : Array.from(newSnapshot.data.comments.values());

        // 收集新增的评论（排除客服发送的）
        for (const comment of newCommentsList) {
          const isNewId = !oldCommentIds.has(comment.commentId);
          const isInbound = comment.direction !== 'outbound';
          const isRecent = comment.createdAt && comment.createdAt > timeThreshold;

          logger.debug(`[DetectComment] ${comment.commentId}: isNewId=${isNewId}, isInbound=${isInbound}, isRecent=${isRecent}, createdAt=${comment.createdAt}`);

          // ✨ 修复逻辑：只要是入站评论且在10分钟窗口内，就应该推送
          if (isInbound && isRecent) {
            const isAlreadyNotified = oldData && oldCommentIds.has(comment.commentId);

            if (!isAlreadyNotified) {
              result.comments.push(comment);
              result.hasNew = true;
              logger.info(`🔔 检测到新评论: ${comment.commentId} (isNewId=${isNewId}, isAlreadyNotified=${isAlreadyNotified})`);
            } else {
              logger.info(`[DetectComment] ⏭️ 跳过已通知的评论: ${comment.commentId} (oldData中已存在)`);
            }
          }
        }
      }

      // 检测新私信
      if (newSnapshot.data?.messages) {
        const oldMessagesRaw = oldData?.data?.messages || [];
        const oldMessagesList = Array.isArray(oldMessagesRaw)
          ? oldMessagesRaw
          : Array.from(oldMessagesRaw.values());
        const oldMessageIds = new Set(oldMessagesList.map(m => m.messageId));

        const newMessagesList = Array.isArray(newSnapshot.data.messages)
          ? newSnapshot.data.messages
          : Array.from(newSnapshot.data.messages.values());

        logger.info(`[DetectMessages] oldData 存在: ${!!oldData}, oldMessages count: ${oldMessagesList.length}, newMessages count: ${newMessagesList.length}, timeThreshold: ${timeThreshold} (${new Date(timeThreshold).toLocaleString()})`);

        // 收集新增的私信（排除客服发送的）
        for (const message of newMessagesList) {
          const isNewId = !oldMessageIds.has(message.messageId);
          const isInbound = message.direction !== 'outbound';

          // 修复时间戳单位不统一问题：如果 createdAt 小于 10000000000（2286年之前的毫秒时间戳），
          // 则认为它是秒级时间戳，需要乘以 1000 转换为毫秒
          let messageTimestamp = message.createdAt;
          if (messageTimestamp && messageTimestamp < 10000000000) {
            messageTimestamp = messageTimestamp * 1000;
          }

          const isRecent = messageTimestamp && messageTimestamp > timeThreshold;

          logger.info(`[DetectMessage] ${message.messageId} (${message.content?.substring(0, 20)}...): isNewId=${isNewId}, isInbound=${isInbound}, isRecent=${isRecent}, createdAt=${message.createdAt} → ${messageTimestamp} (${messageTimestamp ? new Date(messageTimestamp).toLocaleString() : 'N/A'}), threshold=${timeThreshold}`);

          // ✨ 修复逻辑：如果是入站消息且在10分钟窗口内，就应该推送
          // 不再要求 isNewId=true，因为 Master 重启后会从数据库加载历史数据，导致所有消息 isNewId=false
          // 改为：只要是入站消息 + 时间在阈值内，就推送（依赖10分钟窗口避免重复推送）
          if (isInbound && isRecent) {
            // 但如果 oldData 存在且消息已在旧数据中，跳过（避免重复推送）
            const isAlreadyNotified = oldData && oldMessageIds.has(message.messageId);

            if (!isAlreadyNotified) {
              result.messages.push(message);
              result.hasNew = true;
              logger.info(`🔔 检测到新私信: ${message.messageId} - ${message.content?.substring(0, 30)} (isNewId=${isNewId}, isAlreadyNotified=${isAlreadyNotified})`);
            } else {
              logger.info(`[DetectMessage] ⏭️ 跳过已通知的消息: ${message.messageId} (oldData中已存在)`);
            }
          }
        }
      }

      logger.info(`[DetectNewMessages] Result: hasNew=${result.hasNew}, comments=${result.comments.length}, messages=${result.messages.length}`);

      return result;

    } catch (error) {
      logger.error('检测新消息时出错:', error);
      return { hasNew: false, comments: [], messages: [] };
    }
  }

  /**
   * ✨ 构建新消息简易概要
   * @param {string} accountId - 账户 ID
   * @param {string} platform - 平台
   * @param {object} newMessagesInfo - 新消息信息 { comments: [], messages: [] }
   * @returns {Array<NewMessageHint>} 简易概要列表
   */
  buildNewMessageHints(accountId, platform, newMessagesInfo) {
    const hints = [];

    // 计算总未读数
    const accountData = this.dataStore.accounts.get(accountId);
    const totalUnreadCount = this.calculateUnreadCount(accountData);

    // 1. 按作品分组评论
    const commentsByTopic = new Map();
    for (const comment of newMessagesInfo.comments) {
      const topicId = comment.contentId;
      if (!commentsByTopic.has(topicId)) {
        commentsByTopic.set(topicId, []);
      }
      commentsByTopic.get(topicId).push(comment);
    }

    // 为每个作品创建一个 hint
    for (const [topicId, comments] of commentsByTopic) {
      const firstComment = comments[0];
      hints.push({
        channelId: accountId,
        platform,
        messageType: 'comment',
        topicId,
        topicTitle: firstComment.contentTitle || '未知作品',
        commentCount: comments.length,
        totalUnreadCount,
        timestamp: Date.now(),
      });
    }

    // 2. 按会话分组私信
    const messagesByConversation = new Map();
    for (const message of newMessagesInfo.messages) {
      const conversationId = message.conversationId;
      if (!messagesByConversation.has(conversationId)) {
        messagesByConversation.set(conversationId, []);
      }
      messagesByConversation.get(conversationId).push(message);
    }

    // 为每个会话创建一个 hint
    for (const [conversationId, messages] of messagesByConversation) {
      const firstMessage = messages[0];
      hints.push({
        channelId: accountId,
        platform,
        messageType: 'private_message',
        conversationId,
        fromUserId: firstMessage.senderId,
        fromUserName: firstMessage.senderName || '未知用户',
        messageCount: messages.length,
        totalUnreadCount,
        timestamp: Date.now(),
      });
    }

    return hints;
  }

  /**
   * ✨ 计算账户总未读数
   * @param {object} accountData - 账户数据
   * @returns {number} 总未读数
   */
  calculateUnreadCount(accountData) {
    if (!accountData || !accountData.data) return 0;

    let count = 0;

    // 评论未读数
    if (accountData.data.comments) {
      const comments = Array.isArray(accountData.data.comments)
        ? accountData.data.comments
        : Array.from(accountData.data.comments.values());
      count += comments.filter(c => !c.isRead && c.direction !== 'outbound').length;
    }

    // 私信未读数
    if (accountData.data.messages) {
      const messages = Array.isArray(accountData.data.messages)
        ? accountData.data.messages
        : Array.from(accountData.data.messages.values());
      count += messages.filter(m => !m.isRead && m.direction !== 'outbound').length;
    }

    return count;
  }

  /**
   * 获取接收统计
   */
  getStats() {
    return {
      ...this.stats,
      accountStats: Array.from(this.stats.receivedByAccount.entries()).map(([accountId, count]) => ({
        accountId,
        receivedCount: count,
      })),
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalReceived: 0,
      lastReceiveTime: null,
      receivedByAccount: new Map(),
    };
    logger.info('Stats reset');
  }
}

module.exports = DataSyncReceiver;
