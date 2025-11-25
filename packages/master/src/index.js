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
const {
  WORKER_REGISTER,
  WORKER_HEARTBEAT,
  WORKER_MESSAGE_DETECTED,
  WORKER_ACCOUNT_STATUS,
  WORKER_DATA_SYNC,
  WORKER_MESSAGES_UPDATE,
  WORKER_COMMENTS_UPDATE,
  WORKER_CONVERSATIONS_UPDATE,
  WORKER_CONTENTS_UPDATE,
  CLIENT_SYNC_REQUEST
} = require('@hiscrm-im/shared/protocol/messages');

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
    if (reply.reply_status !== 'executing' && reply.reply_status !== 'pending') {
      logger.warn(`Reply already processed: ${reply_id}, status: ${reply.reply_status}`);
      return;
    }

    // 如果状态还是 pending，先更新为 executing（兼容性处理）
    if (reply.reply_status === 'pending') {
      logger.info(`Reply status was pending, updating to executing: ${reply_id}`);
      replyDAO.updateReplyStatusToExecuting(reply_id);
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
      // ✨ 增量更新消息处理器（记录日志但不处理，因为我们使用完整快照）
      [WORKER_MESSAGES_UPDATE]: (socket, msg) => logger.debug(`Received WORKER_MESSAGES_UPDATE (using WORKER_DATA_SYNC instead)`),
      [WORKER_COMMENTS_UPDATE]: (socket, msg) => logger.debug(`Received WORKER_COMMENTS_UPDATE (using WORKER_DATA_SYNC instead)`),
      [WORKER_CONVERSATIONS_UPDATE]: (socket, msg) => logger.debug(`Received WORKER_CONVERSATIONS_UPDATE (using WORKER_DATA_SYNC instead)`),
      [WORKER_CONTENTS_UPDATE]: (socket, msg) => logger.debug(`Received WORKER_CONTENTS_UPDATE (using WORKER_DATA_SYNC instead)`),
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

    // 添加账户重启完成处理器（在 socket namespaces 初始化后）
    tempHandlers.onAccountRestarted = async (data, socket) => {
      const { accountId, platform, success } = data;
      logger.info(`[手动登录] Worker 账户 ${accountId} 重启${success ? '成功' : '失败'}`);

      // 通知 IM 客户端账户状态已更新
      const clientNamespace = socketNamespaces.clientNamespace;
      if (clientNamespace) {
        clientNamespace.emit('master:account-status-updated', {
          accountId,
          platform,
          status: success ? 'active' : 'error',
          timestamp: Date.now(),
        });
        logger.info(`[手动登录] 已通知 IM 客户端：账户 ${accountId} 状态已更新`);
      }
    };
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
    // 使用 WorkerRegistry 支持发送消息到 Worker
    const AccountsDAO = require('./database/accounts-dao');
    const accountsDAO = new AccountsDAO(db);
    const IMWebSocketServer = require('./communication/im-websocket-server');
    const imWebSocketServer = new IMWebSocketServer(socketNamespaces.io, dataStore, cacheDAO, accountsDAO, workerRegistry);
    imWebSocketServer.setupHandlers();
    logger.info('IM WebSocket Server initialized with CacheDAO, AccountsDAO and WorkerRegistry support');

    // 4.3.1 将 imWebSocketServer 注入到 DataSyncReceiver（延迟注入）
    dataSyncReceiver.setIMWebSocketServer(imWebSocketServer);
    logger.info('DataSyncReceiver connected to IM WebSocket Server for message broadcasting');

    // 4.3.1 启动未读消息定期推送（已移除）
    // ✅ 新消息实时推送架构优化：移除Master层定时推送，改用Worker立即推送 + Master简易概要推送
    // - Worker层在检测到新消息时立即推送（account-data-manager.js中的syncToMasterNow()）
    // - Master层只推送简易概要（data-sync-receiver.js中的buildNewMessageHints()）
    // - 客户端按需拉取详细数据，减少服务器推送压力
    // - Worker保留30s定时推送作为fallback机制
    // imWebSocketServer.startUnreadNotificationPolling(5000);
    // logger.info('IM WebSocket unread notification polling started (interval: 5s)');

    // 4.3.2 清理DataStore中已删除账户的数据
    imWebSocketServer.cleanupDeletedAccounts();
    logger.info('DataStore cleanup completed');

    // 4.3.3 清理cache_metadata表中已删除账户的数据
    // cache_metadata 表只是辅助存储统计信息，主数据来源是 Worker 发送的 DataStore
    // 这里清理数据库中不存在的账户记录
    const allMetadata = cacheDAO.getAllMetadata();
    let cleanedCount = 0;
    allMetadata.forEach(metadata => {
      const accountExists = accountsDAO.findById(metadata.account_id);
      if (!accountExists) {
        logger.info(`[Cleanup] Removing deleted account from cache: ${metadata.account_id}`);
        cacheDAO.deleteAccountData(metadata.account_id);
        cleanedCount++;
      }
    });
    if (cleanedCount > 0) {
      logger.info(`Cache metadata cleanup completed: removed ${cleanedCount} deleted accounts`);
    } else {
      logger.info('Cache metadata is clean, no deleted accounts found');
    }

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

    // 5. 初始化 LoginHandler（在 Socket.IO 和 namespaces 初始化之后）
    loginHandler = new LoginHandler(db, adminNamespace, workerNamespace, workerRegistry);
    logger.info('Login handler initialized');

    // 5.1 添加登录事件处理器（在 loginHandler 初始化后）
    tempHandlers.onLoginQRCodeReady = (data) => {
      loginHandler.handleQRCodeReady(data.session_id, data.qr_code_data, data.qr_code_url);
    };

    tempHandlers.onLoginSuccess = (data) => {
      // 🔑 场景1：手动登录流程（有 session_id）
      if (data.session_id) {
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
      }
      // 🔑 场景2：登录检测流程（只有 account_id 和 user_info，用于更新用户信息）
      else if (data.account_id && data.user_info) {
        logger.info(`[Login Detection] Received user info for account ${data.account_id}:`, {
          nickname: data.user_info.platform_username,
          platform_user_id: data.user_info.platform_user_id
        });

        try {
          const now = Math.floor(Date.now() / 1000);

          // 构建动态更新 SQL
          const updateFields = ['updated_at = ?'];
          const params = [now];

          // 更新 platform_username（昵称）
          if (data.user_info.platform_username) {
            updateFields.push('platform_username = ?');
            params.push(data.user_info.platform_username);
            logger.info(`[Login Detection] Updating platform_username to: ${data.user_info.platform_username}`);
          }

          // 更新 avatar（头像）
          if (data.user_info.avatar) {
            updateFields.push('avatar = ?');
            params.push(data.user_info.avatar);
            logger.info(`[Login Detection] Updating avatar to: ${data.user_info.avatar}`);
          }

          // 更新 platform_user_id（抖音号/uid），仅在为空时更新
          if (data.user_info.platform_user_id) {
            const currentAccount = db.prepare('SELECT platform_user_id FROM accounts WHERE id = ?').get(data.account_id);
            if (!currentAccount || !currentAccount.platform_user_id) {
              updateFields.push('platform_user_id = ?');
              params.push(data.user_info.platform_user_id);
              logger.info(`[Login Detection] Updating platform_user_id to: ${data.user_info.platform_user_id}`);
            }
          }

          // 更新 total_followers 和 total_following
          if (data.user_info.total_followers !== undefined) {
            updateFields.push('total_followers = ?');
            params.push(data.user_info.total_followers);
          }

          if (data.user_info.total_following !== undefined) {
            updateFields.push('total_following = ?');
            params.push(data.user_info.total_following);
          }

          // 添加 WHERE 条件的 accountId
          params.push(data.account_id);

          const sql = `UPDATE accounts SET ${updateFields.join(', ')} WHERE id = ?`;
          const result = db.prepare(sql).run(...params);

          if (result.changes > 0) {
            logger.info(`[Login Detection] ✅ User info updated successfully for account ${data.account_id}`);

            // 推送账户状态变更到 IM 客户端（传递状态对象以触发推送）
            accountStatusUpdater.pushAccountStatusToIM(data.account_id, {
              total_followers: data.user_info.total_followers,
              total_following: data.user_info.total_following
            });
          } else {
            logger.warn(`[Login Detection] Account ${data.account_id} not found or not updated`);
          }
        } catch (error) {
          logger.error(`[Login Detection] Failed to update user info for account ${data.account_id}:`, error);
        }
      } else {
        logger.warn('[Login Detection] Invalid login success data: missing session_id or account_id');
      }
    };

    tempHandlers.onLoginFailed = (data) => {
      loginHandler.handleLoginFailed(data.session_id, data.error_message, data.error_type);
    };

    tempHandlers.onManualLoginSuccess = async (data, socket, workerNamespace) => {
      try {
        const { accountId, platform, storageState, timestamp } = data;
        logger.info(`[手动登录] 收到账户 ${accountId} 的登录数据（Cookies: ${storageState.cookies?.length || 0} 个）`);

        // 1. 检查账户是否存在（从数据库）
        const account = accountsDAO.findById(accountId);

        if (!account) {
          logger.error(`[手动登录] 账户 ${accountId} 不存在`);
          socket.emit('client:manual-login-success:error', {
            error: '账户不存在',
            accountId
          });
          return;
        }

        // 2. 更新数据库中的 storage_state（直接数据库操作，因为 Worker 需要读取）
        accountsDAO.update(accountId, {
          storage_state: JSON.stringify(storageState),
          last_login_time: timestamp || Date.now()
        });

        logger.info(`[手动登录] ✅ 账户 ${accountId} storage_state 已更新到数据库`);

        // 3. 获取账户的 assigned_worker_id（使用前面获取的 account 对象）
        const workerId = account.assigned_worker_id;

        if (!workerId) {
          logger.warn(`[手动登录] 账户 ${accountId} 未分配到 Worker，稍后会自动分配`);
          socket.emit('client:manual-login-success:ack', {
            accountId,
            success: true,
            message: '登录成功，等待 Worker 自动分配',
            timestamp: Date.now()
          });
          return;
        }

        // 4. 通知对应的 Worker 重启账户（让其重新加载 storage_state）
        logger.info(`[手动登录] 通知 Worker ${workerId} 重启账户 ${accountId}`);

        // 使用协议定义的消息类型：master:update-account-storage
        workerNamespace.to(`worker:${workerId}`).emit('master:update-account-storage', {
          accountId,
          platform,
          storageState, // Worker 需要 storageState 来重新初始化浏览器
          timestamp: Date.now()
        });

        logger.info(`[手动登录] ✅ 已通知 Worker ${workerId} 重启账户 ${accountId}`);

        // 5. 发送确认给客户端
        socket.emit('client:manual-login-success:ack', {
          accountId,
          success: true,
          workerId,
          timestamp: Date.now()
        });

        logger.info(`[手动登录] ✅ 手动登录流程完成：${accountId}`);

      } catch (error) {
        logger.error(`[手动登录] 处理失败:`, error);
        socket.emit('client:manual-login-success:error', {
          error: error.message,
          accountId: data.accountId
        });
      }
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

    // 10. 初始化账户分配器（传入 DataStore 用于删除账号时清理内存）
    accountAssigner = new AccountAssigner(db, workerRegistry, taskScheduler, dataStore);
    logger.info('Account assigner initialized');

    // 10.1 初始化账号状态更新器
    accountStatusUpdater = new AccountStatusUpdater(db);
    logger.info('Account status updater initialized');

    // ⭐ 将 IM WebSocket Server 注入到 AccountStatusUpdater（用于推送状态变更）
    accountStatusUpdater.setIMWebSocketServer(imWebSocketServer);
    logger.info('AccountStatusUpdater connected to IM WebSocket Server for status broadcasting');

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
