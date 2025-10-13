/**
 * 时间范围筛选组件
 * T086: 用于筛选历史消息的时间范围
 */

import React from 'react';
import { Select, DatePicker, Space, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;
const { Option } = Select;

const TimeRangeFilter = ({ onChange, onReset }) => {
  const [filterType, setFilterType] = React.useState('preset');
  const [presetValue, setPresetValue] = React.useState('today');
  const [customRange, setCustomRange] = React.useState(null);

  const presetRanges = {
    today: { label: '今天', value: () => [getTodayStart(), Date.now()] },
    yesterday: { label: '昨天', value: () => [getYesterdayStart(), getTodayStart()] },
    last7days: { label: '最近7天', value: () => [get7DaysAgo(), Date.now()] },
    last30days: { label: '最近30天', value: () => [get30DaysAgo(), Date.now()] },
    thisMonth: { label: '本月', value: () => [getMonthStart(), Date.now()] },
    lastMonth: { label: '上月', value: () => [getLastMonthStart(), getMonthStart()] },
  };

  function getTodayStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  function getYesterdayStart() {
    return getTodayStart() - 86400000;
  }

  function get7DaysAgo() {
    return Date.now() - 7 * 86400000;
  }

  function get30DaysAgo() {
    return Date.now() - 30 * 86400000;
  }

  function getMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }

  function getLastMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  }

  const handlePresetChange = (value) => {
    setPresetValue(value);
    const range = presetRanges[value].value();
    if (onChange) {
      onChange({
        start_time: Math.floor(range[0] / 1000),
        end_time: Math.floor(range[1] / 1000),
      });
    }
  };

  const handleCustomRangeChange = (dates) => {
    setCustomRange(dates);
    if (dates && dates.length === 2 && onChange) {
      onChange({
        start_time: Math.floor(dates[0].valueOf() / 1000),
        end_time: Math.floor(dates[1].valueOf() / 1000),
      });
    }
  };

  const handleReset = () => {
    setFilterType('preset');
    setPresetValue('today');
    setCustomRange(null);
    if (onReset) {
      onReset();
    }
  };

  return (
    <Space>
      <Select value={filterType} onChange={setFilterType} style={{ width: 120 }}>
        <Option value="preset">预设范围</Option>
        <Option value="custom">自定义</Option>
      </Select>

      {filterType === 'preset' && (
        <Select value={presetValue} onChange={handlePresetChange} style={{ width: 150 }}>
          {Object.entries(presetRanges).map(([key, { label }]) => (
            <Option key={key} value={key}>
              {label}
            </Option>
          ))}
        </Select>
      )}

      {filterType === 'custom' && (
        <RangePicker
          value={customRange}
          onChange={handleCustomRangeChange}
          showTime
          format="YYYY-MM-DD HH:mm"
        />
      )}

      <Button icon={<ReloadOutlined />} onClick={handleReset}>
        重置
      </Button>
    </Space>
  );
};

export default TimeRangeFilter;
