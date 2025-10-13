/**
 * AccountList 组件
 * T041: 账户列表组件
 */

import React from 'react';
import { Table, Tag, Space, Button, Popconfirm, message } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';

/**
 * 账户列表组件
 * @param {object} props
 * @param {Array} props.accounts - 账户列表
 * @param {boolean} props.loading - 加载状态
 * @param {function} props.onRefresh - 刷新回调
 * @param {function} props.onEdit - 编辑回调
 * @param {function} props.onPause - 暂停回调
 * @param {function} props.onResume - 恢复回调
 * @param {function} props.onDelete - 删除回调
 */
function AccountList({ accounts, loading, onRefresh, onEdit, onPause, onResume, onDelete }) {
  /**
   * 渲染状态标签
   */
  const renderStatus = (status) => {
    const statusMap = {
      active: { color: 'success', text: '监控中' },
      paused: { color: 'warning', text: '已暂停' },
      error: { color: 'error', text: '错误' },
      expired: { color: 'default', text: '已过期' },
    };

    const config = statusMap[status] || statusMap.error;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  /**
   * 渲染平台标签
   */
  const renderPlatform = (platform) => {
    const platformMap = {
      douyin: { color: 'blue', text: '抖音' },
    };

    const config = platformMap[platform] || { color: 'default', text: platform };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  /**
   * 渲染操作按钮
   */
  const renderActions = (record) => {
    const isPaused = record.status === 'paused';
    const isActive = record.status === 'active';

    return (
      <Space size="small">
        <Button
          type="link"
          icon={<EditOutlined />}
          onClick={() => onEdit && onEdit(record)}
          size="small"
        >
          编辑
        </Button>

        {isActive && (
          <Button
            type="link"
            icon={<PauseCircleOutlined />}
            onClick={() => handlePause(record)}
            size="small"
          >
            暂停
          </Button>
        )}

        {isPaused && (
          <Button
            type="link"
            icon={<PlayCircleOutlined />}
            onClick={() => handleResume(record)}
            size="small"
          >
            恢复
          </Button>
        )}

        <Popconfirm
          title="确认删除"
          description={`确定要删除账户 "${record.account_name}" 吗?`}
          onConfirm={() => handleDelete(record)}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button type="link" danger icon={<DeleteOutlined />} size="small">
            删除
          </Button>
        </Popconfirm>
      </Space>
    );
  };

  /**
   * 暂停账户
   */
  const handlePause = async (account) => {
    try {
      await onPause(account.id);
      message.success('账户已暂停');
      onRefresh && onRefresh();
    } catch (error) {
      message.error(`暂停失败: ${error.message}`);
    }
  };

  /**
   * 恢复账户
   */
  const handleResume = async (account) => {
    try {
      await onResume(account.id);
      message.success('账户已恢复');
      onRefresh && onRefresh();
    } catch (error) {
      message.error(`恢复失败: ${error.message}`);
    }
  };

  /**
   * 删除账户
   */
  const handleDelete = async (account) => {
    try {
      await onDelete(account.id);
      message.success('账户已删除');
      onRefresh && onRefresh();
    } catch (error) {
      message.error(`删除失败: ${error.message}`);
    }
  };

  /**
   * 表格列定义
   */
  const columns = [
    {
      title: '账户名称',
      dataIndex: 'account_name',
      key: 'account_name',
      width: 200,
      fixed: 'left',
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 100,
      render: renderPlatform,
    },
    {
      title: '账户ID',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 150,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatus,
    },
    {
      title: '监控间隔',
      dataIndex: 'monitor_interval',
      key: 'monitor_interval',
      width: 120,
      render: (interval) => `${interval}秒`,
    },
    {
      title: '分配Worker',
      dataIndex: 'assigned_worker_id',
      key: 'assigned_worker_id',
      width: 150,
      render: (workerId) => workerId || <Tag>未分配</Tag>,
    },
    {
      title: '最后检查',
      dataIndex: 'last_check_time',
      key: 'last_check_time',
      width: 180,
      render: (timestamp) => {
        if (!timestamp) return '-';
        return new Date(timestamp * 1000).toLocaleString('zh-CN');
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (timestamp) => new Date(timestamp * 1000).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      fixed: 'right',
      render: (_, record) => renderActions(record),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={accounts}
      loading={loading}
      rowKey="id"
      scroll={{ x: 1500 }}
      pagination={{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 个账户`,
      }}
    />
  );
}

export default AccountList;
