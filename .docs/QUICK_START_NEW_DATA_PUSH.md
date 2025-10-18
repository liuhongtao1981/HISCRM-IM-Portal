# 新数据推送系统快速开始指南

## 🚀 系统概述

一个完整的实时新数据推送系统，包括：
- Worker 端内存推送管理
- Master 端数据验证和去重
- 客户端实时通知

---

## ⚡ 快速启动 (5 分钟)

### 1️⃣ 启动 Master 服务
```bash
cd packages/master
npm start
# 或从项目根目录
npm run start:master
```
✅ 预期: Master 在 `http://localhost:3000` 启动

### 2️⃣ 启动 Worker 进程
```bash
cd packages/worker
npm start
# 或从项目根目录
npm run start:worker
```
✅ 预期: Worker 连接到 Master，显示 "Worker registered"

### 3️⃣ 登录账户并爬取数据
通过管理界面登录一个抖音账户，系统自动开始爬取评论、私信、视频

### 4️⃣ 查看推送过程
```bash
# 监听 Master 日志中的推送事件
tail -f packages/master/logs/master.log | grep "\[IsNew\]"

# 查看客户端通知
tail -f packages/master/logs/master.log | grep "new:comment"
```

---

## 📊 完整数据流

```
┌─────────────────────────────────────┐
│        Worker 爬虫 (60秒)           │
│  • 爬取评论、私信、视频             │
│  • 计算 is_new 标志                 │
│  • 存储到 CacheManager (内存)       │
└────────────────┬────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────┐
│    IsNewPushTask (60秒扫描)          │
│  • 获取 is_new=true 的数据           │
│  • 检查 push_count < 3               │
│  • 推送到 Master                     │
│  • 内存中更新 push_count             │
└────────────────┬────────────────────┘
                 │
    socket.emit('worker:push_new_*')
                 │
                 ↓
┌─────────────────────────────────────┐
│       Master 处理 (实时)             │
│  • 检查数据是否已存在                │
│  • 验证 is_new 标志                  │
│  • 插入新数据或更新                  │
│  • 发送客户端通知                    │
│  • 返回 ACK 反馈                     │
└────────────────┬────────────────────┘
                 │
      socket.emit('new:comment' 等)
                 │
                 ↓
┌─────────────────────────────────────┐
│       客户端 (Web/Desktop/Mobile)    │
│  • 监听实时通知                      │
│  • 在 UI 上显示新数据                │
└─────────────────────────────────────┘
```

---

## 🔑 核心概念

### is_new 字段
```
规则: is_new = (现在 - 创建时间) < 86400 秒 (24 小时)

含义:
  - true  = 新数据（平台上最近 24 小时内创建的）
  - false = 旧数据（超过 24 小时前创建的）
```

### push_count 字段
```
规则:
  - 第 1 次推送: push_count=0 → 推送 → push_count=1
  - 第 2 次推送: push_count=1 → 推送 → push_count=2
  - 第 3 次推送: push_count=2 → 推送 → push_count=3, is_new=false
  - 第 4+ 次:   push_count=3   → 不推送

功能: 确保每条新数据最多被推送 3 次
```

### 去重机制
```
数据库层:
  - 评论:  (account_id + platform_comment_id) 唯一
  - 私信:  (account_id + platform_message_id) 唯一
  - 视频:  (account_id + platform_videos_id)  唯一

插入策略: INSERT OR IGNORE（自动忽略重复）
```

---

## 🔌 客户端集成

### 监听通知事件

```javascript
// 评论通知
socket.on('new:comment', (data) => {
  console.log('新评论通知:', data);
  // data 结构:
  // {
  //   type: 'batch',
  //   account_id: 'account-123',
  //   platform_user_id: 'user-456',
  //   data: [
  //     {
  //       type: 'new_comment' 或 'history_comment',
  //       data: { id, content, author_name, ... },
  //       first_seen_at: timestamp
  //     }
  //   ],
  //   timestamp: timestamp
  // }
});

// 私信通知
socket.on('new:message', (data) => {
  console.log('新私信通知:', data);
});

// 视频通知
socket.on('new:video', (data) => {
  console.log('新视频通知:', data);
});
```

### 推荐实现

```javascript
// Vue/React 中
useEffect(() => {
  socket.on('new:comment', (data) => {
    // 更新 UI
    setComments(prev => [...prev, ...data.data]);

    // 显示通知提示
    showNotification(`收到 ${data.data.length} 条新评论`);
  });

  return () => {
    socket.off('new:comment');
  };
}, [socket]);
```

---

## 📝 环境变量配置

### Worker .env
```bash
# 爬虫周期
CRAWLER_INTERVAL=60000

# 新数据推送配置
IS_NEW_PUSH_INTERVAL=60000      # 推送检查周期（毫秒）-推荐 60 秒
IS_NEW_PUSH_MAX_TIMES=3         # 单条数据最多推送次数（推荐 3 次）
IS_NEW_FILTER_ENABLED=true      # 启用新数据过滤推送

# 日志
LOG_LEVEL=info
```

