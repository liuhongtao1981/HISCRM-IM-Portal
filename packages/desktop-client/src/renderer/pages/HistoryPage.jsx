/**
 * 历史记录页面
 * T084: 查看所有历史评论和私信
 */

import React, { useState, useEffect } from 'react';
import { Card, Select, Space, message, Spin, Tabs } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import MessageList from '../components/MessageList';
import TimeRangeFilter from '../components/TimeRangeFilter';
import apiClient from '../services/api-client';

const { Option } = Select;
const { TabPane } = Tabs;

const HistoryPage = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [filters, setFilters] = useState({
    type: null,
    account_id: null,
    is_read: null,
  });
  const [timeRange, setTimeRange] = useState(null);
  const [accounts, setAccounts] = useState([]);

  // 加载账户列表
  useEffect(() => {
    loadAccounts();
  }, []);

  // 加载消息
  useEffect(() => {
    loadMessages();
  }, [pagination.current, pagination.pageSize, filters, timeRange]);

  const loadAccounts = async () => {
    try {
      const data = await apiClient.getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);

      const params = {
        page: pagination.current,
        limit: pagination.pageSize,
        ...filters,
      };

      if (timeRange) {
        params.start_time = timeRange.start_time;
        params.end_time = timeRange.end_time;
      }

      const response = await fetch(
        `http://localhost:3000/api/v1/messages?${new URLSearchParams(
          Object.entries(params).filter(([_, v]) => v !== null && v !== undefined)
        )}`
      );

      if (!response.ok) {
        throw new Error('Failed to load messages');
      }

      const result = await response.json();

      if (result.success) {
        setMessages(result.data.messages);
        setPagination({
          ...pagination,
          total: result.data.total,
        });
      }
    } catch (error) {
      message.error(`加载消息失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (page, pageSize) => {
    setPagination({
      ...pagination,
      current: page,
      pageSize,
    });
  };

  const handleFilterChange = (key, value) => {
    setFilters({
      ...filters,
      [key]: value,
    });
    setPagination({
      ...pagination,
      current: 1, // 重置到第一页
    });
  };

  const handleTimeRangeChange = (range) => {
    setTimeRange(range);
    setPagination({
      ...pagination,
      current: 1,
    });
  };

  const handleTimeRangeReset = () => {
    setTimeRange(null);
    setPagination({
      ...pagination,
      current: 1,
    });
  };

  const handleMessageClick = async (msg) => {
    // 标记为已读
    try {
      await fetch(`http://localhost:3000/api/v1/messages/${msg.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: msg.type }),
      });

      // 更新本地状态
      setMessages(
        messages.map((m) =>
          m.id === msg.id ? { ...m, is_read: true } : m
        )
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>
          <HistoryOutlined /> 历史记录
        </h1>
      </div>

      {/* 筛选器 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="选择账户"
            allowClear
            style={{ width: 200 }}
            value={filters.account_id}
            onChange={(value) => handleFilterChange('account_id', value)}
          >
            {accounts.map((acc) => (
              <Option key={acc.id} value={acc.id}>
                {acc.account_name}
              </Option>
            ))}
          </Select>

          <Select
            placeholder="消息类型"
            allowClear
            style={{ width: 120 }}
            value={filters.type}
            onChange={(value) => handleFilterChange('type', value)}
          >
            <Option value="comment">评论</Option>
            <Option value="direct_message">私信</Option>
          </Select>

          <Select
            placeholder="已读状态"
            allowClear
            style={{ width: 120 }}
            value={filters.is_read}
            onChange={(value) => handleFilterChange('is_read', value)}
          >
            <Option value={false}>未读</Option>
            <Option value={true}>已读</Option>
          </Select>

          <TimeRangeFilter
            onChange={handleTimeRangeChange}
            onReset={handleTimeRangeReset}
          />
        </Space>
      </Card>

      {/* 消息列表 */}
      <Card>
        <MessageList
          messages={messages}
          loading={loading}
          pagination={pagination}
          onPageChange={handlePageChange}
          onMessageClick={handleMessageClick}
        />
      </Card>
    </div>
  );
};

export default HistoryPage;
