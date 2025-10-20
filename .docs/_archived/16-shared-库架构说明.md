# Shared 库架构说明

## 📦 概述

`packages/shared` 模块是一个集中化的共享库，为 Master、Worker 和各客户端提供统一的工具、配置和协议定义。通过单一的 shared 库，确保整个系统的一致性和可维护性。

---

## 🏗️ 库结构

```
packages/shared/
├── config/                    # 配置模块
│   ├── paths.js             # ⭐ 统一路径配置（新增）
│   └── index.js             # 配置导出
│
├── utils/                     # 实用工具库
│   ├── logger.js            # Winston logger 工厂函数
│   ├── error-handler.js     # 统一错误处理
│   ├── request-id.js        # 请求追踪 ID
│   ├── validator.js         # 数据验证工具
│   ├── retry-strategy.js    # 重试策略
│   ├── time-parser.js       # 时间解析工具
│   └── index.js             # 工具导出
│
├── protocol/                 # 通信协议定义
│   ├── messages.js          # Socket.IO 消息类型
│   ├── events.js            # Socket.IO 事件类型
│   └── index.js             # 协议导出
│
├── models/                   # 数据模型
│   ├── Account.js           # 账户模型
│   ├── Worker.js            # Worker 模型
│   └── index.js             # 模型导出
│
├── package.json             # NPM 包配置
└── index.js                 # 主入口
```

---

## 🔄 模块间依赖关系

```
┌──────────────────────────────────────────────────┐
│           @hiscrm-im/shared                      │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ config/                                 │   │
│  │ • paths.js ⭐ (新增)                    │   │
│  │   - 独立模块                            │   │
│  │   - 不依赖其他 shared 模块              │   │
│  └─────────────────────────────────────────┘   │
│            ▲                                     │
│            │                                     │
│            └─ 被 Master/Worker 直接使用        │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ utils/                                  │   │
│  │ • logger.js      → winston              │   │
│  │ • error-handler.js                      │   │
│  │ • request-id.js                         │   │
│  │ • validator.js                          │   │
│  │ • retry-strategy.js                     │   │
│  │ • time-parser.js                        │   │
│  └─────────────────────────────────────────┘   │
│            ▲                                     │
│            │ 被所有模块使用                    │
│            │                                     │
│  ┌─────────────────────────────────────────┐   │
│  │ protocol/                               │   │
│  │ • messages.js    → 消息定义             │   │
│  │ • events.js      → 事件定义             │   │
│  └─────────────────────────────────────────┘   │
│            ▲                                     │
│            │ 被 Master/Worker 使用             │
│            │                                     │
│  ┌─────────────────────────────────────────┐   │
│  │ models/                                 │   │
│  │ • Account.js                            │   │
│  │ • Worker.js                             │   │
│  └─────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
         ▲         ▲         ▲
         │         │         │
    ┌────┴──┐  ┌───┴───┐  ┌──┴──────┐
    │ Master│  │Worker │  │ Clients │
    └───────┘  └───────┘  └─────────┘
```

---

## 📝 各模块详细说明

### 1. Config 模块 - 配置管理

#### `packages/shared/config/paths.js`

**目的**: 统一的路径配置，确保 Master 和 Worker 使用相同的路径

```javascript
// 导入使用
const { PATHS, getProjectRoot, validatePath, getRelativePath }
  = require('@hiscrm-im/shared/config/paths');

// 使用示例
const platformsDir = PATHS.worker.platforms;
const dbPath = PATHS.master.database;
const logsDir = PATHS.master.logs;
```

**特点**:
- ✅ 所有路径集中管理
- ✅ 自动计算项目根目录
- ✅ 支持路径验证
- ✅ Master 和 Worker 一致性

**被使用的地方**:
- `packages/master/src/api/routes/platforms.js` - 扫描平台目录
- `packages/worker/src/platform-manager.js` - 加载平台
- 可扩展: 日志路径、数据路径等

---

