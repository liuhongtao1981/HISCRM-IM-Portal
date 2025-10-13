/**
 * React 应用主组件
 */

import React, { useEffect } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AccountsPage from './pages/AccountsPage';
import socketService from './services/socket-service';

function App() {
  // 建立 Socket.IO 连接
  useEffect(() => {
    socketService.connect();

    return () => {
      socketService.disconnect();
    };
  }, []);

  return (
    <ConfigProvider locale={zhCN}>
      <div className="app">
        <AccountsPage />
      </div>
    </ConfigProvider>
  );
}

export default App;
