# Quickstart Guide: 社交媒体账户监控系统

**Purpose**: 快速验证系统核心功能的测试指南
**Target**: 开发人员和QA测试人员

---

## 环境准备

### 前置条件

- Node.js 18.x LTS已安装
- Git已安装
- 至少一个抖音账户(用于测试)

### 安装步骤

```bash
# 1. 克隆代码仓库
git clone <repository_url>
cd hiscrm-im

# 2. 安装依赖(使用pnpm管理monorepo)
npm install -g pnpm
pnpm install

# 3. 初始化数据库
cd packages/master
npm run db:init

# 4. 配置环境变量
cp .env.example .env
# 编辑.env,设置加密密钥等配置
```

---

## User Story 1: 账户监控配置

### 目标
验证用户可以添加抖音账户并开始监控

### 测试步骤

#### Step 1: 启动主控服务

```bash
cd packages/master
npm run dev
```

**预期输出**:
```
[INFO] Master server started on port 3000
[INFO] Socket.IO server listening
[INFO] Database initialized
```

#### Step 2: 启动桌面客户端

```bash
cd packages/desktop-client
npm run dev
```

**预期**: Electron窗口打开,显示登录/主界面

#### Step 3: 添加抖音账户

**操作**:
1. 点击"添加账户"按钮
2. 选择平台: 抖音
3. 输入账户名称: "测试账号1"
4. 输入账户ID: dy123456
5. 点击"扫码登录"
6. 使用抖音App扫描二维码
7. 确认登录后,点击"保存"

**验证点**:
- ✅ 账户出现在列表中
- ✅ 状态显示为"监控中"(绿色图标)
- ✅ 显示监控间隔: 30秒

**数据库验证**:
```bash
# 查询accounts表
sqlite3 packages/master/data/master.db "SELECT * FROM accounts;"
```

**预期结果**: 返回一条记录,status='active'

---

## User Story 2: 实时互动监控

### 目标
验证系统可以在30秒内检测到新评论和私信

### 测试步骤

#### Step 1: 启动Worker进程

主控会自动启动Worker,或手动启动:

```bash
cd packages/worker
npm run dev
```

**预期输出**:
```
[INFO] Worker started: worker-001
[INFO] Connecting to master at localhost:3000
[INFO] Registered with master, assigned 1 accounts
[INFO] Starting monitor task for account dy123456
```

#### Step 2: 模拟新评论

**方式1: 使用真实抖音**
1. 在另一台设备或浏览器登录另一个抖音账户
2. 找到测试账号的视频
3. 发表评论: "这是测试评论"

**方式2: 使用模拟脚本**
```bash
cd packages/master
npm run test:mock-comment -- --account=dy123456
```

#### Step 3: 验证检测

**时间计时**: 从发表评论开始计时

**预期**:
- ⏱️ 30秒内,主控日志显示:
  ```
  [INFO] Worker worker-001 detected new comment for dy123456
  [INFO] Saved comment cmt-xxx to database
  ```

**数据库验证**:
```bash
sqlite3 packages/master/data/master.db "SELECT * FROM comments ORDER BY detected_at DESC LIMIT 1;"
```

**预期结果**: 返回最新评论记录

---

## User Story 3: 多客户端实时通知

### 目标
验证所有在线客户端都能收到通知

### 测试步骤

#### Step 1: 启动多个客户端

**桌面客户端1**:
```bash
cd packages/desktop-client
npm run dev
```

**桌面客户端2**(另一个终端):
```bash
cd packages/desktop-client
PORT=8081 npm run dev
```

**移动客户端**(可选,使用模拟器):
```bash
cd packages/mobile-client
npm run ios  # 或 npm run android
```

#### Step 2: 触发新评论

参考User Story 2的方法触发新评论

#### Step 3: 验证通知推送

**预期所有客户端**:
- 🔔 显示通知弹窗
- 🔔 通知内容: "新评论: 这是测试评论"
- 🔔 点击通知跳转到消息详情页

**时间验证**:
- ⏱️ 从评论发表到通知显示 ≤ 33秒(30秒检测+3秒推送)

**Socket.IO验证**(使用开发者工具):
```javascript
// 浏览器控制台
socket.on('message', (msg) => {
  console.log('Received:', msg);
});
```

