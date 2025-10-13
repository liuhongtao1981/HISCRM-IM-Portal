import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  UserOutlined,
  LoginOutlined,
  ClusterOutlined,
  GlobalOutlined,
  DashboardOutlined,
} from '@ant-design/icons';

// 页面组件
import Dashboard from './pages/Dashboard';
import AccountsPage from './pages/AccountsPage';
import LoginManagementPage from './pages/LoginManagementPage';
import WorkersPage from './pages/WorkersPage';
import ProxiesPage from './pages/ProxiesPage';

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
    key: '/accounts',
    icon: <UserOutlined />,
    label: '账户管理',
    path: '/accounts',
  },
  {
    key: '/login',
    icon: <LoginOutlined />,
    label: '登录管理',
    path: '/login',
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
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/login" element={<LoginManagementPage />} />
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
