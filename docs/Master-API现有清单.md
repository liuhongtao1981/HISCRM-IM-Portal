# Master API 现有清单

**更新时间**: 2025-10-23

**统计**: 50+ 个接口，9 个模块

---

## 📊 总体统计表格

### 模块统计

| 序号 | 模块 | 接口数 | 状态 | 完整度 | 文件 |
|-----|------|--------|------|--------|------|
| 1 | 账户管理 | 6 | ✅ | 100% | accounts.js |
| 2 | 消息相关 | 4 | ⚠️ | 75% | messages.js |
| 3 | 回复功能 | 4 | ⚠️ | 75% | replies.js |
| 4 | Worker管理 | 11 | ✅ | 100% | workers.js + worker-lifecycle.js |
| 5 | Worker配置 | 7 | ✅ | 100% | worker-configs.js |
| 6 | 代理管理 | 6 | ✅ | 100% | proxies.js |
| 7 | 平台管理 | 3 | ✅ | 100% | platforms.js |
| 8 | 统计分析 | 2 | ✅ | 100% | statistics.js |
| 9 | 调试接口 | 5 | 🔧 | DEBUG | debug-api.js |
| **总计** | **9 个模块** | **50+** | - | **94%** | - |

### 状态说明

| 状态 | 含义 | 接口数 |
|------|------|--------|
| ✅ 完整 | 功能完全实现 | 32 个 |
| ⚠️ 部分 | 有基础功能但需改进 | 8 个 |
| 🔧 DEBUG | 仅在调试模式启用 | 5 个 |
| **总计** | **Master API** | **50+** |

### 与原版 IM 对标

| 类别 | 原版 IM | Master 现有 | 完整度 |
|-----|--------|-----------|--------|
| 账户管理 | 6 | 6 | ✅ **100%** |
| 会话查询 | 4 | 1 | ⚠️ 25% |
| 消息查询 | 6 | 2 | ⚠️ 33% |
| 消息操作 | 5 | 1 | ⚠️ 20% |
| 用户管理 | 3 | 0 | ❌ 0% |
| **总计** | **24** | **10** | **42%** |

**说明**: Master 对原版 IM 的兼容度为 42%，主要集中在账户管理领域。

---

## 一、账户管理接口 (6 个) ✅

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 1 | GET | `/api/v1/accounts` | 获取账户列表 | `status`, `platform` | ✅ |
| 2 | GET | `/api/v1/accounts/:id` | 获取单个账户 | - | ✅ |
| 3 | GET | `/api/v1/accounts/status/all` | 获取账户状态详情 | `sort`, `order` | ✅ |
| 4 | POST | `/api/v1/accounts` | 创建账户 | - | ✅ |
| 5 | PATCH | `/api/v1/accounts/:id` | 更新账户 | - | ✅ |
| 6 | DELETE | `/api/v1/accounts/:id` | 删除账户 | - | ✅ |

**文件**: `packages/master/src/api/routes/accounts.js`

**关键字段说明**:
```javascript
// 创建账户请求体
{
  "platform": "douyin",
  "account_name": "张三的抖音号",
  "account_id": "user_123",  // 可选，自动生成 temp_xxx_xxx
  "credentials": {...},      // 可选
  "monitor_interval": 20,    // 可选
  "assigned_worker_id": "worker-1"  // 可选
}

// 账户响应 (GET)
{
  "id": "acc_123",
  "platform": "douyin",
  "account_name": "张三的抖音号",
  "account_id": "user_123",
  "login_status": "logged_in",     // not_logged_in, logging_in, logged_in, login_failed
  "status": "active",               // active, inactive, error
  "assigned_worker_id": "worker-1",
  "created_at": 1697980000,
  "updated_at": 1697980000
}
```

---

## 二、消息相关接口 (4 个) ⚠️

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 7 | GET | `/api/v1/messages` | 查询消息历史 | `account_id`, `type`, `is_read`, `page`, `limit` | ⚠️ |
| 8 | POST | `/api/v1/messages/:id/read` | 标记消息已读 | - | ⚠️ |
| 9 | GET | `/api/v1/comments` | 查询评论列表 | `account_id`, `sort`, `order`, `limit` | ⚠️ |
| 10 | GET | `/api/v1/direct-messages` | 查询私信列表 | `account_id`, `direction`, `sort`, `limit` | ⚠️ |

