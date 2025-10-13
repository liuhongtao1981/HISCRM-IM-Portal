/**
 * Socket.IO事件常量定义
 * Version: 1.0.0
 */

// ============================================
// 内置Socket.IO事件
// ============================================

const CONNECT = 'connect';
const DISCONNECT = 'disconnect';
const ERROR = 'error';
const CONNECT_ERROR = 'connect_error';
const RECONNECT = 'reconnect';
const RECONNECT_ATTEMPT = 'reconnect_attempt';

// ============================================
// 自定义通用事件
// ============================================

const MESSAGE = 'message'; // 主要通信通道

module.exports = {
  // 内置事件
  CONNECT,
  DISCONNECT,
  ERROR,
  CONNECT_ERROR,
  RECONNECT,
  RECONNECT_ATTEMPT,

  // 自定义事件
  MESSAGE,
};
