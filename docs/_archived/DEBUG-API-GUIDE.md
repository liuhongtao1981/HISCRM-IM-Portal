# DEBUG API 使用指南

## 概述

DEBUG API 是在Master DEBUG模式下启用的REST API，用于实时监控系统状态、浏览器执行情况和回复任务进度。

**基础URL**: `http://127.0.0.1:3000/api/debug`

## 启用DEBUG模式

### 1. 配置 `.env.debug` 文件

```bash
# packages/master/.env.debug
DEBUG=true
DEBUG_MCP=true
DEBUG_AUTO_START=true
DEBUG_LOG_LEVEL=debug
DEBUG_HEADLESS=false
```

### 2. 启动Master

```bash
cd packages/master
npm start
```

## 可用的API端点

### 1. 获取所有账户和浏览器状态

```bash
GET /api/debug/browser-status
```

**响应示例**:
```json
{
  "timestamp": 1761016301471,
  "totalAccounts": 1,
  "accounts": [
    {
      "id": "acc-35199aa6-967b-4a99-af89-c122bf1f5c52",
      "platform": "douyin",
      "accountName": "test-account-1760961569752",
      "loginStatus": "logged_in",
      "status": "active"
    }
  ]
}
```

**用途**: 快速查看系统中所有账户的状态和登录情况

---

### 2. 获取特定账户的详细信息

```bash
GET /api/debug/accounts/:accountId
```

**参数**:
- `accountId` (path): 账户ID

**示例**:
```bash
curl http://127.0.0.1:3000/api/debug/accounts/acc-35199aa6-967b-4a99-af89-c122bf1f5c52
```

**响应示例**:
```json
{
  "id": "acc-35199aa6-967b-4a99-af89-c122bf1f5c52",
  "platform": "douyin",
  "accountName": "test-account-1760961569752",
  "platformUserId": "1864722759",
  "loginStatus": "logged_in",
  "status": "active",
  "createdAt": 1760961569,
  "updatedAt": 1761014025
}
```

**用途**: 获取账户详情，包括平台信息和登录状态

---

### 3. 获取账户的私信列表

```bash
GET /api/debug/messages/:accountId
```

**参数**:
- `accountId` (path): 账户ID
- `limit` (query): 返回数量，默认20
- `offset` (query): 偏移量，默认0

**示例**:
```bash
# 获取最近5条消息
curl "http://127.0.0.1:3000/api/debug/messages/acc-35199aa6-967b-4a99-af89-c122bf1f5c52?limit=5"
```

**响应示例**:
```json
{
  "accountId": "acc-35199aa6-967b-4a99-af89-c122bf1f5c52",
  "totalMessages": 5,
  "messages": [
    {
      "id": "dm-98c2de23-cd11-4833-a6c5-cc5d6a61bab4",
      "content": "hello ...",
      "isNew": false,
      "createdAt": 1760971112
    }
  ],
  "pagination": {
    "limit": 5,
    "offset": 0
  }
}
```

**用途**: 查看账户接收到的私信内容

---

### 4. 获取所有Worker状态

```bash
GET /api/debug/workers
```

**响应示例**:
```json
{
  "timestamp": 1761016543457,
  "totalWorkers": 7,
  "workers": [
    {
      "id": "worker1",
      "host": "127.0.0.1",
      "port": 4000,
      "status": "online",
      "version": "1.0.0",
      "lastHeartbeat": 1761016539,
      "startedAt": 1760961711
    },
    {
      "id": "worker-04e60403",
      "host": "127.0.0.1",
      "port": 4000,
      "status": "offline",
      "version": "1.0.0",
      "lastHeartbeat": 1760972729,
      "startedAt": 1760972569
    }
  ]
}
```

**用途**: 监控所有Worker的在线状态

---

### 5. 获取特定Worker的详细信息

```bash
GET /api/debug/workers/:workerId
```

**参数**:
- `workerId` (path): Worker ID

**示例**:
```bash
curl http://127.0.0.1:3000/api/debug/workers/worker1
```

**响应示例**:
```json
{
  "id": "worker1",
  "host": "127.0.0.1",
  "port": 4000,
  "status": "online",
  "version": "1.0.0",
  "lastHeartbeat": 1761016539,
  "startedAt": 1760961711,
  "assignedAccountsCount": 1,
  "accounts": [
    {
      "id": "acc-35199aa6-967b-4a99-af89-c122bf1f5c52",
      "platform": "douyin",
      "accountName": "test-account-1760961569752",
      "loginStatus": "logged_in",
      "status": "active"
    }
  ]
}
```

**用途**: 查看Worker分配的账户和状态

---

## 使用场景

### 场景1: 监控回复任务进度

