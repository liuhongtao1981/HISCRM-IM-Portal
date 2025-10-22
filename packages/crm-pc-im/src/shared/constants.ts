/**
 * 全局常量
 */

// WebSocket 事件类型
export const WS_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  MESSAGE: 'message',
  STATUS_CHANGE: 'status_change',
  FILE_TRANSFER: 'file_transfer',
  NOTIFICATION: 'notification',
  ERROR: 'error'
} as const

// 消息类型
export const MESSAGE_TYPES = {
  TEXT: 'text',
  FILE: 'file',
  IMAGE: 'image'
} as const

// 用户状态
export const USER_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline'
} as const

// 应用配置
export const APP_CONFIG = {
  NAME: 'CRM PC IM',
  VERSION: '0.0.1',
  WINDOW_WIDTH: 1200,
  WINDOW_HEIGHT: 800,
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600
} as const

// 动画配置
export const ANIMATION_CONFIG = {
  FLASH_INTERVAL: 600,
  FLASH_DURATION: 3000
} as const
