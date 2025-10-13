/**
 * 通知监听器
 * T072: 监听来自 Master 的通知推送
 */

import { MASTER_NOTIFICATION_PUSH, CLIENT_SYNC_REQUEST, CLIENT_SYNC_RESPONSE } from '@hiscrm-im/shared/protocol/messages';
import EventEmitter from 'events';

class NotificationListener extends EventEmitter {
  constructor(socketClient) {
    super();
    this.socketClient = socketClient;
    this.isListening = false;
    this.receivedNotifications = [];
  }

  /**
   * 开始监听通知
   */
  start() {
    if (this.isListening) {
      console.warn('Notification listener already started');
      return;
    }

    console.log('Starting notification listener');

    // 监听通知推送
    this.socketClient.on('message', this.handleMessage.bind(this));

    this.isListening = true;

    // 请求同步离线通知
    this.requestSync();
  }

  /**
   * 停止监听通知
   */
  stop() {
    if (!this.isListening) {
      return;
    }

    console.log('Stopping notification listener');
    this.socketClient.off('message', this.handleMessage);
    this.isListening = false;
  }

  /**
   * 处理接收到的消息
   */
  handleMessage(message) {
    try {
      if (message.type === MASTER_NOTIFICATION_PUSH) {
        this.handleNotificationPush(message);
      } else if (message.type === CLIENT_SYNC_RESPONSE) {
        this.handleSyncResponse(message);
      }
    } catch (error) {
      console.error('Failed to handle message:', error);
    }
  }

  /**
   * 处理通知推送
   */
  handleNotificationPush(message) {
    const notification = message.payload;

    console.log('Received notification:', notification);

    // 保存到本地
    this.receivedNotifications.push(notification);

    // 触发事件
    this.emit('notification', notification);

    // 显示系统通知
    this.showSystemNotification(notification);
  }

  /**
   * 处理同步响应
   */
  handleSyncResponse(message) {
    const { notifications, total_count } = message.payload;

    console.log(`Received sync response: ${notifications.length} notifications (total: ${total_count})`);

    if (notifications && notifications.length > 0) {
      for (const notification of notifications) {
        // 保存到本地
        this.receivedNotifications.push(notification);

        // 触发事件
        this.emit('notification', notification);
      }

      // 批量显示系统通知（最多5条）
      const toShow = notifications.slice(0, 5);
      for (const notification of toShow) {
        this.showSystemNotification(notification);
      }

      if (notifications.length > 5) {
        // 如果超过5条，显示一个汇总通知
        this.showSystemNotification({
          title: '更多通知',
          content: `还有 ${notifications.length - 5} 条未读通知`,
          type: 'summary',
        });
      }
    }

    this.emit('sync-complete', { count: notifications.length, total: total_count });
  }

  /**
   * 请求同步离线通知
   */
  requestSync(sinceTimestamp = null) {
    try {
      const deviceId = this.getDeviceId();

      const message = {
        type: CLIENT_SYNC_REQUEST,
        version: 'v1',
        timestamp: Math.floor(Date.now() / 1000),
        payload: {
          device_id: deviceId,
          since_timestamp: sinceTimestamp || this.getLastSeenTimestamp(),
          limit: 100,
          offset: 0,
        },
      };

      console.log('Requesting notification sync:', message.payload);
      this.socketClient.emit('message', message);
    } catch (error) {
      console.error('Failed to request sync:', error);
    }
  }

  /**
   * 显示系统通知
   */
  showSystemNotification(notification) {
    try {
      // 检查权限
      if (!('Notification' in window)) {
        console.warn('This browser does not support system notifications');
        return;
      }

      if (Notification.permission === 'granted') {
        this.createNotification(notification);
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            this.createNotification(notification);
          }
        });
      }
    } catch (error) {
      console.error('Failed to show system notification:', error);
    }
  }

  /**
   * 创建系统通知
   */
  createNotification(notification) {
    const options = {
      body: notification.content,
      icon: '/icon.png',
      badge: '/badge.png',
      tag: notification.notification_id || 'default',
      requireInteraction: false,
      silent: false,
    };

    const systemNotification = new Notification(notification.title, options);

    systemNotification.onclick = () => {
      // 点击通知时触发事件
      this.emit('notification-click', notification);
      systemNotification.close();
      window.focus();
    };
  }

  /**
   * 获取设备ID
   */
  getDeviceId() {
    // 从 localStorage 获取或生成设备ID
    let deviceId = localStorage.getItem('device_id');

    if (!deviceId) {
      deviceId = `desktop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('device_id', deviceId);
    }

    return deviceId;
  }

  /**
   * 获取上次在线时间
   */
  getLastSeenTimestamp() {
    const lastSeen = localStorage.getItem('last_seen');
    return lastSeen ? parseInt(lastSeen, 10) : Math.floor(Date.now() / 1000) - 86400; // 默认1天前
  }

  /**
   * 更新上次在线时间
   */
  updateLastSeen() {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem('last_seen', now.toString());
  }

  /**
   * 获取所有接收的通知
   */
  getAllNotifications() {
    return [...this.receivedNotifications];
  }

  /**
   * 清空通知历史
   */
  clearNotifications() {
    this.receivedNotifications = [];
    this.emit('notifications-cleared');
  }
}

export default NotificationListener;
