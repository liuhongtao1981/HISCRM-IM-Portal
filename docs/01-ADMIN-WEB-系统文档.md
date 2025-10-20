# Admin-Web 系统完整文档

**版本**: 1.0.0
**日期**: 2025-10-18
**模块**: Admin Web 管理后台 (React + Ant Design)
**端口**: 3001

---

## 目录

1. [系统概述](#系统概述)
2. [架构设计](#架构设计)
3. [核心功能](#核心功能)
4. [项目结构](#项目结构)
5. [页面说明](#页面说明)
6. [Socket.IO 通信](#socketio-通信)
7. [API 调用](#api-调用)
8. [数据流](#数据流)
9. [状态管理](#状态管理)
10. [部署说明](#部署说明)

---

## 系统概述

### 职责定位

Admin-Web 是 HisCrm-IM 系统的**可视化管理后台**，提供以下功能：

- ✅ **账户管理** - 创建、编辑、删除社交媒体账户
- ✅ **登录管理** - 通过二维码扫码登录账户
- ✅ **Worker 管理** - 查看和管理 Worker 节点状态
- ✅ **消息查看** - 查看爬取的评论和私信
- ✅ **实时通知** - 接收爬虫检测到的新消息通知
- ✅ **代理配置** - 配置和管理代理服务器

### 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| Ant Design | 5.x | 组件库 |
| Socket.IO | 4.x | 实时通信 |
| Axios | 1.x | HTTP 请求 |
| React Router | 6.x | 路由管理 |
| Hooks | - | 状态管理 |

### 访问方式

- **开发环境**: `http://localhost:3001`
- **生产环境**: 通过 Electron 或 web server 部署

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────┐
│         Admin Web (React)                 │
│         (浏览器或 Electron)               │
├─────────────────────────────────────────┤
│                                           │
│  ┌────────────┐  ┌────────────┐         │
│  │  页面层    │  │  组件层    │         │
│  │(Pages)     │  │(Components)│         │
│  └──────┬─────┘  └──────┬─────┘         │
│         │                │                │
│  ┌──────▼────────────────▼────────┐    │
│  │      业务逻辑层                 │    │
│  │  (Services/Hooks)              │    │
│  ├──────┬──────────┬──────────┐   │    │
│  │Socket│API      │State    │   │    │
│  │Client│Service  │Manager   │   │    │
│  └──────┴──────────┴──────────┘   │    │
│                                    │    │
│  ┌────────────────────────────┐   │    │
│  │      通信层                 │   │    │
│  │  Socket.IO / HTTP           │   │    │
│  └────────────────────────────┘   │    │
│                                    │    │
└────────────┬───────────────────────┘    │
             │                             │
    ┌────────▼──────────┐                │
    │   Master Server    │                │
    │  (Node.js 3000)    │                │
    └────────────────────┘                │
```

### 目录结构

```
packages/admin-web/
├── src/
│   ├── index.js                    # 入口文件
│   ├── App.js                      # 主应用组件
│   ├── pages/                      # 页面组件
│   │   ├── AccountsPage.js         # 账户管理页面
│   │   ├── WorkersPage.js          # Worker 管理页面
│   │   ├── MessageManagementPage.js # 消息管理页面
│   │   ├── LoginManagementPage.js  # 登录管理页面
│   │   └── ProxiesPage.js          # 代理管理页面
│   ├── components/                 # 可复用组件
│   │   ├── LoginModal.js           # 登录弹窗
│   │   ├── QRCodeModal.js          # 二维码显示
│   │   ├── Sidebar.js              # 侧边栏
│   │   └── Header.js               # 头部
│   ├── services/                   # 业务逻辑
│   │   ├── socketContext.js        # Socket.IO 上下文
│   │   ├── api.js                  # HTTP API 调用
│   │   └── hooks.js                # 自定义 Hooks
│   ├── styles/                     # 样式文件
│   │   └── App.css                 # 全局样式
│   └── utils/                      # 工具函数
│       ├── logger.js               # 日志工具
│       └── validators.js           # 数据验证
├── public/
│   ├── index.html                  # HTML 入口
│   └── favicon.ico
├── package.json
└── .env                            # 环境变量
```

---

## 核心功能

### 1. 账户管理

**位置**: `pages/AccountsPage.js`

**功能**:
- 📋 显示所有账户列表（表格）
- ➕ 创建新账户（弹窗表单）
- ✏️ 编辑账户信息
- 🗑️ 删除账户
- 🔑 启动登录流程
- 👁️ 查看账户详情

**关键操作**:

```javascript
// 启动登录
const handleStartLogin = (account) => {
  startLogin(account.id, account.assigned_worker_id);
};

// 创建账户
const handleCreateAccount = (formData) => {
  api.createAccount(formData);
};

// 编辑账户
const handleEditAccount = (accountId, formData) => {
  api.updateAccount(accountId, formData);
};

// 删除账户
const handleDeleteAccount = (accountId) => {
  api.deleteAccount(accountId);
};
```

**表格列**:
| 列名 | 说明 | 来源 |
|------|------|------|
| ID | 账户 UUID | DB |
| 平台 | douyin/xiaohongshu | DB |
| 账户名称 | 用户定义的名称 | DB |
| 账户ID | 平台账户ID | DB |
| 用户信息 | 昵称+头像 | DB (user_info) |
| 登录状态 | 已登录/未登录等 | DB |
| Cookie 状态 | Cookie 数量和有效期 | DB |
| 分配 Worker | Worker ID | DB |
| 操作 | 登录/编辑/删除 | 按钮 |

---

### 2. 登录管理

**位置**: `pages/LoginManagementPage.js`

**功能**:
- 📜 显示登录会话列表
- 🔄 实时监控登录状态
- 🔲 自动弹出二维码
- ⏱️ 倒计时显示

**登录流程**:

```
1. 用户点击 [登录] 按钮
   ↓
2. 发送 Socket 事件: master:login:start
   {account_id, worker_id}
   ↓
3. Master 创建 login_sessions 记录
   ↓
4. Master 转发给 Worker
   ↓
5. Worker 启动浏览器，打开登录页
   ↓
6. Worker 提取二维码
   ↓
7. Worker 发送: worker:login:qrcode
   ↓
8. Master 转发给 Admin
   ↓
9. Admin 接收事件: login:qrcode:ready
   ↓
10. Admin 显示二维码弹窗（QRCodeModal）
    ↓
11. 用户使用手机扫码登录
    ↓
12. Worker 检测到登录成功
    ↓
13. Worker 保存 Cookie + 用户信息
    ↓
14. Worker 发送: worker:login:status (success)
    ↓
15. Master 更新数据库 + 转发给 Admin
    ↓
16. Admin 接收事件: login:success
    ↓
17. Admin 关闭弹窗，显示成功提示
```

**Socket.IO 事件**:

```javascript
// Admin → Master
socket.emit('master:login:start', {
  account_id: 'xxx',
  worker_id: 'worker-1'
});

// Master → Admin (接收二维码)
socket.on('login:qrcode:ready', (data) => {
  // data = {session_id, account_id, qr_code_data, expires_at}
  showQRCodeModal(data);
});

// Master → Admin (登录成功)
socket.on('login:success', (data) => {
  // data = {session_id, account_id, user_info, logged_in_at}
  message.success('登录成功！');
  closeQRCodeModal();
});

// Master → Admin (登录失败)
socket.on('login:failed', (data) => {
  // data = {session_id, error_message}
  message.error(data.error_message);
});
```

---

### 3. Worker 管理

**位置**: `pages/WorkersPage.js`

**功能**:
- 📊 显示所有 Worker 列表
- ✅ 查看 Worker 状态（在线/离线）
- 🎯 查看分配的账户数
- 📈 查看 Worker 统计信息

**表格列**:
| 列名 | 说明 | 来源 |
|------|------|------|
| Worker ID | 唯一标识 | DB |
| 地址 | host:port | DB |
| 状态 | connected/offline | DB |
| 分配账户数 | 当前分配数 | DB |
| 最后心跳 | 上次心跳时间 | DB |
| 启动时间 | Worker 启动时间 | DB |
| 版本 | Worker 版本号 | DB |

---

### 4. 消息管理

**位置**: `pages/MessageManagementPage.js`

**功能**:
- 💬 显示爬取的评论列表
- 💌 显示爬取的私信列表
- 🔍 搜索和筛选
- 📊 统计信息（总数、今日数）
- 🔄 自动刷新

**标签页**:

| 标签 | 数据源 | 功能 |
|------|--------|------|
| 评论 | comments 表 | 按账户、时间筛选 |
| 私信 | direct_messages 表 | 按账户、方向筛选 |

**筛选选项**:
- 消息类型（全部/今日）
- 账户选择
- 搜索内容
- 刷新间隔（10/30/60 秒）

---

### 5. 代理管理

**位置**: `pages/ProxiesPage.js`

**功能**:
- ➕ 添加代理服务器
- ✏️ 编辑代理配置
- 🗑️ 删除代理
- 🔍 查看代理状态

---

## 页面说明

### AccountsPage - 账户管理

```javascript
// 组件结构
<AccountsPage>
  ├── [表格] 账户列表
  │   ├── 列：ID, 平台, 账户名称, 用户信息, 登录状态, 操作
  │   └── 操作按钮：[登录] [编辑] [删除]
  │
  ├── [按钮] 新增账户
  │
  ├── [弹窗] 创建/编辑账户表单
  │   ├── 表单字段：
  │   │   - platform (select)
  │   │   - account_name (text)
  │   │   - account_id (text)
  │   │   - monitor_interval (number)
  │   └── 按钮：[提交] [取消]
  │
  ├── [组件] LoginModal - 登录弹窗
  │   └── 确认开始登录流程
  │
  └── [组件] QRCodeModal - 二维码弹窗
      ├── 二维码图片
      ├── 倒计时进度条
      └── 关闭按钮
```

**关键 Hooks**:

```javascript
// 获取账户列表
const { accounts, loading, error } = useAccounts();

// Socket 事件监听
const { qrCodeData, loginStatus } = useLoginContext();

// API 调用
const { createAccount, updateAccount, deleteAccount } = useAccountAPI();
```

---

### MessageManagementPage - 消息管理

```javascript
// 组件结构
<MessageManagementPage>
  ├── [卡片] 统计信息
  │   ├── 总评论数 (蓝色)
  │   ├── 今日评论数 (红色)
  │   ├── 总私信数 (绿色)
  │   └── 今日私信数 (红色)
  │
  ├── [工具栏] 筛选和刷新
  │   ├── 消息类型选择
  │   ├── 搜索框
  │   ├── 刷新间隔选择
  │   └── 手动刷新按钮
  │
  ├── [标签页] 评论 / 私信
  │   │
  │   ├── 评论标签页
  │   │   └── [表格] 评论列表
  │   │       ├── 列：时间, 账号, 内容, 发布者, 视频ID, 来源
  │   │       └── 今日行 → 红色背景
  │   │
  │   └── 私信标签页
  │       └── [表格] 私信列表
  │           ├── 列：时间, 账号, 内容, 发送者, 方向
  │           └── 今日行 → 红色背景
  │
  └── [定时器] 自动刷新
      └── 根据选择的间隔自动调用 API
```

---

## Socket.IO 通信

### 连接建立

```javascript
// services/socketContext.js
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  namespace: '/admin',
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

// 连接事件
socket.on('connect', () => {
  console.log('Connected to Master');
});

socket.on('disconnect', () => {
  console.log('Disconnected from Master');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

### 事件监听

**接收事件** (Master → Admin):

| 事件名 | 数据 | 触发时机 |
|--------|------|---------|
| `login:qrcode:ready` | {session_id, account_id, qr_code_data, expires_at} | Worker 提取二维码 |
| `login:success` | {session_id, account_id, user_info} | 登录成功 |
| `login:failed` | {session_id, error_message} | 登录失败 |
| `login:qrcode:expired` | {session_id} | 二维码过期（5分钟） |
| `notification:new` | {id, type, title, content, data} | 新通知 |

**发送事件** (Admin → Master):

| 事件名 | 数据 | 说明 |
|--------|------|------|
| `master:login:start` | {account_id, worker_id} | 启动登录 |
| `admin:request:login-sessions` | - | 请求登录会话列表 |

### Socket 上下文实现

```javascript
// services/socketContext.js
import React, { createContext, useEffect, useState, useCallback } from 'react';
import io from 'socket.io-client';

export const SocketContext = createContext();

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [qrCodeData, setQRCodeData] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const newSocket = io('http://localhost:3000/admin');

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('Connected');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected');
    });

    // 监听二维码事件
    newSocket.on('login:qrcode:ready', (data) => {
      setQRCodeData(data);
    });

    // 监听登录成功事件
    newSocket.on('login:success', (data) => {
      setQRCodeData(null);
    });

    // 监听通知事件
    newSocket.on('notification:new', (notification) => {
      setNotifications(prev => [notification, ...prev]);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  const startLogin = useCallback((accountId, workerId) => {
    if (socket) {
      socket.emit('master:login:start', {
        account_id: accountId,
        worker_id: workerId,
      });
    }
  }, [socket]);

  return (
    <SocketContext.Provider value={{
      socket,
      connected,
      qrCodeData,
      notifications,
      startLogin,
    }}>
      {children}
    </SocketContext.Provider>
  );
}
```

---

## API 调用

### HTTP API 端点

**基础 URL**: `http://localhost:3000/api/v1`

### 账户管理

```javascript
// GET - 获取账户列表
GET /api/v1/accounts
// Response: {success: true, accounts: [...]}

// POST - 创建账户
POST /api/v1/accounts
// Body: {platform, account_name, account_id, monitor_interval}
// Response: {success: true, account: {...}}

// PUT - 更新账户
PUT /api/v1/accounts/:id
// Body: {platform, account_name, account_id, monitor_interval}
// Response: {success: true, account: {...}}

// DELETE - 删除账户
DELETE /api/v1/accounts/:id
// Response: {success: true, deleted: true}
```

### Worker 管理

```javascript
// GET - 获取 Worker 列表
GET /api/v1/workers
// Response: {success: true, workers: [...]}

// GET - 获取 Worker 详情
GET /api/v1/workers/:id
// Response: {success: true, worker: {...}}
```

### 消息查询

```javascript
// GET - 获取评论列表
GET /api/v1/comments?limit=20&offset=0
// Response: {success: true, comments: [...], total: 100}

// GET - 获取私信列表
GET /api/v1/direct-messages?limit=20&offset=0
// Response: {success: true, messages: [...], total: 50}
```

### API 服务封装

```javascript
// services/api.js
const API_BASE_URL = 'http://localhost:3000/api/v1';

export const api = {
  // 账户 API
  accounts: {
    list: () => fetch(`${API_BASE_URL}/accounts`).then(r => r.json()),
    create: (data) => fetch(`${API_BASE_URL}/accounts`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    }).then(r => r.json()),
    update: (id, data) => fetch(`${API_BASE_URL}/accounts/${id}`, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    }).then(r => r.json()),
    delete: (id) => fetch(`${API_BASE_URL}/accounts/${id}`, {
      method: 'DELETE'
    }).then(r => r.json()),
  },

  // Worker API
  workers: {
    list: () => fetch(`${API_BASE_URL}/workers`).then(r => r.json()),
    get: (id) => fetch(`${API_BASE_URL}/workers/${id}`).then(r => r.json()),
  },

  // 消息 API
  messages: {
    comments: (limit = 20, offset = 0) =>
      fetch(`${API_BASE_URL}/comments?limit=${limit}&offset=${offset}`)
        .then(r => r.json()),
    directMessages: (limit = 20, offset = 0) =>
      fetch(`${API_BASE_URL}/direct-messages?limit=${limit}&offset=${offset}`)
        .then(r => r.json()),
  }
};
```

---

## 数据流

### 账户登录数据流

```
Admin Web                Master Server             Worker
    │                        │                      │
    │─────登录请求──────────>│                      │
    │ {account_id,          │                      │
    │  worker_id}           │                      │
    │                        │                      │
    │                        │──转发登录请求───────>│
    │                        │ {account_id,        │
    │                        │  session_id,        │
    │                        │  platform, proxy}   │
    │                        │                      │
    │                        │  <执行浏览器自动化>  │
    │                        │  <提取二维码>        │
    │                        │                      │
    │                        │<───发送二维码────────│
    │                        │ {qr_code_data}      │
    │                        │                      │
    │<───接收二维码信息──────│                      │
    │ 显示二维码弹窗         │                      │
    │                        │                      │
    │ [用户扫码]             │   <轮询登录状态>     │
    │                        │   <检测登录成功>     │
    │                        │   <保存 Cookie>     │
    │                        │                      │
    │                        │<─登录成功通知────────│
    │                        │ {cookies,           │
    │                        │  user_info,         │
    │                        │  fingerprint}       │
    │                        │                      │
    │<───登录成功信息────────│                      │
    │ 关闭二维码弹窗         │                      │
    │ 显示成功提示           │                      │
```

### 消息实时推送数据流

```
Worker                 Master               Admin Web
  │                       │                     │
  │─爬虫检测新消息─────>  │                     │
  │                       │                     │
  │                       │─保存到数据库        │
  │                       │                     │
  │                       │─推送通知事件──────>│
  │                       │ {type, title,      │
  │                       │  content, data}    │
  │                       │                     │
  │                       │                   显示 Toast
  │                       │                   更新列表
```

---

## 状态管理

### 全局状态

```javascript
// SocketContext - Socket 连接和事件
{
  socket: SocketIOClient,
  connected: boolean,
  qrCodeData: {session_id, account_id, qr_code_data, expires_at} | null,
  notifications: [],
  startLogin: (accountId, workerId) => void,
}

// UI 状态（各页面独立管理）
{
  loading: boolean,
  error: string | null,
  data: any[],
  filters: {},
  pagination: {current, pageSize, total},
}
```

### 自定义 Hooks

```javascript
// 获取账户列表
export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const result = await api.accounts.list();
      setAccounts(result.accounts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { accounts, loading, error, refetch: fetchAccounts };
}

// 监听 Socket 事件
export function useSocketListener(eventName, callback) {
  const { socket } = useContext(SocketContext);

  useEffect(() => {
    if (!socket) return;
    socket.on(eventName, callback);
    return () => socket.off(eventName, callback);
  }, [socket, eventName, callback]);
}
```

---

## 部署说明

### 开发环境

```bash
# 安装依赖
cd packages/admin-web
npm install

# 启动开发服务器
npm start
# 访问 http://localhost:3001

# 构建生产版本
npm run build
```

### 生产环境

```bash
# Electron 打包
npm run build
npm run electron-build

# Web 部署
npm run build
# 将 build/ 目录部署到 Web 服务器
```

### 环境变量

```bash
# .env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_SOCKET_URL=http://localhost:3000
```

---

## 常见问题

### Q1: 连接不到 Master
**A**: 检查 Master 是否运行在 port 3000，确保网络连接正常

### Q2: 二维码不显示
**A**: 检查 Worker 是否成功启动浏览器，查看 Worker 日志

### Q3: 登录后仍显示未登录
**A**: 检查 Cookie 是否正确保存，Master 是否更新了账户状态

---

**文档版本**: 1.0.0
**最后更新**: 2025-10-18
**维护者**: 开发团队
