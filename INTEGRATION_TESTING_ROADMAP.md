# 集成测试路线图 - 回复功能

> 阶段: 单元测试完成 ✅ → 集成测试准备中 🟡
> 更新时间: 2025-10-20
> 状态: 准备就绪，可开始集成测试

---

## 📋 集成测试概览

集成测试旨在验证以下三层系统的协调工作：

```
┌─────────────────────┐
│   Admin Web UI      │ (反馈错误、展示成功)
│  (React + Ant Design) │
└──────────┬──────────┘
           │ Socket.IO
           ↓
┌─────────────────────┐
│   Master Server     │ (协调、存储、事件处理)
│  (Node.js + SQLite)  │
└──────────┬──────────┘
           │ Socket.IO
           ↓
┌─────────────────────┐
│  Worker Process     │ (浏览器自动化)
│ (Playwright + Node.js) │
└─────────────────────┘
```

---

## 🎯 集成测试目标

### 主要目标

1. **端到端流程验证**
   - 确保回复请求从 Admin UI 成功到达 Worker
   - 验证回复结果从 Worker 返回到 Master
   - 确保错误通知正确发送到 Admin UI

2. **数据流完整性**
   - 评论/私信 ID 传递正确
   - 回复内容完整无损
   - 错误信息准确描述

3. **状态管理**
   - 成功的回复记录到数据库
   - 失败的回复正确删除或标记
   - 客户端收到正确的最终状态

4. **错误处理完整性**
   - 各种错误场景正确分类
   - 错误信息正确传播
   - 系统不会因错误崩溃

---

## 📊 测试计划

### 第一阶段: 环境启动 (30 分钟)

**目标**: 验证完整系统可正常启动

**步骤**:
```bash
# 1. 启动完整开发环境
npm run dev:all

# 2. 验证三个进程均已启动
# - Master 监听 :3000
# - Worker 已连接到 Master
# - Admin 监听 :3001

# 3. 检查日志中没有错误
```

**验证点**:
- [ ] Master 服务器启动成功 (port 3000)
- [ ] Worker 进程启动成功并注册到 Master
- [ ] Admin Web UI 可访问 (port 3001)
- [ ] 数据库初始化成功
- [ ] Socket.IO 连接建立

**预期日志**:
```
Master: Server listening on port 3000
Worker: Connected to master at localhost:3000
Worker: Platform manager initialized
Admin: Server running at http://localhost:3001
```

---

### 第二阶段: 基础功能测试 (1 小时)

**目标**: 验证单个回复功能的完整流程

#### 2.1 评论回复功能

**前置条件**:
- 已登录有效的抖音账户
- 有待回复的评论（使用已验证的 comment_id）

**测试步骤**:

1. **通过 API 发送回复请求**:
```bash
# 方式 1: 使用 curl 调用 API
curl -X POST http://localhost:3000/api/replies \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "account-123",
    "target_id": "@j/comment-id-from-chrome-devtools",
    "reply_type": "comment",
    "reply_content": "测试回复内容"
  }'
```

2. **监控控制台日志**:
```
[Master] 收到回复请求
[Master] 分配任务给 Worker
[Worker] 开始回复评论
[Worker] 返回回复结果
[Master] 处理回复结果
[Master] 通知客户端
```

3. **验证数据库状态**:
```bash
# 查看回复表
sqlite3 packages/master/data/master.db \
  "SELECT * FROM replies WHERE target_id = '@j/...' ORDER BY created_at DESC LIMIT 1;"
```

4. **预期结果**:
- ✅ 成功: 数据库有新记录，字段完整
- ❌ 失败: 返回清晰的错误消息，包含原因

#### 2.2 私信回复功能

**前置条件**:
- 有待回复的私信（使用已验证的 message_id）
- 私信 ID 格式: `0:1:account_id:timestamp`

**测试步骤**:
```bash
# 发送私信回复请求
curl -X POST http://localhost:3000/api/replies \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "account-123",
    "target_id": "0:1:106228603660:1810217601082548",
    "reply_type": "direct_message",
    "reply_content": "测试私信回复"
  }'
```

