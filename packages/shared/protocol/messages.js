/**
 * Socket.IO消息类型定义
 * Version: 1.0.0
 */

// ============================================
// Worker → Master 消息类型
// ============================================

const WORKER_REGISTER = 'worker:register';
const WORKER_REGISTER_ACK = 'worker:register:ack';
const WORKER_HEARTBEAT = 'worker:heartbeat';
const WORKER_HEARTBEAT_ACK = 'worker:heartbeat:ack';
const WORKER_MESSAGE_DETECTED = 'worker:message:detected';
const WORKER_MESSAGE_ACK = 'worker:message:ack';
const WORKER_ACCOUNT_STATUS = 'worker:account:status';  // Worker上报账号状态
const WORKER_ACCOUNT_STATUS_ACK = 'worker:account:status:ack';
const WORKER_ACCOUNT_LOGOUT_ACK = 'worker:account:logout:ack';  // Worker退出账号确认
const WORKER_ERROR = 'worker:error';

// ✨ 新增: Works (作品) 相关消息
const WORKER_WORK_DETECTED = 'worker:work:detected';  // Worker检测到新作品
const WORKER_BULK_INSERT_WORKS = 'worker:bulk_insert_works';  // Worker批量上报作品

// ✨ 新增: Discussions (讨论) 相关消息
const WORKER_DISCUSSION_DETECTED = 'worker:discussion:detected';  // Worker检测到新讨论
const WORKER_BULK_INSERT_DISCUSSIONS = 'worker:bulk_insert_discussions';  // Worker批量上报讨论

// ✨ 新增: Conversations (会话) 批量插入
const WORKER_BULK_INSERT_CONVERSATIONS = 'worker:bulk_insert_conversations';  // Worker批量上报会话

// ============================================
// Master → Worker 消息类型
// ============================================

const MASTER_TASK_ASSIGN = 'master:task:assign';
const MASTER_TASK_ASSIGN_ACK = 'master:task:assign:ack';
const MASTER_TASK_REVOKE = 'master:task:revoke';
const MASTER_ACCOUNT_LOGOUT = 'master:account:logout';  // Master请求退出账号
const MASTER_SHUTDOWN = 'master:shutdown';

// ✨ 新增: Master指令Worker爬取作品和讨论
const MASTER_CRAWL_WORKS = 'master:crawl_works';  // Master指令Worker爬取作品
const MASTER_CRAWL_DISCUSSIONS = 'master:crawl_discussions';  // Master指令Worker爬取讨论

// ✨ 新增: Master通知Worker账户配置已更新（如登录成功后platform_user_id已保存）
const MASTER_ACCOUNT_CONFIG_UPDATE = 'master:account:config_update';  // Master通知Worker重新加载账户配置
const MASTER_ACCOUNT_CONFIG_UPDATE_ACK = 'master:account:config_update:ack';  // Worker确认已重新加载

// ============================================
// Client → Master 消息类型
// ============================================

const CLIENT_CONNECT = 'client:connect';
const CLIENT_CONNECT_ACK = 'client:connect:ack';
const CLIENT_SYNC_REQUEST = 'client:sync:request';
const CLIENT_SYNC_RESPONSE = 'client:sync:response';
const CLIENT_NOTIFICATION_READ = 'client:notification:read';

// ============================================
// Master → Client 消息类型
// ============================================

const MASTER_NOTIFICATION_PUSH = 'master:notification:push';
const MASTER_ACCOUNT_UPDATE = 'master:account:update';

// ============================================
// 消息格式创建工具
// ============================================

/**
 * 创建标准格式消息
 * @param {string} type - 消息类型
 * @param {object} payload - 消息载荷
 * @param {string} [requestId] - 可选的请求ID
 * @returns {object} 标准消息对象
 */
function createMessage(type, payload, requestId = null) {
  const message = {
    type,
    version: 'v1',
    payload,
    timestamp: Date.now(),
  };

  if (requestId) {
    message.requestId = requestId;
  }

  return message;
}

/**
 * 创建错误消息
 * @param {string} originalType - 原始消息类型
 * @param {string} errorCode - 错误代码
 * @param {string} errorMessage - 错误消息
 * @param {object} [details] - 错误详情
 * @returns {object} 错误消息对象
 */
function createErrorMessage(originalType, errorCode, errorMessage, details = {}) {
  return createMessage(`${originalType}:error`, {
    success: false,
    error_code: errorCode,
    error_message: errorMessage,
    details,
  });
}

module.exports = {
  // Worker → Master
  WORKER_REGISTER,
  WORKER_REGISTER_ACK,
  WORKER_HEARTBEAT,
  WORKER_HEARTBEAT_ACK,
  WORKER_MESSAGE_DETECTED,
  WORKER_MESSAGE_ACK,
  WORKER_ACCOUNT_STATUS,
  WORKER_ACCOUNT_STATUS_ACK,
  WORKER_ACCOUNT_LOGOUT_ACK,
  WORKER_ERROR,
  // ✨ 新增
  WORKER_WORK_DETECTED,
  WORKER_BULK_INSERT_WORKS,
  WORKER_DISCUSSION_DETECTED,
  WORKER_BULK_INSERT_DISCUSSIONS,
  WORKER_BULK_INSERT_CONVERSATIONS,

  // Master → Worker
  MASTER_TASK_ASSIGN,
  MASTER_TASK_ASSIGN_ACK,
  MASTER_TASK_REVOKE,
  MASTER_ACCOUNT_LOGOUT,
  MASTER_SHUTDOWN,
  // ✨ 新增
  MASTER_CRAWL_WORKS,
  MASTER_CRAWL_DISCUSSIONS,
  MASTER_ACCOUNT_CONFIG_UPDATE,
  MASTER_ACCOUNT_CONFIG_UPDATE_ACK,

  // Client → Master
  CLIENT_CONNECT,
  CLIENT_CONNECT_ACK,
  CLIENT_SYNC_REQUEST,
  CLIENT_SYNC_RESPONSE,
  CLIENT_NOTIFICATION_READ,

  // Master → Client
  MASTER_NOTIFICATION_PUSH,
  MASTER_ACCOUNT_UPDATE,

  // Utilities
  createMessage,
  createErrorMessage,
};