**文件**: `packages/master/src/api/routes/messages.js`

**关键字段说明**:
```javascript
// 获取消息列表请求
GET /api/v1/messages?account_id=acc_123&type=comment&page=1&limit=20

// 消息响应 (comments)
{
  "id": "comment_123",
  "account_id": "acc_123",
  "conversation_id": "video_456",    // 视频 ID
  "sender_id": "user_789",
  "sender_name": "李四",
  "content": "这个视频很有趣",
  "type": "text",                    // text, image, video, etc.
  "created_at": 1697980000,
  "detected_at": 1697980001,
  "is_read": false,
  "reply_count": 5
}

// 消息响应 (direct_messages)
{
  "id": "dm_123",
  "account_id": "acc_123",
  "conversation_id": "user_789",     // 对方用户 ID
  "sender_id": "user_789",
  "sender_name": "李四",
  "content": "你好，这是一条私信",
  "type": "text",
  "direction": "inbound",            // inbound, outbound
  "created_at": 1697980000,
  "is_read": false
}

// 标记已读请求
POST /api/v1/messages/msg_123/read
{
  "type": "comment"  // 或 "direct_message"
}
```

**⚠️ 问题**:
- 无 cursor 分页，仅支持 offset/limit
- 标记已读只支持单条，无批量
- 无搜索功能
- 无会话详情端点

---

## 三、回复功能接口 (4 个) ⚠️

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 11 | POST | `/api/v1/replies` | 提交回复请求 | - | ⚠️ |
| 12 | GET | `/api/v1/replies/:replyId` | 查询单个回复 | - | ⚠️ |
| 13 | GET | `/api/v1/replies` | 查询回复列表 | `account_id`, `status`, `limit` | ⚠️ |
| 14 | GET | `/api/v1/replies/account/:accountId/stats` | 回复统计 | - | ⚠️ |

**文件**: `packages/master/src/api/routes/replies.js`

**关键字段说明**:
```javascript
// 提交回复请求
POST /api/v1/replies
{
  "request_id": "req_unique_123",    // 防重复
  "account_id": "acc_123",
  "target_type": "comment",          // 或 "direct_message"
  "target_id": "comment_456",
  "reply_content": "我的回复内容",
  "video_id": "video_789",           // 可选
  "user_id": "user_000",             // 可选
  "context": {...}                   // 可选
}

// 回复响应
{
  "id": "reply_123",
  "status": "pending",               // pending, executing, success, failed
  "account_id": "acc_123",
  "target_type": "comment",
  "target_id": "comment_456",
  "reply_content": "我的回复内容",
  "created_at": 1697980000,
  "updated_at": 1697980001,
  "error": null
}

// 统计响应
{
  "total": 100,
  "pending": 10,
  "executing": 2,
  "success": 80,
  "failed": 8,
  "success_rate": 0.80,
  "avg_execution_time": 2.5
}
```

**⚠️ 问题**:
- 仅支持通过 Worker 异步发送回复，无 HTTP API 直接发送
- 无编辑、删除功能

---

## 四、Worker 相关接口 (11 个) ✅

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 15 | GET | `/api/v1/workers` | 获取Worker列表 | `status` | ✅ |
| 16 | GET | `/api/v1/workers/:id` | 获取Worker详情 | - | ✅ |
| 17 | POST | `/api/v1/worker-lifecycle/:id/start` | 启动Worker | - | ✅ |
| 18 | POST | `/api/v1/worker-lifecycle/:id/stop` | 停止Worker | - | ✅ |
| 19 | POST | `/api/v1/worker-lifecycle/:id/restart` | 重启Worker | - | ✅ |
| 20 | GET | `/api/v1/worker-lifecycle/:id/status` | 获取Worker状态 | - | ✅ |
| 21 | GET | `/api/v1/workers/status/all` | 获取所有Worker状态 | - | ✅ |
| 22 | GET | `/api/v1/workers/:id/logs` | 获取Worker日志 | `tail`, `stream` | ✅ |
| 23 | POST | `/api/v1/workers/batch` | 批量操作Worker | - | ✅ |
| 24 | GET | `/api/v1/workers/stats/overview` | Worker统计 | - | ✅ |
| 25 | GET | `/api/v1/workers/:id/health` | Worker健康检查 | - | ✅ |