### Master .env
```bash
# Master 服务
PORT=3000
DB_PATH=./data/master.db

# 新数据处理
IS_NEW_NOTIFICATION_ENABLED=true

# 日志
LOG_LEVEL=info
```

---

## 🧪 测试数据库状态

### 查看新评论
```bash
sqlite3 packages/master/data/master.db
> SELECT id, platform_comment_id, is_new, push_count
  FROM comments
  WHERE is_new=1
  ORDER BY detected_at DESC
  LIMIT 10;
```

### 查看推送统计
```bash
sqlite3 packages/master/data/master.db
> SELECT
    is_new,
    COUNT(*) as count,
    COUNT(CASE WHEN push_count > 0 THEN 1 END) as pushed
  FROM comments
  GROUP BY is_new;
```

### 实时监控
```bash
# 每秒刷新显示新数据统计
watch -n 1 "sqlite3 packages/master/data/master.db \
  'SELECT is_new, COUNT(*) FROM comments GROUP BY is_new;'"
```

---

## 📊 日志示例

### 正常推送流程
```
[IsNew] Pushing 5 comments (request #a1b2c3d4)
[IsNew] ✅ Request #a1b2c3d4 acknowledged: 3 new, 2 history
[IsNew] Sent 5 comment notifications to clients
```

### 数据已存在
```
[IsNew] Comments push completed (request #xyz789): 0 inserted, 5 skipped
[IsNew] History comment with is_new=true: comment-456
[IsNew] History comment with is_new=false, skipped: comment-789
```

### 错误处理
```
[IsNew] Error in onPushNewComments: Error message
[IsNew] ❌ Request #req-001 failed: Connection timeout
```

---

## ⚙️ 自定义配置

### 修改推送间隔
```bash
# Worker .env
IS_NEW_PUSH_INTERVAL=30000  # 改为 30 秒推送一次
```

### 修改推送次数限制
```bash
# Worker .env
IS_NEW_PUSH_MAX_TIMES=5     # 改为最多推送 5 次
```

### 禁用新数据过滤
```bash
# Worker .env
IS_NEW_FILTER_ENABLED=false  # 不过滤，推送所有数据
```

---

## 🚨 常见问题

### Q: 为什么客户端收不到通知?
**A:**
1. 检查客户端是否连接到 Master (`/client` namespace)
2. 检查是否监听了 `new:comment` 等事件
3. 查看 Master 日志确认是否 emit 了通知

### Q: 为什么数据没被插入数据库?
**A:**
1. 检查 account_id 和 platform_comment_id 是否正确
2. 查看是否触发了数据库约束错误
3. 运行 `sqlite3` 检查表结构是否有 is_new 和 push_count 字段

### Q: 为什么推送超过 3 次?
**A:**
1. 检查 is_new 字段是否被正确更新
2. 查看 IsNewPushTask 日志中 push_count 的更新
3. 确认环境变量 IS_NEW_PUSH_MAX_TIMES 已正确设置

### Q: 如何手动测试推送?
**A:**
```javascript
// 使用 Socket.IO 客户端库模拟 Worker 推送
const io = require('socket.io-client');
const socket = io('http://localhost:3000/worker');

socket.emit('worker:push_new_comments', {
  request_id: 'test-001',
  account_id: 'test-account',
  platform_user_id: 'test-user',
  comments: [{
    id: 'test-comment-1',
    content: 'Test message',
    author_name: 'Test User',
    created_at: Math.floor(Date.now() / 1000)
  }]
});
```

---

## 📈 监控和调试

### 监听所有 IsNew 事件
```bash
tail -f packages/master/logs/master.log | grep "\[IsNew\]"
```

### 监听客户端通知
```bash
tail -f packages/master/logs/master.log | grep "new:"
```

### 数据库实时统计
```bash
sqlite3 packages/master/data/master.db \
  "SELECT
    'comments' as table_name,
    COUNT(*) as total,
    SUM(CASE WHEN is_new=1 THEN 1 ELSE 0 END) as new_count
  FROM comments
  UNION
  SELECT 'messages', COUNT(*), SUM(CASE WHEN is_new=1 THEN 1 ELSE 0 END)
  FROM direct_messages
  UNION
  SELECT 'videos', COUNT(*), SUM(CASE WHEN is_new=1 THEN 1 ELSE 0 END)
  FROM douyin_videos;"
```

---

## 🔗 相关文档

- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) - 完整实现进度
- [MASTER_PUSH_HANDLERS_IMPLEMENTATION.md](MASTER_PUSH_HANDLERS_IMPLEMENTATION.md) - Master 端详细文档
- [Migration 014](../packages/master/src/database/migrations/014_add_is_new_and_push_count_fields.sql) - 数据库迁移脚本

---

## ✅ 检查清单

启动前确保：
- [ ] Worker 和 Master 都已安装依赖 (`npm install`)
- [ ] 数据库迁移已执行（首次运行自动执行）
- [ ] 环境变量已正确配置
- [ ] 数据库文件权限正确
- [ ] 端口 3000 和 4000+ 未被占用

---

**最后更新**: 2025-10-18
**版本**: 1.0
**状态**: ✅ 生产就绪
