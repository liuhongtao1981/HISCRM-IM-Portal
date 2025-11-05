/**
 * 主控服务入口
 * 负责Worker管理、任务调度、客户端通信
 */

const path = require('path');
const fs = require('fs');
const child_process = require('child_process');

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

// 加载Debug配置
const debugConfig = require('./config/debug-config');

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
const AccountStatusUpdater = require('./worker_manager/account-status-updater');
// const MessageReceiver = require('./communication/message-receiver'); // ❌ 已废弃，使用 DataSyncReceiver 代替
const SessionManager = require('./communication/session-manager');
const NotificationBroadcaster = require('./communication/notification-broadcaster');
const NotificationQueue = require('./communication/notification-queue');
const NotificationHandler = require('./notification/notification-handler');
const LoginHandler = require('./login/login-handler');
const DataStore = require('./data/data-store');
const DataSyncReceiver = require('./communication/data-sync-receiver');
const { PersistenceManager } = require('./persistence');
const { WORKER_REGISTER, WORKER_HEARTBEAT, WORKER_MESSAGE_DETECTED, WORKER_ACCOUNT_STATUS, WORKER_DATA_SYNC, CLIENT_SYNC_REQUEST } = require('@hiscrm-im/shared/protocol/messages');

// 初始化logger
const logger = createLogger('master', './logs');

// 配置
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/master.db';

// 初始化Express应用
const app = express();
const server = http.createServer(app);

// Express中间件
app.use(express.json({ limit: '10mb', strict: false }));

// 编码修复中间件 - 处理GB2312或其他编码被误解为UTF-8的问题
app.use((req, res, next) => {
  // 如果是JSON请求，检查并修复编码问题
  if (req.body && typeof req.body === 'object') {
    const fixEncoding = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;

      if (Array.isArray(obj)) {
        return obj.map(item => fixEncoding(item));
      }

      const fixed = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          // 检测是否包含替换字符，说明编码错误
          if (value.includes('\ufffd')) {
            // 尝试从错误的UTF-8恢复
            try {
              // GB2312 → UTF-8恢复
              const buffer = Buffer.from(value, 'latin1');
              fixed[key] = buffer.toString('utf8');
            } catch (e) {
              fixed[key] = value; // 如果失败，保持原值
            }
          } else {
            fixed[key] = value;
          }
        } else if (typeof value === 'object') {
          fixed[key] = fixEncoding(value);
        } else {
          fixed[key] = value;
        }
      }
      return fixed;
    };

    req.body = fixEncoding(req.body);
  }

  next();
});

app.use(requestIdMiddleware);

// CORS 中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

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
let accountStatusUpdater;
// let messageReceiver; // ❌ 已废弃
let sessionManager;
let notificationBroadcaster;
let notificationQueue;
let notificationHandler;
let workerNamespace;
let clientNamespace;
let adminNamespace;
let loginHandler;
let workerLifecycleManager;
let workerConfigDAO;
let workerRuntimeDAO;
let dataStore;
let dataSyncReceiver;
let persistenceManager;
let cacheDAO;

