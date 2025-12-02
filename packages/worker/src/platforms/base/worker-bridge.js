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
  async sendToMaster(message, retries = 5, retryDelay = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      // 检查 Socket 是否连接
      if (!this.socket) {
        logger.warn(`Attempt ${attempt}/${retries}: Socket instance not found, waiting for reconnection...`);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        const error = new Error('Socket not connected after max retries');
        logger.error('Failed to send message to Master:', error);
        throw error;
      }

      if (!this.socket.connected) {
        logger.warn(`Attempt ${attempt}/${retries}: Socket not connected (socketId: ${this.socket?.id}), waiting ${retryDelay}ms...`);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        const error = new Error('Socket is not connected after max retries');
        logger.error('Failed to send message to Master:', error);
        throw error;
      }

      // Socket 已连接，尝试发送
      try {
        logger.info(`📤 Sending ${message.type} message to Master (Attempt ${attempt}/${retries})`, {
          type: message.type,
          hasPayload: !!message.payload,
          socketId: this.socket.id,
          connected: this.socket.connected,
        });

        // 通过标准 'message' 事件发送
        this.socket.emit('message', message);

        logger.info(`✅ Message ${message.type} emitted successfully (event: 'message')`);
        return; // 发送成功，退出函数
      } catch (error) {
        logger.error(`Attempt ${attempt}/${retries} failed to send ${message.type} message:`, error);
        if (attempt === retries) {
          throw error; // 最后一次重试失败，抛出错误
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
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

  /**
   * 请求验证（短信验证码或扫码验证）
   * @param {string} accountId - 账户 ID
   * @param {Object} verificationInfo - 验证信息
   * @param {string} verificationInfo.source - 验证来源 (如 'douyin_comment_reply', 'douyin_dm_send', 'douyin_login')
   * @param {string} verificationInfo.platform - 平台标识 (如 'douyin', 'xiaohongshu')
   * @param {string} verificationInfo.type - 验证类型: 'sms' | 'qrcode'
   * @param {string} verificationInfo.message - 验证提示消息
   * @param {string} verificationInfo.phoneNumber - 手机号（脱敏后）
   * @param {Function} onUserChoice - 用户选择回调 (choice: 'yes' | 'no')
   * @returns {Promise<string>} 返回用户选择: 'yes' | 'no'
   */
  async requestVerification(accountId, verificationInfo, onUserChoice) {
    if (!this.socket) {
      logger.error('Socket not connected');
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = `verify_${accountId}_${Date.now()}`;

      try {
        // 发送验证请求到 Master，Master 会转发给 IM 端
        this.socket.emit('worker:verification:request', {
          request_id: requestId,
          account_id: accountId,
          source: verificationInfo.source || 'unknown',        // 验证来源
          platform: verificationInfo.platform || 'unknown',    // 平台标识
          verification_type: verificationInfo.type,
          message: verificationInfo.message,
          phone_number: verificationInfo.phoneNumber,
          has_sms_button: verificationInfo.hasSendSMSButton,
          has_qrcode_option: verificationInfo.hasQRCodeOption,
          context: {
            aweme_id: verificationInfo.awemeId,
            comment_level: verificationInfo.commentLevel,
            reply_content: verificationInfo.replyContent
          },
          timestamp: Date.now(),
        });

        logger.info(`Verification request sent for account ${accountId}, source: ${verificationInfo.source}, platform: ${verificationInfo.platform}, type: ${verificationInfo.type}`);

        // 监听用户选择响应（超时 5 分钟）
        const timeout = setTimeout(() => {
          this.socket.off(`worker:verification:response:${requestId}`);
          reject(new Error('Verification request timeout (5 minutes)'));
        }, 5 * 60 * 1000);

        this.socket.once(`worker:verification:response:${requestId}`, (response) => {
          clearTimeout(timeout);

          const userChoice = response.choice; // 'yes' | 'no'
          logger.info(`User choice received: ${userChoice}`, {
            requestId,
            accountId,
            choice: userChoice
          });

          if (onUserChoice) {
            onUserChoice(userChoice);
          }

          resolve(userChoice);
        });

      } catch (error) {
        logger.error('Failed to request verification:', error);
        reject(error);
      }
    });
  }

  /**
   * 请求IM端输入短信验证码
   * @param {string} accountId - 账户 ID
   * @param {Object} smsCodeInfo - 验证码请求信息
   * @param {string} smsCodeInfo.phone_number - 手机号（脱敏后）
   * @param {string} smsCodeInfo.message - 提示消息
   * @returns {Promise<string>} 返回用户输入的验证码
   */
  async requestSMSCode(accountId, smsCodeInfo) {
    if (!this.socket) {
      logger.error('Socket not connected');
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      const requestId = `sms_code_${accountId}_${Date.now()}`;

      try {
        // 发送验证码输入请求到 Master，Master 会转发给 IM 端
        this.socket.emit('worker:sms_code:request', {
          request_id: requestId,
          account_id: accountId,
          phone_number: smsCodeInfo.phone_number,
          message: smsCodeInfo.message || `请输入手机号${smsCodeInfo.phone_number}收到的短信验证码`,
          timestamp: Date.now(),
        });

        logger.info(`SMS code request sent for account ${accountId}`, {
          requestId,
          phoneNumber: smsCodeInfo.phone_number
        });

        // 监听验证码响应（超时 3 分钟）
        const timeout = setTimeout(() => {
          this.socket.off(`worker:sms_code:response:${requestId}`);
          reject(new Error('SMS code request timeout (3 minutes)'));
        }, 3 * 60 * 1000);

        this.socket.once(`worker:sms_code:response:${requestId}`, (response) => {
          clearTimeout(timeout);

          const smsCode = response.sms_code;
          logger.info(`SMS code received`, {
            requestId,
            accountId,
            codeLength: smsCode ? smsCode.length : 0
          });

          if (!smsCode || smsCode.length === 0) {
            reject(new Error('User cancelled or empty SMS code'));
          } else {
            resolve(smsCode);
          }
        });

      } catch (error) {
        logger.error('Failed to request SMS code:', error);
        reject(error);
      }
    });
  }

  /**
   * 通知IM端验证完成（成功或失败）
   * @param {string} accountId - 账户 ID
   * @param {boolean} success - 验证是否成功
   * @param {string} message - 附加消息（可选）
   */
  notifyVerificationComplete(accountId, success, message = '') {
    if (!this.socket) {
      logger.warn('Socket not connected, cannot notify verification complete');
      return;
    }

    try {
      this.socket.emit('worker:verification:complete', {
        account_id: accountId,
        success: success,
        message: message || (success ? '验证成功' : '验证失败'),
        timestamp: Date.now(),
      });

      logger.info(`✅ Verification complete notification sent`, {
        accountId,
        success,
        message
      });
    } catch (error) {
      logger.error('Failed to notify verification complete:', error);
    }
  }
}

module.exports = WorkerBridge;
