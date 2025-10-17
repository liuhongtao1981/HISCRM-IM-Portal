/**
 * Socket.IO服务器设置和消息路由
 */

const { Server } = require('socket.io');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { validateMessage } = require('@hiscrm-im/shared/utils/validator');
const { MESSAGE } = require('@hiscrm-im/shared/protocol/events');
const { initAdminNamespace } = require('../socket/admin-namespace');

const logger = createLogger('socket-server');

/**
 * 初始化Socket.IO服务器
 * @param {http.Server} httpServer - HTTP服务器实例
 * @param {object} handlers - 消息处理器对象
 * @param {object} masterServer - Master服务器实例（用于admin namespace）
 * @returns {Server} Socket.IO服务器实例
 */
function initSocketServer(httpServer, handlers = {}, masterServer = null) {
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

    // 监听获取评论ID请求（用于增量爬取）
    socket.on('worker:get_comment_ids', async (data, callback) => {
      logger.debug(`Worker ${socket.id} requesting comment IDs for video ${data.aweme_id}`);
      if (handlers.onGetCommentIds) {
        try {
          const result = await handlers.onGetCommentIds(data, socket);
          if (callback) callback(result);
        } catch (error) {
          logger.error('Failed to get comment IDs:', error);
          if (callback) callback({ success: false, error: error.message });
        }
      }
    });

    // 监听获取历史数据ID列表（用于缓存预加载）
    socket.on('worker:get_history_ids', async (data, callback) => {
      logger.info(`Worker ${socket.id} requesting history IDs for account ${data.account_id}`);
      if (handlers.onGetHistoryIds) {
        try {
          const result = await handlers.onGetHistoryIds(data, socket);
          if (callback) callback(result);
        } catch (error) {
          logger.error('Failed to get history IDs:', error);
          if (callback) callback({ success: false, error: error.message });
        }
      } else {
        logger.warn('No handler for onGetHistoryIds');
        if (callback) callback({ success: false, error: 'Handler not implemented' });
      }
    });

    // 监听视频信息更新
    socket.on('worker:upsert_video', async (data) => {
      logger.debug(`Worker ${socket.id} upserting video ${data.aweme_id}`);
      if (handlers.onUpsertVideo) {
        try {
          await handlers.onUpsertVideo(data, socket);
        } catch (error) {
          logger.error('Failed to upsert video:', error);
        }
      }
    });

    // 监听批量插入评论
    socket.on('worker:bulk_insert_comments', async (data) => {
      logger.info(`Worker ${socket.id} bulk inserting ${data.comments?.length || 0} comments`);
      if (handlers.onBulkInsertComments) {
        try {
          await handlers.onBulkInsertComments(data, socket);
        } catch (error) {
          logger.error('Failed to bulk insert comments:', error);
        }
      }
    });

    // 监听批量插入私信
    socket.on('worker:bulk_insert_messages', async (data) => {
      logger.info(`Worker ${socket.id} bulk inserting ${data.messages?.length || 0} messages`);
      if (handlers.onBulkInsertMessages) {
        try {
          await handlers.onBulkInsertMessages(data, socket);
        } catch (error) {
          logger.error('Failed to bulk insert messages:', error);
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

  // 客户端命名空间
  const clientNamespace = io.of('/client');
  clientNamespace.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

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
      if (handlers.onClientDisconnect) {
        handlers.onClientDisconnect(socket);
      }
    });
  });

  // Admin命名空间（可选，用于管理平台）
  let adminNamespaceInstance = null;
  if (masterServer) {
    const adminResult = initAdminNamespace(io, masterServer);
    adminNamespaceInstance = adminResult.namespace; // 提取真正的 Socket.IO Namespace
    logger.info('Socket.IO admin namespace initialized');
  }

  logger.info('Socket.IO server initialized with /worker, /client and /admin namespaces');

  return {
    io,
    workerNamespace,
    clientNamespace,
    adminNamespace: adminNamespaceInstance,
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
