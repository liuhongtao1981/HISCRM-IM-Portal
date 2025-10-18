import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Tag, Space, Button, Statistic, Select, Tooltip, Badge, message, Tabs, Input, DatePicker, Typography } from 'antd';
import { SyncOutlined, CommentOutlined, MessageOutlined, ClockCircleOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { messagesAPI, accountsAPI } from '../services/api';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Text } = Typography;

const MessageManagementPage = () => {
  const [comments, setComments] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('comments');
  const [stats, setStats] = useState({ comments: 0, directMessages: 0, todayComments: 0, todayMessages: 0 });
  const [accountMap, setAccountMap] = useState({}); // account_id -> { name, ... }

  const [filters, setFilters] = useState({
    type: 'all', // all, today
    account_id: undefined,
    search: '',
  });

  const [refreshInterval, setRefreshInterval] = useState(30); // 秒

  // 获取账户列表
  const fetchAccounts = async () => {
    try {
      const response = await accountsAPI.getAccounts();
      if (response.success && response.data) {
        const map = {};
        response.data.forEach(account => {
          // 解析 user_info JSON
          let userInfo = {};
          try {
            if (typeof account.user_info === 'string') {
              userInfo = JSON.parse(account.user_info);
            } else {
              userInfo = account.user_info || {};
            }
          } catch (e) {
            userInfo = {};
          }

          map[account.id] = {
            name: account.account_name || account.name || '未知账户',
            platformId: account.account_id || account.platform_user_id || '-',
            platform: account.platform || 'douyin',
            avatar: userInfo.avatar || '', // 头像URL
            nickname: userInfo.nickname || userInfo.account_name || '未知', // 昵称
          };
        });
        setAccountMap(map);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    }
  };

  // 获取评论列表
  const fetchComments = async () => {
    setLoading(true);
    try {
      const params = {
        sort: 'created_at',
        order: 'desc',
        limit: 100,
      };

      // 如果是今日，添加时间过滤
      if (filters.type === 'today') {
        const todayStart = dayjs().startOf('day').unix();
        params.created_at_start = todayStart;
      }

      if (filters.account_id) {
        params.account_id = filters.account_id;
      }

      const response = await messagesAPI.getComments(params);

      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        setComments(data);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取私信列表
  const fetchDirectMessages = async () => {
    setLoading(true);
    try {
      const params = {
        sort: 'created_at',
        order: 'desc',
        limit: 100,
      };

      // 如果是今日，添加时间过滤
      if (filters.type === 'today') {
        const todayStart = dayjs().startOf('day').unix();
        params.created_at_start = todayStart;
      }

      if (filters.account_id) {
        params.account_id = filters.account_id;
      }

      const response = await messagesAPI.getDirectMessages(params);

      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        setDirectMessages(data);
      }
    } catch (error) {
      console.error('Failed to fetch direct messages:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载 - 获取账户列表
  useEffect(() => {
    fetchAccounts();
  }, []);

  // 初始加载
  useEffect(() => {
    if (activeTab === 'comments') {
      fetchComments();
    } else {
      fetchDirectMessages();
    }

    // 自动刷新定时器
    const interval = setInterval(() => {
      if (activeTab === 'comments') {
        fetchComments();
      } else {
        fetchDirectMessages();
      }
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters, refreshInterval]);

  // 手动刷新
  const handleRefresh = () => {
    if (activeTab === 'comments') {
      fetchComments();
    } else {
      fetchDirectMessages();
    }
  };

  // 判断是否为今日消息
  const isToday = (timestamp) => {
    if (!timestamp) return false;
    const date = dayjs.unix(timestamp);
    return date.isSame(dayjs(), 'day');
  };

  // 评论表格列定义
  const commentColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 200,
      sorter: (a, b) => (b.created_at || 0) - (a.created_at || 0),
      render: (timestamp) => {
        if (!timestamp) return '-';
        const date = dayjs.unix(timestamp);
        const today = isToday(timestamp);
        return (
          <span style={{
            color: today ? '#ff4d4f' : undefined,
            fontWeight: today ? 'bold' : 'normal',
            backgroundColor: today ? '#fff2f0' : 'transparent',
            padding: '2px 6px',
            borderRadius: '4px'
          }}>
            {today ? '【今日】' : ''}{date.format('YYYY-MM-DD HH:mm:ss')}
          </span>
        );
      },
    },
    {
      title: '账号',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 100,
      render: (accountId) => {
        // 从账户映射中获取账户名称
        const account = accountMap[accountId];
        const accountName = account?.name || '未知账户';
        return <Tag color="blue">{accountName}</Tag>;
      },
    },
    {
      title: '平台ID',
      dataIndex: 'account_id',
      key: 'account_id_platform',
      width: 200,
      render: (accountId) => {
        // 从账户映射中获取平台信息（头像、昵称、平台ID）
        const account = accountMap[accountId];
        if (!account) return '-';

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {account.avatar && (
              <img
                src={account.avatar}
                alt={account.nickname}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <Text strong style={{ fontSize: '12px' }}>{account.nickname}</Text>
              <Tooltip title={account.platformId}>
                <Text code style={{ fontSize: '11px' }}>{account.platformId?.substring(0, 12) || '-'}...</Text>
              </Tooltip>
            </div>
          </div>
        );
      },
    },
    {
      title: '视频标题',
      dataIndex: 'post_title',
      key: 'post_title',
      width: 200,
      render: (title) => <Tooltip title={title}><Text ellipsis>{title || '-'}</Text></Tooltip>,
    },
    {
      title: '评论内容',
      dataIndex: 'content',
      key: 'content',
      width: 350,
      ellipsis: true,
      render: (content) => (
        <Tooltip title={content} placement="top">
          <div style={{
            maxWidth: '320px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
            lineHeight: '1.5'
          }}>
            💬 {content}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '发布者',
      dataIndex: 'author_name',
      key: 'author_name',
      width: 100,
      render: (name) => <Text>{name || '-'}</Text>,
    },
  ];

  // 私信表格列定义
  const messageColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 200,
      sorter: (a, b) => (b.created_at || 0) - (a.created_at || 0),
      render: (timestamp) => {
        if (!timestamp) return '-';
        const date = dayjs.unix(timestamp);
        const today = isToday(timestamp);
        return (
          <span style={{
            color: today ? '#ff4d4f' : undefined,
            fontWeight: today ? 'bold' : 'normal',
            backgroundColor: today ? '#fff2f0' : 'transparent',
            padding: '2px 6px',
            borderRadius: '4px'
          }}>
            {today ? '【今日】' : ''}{date.format('YYYY-MM-DD HH:mm:ss')}
          </span>
        );
      },
    },
    {
      title: '账号',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 100,
      render: (accountId) => {
        // 从账户映射中获取账户名称
        const account = accountMap[accountId];
        const accountName = account?.name || '未知账户';
        return <Tag color="green">{accountName}</Tag>;
      },
    },
    {
      title: '平台ID',
      dataIndex: 'account_id',
      key: 'account_id_platform_msg',
      width: 200,
      render: (accountId) => {
        // 从账户映射中获取平台信息（头像、昵称、平台ID）
        const account = accountMap[accountId];
        if (!account) return '-';

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {account.avatar && (
              <img
                src={account.avatar}
                alt={account.nickname}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <Text strong style={{ fontSize: '12px' }}>{account.nickname}</Text>
              <Tooltip title={account.platformId}>
                <Text code style={{ fontSize: '11px' }}>{account.platformId?.substring(0, 12) || '-'}...</Text>
              </Tooltip>
            </div>
          </div>
        );
      },
    },
    {
      title: '私信内容',
      dataIndex: 'content',
      key: 'content',
      width: 350,
      ellipsis: true,
      render: (content) => (
        <Tooltip title={content} placement="top">
          <div style={{
            maxWidth: '320px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
            lineHeight: '1.5'
          }}>
            📩 {content}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '发送者',
      dataIndex: 'sender_name',
      key: 'sender_name',
      width: 100,
      render: (name) => <Text>{name || '-'}</Text>,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      width: 80,
      render: (direction) => (
        <Tag color={direction === 'inbound' ? 'cyan' : 'orange'}>
          {direction === 'inbound' ? '入站' : '出站'}
        </Tag>
      ),
    },
  ];

  // 计算统计信息
  const calculateStats = () => {
    const today = dayjs().startOf('day').unix();
    const todayComments = comments.filter(c => (c.created_at || 0) >= today).length;
    const todayMessages = directMessages.filter(m => (m.created_at || 0) >= today).length;

    setStats({
      comments: comments.length,
      directMessages: directMessages.length,
      todayComments,
      todayMessages,
    });
  };

  useEffect(() => {
    calculateStats();
  }, [comments, directMessages]);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* 页面标题和刷新按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>💬 消息管理</h2>
        <Space>
          <Select
            style={{ width: 120 }}
            value={refreshInterval}
            onChange={setRefreshInterval}
          >
            <Option value={10}>每10秒刷新</Option>
            <Option value={30}>每30秒刷新</Option>
            <Option value={60}>每60秒刷新</Option>
            <Option value={999999}>不自动刷新</Option>
          </Select>
          <Button type="primary" icon={<SyncOutlined />} onClick={handleRefresh} loading={loading}>
            立即刷新
          </Button>
        </Space>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总评论数"
              value={stats.comments}
              prefix={<CommentOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日评论"
              value={stats.todayComments}
              prefix={<CommentOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总私信数"
              value={stats.directMessages}
              prefix={<MessageOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日私信"
              value={stats.todayMessages}
              prefix={<MessageOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选器 */}
      <Card>
        <Space size="middle" wrap>
          <span>筛选:</span>
          <Select
            placeholder="消息类型"
            style={{ width: 120 }}
            value={filters.type}
            onChange={(value) => setFilters({ ...filters, type: value })}
          >
            <Option value="all">全部消息</Option>
            <Option value="today">今日消息</Option>
          </Select>
          <Input
            placeholder="搜索内容..."
            style={{ width: 200 }}
            prefix={<SearchOutlined />}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </Space>
      </Card>

      {/* 标签页 - 评论和私信 */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'comments',
            label: (
              <span>
                <CommentOutlined /> 评论管理 ({stats.comments})
              </span>
            ),
            children: (
              <Table
                dataSource={comments}
                columns={commentColumns}
                rowKey={(record) => record.id || `comment-${record.platform_comment_id}-${record.created_at}`}
                pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条记录` }}
                loading={loading}
                scroll={{ x: 1750 }}
                size="small"
                locale={{ emptyText: '暂无数据' }}
              />
            ),
          },
          {
            key: 'direct-messages',
            label: (
              <span>
                <MessageOutlined /> 私信管理 ({stats.directMessages})
              </span>
            ),
            children: (
              <Table
                dataSource={directMessages}
                columns={messageColumns}
                rowKey={(record) => record.id || `msg-${record.platform_message_id}-${record.created_at}`}
                pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条记录` }}
                loading={loading}
                scroll={{ x: 1700 }}
                size="small"
                locale={{ emptyText: '暂无数据' }}
              />
            ),
          },
        ]}
      />
    </Space>
  );
};

export default MessageManagementPage;
