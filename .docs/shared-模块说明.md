# Shared 模块说明文档

## 📋 概述

`packages/shared` 是一个**共享模块**，为整个 HISCRM-IM 系统提供**通用的工具函数、数据模型和协议定义**。

这个模块被其他所有模块引用（Master、Worker、Admin Web、Desktop Client），确保系统各部分使用统一的标准和定义。

## 🎯 主要作用

### 1. 避免代码重复
- 所有服务共享同一套工具和模型
- 减少重复代码，提高代码复用率

### 2. 保证一致性
- 统一的数据模型定义
- 统一的通信协议
- 统一的日志格式

### 3. 便于维护
- 修改一处，所有服务同步更新
- 集中管理共享逻辑

## 📁 模块结构

```
packages/shared/
├── index.js                    # 模块入口，导出所有共享内容
├── package.json                # 依赖配置
│
├── protocol/                   # 通信协议定义
│   ├── messages.js            # Socket.IO 消息类型常量
│   └── events.js              # Socket.IO 事件常量
│
├── models/                     # 数据模型
│   ├── Account.js             # 账户模型（含加密/解密工具）
│   ├── Comment.js             # 评论模型
│   ├── DirectMessage.js       # 私信模型
│   └── Notification.js        # 通知模型
│
└── utils/                      # 工具函数
    ├── logger.js              # Winston 日志工具
    ├── request-id.js          # 请求ID生成
    ├── validator.js           # 数据验证工具
    ├── error-handler.js       # 错误处理工具
    └── retry-strategy.js      # 重试策略工具
```

## 📦 详细内容

### 1. Protocol（通信协议）

#### messages.js - 消息类型定义
定义了所有 Socket.IO 消息类型常量，确保 Master 和 Worker 使用相同的消息类型。

**主要内容**:
```javascript
// Worker → Master
WORKER_REGISTER           // Worker 注册
WORKER_HEARTBEAT          // Worker 心跳
WORKER_MESSAGE_DETECTED   // Worker 上报检测到的消息

// Master → Worker
MASTER_TASK_ASSIGN        // Master 分配任务
MASTER_TASK_REVOKE        // Master 撤销任务
MASTER_SHUTDOWN           // Master 关闭指令

// Client → Master
CLIENT_CONNECT            // 客户端连接
CLIENT_SYNC_REQUEST       // 客户端同步请求

// Master → Client
MASTER_NOTIFICATION_PUSH  // Master 推送通知
```

**使用场景**:
- Master 和 Worker 之间的通信
- Master 和 Client 之间的通信
- 确保消息类型一致，避免拼写错误

#### events.js - 事件常量定义
定义了 Socket.IO 内置事件和自定义事件常量。

**主要内容**:
```javascript
// 内置事件
CONNECT                   // 连接成功
DISCONNECT               // 断开连接
ERROR                    // 错误
RECONNECT                // 重新连接

// 自定义事件
MESSAGE                  // 主要通信通道
```

### 2. Models（数据模型）

#### Account.js - 账户模型
定义账户数据结构和加密/解密工具。

**主要功能**:
```javascript
// 加密账户凭证
encryptCredentials(credentials)

// 解密账户凭证
decryptCredentials(encryptedCredentials)

// 账户类
class Account {
  id                      // 账户ID
  platform                // 平台（douyin, xiaohongshu等）
  account_name            // 账户名称
  credentials             // 加密的凭证
  proxy_id                // 代理ID
  status                  // 状态（active, inactive等）
  assigned_worker_id      // 分配的 Worker ID
  monitor_interval        // 监控间隔（秒）
  created_at             // 创建时间
  updated_at             // 更新时间
}
```

**使用场景**:
- Master 存储账户信息
- Worker 接收账户配置
- 凭证数据加密存储，保证安全

#### Comment.js - 评论模型
定义评论数据结构。

**主要内容**:
```javascript
class Comment {
  id                      // 内部ID
  account_id              // 所属账户ID
  platform_comment_id     // 平台评论ID
  content                 // 评论内容
  author_name             // 作者名称
  author_id               // 作者ID
  post_id                 // 帖子ID
  post_title              // 帖子标题
  is_read                 // 是否已读
  detected_at             // 检测时间
  created_at              // 创建时间
}
```

