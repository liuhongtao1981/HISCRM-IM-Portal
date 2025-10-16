/**
 * 主控服务入口
 * 负责Worker管理、任务调度、客户端通信
 */

const path = require('path');
const fs = require('fs');

// 确保必要的目录存在
const dataDir = path.join(__dirname, '../data');
const logsDir = path.join(__dirname, '../logs');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log(`Created logs directory: ${logsDir}`);
}

// 加载环境变量
require('dotenv').config();

// 验证关键环境变量
if (!process.env.PORT) {
  console.log('Using default PORT=3000');
}

const express = require('express');
const http = require('http');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { initDatabase } = require('./database/init');
const { requestIdMiddleware } = require('@hiscrm-im/shared/utils/request-id');
const { initSocketServer } = require('./communication/socket-server');
const WorkerRegistry = require('./worker_manager/registration');
const HeartbeatMonitor = require('./monitor/heartbeat');
const TaskScheduler = require('./scheduler/task-scheduler');
const AccountAssigner = require('./worker_manager/account-assigner');
const MessageReceiver = require('./communication/message-receiver');
const SessionManager = require('./communication/session-manager');
const NotificationBroadcaster = require('./communication/notification-broadcaster');
const NotificationQueue = require('./communication/notification-queue');
const LoginHandler = require('./login/login-handler');
const { WORKER_REGISTER, WORKER_HEARTBEAT, WORKER_MESSAGE_DETECTED, CLIENT_SYNC_REQUEST } = require('@hiscrm-im/shared/protocol/messages');

// 初始化logger
const logger = createLogger('master', './logs');

// 配置
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/master.db';

// 初始化Express应用
const app = express();
const server = http.createServer(app);

// Express中间件
app.use(express.json());
app.use(requestIdMiddleware);

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 全局变量
let db;
let workerRegistry;
let heartbeatMonitor;
let taskScheduler;
let accountAssigner;
let messageReceiver;
let sessionManager;
let notificationBroadcaster;
let notificationQueue;
let workerNamespace;
let clientNamespace;
let adminNamespace;
let loginHandler;
let workerLifecycleManager;
let workerConfigDAO;
let workerRuntimeDAO;

// API路由
app.get('/api/v1/status', (req, res) => {
  const workerStats = heartbeatMonitor ? heartbeatMonitor.getStats() : {};
  const schedulingStats = taskScheduler ? taskScheduler.getSchedulingStats() : {};
  const sessionStats = sessionManager ? sessionManager.getStats() : {};
  const queueStats = notificationQueue ? notificationQueue.getStats() : {};
  const broadcasterStats = notificationBroadcaster ? notificationBroadcaster.getStats() : {};

  res.json({
    success: true,
    data: {
      version: '1.0.0',
      uptime: process.uptime(),
      workers: workerStats,
      scheduling: schedulingStats,
      clients: sessionStats,
      notifications: {
        queue: queueStats,
        broadcaster: broadcasterStats,
      },
    },
  });
});

// 导入账户路由 (在start()函数中初始化后挂载)

// ============================================
// 客户端连接处理函数
// ============================================

/**
 * 处理客户端连接
 */
function handleClientConnect(socket) {
  logger.info(`Client connected: ${socket.id}`);

  // 从 handshake 获取设备信息
  const { device_id, device_type, device_name } = socket.handshake.query;

  if (!device_id || !device_type) {
    logger.warn(`Client ${socket.id} missing device info, disconnecting`);
    socket.disconnect();
    return;
  }

  // 创建或更新会话
  try {
    const session = sessionManager.createOrUpdateSession({
      device_id,
      device_type,
      device_name,
      socket_id: socket.id,
    });

    logger.info(`Session created for device ${device_id} (${device_type})`);
  } catch (error) {
    logger.error('Failed to create session:', error);
    socket.disconnect();
  }
}

/**
 * 处理客户端断开连接
 */
function handleClientDisconnect(socket) {
  logger.info(`Client disconnected: ${socket.id}`);

  // 根据 socket_id 查找会话
  const session = sessionManager.findSessionBySocketId(socket.id);

  if (session) {
    sessionManager.markSessionOffline(session.device_id);
    logger.info(`Session marked offline: ${session.device_id}`);
  }
}