### 2. Utils 模块 - 工具库

#### `packages/shared/utils/logger.js`

**目的**: 统一的日志记录，基于 Winston

```javascript
// 导入使用
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

// 创建日志实例
const logger = createLogger('platform-manager');

// 使用示例
logger.info('Message', { context });
logger.warn('Warning', { details });
logger.error('Error', { error });
```

**特点**:
- ✅ 统一的日志格式
- ✅ 支持 Console 和 File 输出
- ✅ 可配置的日志级别
- ✅ 支持 RequestID 追踪

**被使用的地方**:
- Master 所有模块
- Worker 所有模块
- Admin Web (通过 API 查看日志)

---

#### 其他 Utils

| 工具 | 用途 | 位置 |
|-----|------|------|
| `error-handler.js` | 统一错误处理 | Master API 路由 |
| `request-id.js` | 请求追踪 | Master 中间件 |
| `validator.js` | 输入验证 | Master API 路由 |
| `retry-strategy.js` | 重试逻辑 | Worker 任务 |
| `time-parser.js` | 时间解析 | 平台爬虫 |

---

### 3. Protocol 模块 - 通信协议

#### `packages/shared/protocol/messages.js`

**目的**: 统一的消息类型定义

```javascript
// 导入使用
const {
  WORKER_REGISTER,
  MASTER_TASK_ASSIGN,
  createMessage
} = require('@hiscrm-im/shared/protocol/messages');

// 发送消息
socket.emit(WORKER_REGISTER, {
  workerId: 'worker-1',
  capabilities: ['douyin', 'xiaohongshu']
});

// 接收消息
socket.on(MASTER_TASK_ASSIGN, (message) => {
  const { accountId, platform } = message;
});
```

**特点**:
- ✅ 消息类型常量化
- ✅ 防止拼写错误
- ✅ IDE 智能提示支持

**被使用的地方**:
- Master Socket.IO 处理
- Worker Socket.IO 通信
- Admin Web Socket 连接

---

#### `packages/shared/protocol/events.js`

**目的**: 统一的事件类型定义

```javascript
// 导入使用
const { MESSAGE, HEARTBEAT, ERROR } = require('@hiscrm-im/shared/protocol/events');
```

---

### 4. Models 模块 - 数据模型

#### `packages/shared/models/Account.js`

**目的**: 账户数据模型定义

```javascript
// 导入使用
const { Account } = require('@hiscrm-im/shared/models');

// 使用
const account = new Account({
  id: '123',
  platform: 'douyin',
  status: 'active'
});
```

---

## 🔌 实际集成示例

### Master 端使用 Shared 库

```javascript
// packages/master/src/index.js
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { PATHS } = require('@hiscrm-im/shared/config/paths');
const { WORKER_REGISTER } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('master');
const platformsDir = PATHS.worker.platforms;

// 监听 Worker 注册事件
socket.on(WORKER_REGISTER, (message) => {
  logger.info('Worker registered', message);
});
```

### Worker 端使用 Shared 库

```javascript
// packages/worker/src/index.js
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { PATHS } = require('@hiscrm-im/shared/config/paths');
const { WORKER_REGISTER } = require('@hiscrm-im/shared/protocol/messages');

const logger = createLogger('worker');
const platformsDir = PATHS.worker.platforms;

// 向 Master 发送注册消息
socket.emit(WORKER_REGISTER, {
  workerId: process.env.WORKER_ID,
  capabilities: platformManager.getSupportedPlatforms()
});
```

---

## ✨ Shared 库的优势

### 1. 一致性 (Consistency)
```javascript
// ❌ 修改前：每个地方都要修改
// Master 中
const platformsDir = path.join(__dirname, '../../../../../...');
// Worker 中
const platformsDir = path.join(__dirname, 'platforms');

// ✅ 修改后：只需一处修改
const platformsDir = PATHS.worker.platforms;
```

