/**
 * AddAccountDialog 组件
 * T042: 添加账户对话框
 */

import React, { useState } from 'react';
import { Modal, Form, Input, Select, InputNumber, message } from 'antd';

const { TextArea } = Input;
const { Option } = Select;

/**
 * 添加账户对话框组件
 * @param {object} props
 * @param {boolean} props.visible - 是否可见
 * @param {function} props.onClose - 关闭回调
 * @param {function} props.onSubmit - 提交回调
 */
function AddAccountDialog({ visible, onClose, onSubmit }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  /**
   * 处理表单提交
   */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // 解析凭证JSON
      let credentials;
      try {
        credentials = JSON.parse(values.credentials);
      } catch (error) {
        message.error('凭证格式错误,请输入有效的JSON');
        return;
      }

      setLoading(true);

      const accountData = {
        platform: values.platform,
        account_name: values.account_name,
        account_id: values.account_id,
        credentials: credentials,
        monitor_interval: values.monitor_interval,
      };

      await onSubmit(accountData);

      message.success('账户创建成功');
      form.resetFields();
      onClose();
    } catch (error) {
      if (error.errorFields) {
        // 表单验证错误,由 Ant Design 自动显示
        return;
      }
      message.error(`创建失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理取消
   */
  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  /**
   * 凭证示例
   */
  const getCredentialsExample = (platform) => {
    const examples = {
      douyin: JSON.stringify(
        {
          cookies: 'session_id=abc123; user_id=456',
          token: 'your_access_token',
        },
        null,
        2
      ),
    };

    return examples[platform] || '{}';
  };

  return (
    <Modal
      title="添加账户"
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={600}
      okText="创建"
      cancelText="取消"
    >
      <Form form={form} layout="vertical" initialValues={{ monitor_interval: 30 }}>
        <Form.Item
          label="平台"
          name="platform"
          rules={[{ required: true, message: '请选择平台' }]}
        >
          <Select placeholder="选择社交媒体平台">
            <Option value="douyin">抖音</Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="账户名称"
          name="account_name"
          rules={[
            { required: true, message: '请输入账户名称' },
            { min: 1, max: 50, message: '账户名称长度为1-50个字符' },
          ]}
        >
          <Input placeholder="输入便于识别的账户名称" />
        </Form.Item>

        <Form.Item
          label="账户ID"
          name="account_id"
          rules={[{ required: true, message: '请输入账户ID' }]}
          extra="社交媒体平台的唯一账户标识"
        >
          <Input placeholder="例如: dy123456" />
        </Form.Item>

        <Form.Item
          label="监控间隔(秒)"
          name="monitor_interval"
          rules={[
            { required: true, message: '请输入监控间隔' },
            { type: 'number', min: 10, max: 300, message: '监控间隔必须在10-300秒之间' },
          ]}
        >
          <InputNumber
            min={10}
            max={300}
            step={10}
            style={{ width: '100%' }}
            placeholder="30"
          />
        </Form.Item>

        <Form.Item
          label="账户凭证"
          name="credentials"
          rules={[{ required: true, message: '请输入账户凭证' }]}
          extra={
            <div style={{ marginTop: 8 }}>
              <div>请输入JSON格式的凭证信息</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                示例: {getCredentialsExample(form.getFieldValue('platform') || 'douyin')}
              </div>
            </div>
          }
        >
          <TextArea
            rows={6}
            placeholder={getCredentialsExample(form.getFieldValue('platform') || 'douyin')}
            style={{ fontFamily: 'monospace' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default AddAccountDialog;
