# DataManager 数据快照 - 快速参考

**版本**: v1.0
**最后更新**: 2025-10-29

---

## 🚀 快速开始

### 1. 功能默认开启

DataManager 初始化时自动启动快照功能，无需任何配置！

```javascript
// 创建 DataManager，快照自动启动
const dataManager = new DouyinDataManager(accountId, dataPusher);
// ✅ 快照功能已启动，每 30 秒自动记录一次
```

### 2. 查看最新快照

最简单的方法：

```bash
node tests/查看最新数据快照.js
```

### 3. 实时监控

推荐使用 Windows 版本（跨平台兼容）：

```bash
# 1. 启动 Master
npm run start:master

# 2. 在另一个终端运行监控
node tests/实时监控数据快照日志-Windows.js
```

---

## 📋 常用命令

### 查看快照

```bash
# 查看最新快照（自动查找）
node tests/查看最新数据快照.js

# 查看指定账户的快照
node tests/查看最新数据快照.js acc-98296c87-2e42-447a-9d8b-8be008ddb6e4

# 查看所有快照（Windows）
findstr /C:"Data Snapshot" packages\worker\logs\douyin-data_acc-*.log

# 查看所有快照（Linux/macOS）
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log
```

### 分析快照数据

```bash
# 提取最新快照并格式化（需要 jq）
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | tail -1 | jq .snapshot

# 统计快照数量
grep -c "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log

# 查看快照时间戳
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | jq -r .snapshot.timestamp
```

### 监控快照

```bash
# Windows 实时监控
node tests/实时监控数据快照日志-Windows.js

# Linux/macOS 实时监控
node tests/实时监控数据快照日志.js

# 使用 PowerShell 监控（Windows）
Get-Content packages\worker\logs\douyin-data_acc-*.log -Wait | Select-String "Data Snapshot"
```

---

## ⚙️ 配置选项

### 修改快照间隔

```javascript
// 默认 30 秒
dataManager.startDataSnapshot(30000);

// 修改为 60 秒
dataManager.stopDataSnapshot();
dataManager.startDataSnapshot(60000);

// 修改为 2 分钟
dataManager.startDataSnapshot(120000);
```

### 手动触发快照

```javascript
// 立即记录一次快照
dataManager.logDataSnapshot();
```

### 停止快照

```javascript
// 停止自动快照
dataManager.stopDataSnapshot();
```

### 按需启用（仅调试环境）

```javascript
// 仅在开发环境启用快照
if (process.env.NODE_ENV === 'development') {
  dataManager.startDataSnapshot();
} else {
  dataManager.stopDataSnapshot();
}
```

---

## 📊 快照数据结构

### 完整结构

```json
{
  "level": "info",
  "message": "📸 Data Snapshot",
  "service": "douyin-data:acc-xxx",
  "snapshot": {
    "timestamp": "2025-10-29T05:15:59.427Z",
    "accountId": "acc-xxx",
    "platform": "douyin",
    "stats": {
      "account": { "id": "...", "platform": "..." },
      "collections": {
        "conversations": { "total": 27, "new": 15, ... },
        "messages": { "total": 103, "new": 45, ... },
        "contents": { "total": 5, "new": 3, ... },
        "comments": { "total": 42, "new": 18, ... }
      },
      "sync": {
        "autoSync": true,
        "syncInterval": 5000,
        "lastSyncTime": 1761714194157,
        "pendingSync": 0
      }
    },
    "data": {
      "conversations": [...],
      "messages": [...],
      "contents": [...],
      "comments": [...]
    }
  },
  "timestamp": "2025-10-29 13:15:59.428"
}
```

### 会话对象

```json
{
  "id": "conv_xxx",
  "conversationId": "conv_001",
  "userId": "10001",
  "userName": "张三",
  "userAvatar": "https://...",
  "unreadCount": 2,
  "lastMessageContent": "你好，请问产品还有货吗？",
  "lastMessageTime": 1761714929417,
  "status": "new",
  "createdAt": 1761714929417,
  "updatedAt": 1761714929417
}
```

### 消息对象

```json
{
  "id": "msg_xxx",
  "messageId": "msg_001",
  "conversationId": "conv_001",
  "senderId": "10001",
  "senderName": "张三",
  "type": "text",
  "content": "你好，请问产品还有货吗？",  // 截断到 100 字符
  "direction": "incoming",
  "status": "delivered",
  "createdAt": 1761714929418
}
```

### 作品对象

```json
{
  "id": "cont_xxx",
  "contentId": "content_001",
  "type": "video",
  "title": "新品上市，限时优惠！",  // 截断到 50 字符
  "description": "这是一款...",  // 截断到 100 字符
  "viewCount": 1234,
  "likeCount": 567,
  "commentCount": 89,
  "publishTime": 1761714929419,
  "status": "new"
}
```

### 评论对象

```json
{
  "id": "comm_xxx",
  "commentId": "comment_001",
  "contentId": "content_001",
  "authorId": "10002",
  "authorName": "李四",
  "content": "价格怎么样？",  // 截断到 100 字符
  "likeCount": 12,
  "replyCount": 3,
  "status": "new",
  "createdAt": 1761714929420
}
```

---

## 🔍 提取数据示例

### 使用 Node.js

```javascript
const fs = require('fs');

// 读取日志文件
const logFile = 'packages/worker/logs/douyin-data_acc-xxx.log';
const content = fs.readFileSync(logFile, 'utf8');

// 提取所有快照
const snapshots = content
  .split('\n')
  .filter(line => line.includes('Data Snapshot'))
  .map(line => {
    const logEntry = JSON.parse(line);
    return logEntry.snapshot;
  });

// 获取最新快照
const latest = snapshots[snapshots.length - 1];

console.log('账户:', latest.accountId);
console.log('时间:', latest.timestamp);
console.log('会话数:', latest.stats.collections.conversations.total);
console.log('消息数:', latest.stats.collections.messages.total);
```

