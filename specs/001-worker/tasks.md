# Tasks: 社交媒体账户监控与通知系统

**Input**: Design documents from `/specs/001-worker/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/
**Tests**: TDD approach - tests written FIRST, must FAIL before implementation

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, etc.)
- Include exact file paths in descriptions

## Path Conventions
Based on plan.md Master-Worker Architecture:
- **Master**: `packages/master/src/`
- **Worker**: `packages/worker/src/`
- **Shared**: `packages/shared/`
- **Desktop Client**: `packages/desktop-client/src/`
- **Mobile Client**: `packages/mobile-client/src/`
- **Tests**: `packages/{package}/tests/` and root `tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create monorepo structure with packages/ directory
- [X] T002 [P] Initialize master package with package.json (Node.js 18.x, Express 4.x, Socket.IO 4.x, better-sqlite3)
- [X] T003 [P] Initialize worker package with package.json (Node.js 18.x, Socket.IO client, node-cron, puppeteer-core)
- [X] T004 [P] Initialize shared package with package.json (protocol definitions, models, utils)
- [X] T005 [P] Initialize desktop-client package with package.json (Electron 28.x, React 18.x, Ant Design)
- [X] T006 Configure workspace root package.json with pnpm workspaces configuration
- [X] T007 [P] Setup ESLint and Prettier configuration for all packages
- [X] T008 [P] Configure Jest 29.x testing framework in root and all packages
- [X] T009 Create .gitignore for node_modules, dist, data/, logs/
- [X] T010 Create README.md with project overview and setup instructions

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database & Schema

- [X] T011 Create database schema SQL in packages/master/src/database/schema.sql (accounts, comments, direct_messages, notifications, workers, client_sessions, notification_rules tables)
- [X] T012 Implement database initialization in packages/master/src/database/init.js (SQLite with WAL mode)
- [X] T013 Create Worker database schema in packages/worker/src/database/schema.sql (monitor_tasks, crawl_cache tables)

### Communication Protocol

- [X] T014 [P] Define message types in packages/shared/protocol/messages.js (worker:register, worker:heartbeat, master:notification:push, etc.)
- [X] T015 [P] Define event constants in packages/shared/protocol/events.js
- [X] T016 [P] Create message validation utility in packages/shared/utils/validator.js

### Master-Worker Infrastructure

- [X] T017 Implement Socket.IO server setup in packages/master/src/communication/socket-server.js
- [X] T018 Implement Worker registration handler in packages/master/src/worker_manager/registration.js
- [X] T019 Implement heartbeat monitoring in packages/master/src/monitor/heartbeat.js
- [X] T020 [P] Implement Worker process manager in packages/master/src/worker_manager/process-manager.js (spawn Worker using child_process)
- [X] T021 [P] Implement task scheduler in packages/master/src/scheduler/task-scheduler.js

### Worker Base Implementation

- [X] T022 Implement Socket.IO client in packages/worker/src/communication/socket-client.js
- [X] T023 Implement Worker registration logic in packages/worker/src/communication/registration.js
- [X] T024 Implement heartbeat sender in packages/worker/src/communication/heartbeat.js
- [X] T025 [P] Create monitoring task runner using node-cron in packages/worker/src/handlers/task-runner.js

### Logging & Observability

- [X] T026 [P] Setup Winston logger with JSON format in packages/shared/utils/logger.js
- [X] T027 [P] Implement request ID generation and propagation in packages/shared/utils/request-id.js

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 账户监控配置 (Priority: P1) 🎯 MVP

**Goal**: 用户可以在客户端添加和管理多个社交媒体账户

**Independent Test**: 打开客户端、添加抖音账户、保存配置、验证账户显示在列表中

### Tests for User Story 1 ⚠️ (TDD - Write FIRST, ensure FAIL)

- [X] T028 [P] [US1] Contract test for POST /api/v1/accounts in packages/master/tests/contract/accounts.test.js
- [X] T029 [P] [US1] Contract test for GET /api/v1/accounts in packages/master/tests/contract/accounts.test.js
- [X] T030 [P] [US1] Contract test for PATCH /api/v1/accounts/:id in packages/master/tests/contract/accounts.test.js
- [X] T031 [P] [US1] Contract test for DELETE /api/v1/accounts/:id in packages/master/tests/contract/accounts.test.js
- [X] T032 [P] [US1] Integration test for account CRUD flow in packages/master/tests/integration/account-management.test.js