**预期**: 收到`master:notification:push`消息

---

## User Story 4: 消息历史与统计

### 目标
验证用户可以查看历史记录和统计数据

### 测试步骤

#### Step 1: 生成历史数据

```bash
# 生成模拟历史数据(过去7天)
cd packages/master
npm run test:seed-history -- --account=dy123456 --days=7
```

**预期输出**:
```
[INFO] Generated 50 comments and 20 messages for dy123456
```

#### Step 2: 查看历史记录

**操作**:
1. 在客户端点击"历史记录"tab
2. 选择账户: "测试账号1"
3. 选择时间范围: 最近7天

**验证点**:
- ✅ 显示评论和私信列表
- ✅ 支持滚动加载(分页)
- ✅ 显示时间戳和已读状态

#### Step 3: 查看统计面板

**操作**:
1. 点击"统计"tab
2. 选择时间段: 本周

**验证点**:
- ✅ 显示总评论数: 50
- ✅ 显示总私信数: 20
- ✅ 显示趋势图(折线图)
- ✅ 图表横轴显示日期,纵轴显示数量

**API验证**:
```bash
curl http://localhost:3000/api/v1/statistics?account_id=acc-001&period=week
```

**预期响应**:
```json
{
  "success": true,
  "data": {
    "total_comments": 50,
    "total_messages": 20,
    "unread_count": 5,
    "trend": [
      {"date": "2025-10-05", "count": 10},
      {"date": "2025-10-06", "count": 15},
      ...
    ]
  }
}
```

---

## User Story 5: 通知规则定制

### 目标
验证用户可以自定义通知规则

### 测试步骤

#### Step 1: 创建关键词过滤规则

**操作**:
1. 打开"设置" → "通知规则"
2. 点击"添加规则"
3. 选择规则类型: 关键词过滤
4. 输入关键词: "重要", "紧急"
5. 选择动作: 特殊通知音
6. 保存

**API调用**:
```bash
curl -X POST http://localhost:3000/api/v1/notification-rules \
  -H "Content-Type: application/json" \
  -d '{
    "rule_type": "keyword",
    "config": {
      "keywords": ["重要", "紧急"],
      "action": "notify"
    },
    "enabled": true
  }'
```

#### Step 2: 测试规则生效

**发送包含关键词的评论**: "这是重要通知"

**预期**:
- ✅ 客户端收到通知
- ✅ 使用特殊提示音(区别于普通通知)

**发送不包含关键词的评论**: "普通评论"

**预期**:
- ✅ 客户端收到通知
- ✅ 使用普通提示音

#### Step 3: 创建免打扰时段

**操作**:
1. 添加规则: 免打扰时段
2. 设置时间: 22:00 - 08:00
3. 保存

**测试**:
1. 修改系统时间到23:00(或等待夜间)
2. 触发新评论

**预期**:
- ✅ 客户端不弹出通知
- ✅ 通知保存到队列
- ✅ 次日8点后一次性推送

---

## 边界情况测试

### 测试1: Worker崩溃恢复

**操作**:
```bash
# 找到Worker进程PID
ps aux | grep worker

# 强制杀死Worker
kill -9 <worker_pid>
```

**预期**:
- ⏱️ 主控在30秒内检测到Worker离线
- ⏱️ 自动重启Worker
- ⏱️ 重新分配任务
- ✅ 监控继续正常工作

**验证日志**:
```
[WARN] Worker worker-001 heartbeat timeout
[INFO] Restarting worker worker-001
[INFO] Worker worker-001 re-registered
```

---

### 测试2: 网络中断恢复

**操作**:
1. 断开客户端网络(飞行模式或断网)
2. 等待10秒
3. 触发新评论(在服务端)
4. 恢复网络

**预期**:
- ✅ Socket.IO自动重连
- ✅ 客户端发送sync:request
- ✅ 主控推送离线期间的通知
- ✅ 所有未读通知显示

---

### 测试3: 账户凭证过期

**模拟操作**:
```bash
# 使用脚本模拟凭证过期
npm run test:expire-credential -- --account=dy123456
```

