# 测试目录结构

所有项目测试都在此目录统一管理。

## 目录结构

```
tests/
├── unit/                      # 单元测试
│   ├── contract/
│   │   ├── message-detection.test.js              # Socket.IO 消息格式测试 (13 个)
│   │   └── notifications.test.js                  # 桌面客户端通知测试
│   └── platforms/
│       └── douyin/
│           ├── reply-to-comment.test.js           # 评论回复单元测试 (25 个)
│           └── reply-to-direct-message.test.js    # 私信回复单元测试 (23 个)
│
├── integration/               # 集成测试
│   ├── comment-monitoring.test.js
│   ├── dm-monitoring.test.js
│   ├── history-pagination.test.js
│   ├── notification-broadcast.test.js
│   ├── offline-sync.test.js
│   ├── test-integration-e2e.js
│   ├── test-message-management.js
│   ├── test-new-data-push-system.js
│   └── test-reply-integration.js                  # 回复功能集成测试
│
├── packages/                  # 包级测试脚本
│   ├── worker/
│   │   ├── test-dm-page-structure.js             # DM 页面结构测试
│   │   ├── test-dm-with-session.js               # DM Session 测试
│   │   └── test-message-extraction.js            # 消息提取测试
│   └── master/
│
├── scripts/                   # 交互式测试脚本
│   ├── check-accounts.js
│   ├── check-db-schema.js
│   ├── check-reply-status.js
│   ├── test-api-fix-verify.js
│   ├── test-api-intercept.js
│   ├── test-final-reply.js
│   ├── test-reply-api-direct.js
│   ├── test-reply-status.js
│   └── test-reply-with-logging.js
│
└── logs/                      # 测试日志

```

## 运行测试

### 运行所有单元测试

```bash
npm run test --workspace=packages/worker
```

### 运行特定的单元测试

```bash
# 评论回复测试
npm test -- tests/unit/platforms/douyin/reply-to-comment.test.js

# 私信回复测试
npm test -- tests/unit/platforms/douyin/reply-to-direct-message.test.js
```

### 运行集成测试

```bash
# 手动启动环境后运行集成测试
npm run dev:all    # 终端 1: 启动完整环境

# 终端 2: 运行集成测试
npm test -- tests/integration/
```

## 测试分类

### 单元测试 (Unit Tests)

**位置**: `tests/unit/`

覆盖内容:
- ✅ 方法存在性检查
- ✅ 返回值格式验证
- ✅ 错误处理验证
- ✅ 参数验证
- ✅ 边界情况

**统计**:
- 回复功能: 48 个测试 (100% 通过) ✅
  - 评论回复: 25 个测试
  - 私信回复: 23 个测试
- 合约测试: 13 个测试 (Socket.IO 消息)
- 通知测试: N/A 个测试 (桌面客户端)
- **总单元测试: 61+ 个测试**

### 集成测试 (Integration Tests)

**位置**: `tests/integration/`

覆盖内容:
- 系统端到端流程
- Master-Worker 通信
- 数据库操作
- Socket.IO 事件

### 包级测试脚本 (Package Tests)

**位置**: `tests/packages/`

包含各包的特定测试脚本：
- `packages/worker/` - Worker 爬虫特定测试
  - test-dm-page-structure.js - 测试私信页面 DOM 结构
  - test-dm-with-session.js - 测试带会话的私信功能
  - test-message-extraction.js - 测试消息提取逻辑

### 交互式测试脚本 (Interactive Scripts)

**位置**: `tests/scripts/`

用于调试和验证的交互式脚本：
- API 拦截验证脚本
- 数据库检查脚本
- 回复状态检查脚本
- 完整回复流程测试脚本

## 测试状态

| 测试类型 | 状态 | 说明 |
|---------|------|------|
| 单元测试 | ✅ 100% | 48 个测试全通过 |
| 集成测试 | 🟡 准备 | 需要完整环境 |
| E2E 测试 | 🟡 准备 | 需要完整环境 |

## 快速参考

```bash
# 运行所有单元测试
npm run test --workspace=packages/worker

# 查看测试覆盖率
npm test -- --coverage

# 监听模式运行测试
npm test -- --watch

# 运行特定匹配的测试
npm test -- --testNamePattern="回复"
```

## 相关文档

- 单元测试详情: [docs/07-DOUYIN-消息回复功能技术总结.md](../docs/07-DOUYIN-消息回复功能技术总结.md)
- 集成测试计划: [docs/_archived/INTEGRATION_TESTING_ROADMAP.md](../docs/_archived/INTEGRATION_TESTING_ROADMAP.md)
- 测试指南: [docs/06-WORKER-爬虫调试指南.md](../docs/06-WORKER-爬虫调试指南.md)

---

Generated with Claude Code | 2025-10-21
