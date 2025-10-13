/**
 * 通知中心组件
 * T073: 显示和管理通知
 */

import React, { useState, useEffect } from 'react';
import { Badge, Drawer, List, Button, Empty, Typography, Tag, Space } from 'antd';
import { BellOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';
import socketService from '../services/socket-service';
import NotificationListener from '../services/notification-listener';

const { Text } = Typography;

let notificationListener = null;

const NotificationCenter = () => {
  const [visible, setVisible] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // 初始化通知监听器
    if (!notificationListener) {
      notificationListener = new NotificationListener(socketService);
      notificationListener.start();
    }

    // 监听新通知
    const handleNotification = (notification) => {
      console.log('New notification received:', notification);
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    // 监听同步完成
    const handleSyncComplete = ({ count, total }) => {
      console.log(`Sync complete: ${count}/${total} notifications`);
    };

    // 监听通知点击
    const handleNotificationClick = (notification) => {
      console.log('Notification clicked:', notification);
      // 可以在这里导航到详情页
    };

    notificationListener.on('notification', handleNotification);
    notificationListener.on('sync-complete', handleSyncComplete);
    notificationListener.on('notification-click', handleNotificationClick);

    return () => {
      if (notificationListener) {
        notificationListener.off('notification', handleNotification);
        notificationListener.off('sync-complete', handleSyncComplete);
        notificationListener.off('notification-click', handleNotificationClick);
      }
    };
  }, []);

  const showDrawer = () => {
    setVisible(true);
    // 打开抽屉时标记为已读
    setUnreadCount(0);
  };

  const closeDrawer = () => {
    setVisible(false);
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setUnreadCount(0);
    if (notificationListener) {
      notificationListener.clearNotifications();
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'comment':
        return '💬';
      case 'direct_message':
        return '✉️';
      default:
        return '🔔';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'comment':
        return 'blue';
      case 'direct_message':
        return 'green';
      default:
        return 'default';
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';

    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小时前`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}天前`;

    return date.toLocaleDateString('zh-CN');
  };

  return (
    <>
      {/* 通知铃铛按钮 */}
      <Badge count={unreadCount} offset={[-5, 5]}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 20 }} />}
          onClick={showDrawer}
          style={{ marginRight: 16 }}
        />
      </Badge>

      {/* 通知抽屉 */}
      <Drawer
        title="通知中心"
        placement="right"
        onClose={closeDrawer}
        open={visible}
        width={400}
        extra={
          <Button
            type="text"
            icon={<DeleteOutlined />}
            onClick={clearAllNotifications}
            disabled={notifications.length === 0}
          >
            清空
          </Button>
        }
      >
        {notifications.length === 0 ? (
          <Empty
            description="暂无通知"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ marginTop: 100 }}
          />
        ) : (
          <List
            dataSource={notifications}
            renderItem={(notification) => (
              <List.Item
                style={{
                  padding: '12px 0',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f0f0f0',
                }}
                onClick={() => {
                  console.log('Notification item clicked:', notification);
                  // TODO: 导航到消息详情
                }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <span style={{ fontSize: 20 }}>
                        {getNotificationIcon(notification.type)}
                      </span>
                      <Text strong>{notification.title}</Text>
                    </Space>
                    <Tag color={getTypeColor(notification.type)}>
                      {notification.type === 'comment' ? '评论' : '私信'}
                    </Tag>
                  </Space>

                  <Text type="secondary" ellipsis={{ rows: 2 }}>
                    {notification.content}
                  </Text>

                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatTimestamp(notification.created_at)}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </>
  );
};

export default NotificationCenter;
