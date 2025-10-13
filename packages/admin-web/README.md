# HisCRM-IM 管理平台 Web UI

管理平台前端应用，用于管理账户、登录、Workers 和代理。

## 功能特性

- ✅ **仪表板**: 系统状态总览
- ✅ **账户管理**: 创建、编辑、删除账户，启动登录流程
- ✅ **登录管理**: 查看登录会话，实时显示 QR 码
- ✅ **Worker 管理**: 查看 Worker 状态和分配情况
- ✅ **代理管理**: 管理代理配置和测试
- ✅ **WebSocket 实时通信**: 自动接收 QR 码和登录状态更新

## 技术栈

- React 18
- React Router 6
- Ant Design 5
- Socket.IO Client
- Axios
- Day.js

## 安装依赖

```bash
cd packages/admin-web
npm install
```

## 开发运行

```bash
npm start
```

应用将在 http://localhost:3001 启动（默认端口）。

## 构建生产版本

```bash
npm run build
```

构建输出在 `build/` 目录。

## 环境变量

创建 `.env` 文件：

```bash
cp .env.example .env
```

可配置变量：
- `REACT_APP_API_URL`: Master API 基础 URL（默认: /api/v1）
- `REACT_APP_MASTER_URL`: Master WebSocket URL（默认: http://localhost:3000）

## 目录结构

```
src/
├── pages/              # 页面组件
│   ├── Dashboard.js
│   ├── AccountsPage.js
│   ├── LoginManagementPage.js
│   ├── WorkersPage.js
│   └── ProxiesPage.js
├── components/         # 可复用组件
│   └── QRCodeModal.js
├── services/           # 服务层
│   ├── api.js          # REST API
│   └── socketContext.js # WebSocket 上下文
├── App.js              # 主应用组件
├── index.js            # 入口文件
└── index.css           # 全局样式
```

## 主要功能

### 1. 账户管理

- 创建新账户
- 编辑账户信息
- 删除账户
- 启动登录流程（触发 QR 码生成）

### 2. 登录管理

- 实时显示登录会话列表
- 自动弹出 QR 码模态框
- 倒计时显示 QR 码有效期
- 登录状态实时更新

### 3. QR 码模态框

- 显示 Base64 编码的 QR 码图片
- 倒计时进度条
- 自动处理过期状态
- 显示会话详细信息

### 4. Worker 管理

- 查看 Worker 列表和状态
- 显示分配的账户数
- 统计在线/离线 Workers

### 5. 代理管理

- 添加/编辑/删除代理
- 测试代理连接
- 查看代理成功率

## WebSocket 事件

### 监听事件

- `admin:connected`: 连接成功
- `admin:auth:success/failed`: 认证结果
- `admin:status:response`: 系统状态响应
- `login:qrcode:ready`: QR 码准备就绪
- `login:success`: 登录成功
- `login:failed`: 登录失败
- `login:qrcode:expired`: QR 码过期

### 发送事件

- `admin:auth`: 发送认证请求
- `admin:status:request`: 请求系统状态
- `admin:login_sessions:list`: 请求登录会话列表
- `master:login:start`: 启动登录流程

## API 端点

所有 API 请求通过 `/api/v1` 前缀：

- `GET /api/v1/accounts` - 获取账户列表
- `POST /api/v1/accounts` - 创建账户
- `PUT /api/v1/accounts/:id` - 更新账户
- `DELETE /api/v1/accounts/:id` - 删除账户
- `GET /api/v1/workers` - 获取 Workers 列表
- `GET /api/v1/proxies` - 获取代理列表
- `POST /api/v1/proxies` - 创建代理
- `PUT /api/v1/proxies/:id` - 更新代理
- `DELETE /api/v1/proxies/:id` - 删除代理

## 注意事项

1. 确保 Master 服务器在 http://localhost:3000 运行
2. WebSocket 连接使用 `/admin` namespace
3. 开发环境通过 package.json 的 `proxy` 配置转发 API 请求
4. 生产环境需要配置 Nginx 或其他反向代理

## License

MIT