**文件**:
- `packages/master/src/api/routes/workers.js`
- `packages/master/src/api/routes/worker-lifecycle.js`

**关键字段说明**:
```javascript
// Worker 响应
{
  "id": "worker-1",
  "status": "connected",             // connected, disconnected, offline
  "platform_id": "config_123",
  "last_heartbeat": 1697980000,
  "capabilities": ["douyin"],
  "max_accounts": 10,
  "assigned_accounts": 5
}

// 健康检查响应
{
  "status": "healthy",               // healthy, degraded, unhealthy
  "uptime": 3600,
  "memory_usage": 512,               // MB
  "cpu_usage": 45,                   // %
  "error_count": 0,
  "last_heartbeat": 1697980000
}

// 批量操作请求
POST /api/v1/workers/batch
{
  "action": "restart",               // start, stop, restart
  "worker_ids": ["worker-1", "worker-2"],
  "options": {
    "graceful": true,
    "timeout": 30000
  }
}
```

---

## 五、Worker 配置接口 (7 个) ✅

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 26 | GET | `/api/v1/worker-configs` | 获取所有配置 | - | ✅ |
| 27 | GET | `/api/v1/worker-configs/:id` | 获取单个配置 | - | ✅ |
| 28 | GET | `/api/v1/worker-configs/by-worker-id/:worker_id` | 按worker_id查询 | - | ✅ |
| 29 | POST | `/api/v1/worker-configs` | 创建配置 | - | ✅ |
| 30 | PATCH | `/api/v1/worker-configs/:id` | 更新配置 | - | ✅ |
| 31 | DELETE | `/api/v1/worker-configs/:id` | 删除配置 | - | ✅ |
| 32 | GET | `/api/v1/worker-configs/stats/summary` | 配置统计 | - | ✅ |

**文件**: `packages/master/src/api/routes/worker-configs.js`

---

## 六、代理管理接口 (6 个) ✅

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 33 | GET | `/api/v1/proxies` | 获取代理列表 | `status`, `country` | ✅ |
| 34 | GET | `/api/v1/proxies/:id` | 获取单个代理 | - | ✅ |
| 35 | POST | `/api/v1/proxies` | 创建代理 | - | ✅ |
| 36 | PATCH | `/api/v1/proxies/:id` | 更新代理 | - | ✅ |
| 37 | DELETE | `/api/v1/proxies/:id` | 删除代理 | - | ✅ |
| 38 | POST | `/api/v1/proxies/:id/test` | 测试代理 | - | ✅ |

**文件**: `packages/master/src/api/routes/proxies.js`

**关键字段说明**:
```javascript
// 代理请求/响应
{
  "id": "proxy_123",
  "name": "代理名称",
  "server": "proxy.example.com:8080",
  "protocol": "http",                // http, https, socks5
  "username": "user",                // 可选
  "password": "pass",                // 仅写入，不返回
  "has_password": true,
  "country": "CN",
  "city": "Beijing",
  "status": "active",                // active, inactive, testing
  "created_at": 1697980000
}

// 测试响应
{
  "status": "ok",
  "response_time": 250,              // ms
  "timestamp": 1697980000
}
```

---

## 七、平台管理接口 (3 个) ✅

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 39 | GET | `/api/v1/platforms` | 获取所有平台 | - | ✅ |
| 40 | GET | `/api/v1/platforms/:platform` | 获取平台详情 | - | ✅ |
| 41 | GET | `/api/v1/platforms/stats/summary` | 平台统计 | - | ✅ |

**文件**: `packages/master/src/api/routes/platforms.js`

**关键字段说明**:
```javascript
// 平台响应
{
  "platform": "douyin",
  "display_name": "抖音",
  "accounts_count": 10,
  "active_accounts": 8,
  "error_accounts": 2
}
```

---

