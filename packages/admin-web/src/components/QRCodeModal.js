import React, { useEffect, useState } from 'react';
import { Modal, Image, Spin, Alert, Space, Typography, Progress } from 'antd';
import dayjs from 'dayjs';

const { Text } = Typography;

const QRCodeModal = ({ visible, onClose, qrCodeData }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!qrCodeData || !visible) {
      setTimeLeft(0);
      setProgress(100);
      return;
    }

    // 计算剩余时间
    const expiresAt = qrCodeData.expires_at * 1000; // 转换为毫秒
    const now = Date.now();
    const remaining = Math.max(0, expiresAt - now);

    setTimeLeft(Math.floor(remaining / 1000));

    // 设置定时器更新倒计时
    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, expiresAt - now);
      const seconds = Math.floor(remaining / 1000);

      setTimeLeft(seconds);

      // 计算进度百分比（假设总时长为 5 分钟 = 300 秒）
      const totalDuration = 300;
      const progressPercent = Math.floor((seconds / totalDuration) * 100);
      setProgress(progressPercent);

      if (seconds <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [qrCodeData, visible]);

  // 格式化时间
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 进度条颜色
  const getProgressColor = () => {
    if (timeLeft > 180) return '#52c41a'; // 绿色
    if (timeLeft > 60) return '#faad14'; // 橙色
    return '#f5222d'; // 红色
  };

  return (
    <Modal
      title="扫描二维码登录"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
      centered
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {qrCodeData ? (
          <>
            <div style={{ textAlign: 'center' }}>
              {qrCodeData.qr_code_data ? (
                <Image
                  src={qrCodeData.qr_code_data}
                  alt="QR Code"
                  style={{ maxWidth: '300px', border: '1px solid #d9d9d9', borderRadius: '4px' }}
                  preview={false}
                />
              ) : (
                <Spin tip="正在加载二维码..." />
              )}
            </div>

            <Alert
              message="请使用抖音 App 扫描二维码"
              description="打开抖音，点击右上角扫一扫，扫描上方二维码完成登录"
              type="info"
              showIcon
            />

            <div>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">剩余时间:</Text>
                  <Text strong>{formatTime(timeLeft)}</Text>
                </div>

                <Progress
                  percent={progress}
                  strokeColor={getProgressColor()}
                  showInfo={false}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">账户 ID:</Text>
                  <Text code>{qrCodeData.account_id}</Text>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">Worker ID:</Text>
                  <Text code>{qrCodeData.worker_id}</Text>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary">会话 ID:</Text>
                  <Text code>{qrCodeData.session_id}</Text>
                </div>
              </Space>
            </div>

            {timeLeft <= 0 && (
              <Alert
                message="二维码已过期"
                description="请关闭此窗口并重新启动登录流程"
                type="error"
                showIcon
              />
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin tip="正在启动登录流程..." />
          </div>
        )}
      </Space>
    </Modal>
  );
};

export default QRCodeModal;