**使用场景**:
- Worker 爬取评论后创建 Comment 实例
- Master 接收并存储评论数据
- Client 展示评论列表

#### DirectMessage.js - 私信模型
定义私信数据结构。

**主要内容**:
```javascript
class DirectMessage {
  id                      // 内部ID
  account_id              // 所属账户ID
  platform_message_id     // 平台消息ID
  content                 // 消息内容
  sender_name             // 发送者名称
  sender_id               // 发送者ID
  conversation_id         // 会话ID
  is_read                 // 是否已读
  detected_at             // 检测时间
  created_at              // 创建时间
}
```

**使用场景**:
- Worker 爬取私信后创建 DirectMessage 实例
- Master 接收并存储私信数据
- Client 展示私信列表

#### Notification.js - 通知模型
定义通知数据结构。

**主要内容**:
```javascript
class Notification {
  id                      // 通知ID
  account_id              // 账户ID
  type                    // 类型（comment, dm等）
  title                   // 标题
  content                 // 内容
  source_id               // 来源ID（评论ID或私信ID）
  is_read                 // 是否已读
  created_at              // 创建时间
}
```

**使用场景**:
- Master 收到新消息时创建通知
- Client 接收并展示通知
- 桌面客户端弹窗提醒

### 3. Utils（工具函数）

#### logger.js - 日志工具
基于 Winston 的日志工具，提供统一的日志格式。

**主要功能**:
```javascript
// 创建 logger 实例
const logger = createLogger('service-name', './logs');

// 使用
logger.info('Message');
logger.warn('Warning');
logger.error('Error', error);
logger.debug('Debug info');
```

**特性**:
- 彩色控制台输出（开发环境）
- 文件输出（生产环境）
- 自动日志轮转（10MB，最多10个文件）
- 包含时间戳、服务名、请求ID
- 支持 JSON 格式结构化日志

**使用场景**:
- 所有服务的日志记录
- Master、Worker、Client 统一日志格式

#### request-id.js - 请求ID生成
生成唯一的请求ID，用于追踪请求链路。

**主要功能**:
```javascript
// 生成请求ID
const reqId = generateRequestId();
// 输出: "req-1697234567890-abc123"
```

**使用场景**:
- Worker 发送消息时附加请求ID
- Master 处理消息时记录请求ID
- 分布式系统中追踪请求流转

#### validator.js - 数据验证工具
提供通用的数据验证函数。

**主要功能**:
```javascript
// 验证账户ID
validateAccountId(accountId)

// 验证平台名称
validatePlatform(platform)

// 验证监控间隔
validateMonitorInterval(interval)
```

**使用场景**:
- Master 接收到账户配置时验证
- Worker 接收到任务时验证
- API 请求参数验证

#### error-handler.js - 错误处理工具
统一的错误处理和格式化。

**主要功能**:
```javascript
// 格式化错误
formatError(error)

// 创建标准错误响应
createErrorResponse(code, message, details)
```

**使用场景**:
- Worker 遇到错误时格式化后上报
- Master API 返回统一格式的错误

#### retry-strategy.js - 重试策略工具
提供指数退避的重试策略。

**主要功能**:
```javascript
// 计算重试延迟
const delay = calculateRetryDelay(retryCount);
// 输出: 1000, 2000, 4000, 8000...（指数增长）

// 执行带重试的操作
await retryWithBackoff(asyncFunction, maxRetries);
```

**使用场景**:
- Worker 爬取失败时重试
- Socket.IO 连接失败时重试
- 网络请求失败时重试

## 🔗 如何使用

### 在其他模块中引用

```javascript
// 方式1: 引用整个模块
const shared = require('@hiscrm-im/shared');
const logger = shared.logger.createLogger('my-service');

// 方式2: 引用特定部分
const { messages } = require('@hiscrm-im/shared');
const { WORKER_REGISTER } = messages;

// 方式3: 直接引用子模块
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const Comment = require('@hiscrm-im/shared/models/Comment');
```

### 在 package.json 中声明依赖