### 2. 可维护性 (Maintainability)
```javascript
// ✅ 修改路径结构时，只需修改 packages/shared/config/paths.js
// 自动应用到 Master、Worker 和所有其他模块
PATHS.worker.platforms = path.join(PROJECT_ROOT, 'packages/worker/src/platforms');
```

### 3. 可测试性 (Testability)
```javascript
// ✅ 易于在测试中 Mock 配置
const mockPATHS = { worker: { platforms: '/mock/path' } };
jest.mock('@hiscrm-im/shared/config/paths', () => mockPATHS);
```

### 4. 可扩展性 (Extensibility)
```javascript
// ✅ 未来可轻松添加新的配置
PATHS.cache = path.join(PROJECT_ROOT, '.cache');
PATHS.uploads = path.join(PROJECT_ROOT, 'uploads');
PATHS.temp = path.join(PROJECT_ROOT, 'temp');
```

---

## 📊 使用统计

### 导入 Shared 库的模块

```
Master 模块:
  • index.js - createLogger, PATHS, protocol messages
  • api/routes/platforms.js - createLogger, PATHS
  • communication/socket-server.js - createLogger, protocol

Worker 模块:
  • index.js - createLogger, PATHS, protocol messages
  • platform-manager.js - createLogger, PATHS
  • handlers/task-runner.js - createLogger, protocol

Admin Web:
  • API 调用 Master 提供的配置
```

---

## 🚀 最佳实践

### 1. 导入时使用完整路径
```javascript
// ✅ 推荐：明确指定子模块
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { PATHS } = require('@hiscrm-im/shared/config/paths');

// ❌ 不推荐：通过主入口导入（可能丢失导出）
const logger = require('@hiscrm-im/shared').createLogger;
```

### 2. 在模块初始化时创建 Logger
```javascript
// ✅ 推荐：在模块顶部创建
const logger = createLogger('module-name');

// 后续在函数中使用
function doSomething() {
  logger.info('Doing something');
}
```

### 3. 使用 PATHS 配置而不是硬编码路径
```javascript
// ✅ 推荐
const platformsDir = PATHS.worker.platforms;

// ❌ 不推荐
const platformsDir = path.join(__dirname, '../platforms');
```

### 4. 验证路径存在
```javascript
// ✅ 推荐
const { validatePath } = require('@hiscrm-im/shared/config/paths');
validatePath('platforms', PATHS.worker.platforms);

// 或自己检查
if (!fs.existsSync(PATHS.worker.platforms)) {
  logger.warn('Platforms directory not found');
}
```

---

## 📚 相关文档

- [15-共享路径配置系统.md](./15-共享路径配置系统.md) - 路径配置详解
- [02-MASTER-系统文档.md](./02-MASTER-系统文档.md) - Master 使用 Shared 库
- [03-WORKER-系统文档-第一部分.md](./03-WORKER-系统文档-第一部分.md) - Worker 使用 Shared 库

---

## ✅ 完成清单

- ✅ Shared 库已包含 config/paths.js
- ✅ Master 和 Worker 均从 Shared 导入
- ✅ 所有模块共享相同的 logger、protocol、utils
- ✅ 路径配置已实现单一数据源原则
- ✅ 系统具有高度的一致性和可维护性

---

## 🔮 未来改进空间

1. **环境特定配置**
   ```javascript
   // 可在 config/ 中添加环境配置文件
   config/
   ├── paths.js           // 通用路径
   ├── development.js     // 开发环境
   ├── production.js      // 生产环境
   └── test.js           // 测试环境
   ```

2. **动态模块加载**
   ```javascript
   // 支持运行时添加新的 Shared 模块
   SHARED.registerModule('cache', cacheModule);
   ```

3. **插件系统**
   ```javascript
   // Shared 库作为插件基础
   const plugin = require('@hiscrm-im/shared/plugins/xxx');
   ```

---

**文档完成日期**: 2025-10-20
**Shared 库版本**: 1.0.0
**状态**: ✅ 完整集成
