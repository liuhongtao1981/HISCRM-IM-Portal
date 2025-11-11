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

      // 更新 DataStore
      const success = this.dataStore.updateAccountData(accountId, snapshot);

      if (success) {
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
          totalAccounts: storeStats.totalAccounts,
          totalComments: storeStats.totalComments,
          totalContents: storeStats.totalContents,
          totalConversations: storeStats.totalConversations,
          totalMessages: storeStats.totalMessages,
        });

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
