import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { proxiesAPI } from '../services/api';

const { Option } = Select;

const ProxiesPage = () => {
  const [proxies, setProxies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProxy, setEditingProxy] = useState(null);
  const [form] = Form.useForm();

  // 加载代理列表
  const loadProxies = async () => {
    setLoading(true);
    try {
      const response = await proxiesAPI.getProxies();
      setProxies(response.data || []);
    } catch (error) {
      console.error('Failed to load proxies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProxies();
  }, []);

  // 打开创建/编辑模态框
  const handleOpenModal = (proxy = null) => {
    setEditingProxy(proxy);
    if (proxy) {
      form.setFieldsValue(proxy);
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  // 关闭模态框
  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingProxy(null);
    form.resetFields();
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      if (editingProxy) {
        // 编辑模式：如果密码为空且原代理有密码，则不更新密码字段
        const updateData = { ...values };
        if (!updateData.password && editingProxy.has_password) {
          // 删除密码字段，保持原密码不变
          delete updateData.password;
        }
        await proxiesAPI.updateProxy(editingProxy.id, updateData);
        message.success('代理更新成功');
      } else {
        await proxiesAPI.createProxy(values);
        message.success('代理创建成功');
      }

      handleCloseModal();
      loadProxies();
    } catch (error) {
      console.error('Failed to submit proxy:', error);
    }
  };

  // 删除代理
  const handleDelete = (proxy) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除代理 "${proxy.name}" 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await proxiesAPI.deleteProxy(proxy.id);
          message.success('代理删除成功');
          loadProxies();
        } catch (error) {
          console.error('Failed to delete proxy:', error);
        }
      },
    });
  };

  // 测试代理
  const handleTest = async (proxy) => {
    try {
      message.loading('正在测试代理...');
      await proxiesAPI.testProxy(proxy.id);
      message.success('代理测试成功');
      loadProxies();
    } catch (error) {
      message.error('代理测试失败');
      console.error('Failed to test proxy:', error);
    }
  };

  // 状态标签
  const renderStatus = (status) => {
    const statusMap = {
      active: { color: 'success', text: '激活' },
      inactive: { color: 'default', text: '未激活' },
      failed: { color: 'error', text: '失败' },
    };

    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 协议标签
  const renderProtocol = (protocol) => {
    const protocolMap = {
      http: { color: 'blue' },
      https: { color: 'green' },
      socks5: { color: 'purple' },
    };

    const config = protocolMap[protocol] || { color: 'default' };
    return <Tag color={config.color}>{protocol.toUpperCase()}</Tag>;
  };

  // 表格列定义
  const columns = [
    {
      title: '代理名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '服务器',
      dataIndex: 'server',
      key: 'server',
      render: (text) => <code>{text}</code>,
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 100,
      render: renderProtocol,
    },
    {
      title: '国家/城市',
      key: 'location',
      width: 120,
      render: (_, record) => {
        if (record.country || record.city) {
          return `${record.country || ''} ${record.city || ''}`.trim();
        }
        return '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatus,
    },
    {
      title: '分配 Worker',
      dataIndex: 'assigned_worker_id',
      key: 'assigned_worker_id',
      width: 150,
      ellipsis: true,
      render: (text) => text ? <code>{text}</code> : '-',
    },
    {
      title: '成功率',
      dataIndex: 'success_rate',
      key: 'success_rate',
      width: 100,
      render: (rate) => {
        if (rate === null || rate === undefined) return '-';
        const percent = (rate * 100).toFixed(1);
        return `${percent}%`;
      },
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
            icon={<CheckCircleOutlined />}
            onClick={() => handleTest(record)}
          >
            测试
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
        <h2>代理管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenModal()}>
          添加代理
        </Button>
      </div>

      <Table
        dataSource={proxies}
        columns={columns}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingProxy ? '编辑代理' : '添加代理'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={handleCloseModal}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="代理名称"
            rules={[{ required: true, message: '请输入代理名称' }]}
          >
            <Input placeholder="输入代理名称" />
          </Form.Item>

          <Form.Item
            name="server"
            label="服务器地址"
            rules={[{ required: true, message: '请输入服务器地址' }]}
            extra="格式: host:port，例如: 127.0.0.1:8080"
          >
            <Input placeholder="127.0.0.1:8080" />
          </Form.Item>

          <Form.Item
            name="protocol"
            label="协议"
            rules={[{ required: true, message: '请选择协议' }]}
          >
            <Select placeholder="选择协议">
              <Option value="http">HTTP</Option>
              <Option value="https">HTTPS</Option>
              <Option value="socks5">SOCKS5</Option>
            </Select>
          </Form.Item>

          <Form.Item name="username" label="用户名">
            <Input placeholder="如果需要认证，请输入用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            tooltip={editingProxy && editingProxy.has_password ? "留空保持原密码不变" : null}
          >
            <Input.Password
              placeholder={
                editingProxy && editingProxy.has_password
                  ? "留空保持原密码，输入新密码将覆盖"
                  : "如果需要认证，请输入密码"
              }
            />
          </Form.Item>

          <Form.Item name="country" label="国家">
            <Input placeholder="代理所在国家（可选）" />
          </Form.Item>

          <Form.Item name="city" label="城市">
            <Input placeholder="代理所在城市（可选）" />
          </Form.Item>

          <Form.Item name="status" label="状态" initialValue="active">
            <Select>
              <Option value="active">激活</Option>
              <Option value="inactive">未激活</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default ProxiesPage;
