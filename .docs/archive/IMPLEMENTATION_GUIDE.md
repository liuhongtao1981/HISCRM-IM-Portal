# 实施指南 - 社交媒体账户监控系统

> 本文档提供完整的实施步骤和开发指导

## 📌 当前状态

### ✅ 已完成部分

**Phase 1: Setup (100% 完成)**
- ✅ Monorepo项目结构
- ✅ 所有package.json配置(master, worker, shared, desktop-client)
- ✅ pnpm workspace配置
- ✅ ESLint + Prettier代码规范
- ✅ Jest测试框架配置
- ✅ .gitignore和README.md

**Phase 2: Foundational (部分完成 - 40%)**
- ✅ 数据库Schema (master.db + worker.db)
- ✅ 数据库初始化代码
- ✅ 通信协议定义 (messages.js + events.js)
- ✅ 消息验证工具
- ✅ Winston日志系统
- ✅ 请求ID生成和传播
- ✅ 主控服务骨架 (packages/master/src/index.js)
- ✅ Worker进程骨架 (packages/worker/src/index.js)
- ⏸️ Socket.IO通信实现 (待完成)
- ⏸️ Worker进程管理 (待完成)
- ⏸️ 任务调度器 (待完成)
- ⏸️ 心跳监控 (待完成)

---

## 🚀 快速验证

### 1. 安装依赖

```bash
# 全局安装pnpm
npm install -g pnpm

# 安装所有依赖
pnpm install
```

### 2. 启动主控服务

```bash
cd packages/master
cp .env.example .env

# 编辑.env设置加密密钥
# ENCRYPTION_KEY=your-32-character-encryption-key-here-123456789012

npm start
# 输出: Master server started on port 3000
```

### 3. 启动Worker进程

```bash
# 新终端
cd packages/worker
cp .env.example .env

npm start
# 输出: Worker worker-xxx started
# 输出: Connected to master at localhost:3000
```

### 4. 验证连接

```bash
# 新终端
curl http://localhost:3000/health
# 输出: {"status":"ok","timestamp":...}

curl http://localhost:3000/api/v1/status
# 输出: {"success":true,"data":{"version":"1.0.0","uptime":...}}
```

---

## 📋 下一步实施任务

### Phase 2: Foundational (继续完成)

#### 🔹 T017-T021: Master-Worker基础设施

**T017**: 实现Socket.IO服务器设置
```javascript
// packages/master/src/communication/socket-server.js
// - 配置命名空间 (/worker, /client)
// - 实现消息路由
// - 集成日志和错误处理
```

**T018**: 实现Worker注册处理器
```javascript
// packages/master/src/worker_manager/registration.js
// - 接收worker:register消息
// - 验证Worker信息
// - 保存到workers表
// - 返回assigned_accounts
```

**T019**: 实现心跳监控
```javascript
// packages/master/src/monitor/heartbeat.js
// - 每10秒检查workers表的last_heartbeat
// - 超时30秒标记为offline
// - 触发Worker重启或任务重新分配
```

**T020**: 实现Worker进程管理器
```javascript
// packages/master/src/worker_manager/process-manager.js
// - 使用child_process.fork启动Worker
// - 监听Worker退出事件
// - 实现自动重启逻辑
```

**T021**: 实现任务调度器
```javascript
// packages/master/src/scheduler/task-scheduler.js
// - 从accounts表加载账户
// - 负载均衡分配到Worker
// - 监听账户变更事件
```

#### 🔹 T022-T025: Worker基础实现

**T022**: 实现Socket.IO客户端
```javascript
// packages/worker/src/communication/socket-client.js
// - 封装socket.io-client
// - 实现重连逻辑
// - 消息发送/接收封装
```

**T023**: 实现Worker注册逻辑
```javascript
// packages/worker/src/communication/registration.js
// - 构造注册消息
// - 发送worker:register
// - 处理assigned_accounts响应
```

**T024**: 实现心跳发送器
```javascript
// packages/worker/src/communication/heartbeat.js
// - setInterval每10秒发送心跳
// - 包含Worker状态信息(内存、CPU使用率)
```

**T025**: 创建监控任务执行器
```javascript
// packages/worker/src/handlers/task-runner.js
// - 使用node-cron按账户monitor_interval执行
// - 调用抓取逻辑
// - 上报检测结果
```

---

### Phase 3: User Story 1 - 账户管理 (MVP第一步)

#### 优先任务清单

1. **T028-T032**: 编写账户管理API的契约测试 (TDD)
2. **T033**: 实现Account模型和加密工具
3. **T034**: 实现账户数据库操作(accounts-dao.js)
4. **T035-T039**: 实现账户CRUD的REST API
5. **T040**: 实现账户分配逻辑(分配到Worker)
6. **T041-T045**: 实现桌面客户端账户管理界面

