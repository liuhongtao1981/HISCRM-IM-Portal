import React, { useEffect, useState } from 'react';
import { Table, Tag, Space, Button, Tooltip } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import { useSocketContext } from '../services/socketContext';
import QRCodeModal from '../components/QRCodeModal';

dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const LoginManagementPage = () => {
  const {
    connected,
    loginSessions,
    qrCodeData,
    requestLoginSessions,
  } = useSocketContext();

  const [qrModalVisible, setQRModalVisible] = useState(false);

  // 加载登录会话列表
  useEffect(() => {
    if (connected) {
      requestLoginSessions();

      // 定时刷新（每 5 秒）
      const interval = setInterval(() => {
        requestLoginSessions();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [connected, requestLoginSessions]);

  // 当收到 QR 码数据时自动打开模态框
  useEffect(() => {
    if (qrCodeData) {
      setQRModalVisible(true);
    }
  }, [qrCodeData]);

  // 手动刷新
  const handleRefresh = () => {
    requestLoginSessions();
  };

  // 状态标签渲染
  const renderStatus = (status) => {
    const statusMap = {
      pending: { color: 'blue', text: '待处理' },
      scanning: { color: 'orange', text: '扫码中' },
      success: { color: 'green', text: '成功' },
      failed: { color: 'red', text: '失败' },
      expired: { color: 'default', text: '已过期' },
    };

    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 登录方法标签
  const renderLoginMethod = (method) => {
    const methodMap = {
      qrcode: { color: 'blue', text: '二维码' },
      password: { color: 'green', text: '密码' },
      cookie: { color: 'purple', text: 'Cookie' },
    };

    const config = methodMap[method] || { color: 'default', text: method };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 表格列定义
  const columns = [
    {
      title: '会话 ID',
      dataIndex: 'id',
      key: 'id',
      width: 150,
      ellipsis: true,
      render: (text) => <Tooltip title={text}><code>{text.slice(0, 12)}...</code></Tooltip>,
    },
    {
      title: '账户名称',
      dataIndex: 'account_name',
      key: 'account_name',
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 80,
      render: (platform) => (
        <Tag color={platform === 'douyin' ? 'blue' : 'green'}>{platform}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatus,
    },
    {
      title: '登录方法',
      dataIndex: 'login_method',
      key: 'login_method',
      width: 100,
      render: renderLoginMethod,
    },
    {
      title: 'Worker',
      dataIndex: 'worker_name',
      key: 'worker_name',
      width: 150,
      ellipsis: true,
      render: (text, record) => text || <code>{record.worker_id}</code>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 100,
      render: (timestamp) => {
        const date = dayjs.unix(timestamp);
        return (
          <Tooltip title={date.format('YYYY-MM-DD HH:mm:ss')}>
            {date.fromNow()}
          </Tooltip>
        );
      },
    },
    {
      title: '过期时间',
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 100,
      render: (timestamp) => {
        if (!timestamp) return '-';
        const date = dayjs.unix(timestamp);
        const isExpired = date.isBefore(dayjs());
        return (
          <Tooltip title={date.format('YYYY-MM-DD HH:mm:ss')}>
            <span style={{ color: isExpired ? '#ff4d4f' : undefined }}>
              {date.fromNow()}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (text) => text || '-',
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>登录管理</h2>
        <Button icon={<SyncOutlined />} onClick={handleRefresh}>
          刷新
        </Button>
      </div>

      <Table
        dataSource={loginSessions}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
        loading={!connected}
      />

      <QRCodeModal
        visible={qrModalVisible}
        onClose={() => setQRModalVisible(false)}
        qrCodeData={qrCodeData}
      />
    </Space>
  );
};

export default LoginManagementPage;
