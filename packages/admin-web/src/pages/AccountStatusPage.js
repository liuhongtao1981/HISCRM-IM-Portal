import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Tag, Space, Button, Statistic, Select, Tooltip, Badge, message, Typography, Modal } from 'antd';
import { SyncOutlined, UserOutlined, CommentOutlined, FileTextOutlined, ClockCircleOutlined, LoginOutlined, LogoutOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import api, { platformsAPI } from '../services/api';
import { useSocketContext } from '../services/socketContext';
import LoginModal from '../components/LoginModal';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const { Option } = Select;
const { Text } = Typography;

const AccountStatusPage = () => {
  const {
    connected,
    startLogin,
    loginModalData,
    submitUserInput,
    closeLoginModal,
  } = useSocketContext();

  const [accounts, setAccounts] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [platformsLoading, setPlatformsLoading] = useState(true);
  const [filters, setFilters] = useState({
    worker_status: undefined,
    login_status: undefined,
    platform: undefined,
  });
  const [sortConfig, setSortConfig] = useState({
    sort: 'last_heartbeat_time',
    order: 'desc',
  });

  // 从 Master 加载平台列表
  const loadPlatforms = async () => {
    setPlatformsLoading(true);
    try {
      const response = await platformsAPI.getPlatforms();

      if (response.success && Array.isArray(response.data)) {
        setPlatforms(response.data);
      } else {
        console.warn('Failed to load platforms from API, using defaults');
        setPlatforms([
          { value: 'douyin', label: '抖音' },
          { value: 'xiaohongshu', label: '小红书' }
        ]);
      }
    } catch (error) {
      console.error('Failed to load platforms:', error);
      setPlatforms([
        { value: 'douyin', label: '抖音' },
        { value: 'xiaohongshu', label: '小红书' }
      ]);
    } finally {
      setPlatformsLoading(false);
    }
  };

  // 加载账号状态
  const fetchAccountStatus = async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        ...sortConfig,
      };

      // 移除 undefined 的参数
      Object.keys(params).forEach(key => {
        if (params[key] === undefined) {
          delete params[key];
        }
      });

      const response = await api.get('/accounts/status/all', { params });

      // api.js 的响应拦截器已经返回了 response.data
      // 所以这里 response 就是 { success: true, data: [...], count: 2 }
      if (response.success) {
        setAccounts(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch account status:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadPlatforms();
    fetchAccountStatus();

    // 自动刷新（每30秒）
    const interval = setInterval(() => {
      fetchAccountStatus();
    }, 30000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sortConfig]);

  // 手动刷新
  const handleRefresh = () => {
    fetchAccountStatus();
  };

  // 处理登录按钮点击
  const handleLogin = (account) => {
    if (!connected) {
      message.error('未连接到服务器，请稍后重试');
      return;
    }

    if (!account.worker || !account.worker.id) {
      message.error('该账户尚未分配 Worker');
      return;
    }

    // 调用 Socket.IO 发起登录请求（直接启动登录流程，LoginModal 会自动弹出）
    startLogin(account.id, account.worker.id, {
      account_name: account.account_name,
      platform: account.platform,
      worker_host: account.worker.host,
      worker_port: account.worker.port,
    });
  };

  // 处理退出账号按钮点击
  const handleLogout = (account) => {
    if (!connected) {
      message.error('未连接到服务器，请稍后重试');
      return;
    }

    Modal.confirm({
      title: '确认退出账号',
      content: `确定要退出账号 "${account.user_info?.nickname || account.account_name}" 吗？退出后需要重新登录。`,
      okText: '确定退出',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        // TODO: 实现退出账号逻辑
        message.info('退出账号功能开发中...');

        // 未来实现：
        // socket.emit('master:account:logout', {
        //   account_id: account.id,
        //   worker_id: account.worker.id,
        // });
      },
    });
  };

  // 计算统计数据
  const stats = {
    total: accounts.length,
    online: accounts.filter(acc => acc.runtime_stats.worker_status === 'online').length,
    offline: accounts.filter(acc => acc.runtime_stats.worker_status === 'offline').length,
    error: accounts.filter(acc => acc.runtime_stats.worker_status === 'error').length,
    totalComments: accounts.reduce((sum, acc) => sum + (acc.runtime_stats.total_comments || 0), 0),
    totalWorks: accounts.reduce((sum, acc) => sum + (acc.runtime_stats.total_works || 0), 0),
  };

  // Worker 状态标签渲染
  const renderWorkerStatus = (status) => {
    const statusMap = {
      online: { color: 'success', text: '在线' },
      offline: { color: 'default', text: '离线' },
      error: { color: 'error', text: '错误' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Badge status={config.color} text={config.text} />;
  };

  // 登录状态标签渲染
  const renderLoginStatus = (status) => {
    const statusMap = {
      logged_in: { color: 'green', text: '已登录' },
      not_logged_in: { color: 'orange', text: '未登录' },
      logging_in: { color: 'blue', text: '登录中' },
      login_failed: { color: 'red', text: '登录失败' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 表格列定义
  const columns = [
    {
      title: '账号名称',
      dataIndex: 'account_name',
      key: 'account_name',
      fixed: 'left',
      width: 120,
    },
    {
      title: '昵称',
      key: 'nickname',
      width: 120,
      render: (_, record) => {
        if (record.user_info && record.user_info.nickname) {
          return (
            <Space>
              {record.user_info.avatar && (
                <img
                  src={record.user_info.avatar}
                  alt="avatar"
                  style={{ width: 24, height: 24, borderRadius: '50%' }}
                />
              )}
              <Text>{record.user_info.nickname}</Text>
            </Space>
          );
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: '抖音号/ID',
      key: 'douyin_id',
      width: 130,
      render: (_, record) => {
        if (record.user_info && record.user_info.douyin_id) {
          return <Text code>{record.user_info.douyin_id}</Text>;
        }
        if (record.account_id && !record.account_id.startsWith('temp_')) {
          return <Text code type="secondary">{record.account_id}</Text>;
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 80,
      render: (platform) => (
        <Tag color={platform === 'douyin' ? 'blue' : 'green'}>
          {platform === 'douyin' ? '抖音' : platform}
        </Tag>
      ),
    },
    {
      title: 'Worker 状态',
      dataIndex: ['runtime_stats', 'worker_status'],
      key: 'worker_status',
      width: 100,
      render: renderWorkerStatus,
    },
    {
      title: '登录状态',
      dataIndex: 'login_status',
      key: 'login_status',
      width: 100,
      render: renderLoginStatus,
    },
    {
      title: 'Worker',
      dataIndex: ['worker', 'id'],
      key: 'worker_id',
      width: 120,
      render: (workerId, record) => {
        if (!workerId) return <Tag>未分配</Tag>;
        const workerStatus = record.worker.status === 'online' ? 'success' : 'default';
        return (
          <Tooltip title={`${record.worker.host}:${record.worker.port}`}>
            <Badge status={workerStatus} text={workerId} />
          </Tooltip>
        );
      },
    },
    {
      title: '累计评论',
      dataIndex: ['runtime_stats', 'total_comments'],
      key: 'total_comments',
      width: 100,
      sorter: true,
      render: (count) => (
        <Statistic
          value={count || 0}
          prefix={<CommentOutlined />}
          valueStyle={{ fontSize: 14 }}
        />
      ),
    },
    {
      title: '累计作品',
      dataIndex: ['runtime_stats', 'total_works'],
      key: 'total_works',
      width: 100,
      sorter: true,
      render: (count) => (
        <Statistic
          value={count || 0}
          prefix={<FileTextOutlined />}
          valueStyle={{ fontSize: 14 }}
        />
      ),
    },
    {
      title: '最后爬取时间',
      dataIndex: ['runtime_stats', 'last_crawl_time'],
      key: 'last_crawl_time',
      width: 140,
      sorter: true,
      render: (timestamp) => {
        if (!timestamp) return <Tag>未爬取</Tag>;
        const date = dayjs.unix(timestamp);
        const isRecent = dayjs().diff(date, 'minute') < 5;
        return (
          <Tooltip title={date.format('YYYY-MM-DD HH:mm:ss')}>
            <span style={{ color: isRecent ? '#52c41a' : undefined }}>
              <ClockCircleOutlined /> {date.fromNow()}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '最后心跳时间',
      dataIndex: ['runtime_stats', 'last_heartbeat_time'],
      key: 'last_heartbeat_time',
      width: 140,
      render: (timestamp) => {
        if (!timestamp) return '-';
        const date = dayjs.unix(timestamp);
        const isRecent = dayjs().diff(date, 'minute') < 2;
        return (
          <Tooltip title={date.format('YYYY-MM-DD HH:mm:ss')}>
            <span style={{ color: isRecent ? '#52c41a' : '#ff4d4f' }}>
              {date.fromNow()}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '错误计数',
      dataIndex: ['runtime_stats', 'error_count'],
      key: 'error_count',
      width: 90,
      render: (count) => {
        if (!count || count === 0) return <Tag color="green">0</Tag>;
        return <Tag color="red">{count}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (text, record) => {
        const isLoggedIn = record.login_status === 'logged_in';
        const needsLogin = record.login_status === 'not_logged_in' || record.login_status === 'login_failed';

        if (isLoggedIn) {
          // 已登录：显示退出按钮
          return (
            <Button
              danger
              size="small"
              icon={<LogoutOutlined />}
              onClick={() => handleLogout(record)}
              disabled={!connected}
            >
              退出账号
            </Button>
          );
        }

        if (needsLogin) {
          // 未登录或登录失败：显示登录按钮
          return (
            <Button
              type="primary"
              size="small"
              icon={<LoginOutlined />}
              onClick={() => handleLogin(record)}
              disabled={!connected}
            >
              登录
            </Button>
          );
        }

        // 登录中状态
        return <Tag color="blue">登录中...</Tag>;
      },
    },
  ];

  // 表格变化处理（排序）
  const handleTableChange = (pagination, filters, sorter) => {
    if (sorter.field) {
      setSortConfig({
        sort: sorter.field.join ? sorter.field.join('.') : sorter.field,
        order: sorter.order === 'ascend' ? 'asc' : 'desc',
      });
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* 页面标题和刷新按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>账号监控</h2>
        <Button type="primary" icon={<SyncOutlined />} onClick={handleRefresh} loading={loading}>
          刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={4}>
          <Card>
            <Statistic
              title="总账号数"
              value={stats.total}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="在线账号"
              value={stats.online}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="离线账号"
              value={stats.offline}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="错误账号"
              value={stats.error}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="累计评论"
              value={stats.totalComments}
              prefix={<CommentOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="累计作品"
              value={stats.totalWorks}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 过滤器 */}
      <Card>
        <Space size="middle">
          <span>过滤:</span>
          <Select
            placeholder="Worker 状态"
            style={{ width: 150 }}
            allowClear
            value={filters.worker_status}
            onChange={(value) => setFilters({ ...filters, worker_status: value })}
          >
            <Option value="online">在线</Option>
            <Option value="offline">离线</Option>
            <Option value="error">错误</Option>
          </Select>
          <Select
            placeholder="登录状态"
            style={{ width: 150 }}
            allowClear
            value={filters.login_status}
            onChange={(value) => setFilters({ ...filters, login_status: value })}
          >
            <Option value="logged_in">已登录</Option>
            <Option value="not_logged_in">未登录</Option>
            <Option value="login_failed">登录失败</Option>
          </Select>
          <Select
            placeholder="平台"
            style={{ width: 120 }}
            allowClear
            loading={platformsLoading}
            value={filters.platform}
            onChange={(value) => setFilters({ ...filters, platform: value })}
          >
            {platforms.map(platform => (
              <Option key={platform.value} value={platform.value}>
                {platform.label}
              </Option>
            ))}
          </Select>
        </Space>
      </Card>

      {/* 账号状态表格 */}
      <Table
        dataSource={accounts}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
        loading={loading}
        onChange={handleTableChange}
        scroll={{ x: 1500 }}
      />

      {/* 统一登录弹窗 */}
      <LoginModal
        visible={loginModalData.visible}
        loginData={loginModalData}
        onSubmitInput={submitUserInput}
        onCancel={closeLoginModal}
      />
    </Space>
  );
};

export default AccountStatusPage;
