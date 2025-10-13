/**
 * T075: Electron Notification API
 *
 * Purpose: 封装Electron原生通知API,提供系统级通知
 */

const { Notification } = require('electron');
const path = require('path');

/**
 * Electron通知管理器类
 */
class ElectronNotificationManager {
  constructor() {
    this.isSupported = Notification.isSupported();
    this.iconPath = null;
  }

  /**
   * 设置通知图标
   * @param {string} iconPath - 图标路径
   */
  setIcon(iconPath) {
    this.iconPath = iconPath;
  }

  /**
   * 显示系统通知
   * @param {object} options - 通知选项
   * @returns {Notification|null}
   */
  show(options) {
    if (!this.isSupported) {
      console.warn('System notifications are not supported');
      return null;
    }

    const { title, body, silent = false, urgency = 'normal' } = options;

    const notificationOptions = {
      title,
      body,
      silent,
      urgency, // 'normal', 'critical', 'low'
    };

    // 添加图标(如果已设置)
    if (this.iconPath) {
      notificationOptions.icon = this.iconPath;
    }

    try {
      const notification = new Notification(notificationOptions);

      // 监听点击事件
      if (options.onClick) {
        notification.on('click', options.onClick);
      }

      // 监听关闭事件
      if (options.onClose) {
        notification.on('close', options.onClose);
      }

      // 显示通知
      notification.show();

      console.log('System notification shown', { title });

      return notification;
    } catch (error) {
      console.error('Failed to show system notification', {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * 显示评论通知
   * @param {object} comment - 评论对象
   * @param {Function} onClick - 点击回调
   */
  showCommentNotification(comment, onClick) {
    return this.show({
      title: '新评论',
      body: `${comment.author_name}: ${comment.content}`,
      onClick,
    });
  }

  /**
   * 显示私信通知
   * @param {object} message - 私信对象
   * @param {Function} onClick - 点击回调
   */
  showMessageNotification(message, onClick) {
    return this.show({
      title: '新私信',
      body: `${message.sender_name}: ${message.content}`,
      onClick,
    });
  }

  /**
   * 显示系统通知
   * @param {string} title - 标题
   * @param {string} body - 内容
   * @param {Function} onClick - 点击回调
   */
  showSystemNotification(title, body, onClick) {
    return this.show({
      title,
      body,
      urgency: 'critical',
      onClick,
    });
  }

  /**
   * 显示批量通知
   * @param {number} count - 通知数量
   * @param {string} type - 通知类型
   * @param {Function} onClick - 点击回调
   */
  showBatchNotification(count, type, onClick) {
    const typeText = {
      comment: '条新评论',
      direct_message: '条新私信',
      mixed: '条新消息',
    };

    return this.show({
      title: '新消息',
      body: `您有 ${count} ${typeText[type] || typeText.mixed}`,
      onClick,
    });
  }

  /**
   * 检查通知权限
   * @returns {boolean}
   */
  checkPermission() {
    return this.isSupported;
  }

  /**
   * 请求通知权限(在某些平台上可能需要)
   * @returns {Promise<boolean>}
   */
  async requestPermission() {
    // Electron通常默认有通知权限
    // 但在某些平台(如macOS)可能需要用户授权
    return Promise.resolve(this.isSupported);
  }
}

// 导出单例
const electronNotificationManager = new ElectronNotificationManager();

module.exports = electronNotificationManager;
module.exports.ElectronNotificationManager = ElectronNotificationManager;
