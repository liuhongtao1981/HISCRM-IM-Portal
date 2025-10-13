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
const WORKER_ERROR = 'worker:error';

// ============================================
// Master → Worker 消息类型
// ============================================

const MASTER_TASK_ASSIGN = 'master:task:assign';
const MASTER_TASK_ASSIGN_ACK = 'master:task:assign:ack';
const MASTER_TASK_REVOKE = 'master:task:revoke';
const MASTER_SHUTDOWN = 'master:shutdown';

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
  WORKER_ERROR,

  // Master → Worker
  MASTER_TASK_ASSIGN,
  MASTER_TASK_ASSIGN_ACK,
  MASTER_TASK_REVOKE,
  MASTER_SHUTDOWN,

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