### Implementation for User Story 1

- [X] T033 [P] [US1] Implement Account model with encryption utils in packages/shared/models/Account.js
- [X] T034 [US1] Implement accounts database operations in packages/master/src/database/accounts-dao.js (depends on T033)
- [X] T035 [US1] Implement POST /api/v1/accounts endpoint in packages/master/src/api/routes/accounts.js (create account)
- [X] T036 [US1] Implement GET /api/v1/accounts endpoint in packages/master/src/api/routes/accounts.js (list accounts)
- [X] T037 [US1] Implement GET /api/v1/accounts/:id endpoint in packages/master/src/api/routes/accounts.js (get account details)
- [X] T038 [US1] Implement PATCH /api/v1/accounts/:id endpoint in packages/master/src/api/routes/accounts.js (update account)
- [X] T039 [US1] Implement DELETE /api/v1/accounts/:id endpoint in packages/master/src/api/routes/accounts.js (delete account)
- [X] T040 [US1] Implement account assignment logic in packages/master/src/worker_manager/account-assigner.js (assign account to Worker)
- [X] T041 [US1] Create AccountList component in packages/desktop-client/src/renderer/components/AccountList.jsx
- [X] T042 [US1] Create AddAccountDialog component in packages/desktop-client/src/renderer/components/AddAccountDialog.jsx
- [X] T043 [US1] Create AccountsPage in packages/desktop-client/src/renderer/pages/AccountsPage.jsx
- [X] T044 [US1] Implement Socket.IO service in packages/desktop-client/src/renderer/services/socket-service.js
- [X] T045 [US1] Implement API client in packages/desktop-client/src/renderer/services/api-client.js

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - 实时互动监控 (Priority: P1)

**Goal**: 系统自动监控所有账户的新评论和私信(30秒检测周期)

**Independent Test**: 配置账户、等待30秒、在抖音收到新评论、验证系统检测到

### Tests for User Story 2 ⚠️ (TDD - Write FIRST, ensure FAIL)

- [X] T046 [P] [US2] Contract test for worker:message:detected event in packages/worker/tests/contract/message-detection.test.js
- [X] T047 [P] [US2] Integration test for comment detection flow in tests/integration/comment-monitoring.test.js
- [X] T048 [P] [US2] Integration test for direct message detection flow in tests/integration/dm-monitoring.test.js

### Implementation for User Story 2

- [X] T049 [P] [US2] Implement Douyin crawler using puppeteer in packages/worker/src/crawlers/douyin-crawler.js
- [X] T050 [P] [US2] Implement comment parser in packages/worker/src/parsers/comment-parser.js
- [X] T051 [P] [US2] Implement direct message parser in packages/worker/src/parsers/dm-parser.js
- [X] T052 [US2] Implement monitor task creation in packages/worker/src/handlers/monitor-task.js (create task from assigned account)
- [X] T053 [US2] Implement cache check logic in packages/worker/src/handlers/cache-handler.js (avoid duplicate detection)
- [X] T054 [US2] Implement worker:message:detected sender in packages/worker/src/communication/message-reporter.js
- [X] T055 [US2] Implement Comment model in packages/shared/models/Comment.js
- [X] T056 [US2] Implement DirectMessage model in packages/shared/models/DirectMessage.js
- [X] T057 [US2] Implement comments database operations in packages/master/src/database/comments-dao.js
- [X] T058 [US2] Implement direct messages database operations in packages/master/src/database/messages-dao.js
- [X] T059 [US2] Implement message reception handler in packages/master/src/communication/message-receiver.js (save to DB)
- [X] T060 [US2] Add error handling for crawler failures in packages/worker/src/handlers/error-handler.js
- [X] T061 [US2] Implement rate limiting detection and auto-adjustment in packages/worker/src/handlers/rate-limiter.js

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - 多客户端实时通知 (Priority: P1)

**Goal**: 所有客户端实时收到通知,支持离线重连同步

**Independent Test**: 多设备登录、触发新评论、验证所有设备收到通知

### Tests for User Story 3 ⚠️ (TDD - Write FIRST, ensure FAIL)

- [X] T062 [P] [US3] Contract test for master:notification:push event in packages/desktop-client/tests/contract/notifications.test.js
- [X] T063 [P] [US3] Integration test for multi-client notification broadcast in tests/integration/notification-broadcast.test.js
- [X] T064 [P] [US3] Integration test for offline client sync in tests/integration/offline-sync.test.js

