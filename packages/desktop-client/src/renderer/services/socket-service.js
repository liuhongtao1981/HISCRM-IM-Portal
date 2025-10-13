/**
 * Socket.IO Service
 * T044: 实时通信服务
 */

import { io } from 'socket.io-client';

const MASTER_URL = process.env.REACT_APP_MASTER_URL || 'http://localhost:3000';

/**
 * Socket Service 类
 */
class SocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.deviceId = this.generateDeviceId();
    this.messageHandlers = new Map();
  }

  /**
   * 生成设备ID
   * @returns {string}
   */
  generateDeviceId() {
    const stored = localStorage.getItem('device_id');
    if (stored) return stored;

    const deviceId = `desktop-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    localStorage.setItem('device_id', deviceId);
    return deviceId;
  }

  /**
   * 连接到 Master 服务器
   */
  connect() {
    if (this.socket) {
      console.warn('Socket already connected');
      return;
    }

    this.socket = io(`${MASTER_URL}/client`, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      query: {
        device_id: this.deviceId,
        device_type: 'desktop',
        device_name: navigator.platform || 'Unknown',
      },
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('Socket connected:', this.socket.id);

      // 发送客户端注册消息
      this.sendMessage({
        type: 'client:register',
        version: 'v1',
        payload: {
          device_id: this.deviceId,
          device_type: 'desktop',
          device_name: navigator.platform,
        },
        timestamp: Date.now(),
      });
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('Socket disconnected');
    });

    this.socket.on('message', (message) => {
      this.handleMessage(message);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * 发送消息
   * @param {object} message - 消息对象
   */
  sendMessage(message) {
    if (!this.socket || !this.connected) {
      console.error('Socket not connected');
      return;
    }

    this.socket.emit('message', message);
  }

  /**
   * 处理接收到的消息
   * @param {object} message - 消息对象
   */
  handleMessage(message) {
    console.log('Received message:', message);

    const { type } = message;
    const handlers = this.messageHandlers.get(type) || [];

    for (const handler of handlers) {
      try {
        handler(message);
      } catch (error) {
        console.error(`Error handling message type ${type}:`, error);
      }
    }
  }

  /**
   * 注册消息处理器
   * @param {string} messageType - 消息类型
   * @param {function} handler - 处理函数
   */
  onMessage(messageType, handler) {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }

    this.messageHandlers.get(messageType).push(handler);

    // 返回取消注册函数
    return () => {
      const handlers = this.messageHandlers.get(messageType);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  /**
   * 获取连接状态
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }

  /**
   * 监听原始 socket 事件
   * @param {string} event - 事件名称
   * @param {function} handler - 处理函数
   */
  on(event, handler) {
    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  /**
   * 取消监听原始 socket 事件
   * @param {string} event - 事件名称
   * @param {function} handler - 处理函数
   */
  off(event, handler) {
    if (this.socket) {
      this.socket.off(event, handler);
    }
  }

  /**
   * 触发原始 socket 事件
   * @param {string} event - 事件名称
   * @param {*} data - 数据
   */
  emit(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    } else {
      console.error('Socket not connected, cannot emit event');
    }
  }
}

// 导出单例实例
export default new SocketService();
