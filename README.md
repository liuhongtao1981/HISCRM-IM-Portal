# HisCrm-IM - 社交媒体账户监控与通知系统

> 基于Master-Worker架构的多平台社交媒体监控系统

## 🎯 功能特性

- ✅ **账户管理**: 支持多个社交媒体账户(抖音)的集中管理
- ✅ **实时监控**: 30秒周期自动监控评论和私信
- ✅ **多端通知**: 桌面和移动客户端实时通知推送
- ✅ **历史记录**: 30天历史消息查询和统计分析
- ✅ **通知规则**: 支持关键词过滤、免打扰时段等自定义规则
- ✅ **高可用性**: Worker故障自动恢复,任务无缝迁移

## 🏗️ 架构设计

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   桌面客户端   │────▶│    主控服务    │◀────│  Worker节点  │
│   (Electron) │     │   (Master)   │     │  (Crawler)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                     │
       │                   │                     │
   WebSocket           SQLite              平台API/抓取
```

**技术栈**:
- **Runtime**: Node.js 18.x LTS
- **通信**: Socket.IO 4.x (WebSocket + JSON)
- **数据库**: SQLite 3.x (better-sqlite3)
- **桌面客户端**: Electron 28.x + React 18.x + Ant Design
- **移动客户端**: React Native 0.73.x + React Native Paper
- **进程管理**: PM2 / child_process
- **测试**: Jest 29.x + Supertest + Playwright

## 📦 项目结构

```
packages/
├── master/          # 主控服务(任务调度、Worker管理、客户端通信)
├── worker/          # Worker进程(抖音监控执行器)
├── shared/          # 共享代码(协议定义、模型、工具函数)
├── desktop-client/  # Electron桌面客户端
├── mobile-client/   # React Native移动客户端
└── tests/           # 跨包集成测试
```

## 🚀 快速开始

### 前置条件

- Node.js 18.x LTS
- pnpm 8.x+

### 安装

```bash
# 1. 克隆仓库
git clone <repository_url>
cd hiscrm-im

# 2. 安装依赖
npm install -g pnpm
pnpm install

# 3. 初始化数据库
cd packages/master
npm run db:init

# 4. 配置环境变量
cp .env.example .env
# 编辑.env设置加密密钥等配置
```

### 开发模式

```bash
# 启动主控服务
pnpm dev:master

# 启动Worker进程(另一个终端)
pnpm dev:worker

# 启动桌面客户端(另一个终端)
pnpm dev:desktop
```

### 生产部署

```bash
# 使用PM2启动主控(会自动管理Worker)
pm2 start packages/master/src/index.js --name hiscrm-master

# 打包桌面客户端
pnpm --filter @hiscrm-im/desktop-client build
```

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 运行单个包的测试
pnpm --filter @hiscrm-im/master test

# 生成覆盖率报告
pnpm test -- --coverage
```

## 📖 文档

- [功能规格](./specs/001-worker/spec.md)
- [实施计划](./specs/001-worker/plan.md)
- [数据模型](./specs/001-worker/data-model.md)
- [API契约](./specs/001-worker/contracts/)
- [快速验证指南](./specs/001-worker/quickstart.md)
- [任务列表](./specs/001-worker/tasks.md)

## 🔒 安全性

- 账户凭证使用AES-256加密存储
- 生产环境使用WSS加密通信
- 支持JWT Token认证
- 控制监控频率避免平台封禁

## 📊 性能指标

- 监控延迟: ≤ 30秒
- 通知推送延迟: ≤ 3秒
- Worker故障恢复: ≤ 30秒
- 支持并发监控: 10+ 账户

## 📝 许可证

MIT

## 🤝 贡献

欢迎提交Issue和Pull Request!

---

**生成日期**: 2025-10-11
**版本**: 1.0.0
