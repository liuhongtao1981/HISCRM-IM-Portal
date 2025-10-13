# Implementation Plan: 社交媒体账户监控与通知系统

**Branch**: `001-worker` | **Date**: 2025-10-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-worker/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

构建一个基于主控-Worker架构的社交媒体监控系统,支持抖音账户的评论和私信实时监控(30秒检测周期),并通过多客户端实时通知推送。系统采用Node.js全栈技术,SQLite数据库,支持跨平台部署。核心功能包括账户配置管理、30秒周期监控、多设备通知推送、历史记录查询和自定义通知规则。

## Technical Context

**Language/Version**: Node.js 18.x LTS (服务端、Worker、客户端统一使用)
**Primary Dependencies**:
- 服务端/Worker: Express.js 4.x, Socket.IO 4.x, node-cron, better-sqlite3
- 桌面客户端: Electron 28.x, React 18.x
- 移动客户端: React Native 0.73.x (iOS/Android)
- 通信协议: Socket.IO (WebSocket) + JSON
- 进程管理: PM2 或 node:child_process

**Storage**: SQLite 3.x (嵌入式数据库,每个进程独立数据文件)
**Testing**: Jest 29.x, Supertest (API测试), Playwright (E2E测试)
**Target Platform**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+), iOS 14+, Android 10+
**Project Type**: Master-Worker Architecture (主控+多Worker+多客户端)
**Performance Goals**:
- 监控延迟 ≤ 30秒
- 通知推送延迟 ≤ 3秒
- 支持至少10个账户并发监控
- Worker故障恢复时间 ≤ 30秒

**Constraints**:
- 单Worker进程内存占用 < 200MB
- 主控进程内存占用 < 500MB
- SQLite数据库单文件 < 2GB (自动轮转)
- 支持离线缓存(客户端)

**Scale/Scope**:
- 支持单用户管理10-50个社交媒体账户
- 历史数据保留30天
- 同时支持3-5个客户端设备
- Worker节点数量: 1-10个动态扩展

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

本功能设计必须符合以下宪章原则:

- [x] **进程隔离架构**:
  - ✅ 主控进程: 单一实例,负责Worker管理、任务调度、客户端通信
  - ✅ Worker进程: 多实例,每个Worker独立监控账户,使用child_process或PM2启动
  - ✅ 客户端进程: Electron/React Native独立进程
  - ✅ 每个进程有独立SQLite数据库文件和日志

- [x] **主控-Worker通信协议**:
  - ✅ 使用Socket.IO作为通信协议(基于WebSocket + JSON)
  - ✅ 定义标准化消息格式: `{type, version, payload, timestamp}`
  - ✅ 心跳检测: 每10秒一次
  - ✅ 版本控制: API版本号在消息头中标识

- [x] **界面简洁美观原则**:
  - ✅ 桌面端: Electron + React,使用Ant Design或Material-UI组件库
  - ✅ 移动端: React Native,使用React Native Paper
  - ✅ 响应式设计,适配多种屏幕尺寸
  - ✅ 简洁的账户列表、通知卡片设计

- [x] **Worker可扩展性**:
  - ✅ Worker注册机制: 启动时向主控注册
  - ✅ 服务发现: 主控维护Worker注册表
  - ✅ 热插拔: 支持动态启动/停止Worker进程
  - ✅ 负载均衡: 主控根据Worker负载分配监控任务

- [x] **测试优先**:
  - ✅ 使用Jest进行单元测试和集成测试
  - ✅ TDD流程: 先写测试,后写实现
  - ✅ 进程隔离测试: 验证Worker崩溃不影响主控
  - ✅ 故障恢复测试: 模拟Worker崩溃和自动重启

- [x] **可观测性**:
  - ✅ 结构化日志: 使用winston,JSON格式输出
  - ✅ 关键指标: 监控延迟、通知延迟、Worker健康状态
  - ✅ 分布式追踪: 请求ID跨进程传递
  - ✅ 监控面板: 主控提供Web界面展示系统状态

- [x] **版本控制与兼容性**:
  - ✅ 使用语义化版本号(package.json中管理)
  - ✅ API版本控制: 消息协议包含version字段
  - ✅ 向后兼容: 新版本Worker可与旧版本主控通信
  - ✅ 变更日志: CHANGELOG.md记录所有变更

**结论**: ✅ 所有宪章原则已满足,无违规设计

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
packages/
├── master/                      # 主控服务
│   ├── src/
│   │   ├── worker_manager/      # Worker进程管理
│   │   ├── scheduler/           # 任务调度器
│   │   ├── monitor/             # 健康监控
│   │   ├── communication/       # Socket.IO服务端
│   │   ├── api/                 # REST API (Express)
│   │   ├── database/            # SQLite操作层
│   │   └── index.js             # 主控入口
│   ├── tests/
│   ├── package.json
│   └── data/                    # SQLite数据文件目录
│
├── worker/                      # Worker进程
│   ├── src/
│   │   ├── handlers/            # 抖音监控处理器
│   │   ├── communication/       # Socket.IO客户端
│   │   ├── crawlers/            # 抓取逻辑
│   │   ├── parsers/             # 数据解析
│   │   └── index.js             # Worker入口
│   ├── tests/
│   ├── package.json
│   └── data/                    # Worker本地数据
│
├── shared/                      # 共享代码
│   ├── protocol/                # 通信协议定义
│   │   ├── messages.js          # 消息类型定义
│   │   └── events.js            # 事件定义
│   ├── models/                  # 数据模型
│   ├── utils/                   # 工具函数
│   └── package.json
│
├── desktop-client/              # Electron桌面客户端
│   ├── src/
│   │   ├── main/                # Electron主进程
│   │   ├── renderer/            # React渲染进程
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── services/        # Socket.IO客户端
│   │   │   └── App.jsx
│   │   └── preload.js
│   ├── tests/
│   └── package.json
│
├── mobile-client/               # React Native移动客户端
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── services/            # Socket.IO客户端
│   │   ├── navigation/
│   │   └── App.tsx
│   ├── ios/
│   ├── android/
│   ├── tests/
│   └── package.json
│
└── tests/                       # 跨包集成测试
    ├── integration/             # 主控-Worker集成测试
    ├── process_isolation/       # 进程隔离测试
    ├── fault_recovery/          # 故障恢复测试
    └── e2e/                     # 端到端测试
```

**Structure Decision**: 采用Master-Worker架构,使用monorepo结构管理多个独立的Node.js包。主控和Worker通过Socket.IO通信,客户端(桌面和移动)通过WebSocket连接主控。每个包独立部署和测试,共享代码通过`shared`包复用。

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