## 八、统计分析接口 (2 个) ✅

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 42 | GET | `/api/v1/statistics` | 详细统计 | `account_id`, `start_time`, `end_time`, `group_by` | ✅ |
| 43 | GET | `/api/v1/statistics/summary` | 简要统计 | - | ✅ |

**文件**: `packages/master/src/api/routes/statistics.js`

---

## 九、调试接口 (5 个) 🔧

| # | HTTP方法 | 路径 | 功能 | 查询参数 | 状态 |
|---|---------|------|------|---------|------|
| 44 | GET | `/api/debug/browser-status` | 浏览器状态 | - | 🔧 |
| 45 | GET | `/api/debug/accounts/:accountId` | 账户详情 | - | 🔧 |
| 46 | GET | `/api/debug/messages/:accountId` | 消息列表 | `limit`, `offset` | 🔧 |
| 47 | GET | `/api/debug/workers` | 所有Worker | - | 🔧 |
| 48 | GET | `/api/debug/workers/:workerId` | Worker详情 | - | 🔧 |

**文件**: `packages/master/src/api/routes/debug-api.js`

**说明**: 仅在 DEBUG 模式下启用

---

## 对比总结

### Master 现有 (50+ 接口)
✅ 完整实现：
- 账户管理 (6/6)
- Worker 管理 (11/11)
- Worker 配置 (7/7)
- 代理管理 (6/6)
- 平台管理 (3/3)
- 统计分析 (2/2)

⚠️ 部分实现：
- 消息相关 (4/6) - 缺搜索、会话详情
- 回复功能 (4/5) - 缺HTTP直接发送接口

❌ 未实现：
- 用户信息查询
- 用户黑名单管理
- 消息编辑、删除
- 会话搜索、置顶、静音
- 全文消息搜索

### vs 原版 IM (24 接口)

**完整度**: 42% (10/24)

**分类对标**:
| IM 类别 | 原版数量 | Master 现有 | 完整度 |
|--------|---------|-----------|--------|
| 账户管理 | 6 | 6 | ✅ 100% |
| 会话查询 | 4 | 1 | ⚠️ 25% |
| 消息查询 | 6 | 2 | ⚠️ 33% |
| 消息操作 | 5 | 1 | ⚠️ 20% |
| 用户管理 | 3 | 0 | ❌ 0% |

---

---

## 📈 详细分类统计

### 按接口类型分类

| 接口类型 | 数量 | 特点 |
|---------|------|------|
| **REST 接口** | 35+ | 标准 GET/POST/PATCH/DELETE |
| **RPC 接口** | 8+ | POST 为主，通过路径传参 |
| **Socket.IO** | 多个 | 实时通信 (Master ↔ Client/Worker) |
| **HTTP 流** | 2+ | 日志流、监控数据流 |

### 按功能复杂度分类

| 复杂度 | 接口数 | 说明 | 示例 |
|--------|--------|------|------|
| ⭐ 简单 | 15+ | 直接的增删改查 | 账户CRUD、代理管理 |
| ⭐⭐ 中等 | 20+ | 带过滤、排序、分页 | 消息查询、Worker管理 |
| ⭐⭐⭐ 复杂 | 10+ | 多表联动、事务处理 | 任务调度、生命周期管理 |

### 按数据流向分类

| 方向 | 接口数 | 说明 |
|------|--------|------|
| Client → Master | 35+ | 客户端请求 API |
| Master → Worker | Socket.IO | 心跳、任务分配 |
| Worker → Master | Socket.IO | 状态报告、消息上报 |
| Master → Admin | Socket.IO | 实时通知 |
| Master → Client | Socket.IO | 推送通知 |

---

## 🔗 API 跨域依赖关系

### 模块间调用关系

```
┌─ 账户管理 (Accounts)
│   ├→ Worker 管理 (分配)
│   └→ 消息管理 (查询)
│
├─ Worker 管理 (Workers)
│   ├→ Worker 配置 (关联)
│   ├→ 代理管理 (分配)
│   └→ 回复功能 (执行)
│
├─ 消息管理 (Messages)
│   ├→ 账户管理 (验证)
│   └→ 回复功能 (分发)
│
├─ 回复功能 (Replies)
│   ├→ Worker 管理 (分配)
│   └→ 消息管理 (更新)
│
└─ 其他 (代理、平台、统计)
    └→ 相对独立
```