**验证点**:
- [ ] 请求成功响应 (HTTP 200)
- [ ] 返回值包含 platform_reply_id
- [ ] 数据库记录成功创建
- [ ] Worker 日志显示完整流程

---

### 第三阶段: 错误处理测试 (1 小时)

**目标**: 验证各种错误场景处理正确

#### 3.1 被拦截的回复（Blocked 状态）

**测试场景**:
1. **私密作品/私密评论**
   - 尝试回复设为私密的视频评论
   - 预期: 返回 `status: 'blocked', reason: '私密作品无法评论'`

2. **用户被禁用**
   - 使用已被平台禁用的账户
   - 预期: 返回 `status: 'blocked', reason: '用户已被禁用'`

3. **频率限制**
   - 短时间内发送多个回复
   - 预期: 返回 `status: 'blocked', reason: '操作过于频繁'`

**验证步骤**:
```bash
# 测试私密作品
curl -X POST http://localhost:3000/api/replies \
  -d '{...,"target_id":"@j/private-video-comment",...}'

# 查看返回结果
# {
#   "success": false,
#   "status": "blocked",
#   "reason": "私密作品无法评论",
#   "data": { ... }
# }

# 验证数据库: 失败的回复应被删除
sqlite3 ... "SELECT COUNT(*) FROM replies WHERE target_id = '@j/private-video-comment';"
# Result: 0 (应该是 0，因为被拦截的回复会被删除)
```

#### 3.2 技术错误（Error 状态）

**测试场景**:
1. **无效的评论 ID**
   - 使用不存在的 comment_id
   - 预期: 返回 `status: 'error', reason: 'Comment not found'`

2. **网络中断**
   - 模拟浏览器无法导航到页面
   - 预期: 返回 `status: 'error', reason: 'Navigation failed'`

3. **元素未找到**
   - 页面结构改变导致选择器失效
   - 预期: 返回 `status: 'error', reason: 'Reply input field not found'`

**验证步骤**:
```bash
# 测试无效 ID
curl -X POST http://localhost:3000/api/replies \
  -d '{...,"target_id":"@j/invalid-id-12345",...}'

# 查看 Worker 日志中的完整错误栈
# 应该显示详细的错误信息用于调试
```

#### 3.3 数据完整性验证

**测试内容**:
- [ ] 成功回复: 所有字段正确保存
- [ ] 失败回复: 记录被删除或标记为失败
- [ ] 时间戳: ISO 8601 格式，时间准确
- [ ] 平台 ID: 格式正确，能追溯来源

**验证查询**:
```bash
# 成功回复
sqlite3 ... "SELECT * FROM replies WHERE status = 'success' LIMIT 1;"

# 失败记录（应该没有）
sqlite3 ... "SELECT COUNT(*) FROM replies WHERE status = 'failed';"

# 时间戳格式验证
sqlite3 ... "SELECT created_at FROM replies LIMIT 1;"
# 应该是: 2025-10-20T13:31:00.000Z 这样的格式
```

---

### 第四阶段: 系统集成测试 (1 小时)

**目标**: 验证三层系统的完整集成

#### 4.1 Socket.IO 通信链路

**测试步骤**:

1. **Master 端 Socket 事件监听**:
```javascript
// 在 Master 服务器中添加日志
socket.on('worker:reply:result', (data) => {
  console.log('收到 Worker 回复结果:', data);
});

socket.on('client:reply:request', (data) => {
  console.log('收到客户端回复请求:', data);
});
```

2. **Worker 端事件发送**:
```javascript
// Worker 在 platform.js 中
const result = await this.replyToComment(...);
this.workerBridge.socket.emit('worker:reply:result', {
  status: result.success ? 'success' : result.status,
  data: result.data
});
```

3. **验证事件流**:
- [ ] Admin UI 发送请求
- [ ] Master 收到请求并分配给 Worker
- [ ] Worker 完成操作并返回结果
- [ ] Master 处理结果并通知客户端
- [ ] Admin UI 收到通知并更新界面

