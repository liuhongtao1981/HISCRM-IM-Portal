import React, { useEffect } from 'react';
import { Card, Row, Col, Statistic, Space, Badge } from 'antd';
import {
  UserOutlined,
  ClusterOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { useSocketContext } from '../services/socketContext';

const Dashboard = () => {
  const { connected, systemStatus, requestSystemStatus } = useSocketContext();

  useEffect(() => {
    // 初始加载
    if (connected) {
      requestSystemStatus();
    }

    // 定时刷新（每 10 秒）
    const interval = setInterval(() => {
      if (connected) {
        requestSystemStatus();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [connected, requestSystemStatus]);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>系统仪表板</h2>
        <Badge
          status={connected ? 'success' : 'error'}
          text={connected ? '已连接' : '未连接'}
        />
      </div>

      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="在线 Workers"
              value={systemStatus?.workers?.online || 0}
              suffix={`/ ${systemStatus?.workers?.total || 0}`}
              prefix={<ClusterOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="账户总数"
              value={systemStatus?.accounts?.total || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃账户"
              value={systemStatus?.accounts?.active || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待登录会话"
              value={systemStatus?.loginSessions?.pending || 0}
              prefix={<GlobalOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Workers 状态">
            {systemStatus?.workers ? (
              <div>
                <p>在线: {systemStatus.workers.online}</p>
                <p>离线: {(systemStatus.workers.total || 0) - (systemStatus.workers.online || 0)}</p>
                <p>总数: {systemStatus.workers.total}</p>
              </div>
            ) : (
              <p>加载中...</p>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="账户状态">
            {systemStatus?.accounts ? (
              <div>
                <p>总数: {systemStatus.accounts.total}</p>
                <p>活跃: {systemStatus.accounts.active}</p>
                <p>
                  非活跃:{' '}
                  {(systemStatus.accounts.total || 0) - (systemStatus.accounts.active || 0)}
                </p>
              </div>
            ) : (
              <p>加载中...</p>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

export default Dashboard;