### Implementation for User Story 3

- [X] T065 [P] [US3] Implement Notification model in packages/shared/models/Notification.js
- [X] T066 [US3] Implement notifications database operations in packages/master/src/database/notifications-dao.js
- [X] T067 [US3] Implement notification queue in packages/master/src/communication/notification-queue.js
- [X] T068 [US3] Implement notification broadcaster in packages/master/src/communication/notification-broadcaster.js (broadcast to all clients)
- [X] T069 [US3] Implement client session manager in packages/master/src/communication/session-manager.js (track online clients)
- [X] T070 [US3] Implement client:connect handler in packages/master/src/communication/client-handler.js
- [X] T071 [US3] Implement client:sync:request handler in packages/master/src/communication/sync-handler.js (push offline notifications)
- [X] T072 [US3] Implement notification listener in packages/desktop-client/src/renderer/services/notification-listener.js
- [X] T073 [US3] Implement notification display component in packages/desktop-client/src/renderer/components/NotificationToast.jsx
- [X] T074 [US3] Implement notification click handler in packages/desktop-client/src/renderer/services/notification-handler.js (navigate to detail)
- [X] T075 [US3] Implement Electron notification API in packages/desktop-client/src/main/notification.js
- [X] T076 [US3] Create MessageDetailPage in packages/desktop-client/src/renderer/pages/MessageDetailPage.jsx

**Checkpoint**: All P1 user stories (MVP) should now be independently functional - system can monitor accounts and notify users

---

## Phase 6: User Story 4 - 消息历史与统计 (Priority: P2)

**Goal**: 查看历史记录和互动统计趋势

**Independent Test**: 打开历史记录页面、验证显示过去的评论和私信列表

### Tests for User Story 4 ⚠️ (TDD - Write FIRST, ensure FAIL)

- [ ] T077 [P] [US4] Contract test for GET /api/v1/messages in packages/master/tests/contract/messages.test.js
- [ ] T078 [P] [US4] Contract test for GET /api/v1/statistics in packages/master/tests/contract/statistics.test.js
- [ ] T079 [US4] Integration test for message history pagination in tests/integration/history-pagination.test.js

### Implementation for User Story 4

- [ ] T080 [US4] Implement GET /api/v1/messages endpoint in packages/master/src/api/routes/messages.js (with pagination, filters)
- [ ] T081 [US4] Implement POST /api/v1/messages/:id/read endpoint in packages/master/src/api/routes/messages.js (mark as read)
- [ ] T082 [US4] Implement GET /api/v1/statistics endpoint in packages/master/src/api/routes/statistics.js
- [ ] T083 [US4] Implement statistics calculation service in packages/master/src/services/statistics-service.js
- [ ] T084 [US4] Create HistoryPage component in packages/desktop-client/src/renderer/pages/HistoryPage.jsx
- [ ] T085 [US4] Create MessageList component with virtual scrolling in packages/desktop-client/src/renderer/components/MessageList.jsx
- [ ] T086 [US4] Create TimeRangeFilter component in packages/desktop-client/src/renderer/components/TimeRangeFilter.jsx
- [ ] T087 [US4] Create StatisticsPage with charts in packages/desktop-client/src/renderer/pages/StatisticsPage.jsx (using Chart.js)
- [ ] T088 [US4] Implement data cleanup cron job in packages/master/src/services/cleanup-service.js (30-day retention)

**Checkpoint**: At this point, Users can view full history and statistics alongside real-time monitoring

---

## Phase 7: User Story 5 - 通知规则定制 (Priority: P3)

**Goal**: 自定义通知规则(关键词过滤、免打扰时段、优先级)

**Independent Test**: 设置关键词过滤规则、发送包含和不包含关键词的消息、验证只有匹配的消息触发通知

### Tests for User Story 5 ⚠️ (TDD - Write FIRST, ensure FAIL)

- [ ] T089 [P] [US5] Contract test for GET /api/v1/notification-rules in packages/master/tests/contract/notification-rules.test.js
- [ ] T090 [P] [US5] Contract test for POST /api/v1/notification-rules in packages/master/tests/contract/notification-rules.test.js
- [ ] T091 [US5] Integration test for keyword filtering in tests/integration/keyword-filter.test.js
- [ ] T092 [US5] Integration test for do-not-disturb schedule in tests/integration/dnd-schedule.test.js