### 使用 jq（Linux/macOS）

```bash
# 提取所有会话的用户名
grep "Data Snapshot" log.log | jq -r '.snapshot.data.conversations[].userName'

# 统计消息总数
grep "Data Snapshot" log.log | tail -1 | jq '.snapshot.stats.collections.messages.total'

# 提取所有消息内容
grep "Data Snapshot" log.log | jq -r '.snapshot.data.messages[].content'

# 按时间排序查看快照
grep "Data Snapshot" log.log | jq -r '.snapshot.timestamp' | sort
```

### 使用 PowerShell（Windows）

```powershell
# 读取最新快照
$logFile = "packages\worker\logs\douyin-data_acc-xxx.log"
$snapshots = Select-String -Path $logFile -Pattern "Data Snapshot"
$latest = $snapshots[-1].Line | ConvertFrom-Json

# 显示统计信息
Write-Host "账户: $($latest.snapshot.accountId)"
Write-Host "时间: $($latest.snapshot.timestamp)"
Write-Host "会话数: $($latest.snapshot.stats.collections.conversations.total)"
```

---

## 📈 性能参考

### 资源占用

| 指标 | 数值 |
|------|------|
| CPU 使用 | < 0.1% |
| 内存增长 | < 1MB |
| 快照间隔 | 30 秒 |
| 单次快照 | ~8.5KB |
| 每小时 | ~1MB |
| 每天 | ~24MB |

### 日志轮转

Winston 自动轮转配置：
- maxsize: 10MB
- maxFiles: 10
- 总空间: 100MB
- 保留时间: ~4 天

### 优化建议

| 场景 | 建议 |
|------|------|
| 高流量账户 | 增加间隔到 60 秒 |
| 低流量账户 | 保持默认 30 秒 |
| 生产环境 | 减少数据数量限制 |
| 调试环境 | 减少间隔到 15 秒 |

---

## 🛠️ 故障排查

### 问题 1: 未找到日志文件

**症状**: 监控脚本显示 "未找到日志文件"

**原因**:
- Master 未运行
- 账户未登录
- 爬虫未启动

**解决**:
```bash
# 1. 检查 Master 状态
curl http://localhost:3000/health

# 2. 检查账户状态
sqlite3 packages/master/data/master.db "SELECT id, platform, status FROM accounts"

# 3. 检查日志目录
ls -lh packages/worker/logs/
```

---

### 问题 2: 快照数据为空

**症状**: 快照中的 data 数组都是空的

**原因**:
- 账户刚登录，还没有数据
- 爬虫还没有运行
- 数据未入库

**解决**:
等待爬虫运行一段时间（至少 1 个监控周期）

---

### 问题 3: JSON 解析错误

**症状**: 监控脚本显示 "解析快照失败"

**原因**:
- 日志文件损坏
- Winston 格式变更
- 手动编辑了日志

**解决**:
```bash
# 验证 JSON 格式
grep "Data Snapshot" log.log | tail -1 | jq .

# 如果失败，检查原始内容
grep "Data Snapshot" log.log | tail -1
```

---

### 问题 4: 快照间隔不准确

**症状**: 快照时间戳间隔不是 30 秒

**原因**:
- 系统时间漂移
- Node.js 事件循环阻塞
- 手动触发了快照

**解决**:
这通常不是问题，允许 ±1 秒的误差

---

## 📚 相关文档

- [DataManager数据快照功能完整指南.md](./DataManager数据快照功能完整指南.md) - 详细文档
- [会话总结-DataManager数据快照功能实现.md](./会话总结-DataManager数据快照功能实现.md) - 开发过程
- [DataManager数据快照功能测试报告.md](./DataManager数据快照功能测试报告.md) - 测试结果

---

## 💡 使用技巧

### 技巧 1: 快速诊断账户状态

```bash
# 查看最新快照，快速了解账户数据状态
node tests/查看最新数据快照.js
```

### 技巧 2: 监控数据增长

```bash
# 定期运行，观察数据增长趋势
watch -n 60 "node tests/查看最新数据快照.js"
```

### 技巧 3: 导出快照数据

```bash
# 导出所有快照到 JSON 文件
grep "Data Snapshot" packages/worker/logs/*.log | \
  jq -s '.' > snapshots.json
```

### 技巧 4: 对比不同时间的快照

```javascript
const snapshots = [...]; // 从日志读取

const diff = {
  conversations: snapshots[1].stats.collections.conversations.total -
                 snapshots[0].stats.collections.conversations.total,
  messages: snapshots[1].stats.collections.messages.total -
            snapshots[0].stats.collections.messages.total,
};

console.log('新增会话:', diff.conversations);
console.log('新增消息:', diff.messages);
```

---

## 🎯 最佳实践

### 1. 定期查看快照

每天至少查看一次数据快照，确保：
- 数据正常增长
- 没有异常状态
- 同步正常运行

### 2. 保留历史快照

定期备份日志文件：

```bash
# 每周备份一次
cp -r packages/worker/logs backup/logs-$(date +%Y%m%d)
```

### 3. 监控关键指标

重点关注：
- 未读消息数（`unreadCount`）
- 新增数据数量（`collections.*.new`）
- 同步延迟（`sync.pendingSync`）

### 4. 优化快照配置

根据实际需求调整：
- 高频账户：增加间隔
- 低频账户：减少间隔
- 调试阶段：增加数据限制

---

**版本**: v1.0
**维护者**: Claude Code
**最后更新**: 2025-10-29
