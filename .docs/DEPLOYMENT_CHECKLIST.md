# 新数据推送系统部署检查清单

> 本文档用于确保新数据推送系统在生产环境中正确部署和运行

---

## ✅ 前置准备

### 代码更新
- [x] 已合并 Master 端处理器代码
- [x] 已合并 Worker 端 IsNewPushTask 代码
- [x] 已更新 socket-server.js 事件注册
- [x] 已运行所有语法检查 (node -c)
- [x] 已通过单元测试 (5/5 PASS)

### 数据库准备
- [ ] 已备份现有数据库
- [ ] 已执行 Migration 014
- [ ] 已验证 is_new 和 push_count 字段存在
- [ ] 已为新字段添加索引（可选性能优化）

```bash
# 备份数据库
cp packages/master/data/master.db packages/master/data/master.db.backup

# 验证字段存在
sqlite3 packages/master/data/master.db \
  "PRAGMA table_info(comments);" | grep -E "is_new|push_count"
```

### 环境变量配置
- [ ] 已在 Master .env 中配置环境变量
- [ ] 已在 Worker .env 中配置环境变量
- [ ] 已验证所有必需的环境变量都已设置

```bash
# Worker .env 检查清单
grep -E "IS_NEW_PUSH_INTERVAL|IS_NEW_PUSH_MAX_TIMES" packages/worker/.env

# Master .env 检查清单
grep -E "IS_NEW_NOTIFICATION_ENABLED" packages/master/.env
```

---

## 🚀 部署步骤

### 1️⃣ Master 服务启动 (Port 3000)

```bash
cd packages/master
npm install
npm start
```

**验证清单:**
- [ ] 控制台显示 "Master Server Started"
- [ ] Socket.IO 服务器在 3000 端口运行
- [ ] 三个 Namespace 已初始化: /worker, /client, /admin
- [ ] 日志中显示 "IsNewPushTask" 相关初始化（如果有 Worker 连接）

**预期日志输出:**
```
[master] info: ✓ Database initialized
[master] info: ✓ Socket.IO server initialized
[master] info: Socket.IO server initialized with /worker, /client and /admin namespaces
[master] info: ║  Master Server Started                    ║
```

### 2️⃣ Worker 进程启动 (Port 4000+)

```bash
cd packages/worker
npm install
npm start
```

**验证清单:**
- [ ] 控制台显示连接成功消息
- [ ] Worker 向 Master 注册
- [ ] IsNewPushTask 启动（日志中显示启动时间）
- [ ] CacheManager 已初始化

**预期日志输出:**
```
[worker] info: Worker connected to Master at ws://localhost:3000/worker
[worker] info: ✓ IsNewPushTask started with interval: 60000ms
```

### 3️⃣ 账户登录和爬取

通过管理界面登录一个抖音账户：

```
管理员界面 → 新增账户 → 输入账户信息 → 启用爬取
```

**验证清单:**
- [ ] 账户状态显示 "logged_in"
- [ ] 爬虫开始运行（日志中显示爬取消息）
- [ ] Worker 采集评论、私信、视频

---

## 📊 运行时验证

### 检查 Master 日志

```bash
# 监听新数据推送事件
tail -f packages/master/logs/master.log | grep "\[IsNew\]"

# 预期日志:
# [IsNew] Pushing 3 comments (request #abc123)
# [IsNew] Comments push completed: 2 inserted, 1 skipped
```

### 检查 Worker 日志

```bash
# 监听 IsNewPushTask 运行
tail -f packages/worker/logs/worker.log | grep "IsNewPushTask"

# 预期日志:
# [is-new-push-task] info: [IsNew] Pushing 5 comments
```

### 检查数据库状态

```bash
# 统计新数据
sqlite3 packages/master/data/master.db \
  "SELECT
    'comments' as type,
    COUNT(*) as total,
    SUM(CASE WHEN is_new=1 THEN 1 ELSE 0 END) as new_count
  FROM comments
  UNION ALL
  SELECT 'messages', COUNT(*), SUM(CASE WHEN is_new=1 THEN 1 ELSE 0 END)
  FROM direct_messages
  UNION ALL
  SELECT 'videos', COUNT(*), SUM(CASE WHEN is_new=1 THEN 1 ELSE 0 END)
  FROM douyin_videos;"

# 预期输出:
# type      | total | new_count
# comments  | 150   | 8
# messages  | 45    | 2
# videos    | 12    | 1
```

### 检查客户端通知

如果有已连接的客户端，应该能看到：
- [ ] 新评论通知: `new:comment` 事件
- [ ] 新私信通知: `new:message` 事件
- [ ] 新视频通知: `new:video` 事件

```javascript
// 在浏览器控制台中
socket.on('new:comment', (data) => {
  console.log('新评论:', data.data.length, '条');
});

socket.on('new:message', (data) => {
  console.log('新私信:', data.data.length, '条');
});

socket.on('new:video', (data) => {
  console.log('新视频:', data.data.length, '条');
});
```

---

## ⚠️ 故障排查

### 问题 1: IsNewPushTask 未启动

**症状**: Worker 日志中未见 IsNewPushTask 启动消息