/**
 * 处理客户端同步请求
 */
function handleClientSync(socket, message) {
  const { device_id, since_timestamp, limit = 100, offset = 0 } = message.payload;

  try {
    logger.info(`Client sync request from device ${device_id}`);

    // 查询离线期间的通知
    const NotificationsDAO = require('./database/notifications-dao');
    const notificationsDAO = new NotificationsDAO(db);

    const filters = {
      is_sent: false,
      limit,
      offset,
    };

    if (since_timestamp) {
      filters.since_timestamp = since_timestamp;
    }

    const notifications = notificationsDAO.findAll(filters);
    const totalCount = notificationsDAO.count({ is_sent: false, since_timestamp });

    logger.info(`Sending ${notifications.length} notifications to device ${device_id}`);

    // 发送同步响应
    const { createMessage, CLIENT_SYNC_RESPONSE } = require('@hiscrm-im/shared/protocol/messages');
    const syncResponse = createMessage(CLIENT_SYNC_RESPONSE, {
      device_id,
      notifications: notifications.map((n) => n.toClientPayload()),
      total_count: totalCount,
    });

    socket.emit('message', syncResponse);

    // 标记这些通知为已发送
    if (notifications.length > 0) {
      const notificationIds = notifications.map((n) => n.id);
      notificationsDAO.markAsSent(notificationIds);
    }
  } catch (error) {
    logger.error('Failed to handle client sync:', error);

    // 发送错误响应
    const { createMessage, CLIENT_SYNC_RESPONSE } = require('@hiscrm-im/shared/protocol/messages');
    const errorResponse = createMessage(CLIENT_SYNC_RESPONSE, {
      device_id,
      notifications: [],
      total_count: 0,
      error: error.message,
    });

    socket.emit('message', errorResponse);
  }
}