#### 测试优先开发流程

```bash
# 1. 编写测试
packages/master/tests/contract/accounts.test.js
# 期望:测试FAIL(因为API未实现)

# 2. 实现Account模型
packages/shared/models/Account.js

# 3. 实现数据库操作
packages/master/src/database/accounts-dao.js

# 4. 实现API端点
packages/master/src/api/routes/accounts.js

# 5. 运行测试
npm test
# 期望:测试PASS

# 6. 实现客户端UI
packages/desktop-client/src/renderer/components/AccountList.jsx
```

---

## 🛠️ 开发工具和技巧

### 数据库查看

```bash
# 安装SQLite工具
npm install -g sqlite3

# 查看accounts表
sqlite3 packages/master/data/master.db "SELECT * FROM accounts;"

# 查看Worker表
sqlite3 packages/master/data/master.db "SELECT * FROM workers;"
```

### 日志查看

```bash
# 实时查看主控日志
tail -f packages/master/logs/master.log

# 实时查看Worker日志
tail -f packages/worker/logs/worker.log

# 查看错误日志
tail -f packages/master/logs/master-error.log
```

### 调试技巧

```javascript
// 在代码中添加logger
const logger = require('@hiscrm-im/shared/utils/logger');
logger.debug('Debug info:', { variable });
logger.error('Error occurred:', error);

// 使用VS Code调试
// 在.vscode/launch.json中配置:
{
  "type": "node",
  "request": "launch",
  "name": "Debug Master",
  "program": "${workspaceFolder}/packages/master/src/index.js"
}
```

---

## 📊 进度追踪

### 里程碑

- [X] **M1: 项目初始化** (Phase 1) - 2025-10-11完成
- [ ] **M2: 基础设施就绪** (Phase 2) - 预计40%完成
- [ ] **M3: 账户管理功能** (Phase 3) - 未开始
- [ ] **M4: 监控功能** (Phase 4) - 未开始
- [ ] **M5: 通知功能** (Phase 5) - 未开始
- [ ] **M6: MVP验证** - 未开始

### 预估工作量

| Phase | 任务数 | 预估时间 | 状态 |
|-------|-------|----------|------|
| Phase 1: Setup | 10 | 2小时 | ✅ 100% |
| Phase 2: Foundational | 17 | 8小时 | 🔵 40% |
| Phase 3: US1 账户配置 | 18 | 12小时 | ⚪ 0% |
| Phase 4: US2 监控 | 16 | 16小时 | ⚪ 0% |
| Phase 5: US3 通知 | 15 | 14小时 | ⚪ 0% |
| **MVP总计** | **76** | **52小时** | **19%** |

---

## 🔍 代码质量检查

### 运行测试

```bash
# 所有测试
pnpm test

# 特定包的测试
pnpm --filter @hiscrm-im/master test

# 测试覆盖率
pnpm test -- --coverage
```

### 代码检查

```bash
# ESLint检查
pnpm lint

# Prettier格式化
pnpm format
```

---

## 📚 参考文档

- [功能规格](./specs/001-worker/spec.md)
- [技术计划](./specs/001-worker/plan.md)
- [数据模型](./specs/001-worker/data-model.md)
- [API契约](./specs/001-worker/contracts/master-api.yaml)
- [Socket.IO事件](./specs/001-worker/contracts/socket-events.md)
- [快速验证指南](./specs/001-worker/quickstart.md)
- [任务列表](./specs/001-worker/tasks.md)

---

## ❓ 常见问题

### Q1: pnpm install失败?

**A**: 确保Node.js版本≥18.0.0, pnpm版本≥8.0.0

```bash
node --version  # 应显示v18.x.x或更高
pnpm --version  # 应显示8.x.x或更高
```

### Q2: Socket.IO连接失败?

**A**: 检查主控服务是否启动,端口是否被占用

```bash
# 检查3000端口
netstat -an | grep 3000

# 检查主控日志
tail -f packages/master/logs/master.log
```

### Q3: 数据库初始化失败?

**A**: 确保data目录有写权限,删除旧数据库重试

```bash
rm -rf packages/master/data/master.db
npm --prefix packages/master start
```

---

## 🎯 下一步行动建议

### 选项1: 继续自动化实施 (推荐用于学习)

```bash
# 运行下一阶段的实施命令
/speckit.implement --continue --phase=2
```

### 选项2: 手动逐步实施 (推荐用于生产)

按照本文档"下一步实施任务"部分,逐个完成T017-T027任务。

### 选项3: 快速验证MVP

跳过部分非关键功能,专注实现Phase 3-5(账户管理+监控+通知),快速交付MVP。

---

**最后更新**: 2025-10-11
**当前版本**: 1.0.0
**实施进度**: Phase 1 ✅ | Phase 2 🔵 40%
