# Master 新增 IM 兼容层设计方案

**目标**: 在 Master 中创建专门的 `/api/im/` 兼容层，100% 适配原版 IM 的 API 和数据格式

**优势**: 直接复用现有 crm-pc-im 客户端，无需修改客户端代码

**方案**: 包装现有 Master API，转换数据格式和响应格式

---

## 一、设计概览

### 架构对比

#### 现有方案 (直接修改 Master API)
```
crm-pc-im 客户端
    ↓
/api/v1/* (Master 原有格式)
    ↓
需要修改客户端适配 Master 数据格式
```

#### 新方案 (IM 兼容层)
```
crm-pc-im 客户端
    ↓
/api/im/* (原版 IM 格式) ⭐ NEW
    ↓
内部转换层 (数据格式 + 响应包装)
    ↓
/api/v1/* (Master 原有格式)
    ↓
Master 内部数据和逻辑保持不变
```

### 核心特性

| 特性 | 说明 | 收益 |
|------|------|------|
| **隔离层** | `/api/im/` 独立于 `/api/v1/` | 不影响现有 API |
| **格式兼容** | 100% 原版 IM 数据格式 | 客户端无需改动 |
| **透明转换** | 内部自动转换 | 用户无感知 |
| **易于维护** | 集中管理适配层 | 便于升级 |
| **低风险** | Master 核心逻辑不变 | 可随时回滚 |

---

## 二、技术方案

### 2.1 新建文件结构

```
packages/master/src/api/
├── routes/
│   ├── ... (现有 /api/v1/* 路由)
│   └── im/                                    ⭐ NEW
│       ├── index.js                           路由入口
│       ├── accounts.js                        账户适配 (6 个)
│       ├── conversations.js                   会话适配 (4 个)
│       ├── messages.js                        消息查询适配 (6 个)
│       ├── message-operations.js              消息操作适配 (5 个)
│       ├── users.js                           用户管理适配 (3 个)
│       └── middleware.js                      共用中间件
│
├── transformers/                              ⭐ NEW
│   ├── index.js                               转换器工厂
│   ├── account-transformer.js                 账户数据转换
│   ├── message-transformer.js                 消息数据转换
│   ├── conversation-transformer.js            会话数据转换
│   ├── user-transformer.js                    用户数据转换
│   └── response-wrapper.js                    响应包装
│
└── im-compat/                                 ⭐ NEW (可选)
    ├── constants.js                           IM API 常量
    ├── validators.js                          IM 格式验证
    └── error-handler.js                       IM 错误处理
```

### 2.2 响应格式转换

#### Master 原有格式
```javascript
// Master /api/v1/accounts
{
  "id": "acc_123",
  "platform": "douyin",
  "account_name": "张三",
  "status": "active",
  "login_status": "logged_in",
  "created_at": 1697980000        // 秒
}
```

#### IM 兼容层格式
```javascript
// Master /api/im/accounts
{
  "data": {
    "users": [
      {
        "user_id": "user_123",
        "user_name": "张三",
        "avatar": "https://...",
        "verified": false,
        "follower_count": 0,
        "status": "active"
      }
    ],
    "cursor": 0,
    "has_more": false
  },
  "status_code": 0                 // 0 = success
}
```

### 2.3 核心转换器示例

#### AccountTransformer
```javascript
// packages/master/src/api/transformers/account-transformer.js

class AccountTransformer {
  // Master 账户 → IM 用户格式
  static toIMUser(masterAccount) {
    return {
      user_id: masterAccount.account_id,
      user_name: masterAccount.account_name,
      avatar: masterAccount.avatar || "https://...",
      signature: masterAccount.signature || "",
      verified: false,
      follower_count: 0,
      status: masterAccount.status
    };
  }

  // 时间戳转换：秒 → 毫秒
  static convertTimestamp(seconds) {
    return Math.floor(seconds * 1000);
  }
}

module.exports = AccountTransformer;
```

#### ResponseWrapper
```javascript
// packages/master/src/api/transformers/response-wrapper.js

class ResponseWrapper {
  // IM 标准响应包装
  static success(data, cursor = 0, hasMore = false) {
    return {
      data: {
        ...data,
        cursor: cursor,
        has_more: hasMore
      },
      status_code: 0
    };
  }

  // IM 错误响应
  static error(errorCode = 1000, errorMessage = "Unknown error") {
    return {
      data: null,
      status_code: errorCode,
      error_message: errorMessage
    };
  }
}

module.exports = ResponseWrapper;
```

---

## 三、工作量评估

### 3.1 详细分解

