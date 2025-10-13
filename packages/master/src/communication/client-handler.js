/**
 * T070: Client Connection Handler
 *
 * Purpose: 处理客户端连接事件,包括客户端注册、断开连接等
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const sessionManager = require('./session-manager');

const logger = createLogger('client-handler');

/**
 * 客户端连接处理器类
 */
class ClientHandler {
  constructor(io) {
    this.io = io;
    this.setupHandlers();
  }

  /**
   * 设置Socket.IO事件处理器
   */
  setupHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('New client connection', {
        socketId: socket.id,
        remoteAddress: socket.handshake.address,
      });

      // 处理客户端连接事件
      this.handleClientConnect(socket);

      // 处理客户端断开连接
      socket.on('disconnect', () => {
        this.handleClientDisconnect(socket);
      });

      // 处理客户端心跳
      socket.on('client:heartbeat', (data) => {
        this.handleClientHeartbeat(socket, data);
      });

      // 处理客户端注册
      socket.on('client:register', (data) => {
        this.handleClientRegister(socket, data);
      });

      // 处理通知确认
      socket.on('client:notification:ack', (data) => {
        this.handleNotificationAck(socket, data);
      });

      // 处理错误
      socket.on('error', (error) => {
        logger.error('Client socket error', {
          socketId: socket.id,
          error: error.message,
        });
      });
    });

    logger.info('Client handlers setup complete');
  }

  /**
   * 处理客户端连接
   * @param {Socket} socket - Socket.IO socket对象
   */
  handleClientConnect(socket) {
    // 客户端需要先注册才能接收通知
    logger.debug('Client connected, waiting for registration', {
      socketId: socket.id,
    });
  }

  /**
   * 处理客户端注册
   * @param {Socket} socket - Socket.IO socket对象
   * @param {object} data - 注册数据
   */
  handleClientRegister(socket, data) {
    const { device_id, device_type, device_name } = data;

    if (!device_id || !device_type) {
      logger.warn('Client registration failed: missing required fields', {
        socketId: socket.id,
        data,
      });

      socket.emit('client:register:error', {
        error: 'Missing required fields: device_id and device_type',
      });
      return;
    }

    // 创建客户端会话
    const session = sessionManager.createSession({
      device_id,
      device_type,
      device_name: device_name || 'Unknown Device',
      socket_id: socket.id,
    });

    // 将device_id存储到socket对象中
    socket.deviceId = device_id;

    logger.info('Client registered successfully', {
      socketId: socket.id,
      deviceId: device_id,
      deviceType: device_type,
      sessionId: session.id,
    });

    // 发送注册成功响应
    socket.emit('client:register:success', {
      session_id: session.id,
      device_id,
      connected_at: session.connected_at,
    });

    // 触发同步请求(推送离线通知)
    this.triggerOfflineSync(socket, device_id);
  }

  /**
   * 处理客户端断开连接
   * @param {Socket} socket - Socket.IO socket对象
   */
  handleClientDisconnect(socket) {
    const deviceId = socket.deviceId;

    if (deviceId) {
      sessionManager.markOffline(deviceId);

      logger.info('Client disconnected', {
        socketId: socket.id,
        deviceId,
      });
    } else {
      logger.debug('Unregistered client disconnected', {
        socketId: socket.id,
      });
    }
  }

  /**
   * 处理客户端心跳
   * @param {Socket} socket - Socket.IO socket对象
   * @param {object} data - 心跳数据
   */
  handleClientHeartbeat(socket, data) {
    const deviceId = socket.deviceId;

    if (deviceId) {
      sessionManager.updateHeartbeat(deviceId);

      logger.debug('Client heartbeat received', {
        socketId: socket.id,
        deviceId,
      });

      // 响应心跳
      socket.emit('client:heartbeat:ack', {
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 处理通知确认
   * @param {Socket} socket - Socket.IO socket对象
   * @param {object} data - 确认数据
   */
  handleNotificationAck(socket, data) {
    const { notification_id } = data;

    logger.debug('Notification acknowledged', {
      socketId: socket.id,
      notificationId: notification_id,
    });

    // 这里可以更新通知状态为已送达
    // 实际实现中可能需要调用 notifications-dao
  }

  /**
   * 触发离线同步
   * @param {Socket} socket - Socket.IO socket对象
   * @param {string} deviceId - 设备ID
   */
  triggerOfflineSync(socket, deviceId) {
    // 触发同步事件,由sync-handler处理
    socket.emit('client:sync:start', {
      device_id: deviceId,
      timestamp: Date.now(),
    });

    logger.info('Triggered offline sync for client', {
      socketId: socket.id,
      deviceId,
    });
  }

  /**
   * 获取所有在线客户端
   * @returns {Array} 在线客户端列表
   */
  getOnlineClients() {
    return sessionManager.getOnlineSessions();
  }

  /**
   * 向指定客户端发送消息
   * @param {string} deviceId - 设备ID
   * @param {string} event - 事件名称
   * @param {object} data - 数据
   */
  sendToClient(deviceId, event, data) {
    const session = sessionManager.getSession(deviceId);

    if (!session || session.status !== 'online') {
      logger.warn('Cannot send to offline client', {
        deviceId,
        event,
      });
      return false;
    }

    // 通过socket.io发送消息
    this.io.to(session.socket_id).emit(event, data);

    logger.debug('Message sent to client', {
      deviceId,
      socketId: session.socket_id,
      event,
    });

    return true;
  }

  /**
   * 广播消息给所有在线客户端
   * @param {string} event - 事件名称
   * @param {object} data - 数据
   */
  broadcastToAll(event, data) {
    this.io.emit(event, data);

    logger.debug('Broadcast message to all clients', {
      event,
      onlineCount: sessionManager.getOnlineSessions().length,
    });
  }
}

module.exports = ClientHandler;
