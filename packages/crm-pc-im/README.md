# CRM PC IM - 即时通讯客户端

基于 Electron + Vite + React + TypeScript 的桌面即时通讯客户端，专为 CRM 系统设计。

## ✨ 功能特性

- 🔐 用户登录认证（Mock 数据）
- 👥 好友列表管理
- 💬 实时聊天消息
- 📌 消息主题分类
- 🔔 新消息头像闪动提示
- 💾 文件传输支持
- 🟢 在线/离线状态显示
- ⚡ 基于 Vite 的快速开发体验

## 🛠 技术栈

- **桌面框架**: Electron 28
- **前端框架**: React 18 + TypeScript 5
- **构建工具**: Vite 5
- **状态管理**: Redux Toolkit
- **UI 组件**: Ant Design 5
- **实时通信**: Socket.io Client 4

## 📂 项目结构

```
crm-pc-im/
├── electron/                      # Electron 主进程
│   ├── main.ts                    # 主进程入口
│   └── preload.ts                 # Preload 脚本
├── src/
│   ├── components/                # React 组件
│   │   ├── FriendList.tsx         # 好友列表
│   │   ├── ChatWindow.tsx         # 聊天窗口
│   │   └── MessageItem.tsx        # 消息项
│   ├── pages/                     # 页面
│   │   ├── LoginPage.tsx          # 登录页
│   │   └── MainPage.tsx           # 主页
│   ├── services/                  # 服务层
│   │   ├── mock.ts                # Mock 数据
│   │   └── websocket.ts           # WebSocket 服务
│   ├── store/                     # Redux store
│   │   ├── userSlice.ts           # 用户状态
│   │   ├── chatSlice.ts           # 聊天状态
│   │   └── index.ts               # Store 配置
│   ├── shared/                    # 共享代码
│   │   ├── types.ts               # 类型定义
│   │   └── constants.ts           # 常量
│   ├── App.tsx                    # 主应用组件
│   └── main.tsx                   # 入口文件
├── index.html                     # HTML 模板
├── vite.config.ts                 # Vite 配置
├── tsconfig.json                  # TypeScript 配置
└── package.json                   # 项目配置
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式运行

```bash
npm run dev                 # 启动 Vite 开发服务器
```

在另一个终端窗口：

```bash
npm run electron:dev        # 启动 Electron（会自动等待 Vite 服务器启动）
```

### 3. 构建打包

```bash
npm run electron:build      # 构建并打包应用
```

## 📋 主要功能说明

### 登录页面
- Mock 数据登录（用户名/密码: demo/demo）
- WebSocket 服务器地址配置

### 主界面
- **左侧**: 好友列表
  - 显示好友头像和在线状态
  - 按好友分组展示会话主题
  - 新消息时头像闪动提示
  - 未读消息数量显示
- **右侧**: 聊天窗口
  - 按主题分类显示消息
  - 支持文本和文件消息
  - 实时消息发送和接收

### 消息主题
- 每个好友可以有多个会话主题
- 主题由服务器推送指定
- 点击主题查看对应的消息历史

### 文件下载
- 文件自动下载到用户数据目录的 `download` 文件夹
- 支持点击打开下载的文件

## ⚙️ 配置说明

### WebSocket 连接
在登录页面点击"连接设置"可以配置 WebSocket 服务器地址：
- 默认地址: `ws://localhost:8080`
- 地址会保存到本地配置文件

### 开发环境
- Vite 开发服务器运行在 `http://localhost:5173`
- Electron 会自动连接到开发服务器
- 支持热更新（HMR）

## 🔧 常见问题

### Q: 如何修改 WebSocket 连接地址？
A: 登录页面 → 连接设置 → 输入新的 WebSocket 地址 → 保存

### Q: 文件下载到哪里？
A: Windows: `%APPDATA%/crm-pc-im/download`
   macOS: `~/Library/Application Support/crm-pc-im/download`
   Linux: `~/.config/crm-pc-im/download`

### Q: 如何切换用户？
A: 点击左侧边栏底部的"退出登录"按钮

### Q: 开发模式下如何打开开发者工具？
A: 开发模式会自动打开，或按 F12

## 📝 开发建议

1. **类型安全**: 充分利用 TypeScript 类型系统
2. **状态管理**: 通过 Redux 管理全局状态
3. **模块化**: 组件和服务层分离
4. **Mock 数据**: 开发阶段使用 Mock 数据，便于调试

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 📧 联系方式

如有问题或建议，请提交 Issue。
