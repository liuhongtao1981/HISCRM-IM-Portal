import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  UserOutlined,
  ClusterOutlined,
  GlobalOutlined,
  DashboardOutlined,
  MonitorOutlined,
} from '@ant-design/icons';

// 页面组件
import Dashboard from './pages/Dashboard';
import AccountsPage from './pages/AccountsPage';
import WorkersPage from './pages/WorkersPage';
import ProxiesPage from './pages/ProxiesPage';
import AccountStatusPage from './pages/AccountStatusPage';

// WebSocket Provider
import { SocketProvider } from './services/socketContext';

const { Header, Sider, Content } = Layout;

// 菜单项配置
const menuItems = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: '仪表板',
    path: '/',
  },
  {
    key: '/account-status',
    icon: <MonitorOutlined />,
    label: '账号监控',
    path: '/account-status',
  },
  {
    key: '/workers',
    icon: <ClusterOutlined />,
    label: 'Worker 管理',
    path: '/workers',
  },
  {
    key: '/proxies',
    icon: <GlobalOutlined />,
    label: '代理管理',
    path: '/proxies',
  },
  {
    key: '/accounts',
    icon: <UserOutlined />,
    label: '账号管理',
    path: '/accounts',
  },
];

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // 将菜单项转换为 Ant Design Menu 所需的格式
  const menuItemsForAntd = menuItems.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: <Link to={item.path}>{item.label}</Link>,
  }));

  return (
    <SocketProvider>
      <Layout className="app-layout">
        <Header className="app-header">
          <div className="app-logo">HisCRM-IM 管理平台</div>
          <div>欢迎使用</div>
        </Header>
        <Layout>
          <Sider
            className="app-sider"
            collapsible
            collapsed={collapsed}
            onCollapse={(value) => setCollapsed(value)}
          >
            <Menu
              theme="light"
              mode="inline"
              selectedKeys={[location.pathname]}
              items={menuItemsForAntd}
            />
          </Sider>
          <Layout>
            <Content className="app-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/account-status" element={<AccountStatusPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/workers" element={<WorkersPage />} />
                <Route path="/proxies" element={<ProxiesPage />} />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </SocketProvider>
  );
}

export default App;
