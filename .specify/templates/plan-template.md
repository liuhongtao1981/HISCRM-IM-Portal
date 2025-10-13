# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [single/web/mobile - determines source structure]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

本功能设计必须符合以下宪章原则:

- [ ] **进程隔离架构**: 确认新功能如何适配主控-Worker架构,是否需要新的Worker类型
- [ ] **主控-Worker通信协议**: 确认通信接口的契约定义和版本控制
- [ ] **界面简洁美观原则**: 如涉及UI,确认是否符合设计规范和响应式要求
- [ ] **Worker可扩展性**: 确认Worker的注册、发现和热插拔机制
- [ ] **测试优先**: 确认TDD流程,包括进程隔离和故障恢复测试
- [ ] **可观测性**: 确认日志、指标、追踪和监控的实现方案
- [ ] **版本控制与兼容性**: 确认版本策略和向后兼容性保证

如有违反宪章原则的设计,必须在"复杂性跟踪"表格中记录理由。

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
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]

# [REMOVE IF UNUSED] Option 4: Master-Worker Architecture (when "主控" + "worker" detected)
master/
├── src/
│   ├── worker_manager/      # Worker进程管理
│   ├── scheduler/           # 任务调度
│   ├── monitor/             # 监控和健康检查
│   ├── communication/       # 通信协议实现
│   └── api/                 # 主控API
└── tests/

workers/
├── worker_type1/            # 各类型Worker独立目录
│   ├── src/
│   │   ├── handlers/        # 任务处理器
│   │   ├── communication/   # 通信客户端
│   │   └── services/
│   └── tests/
├── worker_type2/
└── ...

shared/
├── protocol/                # 通信协议定义
├── contracts/               # 接口契约
└── common/                  # 共享工具库

ui/
├── src/
│   ├── components/          # UI组件
│   ├── pages/
│   └── services/
└── tests/

tests/
├── integration/             # 主控-Worker集成测试
├── process_isolation/       # 进程隔离测试
└── fault_recovery/          # 故障恢复测试
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
