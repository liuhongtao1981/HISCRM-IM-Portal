/**
 * 消息列表组件
 * T085: 显示评论和私信的列表，支持分页
 */

import React from 'react';
import { List, Tag, Typography, Space, Avatar, Empty, Spin } from 'antd';
import { MessageOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

const MessageList = ({ messages, loading, pagination, onPageChange, onMessageClick }) => {
  const getMessageIcon = (type) => {
    if (type === 'comment') {
      return <MessageOutlined style={{ fontSize: 20, color: '#1890ff' }} />;
    } else if (type === 'direct_message') {
      return <MailOutlined style={{ fontSize: 20, color: '#52c41a' }} />;
    }
    return <MessageOutlined />;
  };

  const getTypeTag = (type) => {
    if (type === 'comment') {
      return <Tag color="blue">评论</Tag>;
    } else if (type === 'direct_message') {
      return <Tag color="green">私信</Tag>;
    }
    return null;
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

    return date.toLocaleString('zh-CN');
  };

  const getAuthorName = (message) => {
    if (message.type === 'comment') {
      return message.author_name || '未知用户';
    } else if (message.type === 'direct_message') {
      return message.sender_name || '未知用户';
    }
    return '未知';
  };

  return (
    <Spin spinning={loading}>
      {messages && messages.length > 0 ? (
        <List
          itemLayout="vertical"
          size="large"
          pagination={
            pagination
              ? {
                  ...pagination,
                  onChange: onPageChange,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total) => `共 ${total} 条消息`,
                  pageSizeOptions: ['10', '20', '50', '100'],
                }
              : false
          }
          dataSource={messages}
          renderItem={(message) => (
            <List.Item
              key={message.id}
              style={{
                cursor: 'pointer',
                backgroundColor: message.is_read ? 'transparent' : '#f6ffed',
                padding: '16px',
                borderRadius: '4px',
                marginBottom: '8px',
              }}
              onClick={() => onMessageClick && onMessageClick(message)}
            >
              <List.Item.Meta
                avatar={
                  <Avatar
                    icon={<UserOutlined />}
                    style={{
                      backgroundColor: message.type === 'comment' ? '#1890ff' : '#52c41a',
                    }}
                  >
                    {getAuthorName(message)[0]}
                  </Avatar>
                }
                title={
                  <Space>
                    {getMessageIcon(message.type)}
                    <Text strong>{getAuthorName(message)}</Text>
                    {getTypeTag(message.type)}
                    {!message.is_read && <Tag color="red">未读</Tag>}
                  </Space>
                }
                description={
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Paragraph
                      ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
                      style={{ marginBottom: 0 }}
                    >
                      {message.content}
                    </Paragraph>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatTimestamp(message.detected_at)}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      ) : (
        <Empty
          description="暂无消息"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 100 }}
        />
      )}
    </Spin>
  );
};

export default MessageList;