```bash
# 1. 首先查看账户状态
curl http://127.0.0.1:3000/api/debug/browser-status

# 2. 发送回复请求
curl -X POST http://127.0.0.1:3000/api/v1/replies \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "account_id": "acc-35199aa6-967b-4a99-af89-c122bf1f5c52",
    "target_type": "direct_message",
    "target_id": "7437896255660017187",
    "reply_content": "谢谢你的消息！"
  }'

# 3. 返回reply_id，例如: reply-95eaf423-ab5c-44bc-85e2-da002311027a

# 4. 定期查询回复状态
curl http://127.0.0.1:3000/api/v1/replies/reply-95eaf423-ab5c-44bc-85e2-da002311027a

# 5. 查看Worker是否在线和忙碌状态
curl http://127.0.0.1:3000/api/debug/workers/worker1
```

### 场景2: 诊断Worker连接问题

```bash
# 1. 检查Worker列表
curl http://127.0.0.1:3000/api/debug/workers

# 2. 查看在线Worker数量
# 如果都是 "offline"，可能需要检查Worker进程是否启动

# 3. 检查特定Worker的分配账户
curl http://127.0.0.1:3000/api/debug/workers/worker1

# 4. 如果没有返回账户信息，可能是assignments配置问题
```

### 场景3: 调试私信回复故障

```bash
# 1. 获取账户的私信列表（了解有哪些待回复消息）
curl "http://127.0.0.1:3000/api/debug/messages/acc-35199aa6-967b-4a99-af89-c122bf1f5c52?limit=10"

# 2. 检查账户是否登录
curl http://127.0.0.1:3000/api/debug/browser-status

# 3. 如果账户未登录 (loginStatus != "logged_in")，回复会失败

# 4. 检查负责该账户的Worker
curl http://127.0.0.1:3000/api/debug/workers
# 查看哪个Worker的assignedAccountsCount > 0

# 5. 检查该Worker的最后心跳时间
# 如果lastHeartbeat 离现在太远，可能Worker已离线
```

## 常见问题

### Q: 为什么我的回复一直显示 "executing" 状态？

**A**: 这表示Worker已收到任务但尚未完成。可能的原因：
1. Worker还在处理任务（加载抖音页面、定位元素等）
2. 网络延迟
3. Playwright执行缓慢
4. CSS选择器可能已过时

使用DEBUG API检查：
```bash
# 1. Worker是否在线
curl http://127.0.0.1:3000/api/debug/workers

# 2. 账户是否登录
curl http://127.0.0.1:3000/api/debug/browser-status

# 3. 查看Master日志了解更多信息
tail -f packages/master/logs/master.log
```

### Q: 如何实时观看浏览器执行回复？

**A**: 使用Anthropic MCP连接Chrome DevTools：

```
1. 浏览器访问: http://localhost:9222
2. 选择要调试的页面
3. 可以看到实时的DOM、控制台输出和网络请求
```

### Q: DEBUG API返回 "no such column" 错误？

**A**: 这通常说明数据库schema与查询不匹配。可能的解决方案：
1. 运行数据库迁移：`npm run migrate:master`
2. 检查accounts表的实际列名
3. 使用 `browser-status` 端点替代（它更稳定）

## 监控脚本示例

### Bash脚本：定时检查系统状态

```bash
#!/bin/bash

# 检查Master是否在线
check_master() {
  status=$(curl -s http://127.0.0.1:3000/health | jq '.status' 2>/dev/null)
  if [ "$status" = '"ok"' ]; then
    echo "✅ Master: 在线"
  else
    echo "❌ Master: 离线"
  fi
}

# 检查Worker状态
check_workers() {
  workers=$(curl -s http://127.0.0.1:3000/api/debug/workers | jq '.workers | length')
  online=$(curl -s http://127.0.0.1:3000/api/debug/workers | jq '[.workers[] | select(.status=="online")] | length')
  echo "✅ Workers: $online/$workers 在线"
}

# 检查账户状态
check_accounts() {
  accounts=$(curl -s http://127.0.0.1:3000/api/debug/browser-status | jq '.accounts | length')
  echo "✅ 账户: $accounts 个"
}

# 主循环
while true; do
  clear
  echo "=== 系统状态监控 $(date) ==="
  check_master
  check_workers
  check_accounts
  echo ""
  echo "30秒后刷新..."
  sleep 30
done
```

## 限制和注意事项

- DEBUG API 仅在DEBUG模式下启用，生产环境应该禁用
- API响应可能包含敏感信息，生产环境应该限制访问
- 某些端点可能需要修复（如 GET /api/debug/workers/:workerId）
- 错误响应可能在将来改进

## 反馈和改进

如果您发现DEBUG API的问题或有改进建议，请检查：
- Master日志: `packages/master/logs/master.log`
- Worker日志: `packages/worker/logs/worker.log`
- 数据库: `packages/master/data/master.db`
