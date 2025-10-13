/**
 * T076: Message Detail Page
 *
 * Purpose: 显示消息详情页面(评论或私信详情)
 */

import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Button, Spin, message, Tag, Space } from 'antd';
import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';

/**
 * 消息详情页面组件
 */
const MessageDetailPage = () => {
  const { accountId, messageId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [messageData, setMessageData] = useState(null);
  const [messageType, setMessageType] = useState(null);

  useEffect(() => {
    // 从路由state中获取消息类型
    if (location.state && location.state.type) {
      setMessageType(location.state.type);
    }

    // 加载消息详情
    loadMessageDetail();
  }, [accountId, messageId]);

  /**
   * 加载消息详情
   */
  const loadMessageDetail = async () => {
    setLoading(true);

    try {
      // Mock数据 - 实际应该调用API
      // const response = await apiClient.getMessageDetail(accountId, messageId);

      // Mock实现
      await new Promise((resolve) => setTimeout(resolve, 500));

      const mockData = {
        id: messageId,
        account_id: accountId,
        type: messageType || 'comment',
        content: '这是一条测试消息内容',
        author_name: '测试用户',
        author_id: 'user-123',
        post_id: 'post-456',
        post_title: '测试视频标题',
        is_read: false,
        detected_at: Date.now() - 60000,
        created_at: Date.now() - 120000,
      };

      setMessageData(mockData);
      setMessageType(mockData.type);

      // 标记为已读
      markAsRead(messageId);
    } catch (error) {
      console.error('Failed to load message detail', error);
      message.error('加载消息详情失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 标记消息为已读
   * @param {string} id - 消息ID
   */
  const markAsRead = async (id) => {
    try {
      // 实际应该调用API
      // await apiClient.markMessageAsRead(id);
      console.log('Marked message as read', { id });
    } catch (error) {
      console.error('Failed to mark as read', error);
    }
  };

  /**
   * 返回上一页
   */
  const handleGoBack = () => {
    navigate(-1);
  };

  /**
   * 跳转到原始内容
   */
  const handleViewOriginal = () => {
    if (messageData && messageData.post_id) {
      // 这里应该打开浏览器跳转到原始帖子
      console.log('View original post', { postId: messageData.post_id });
      message.info('打开原始帖子功能开发中');
    }
  };

  /**
   * 渲染加载状态
   */
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  /**
   * 渲染错误状态
   */
  if (!messageData) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <p>消息未找到</p>
        <Button onClick={handleGoBack}>返回</Button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: '24px' }}>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={handleGoBack}
          style={{ padding: 0 }}
        >
          返回
        </Button>
      </div>

      {/* 消息卡片 */}
      <Card
        title={
          <Space>
            <span>
              {messageType === 'comment' ? '评论详情' : '私信详情'}
            </span>
            {messageData.is_read && (
              <Tag icon={<CheckOutlined />} color="success">
                已读
              </Tag>
            )}
          </Space>
        }
        extra={
          <Button onClick={handleViewOriginal}>查看原始内容</Button>
        }
      >
        <Descriptions column={1} bordered>
          <Descriptions.Item label="内容">
            {messageData.content}
          </Descriptions.Item>

          <Descriptions.Item label="发送者">
            {messageData.author_name || messageData.sender_name}
          </Descriptions.Item>

          {messageType === 'comment' && messageData.post_title && (
            <Descriptions.Item label="关联视频">
              {messageData.post_title}
            </Descriptions.Item>
          )}

          <Descriptions.Item label="检测时间">
            {new Date(messageData.detected_at).toLocaleString('zh-CN')}
          </Descriptions.Item>

          <Descriptions.Item label="创建时间">
            {new Date(messageData.created_at).toLocaleString('zh-CN')}
          </Descriptions.Item>

          <Descriptions.Item label="消息ID">
            {messageData.id}
          </Descriptions.Item>
        </Descriptions>

        {/* 操作按钮 */}
        <div style={{ marginTop: '24px', textAlign: 'right' }}>
          <Space>
            <Button onClick={handleGoBack}>关闭</Button>
            <Button type="primary" onClick={handleViewOriginal}>
              查看原帖
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default MessageDetailPage;
