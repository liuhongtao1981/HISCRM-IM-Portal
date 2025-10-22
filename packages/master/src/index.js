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
const MessageReceiver = require('./communication/message-receiver');
const SessionManager = require('./communication/session-manager');
const NotificationBroadcaster = require('./communication/notification-broadcaster');
const NotificationQueue = require('./communication/notification-queue');
const NotificationHandler = require('./notification/notification-handler');
const LoginHandler = require('./login/login-handler');
const { WORKER_REGISTER, WORKER_HEARTBEAT, WORKER_MESSAGE_DETECTED, WORKER_ACCOUNT_STATUS, CLIENT_SYNC_REQUEST } = require('@hiscrm-im/shared/protocol/messages');

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
let messageReceiver;
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
      [WORKER_ACCOUNT_STATUS]: (socket, msg) => handleAccountStatus(socket, msg),
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

    // 4.2 初始化 NotificationHandler（在 Socket.IO 之后）
    notificationHandler = new NotificationHandler(db, socketNamespaces);
    logger.info('Notification handler initialized');

    // 4.3 添加通知推送处理器
    tempHandlers.onNotificationPush = async (data, socket) => {
      try {
        await notificationHandler.handleWorkerNotification(data);
      } catch (error) {
        logger.error('Failed to handle notification push:', error);
      }
    };

    // 4.4 添加爬虫相关处理器
    const CommentsDAO = require('./database/comments-dao');
    const DouyinVideoDAO = require('./database/douyin-video-dao');
    const DirectMessagesDAO = require('./database/messages-dao');
    const ConversationsDAO = require('./database/conversations-dao');

    const commentsDAO = new CommentsDAO(db);
    const douyinVideoDAO = new DouyinVideoDAO(db);
    const directMessagesDAO = new DirectMessagesDAO(db);
    const conversationsDAO = new ConversationsDAO(db);

    // ============================================
    // 新数据推送处理器 (IsNewPushTask)
    // ============================================

    /**
     * 处理新评论推送
     * 逻辑：
     * 1. 检查数据是否已存在
     * 2. 新数据 (不存在): INSERT + 推送客户端通知
     * 3. 历史数据 (已存在) 且 is_new=true: 推送客户端通知
     * 4. 历史数据 (已存在) 且 is_new=false: 不推送
     * 5. 发送 ACK 反馈到 Worker
     */
    tempHandlers.onPushNewComments = async (data, socket) => {
      try {
        const { request_id, account_id, platform_user_id, comments } = data;

        if (!Array.isArray(comments) || comments.length === 0) {
          logger.warn(`[IsNew] Received empty comments array (request #${request_id})`);
          socket.emit(`master:push_new_comments_ack_${request_id}`, {
            success: true,
            inserted: 0,
            skipped: 0,
            message: 'Empty comments array'
          });
          return;
        }

        let inserted = 0;
        let skipped = 0;
        const commentsToNotify = [];

        // 处理每条评论
        for (const comment of comments) {
          try {
            // 检查评论是否已存在
            const exists = commentsDAO.exists(account_id, comment.id);

            if (!exists) {
              // 新评论：插入数据库 + 加入通知列表
              const newComment = {
                id: comment.id,
                account_id,
                platform_user_id,
                platform_comment_id: comment.id,
                content: comment.content || '',
                author_name: comment.author_name || '',
                author_id: comment.author_id || '',
                post_id: comment.post_id || '',
                post_title: comment.post_title || '',
                is_new: 1,
                is_read: 0,
                detected_at: Math.floor(Date.now() / 1000),
                created_at: comment.created_at || Math.floor(Date.now() / 1000),
              };

              try {
                commentsDAO.bulkInsert([newComment]);
                inserted++;
                commentsToNotify.push({
                  type: 'new_comment',
                  data: newComment,
                  first_seen_at: newComment.detected_at
                });
                logger.debug(`[IsNew] New comment inserted: ${comment.id}`);
              } catch (insertError) {
                logger.warn(`[IsNew] Failed to insert comment ${comment.id}:`, insertError.message);
                skipped++;
              }
            } else {
              // 历史数据：检查 is_new 标志
              const existingComment = commentsDAO.findAll({
                account_id,
                platform_comment_id: comment.id  // ← 更具体的查询
              }).find(c => c.platform_comment_id === comment.id);

              if (existingComment && existingComment.is_new === 1) {
                // 历史但标记为新的：加入通知列表 (严格检查 === 1)
                skipped++;
                commentsToNotify.push({
                  type: 'history_comment',
                  data: existingComment,
                  first_seen_at: existingComment.detected_at
                });
                logger.debug(`[IsNew] History comment with is_new=true: ${comment.id}`);
              } else if (existingComment && existingComment.is_new === 0) {
                // 历史且 is_new=false：不推送
                skipped++;
                logger.debug(`[IsNew] History comment with is_new=false, skipped: ${comment.id}`);
              } else {
                // 消息不存在（不应该发生，但作为保障）
                skipped++;
                logger.warn(`[IsNew] Comment appears to exist but not found: ${comment.id}`);
              }
            }
          } catch (itemError) {
            logger.warn(`[IsNew] Error processing comment ${comment.id}:`, itemError.message);
            skipped++;
          }
        }

        // 发送客户端通知
        if (commentsToNotify.length > 0) {
          try {
            clientNamespace.emit('new:comment', {
              type: 'batch',
              account_id,
              platform_user_id,
              data: commentsToNotify,
              timestamp: Math.floor(Date.now() / 1000)
            });
            logger.info(`[IsNew] Sent ${commentsToNotify.length} comment notifications to clients`);

            // ✅ 推送后标记这些评论为 is_new=false
            const commentIds = commentsToNotify
              .filter(c => c.data && c.data.is_new === 1)
              .map(c => c.data.id);

            if (commentIds.length > 0) {
              try {
                commentsDAO.markNewAsViewed(commentIds);
                logger.info(`[IsNew] Marked ${commentIds.length} comments as viewed (is_new=false)`);
              } catch (markError) {
                logger.warn(`[IsNew] Failed to mark comments as viewed:`, markError.message);
              }
            }
          } catch (notifyError) {
            logger.warn(`[IsNew] Failed to notify clients about comments:`, notifyError.message);
          }
        }

        // 发送 ACK 反馈
        socket.emit(`master:push_new_comments_ack_${request_id}`, {
          success: true,
          inserted,
          skipped,
          notified: commentsToNotify.length
        });

        logger.info(`[IsNew] Comments push completed (request #${request_id}): ${inserted} inserted, ${skipped} skipped`);
      } catch (error) {
        logger.error('[IsNew] Error in onPushNewComments:', error);
        socket.emit(`master:push_new_comments_ack_${data?.request_id}`, {
          success: false,
          error: error.message
        });
      }
    };

    /**
     * 处理新私信推送
     */
    tempHandlers.onPushNewMessages = async (data, socket) => {
      try {
        const { request_id, account_id, platform_user_id, messages } = data;

        if (!Array.isArray(messages) || messages.length === 0) {
          logger.warn(`[IsNew] Received empty messages array (request #${request_id})`);
          socket.emit(`master:push_new_messages_ack_${request_id}`, {
            success: true,
            inserted: 0,
            skipped: 0,
            message: 'Empty messages array'
          });
          return;
        }

        let inserted = 0;
        let skipped = 0;
        const messagesToNotify = [];

        // 处理每条私信
        for (const message of messages) {
          try {
            // 检查私信是否已存在
            const exists = directMessagesDAO.findAll({
              account_id,
              platform_user_id
            }).some(m => m.platform_message_id === message.id);

            if (!exists) {
              // 新私信：插入数据库 + 加入通知列表
              const newMessage = {
                id: message.id,
                account_id,
                platform_user_id,
                platform_message_id: message.id,
                from_user_id: message.from_user_id || '',
                from_user_name: message.from_user_name || '',
                content: message.content || '',
                is_new: 1,
                is_read: 0,
                detected_at: Math.floor(Date.now() / 1000),
                created_at: message.created_at || Math.floor(Date.now() / 1000),
              };

              try {
                directMessagesDAO.bulkInsert([newMessage]);
                inserted++;
                messagesToNotify.push({
                  type: 'new_message',
                  data: newMessage,
                  first_seen_at: newMessage.detected_at
                });
                logger.debug(`[IsNew] New message inserted: ${message.id}`);
              } catch (insertError) {
                logger.warn(`[IsNew] Failed to insert message ${message.id}:`, insertError.message);
                skipped++;
              }
            } else {
              // 历史数据：检查 is_new 标志
              const existingMessage = directMessagesDAO.findAll({
                account_id,
                platform_user_id  // ← 更具体的查询
              }).find(m => m.platform_message_id === message.id);

              if (existingMessage && existingMessage.is_new === 1) {
                // 历史但标记为新的：加入通知列表 (严格检查 === 1)
                skipped++;
                messagesToNotify.push({
                  type: 'history_message',
                  data: existingMessage,
                  first_seen_at: existingMessage.detected_at
                });
                logger.debug(`[IsNew] History message with is_new=true: ${message.id}`);
              } else if (existingMessage && existingMessage.is_new === 0) {
                // 历史且 is_new=false：不推送
                skipped++;
                logger.debug(`[IsNew] History message with is_new=false, skipped: ${message.id}`);
              } else {
                // 消息不存在（不应该发生，但作为保障）
                skipped++;
                logger.warn(`[IsNew] Message appears to exist but not found: ${message.id}`);
              }
            }
          } catch (itemError) {
            logger.warn(`[IsNew] Error processing message ${message.id}:`, itemError.message);
            skipped++;
          }
        }

        // 发送客户端通知
        if (messagesToNotify.length > 0) {
          try {
            clientNamespace.emit('new:message', {
              type: 'batch',
              account_id,
              platform_user_id,
              data: messagesToNotify,
              timestamp: Math.floor(Date.now() / 1000)
            });
            logger.info(`[IsNew] Sent ${messagesToNotify.length} message notifications to clients`);

            // ✅ 推送后标记这些消息为 is_new=false
            const messageIds = messagesToNotify
              .filter(m => m.data && m.data.is_new === 1)
              .map(m => m.data.id);

            if (messageIds.length > 0) {
              try {
                directMessagesDAO.markNewAsViewed(messageIds);
                logger.info(`[IsNew] Marked ${messageIds.length} messages as viewed (is_new=false)`);
              } catch (markError) {
                logger.warn(`[IsNew] Failed to mark messages as viewed:`, markError.message);
              }
            }
          } catch (notifyError) {
            logger.warn(`[IsNew] Failed to notify clients about messages:`, notifyError.message);
          }
        }

        // 发送 ACK 反馈
        socket.emit(`master:push_new_messages_ack_${request_id}`, {
          success: true,
          inserted,
          skipped,
          notified: messagesToNotify.length
        });

        logger.info(`[IsNew] Messages push completed (request #${request_id}): ${inserted} inserted, ${skipped} skipped`);
      } catch (error) {
        logger.error('[IsNew] Error in onPushNewMessages:', error);
        socket.emit(`master:push_new_messages_ack_${data?.request_id}`, {
          success: false,
          error: error.message
        });
      }
    };

    /**
     * 处理新视频推送
     */
    tempHandlers.onPushNewVideos = async (data, socket) => {
      try {
        const { request_id, account_id, platform_user_id, videos } = data;

        if (!Array.isArray(videos) || videos.length === 0) {
          logger.warn(`[IsNew] Received empty videos array (request #${request_id})`);
          socket.emit(`master:push_new_videos_ack_${request_id}`, {
            success: true,
            inserted: 0,
            skipped: 0,
            message: 'Empty videos array'
          });
          return;
        }

        let inserted = 0;
        let skipped = 0;
        const videosToNotify = [];

        // 处理每个视频
        for (const video of videos) {
          try {
            // 检查视频是否已存在 (查询条件: platform_videos_id)
            let existingVideo = douyinVideoDAO.getVideoByPlatformVideosId(video.id, platform_user_id);

            if (!existingVideo) {
              // 如果未找到，尝试用其他ID搜索（向后兼容）
              existingVideo = douyinVideoDAO.getVideoByAwemeId(video.id, platform_user_id);
            }

            if (!existingVideo) {
              // 新视频：插入数据库 + 加入通知列表
              const newVideo = {
                account_id,
                platform_user_id,
                aweme_id: video.id,
                platform_videos_id: video.id,
                title: video.title || '',
                cover: video.cover || '',
                publish_time: video.publish_time || Math.floor(Date.now() / 1000),
                total_comment_count: video.total_comment_count || 0,
                is_new: 1,
              };

              try {
                douyinVideoDAO.upsertVideo(newVideo);
                inserted++;
                videosToNotify.push({
                  type: 'new_video',
                  data: newVideo,
                  first_seen_at: Math.floor(Date.now() / 1000)
                });
                logger.debug(`[IsNew] New video inserted: ${video.id}`);
              } catch (insertError) {
                logger.warn(`[IsNew] Failed to insert video ${video.id}:`, insertError.message);
                skipped++;
              }
            } else {
              // 历史数据：检查 is_new 标志
              if (existingVideo.is_new) {
                // 历史但标记为新的：加入通知列表
                skipped++;
                videosToNotify.push({
                  type: 'history_video',
                  data: existingVideo,
                  first_seen_at: existingVideo.detected_at || Math.floor(Date.now() / 1000)
                });
                logger.debug(`[IsNew] History video with is_new=true: ${video.id}`);
              } else {
                // 历史且 is_new=false：不推送
                skipped++;
                logger.debug(`[IsNew] History video with is_new=false, skipped: ${video.id}`);
              }
            }
          } catch (itemError) {
            logger.warn(`[IsNew] Error processing video ${video.id}:`, itemError.message);
            skipped++;
          }
        }

        // 发送客户端通知
        if (videosToNotify.length > 0) {
          try {
            clientNamespace.emit('new:video', {
              type: 'batch',
              account_id,
              platform_user_id,
              data: videosToNotify,
              timestamp: Math.floor(Date.now() / 1000)
            });
            logger.info(`[IsNew] Sent ${videosToNotify.length} video notifications to clients`);
          } catch (notifyError) {
            logger.warn(`[IsNew] Failed to notify clients about videos:`, notifyError.message);
          }
        }

        // 发送 ACK 反馈
        socket.emit(`master:push_new_videos_ack_${request_id}`, {
          success: true,
          inserted,
          skipped,
          notified: videosToNotify.length
        });

        logger.info(`[IsNew] Videos push completed (request #${request_id}): ${inserted} inserted, ${skipped} skipped`);
      } catch (error) {
        logger.error('[IsNew] Error in onPushNewVideos:', error);
        socket.emit(`master:push_new_videos_ack_${data?.request_id}`, {
          success: false,
          error: error.message
        });
      }
    };

    // 获取评论ID（用于增量爬取）
    tempHandlers.onGetCommentIds = async (data, socket) => {
      try {
        const { aweme_id, options } = data;
        const commentIds = commentsDAO.getCommentIdsByPostId(aweme_id, options || {});
        return {
          success: true,
          comment_ids: commentIds,
        };
      } catch (error) {
        logger.error('Failed to get comment IDs:', error);
        return {
          success: false,
          error: error.message,
          comment_ids: [],
        };
      }
    };

    // 获取历史数据ID列表（用于Worker启动时预加载缓存）
    tempHandlers.onGetHistoryIds = async (data, socket) => {
      try {
        const { account_id } = data;
        logger.info(`Getting history IDs for account ${account_id}`);

        // 获取该账号的所有历史评论ID
        const commentIds = commentsDAO.findAll({ account_id }).map(c => c.id);

        // 获取该账号的所有历史视频ID
        const videoIds = douyinVideoDAO.getAllVideoIds(account_id);

        // 获取该账号的所有历史私信ID
        const messageIds = directMessagesDAO.findAll({ account_id }).map(m => m.id);

        logger.info(`Returning ${commentIds.length} comment IDs, ${videoIds.length} video IDs, ${messageIds.length} message IDs for account ${account_id}`);

        return {
          success: true,
          commentIds,
          videoIds,
          messageIds,
        };
      } catch (error) {
        logger.error('Failed to get history IDs:', error);
        return {
          success: false,
          error: error.message,
          commentIds: [],
          videoIds: [],
          messageIds: [],
        };
      }
    };

    // 更新/插入视频信息
    tempHandlers.onUpsertVideo = async (data, socket) => {
      try {
        const { account_id, platform_user_id, aweme_id, title, cover, publish_time, total_comment_count } = data;

        douyinVideoDAO.upsertVideo({
          account_id,
          platform_user_id,
          aweme_id,
          title,
          cover,
          publish_time,
          total_comment_count: total_comment_count || 0,
        });

        logger.debug(`Video upserted: ${aweme_id}`);
      } catch (error) {
        logger.error('Failed to upsert video:', error);
      }
    };

    // 批量插入评论
    tempHandlers.onBulkInsertComments = async (data, socket) => {
      try {
        const { account_id, platform_user_id, comments } = data;

        const result = commentsDAO.bulkInsert(comments);

        logger.info(`Bulk inserted comments: ${result.inserted} inserted, ${result.skipped} skipped`);
      } catch (error) {
        logger.error('Failed to bulk insert comments:', error);
      }
    };

    // 批量插入私信
    tempHandlers.onBulkInsertMessages = async (data, socket) => {
      try {
        const { account_id, platform_user_id, messages } = data;

        const result = directMessagesDAO.bulkInsert(messages);

        logger.info(`Bulk inserted messages: ${result.inserted} inserted, ${result.skipped} skipped`);
      } catch (error) {
        logger.error('Failed to bulk insert messages:', error);
      }
    };

    // Phase 8 新增: 处理会话数据
    tempHandlers.onBulkInsertConversations = async (data, socket) => {
      try {
        const { account_id, conversations } = data;

        logger.info(`Processing ${conversations?.length || 0} conversations for account ${account_id}`);

        if (!conversations || conversations.length === 0) {
          logger.info('No conversations to insert');
          return;
        }

        // 添加 account_id 到每个会话
        const conversationsWithAccountId = conversations.map(conv => ({
          ...conv,
          account_id,
        }));

        // 使用 upsertMany 批量创建/更新会话
        const result = conversationsDAO.upsertMany(conversationsWithAccountId);

        logger.info(`✅ Bulk upserted conversations: ${result.upserted || conversationsWithAccountId.length} conversations processed`);
      } catch (error) {
        logger.error('Failed to bulk insert conversations:', error);
      }
    };

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
    notificationBroadcaster = new NotificationBroadcaster(sessionManager, clientNamespace, adminNamespace);
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

    const createMessagesRouter = require('./api/routes/messages');
    const { createCommentsRouter, createDirectMessagesRouter } = require('./api/routes/messages');

    const messagesRouter = createMessagesRouter(db);
    const commentsRouter = createCommentsRouter(db);
    const directMessagesRouter = createDirectMessagesRouter(db);

    // 挂载各自的路由器到对应的路径
    app.use('/api/v1/messages', messagesRouter);
    app.use('/api/v1/comments', commentsRouter);
    app.use('/api/v1/direct-messages', directMessagesRouter);

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

    // DEBUG API 路由 (仅在 DEBUG 模式启用)
    if (debugConfig.enabled) {
      const { router: debugRouter, initDebugAPI } = require('./api/routes/debug-api');
      initDebugAPI(db);
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
