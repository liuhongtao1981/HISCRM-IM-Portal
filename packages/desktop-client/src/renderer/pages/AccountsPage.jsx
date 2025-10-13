/**
 * AccountsPage 页面
 * T043: 账户管理主页面
 */

import React, { useState, useEffect } from 'react';
import { Button, Space, Card, Statistic, Row, Col, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import AccountList from '../components/AccountList';
import AddAccountDialog from '../components/AddAccountDialog';
import NotificationCenter from '../components/NotificationCenter';
import apiClient from '../services/api-client';

/**
 * 账户管理页面
 */
function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addDialogVisible, setAddDialogVisible] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    paused: 0,
    error: 0,
  });

  /**
   * 加载账户列表
   */
  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getAccounts();
      setAccounts(data);

      // 计算统计数据
      const newStats = {
        total: data.length,
        active: data.filter((acc) => acc.status === 'active').length,
        paused: data.filter((acc) => acc.status === 'paused').length,
        error: data.filter((acc) => acc.status === 'error').length,
      };
      setStats(newStats);
    } catch (error) {
      message.error(`加载账户列表失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 创建账户
   */
  const handleCreateAccount = async (accountData) => {
    await apiClient.createAccount(accountData);
    await loadAccounts();
  };

  /**
   * 暂停账户
   */
  const handlePauseAccount = async (accountId) => {
    await apiClient.pauseAccount(accountId);
  };

  /**
   * 恢复账户
   */
  const handleResumeAccount = async (accountId) => {
    await apiClient.resumeAccount(accountId);
  };

  /**
   * 删除账户
   */
  const handleDeleteAccount = async (accountId) => {
    await apiClient.deleteAccount(accountId);
  };

  /**
   * 编辑账户 (暂未实现完整功能)
   */
  const handleEditAccount = (account) => {
    message.info('编辑功能将在后续版本实现');
    console.log('Edit account:', account);
  };

  // 初始加载
  useEffect(() => {
    loadAccounts();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题和操作按钮 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>账户管理</h1>
        <Space>
          <NotificationCenter />
          <Button icon={<ReloadOutlined />} onClick={loadAccounts}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddDialogVisible(true)}>
            添加账户
          </Button>
        </Space>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="总账户数" value={stats.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="监控中"
              value={stats.active}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已暂停"
              value={stats.paused}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="错误"
              value={stats.error}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 账户列表 */}
      <Card>
        <AccountList
          accounts={accounts}
          loading={loading}
          onRefresh={loadAccounts}
          onEdit={handleEditAccount}
          onPause={handlePauseAccount}
          onResume={handleResumeAccount}
          onDelete={handleDeleteAccount}
        />
      </Card>

      {/* 添加账户对话框 */}
      <AddAccountDialog
        visible={addDialogVisible}
        onClose={() => setAddDialogVisible(false)}
        onSubmit={handleCreateAccount}
      />
    </div>
  );
}

export default AccountsPage;