### Implementation for User Story 5

- [ ] T093 [P] [US5] Implement NotificationRule model in packages/shared/models/NotificationRule.js
- [ ] T094 [US5] Implement notification rules database operations in packages/master/src/database/rules-dao.js
- [ ] T095 [US5] Implement GET /api/v1/notification-rules endpoint in packages/master/src/api/routes/notification-rules.js
- [ ] T096 [US5] Implement POST /api/v1/notification-rules endpoint in packages/master/src/api/routes/notification-rules.js
- [ ] T097 [US5] Implement PATCH /api/v1/notification-rules/:id endpoint in packages/master/src/api/routes/notification-rules.js
- [ ] T098 [US5] Implement DELETE /api/v1/notification-rules/:id endpoint in packages/master/src/api/routes/notification-rules.js
- [ ] T099 [US5] Implement rule evaluation engine in packages/master/src/services/rule-engine.js (keyword, schedule, priority)
- [ ] T100 [US5] Integrate rule engine into notification broadcaster in packages/master/src/communication/notification-broadcaster.js
- [ ] T101 [US5] Create NotificationRulesPage in packages/desktop-client/src/renderer/pages/NotificationRulesPage.jsx
- [ ] T102 [US5] Create AddRuleDialog component in packages/desktop-client/src/renderer/components/AddRuleDialog.jsx
- [ ] T103 [US5] Create RulesList component in packages/desktop-client/src/renderer/components/RulesList.jsx

**Checkpoint**: All user stories should now be independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T104 [P] Implement GET /api/v1/workers endpoint in packages/master/src/api/routes/workers.js (system monitoring)
- [ ] T105 [P] Create SystemStatusPage in packages/desktop-client/src/renderer/pages/SystemStatusPage.jsx (show Workers, health)
- [ ] T106 [P] Implement Worker auto-scaling logic in packages/master/src/worker_manager/auto-scaler.js
- [ ] T107 [P] Implement graceful shutdown handlers in packages/master/src/index.js and packages/worker/src/index.js
- [ ] T108 [P] Add request/response logging middleware in packages/master/src/api/middleware/logging.js
- [ ] T109 [P] Implement error boundary in packages/desktop-client/src/renderer/components/ErrorBoundary.jsx
- [ ] T110 [P] Add loading states and error handling to all UI components
- [ ] T111 Create migration system in packages/master/src/database/migrator.js
- [ ] T112 [P] Write E2E test for complete user journey using Playwright in tests/e2e/user-journey.spec.js
- [ ] T113 [P] Document API endpoints in packages/master/docs/API.md
- [ ] T114 [P] Create CHANGELOG.md with initial v1.0.0 release notes
- [ ] T115 Run quickstart.md validation tests

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 3 (P1)**: Can start after Foundational - Integrates with US2 but independently testable
- **User Story 4 (P2)**: Can start after Foundational - Uses data from US2 but independently testable
- **User Story 5 (P3)**: Can start after Foundational - Enhances US3 but independently testable

### Within Each User Story

- Tests (TDD) MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Contract test for POST /api/v1/accounts"
Task: "Contract test for GET /api/v1/accounts"
Task: "Contract test for PATCH /api/v1/accounts/:id"
Task: "Contract test for DELETE /api/v1/accounts/:id"
Task: "Integration test for account CRUD flow"

# Launch all models for User Story 1 together:
Task: "Implement Account model with encryption utils"
```

---

## Implementation Strategy

### MVP First (User Stories 1-3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Account Management)
4. Complete Phase 4: User Story 2 (Monitoring)
5. Complete Phase 5: User Story 3 (Notifications)
6. **STOP and VALIDATE**: Test full MVP flow independently
7. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (Account Management!)
3. Add User Story 2 → Test independently → Deploy/Demo (+ Monitoring!)
4. Add User Story 3 → Test independently → Deploy/Demo (+ Notifications! = MVP)
5. Add User Story 4 → Test independently → Deploy/Demo (+ History)
6. Add User Story 5 → Test independently → Deploy/Demo (+ Rules)
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Account Management)
   - Developer B: User Story 2 (Monitoring)
   - Developer C: User Story 3 (Notifications)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- **TDD MANDATORY**: Verify tests fail before implementing (per Constitution)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