**预期**:
- ✅ Worker检测到认证失败
- ✅ 发送worker:error消息给主控
- ✅ 主控更新账户status='expired'
- ✅ 客户端显示"凭证已过期,请重新登录"提示
- ✅ 用户点击重新登录,更新凭证

---

### 测试4: 平台限流

**模拟**:
```bash
# 将监控间隔改为5秒(触发限流)
curl -X PATCH http://localhost:3000/api/v1/accounts/acc-001 \
  -d '{"monitor_interval": 5}'
```

**预期**:
- ⏱️ Worker检测到限流(HTTP 429或特定响应)
- ✅ 自动降速,将间隔调整为60秒
- ✅ 日志记录: `[WARN] Rate limited detected, adjusting interval to 60s`
- ✅ 1分钟后恢复正常监控频率

---

### 测试5: 大量消息处理

**模拟爆款视频**:
```bash
# 生成100条评论
npm run test:flood-comments -- --account=dy123456 --count=100
```

**预期**:
- ✅ 所有100条评论都被检测到
- ✅ 客户端通知合并显示: "收到100条新评论"
- ✅ 数据库正确保存所有记录
- ✅ 系统无崩溃或内存溢出

---

## 性能基准测试

### 监控延迟测试

```bash
npm run test:latency -- --iterations=10
```

**测试流程**:
1. 发表评论
2. 记录时间戳T1
3. Worker检测到评论,记录T2
4. 计算延迟: T2 - T1

**通过标准**: 10次测试的平均延迟 ≤ 30秒

---

### 通知推送延迟测试

```bash
npm run test:push-latency -- --clients=3
```

**测试流程**:
1. 启动3个客户端
2. Worker上报新消息,记录T1
3. 客户端收到通知,记录T2
4. 计算延迟: T2 - T1

**通过标准**: 平均延迟 ≤ 3秒

---

### 并发监控测试

```bash
npm run test:concurrent -- --accounts=10
```

**测试流程**:
1. 添加10个账户
2. Worker同时监控所有账户
3. 验证无任务遗漏

**通过标准**:
- ✅ 所有账户都被分配到Worker
- ✅ 所有账户都在30秒周期内完成检测
- ✅ Worker内存占用 < 200MB

---

## 集成测试脚本

### 完整流程自动化测试

```bash
npm run test:e2e
```

**测试场景**:
1. ✅ 启动主控和Worker
2. ✅ 添加账户
3. ✅ 触发监控检测
4. ✅ 验证通知推送
5. ✅ 查询历史记录
6. ✅ 创建通知规则
7. ✅ 验证规则生效
8. ✅ 清理测试数据

**预期**: 所有步骤Pass,无错误

---

## 故障排查

### 问题1: Worker无法连接主控

**检查**:
```bash
# 检查主控是否运行
curl http://localhost:3000/health

# 检查Socket.IO端口
netstat -an | grep 3000
```

**解决**: 确保主控已启动,防火墙未阻止3000端口

---

### 问题2: 监控未检测到新消息

**检查**:
```bash
# 查看Worker日志
tail -f packages/worker/logs/worker.log

# 检查账户状态
sqlite3 packages/master/data/master.db "SELECT status FROM accounts WHERE id='acc-001';"
```

**解决**:
- 如果status='expired': 重新登录更新凭证
- 如果status='paused': 恢复监控

---

### 问题3: 客户端未收到通知

**检查**:
```bash
# 查看客户端连接状态
sqlite3 packages/master/data/master.db "SELECT * FROM client_sessions WHERE device_id='device-001';"
```

**解决**:
- 确保status='online'
- 重启客户端重新连接

---

## 清理与重置

### 清理测试数据

```bash
# 清空数据库(保留表结构)
npm run db:clean

# 重新初始化
npm run db:init
```

### 完全重置

```bash
# 删除所有数据文件
rm -rf packages/*/data/*.db
rm -rf packages/*/logs/*.log

# 重新安装依赖
pnpm install
```

---

## 下一步

测试通过后:
1. ✅ 执行 `/speckit.tasks` 生成任务列表
2. ✅ 开始TDD开发流程
3. ✅ 提交代码到Git仓库
4. ✅ 配置CI/CD流水线
