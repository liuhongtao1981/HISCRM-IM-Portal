/**
 * T073: Notification Toast Component
 *
 * Purpose: 显示实时通知弹窗组件
 */

import React, { useEffect, useState } from 'react';
import { notification } from 'antd';
import { BellOutlined, CommentOutlined, MessageOutlined } from '@ant-design/icons';

/**
 * 通知Toast组件
 */
const NotificationToast = ({ notificationData, onClick, onClose }) => {
  const [api, contextHolder] = notification.useNotification();

  useEffect(() => {
    if (notificationData) {
      showNotification(notificationData);
    }
  }, [notificationData]);

  /**
   * 显示通知
   * @param {object} data - 通知数据
   */
  const showNotification = (data) => {
    const { type, title, content, account_id, related_id } = data;

    // 根据类型选择图标
    const icon = getIconForType(type);

    // 显示通知
    api.open({
      message: title,
      description: content,
      icon,
      placement: 'topRight',
      duration: 4.5,
      onClick: () => {
        if (onClick) {
          onClick(data);
        }
      },
      onClose: () => {
        if (onClose) {
          onClose(data);
        }
      },
    });
  };

  /**
   * 根据类型获取图标
   * @param {string} type - 通知类型
   * @returns {JSX.Element}
   */
  const getIconForType = (type) => {
    switch (type) {
      case 'comment':
        return <CommentOutlined style={{ color: '#1890ff' }} />;
      case 'direct_message':
        return <MessageOutlined style={{ color: '#52c41a' }} />;
      case 'system':
        return <BellOutlined style={{ color: '#faad14' }} />;
      default:
        return <BellOutlined />;
    }
  };

  return <>{contextHolder}</>;
};

/**
 * 通知管理器Hook
 */
export const useNotificationToast = () => {
  const [currentNotification, setCurrentNotification] = useState(null);

  /**
   * 显示通知
   * @param {object} notification - 通知对象
   */
  const showNotification = (notification) => {
    setCurrentNotification(notification);
  };

  /**
   * 显示评论通知
   * @param {object} comment - 评论对象
   */
  const showCommentNotification = (comment) => {
    showNotification({
      type: 'comment',
      title: '新评论',
      content: `${comment.author_name}: ${comment.content}`,
      account_id: comment.account_id,
      related_id: comment.id,
    });
  };

  /**
   * 显示私信通知
   * @param {object} message - 私信对象
   */
  const showMessageNotification = (message) => {
    showNotification({
      type: 'direct_message',
      title: '新私信',
      content: `${message.sender_name}: ${message.content}`,
      account_id: message.account_id,
      related_id: message.id,
    });
  };

  /**
   * 显示系统通知
   * @param {string} title - 标题
   * @param {string} content - 内容
   */
  const showSystemNotification = (title, content) => {
    showNotification({
      type: 'system',
      title,
      content,
    });
  };

  return {
    currentNotification,
    showNotification,
    showCommentNotification,
    showMessageNotification,
    showSystemNotification,
  };
};

export default NotificationToast;
