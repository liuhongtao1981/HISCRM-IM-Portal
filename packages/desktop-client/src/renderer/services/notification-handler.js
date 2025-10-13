/**
 * T074: Notification Click Handler
 *
 * Purpose: 处理通知点击事件,导航到消息详情页
 */

/**
 * 通知点击处理器类
 */
class NotificationHandler {
  constructor() {
    this.navigate = null; // React Router navigate function
  }

  /**
   * 设置导航函数
   * @param {Function} navigateFn - React Router的navigate函数
   */
  setNavigate(navigateFn) {
    this.navigate = navigateFn;
  }

  /**
   * 处理通知点击
   * @param {object} notification - 通知对象
   */
  handleNotificationClick(notification) {
    const { type, account_id, related_id } = notification;

    console.log('Notification clicked', { type, account_id, related_id });

    if (!this.navigate) {
      console.warn('Navigate function not set, cannot handle notification click');
      return;
    }

    // 根据通知类型导航到不同页面
    switch (type) {
      case 'comment':
        this.navigateToComment(account_id, related_id);
        break;

      case 'direct_message':
        this.navigateToMessage(account_id, related_id);
        break;

      case 'system':
        this.navigateToSystem();
        break;

      default:
        console.warn('Unknown notification type', { type });
        break;
    }
  }

  /**
   * 导航到评论详情
   * @param {string} accountId - 账户ID
   * @param {string} commentId - 评论ID
   */
  navigateToComment(accountId, commentId) {
    this.navigate(`/messages/${accountId}/${commentId}`, {
      state: { type: 'comment' },
    });
  }

  /**
   * 导航到私信详情
   * @param {string} accountId - 账户ID
   * @param {string} messageId - 私信ID
   */
  navigateToMessage(accountId, messageId) {
    this.navigate(`/messages/${accountId}/${messageId}`, {
      state: { type: 'direct_message' },
    });
  }

  /**
   * 导航到系统消息页面
   */
  navigateToSystem() {
    this.navigate('/system');
  }

  /**
   * 导航到历史记录页面
   * @param {string} accountId - 账户ID (可选)
   */
  navigateToHistory(accountId = null) {
    if (accountId) {
      this.navigate(`/history?account=${accountId}`);
    } else {
      this.navigate('/history');
    }
  }

  /**
   * 处理批量通知点击
   * @param {Array} notifications - 通知列表
   */
  handleBatchNotificationClick(notifications) {
    if (notifications.length === 0) {
      return;
    }

    // 如果只有一个通知,直接跳转到详情
    if (notifications.length === 1) {
      this.handleNotificationClick(notifications[0]);
      return;
    }

    // 多个通知,跳转到历史记录页面
    const accountId = notifications[0].account_id;
    const allSameAccount = notifications.every((n) => n.account_id === accountId);

    if (allSameAccount) {
      this.navigateToHistory(accountId);
    } else {
      this.navigateToHistory();
    }
  }

  /**
   * 标记通知为已读
   * @param {string} notificationId - 通知ID
   * @returns {Promise<void>}
   */
  async markAsRead(notificationId) {
    try {
      // 这里应该调用API标记通知为已读
      // const response = await apiClient.markNotificationAsRead(notificationId);
      console.log('Marking notification as read', { notificationId });

      // Mock implementation
      return Promise.resolve();
    } catch (error) {
      console.error('Failed to mark notification as read', {
        notificationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 批量标记通知为已读
   * @param {Array<string>} notificationIds - 通知ID列表
   * @returns {Promise<void>}
   */
  async markBatchAsRead(notificationIds) {
    try {
      // 这里应该调用API批量标记通知为已读
      console.log('Marking notifications as read', {
        count: notificationIds.length,
      });

      // Mock implementation
      return Promise.resolve();
    } catch (error) {
      console.error('Failed to mark notifications as read', {
        count: notificationIds.length,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 删除通知
   * @param {string} notificationId - 通知ID
   * @returns {Promise<void>}
   */
  async deleteNotification(notificationId) {
    try {
      // 这里应该调用API删除通知
      console.log('Deleting notification', { notificationId });

      // Mock implementation
      return Promise.resolve();
    } catch (error) {
      console.error('Failed to delete notification', {
        notificationId,
        error: error.message,
      });
      throw error;
    }
  }
}

// 导出单例
const notificationHandler = new NotificationHandler();

export default notificationHandler;
export { NotificationHandler };
