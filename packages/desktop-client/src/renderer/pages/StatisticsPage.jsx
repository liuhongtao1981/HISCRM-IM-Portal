/**
 * 统计页面
 * T087: 显示消息统计和趋势
 */

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Select, Spin, message, Table } from 'antd';
import {
  MessageOutlined,
  MailOutlined,
  EyeOutlined,
  BarChartOutlined,
} from '@ant-design/icons';

const { Option } = Select;

const StatisticsPage = () => {
  const [loading, setLoading] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [filters, setFilters] = useState({
    account_id: null,
    days: 7,
  });
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    loadStatistics();
  }, [filters]);

  const loadAccounts = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/v1/accounts');
      const result = await response.json();
      if (result.success) {
        setAccounts(result.data);
      }
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadStatistics = async () => {
    try {
      setLoading(true);

      const params = {
        group_by: 'day',
        days: filters.days,
      };

      if (filters.account_id) {
        params.account_id = filters.account_id;
      }

      const response = await fetch(
        `http://localhost:3000/api/v1/statistics?${new URLSearchParams(params)}`
      );

      if (!response.ok) {
        throw new Error('Failed to load statistics');
      }

      const result = await response.json();

      if (result.success) {
        setStatistics(result.data);
      }
    } catch (error) {
      message.error(`加载统计数据失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({
      ...filters,
      [key]: value,
    });
  };

  // 账户统计表格列
  const accountColumns = [
    {
      title: '账户ID',
      dataIndex: 'account_id',
      key: 'account_id',
    },
    {
      title: '评论数',
      dataIndex: 'comment_count',
      key: 'comment_count',
      sorter: (a, b) => a.comment_count - b.comment_count,
    },
    {
      title: '私信数',
      dataIndex: 'direct_message_count',
      key: 'direct_message_count',
      sorter: (a, b) => a.direct_message_count - b.direct_message_count,
    },
    {
      title: '未读评论',
      dataIndex: 'unread_comments',
      key: 'unread_comments',
      sorter: (a, b) => a.unread_comments - b.unread_comments,
    },
    {
      title: '未读私信',
      dataIndex: 'unread_dms',
      key: 'unread_dms',
      sorter: (a, b) => a.unread_dms - b.unread_dms,
    },
  ];

  // 每日统计表格列
  const dailyColumns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
    },
    {
      title: '评论数',
      dataIndex: 'comment_count',
      key: 'comment_count',
    },
    {
      title: '私信数',
      dataIndex: 'dm_count',
      key: 'dm_count',
    },
    {
      title: '总计',
      dataIndex: 'total',
      key: 'total',
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>
          <BarChartOutlined /> 统计分析
        </h1>
        <div>
          <Select
            placeholder="选择账户"
            allowClear
            style={{ width: 200, marginRight: 16 }}
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
            style={{ width: 120 }}
            value={filters.days}
            onChange={(value) => handleFilterChange('days', value)}
          >
            <Option value={7}>最近7天</Option>
            <Option value={30}>最近30天</Option>
            <Option value={90}>最近90天</Option>
          </Select>
        </div>
      </div>

      <Spin spinning={loading}>
        {statistics && (
          <>
            {/* 总体统计卡片 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="总消息数"
                    value={statistics.total_messages}
                    prefix={<MessageOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="评论数"
                    value={statistics.total_comments}
                    prefix={<MessageOutlined />}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="私信数"
                    value={statistics.total_direct_messages}
                    prefix={<MailOutlined />}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="未读消息"
                    value={statistics.unread_count}
                    prefix={<EyeOutlined />}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Card>
              </Col>
            </Row>

            {/* 按账户统计 */}
            {statistics.accounts && statistics.accounts.length > 0 && (
              <Card title="按账户统计" style={{ marginBottom: 16 }}>
                <Table
                  dataSource={statistics.accounts}
                  columns={accountColumns}
                  rowKey="account_id"
                  pagination={false}
                  size="small"
                />
              </Card>
            )}

            {/* 每日趋势 */}
            {statistics.daily_stats && statistics.daily_stats.length > 0 && (
              <Card title={`每日趋势（最近${filters.days}天）`}>
                <Table
                  dataSource={statistics.daily_stats}
                  columns={dailyColumns}
                  rowKey="date"
                  pagination={false}
                  size="small"
                />
              </Card>
            )}
          </>
        )}
      </Spin>
    </div>
  );
};

export default StatisticsPage;
