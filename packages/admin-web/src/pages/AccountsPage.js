import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LoginOutlined } from '@ant-design/icons';
import { accountsAPI, workersAPI } from '../services/api';
import { useSocketContext } from '../services/socketContext';

const { Option } = Select;

const AccountsPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [form] = Form.useForm();

  const { startLogin } = useSocketContext();

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
    loadAccounts();
    loadWorkers();
  }, []);

  // 打开创建/编辑模态框
  const handleOpenModal = (account = null) => {
    setEditingAccount(account);
    if (account) {
      form.setFieldsValue(account);
    } else {
      form.resetFields();
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

    Modal.confirm({
      title: '启动登录流程',
      content: `确定要为账户 "${account.account_name}" 启动登录流程吗？`,
      okText: '启动',
      cancelText: '取消',
      onOk: () => {
        startLogin(account.id, account.assigned_worker_id);
      },
    });
  };

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 150,
      ellipsis: true,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 100,
      render: (platform) => (
        <Tag color={platform === 'douyin' ? 'blue' : 'green'}>{platform}</Tag>
      ),
    },
    {
      title: '账户名称',
      dataIndex: 'account_name',
      key: 'account_name',
    },
    {
      title: '账户ID',
      dataIndex: 'account_id',
      key: 'account_id',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const color = status === 'active' ? 'green' : 'red';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: '分配 Worker',
      dataIndex: 'assigned_worker_id',
      key: 'assigned_worker_id',
      width: 150,
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<LoginOutlined />}
            onClick={() => handleStartLogin(record)}
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
            <Select placeholder="选择平台">
              <Option value="douyin">抖音</Option>
              <Option value="weibo">微博</Option>
              <Option value="xiaohongshu">小红书</Option>
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
        </Form>
      </Modal>
    </Space>
  );
};

export default AccountsPage;