#### 4.2 客户端通知验证

**测试步骤**:

1. **打开 Admin Web UI** (http://localhost:3001)

2. **发送回复请求**
   - 使用 UI 界面或 API 发送回复

3. **观察通知**
   - 成功: 显示"回复成功"提示
   - 失败: 显示对应的错误消息

4. **验证点**:
- [ ] 通知及时出现（< 5 秒）
- [ ] 错误消息清晰准确
- [ ] 通知内容与数据库状态一致

---

### 第五阶段: 压力测试 (30 分钟)

**目标**: 验证系统在负载下的稳定性

#### 5.1 并发回复测试

```bash
# 使用 Apache Bench 或 wrk 进行压力测试
ab -n 100 -c 10 -p reply.json \
  -T application/json \
  http://localhost:3000/api/replies

# 或使用 curl 并发
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/replies -d "{...}" &
done
wait
```

**验证点**:
- [ ] 所有请求都返回有效响应
- [ ] 没有请求超时
- [ ] 数据库没有损坏
- [ ] 内存使用合理

#### 5.2 长期运行测试

```bash
# 让系统运行 30 分钟
# 间隔发送回复请求
# 每 2 秒发送一个请求

for i in {1..900}; do
  curl -X POST http://localhost:3000/api/replies -d "{...}"
  sleep 2
done
```

**验证点**:
- [ ] 没有内存泄漏
- [ ] 没有数据库锁定问题
- [ ] Socket 连接保持正常
- [ ] Worker 进程正常工作

---

## 🛠️ 测试工具和命令

### 启动完整环境

```bash
# 1. 安装依赖
npm install

# 2. 启动所有服务
npm run dev:all

# 3. 分别启动（如果需要单独控制）
# 终端 1: Master
cd packages/master && npm start

# 终端 2: Worker
cd packages/worker && npm start

# 终端 3: Admin
cd packages/admin-web && npm start
```

### 测试工具

#### 命令行测试
```bash
# 获取有效的评论 ID（从 Chrome DevTools 中复制）
COMMENT_ID="@j/comment-id-from-devtools"

# 发送回复请求
curl -X POST http://localhost:3000/api/replies \
  -H "Content-Type: application/json" \
  -d "{
    \"account_id\": \"account-123\",
    \"target_id\": \"$COMMENT_ID\",
    \"reply_type\": \"comment\",
    \"reply_content\": \"这是一个集成测试回复\"
  }"
```

#### 数据库验证
```bash
# 检查回复表
sqlite3 packages/master/data/master.db ".schema replies"

# 查询最新的回复记录
sqlite3 packages/master/data/master.db \
  "SELECT id, target_id, reply_content, status, created_at FROM replies ORDER BY created_at DESC LIMIT 10;"

# 检查失败的回复（应该很少或没有）
sqlite3 packages/master/data/master.db \
  "SELECT COUNT(*) as failed_count FROM replies WHERE status = 'blocked' OR status = 'error';"
```

#### 日志监控
```bash
# 实时查看 Master 日志
tail -f packages/master/logs/master.log | grep -i reply

# 实时查看 Worker 日志
tail -f packages/worker/logs/worker.log | grep -i reply

# 查看特定账户的日志
grep "account-123" packages/worker/logs/worker.log
```

---

## 📋 测试检查清单

### 环境准备
- [ ] Node.js 18.x LTS 已安装
- [ ] npm 依赖已安装
- [ ] 数据库已初始化
- [ ] 浏览器已登录抖音账户
- [ ] 有待回复的评论和私信

### 功能测试
- [ ] 评论回复成功完成
- [ ] 私信回复成功完成
- [ ] 成功时数据库记录完整
- [ ] 失败时错误消息清晰
- [ ] 被拦截时状态正确标记

### 集成测试
- [ ] Socket.IO 消息传递正确
- [ ] 错误通知及时到达客户端
- [ ] 三层系统协调正常
- [ ] 没有消息丢失
- [ ] 性能满足预期

### 稳定性测试
- [ ] 并发请求处理正确
- [ ] 长期运行不出现异常
- [ ] 内存使用保持稳定
- [ ] 数据库没有损坏
- [ ] 所有 Socket 连接正常

---

## 📊 预期结果

### 成功指标

| 指标 | 目标 | 备注 |
|------|------|------|
| 单个回复成功率 | ≥ 99% | 正常场景 |
| 错误检测准确率 | ≥ 95% | 各种错误场景 |
| 平均响应时间 | < 5s | 单个回复 |
| 并发处理能力 | ≥ 10 req/s | 稳定性 |
| 系统可用性 | ≥ 99.5% | 长期运行 |

### 失败标准

以下任何一种情况都表示测试失败：
- ❌ 回复成功但数据库没有记录
- ❌ 错误未被正确分类
- ❌ 客户端没有收到通知
- ❌ 系统在压力下崩溃
- ❌ 数据库数据损坏

---

## ⏱️ 时间计划

```
Day 1 (今天):
├─ 14:00 - 14:30 环境启动测试 (第一阶段)
├─ 14:30 - 15:30 基础功能测试 (第二阶段)
├─ 15:30 - 16:30 错误处理测试 (第三阶段)
├─ 16:30 - 17:30 系统集成测试 (第四阶段)
└─ 17:30 - 18:00 压力测试 (第五阶段)

Day 2 (明天):
├─ 修复昨日发现的问题
├─ 运行完整测试套件
├─ 性能优化
└─ 准备灰度发布

Day 3-5 (本周):
├─ 回归测试
├─ 灰度发布准备
├─ 监控系统配置
└─ 上线前准备
```

---

## 🔍 常见问题和故障排除

### 问题 1: Worker 无法连接到 Master

**症状**: Worker 日志中出现连接错误

**排查步骤**:
```bash
# 检查 Master 是否正常运行
curl http://localhost:3000/health

# 检查防火墙
netstat -ano | findstr :3000

# 检查 Worker 配置
cat packages/worker/.env | grep MASTER
```

**解决方案**:
- 确保 Master 已启动
- 确保端口 3000 未被占用
- 检查 MASTER_HOST 和 MASTER_PORT 配置

### 问题 2: 回复请求无响应

**症状**: API 请求长时间无返回

**排查步骤**:
```bash
# 检查 Worker 日志
tail -f packages/worker/logs/worker.log

# 检查 Master 事件处理
grep "reply" packages/master/logs/master.log
```

**解决方案**:
- 增加超时时间
- 检查浏览器连接状态
- 查看是否有页面导航错误

### 问题 3: 数据库记录缺失

**症状**: 成功的回复没有保存到数据库

**排查步骤**:
```bash
# 检查回复表是否存在
sqlite3 packages/master/data/master.db ".tables"

# 检查表结构
sqlite3 packages/master/data/master.db ".schema replies"

# 查看是否有插入错误
sqlite3 packages/master/data/master.db ".log stdout" && curl -X POST ...
```

**解决方案**:
- 重新初始化数据库
- 检查 DAO 代码
- 查看 Master 日志中的数据库错误

---

## 📚 相关文件

- 📘 [回复功能开发指南](./COMMENT_REPLY_DEVELOPMENT_GUIDE.md)
- 📗 [错误处理实现](./ERROR_HANDLING_IMPLEMENTATION_SUMMARY.md)
- 📕 [单元测试完成报告](./UNIT_TESTING_COMPLETE.md)
- 📓 [API 快速参考](./QUICK_API_REFERENCE.md)

---

## ✅ 签署

**集成测试路线图审批**:

| 角色 | 审批状态 | 日期 |
|------|---------|------|
| 开发工程师 | ✅ 准备完成 | 2025-10-20 |
| 测试工程师 | ✅ 可开始测试 | 2025-10-20 |
| 项目经理 | ⏳ 等待审批 | 待确认 |

---

**集成测试准备就绪，随时可开始！** 🚀

Generated with Claude Code | 2025-10-20