// 启动服务
async function start() {
  try {
    // 1. 初始化数据库
    db = initDatabase(DB_PATH);
    logger.info('Database initialized');

    // 2. 初始化Worker注册表
    workerRegistry = new WorkerRegistry(db);
    logger.info('Worker registry initialized');

    // 3. 初始化客户端会话管理器
    sessionManager = new SessionManager(db);
    logger.info('Session manager initialized');

    // 4. 创建 masterServer 对象
    const masterServer = { db };

    // 4.1 初始化 Socket.IO 服务器（第一次调用，不含登录处理器）
    let tempHandlers = {
      [WORKER_REGISTER]: (socket, msg) => workerRegistry.handleRegistration(socket, msg),
      [WORKER_HEARTBEAT]: (socket, msg) => heartbeatMonitor.handleHeartbeat(socket, msg),
      [WORKER_MESSAGE_DETECTED]: (socket, msg) => messageReceiver.handleMessageDetected(socket, msg),
      [CLIENT_SYNC_REQUEST]: (socket, msg) => handleClientSync(socket, msg),
      onWorkerDisconnect: (socket) => workerRegistry.handleDisconnect(socket),
      onClientConnect: (socket) => handleClientConnect(socket),
      onClientDisconnect: (socket) => handleClientDisconnect(socket),
    };

    const socketNamespaces = initSocketServer(
      server,
      tempHandlers,
      masterServer
    );
    workerNamespace = socketNamespaces.workerNamespace;
    clientNamespace = socketNamespaces.clientNamespace;
    adminNamespace = socketNamespaces.adminNamespace;
    logger.info('Socket.IO server initialized');

    // 5. 初始化登录管理器
    loginHandler = new LoginHandler(db, adminNamespace);
    loginHandler.startCleanupTimer();
    logger.info('Login handler initialized');

    // 5.1 添加登录事件处理器（在 loginHandler 初始化后）
    tempHandlers.onLoginQRCodeReady = (data) => {
      loginHandler.handleQRCodeReady(data.session_id, data.qr_code_data, data.qr_code_url);
    };

    tempHandlers.onLoginSuccess = (data) => {
      // 提取真实的账户ID (从 user_info.uid 或 user_info.douyin_id)
      const realAccountId = data.user_info ? (data.user_info.uid || data.user_info.douyin_id) : null;

      loginHandler.handleLoginSuccess(
        data.session_id,
        data.cookies,           // Cookie 数组
        data.cookies_valid_until,
        realAccountId,          // 真实账户ID
        data.user_info,         // 用户信息
        data.fingerprint        // 浏览器指纹
      );
    };

    tempHandlers.onLoginFailed = (data) => {
      loginHandler.handleLoginFailed(data.session_id, data.error_message, data.error_type);
    };

    tempHandlers.onLoginQRCodeRefreshed = (data) => {
      loginHandler.handleQRCodeRefreshed(data.session_id, data.qr_code_data, data.refresh_count);
    };

    // 6. 初始化通知系统
    notificationBroadcaster = new NotificationBroadcaster(sessionManager, clientNamespace);
    logger.info('Notification broadcaster initialized');

    notificationQueue = new NotificationQueue(db, notificationBroadcaster);
    notificationQueue.start();
    logger.info('Notification queue started');

    // 7. 初始化消息接收器（带通知队列）
    messageReceiver = new MessageReceiver(db, notificationQueue);
    logger.info('Message receiver initialized');

    // 8. 启动心跳监控
    heartbeatMonitor = new HeartbeatMonitor(db, workerRegistry);
    heartbeatMonitor.start();
    logger.info('Heartbeat monitor started');

    // 9. 启动任务调度器
    taskScheduler = new TaskScheduler(db, workerRegistry);
    taskScheduler.start();
    logger.info('Task scheduler started');

    // 10. 初始化账户分配器
    accountAssigner = new AccountAssigner(db, workerRegistry, taskScheduler);
    logger.info('Account assigner initialized');

    // 10.1 初始化 Worker 生命周期管理器
    const WorkerConfigDAO = require('./database/worker-config-dao');
    const WorkerRuntimeDAO = require('./database/worker-runtime-dao');
    const WorkerLifecycleManager = require('./worker_manager/lifecycle-manager');

    workerConfigDAO = new WorkerConfigDAO(db);
    workerRuntimeDAO = new WorkerRuntimeDAO(db);
    workerLifecycleManager = new WorkerLifecycleManager(workerConfigDAO, workerRuntimeDAO);

    // 初始化生命周期管理器（启动自动启动的 Worker）
    await workerLifecycleManager.initialize();
    logger.info('Worker lifecycle manager initialized');

    // 11. 挂载API路由
    const createAccountsRouter = require('./api/routes/accounts');
    app.use('/api/v1/accounts', createAccountsRouter(db, accountAssigner));

    const createMessagesRouter = require('./api/routes/messages');
    app.use('/api/v1/messages', createMessagesRouter(db));

    const createStatisticsRouter = require('./api/routes/statistics');
    app.use('/api/v1/statistics', createStatisticsRouter(db));

    const createWorkersRouter = require('./api/routes/workers');
    app.use('/api/v1/workers', createWorkersRouter(db));

    const createProxiesRouter = require('./api/routes/proxies');
    app.use('/api/v1/proxies', createProxiesRouter(db));

    // Worker 生命周期管理路由
    const createWorkerConfigsRouter = require('./api/routes/worker-configs');
    app.use('/api/v1/worker-configs', createWorkerConfigsRouter(workerConfigDAO));

    const createWorkerLifecycleRouter = require('./api/routes/worker-lifecycle');
    app.use('/api/v1/worker-lifecycle', createWorkerLifecycleRouter(workerLifecycleManager, workerConfigDAO));

    logger.info('API routes mounted');

    // 12. 启动HTTP服务器
    server.listen(PORT, () => {
      logger.info(`╔═══════════════════════════════════════════╗`);
      logger.info(`║  Master Server Started                    ║`);
      logger.info(`╠═══════════════════════════════════════════╣`);
      logger.info(`║  Port: ${PORT}                               ║`);
      logger.info(`║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(20)} ║`);
      logger.info(`║  Namespaces: /worker, /client, /admin     ║`);
      logger.info(`╚═══════════════════════════════════════════╝`);
    });

    // 13. 优雅退出处理
    let isShuttingDown = false;
    let forceShutdownTimer = null;

    const shutdown = async (signal) => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress');
        // 如果是重复的信号，直接返回，不要再次启动强制退出
        return;
      }
      isShuttingDown = true;

      logger.info(`${signal} received, shutting down gracefully`);

      // 启动强制退出超时（缩短到5秒）
      forceShutdownTimer = setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 5000);

      try {
        // 停止调度器和监控（阻止新任务）
        logger.info('Stopping schedulers and monitors...');
        try {
          if (taskScheduler) taskScheduler.stop();
          if (heartbeatMonitor) heartbeatMonitor.stop();
          if (notificationQueue) notificationQueue.stop();
          if (loginHandler) loginHandler.stopCleanupTimer();
        } catch (error) {
          logger.warn('Error stopping schedulers:', error.message);
        }

        // 停止所有由 Master 管理的 Worker 进程
        try {
          if (workerLifecycleManager) {
            logger.info('Stopping worker lifecycle manager...');
            await workerLifecycleManager.cleanup();
            logger.info('Worker lifecycle manager stopped');
          }
        } catch (error) {
          logger.warn('Error stopping worker lifecycle manager:', error.message);
        }

        // 等待一小段时间让当前任务完成
        await new Promise(resolve => setTimeout(resolve, 200));

        // 关闭 Socket.IO 服务器
        logger.info('Closing Socket.IO connections...');
        try {
          // 首先断开所有连接
          if (workerNamespace) {
            await new Promise(resolve => {
              try {
                workerNamespace.disconnectSockets();
                setTimeout(resolve, 100); // 给时间让连接断开
              } catch (err) {
                resolve(); // 即使出错也继续
              }
            });
          }
          if (clientNamespace) {
            await new Promise(resolve => {
              try {
                clientNamespace.disconnectSockets();
                setTimeout(resolve, 100);
              } catch (err) {
                resolve();
              }
            });
          }
          if (adminNamespace) {
            await new Promise(resolve => {
              try {
                adminNamespace.disconnectSockets();
                setTimeout(resolve, 100);
              } catch (err) {
                resolve();
              }
            });
          }
          
          // 关闭整个 Socket.IO 服务器
          if (io) {
            await new Promise((resolve) => {
              const timeout = setTimeout(() => {
                logger.warn('Socket.IO close timeout, forcing close');
                resolve();
              }, 1000);

              try {
                io.close(() => {
                  clearTimeout(timeout);
                  logger.info('Socket.IO server closed');
                  resolve();
                });
              } catch (err) {
                clearTimeout(timeout);
                logger.warn('Error closing Socket.IO:', err.message);
                resolve();
              }
            });
          }
        } catch (error) {
          logger.warn('Error closing Socket.IO connections:', error.message);
        }

        // 关闭HTTP服务器
        try {
          logger.info('Closing HTTP server...');
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('HTTP server close timeout'));
            }, 2000);

            server.close((err) => {
              clearTimeout(timeout);
              if (err) reject(err);
              else resolve();
            });
          });
          logger.info('HTTP server closed');
        } catch (error) {
          logger.warn('Error closing HTTP server:', error.message);
        }

        // 关闭数据库
        try {
          if (db) {
            logger.info('Closing database...');
            db.close();
            logger.info('Database closed');
          }
        } catch (error) {
          logger.warn('Error closing database:', error.message);
        }

        // 清除强制退出定时器
        if (forceShutdownTimer) {
          clearTimeout(forceShutdownTimer);
        }

        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // 设置信号处理器
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Windows 兼容性：监听 Ctrl+C（避免重复处理）
    if (process.platform === 'win32') {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      // 在 Windows 上，我们优先使用 readline 的 SIGINT 处理
      // 先移除默认的 SIGINT 处理器
      process.removeAllListeners('SIGINT');
      
      rl.on('SIGINT', () => {
        logger.info('Received SIGINT from readline (Windows)');
        shutdown('SIGINT (Windows)');
      });
    }

    // 捕获未处理的错误
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  } catch (error) {
    logger.error('Failed to start master server:', error);
    process.exit(1);
  }
}

start();