**排查步骤:**
1. [ ] 检查 Worker index.js 第 15 步是否初始化了 IsNewPushTask
2. [ ] 确认 CacheManager 已正确初始化
3. [ ] 查看是否有错误日志

**解决方案:**
```javascript
// 检查 Worker index.js
// Step 15 应该有:
const isNewPushTask = new IsNewPushTask(cacheManager, workerBridge);
isNewPushTask.start();
```

### 问题 2: Master 未收到推送

**症状**: IsNewPushTask 运行但 Master 未处理

**排查步骤:**
1. [ ] 检查 socket 连接是否正常
2. [ ] 验证 socket-server.js 中是否注册了事件监听
3. [ ] 查看 Master 日志中是否有错误

**解决方案:**
```bash
# 检查 socket 连接
tail -f packages/master/logs/master.log | grep -i "worker"

# 预期看到: "Worker connected" 消息
```

### 问题 3: 数据未插入数据库

**症状**: Master 处理了推送但数据库中未见新数据

**排查步骤:**
1. [ ] 确认表中有 is_new 和 push_count 字段
2. [ ] 检查约束是否正确应用
3. [ ] 验证 DAO 的 bulkInsert 方法

**解决方案:**
```bash
# 检查表结构
sqlite3 packages/master/data/master.db \
  "PRAGMA table_info(comments);"

# 应该显示 is_new 和 push_count 字段
```

### 问题 4: 推送次数超过限制

**症状**: 同一条数据被推送超过 3 次

**排查步骤:**
1. [ ] 检查 Worker 环境变量 IS_NEW_PUSH_MAX_TIMES
2. [ ] 验证内存中的 pushState 是否被正确更新
3. [ ] 查看 IsNewPushTask 日志

**解决方案:**
```bash
# 检查环境变量
grep IS_NEW_PUSH_MAX_TIMES packages/worker/.env

# 应该是 3
```

---

## 📈 性能监控

### CPU 和内存使用

```bash
# Master 进程监控
top -p $(pgrep -f "node.*master")

# Worker 进程监控
top -p $(pgrep -f "node.*worker")

# 预期:
# Master: <100MB, <5% CPU
# Worker: <500MB (取决于账户数), <10% CPU
```

### 数据库性能

```bash
# 检查数据库大小
du -h packages/master/data/master.db

# 检查表大小
sqlite3 packages/master/data/master.db \
  "SELECT name, COUNT(*) FROM sqlite_master WHERE type='table' GROUP BY name;"
```

### 网络连接

```bash
# 检查 Socket.IO 连接
ss -tlnp | grep 3000

# 预期: 连接到 0.0.0.0:3000
```

---

## 🔄 回滚计划

如果出现严重问题，使用以下回滚步骤：

### 1️⃣ 停止所有服务
```bash
killall node
```

### 2️⃣ 恢复数据库
```bash
cp packages/master/data/master.db.backup packages/master/data/master.db
```

### 3️⃣ 还原代码（如需要）
```bash
git checkout packages/master/src/index.js
git checkout packages/master/src/communication/socket-server.js
git checkout packages/worker/src/index.js
```

### 4️⃣ 重新启动
```bash
npm run start:master
npm run start:worker
```

---

## 📋 部署后检查

### 24 小时检查清单

- [ ] 系统运行稳定，无异常崩溃
- [ ] 日志中无错误信息
- [ ] 新数据正常推送（至少 10 条）
- [ ] 数据库大小在预期范围内
- [ ] 客户端能够实时接收通知
- [ ] 内存使用保持稳定

### 一周检查清单

- [ ] 数据去重工作正常（无重复数据）
- [ ] 推送 3 次限制生效（无超额推送）
- [ ] is_new 字段更新正确
- [ ] 系统性能未出现下降
- [ ] 没有内存泄漏迹象

---

## 📞 支持和反馈

### 常见问题

如遇到问题，请参考：
- [MASTER_PUSH_HANDLERS_IMPLEMENTATION.md](MASTER_PUSH_HANDLERS_IMPLEMENTATION.md)
- [QUICK_START_NEW_DATA_PUSH.md](QUICK_START_NEW_DATA_PUSH.md)
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)

### 日志查询

```bash
# 快速查看最后 100 行日志
tail -100 packages/master/logs/master.log

# 查看特定时间段的日志
grep "2025-10-18" packages/master/logs/master.log | tail -50

# 导出日志用于分析
tar -czf logs-backup-$(date +%Y%m%d).tar.gz \
  packages/master/logs/ packages/worker/logs/
```

---

## ✨ 成功标志

系统部署成功的表现：

1. ✅ Master 在 3000 端口运行
2. ✅ Worker 已连接到 Master
3. ✅ IsNewPushTask 每 60 秒运行一次
4. ✅ 新数据在 60 秒内被推送到 Master
5. ✅ Master 返回 ACK 反馈给 Worker
6. ✅ 客户端接收到实时通知
7. ✅ 数据库中正确记录 is_new 和 push_count

---

**部署日期**: _____________________
**部署人员**: _____________________
**检查状态**: ✅ 通过 / ❌ 失败

**备注**:
```
_______________________________________________________
_______________________________________________________
_______________________________________________________
```

---

**文档版本**: 1.0
**最后更新**: 2025-10-18
**状态**: ✅ 生产就绪