---

## ⚡ 性能指标

### 接口响应时间 (估计)

| 接口类型 | 响应时间 | 瓶颈 |
|---------|---------|------|
| 单条查询 | <100ms | 数据库查询 |
| 列表查询 (分页) | 100-500ms | 数据库 + 排序 |
| 创建/更新 | 50-200ms | 数据库写入 |
| 删除 | 50-200ms | 数据库写入 |
| Worker 操作 | 500ms-5s | 进程通信 + 启动 |
| Socket.IO 实时 | <50ms | 内存队列 |

### 存储空间占用

| 模块 | 数据量级 | 数据库表 |
|------|---------|---------|
| 账户数据 | ~10-100 | 3 个 |
| 消息数据 | ~10k-1M | 3 个 |
| Worker 数据 | ~10-100 | 4 个 |
| 配置数据 | <1k | 2 个 |
| 代理数据 | ~10-1k | 1 个 |

---

## 🎯 下一步

### 如果要 100% 兼容原版 IM

参考文档：
- [13-Master缺失接口精准对比.md](./13-Master缺失接口精准对比.md) - 缺失接口详细分析 (50h 工作量)
- [API对比-快速参考表.md](./API对比-快速参考表.md) - 快速查询和优先级

### 如果要查看现有接口详情

参考文档：
- [API文档索引.md](./API文档索引.md) - 所有文档导航
- [原版IM-API清单.md](./原版IM-API清单.md) - 原版 IM 完整定义 (对比用)

---

## 📋 Master API 完整清单表格

