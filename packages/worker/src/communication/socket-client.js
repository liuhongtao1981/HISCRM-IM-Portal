/**
 * Worker Socket.IO客户端封装
 */

const { io } = require('socket.io-client');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { validateMessage } = require('@hiscrm-im/shared/utils/validator');
const { MESSAGE, CONNECT, DISCONNECT, RECONNECT, CONNECT_ERROR } = require('@hiscrm-im/shared/protocol/events');

const logger = createLogger('socket-client');

class SocketClient {
  constructor(masterHost, masterPort, workerId) {
    this.masterHost = masterHost;
    this.masterPort = masterPort;
    this.workerId = workerId;
    this.socket = null;
    this.messageHandlers = new Map();
    this.connected = false;
  }

  /**
   * 连接到主控
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      const url = `http://${this.masterHost}:${this.masterPort}/worker`;

      logger.info(`Connecting to master at ${url}`);

      this.socket = io(url, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
      });

      // 连接成功
      this.socket.on(CONNECT, () => {
        logger.info(`Connected to master (socket ID: ${this.socket.id})`);
        this.connected = true;

        // 加入以 worker ID 命名的房间，以便 Master 可以发送目标消息
        this.socket.emit('join_room', {
          room: `worker:${this.workerId}`,
          workerId: this.workerId,
        }, (acknowledged) => {
          if (acknowledged) {
            logger.info(`Successfully joined room: worker:${this.workerId}`);
          } else {
            logger.warn(`Failed to join room: worker:${this.workerId}`);
          }
        });

        resolve();
      });

      // 连接失败
      this.socket.on(CONNECT_ERROR, (error) => {
        logger.error('Connection error:', error.message);
        if (!this.connected) {
          reject(error);
        }
      });

      // 断开连接
      this.socket.on(DISCONNECT, (reason) => {
        logger.warn(`Disconnected from master: ${reason}`);
        this.connected = false;
      });

      // 重连成功
      this.socket.on(RECONNECT, (attemptNumber) => {
        logger.info(`Reconnected to master (attempt ${attemptNumber})`);
        this.connected = true;
      });

      // 监听消息
      this.socket.on(MESSAGE, (msg) => {
        this.handleMessage(msg);
      });

      // DEBUG: 监听所有直接事件（用于调试）
      this.socket.on('master:reply:request', (data) => {
        logger.info('✅✅✅ Received DIRECT master:reply:request event at socket level', {
          replyId: data.reply_id,
          requestId: data.request_id,
          timestamp: Date.now(),
        });
      });

      // 额外调试：监听所有事件
      const originalOn = this.socket.on.bind(this.socket);
      this.socket.on = function(event, handler) {
        if (event.startsWith('master:')) {
          const wrappedHandler = function(...args) {
            logger.debug(`🔔 Event '${event}' fired with args:`, args);
            return handler.apply(this, args);
          };
          return originalOn(event, wrappedHandler);
        }
        return originalOn(event, handler);
      };

      // 错误处理
      this.socket.on('error', (error) => {
        logger.error('Socket error:', error);
      });
    });
  }

  /**
   * 处理接收到的消息
   * @param {object} msg - 消息对象
   */
  handleMessage(msg) {
    try {
      // 验证消息格式
      const validation = validateMessage(msg);
      if (!validation.valid) {
        logger.warn('Invalid message received:', validation.error);
        return;
      }

      logger.debug(`Received message: ${msg.type}`);

      // 路由到注册的处理器
      const handler = this.messageHandlers.get(msg.type);
      if (handler) {
        handler(msg);
      } else {
        logger.debug(`No handler registered for message type: ${msg.type}`);
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }

  /**
   * 注册消息处理器
   * @param {string} messageType - 消息类型
   * @param {function} handler - 处理函数
   */
  onMessage(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
    logger.debug(`Registered handler for message type: ${messageType}`);
  }

  /**
   * 发送消息
   * @param {object} message - 消息对象
   */
  sendMessage(message) {
    if (!this.connected) {
      logger.warn('Cannot send message: not connected to master');
      return;
    }

    const validation = validateMessage(message);
    if (!validation.valid) {
      logger.error('Cannot send invalid message:', validation.error);
      return;
    }

    this.socket.emit(MESSAGE, message);
    logger.debug(`Sent message: ${message.type}`);
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      logger.info('Disconnecting from master');
      this.socket.disconnect();
      this.connected = false;
    }
  }

  /**
   * 检查连接状态
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }
}

module.exports = SocketClient;
