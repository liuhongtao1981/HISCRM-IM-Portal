/**
 * Worker Bridge - Worker 通信桥接
 * 封装与 Worker 主进程和 Master 的通信逻辑
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('worker-bridge');

class WorkerBridge {
  constructor(socketClient, workerId) {
    this.socketClient = socketClient;
    this.workerId = workerId;
    this.socket = socketClient ? socketClient.socket : null;
    
    // 用户输入监听器: sessionId -> { inputType -> callback }
    this.userInputListeners = new Map();
  }

  /**
   * 发送二维码到 Master
   * @param {string} sessionId - 登录会话 ID
   * @param {Object} qrCodeData - 二维码数据
   * @param {string} qrCodeData.url - 二维码 URL
   * @param {string} qrCodeData.image - 二维码图片 Base64
   */
  async sendQRCode(sessionId, qrCodeData) {
    if (!this.socket) {
      logger.error('Socket not connected');
      return;
    }

    try {
      this.socket.emit('worker:login:qrcode', {
        session_id: sessionId,
        qr_code_url: qrCodeData.url,
        qr_code_data: qrCodeData.image,
        timestamp: Date.now(),
      });

      logger.info(`QR code sent for session ${sessionId}`);
    } catch (error) {
      logger.error('Failed to send QR code:', error);
      throw error;
    }
  }

  /**
   * 发送登录状态
   * @param {string} sessionId - 登录会话 ID
   * @param {string} status - 状态: 'pending' | 'scanning' | 'success' | 'failed' | 'expired'
   * @param {Object} data - 附加数据
   */
  async sendLoginStatus(sessionId, status, data = {}) {
    if (!this.socket) {
      logger.error('Socket not connected');
      return;
    }

    try {
      this.socket.emit('worker:login:status', {
        session_id: sessionId,
        status,
        ...data,
        timestamp: Date.now(),
      });

      logger.info(`Login status sent: ${status} for session ${sessionId}`);
    } catch (error) {
      logger.error('Failed to send login status:', error);
      throw error;
    }
  }

  /**
   * 上报错误
   * @param {string} sessionId - 登录会话 ID
   * @param {Error} error - 错误对象
   */
  async reportError(sessionId, error) {
    if (!this.socket) {
      logger.error('Socket not connected');
      return;
    }

    try {
      this.socket.emit('worker:login:error', {
        session_id: sessionId,
        error: error.message,
        stack: error.stack,
        timestamp: Date.now(),
      });

      logger.error(`Error reported for session ${sessionId}:`, error);
    } catch (err) {
      logger.error('Failed to report error:', err);
    }
  }

  /**
   * 发送监控数据
   * @param {string} accountId - 账户 ID
   * @param {Array} comments - 评论数据
   * @param {Array} directMessages - 私信数据
   */
  async sendMonitorData(accountId, comments, directMessages) {
    if (!this.socket) {
      logger.error('Socket not connected');
      return;
    }

    try {
      if (comments && comments.length > 0) {
        this.socket.emit('worker:message:detected', {
          type: 'comment',
          account_id: accountId,
          messages: comments,
          timestamp: Date.now(),
        });
        logger.info(`Sent ${comments.length} comments for account ${accountId}`);
      }

      if (directMessages && directMessages.length > 0) {
        this.socket.emit('worker:message:detected', {
          type: 'direct_message',
          account_id: accountId,
          messages: directMessages,
          timestamp: Date.now(),
        });
        logger.info(`Sent ${directMessages.length} direct messages for account ${accountId}`);
      }
    } catch (error) {
      logger.error('Failed to send monitor data:', error);
      throw error;
    }
  }

  /**
   * 更新心跳统计
   * @param {Object} stats - 统计数据
   */
  async updateHeartbeat(stats) {
    // 心跳由 HeartbeatSender 统一处理
    logger.debug('Heartbeat stats updated:', stats);
  }

  /**
   * 记录日志
   * @param {string} message - 日志消息
   * @param {string} level - 日志级别
   */
  log(message, level = 'info') {
    logger[level](message);
  }

  /**
   * 监听用户输入（用于短信验证码等场景）
   * @param {string} sessionId - 登录会话 ID
   * @param {string} inputType - 输入类型: 'phone_number' | 'verification_code'
   * @param {Function} callback - 回调函数
   */
  onUserInput(sessionId, inputType, callback) {
    if (!this.userInputListeners.has(sessionId)) {
      this.userInputListeners.set(sessionId, new Map());
    }
    
    this.userInputListeners.get(sessionId).set(inputType, callback);
    logger.info(`User input listener registered for session ${sessionId}, type: ${inputType}`);
  }

  /**
   * 触发用户输入回调
   * 由 Worker 主进程调用
   * @param {string} sessionId - 登录会话 ID
   * @param {string} inputType - 输入类型
   * @param {string} value - 用户输入的值
   */
  triggerUserInput(sessionId, inputType, value) {
    if (!this.userInputListeners.has(sessionId)) {
      logger.warn(`No listeners for session ${sessionId}`);
      return;
    }
    
    const sessionListeners = this.userInputListeners.get(sessionId);
    const callback = sessionListeners.get(inputType);
    
    if (callback) {
      logger.info(`Triggering user input for session ${sessionId}, type: ${inputType}`);
      callback(value);
      
      // 移除监听器
      sessionListeners.delete(inputType);
      
      if (sessionListeners.size === 0) {
        this.userInputListeners.delete(sessionId);
      }
    } else {
      logger.warn(`No callback found for session ${sessionId}, type: ${inputType}`);
    }
  }

  /**
   * 移除用户输入监听器
   * @param {string} sessionId - 登录会话 ID
   * @param {string} inputType - 输入类型
   */
  removeUserInputListener(sessionId, inputType) {
    if (!this.userInputListeners.has(sessionId)) {
      return;
    }
    
    const sessionListeners = this.userInputListeners.get(sessionId);
    sessionListeners.delete(inputType);
    
    if (sessionListeners.size === 0) {
      this.userInputListeners.delete(sessionId);
    }
    
    logger.info(`User input listener removed for session ${sessionId}, type: ${inputType}`);
  }

  /**
   * 推送实时通知消息到 Master
   * @param {Object} notification - 通知对象
   * @param {string} notification.type - 通知类型: 'comment' | 'direct_message' | 'system' | 'account_status'
   * @param {string} notification.accountId - 关联账户 ID
   * @param {string} notification.title - 通知标题
   * @param {string} notification.content - 通知内容
   * @param {Object} notification.data - 附加数据
   * @param {string} notification.relatedId - 关联的评论/私信 ID
   * @param {string} notification.priority - 优先级: 'low' | 'normal' | 'high' | 'urgent'
   */
  async pushNotification(notification) {
    if (!this.socket) {
      logger.error('Socket not connected');
      return;
    }

    try {
      const {
        type,
        accountId,
        title,
        content,
        data = {},
        relatedId = null,
        priority = 'normal',
      } = notification;

      // 验证必填字段
      if (!type || !title || !content) {
        throw new Error('Missing required notification fields: type, title, content');
      }

      // 发送通知到 Master
      this.socket.emit('worker:notification:push', {
        type,
        account_id: accountId,
        title,
        content,
        data: JSON.stringify(data),
        related_id: relatedId,
        priority,
        worker_id: this.workerId,
        timestamp: Date.now(),
      });

      logger.info(`Notification pushed: [${type}] ${title} for account ${accountId}`);
    } catch (error) {
      logger.error('Failed to push notification:', error);
      throw error;
    }
  }

  /**
   * 发送消息到 Master (通用方法)
   * @param {Object} message - 标准消息对象 (通过 createMessage 创建)
   * @returns {Promise<void>}
   */
  async sendToMaster(message) {
    if (!this.socket) {
      const error = new Error('Socket not connected');
      logger.error('Failed to send message to Master:', error);
      throw error;
    }

    if (!this.socket.connected) {
      const error = new Error('Socket is not connected');
      logger.error('Failed to send message to Master:', error);
      throw error;
    }

    try {
      logger.debug(`Sending ${message.type} message to Master`, {
        type: message.type,
        hasPayload: !!message.payload,
      });

      // 通过标准 'message' 事件发送
      this.socket.emit('message', message);

      logger.debug(`Message ${message.type} sent successfully`);
    } catch (error) {
      logger.error(`Failed to send ${message.type} message to Master:`, error);
      throw error;
    }
  }

  /**
   * 设置 Socket 实例
   * @param {Socket} socket - Socket.IO 客户端实例
   */
  setSocket(socket) {
    this.socket = socket;
    logger.info('Socket instance updated');
  }
}

module.exports = WorkerBridge;
