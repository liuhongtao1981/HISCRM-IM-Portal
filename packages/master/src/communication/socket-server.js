/**
 * Socket.IO服务器设置和消息路由
 */

const { Server } = require('socket.io');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { validateMessage } = require('@hiscrm-im/shared/utils/validator');
const { MESSAGE } = require('@hiscrm-im/shared/protocol/events');
const { initAdminNamespace } = require('../socket/admin-namespace');
const sessionManager = require('./session-manager');
const notificationsDao = require('../database/notifications-dao');

const logger = createLogger('socket-server');

/**
 * 初始化Socket.IO服务器
 * @param {http.Server} httpServer - HTTP服务器实例
 * @param {object} handlers - 消息处理器对象
 * @param {object} masterServer - Master服务器实例（用于admin namespace）
 * @param {object} sessionManager - 会话管理器（用于客户端会话）
 * @returns {Server} Socket.IO服务器实例
 */
function initSocketServer(httpServer, handlers = {}, masterServer = null, sessionManagerInstance = null) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS : '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Worker命名空间
  const workerNamespace = io.of('/worker');
  workerNamespace.on('connection', (socket) => {
    logger.info(`Worker connected: ${socket.id}`);

    // 处理Worker加入房间请求
    socket.on('join_room', (data, callback) => {
      const { room, workerId } = data;
      socket.join(room);
      logger.info(`Worker ${workerId} (socket ${socket.id}) joined room: ${room}`);

      // 确认加入成功
      if (callback) {
        callback(true);
      }
    });

    // 监听登录状态更新（新框架）
    socket.on('worker:login:status', (data) => {
      const { session_id, status, account_id } = data;
      logger.info(`Worker ${socket.id} login status update for session ${session_id}: ${status}`);
      logger.info(`Login status data:`, JSON.stringify(data, null, 2));
      
      // 转发到 Admin namespace
      const adminNamespace = io.of('/admin');
      logger.info(`Forwarding to admin namespace, connected clients: ${adminNamespace.sockets.size}`);
      adminNamespace.emit('login:status:update', data);
      logger.info(`Emitted login:status:update to admin namespace`);
      
      // 如果有旧的处理器，保持兼容
      if (status === 'qrcode_ready' && handlers.onLoginQRCodeReady) {
        handlers.onLoginQRCodeReady(data);
      } else if (status === 'success' && handlers.onLoginSuccess) {
        handlers.onLoginSuccess(data);
      } else if (status === 'failed' && handlers.onLoginFailed) {
        handlers.onLoginFailed(data);
      }
    });

    // 监听登录事件（由 handlers.onLoginEvent 处理，保持兼容旧代码）
    socket.on('worker:login:qrcode:ready', (data) => {
      logger.info(`Worker ${socket.id} QR code ready:`, data);
      if (handlers.onLoginQRCodeReady) {
        handlers.onLoginQRCodeReady(data);
      }
    });

    socket.on('worker:login:success', (data) => {
      logger.info(`Worker ${socket.id} login success:`, data);
      if (handlers.onLoginSuccess) {
        handlers.onLoginSuccess(data);
      }
    });

    socket.on('worker:login:failed', (data) => {
      logger.warn(`Worker ${socket.id} login failed:`, data);
      if (handlers.onLoginFailed) {
        handlers.onLoginFailed(data);
      }
    });

    socket.on('worker:login:qrcode:refreshed', (data) => {
      logger.info(`Worker ${socket.id} QR code refreshed:`, data);
      if (handlers.onLoginQRCodeRefreshed) {
        handlers.onLoginQRCodeRefreshed(data);
      }
    });

    // 监听 Worker 推送的通知消息
    socket.on('worker:notification:push', async (data) => {
      logger.info(`Worker ${socket.id} notification push:`, data);
      if (handlers.onNotificationPush) {
        try {
          await handlers.onNotificationPush(data, socket);
        } catch (error) {
          logger.error('Failed to handle notification push:', error);
        }
      }
    });

    // 监听回复执行结果
    socket.on('worker:reply:result', async (data) => {
      logger.info(`Worker ${socket.id} reply result:`, {
        replyId: data.reply_id,
        status: data.status,
        requestId: data.request_id,
      });
      if (handlers.onReplyResult) {
        try {
          await handlers.onReplyResult(data, socket);
        } catch (error) {
          logger.error('Failed to handle reply result:', error);
        }
      }
    });

    // 监听通用消息事件
    socket.on(MESSAGE, async (msg) => {
      try {
        // 验证消息格式
        const validation = validateMessage(msg);
        if (!validation.valid) {
          logger.warn(`Invalid message from worker ${socket.id}:`, validation.error);
          socket.emit(MESSAGE, {
            type: `${msg.type}:error`,
            version: 'v1',
            payload: { success: false, error: validation.error },
            timestamp: Date.now(),
          });
          return;
        }

        logger.debug(`Worker ${socket.id} message:`, msg.type);

        // 路由到相应的处理器
        const handler = handlers[msg.type];
        if (handler) {
          await handler(socket, msg, workerNamespace);
        } else {
          logger.warn(`No handler for message type: ${msg.type}`);
        }
      } catch (error) {
        logger.error(`Error handling worker message:`, error);
        socket.emit(MESSAGE, {
          type: 'error',
          version: 'v1',
          payload: { success: false, error: error.message },
          timestamp: Date.now(),
        });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Worker disconnected: ${socket.id}`);
      // 触发Worker离线处理
      if (handlers.onWorkerDisconnect) {
        handlers.onWorkerDisconnect(socket);
      }
    });

    socket.on('error', (error) => {
      logger.error(`Worker ${socket.id} error:`, error);
    });
  });

  // 客户端命名空间（用于桌面和移动客户端）
  const clientNamespace = io.of('/client');
  clientNamespace.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // 处理客户端注册
    socket.on('client:register', (data) => {
      const { device_id, device_type, device_name } = data;

      if (!device_id || !device_type) {
        logger.warn(`Client registration failed: missing required fields`, {
          socketId: socket.id,
          data,
        });

        socket.emit('client:register:error', {
          error: 'Missing required fields: device_id and device_type',
        });
        return;
      }

      // 创建客户端会话
      const sessionMgr = sessionManagerInstance || sessionManager;
      const session = sessionMgr.createOrUpdateSession({
        device_id,
        device_type,
        device_name: device_name || 'Unknown Device',
        socket_id: socket.id,
      });

      // 将device_id存储到socket对象中
      socket.deviceId = device_id;

      logger.info(`Client registered successfully`, {
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
    });

    // 处理客户端心跳
    socket.on('client:heartbeat', (data) => {
      const { client_id, timestamp } = data;
      const deviceId = socket.deviceId;
      const sessionMgr = sessionManagerInstance || sessionManager;

      if (deviceId) {
        sessionMgr.updateHeartbeat(deviceId);
        logger.debug(`Client heartbeat received`, {
          socketId: socket.id,
          clientId: client_id,
          deviceId,
        });
      }
    });

    // 处理消息确认
    socket.on('client:notification:ack', async (data) => {
      const { notification_id, client_id, timestamp } = data;
      const deviceId = socket.deviceId;

      if (!notification_id) {
        logger.warn('Client notification ack: missing notification_id', {
          socketId: socket.id,
          clientId: client_id,
        });
        return;
      }

      try {
        // 标记通知为已确认
        await notificationsDao.markAsConfirmed(notification_id, {
          confirmed_by: client_id || deviceId,
          confirmed_at: timestamp || Date.now(),
        });

        logger.info('✅ Client notification confirmed', {
          socketId: socket.id,
          deviceId: deviceId,
          notificationId: notification_id,
          clientId: client_id,
          timestamp: timestamp,
        });

        // 向 Admin UI 广播确认事件（如果可用）
        if (adminNamespaceInstance) {
          try {
            adminNamespaceInstance.emit('notification:confirmed', {
              notification_id,
              confirmed_by: client_id || deviceId,
              confirmed_at: timestamp || Date.now(),
            });
          } catch (adminError) {
            logger.debug('Admin notification broadcast skipped', {
              reason: adminError.message,
            });
          }
        }
      } catch (error) {
        logger.error('❌ Failed to confirm notification', {
          socketId: socket.id,
          notificationId: notification_id,
          error: error.message,
        });
      }
    });

    // 处理客户端消息
    socket.on(MESSAGE, async (msg) => {
      try {
        const validation = validateMessage(msg);
        if (!validation.valid) {
          logger.warn(`Invalid message from client ${socket.id}:`, validation.error);
          return;
        }

        logger.debug(`Client ${socket.id} message:`, msg.type);

        const handler = handlers[msg.type];
        if (handler) {
          await handler(socket, msg, clientNamespace);
        }
      } catch (error) {
        logger.error(`Error handling client message:`, error);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
      const deviceId = socket.deviceId;
      const sessionMgr = sessionManagerInstance || sessionManager;

      if (deviceId) {
        sessionMgr.markSessionOffline(deviceId);
      }

      if (handlers.onClientDisconnect) {
        handlers.onClientDisconnect(socket);
      }
    });
  });

  // Admin命名空间（可选，用于管理平台）
  let adminNamespaceInstance = null;
  let adminNamespaceHelpers = null;
  if (masterServer) {
    const adminResult = initAdminNamespace(io, masterServer);
    adminNamespaceInstance = adminResult.namespace; // 提取真正的 Socket.IO Namespace
    adminNamespaceHelpers = adminResult; // 保留完整的 result 对象（包含 broadcastToAdmins）
    logger.info('Socket.IO admin namespace initialized');
  }

  logger.info('Socket.IO server initialized with /worker, /client and /admin namespaces');

  return {
    io,
    workerNamespace,
    clientNamespace,
    adminNamespace: adminNamespaceInstance,
    adminNamespaceHelpers: adminNamespaceHelpers, // 返回辅助方法（包含 broadcastToAdmins）
  };
}

/**
 * 广播消息到所有Worker
 * @param {Namespace} workerNamespace - Worker命名空间
 * @param {object} message - 消息对象
 */
function broadcastToWorkers(workerNamespace, message) {
  workerNamespace.emit(MESSAGE, message);
  logger.debug(`Broadcasted to all workers: ${message.type}`);
}

/**
 * 广播消息到所有客户端
 * @param {Namespace} clientNamespace - 客户端命名空间
 * @param {object} message - 消息对象
 */
function broadcastToClients(clientNamespace, message) {
  clientNamespace.emit(MESSAGE, message);
  logger.debug(`Broadcasted to all clients: ${message.type}`);
}

/**
 * 发送消息到特定Socket
 * @param {Socket} socket - Socket实例
 * @param {object} message - 消息对象
 */
function sendMessage(socket, message) {
  socket.emit(MESSAGE, message);
}

module.exports = {
  initSocketServer,
  broadcastToWorkers,
  broadcastToClients,
  sendMessage,
};
