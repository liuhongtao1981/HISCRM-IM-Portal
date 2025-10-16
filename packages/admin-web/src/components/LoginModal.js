import React, { useState, useEffect } from 'react';
import { Modal, Image, Input, Button, Form, Typography, Space, Progress, Alert, Statistic } from 'antd';
import { QrcodeOutlined, MobileOutlined, ClockCircleOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;
const { Countdown } = Statistic;

/**
 * 统一登录模态框
 * 支持二维码登录和手机短信验证登录
 */
const LoginModal = ({ visible, onCancel, loginData, onSubmitInput }) => {
  const [phoneForm] = Form.useForm();
  const [codeForm] = Form.useForm();
  const [timeLeft, setTimeLeft] = useState(300); // 5分钟倒计时

  const {
    login_method,
    step,
    qr_code_data,
    expires_at,
    message,
    phone_number,
    session_id,
    account_id,
  } = loginData || {};

  // 倒计时逻辑
  useEffect(() => {
    if (visible && expires_at) {
      const updateCountdown = () => {
        const now = Math.floor(Date.now() / 1000);
        const remaining = expires_at - now;
        setTimeLeft(remaining > 0 ? remaining : 0);
      };

      updateCountdown();
      const timer = setInterval(updateCountdown, 1000);

      return () => clearInterval(timer);
    }
  }, [visible, expires_at]);

  // 进度条颜色
  const getProgressColor = () => {
    const percentage = (timeLeft / 300) * 100;
    if (percentage > 50) return '#52c41a';
    if (percentage > 20) return '#faad14';
    return '#f5222d';
  };

  // 处理手机号提交
  const handlePhoneSubmit = (values) => {
    if (onSubmitInput) {
      onSubmitInput(session_id, 'phone_number', values.phone);
      phoneForm.resetFields();
    }
  };

  // 处理验证码提交
  const handleCodeSubmit = (values) => {
    if (onSubmitInput) {
      onSubmitInput(session_id, 'verification_code', values.code);
      codeForm.resetFields();
    }
  };

  // 二维码登录界面
  if (login_method === 'qrcode') {
    return (
      <Modal
        visible={visible}
        onCancel={onCancel}
        footer={null}
        width={440}
        centered
        title={
          <Space>
            <QrcodeOutlined style={{ fontSize: 20, color: '#1890ff' }} />
            <span>扫码登录抖音账户</span>
          </Space>
        }
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          {/* 二维码图片 */}
          <div style={{ 
            display: 'inline-block',
            padding: 16,
            background: '#f5f5f5',
            borderRadius: 8,
            marginBottom: 20
          }}>
            <Image
              src={qr_code_data}
              alt="登录二维码"
              width={280}
              height={280}
              preview={false}
              style={{ display: 'block' }}
            />
          </div>

          {/* 提示文字 */}
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              message="请使用抖音 App 扫描二维码登录"
              type="info"
              showIcon
              style={{ marginBottom: 8 }}
            />

            {/* 倒计时 */}
            {expires_at && timeLeft > 0 && (
              <div>
                <Space>
                  <ClockCircleOutlined />
                  <Text type="secondary">
                    二维码有效期：{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                  </Text>
                </Space>
                <Progress
                  percent={(timeLeft / 300) * 100}
                  strokeColor={getProgressColor()}
                  showInfo={false}
                  style={{ marginTop: 8 }}
                />
              </div>
            )}

            {/* 过期提示 */}
            {timeLeft === 0 && (
              <Alert
                message="二维码已过期"
                description="请关闭此窗口并重新登录"
                type="warning"
                showIcon
              />
            )}
          </Space>
        </div>
      </Modal>
    );
  }

  // 手机短信验证登录界面
  if (login_method === 'sms') {
    // 步骤1: 输入手机号
    if (step === 'phone_number') {
      return (
        <Modal
          visible={visible}
          onCancel={onCancel}
          footer={null}
          width={440}
          centered
          title={
            <Space>
              <MobileOutlined style={{ fontSize: 20, color: '#1890ff' }} />
              <span>手机号登录</span>
            </Space>
          }
        >
          <div style={{ padding: '20px 0' }}>
            <Alert
              message="请输入抖音账户绑定的手机号"
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />

            <Form
              form={phoneForm}
              onFinish={handlePhoneSubmit}
              layout="vertical"
            >
              <Form.Item
                name="phone"
                label="手机号"
                rules={[
                  { required: true, message: '请输入手机号' },
                  { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' }
                ]}
              >
                <Input
                  placeholder="请输入手机号"
                  size="large"
                  prefix={<MobileOutlined />}
                  maxLength={11}
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                >
                  获取验证码
                </Button>
              </Form.Item>
            </Form>

            {message && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {message}
              </Text>
            )}
          </div>
        </Modal>
      );
    }

    // 步骤2: 输入验证码
    if (step === 'verification_code') {
      return (
        <Modal
          visible={visible}
          onCancel={onCancel}
          footer={null}
          width={440}
          centered
          title={
            <Space>
              <MobileOutlined style={{ fontSize: 20, color: '#1890ff' }} />
              <span>输入验证码</span>
            </Space>
          }
        >
          <div style={{ padding: '20px 0' }}>
            <Alert
              message={`验证码已发送至 ${phone_number || '您的手机'}`}
              description="请在2分钟内输入验证码"
              type="success"
              showIcon
              style={{ marginBottom: 24 }}
            />

            <Form
              form={codeForm}
              onFinish={handleCodeSubmit}
              layout="vertical"
            >
              <Form.Item
                name="code"
                label="验证码"
                rules={[
                  { required: true, message: '请输入验证码' },
                  { pattern: /^\d{4,6}$/, message: '请输入4-6位数字验证码' }
                ]}
              >
                <Input
                  placeholder="请输入验证码"
                  size="large"
                  maxLength={6}
                  autoFocus
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                >
                  登录
                </Button>
              </Form.Item>
            </Form>

            {message && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {message}
              </Text>
            )}
          </div>
        </Modal>
      );
    }
  }

  // 未知状态或加载中
  return (
    <Modal
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={440}
      centered
      title="正在加载..."
    >
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Text type="secondary">正在初始化登录流程...</Text>
      </div>
    </Modal>
  );
};

export default LoginModal;