// API路由
app.get('/api/v1/status', (req, res) => {
  const workerStats = heartbeatMonitor ? heartbeatMonitor.getStats() : {};
  const schedulingStats = taskScheduler ? taskScheduler.getSchedulingStats() : {};
  const sessionStats = sessionManager ? sessionManager.getStats() : {};
  const queueStats = notificationQueue ? notificationQueue.getStats() : {};
  const broadcasterStats = notificationBroadcaster ? notificationBroadcaster.getStats() : {};
  const dataStoreStats = dataStore ? dataStore.getStats() : {};
  const dataSyncStats = dataSyncReceiver ? dataSyncReceiver.getStats() : {};

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
      dataStore: dataStoreStats,
      dataSync: dataSyncStats,
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
 * 处理 Worker 上报的账号状态
 */
function handleAccountStatus(socket, message) {
  const { worker_id, account_statuses } = message.payload;

  try {
    logger.debug(`Received account status from worker ${worker_id}`, {
      accountCount: account_statuses?.length,
    });

    // ⭐ 调试日志：打印 Worker 发送的原始数据
    if (account_statuses && account_statuses.length > 0) {
      logger.info(`📊 Worker ${worker_id} 发送的账户状态详情:`);
      account_statuses.forEach((item, index) => {
        logger.info(`  [${index}] Account ID: ${item.account_id}`);
        logger.info(`      Status:`, item.status);
      });
    }

    if (!Array.isArray(account_statuses)) {
      throw new Error('account_statuses must be an array');
    }

    // 批量更新账号状态
    const result = accountStatusUpdater.batchUpdateAccountStatuses(
      account_statuses.map(item => ({
        account_id: item.account_id,
        status: item.status,
      }))
    );

    // 发送确认消息
    const { createMessage, WORKER_ACCOUNT_STATUS_ACK } = require('@hiscrm-im/shared/protocol/messages');
    const { MESSAGE } = require('@hiscrm-im/shared/protocol/events');

    const ackMessage = createMessage(WORKER_ACCOUNT_STATUS_ACK, {
      success: true,
      updated: result.successCount,
      failed: result.failureCount,
    });

    socket.emit(MESSAGE, ackMessage);

    logger.info(`Updated ${result.successCount} account statuses from worker ${worker_id}`);
  } catch (error) {
    logger.error(`Failed to handle account status from worker ${worker_id}:`, error);

    const { createMessage, WORKER_ACCOUNT_STATUS_ACK } = require('@hiscrm-im/shared/protocol/messages');
    const { MESSAGE } = require('@hiscrm-im/shared/protocol/events');

    const errorMessage = createMessage(WORKER_ACCOUNT_STATUS_ACK, {
      success: false,
      error: error.message,
    });

    socket.emit(MESSAGE, errorMessage);
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

/**
 * 处理 Worker 发送的回复执行结果
 */
function handleReplyResult(data, socket) {
  try {
    const { reply_id, request_id, status, platform_reply_id, error_code, error_message } = data;
    const ReplyDAO = require('./database/reply-dao');
    const replyDAO = new ReplyDAO(db);

    logger.info(`Processing reply result: ${reply_id}`, {
      requestId: request_id,
      status,
    });

    // 获取回复记录
    const reply = replyDAO.getReplyById(reply_id);
    if (!reply) {
      logger.warn(`Reply not found: ${reply_id}`);
      return;
    }

    // 检查是否已经处理过（防止重复处理）
    if (reply.reply_status !== 'executing') {
      logger.warn(`Reply already processed: ${reply_id}, status: ${reply.reply_status}`);
      return;
    }

    // 根据状态处理回复
    if (status === 'success') {
      // 成功：保存到数据库
      replyDAO.updateReplySuccess(reply_id, platform_reply_id, data.data);
      logger.info(`Reply success: ${reply_id}`, { platformReplyId: platform_reply_id });

      // 推送成功结果给客户端
      if (clientNamespace) {
        clientNamespace.emit('server:reply:result', {
          reply_id,
          request_id,
          status: 'success',
          account_id: reply.account_id,
          platform: reply.platform,
          message: '✅ 回复成功！',
          timestamp: Date.now(),
        });
        logger.debug(`Pushed reply success to clients: ${reply_id}`);
      }
    } else if (status === 'failed' || status === 'blocked' || status === 'error') {
      // 失败/被拦截/错误：删除数据库记录，不保存失败的回复
      replyDAO.deleteReply(reply_id);
      logger.warn(`Reply ${status} and deleted from database: ${reply_id}`, {
        reason: status,
        errorCode: error_code,
        errorMessage: error_message,
      });

      // 推送失败结果给客户端（仅通知，不记录）
      if (clientNamespace) {
        const statusMap = {
          'blocked': 'blocked',
          'failed': 'failed',
          'error': 'error'
        };
        clientNamespace.emit('server:reply:result', {
          reply_id,
          request_id,
          status: statusMap[status] || 'failed',
          account_id: reply.account_id,
          platform: reply.platform,
          error_code: error_code,
          error_message: error_message,
          message: `❌ 回复${status === 'blocked' ? '被拦截' : '失败'}: ${error_message || 'Unknown error'}`,
          timestamp: Date.now(),
        });
        logger.debug(`Pushed reply ${status} to clients: ${reply_id}`);
      }
    } else {
      // 其他状态：记录警告
      logger.warn(`Unknown reply status: ${status}`, { reply_id });
    }
  } catch (error) {
    logger.error('Failed to handle reply result:', error);
  }
}

/**
 * Debug 模式：检查并仅允许第一个 Worker 连接
 * 同时将debug参数传递给连接的Worker
 */
function initializeDebugMode() {
  if (!debugConfig.enabled) {
    return;
  }

  logger.info(`🔍 Debug 模式已启用`);
  logger.info(`   - 单 Worker 模式: ${debugConfig.singleWorker.maxWorkers === 1 ? '✓ 启用' : '✗ 禁用'}`);
  logger.info(`   - Anthropic MCP: ✓ 启用 (http://localhost:9222) - Chrome DevTools Protocol`);
  logger.info(`   - DEBUG API: ✓ 启用 (http://localhost:3000/api/debug)`);
  logger.info(`   - 账户限制: 每个 Worker 最多 ${debugConfig.accounts.maxPerWorker} 个账户`);
}

// 启动服务
async function start() {
  try {
    // 0. 打印Debug配置信息（如果Debug模式启用）
    if (debugConfig.enabled) {
      debugConfig.print();
    }

    // 1. 初始化数据库
    db = initDatabase(DB_PATH);
    logger.info('Database initialized');

    // 1.5 初始化 DataStore (内存数据存储)
    dataStore = new DataStore();
    logger.info('DataStore initialized');

    // 1.6 初始化 PersistenceManager (数据持久化管理器)
    persistenceManager = new PersistenceManager(db, dataStore);
    await persistenceManager.start();
    logger.info('PersistenceManager initialized and started');

    // 1.65 初始化 CacheDAO (cache_* 表数据访问层)
    const CacheDAO = require('./persistence/cache-dao');
    cacheDAO = new CacheDAO(db);
    logger.info('CacheDAO initialized');

    // 1.7 初始化 DataSyncReceiver
    dataSyncReceiver = new DataSyncReceiver(dataStore);
    logger.info('DataSyncReceiver initialized');

    // 2. 初始化Worker注册表
    workerRegistry = new WorkerRegistry(db);
    logger.info('Worker registry initialized');

    // 3. 初始化客户端会话管理器
    sessionManager = new SessionManager(db);
    logger.info('Session manager initialized');

    // 4. 创建 masterServer 对象
    const masterServer = { db, dataStore };

    // 4.1 初始化 Socket.IO 服务器（第一次调用，不含登录处理器）
    let tempHandlers = {
      [WORKER_REGISTER]: (socket, msg) => workerRegistry.handleRegistration(socket, msg),
      [WORKER_HEARTBEAT]: (socket, msg) => heartbeatMonitor.handleHeartbeat(socket, msg),
      // [WORKER_MESSAGE_DETECTED]: (socket, msg) => messageReceiver.handleMessageDetected(socket, msg), // ❌ 已废弃
      [WORKER_ACCOUNT_STATUS]: (socket, msg) => handleAccountStatus(socket, msg),
      [WORKER_DATA_SYNC]: (socket, msg) => dataSyncReceiver.handleWorkerDataSync(socket, msg),
      [CLIENT_SYNC_REQUEST]: (socket, msg) => handleClientSync(socket, msg),
      onWorkerDisconnect: (socket) => workerRegistry.handleDisconnect(socket),
      onClientConnect: (socket) => handleClientConnect(socket),
      onClientDisconnect: (socket) => handleClientDisconnect(socket),
      onReplyResult: (data, socket) => handleReplyResult(data, socket),
    };

    const socketNamespaces = initSocketServer(
      server,
      tempHandlers,
      masterServer,
      sessionManager
    );

    // 将 socketNamespaces 传递给 masterServer
    masterServer.workerNamespace = socketNamespaces.workerNamespace;
    masterServer.clientNamespace = socketNamespaces.clientNamespace;
    masterServer.adminNamespace = socketNamespaces.adminNamespace;
    workerNamespace = socketNamespaces.workerNamespace;
    clientNamespace = socketNamespaces.clientNamespace;
    adminNamespace = socketNamespaces.adminNamespace;
    logger.info('Socket.IO server initialized');

    // 4.2 旧 DAO 层已删除 - 现在使用 DataStore + CacheDAO
    // ❌ 已删除: CommentsDAO, DirectMessagesDAO, ConversationsDAO, ContentsDAO, DiscussionsDAO
    // ✅ 当前: DataStore (内存) + CacheDAO (持久化)

    // 4.3 初始化 IM WebSocket 服务器 (CRM PC IM 客户端)
    // 使用 CacheDAO 支持已读状态处理（从 cache_* 表读取）
    // 使用 AccountsDAO 获取账户信息（user_info, avatar等）
    const AccountsDAO = require('./database/accounts-dao');
    const accountsDAO = new AccountsDAO(db);
    const IMWebSocketServer = require('./communication/im-websocket-server');
    const imWebSocketServer = new IMWebSocketServer(socketNamespaces.io, dataStore, cacheDAO, accountsDAO);
    imWebSocketServer.setupHandlers();
    logger.info('IM WebSocket Server initialized with CacheDAO and AccountsDAO support');

    // 4.3.1 启动未读消息定期推送（每 5 秒检测一次）
    imWebSocketServer.startUnreadNotificationPolling(5000);
    logger.info('IM WebSocket unread notification polling started (interval: 5s)');

    // 4.4 初始化 NotificationHandler（在 Socket.IO 之后）
    notificationHandler = new NotificationHandler(db, socketNamespaces);
    logger.info('Notification handler initialized');

    // 4.5 添加通知推送处理器
    tempHandlers.onNotificationPush = async (data, socket) => {
      try {
        await notificationHandler.handleWorkerNotification(data);
      } catch (error) {
        logger.error('Failed to handle notification push:', error);
      }
    };
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
    notificationBroadcaster = new NotificationBroadcaster(sessionManager, clientNamespace, adminNamespace);
    logger.info('Notification broadcaster initialized');

    notificationQueue = new NotificationQueue(db, notificationBroadcaster);
    notificationQueue.start();
    logger.info('Notification queue started');

    // 7. 初始化消息接收器（❌ 已废弃，数据现在通过 DataSyncReceiver 流入 DataStore）
    // messageReceiver = new MessageReceiver(db, notificationQueue);
    // logger.info('Message receiver initialized');

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

    // 10.1 初始化账号状态更新器
    accountStatusUpdater = new AccountStatusUpdater(db);
    logger.info('Account status updater initialized');

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

    // ❌ 已废弃: messages/comments/direct-messages API（使用旧表，未被前端调用）
    // const createMessagesRouter = require('./api/routes/messages');
    // const { createCommentsRouter, createDirectMessagesRouter } = require('./api/routes/messages');
    // const messagesRouter = createMessagesRouter(db);
    // const commentsRouter = createCommentsRouter(db);
    // const directMessagesRouter = createDirectMessagesRouter(db);
    // app.use('/api/v1/messages', messagesRouter);
    // app.use('/api/v1/comments', commentsRouter);
    // app.use('/api/v1/direct-messages', directMessagesRouter);

    // ✅ 新增: Cache Data API（使用 cache_* 表，供 Admin-Web 访问）
    const createCacheDataRouter = require('./api/routes/cache-data');
    app.use('/api/v1/cache', createCacheDataRouter(db, cacheDAO));

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

    // 回复功能路由
    const createRepliesRouter = require('./api/routes/replies');
    app.use('/api/v1/replies', createRepliesRouter(db, {
      getSocketServer: () => socketNamespaces.workerNamespace,
    }));

    // 平台管理路由
    const createPlatformsRouter = require('./api/routes/platforms');
    app.use('/api/v1/platforms', createPlatformsRouter(db, {
      getWorkerRegistry: () => workerRegistry,
    }));

    // IM 兼容层路由已移除 - PC IM 客户端已改用 WebSocket
    // 参见: packages/master/src/communication/im-websocket-server.js

    // DEBUG API 路由 (仅在 DEBUG 模式启用)
    if (debugConfig.enabled) {
      const { router: debugRouter, initDebugAPI } = require('./api/routes/debug-api');
      initDebugAPI(db, persistenceManager);
      app.use('/api/debug', debugRouter);
      logger.info('DEBUG API routes mounted');
    }

    logger.info('API routes mounted');

    // 12. 设置定期清理旧通知的定时器（防止通知堆积）
    // 每小时清理一次 7 天以前的已发送通知
    setInterval(() => {
      try {
        const NotificationsDAO = require('./database/notifications-dao');
        const notificationsDAO = new NotificationsDAO(db);
        const cutoffTime = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // 7天

        const stmt = db.prepare(`
          DELETE FROM notifications
          WHERE is_sent = 1 AND sent_at < ?
        `);
        const result = stmt.run(cutoffTime);

        if (result.changes > 0) {
          logger.info(`[Cleanup] Deleted ${result.changes} old sent notifications (older than 7 days)`);
        }
      } catch (error) {
        logger.error('[Cleanup] Failed to clean up notifications:', error);
      }
    }, 60 * 60 * 1000); // 1小时执行一次

    // 13. 初始化Debug模式配置
    initializeDebugMode();

    // 14. 启动HTTP服务器
    server.listen(PORT, () => {
      logger.info(`╔═══════════════════════════════════════════╗`);
      logger.info(`║  Master Server Started                    ║`);
      logger.info(`╠═══════════════════════════════════════════╣`);
      logger.info(`║  Port: ${PORT}                               ║`);
      logger.info(`║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(20)} ║`);
      logger.info(`║  Namespaces: /worker, /client, /admin     ║`);
      logger.info(`╚═══════════════════════════════════════════╝`);
    });

    // 15. 优雅退出处理
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
          if (imWebSocketServer) imWebSocketServer.stopUnreadNotificationPolling();
        } catch (error) {
          logger.warn('Error stopping schedulers:', error.message);
        }

        // 停止持久化管理器（在退出前持久化数据）
        logger.info('Stopping persistence manager...');
        try {
          if (persistenceManager) {
            await persistenceManager.stop();
            logger.info('Persistence manager stopped');
          }
        } catch (error) {
          logger.warn('Error stopping persistence manager:', error.message);
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
