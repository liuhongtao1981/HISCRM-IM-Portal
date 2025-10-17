import React, { useEffect } from 'react';
import { Card, Row, Col, Statistic, Space, Badge, Progress, Divider, Tag } from 'antd';
import {
  UserOutlined,
  ClusterOutlined,
  GlobalOutlined,
  CommentOutlined,
  FileTextOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  LoginOutlined,
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

  // 计算百分比
  const getPercentage = (value, total) => {
    if (!total) return 0;
    return Math.round((value / total) * 100);
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>系统仪表板</h2>
        <Space>
          <Badge
            status={connected ? 'success' : 'error'}
            text={connected ? '已连接' : '未连接'}
          />
          {systemStatus?.timestamp && (
            <span style={{ fontSize: 12, color: '#999' }}>
              更新时间: {new Date(systemStatus.timestamp).toLocaleTimeString()}
            </span>
          )}
        </Space>
      </div>

      {/* Workers 概览 */}
      <Card title="Workers 概览" bordered={false}>
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic
                title="总 Workers"
                value={systemStatus?.workers?.total || 0}
                prefix={<ClusterOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="在线 Workers"
                value={systemStatus?.workers?.online || 0}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="离线 Workers"
                value={systemStatus?.workers?.offline || 0}
                prefix={<CloseCircleOutlined />}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 账户概览 */}
      <Card title="账户概览" bordered={false}>
        <Row gutter={16}>
          <Col span={6}>
            <Card>
              <Statistic
                title="账户总数"
                value={systemStatus?.accounts?.total || 0}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="活跃账户"
                value={systemStatus?.accounts?.active || 0}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="非活跃账户"
                value={systemStatus?.accounts?.inactive || 0}
                prefix={<CloseCircleOutlined />}
                valueStyle={{ color: '#8c8c8c' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="平台数"
                value={Object.keys(systemStatus?.platforms || {}).length}
                prefix={<GlobalOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 账户详细状态 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card title="登录状态分布" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>已登录</span>
                  <span>
                    <Tag color="green">{systemStatus?.accounts?.loggedIn || 0}</Tag>
                    {getPercentage(systemStatus?.accounts?.loggedIn, systemStatus?.accounts?.total)}%
                  </span>
                </div>
                <Progress
                  percent={getPercentage(systemStatus?.accounts?.loggedIn, systemStatus?.accounts?.total)}
                  strokeColor="#52c41a"
                  showInfo={false}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>未登录</span>
                  <span>
                    <Tag color="orange">{systemStatus?.accounts?.notLoggedIn || 0}</Tag>
                    {getPercentage(systemStatus?.accounts?.notLoggedIn, systemStatus?.accounts?.total)}%
                  </span>
                </div>
                <Progress
                  percent={getPercentage(systemStatus?.accounts?.notLoggedIn, systemStatus?.accounts?.total)}
                  strokeColor="#faad14"
                  showInfo={false}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>登录失败</span>
                  <span>
                    <Tag color="red">{systemStatus?.accounts?.loginFailed || 0}</Tag>
                    {getPercentage(systemStatus?.accounts?.loginFailed, systemStatus?.accounts?.total)}%
                  </span>
                </div>
                <Progress
                  percent={getPercentage(systemStatus?.accounts?.loginFailed, systemStatus?.accounts?.total)}
                  strokeColor="#ff4d4f"
                  showInfo={false}
                />
              </div>
            </Space>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="Worker 状态分布" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>在线账号</span>
                  <span>
                    <Tag color="green">{systemStatus?.accounts?.onlineStatus || 0}</Tag>
                    {getPercentage(systemStatus?.accounts?.onlineStatus, systemStatus?.accounts?.total)}%
                  </span>
                </div>
                <Progress
                  percent={getPercentage(systemStatus?.accounts?.onlineStatus, systemStatus?.accounts?.total)}
                  strokeColor="#52c41a"
                  showInfo={false}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>离线账号</span>
                  <span>
                    <Tag color="default">{systemStatus?.accounts?.offlineStatus || 0}</Tag>
                    {getPercentage(systemStatus?.accounts?.offlineStatus, systemStatus?.accounts?.total)}%
                  </span>
                </div>
                <Progress
                  percent={getPercentage(systemStatus?.accounts?.offlineStatus, systemStatus?.accounts?.total)}
                  strokeColor="#8c8c8c"
                  showInfo={false}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span>错误账号</span>
                  <span>
                    <Tag color="red">{systemStatus?.accounts?.errorStatus || 0}</Tag>
                    {getPercentage(systemStatus?.accounts?.errorStatus, systemStatus?.accounts?.total)}%
                  </span>
                </div>
                <Progress
                  percent={getPercentage(systemStatus?.accounts?.errorStatus, systemStatus?.accounts?.total)}
                  strokeColor="#ff4d4f"
                  showInfo={false}
                />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 运行时统计 */}
      <Card title="运行时统计" bordered={false}>
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic
                title="累计评论数"
                value={systemStatus?.runtime?.totalComments || 0}
                prefix={<CommentOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="累计作品数"
                value={systemStatus?.runtime?.totalWorks || 0}
                prefix={<FileTextOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="累计粉丝数"
                value={systemStatus?.runtime?.totalFollowers || 0}
                prefix={<TeamOutlined />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 登录会话和平台分布 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card title="登录会话统计" bordered={false}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="进行中"
                  value={systemStatus?.loginSessions?.pending || 0}
                  prefix={<SyncOutlined spin />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="成功"
                  value={systemStatus?.loginSessions?.success || 0}
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="失败"
                  value={systemStatus?.loginSessions?.failed || 0}
                  prefix={<CloseCircleOutlined />}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
            </Row>
            <Divider />
            <Statistic
              title="总会话数"
              value={systemStatus?.loginSessions?.total || 0}
              prefix={<LoginOutlined />}
            />
          </Card>
        </Col>

        <Col span={12}>
          <Card title="平台分布" bordered={false}>
            {systemStatus?.platforms && Object.keys(systemStatus.platforms).length > 0 ? (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {Object.entries(systemStatus.platforms).map(([platform, count]) => (
                  <div key={platform}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>
                        <Tag color={platform === 'douyin' ? 'blue' : 'green'}>
                          {platform === 'douyin' ? '抖音' : platform}
                        </Tag>
                      </span>
                      <span>
                        <strong>{count}</strong> 账户
                      </span>
                    </div>
                    <Progress
                      percent={getPercentage(count, systemStatus?.accounts?.total)}
                      strokeColor={platform === 'douyin' ? '#1890ff' : '#52c41a'}
                      showInfo={false}
                    />
                  </div>
                ))}
              </Space>
            ) : (
              <p style={{ color: '#999', textAlign: 'center' }}>暂无平台数据</p>
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

export default Dashboard;
