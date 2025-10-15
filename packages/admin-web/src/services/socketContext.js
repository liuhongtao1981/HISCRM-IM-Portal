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

    // QR 码准备就绪
    socketInstance.on('login:qrcode:ready', (data) => {
      console.log('QR code ready:', data);
      setQRCodeData(data);
      message.success(`账户 ${data.account_id} 的 QR 码已准备就绪`);
    });

    // 登录成功
    socketInstance.on('login:success', (data) => {
      console.log('Login success:', data);
      message.success(`账户 ${data.account_id} 登录成功`);
      setQRCodeData(null);
    });

    // 登录失败
    socketInstance.on('login:failed', (data) => {
      console.log('Login failed:', data);
      message.error(`账户 ${data.account_id} 登录失败: ${data.error_message}`);
      setQRCodeData(null);
    });

    // QR 码过期
    socketInstance.on('login:qrcode:expired', (data) => {
      console.log('QR code expired:', data);
      message.warning(`账户 ${data.account_id} 的 QR 码已过期`);
      setQRCodeData(null);
    });

    // 错误处理
    socketInstance.on('admin:error', (data) => {
      console.error('Admin error:', data);
      message.error('错误: ' + data.error);
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
  const startLogin = useCallback((accountId, workerId) => {
    if (socket) {
      // 创建会话ID
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 发送登录启动请求到 Worker
      socket.emit('master:login:start', {
        account_id: accountId,
        worker_id: workerId,
        session_id: sessionId,
      });

      message.info('正在启动登录流程...');
      return sessionId;
    }
    return null;
  }, [socket]);

  const value = {
    socket,
    connected,
    systemStatus,
    loginSessions,
    qrCodeData,
    requestSystemStatus,
    requestLoginSessions,
    startLogin,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