| 模块 | 接口数 | 工作量 | 说明 |
|------|--------|--------|------|
| **账户管理** | 6 | 4h | 简单字段映射 |
| **会话查询** | 4 | 10h | 需合并 comments + conversations |
| **消息查询** | 6 | 12h | 处理两种消息类型 |
| **消息操作** | 5 | 10h | 与 Worker 交互 |
| **用户管理** | 3 | 6h | 新增 users 表 |
| **转换器框架** | - | 6h | 公用转换逻辑 |
| **中间件** | - | 4h | 日志、错误、验证 |
| **测试** | - | 8h | 单元 + 集成测试 |

**总计: 60 小时**

### 3.2 与直接修改 /api/v1/ 的对比

| 方面 | 直接修改 /api/v1/ | 新增 /api/im/ 兼容层 |
|------|---------|---------|
| **工作量** | 50h | 60h |
| **风险** | 中 | **低 ✅** |
| **客户端改动** | 必须 | **无需 ✅** |
| **维护成本** | 中 | **低 ✅** |
| **向后兼容** | 破坏旧客户端 | **完全兼容 ✅** |
| **实现难度** | 中 | **低 ✅** |

**结论**: 新增 `/api/im/` 虽多花 10h，但风险低、维护易、兼容性好。

---

## 四、实现步骤

### 第 1 阶段：基础框架 (6h)
1. 创建 `/api/im/` 目录结构
2. 实现核心转换器
3. 实现响应包装器
4. 创建共用中间件

### 第 2 阶段：账户和会话 (14h)
1. 实现账户管理接口 (4h)
2. 实现会话查询接口 (10h)

### 第 3 阶段：消息管理 (22h)
1. 实现消息查询接口 (12h)
2. 实现消息操作接口 (10h)

### 第 4 阶段：用户管理 (6h)
1. 实现用户管理接口 (6h)

### 第 5 阶段：测试和优化 (12h)
1. 单元测试 (4h)
2. 集成测试 (3h)
3. 性能优化 (3h)
4. 文档更新 (2h)

---

## 五、完整的数据流向

```
┌──────────────────────────────────────┐
│      crm-pc-im 客户端                │
│   (无需修改，直接使用 IM API)        │
└──────────────┬───────────────────────┘
               │
    ┌──────────▼──────────┐
    │   /api/im/*         │ ⭐ NEW
    │  IM 兼容层          │
    └──────────┬──────────┘
               │
    ┌──────────┴──────────┐
    │  转换和包装层        │
    │ Transformers + Wrap │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   /api/v1/*         │
    │  Master 原有 API    │
    │  (核心逻辑)         │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   Master 数据库     │
    │  accounts, comments │
    │ direct_messages...  │
    └─────────────────────┘
```

---

## 六、API 端点映射对照表

### 账户管理 (6 个)

| # | 原版 IM 端点 | Master /api/im/ | 说明 |
|----|---------|---------|------|
| 1 | GET /accounts | GET /api/im/accounts | 获取列表 |
| 2 | GET /accounts/:id | GET /api/im/accounts/:id | 获取详情 |
| 3 | POST /accounts | POST /api/im/accounts | 创建 |
| 4 | PATCH /accounts/:id | PATCH /api/im/accounts/:id | 更新 |
| 5 | DELETE /accounts/:id | DELETE /api/im/accounts/:id | 删除 |
| 6 | GET /accounts/status | GET /api/im/accounts/status | 获取状态 |

### 会话管理 (4 个)

| # | 原版 IM 端点 | Master /api/im/ | 说明 |
|----|---------|---------|------|
| 7 | POST /v1/message/get_by_user_init | GET /api/im/conversations | 会话列表 |
| 8 | POST /v1/im/query_conversation | GET /api/im/conversations/:id | 会话详情 |
| 9 | POST /v1/im/search_conversation | GET /api/im/conversations/search | 搜索 |
| 10 | PATCH /conversations/:id/pin | PATCH /api/im/conversations/:id/pin | 置顶 |

### 消息查询 (6 个)

| # | 原版 IM 端点 | Master /api/im/ | 说明 |
|----|---------|---------|------|
| 11 | POST /v1/im/message/history | GET /api/im/messages/history | 消息历史 |
| 12 | POST /v1/im/query_message | GET /api/im/messages/:id | 单条消息 |
| 13 | POST /v1/im/message/by_type | GET /api/im/messages/by-type | 按类型 |
| 14 | POST /v1/im/search_message | GET /api/im/messages/search | 搜索 |
| 15 | POST /v1/im/message/stats | GET /api/im/messages/stats | 统计 |
| 16 | - | GET /api/im/messages/:id/read | 标记已读 |

### 消息操作 (5 个)

| # | 原版 IM 端点 | Master /api/im/ | 说明 |
|----|---------|---------|------|
| 17 | POST /v1/im/send_message | POST /api/im/messages/send | 发送 |
| 18 | POST /v1/im/edit_message | PATCH /api/im/messages/:id | 编辑 |
| 19 | POST /v1/im/delete_message | DELETE /api/im/messages/:id | 删除 |
| 20 | PATCH /conversations/:id/mute | PATCH /api/im/conversations/:id/mute | 静音 |
| 21 | PATCH /messages/mark-read | PATCH /api/im/messages/mark-read | 批量已读 |