```json
{
  "dependencies": {
    "@hiscrm-im/shared": "workspace:*"
  }
}
```

## 📊 使用示例

### 示例1: 在 Worker 中使用

```javascript
// packages/worker/src/index.js
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { messages } = require('@hiscrm-im/shared');

const logger = createLogger('worker');

// 发送注册消息
socketClient.sendMessage(messages.WORKER_REGISTER, {
  worker_id: WORKER_ID,
  capabilities: ['douyin'],
});

logger.info('Worker registered');
```

### 示例2: 在 Master 中使用

```javascript
// packages/master/src/index.js
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const Account = require('@hiscrm-im/shared/models/Account');
const { messages } = require('@hiscrm-im/shared');

const logger = createLogger('master');

// 处理 Worker 注册
socketServer.onMessage(messages.WORKER_REGISTER, (msg) => {
  logger.info('Worker registered:', msg.payload.worker_id);
});

// 创建账户
const account = new Account({
  platform: 'douyin',
  account_name: 'test_user',
});
```

### 示例3: 在平台脚本中使用

```javascript
// packages/worker/src/platforms/douyin/platform.js
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const Comment = require('@hiscrm-im/shared/models/Comment');

const logger = createLogger('douyin-platform');

// 创建评论实例
const comment = new Comment({
  account_id: accountId,
  content: '这是一条评论',
  author_name: '张三',
});

const validation = comment.validate();
if (validation.valid) {
  logger.info('Comment is valid');
} else {
  logger.error('Comment validation failed:', validation.errors);
}
```

## 🎯 设计优势

### 1. 统一标准
- 所有服务使用相同的数据模型
- 所有服务使用相同的消息类型
- 所有服务使用相同的日志格式

### 2. 类型安全
- 消息类型使用常量，避免拼写错误
- 数据模型提供验证方法

### 3. 易于维护
- 修改数据模型时，所有服务自动同步
- 添加新字段时，只需修改一处

### 4. 便于测试
- 数据模型可独立测试
- 工具函数可独立测试

### 5. 解耦合
- 服务之间通过共享模块通信
- 不需要直接依赖彼此

## ⚠️ 注意事项

### 1. 版本管理
- Shared 模块的修改会影响所有服务
- 需要谨慎修改，避免破坏兼容性
- 重大变更需要更新所有依赖服务

### 2. 向后兼容
- 添加新字段时提供默认值
- 不要删除现有字段
- 修改字段含义时需要版本迁移

### 3. 依赖管理
- Shared 模块应尽量减少外部依赖
- 当前依赖: winston（日志）、uuid（ID生成）

### 4. 测试覆盖
- 所有工具函数需要单元测试
- 所有数据模型需要验证测试

## 🚀 扩展建议

### 1. 添加新的数据模型
```javascript
// packages/shared/models/Post.js
class Post {
  constructor(data = {}) {
    this.id = data.id;
    this.title = data.title;
    // ...
  }
  
  validate() {
    // 验证逻辑
  }
}

module.exports = Post;
```

### 2. 添加新的工具函数
```javascript
// packages/shared/utils/formatter.js
function formatDate(timestamp) {
  // 格式化逻辑
}

module.exports = { formatDate };
```

### 3. 添加新的消息类型
```javascript
// packages/shared/protocol/messages.js
const WORKER_STATUS_UPDATE = 'worker:status:update';

module.exports = {
  // ... 现有消息类型
  WORKER_STATUS_UPDATE,
};
```

## 📝 总结

`packages/shared` 是 HISCRM-IM 系统的**基础设施模块**，它：

✅ **统一了数据模型** - Account、Comment、DirectMessage、Notification  
✅ **统一了通信协议** - Socket.IO 消息类型和事件常量  
✅ **统一了工具函数** - 日志、验证、错误处理、重试策略  
✅ **保证了一致性** - 所有服务使用相同的标准  
✅ **便于维护** - 修改一处，全局生效  

这个模块是整个系统的**粘合剂**，确保 Master、Worker、Admin Web、Desktop Client 能够**无缝协作**！

---

**更新时间**: 2025-10-16  
**维护人员**: Development Team
