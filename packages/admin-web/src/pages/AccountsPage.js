import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LoginOutlined } from '@ant-design/icons';
import { accountsAPI, workersAPI, platformsAPI } from '../services/api';
import { useSocketContext } from '../services/socketContext';
import LoginModal from '../components/LoginModal';

const { Option } = Select;

const AccountsPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [platformsLoading, setPlatformsLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [form] = Form.useForm();

  const { startLogin, loginModalData, submitUserInput, closeLoginModal } = useSocketContext();

  // 从 Master 加载平台列表
  const loadPlatforms = async () => {
    setPlatformsLoading(true);
    try {
      const response = await platformsAPI.getPlatforms();

      if (response.success && Array.isArray(response.data)) {
        setPlatforms(response.data);
      } else {
        // 降级方案：使用默认平台列表
        console.warn('Failed to load platforms from API, using defaults');
        setPlatforms([
          { value: 'douyin', label: '抖音' },
          { value: 'xiaohongshu', label: '小红书' }
        ]);
      }
    } catch (error) {
      console.error('Failed to load platforms:', error);
      // 降级方案：使用默认平台列表
      setPlatforms([
        { value: 'douyin', label: '抖音' },
        { value: 'xiaohongshu', label: '小红书' }
      ]);
    } finally {
      setPlatformsLoading(false);
    }
  };

  // 加载账户列表
  const loadAccounts = async () => {
    setLoading(true);
    try {
      const response = await accountsAPI.getAccounts();
      setAccounts(response.data || []);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载 Workers 列表
  const loadWorkers = async () => {
    try {
      const response = await workersAPI.getWorkers();
      setWorkers(response.data || []);
    } catch (error) {
      console.error('Failed to load workers:', error);
    }
  };

  useEffect(() => {
    loadPlatforms();
    loadAccounts();
    loadWorkers();
  }, []);

  // 打开创建/编辑模态框
  const handleOpenModal = (account = null) => {
    setEditingAccount(account);
    if (account) {
      // 处理 assigned_worker_id: null 转换为 'auto' 用于显示
      const formValues = {
        ...account,
        assigned_worker_id: account.assigned_worker_id || 'auto'
      };
      form.setFieldsValue(formValues);
    } else {
      form.resetFields();
      // 新建时默认选择自动分配
      form.setFieldsValue({ assigned_worker_id: 'auto' });
    }
    setModalVisible(true);
  };

  // 关闭模态框
  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingAccount(null);
    form.resetFields();
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // 处理 assigned_worker_id: 'auto' 转换为 null
      if (values.assigned_worker_id === 'auto') {
        values.assigned_worker_id = null;
      }

      if (editingAccount) {
        // 更新账户
        await accountsAPI.updateAccount(editingAccount.id, values);
        message.success('账户更新成功');
      } else {
        // 创建账户
        await accountsAPI.createAccount(values);
        message.success('账户创建成功');
      }

      handleCloseModal();
      loadAccounts();
    } catch (error) {
      console.error('Failed to submit account:', error);
    }
  };

  // 删除账户
  const handleDelete = (account) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除账户 "${account.account_name}" 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await accountsAPI.deleteAccount(account.id);
          message.success('账户删除成功');
          loadAccounts();
        } catch (error) {
          console.error('Failed to delete account:', error);
        }
      },
    });
  };

  // 启动登录
  const handleStartLogin = (account) => {
    if (!account.assigned_worker_id) {
      message.error('该账户尚未分配 Worker');
      return;
    }

    // 查找 Worker 信息
    const worker = workers.find(w => w.id === account.assigned_worker_id);

    // 直接启动登录流程，LoginModal 会自动弹出
    startLogin(account.id, account.assigned_worker_id, {
      account_name: account.account_name,
      platform: account.platform,
      worker_host: worker?.host,
      worker_port: worker?.port,
    });
  };

  // 解析并展示用户信息和 Cookie 状态
  const renderUserInfo = (record) => {
    try {
      const userInfo = record.user_info ? JSON.parse(record.user_info) : null;
      if (!userInfo) return <span style={{ color: '#999' }}>未登录</span>;

      return (
        <Space direction="vertical" size={0}>
          <Space>
            {userInfo.avatar && (
              <img
                src={userInfo.avatar}
                alt="avatar"
                style={{ width: 24, height: 24, borderRadius: '50%' }}
              />
            )}
            <span>{userInfo.nickname || '-'}</span>
          </Space>
          {userInfo.douyin_id && (
            <span style={{ fontSize: 12, color: '#999' }}>
              抖音号: {userInfo.douyin_id}
            </span>
          )}
        </Space>
      );
    } catch (e) {
      return '-';
    }
  };

  const renderCookieStatus = (record) => {
    try {
      const credentials = record.credentials ? JSON.parse(record.credentials) : null;
      const cookieCount = credentials && credentials.cookies ? credentials.cookies.length : 0;
      const validUntil = record.cookies_valid_until;
      const now = Math.floor(Date.now() / 1000);
      const isExpired = validUntil && validUntil < now;

      if (cookieCount === 0) {
        return <Tag color="default">无 Cookie</Tag>;
      }

      return (
        <Space direction="vertical" size={0}>
          <Tag color={isExpired ? 'red' : 'green'}>
            {cookieCount} 个 Cookie
          </Tag>
          {validUntil && (
            <span style={{ fontSize: 12, color: isExpired ? '#ff4d4f' : '#999' }}>
              {isExpired ? '已过期' : `有效期至 ${new Date(validUntil * 1000).toLocaleDateString()}`}
            </span>
          )}
        </Space>
      );
    } catch (e) {
      return '-';
    }
  };

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      ellipsis: true,
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
      title: '账户名称',
      dataIndex: 'account_name',
      key: 'account_name',
      width: 120,
    },
    {
      title: '账户ID',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 120,
      ellipsis: true,
    },
    {
      title: '用户信息',
      key: 'user_info',
      width: 150,
      render: (_, record) => renderUserInfo(record),
    },
    {
      title: '登录状态',
      dataIndex: 'login_status',
      key: 'login_status',
      width: 100,
      render: (status) => {
        const statusMap = {
          logged_in: { color: 'success', text: '已登录' },
          logging_in: { color: 'processing', text: '登录中' },
          login_failed: { color: 'error', text: '登录失败' },
          not_logged_in: { color: 'default', text: '未登录' },
        };
        const config = statusMap[status] || statusMap.not_logged_in;
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: 'Cookie 状态',
      key: 'cookie_status',
      width: 120,
      render: (_, record) => renderCookieStatus(record),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => {
        const color = status === 'active' ? 'green' : 'red';
        return <Tag color={color}>{status === 'active' ? '启用' : '禁用'}</Tag>;
      },
    },
    {
      title: '分配 Worker',
      dataIndex: 'assigned_worker_id',
      key: 'assigned_worker_id',
      width: 150,
      render: (workerId) => {
        if (!workerId) {
          return <Tag color="orange">自动分配</Tag>;
        }
        const worker = workers.find(w => w.id === workerId);
        const isOnline = worker && worker.status === 'online';
        return (
          <Space direction="vertical" size={0}>
            <Tag color={isOnline ? 'blue' : 'red'}>
              {workerId}
            </Tag>
            {!isOnline && (
              <span style={{ fontSize: 12, color: '#ff4d4f' }}>
                Worker 离线
              </span>
            )}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<LoginOutlined />}
            onClick={() => handleStartLogin(record)}
            disabled={record.login_status === 'logged_in'}
          >
            登录
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>账户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          添加账户
        </Button>
      </div>

      <Table
        dataSource={accounts}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingAccount ? '编辑账户' : '添加账户'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={handleCloseModal}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="platform"
            label="平台"
            rules={[{ required: true, message: '请选择平台' }]}
          >
            <Select
              placeholder="选择平台"
              loading={platformsLoading}
            >
              {platforms.map(platform => (
                <Option key={platform.value} value={platform.value}>
                  {platform.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="account_name"
            label="账户名称"
            rules={[{ required: true, message: '请输入账户名称' }]}
          >
            <Input placeholder="输入账户名称" />
          </Form.Item>

          <Form.Item
            name="account_id"
            label="账户ID"
            tooltip="可选，留空将自动生成临时ID，登录后自动更新为真实ID"
          >
            <Input placeholder="选填，留空将自动生成" />
          </Form.Item>

          <Form.Item name="status" label="状态" initialValue="active">
            <Select>
              <Option value="active">启用</Option>
              <Option value="inactive">禁用</Option>
            </Select>
          </Form.Item>

          <Form.Item name="monitor_interval" label="监控间隔（秒）" initialValue={30}>
            <Input type="number" placeholder="监控间隔" />
          </Form.Item>

          <Form.Item
            name="assigned_worker_id"
            label="Worker 分配"
            tooltip="选择自动分配由系统分配到负载最低的 Worker，或手动指定特定 Worker"
          >
            <Select
              placeholder="请选择 Worker"
              allowClear
              showSearch
              optionFilterProp="children"
            >
              <Option value="auto" key="auto">
                <Tag color="orange">自动分配</Tag>
              </Option>
              {workers
                .filter(w => w.status === 'online')
                .map(worker => (
                  <Option key={worker.id} value={worker.id}>
                    {worker.id} (负载: {worker.assigned_accounts || 0})
                  </Option>
                ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 登录弹窗 */}
      <LoginModal
        visible={loginModalData.visible}
        loginData={loginModalData}
        onSubmitInput={submitUserInput}
        onCancel={closeLoginModal}
      />
    </Space>
  );
};

export default AccountsPage;