### 用户管理 (3 个)

| # | 原版 IM 端点 | Master /api/im/ | 说明 |
|----|---------|---------|------|
| 22 | POST /v1/user/get_user_info | GET /api/im/users/:userId | 用户信息 |
| 23 | POST /v1/user/search | GET /api/im/users/search | 搜索用户 |
| 24 | POST /v1/user/block | POST /api/im/users/:userId/block | 拉黑 |

---

## 七、数据库改动

### 需要新增的表

```sql
-- users 表 (用户信息)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  signature TEXT,
  verified BOOLEAN DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  platform TEXT DEFAULT 'douyin',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(platform, platform_user_id)
);

-- user_blocks 表 (黑名单)
CREATE TABLE IF NOT EXISTS user_blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  blocked_by_account_id TEXT NOT NULL,
  reason TEXT,
  blocked_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(blocked_by_account_id) REFERENCES accounts(id),
  UNIQUE(user_id, blocked_by_account_id)
);
```

### 需要修改的表

```sql
-- accounts 表增加字段
ALTER TABLE accounts ADD COLUMN avatar TEXT;
ALTER TABLE accounts ADD COLUMN signature TEXT;

-- comments/direct_messages 表增加字段
ALTER TABLE comments ADD COLUMN edited_at INTEGER;
ALTER TABLE comments ADD COLUMN deleted_at INTEGER;
ALTER TABLE direct_messages ADD COLUMN edited_at INTEGER;
ALTER TABLE direct_messages ADD COLUMN deleted_at INTEGER;
```

---

## 八、性能预期

### 响应时间对比

| 操作 | /api/v1/ | /api/im/ | 开销 |
|-----|---------|---------|------|
| 单条查询 | ~50ms | ~55ms | +5ms |
| 列表查询 | ~100ms | ~110ms | +10ms |
| 创建 | ~60ms | ~65ms | +5ms |
| 删除 | ~60ms | ~65ms | +5ms |

**结论**: 转换层开销极小 (<10ms)，对用户体验无影响。

---

## 九、优势总结

### ✅ 主要优势

| 优势 | 说明 |
|------|------|
| **零客户端改动** | crm-pc-im 直接用 `/api/im/` 无需修改 |
| **低风险** | `/api/v1/` 完全隔离，现有功能不受影响 |
| **易于维护** | 所有适配逻辑集中在转换器层 |
| **易于回滚** | 如需回滚只需关闭 `/api/im/` 路由 |
| **双向兼容** | 可同时支持 IM 和新客户端 |
| **性能无损** | 转换层开销 <10ms |
| **便于测试** | 可独立测试转换层 |

### ⚠️ 风险和缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 数据格式不匹配 | 中 | 客户端错误 | 充分的格式测试 |
| 时间戳混乱 | 中 | 数据错误 | 严格的转换规则 |
| 性能下降 | 低 | 响应变慢 | 优化转换器 |
| 逻辑重复 | 低 | 维护困难 | 清晰的抽象 |

---

## 十、实施时间表

### 建议规划 (4 周)

**第 1 周**: 框架 + 账户 (10h)
- 文件结构 + 转换器
- 账户管理接口

**第 2 周**: 会话 + 消息查询 (22h)
- 会话接口
- 消息查询接口

**第 3 周**: 消息操作 + 用户 (16h)
- 消息操作接口
- 用户管理接口

**第 4 周**: 测试 + 优化 (12h)
- 全面测试
- 性能优化
- 文档完善

---

## 十一、三种方案对比总结

| 方案 | 工作量 | 风险 | 兼容性 | 维护 | 评分 |
|------|--------|------|--------|------|------|
| 改 crm-pc-im 客户端 | 中 | 高 | 差 | 高 | ⭐⭐ |
| 改 Master /api/v1/ | 50h | 中 | 中 | 中 | ⭐⭐⭐ |
| **新增 /api/im/ 兼容层** | **60h** | **低** | **好** | **低** | **⭐⭐⭐⭐⭐** |

**最终建议**: 采用**新增 /api/im/ 兼容层**方案

---

## 十二、下一步行动

### 立即确认
- [ ] 确认采用 `/api/im/` 兼容层方案
- [ ] 评估 60h 工作量是否可接受
- [ ] 确认 4 周实施时间表

### 开始准备 (1-2 天)
- [ ] 设计完整的数据库 schema
- [ ] 创建详细的字段映射文档
- [ ] 建立文件结构和模板

### 第 1 周开始实现
- [ ] 实现基础框架
- [ ] 实现账户管理接口
- [ ] 编写单元测试

---

