import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button, Card, Statistic, Row, Col } from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { workersAPI } from '../services/api';

const WorkersPage = () => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);

  // 加载 Workers 列表
  const loadWorkers = async () => {
    setLoading(true);
    try {
      const response = await workersAPI.getWorkers();
      setWorkers(response.data || []);
    } catch (error) {
      console.error('Failed to load workers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkers();

    // 定时刷新（每 10 秒）
    const interval = setInterval(loadWorkers, 10000);
    return () => clearInterval(interval);
  }, []);

  // 统计数据
  const onlineCount = workers.filter((w) => w.status === 'online').length;
  const offlineCount = workers.filter((w) => w.status === 'offline').length;
  const totalAccounts = workers.reduce((sum, w) => sum + (w.assigned_accounts || 0), 0);

  // 状态标签
  const renderStatus = (status) => {
    if (status === 'online') {
      return <Tag icon={<CheckCircleOutlined />} color="success">在线</Tag>;
    }
    return <Tag icon={<CloseCircleOutlined />} color="error">离线</Tag>;
  };

  // 表格列定义
  const columns = [
    {
      title: 'Worker ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      ellipsis: true,
      render: (text) => <code>{text}</code>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatus,
    },
    {
      title: '主机',
      dataIndex: 'host',
      key: 'host',
      width: 150,
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
      width: 80,
    },
    {
      title: '分配账户数',
      dataIndex: 'assigned_accounts',
      key: 'assigned_accounts',
      width: 120,
      render: (count) => <Tag color="blue">{count || 0}</Tag>,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
    },
    {
      title: '最后心跳',
      dataIndex: 'last_heartbeat',
      key: 'last_heartbeat',
      width: 180,
      render: (timestamp) => {
        if (!timestamp) return '-';
        return dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm:ss');
      },
    },
    {
      title: '启动时间',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 180,
      render: (timestamp) => {
        if (!timestamp) return '-';
        return dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm:ss');
      },
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Worker 管理</h2>
        <Button icon={<SyncOutlined />} onClick={loadWorkers} loading={loading}>
          刷新
        </Button>
      </div>

      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic
              title="在线 Workers"
              value={onlineCount}
              suffix={`/ ${workers.length}`}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="离线 Workers"
              value={offlineCount}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="总分配账户数" value={totalAccounts} />
          </Card>
        </Col>
      </Row>

      <Table
        dataSource={workers}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </Space>
  );
};

export default WorkersPage;