| # | 分类 | 接口名 | API 端点 | 类型 | 状态 |
|----|------|--------|---------|------|------|
| **账户管理 (6)** |
| 1 | 账户 | 获取列表 | GET /api/v1/accounts | REST | ✅ |
| 2 | 账户 | 获取单个 | GET /api/v1/accounts/:id | REST | ✅ |
| 3 | 账户 | 获取状态详情 | GET /api/v1/accounts/status/all | REST | ✅ |
| 4 | 账户 | 创建 | POST /api/v1/accounts | REST | ✅ |
| 5 | 账户 | 更新 | PATCH /api/v1/accounts/:id | REST | ✅ |
| 6 | 账户 | 删除 | DELETE /api/v1/accounts/:id | REST | ✅ |
| **消息相关 (4)** |
| 7 | 消息 | 查询消息历史 | GET /api/v1/messages | REST | ⚠️ |
| 8 | 消息 | 标记消息已读 | POST /api/v1/messages/:id/read | REST | ⚠️ |
| 9 | 消息 | 查询评论列表 | GET /api/v1/comments | REST | ⚠️ |
| 10 | 消息 | 查询私信列表 | GET /api/v1/direct-messages | REST | ⚠️ |
| **回复功能 (4)** |
| 11 | 回复 | 提交回复请求 | POST /api/v1/replies | REST | ⚠️ |
| 12 | 回复 | 查询单个回复 | GET /api/v1/replies/:replyId | REST | ⚠️ |
| 13 | 回复 | 查询回复列表 | GET /api/v1/replies | REST | ⚠️ |
| 14 | 回复 | 回复统计 | GET /api/v1/replies/account/:accountId/stats | REST | ⚠️ |
| **Worker 管理 (11)** |
| 15 | Worker | 获取列表 | GET /api/v1/workers | REST | ✅ |
| 16 | Worker | 获取详情 | GET /api/v1/workers/:id | REST | ✅ |
| 17 | Worker | 启动 | POST /api/v1/worker-lifecycle/:id/start | REST | ✅ |
| 18 | Worker | 停止 | POST /api/v1/worker-lifecycle/:id/stop | REST | ✅ |
| 19 | Worker | 重启 | POST /api/v1/worker-lifecycle/:id/restart | REST | ✅ |
| 20 | Worker | 获取状态 | GET /api/v1/worker-lifecycle/:id/status | REST | ✅ |
| 21 | Worker | 获取所有状态 | GET /api/v1/workers/status/all | REST | ✅ |
| 22 | Worker | 获取日志 | GET /api/v1/workers/:id/logs | REST | ✅ |
| 23 | Worker | 批量操作 | POST /api/v1/workers/batch | REST | ✅ |
| 24 | Worker | 统计信息 | GET /api/v1/workers/stats/overview | REST | ✅ |
| 25 | Worker | 健康检查 | GET /api/v1/workers/:id/health | REST | ✅ |
| **Worker 配置 (7)** |
| 26 | 配置 | 获取所有配置 | GET /api/v1/worker-configs | REST | ✅ |
| 27 | 配置 | 获取单个配置 | GET /api/v1/worker-configs/:id | REST | ✅ |
| 28 | 配置 | 按 worker_id 查询 | GET /api/v1/worker-configs/by-worker-id/:worker_id | REST | ✅ |
| 29 | 配置 | 创建配置 | POST /api/v1/worker-configs | REST | ✅ |
| 30 | 配置 | 更新配置 | PATCH /api/v1/worker-configs/:id | REST | ✅ |
| 31 | 配置 | 删除配置 | DELETE /api/v1/worker-configs/:id | REST | ✅ |
| 32 | 配置 | 统计汇总 | GET /api/v1/worker-configs/stats/summary | REST | ✅ |
| **代理管理 (6)** |
| 33 | 代理 | 获取列表 | GET /api/v1/proxies | REST | ✅ |
| 34 | 代理 | 获取单个 | GET /api/v1/proxies/:id | REST | ✅ |
| 35 | 代理 | 创建 | POST /api/v1/proxies | REST | ✅ |
| 36 | 代理 | 更新 | PATCH /api/v1/proxies/:id | REST | ✅ |
| 37 | 代理 | 删除 | DELETE /api/v1/proxies/:id | REST | ✅ |
| 38 | 代理 | 测试连接 | POST /api/v1/proxies/:id/test | REST | ✅ |
| **平台管理 (3)** |
| 39 | 平台 | 获取所有平台 | GET /api/v1/platforms | REST | ✅ |
| 40 | 平台 | 获取平台详情 | GET /api/v1/platforms/:platform | REST | ✅ |
| 41 | 平台 | 平台统计 | GET /api/v1/platforms/stats/summary | REST | ✅ |
| **统计分析 (2)** |
| 42 | 统计 | 详细统计 | GET /api/v1/statistics | REST | ✅ |
| 43 | 统计 | 简要统计 | GET /api/v1/statistics/summary | REST | ✅ |
| **调试接口 (5)** |
| 44 | 调试 | 浏览器状态 | GET /api/debug/browser-status | REST | 🔧 |
| 45 | 调试 | 账户详情 | GET /api/debug/accounts/:accountId | REST | 🔧 |
| 46 | 调试 | 消息列表 | GET /api/debug/messages/:accountId | REST | 🔧 |
| 47 | 调试 | 所有 Worker | GET /api/debug/workers | REST | 🔧 |
| 48 | 调试 | Worker 详情 | GET /api/debug/workers/:workerId | REST | 🔧 |

**说明**:
- ✅ 完整实现
- ⚠️ 部分实现 (需改进)
- 🔧 DEBUG 模式专用

**汇总统计**:
- 总接口数: 48 个
- 完整实现: 32 个 (✅ 67%)
- 部分实现: 8 个 (⚠️ 17%)
- DEBUG 接口: 5 个 (🔧 10%)

---

## 与原版 IM 的对标

| 类别 | 原版 IM | Master 现有 | Master 缺失 | 完整度 |
|-----|--------|-----------|-----------|--------|
| 账户管理 | 6 | 6 | 0 | ✅ **100%** |
| 会话查询 | 4 | 1 | 3 | ⚠️ 25% |
| 消息查询 | 6 | 2 | 4 | ⚠️ 33% |
| 消息操作 | 5 | 1 | 4 | ⚠️ 20% |
| 用户管理 | 3 | 0 | 3 | ❌ 0% |
| **总计** | **24** | **10** | **14** | **42%** |

**结论**: Master 对原版 IM 的兼容度为 42%，主要强在账户管理领域，弱在会话/消息/用户管理。

---

