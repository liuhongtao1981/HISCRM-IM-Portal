import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { message } from 'antd';

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context.socket; // 直接返回 socket 实例而不是整个 context
};

// 导出完整的 context hook (用于需要访问其他状态的组件)
export const useSocketContext = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [systemStatus, setSystemStatus] = useState(null);
  const [loginSessions, setLoginSessions] = useState([]);
  const [qrCodeData, setQRCodeData] = useState(null);
  const [loginModalData, setLoginModalData] = useState({ visible: false }); // 新增：统一登录模态框数据

  // 连接 Socket.IO
  useEffect(() => {
    const MASTER_URL = process.env.REACT_APP_MASTER_URL || 'http://localhost:3000';

    const socketInstance = io(`${MASTER_URL}/admin`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    // 连接成功
    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setConnected(true);
      message.success('已连接到服务器');

      // 发送认证（简单认证）
      socketInstance.emit('admin:auth', {
        token: 'admin-token', // TODO: 使用真实的认证令牌
        userId: 'admin',
      });
    });

    // 连接断开
    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
      message.warning('与服务器断开连接');
    });

    // 认证成功
    socketInstance.on('admin:auth:success', (data) => {
      console.log('Auth success:', data);
      message.success('认证成功');
    });

    // 认证失败
    socketInstance.on('admin:auth:failed', (data) => {
      console.log('Auth failed:', data);
      message.error('认证失败: ' + data.error);
    });

    // 系统状态响应
    socketInstance.on('admin:status:response', (data) => {
      console.log('System status:', data);
      setSystemStatus(data);
    });

    // 登录会话列表响应
    socketInstance.on('admin:login_sessions:list:response', (data) => {
      console.log('Login sessions:', data);
      setLoginSessions(data.sessions || []);
    });

    // 新框架：统一登录状态更新事件
    socketInstance.on('login:status:update', (data) => {
      console.log('=== Login status update received ===');
      console.log('Full data:', JSON.stringify(data, null, 2));
      const { session_id, status, account_id, ...extraData } = data;
      console.log('Parsed - session_id:', session_id, 'status:', status, 'account_id:', account_id);
      console.log('Extra data:', extraData);

      switch (status) {
        case 'qrcode_ready':
          // 二维码已准备
          console.log('Setting QR code modal data:', {
            qr_code_data: extraData.qr_code_data ? 'PRESENT' : 'MISSING',
            expires_at: extraData.expires_at,
          });
          setLoginModalData(prev => ({
            ...prev,  // 保留之前设置的账号和 Worker 信息
            visible: true,
            session_id,
            account_id,
            login_method: 'qrcode',
            qr_code_data: extraData.qr_code_data,
            expires_at: extraData.expires_at,
          }));
          message.success('二维码已加载，请使用抖音 App 扫码');
          break;

        case 'qrcode_refreshed':
          // 二维码已刷新（自动更新）
          console.log('QR code refreshed, updating modal data:', {
            qr_code_data: extraData.qr_code_data ? 'PRESENT' : 'MISSING',
          });
          setLoginModalData(prev => ({
            ...prev,
            qr_code_data: extraData.qr_code_data,
            expires_at: extraData.expires_at,
          }));
          message.info('二维码已自动刷新');
          break;

        case 'sms_input_required':
          // 需要用户输入（手机号或验证码）
          setLoginModalData(prev => ({
            ...prev,  // 保留之前设置的账号和 Worker 信息
            visible: true,
            session_id,
            account_id,
            login_method: 'sms',
            step: extraData.step, // 'phone_number' | 'verification_code'
            message: extraData.message,
            phone_number: extraData.phone_number,
          }));
          if (extraData.step === 'phone_number') {
            message.info('请输入手机号');
          } else if (extraData.step === 'verification_code') {
            message.info('请输入验证码');
          }
          break;

        case 'scanning':
          // 正在扫码中
          message.info('正在扫码中，请在手机上确认登录');
          break;

        case 'success':
          // 登录成功
          message.success(`账户 ${account_id} 登录成功！`);
          setLoginModalData({ visible: false });
          setQRCodeData(null);
          // 刷新登录会话列表
          if (socketInstance) {
            socketInstance.emit('admin:login_sessions:list');
          }
          break;

        case 'failed':
          // 登录失败
          message.error(`登录失败: ${extraData.error_message || '未知错误'}`);
          setLoginModalData({ visible: false });
          setQRCodeData(null);
          break;

        case 'timeout':
          // 登录超时
          message.warning('登录超时，请重试');
          setLoginModalData({ visible: false });
          setQRCodeData(null);
          break;

        case 'expired':
          // 二维码过期
          message.warning('二维码已过期，请关闭窗口重新登录');
          break;

        default:
          console.log('Unknown login status:', status);
      }
    });

    // 保持兼容：旧的 QR 码事件
    socketInstance.on('login:qrcode:ready', (data) => {
      console.log('QR code ready (legacy):', data);
      setQRCodeData(data);
    });

    // 保持兼容：旧的登录成功事件
    socketInstance.on('login:success', (data) => {
      console.log('Login success (legacy):', data);
      setQRCodeData(null);
    });

    // 保持兼容：旧的登录失败事件
    socketInstance.on('login:failed', (data) => {
      console.log('Login failed (legacy):', data);
      setQRCodeData(null);
    });

    // 保持兼容：旧的 QR 码过期事件
    socketInstance.on('login:qrcode:expired', (data) => {
      console.log('QR code expired (legacy):', data);
      setQRCodeData(null);
    });

    // 错误处理
    socketInstance.on('admin:error', (data) => {
      console.error('Admin error:', data);
      message.error('错误: ' + data.error);
    });

    // 通知推送
    socketInstance.on('notification:new', (notification) => {
      console.log('🔔 New notification received:', notification);

      // 根据通知类型显示不同的消息
      if (notification.type === 'comment') {
        message.info({
          content: `💬 新评论: ${notification.content?.substring(0, 50) || '无内容'}`,
          duration: 5,
        });
      } else if (notification.type === 'direct_message') {
        message.info({
          content: `📩 新私信: ${notification.content?.substring(0, 50) || '无内容'}`,
          duration: 5,
        });
      } else if (notification.type === 'system') {
        message.success({
          content: notification.content || '系统通知',
          duration: 5,
        });
      } else {
        message.info({
          content: `🔔 新通知: ${notification.type}`,
          duration: 5,
        });
      }
    });

    setSocket(socketInstance);

    // 清理
    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // 请求系统状态
  const requestSystemStatus = useCallback(() => {
    if (socket) {
      socket.emit('admin:status:request');
    }
  }, [socket]);

  // 请求登录会话列表
  const requestLoginSessions = useCallback(() => {
    if (socket) {
      socket.emit('admin:login_sessions:list');
    }
  }, [socket]);

  // 启动登录流程
  const startLogin = useCallback((accountId, workerId, accountInfo = {}) => {
    if (socket) {
      // 创建会话ID
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 发送登录启动请求到 Worker
      socket.emit('master:login:start', {
        account_id: accountId,
        worker_id: workerId,
        session_id: sessionId,
      });

      // 预设登录模态框数据（包含账号和 Worker 信息）
      setLoginModalData(prev => ({
        ...prev,
        visible: true,
        session_id: sessionId,
        account_id: accountId,
        worker_id: workerId,
        account_name: accountInfo.account_name,
        platform: accountInfo.platform,
        worker_host: accountInfo.worker_host,
        worker_port: accountInfo.worker_port,
      }));

      message.info('正在启动登录流程...');
      return sessionId;
    }
    return null;
  }, [socket]);

  // 提交用户输入（手机号、验证码）
  const submitUserInput = useCallback((sessionId, inputType, value) => {
    if (socket) {
      socket.emit('master:login:user_input', {
        session_id: sessionId,
        input_type: inputType, // 'phone_number' | 'verification_code'
        value: value,
      });

      console.log(`Submitted user input: ${inputType} for session ${sessionId}`);
    }
  }, [socket]);

  // 关闭登录模态框
  const closeLoginModal = useCallback(() => {
    setLoginModalData({ visible: false });
  }, []);

  const value = {
    socket,
    connected,
    systemStatus,
    loginSessions,
    qrCodeData,
    loginModalData, // 新增
    requestSystemStatus,
    requestLoginSessions,
    startLogin,
    submitUserInput, // 新增
    closeLoginModal, // 新增
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
