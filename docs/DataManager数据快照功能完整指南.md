# DataManager 数据快照功能完整指南

**实施日期**: 2025-10-29
**功能**: 定时序列化数据到日志
**位置**: `packages/worker/src/platforms/base/account-data-manager.js`

---

## 功能概述

### 问题

之前的日志只记录了简单的操作信息：
```json
{"level":"debug","message":"Upserted conversation: conv_xxx (用户A)"}
{"level":"info","message":"Batch upserted 3 conversations"}
```

**缺点**:
- ❌ 看不到具体的数据内容
- ❌ 无法验证数据完整性
- ❌ 调试困难

### 解决方案

新增 **数据快照功能**，定期将完整数据序列化为 JSON 记录到日志中。

**特性**:
- ✅ 每 30 秒自动记录一次完整数据快照
- ✅ 包含所有会话、消息、作品、评论
- ✅ 只保留关键字段（避免日志过大）
- ✅ 可以看到实际的用户名、内容文本等
- ✅ 支持手动触发快照

---

## 实现细节

### 核心方法

#### 1. `startDataSnapshot(interval = 30000)`

启动数据快照定时器。

**参数**:
- `interval`: 快照间隔（毫秒），默认 30000ms（30秒）

**行为**:
- 自动在 DataManager 初始化时启动
- 定期调用 `logDataSnapshot()` 方法
- 记录启动日志

#### 2. `logDataSnapshot()`

记录数据快照到日志。

**快照内容**:
```json
{
  "timestamp": "2025-10-29T05:03:14.163Z",
  "accountId": "acc-xxx",
  "platform": "douyin",
  "stats": {
    "account": {...},
    "collections": {...},
    "sync": {...}
  },
  "data": {
    "conversations": [
      {
        "id": "conv_xxx",
        "conversationId": "10001",
        "userId": "10001",
        "userName": "张三",
        "userAvatar": "https://example.com/avatar1.jpg",
        "unreadCount": 0,
        "lastMessageContent": "你好，请问产品还有货吗？",
        "lastMessageTime": 1761710594157,
        "status": "new",
        "createdAt": 1761714194154,
        "updatedAt": 1761714194157
      },
      ...
    ],
    "messages": [
      {
        "id": "msg_xxx",
        "messageId": "msg_001",
        "conversationId": "10001",
        "senderId": "10001",
        "senderName": "张三",
        "type": "text",
        "content": "你好，请问产品还有货吗？",  // 截断到100字符
        "direction": "incoming",
        "status": "delivered",
        "createdAt": 1761710594157
      },
      ...
    ],
    "contents": [
      {
        "id": "cont_xxx",
        "contentId": "video_001",
        "type": "video",
        "title": "新品上市，限时优惠！",  // 截断到50字符
        "description": "...",  // 截断到100字符
        "viewCount": 1500,
        "likeCount": 89,
        "commentCount": 23,
        "publishTime": 1761627794157,
        "status": "new"
      },
      ...
    ],
    "comments": [
      {
        "id": "comm_xxx",
        "commentId": "comment_001",
        "contentId": "video_001",
        "authorId": "20001",
        "authorName": "评论者A",
        "content": "产品看起来不错！",  // 截断到100字符
        "likeCount": 5,
        "replyCount": 1,
        "status": "new",
        "createdAt": 1761710594157
      },
      ...
    ]
  }
}
```

#### 3. 序列化方法

为每种数据类型提供专门的序列化方法：

- `serializeConversation(conversation)` - 会话
- `serializeMessage(message)` - 消息
- `serializeContent(content)` - 作品
- `serializeComment(comment)` - 评论

**设计考虑**:
- 只保留关键字段（避免冗余）
- 长文本截断（content 100字符，title 50字符）
- 消息和评论限制数量（前10条）

#### 4. `stopDataSnapshot()`

停止数据快照定时器。

**调用时机**:
- `destroy()` 方法中自动调用
- 手动停止（如果需要）

---

## 使用方法

### 自动启动（推荐）

DataManager 初始化时会自动启动快照功能，无需额外配置。

```javascript
const dataManager = new DouyinDataManager(accountId, dataPusher);
// ✅ 快照功能已自动启动，每30秒记录一次
```

### 手动触发快照

```javascript
// 立即记录一次快照
dataManager.logDataSnapshot();
```

### 自定义快照间隔

```javascript
// 修改间隔为 60 秒
dataManager.stopDataSnapshot();
dataManager.startDataSnapshot(60000);
```

### 停止快照

```javascript
dataManager.stopDataSnapshot();
```

---

## 查看快照日志

### 日志文件位置

快照记录在平台特定的日志文件中：

```
packages/worker/logs/
└── douyin-data_acc-<账户ID>.log  ← 快照在这里
```

### 查看所有快照

```bash
# 方式 1: 查看所有快照日志
grep "📸 Data Snapshot" packages/worker/logs/douyin-data_acc-*.log

# 方式 2: 使用 jq 格式化
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  sed 's/.*Data Snapshot://g' | jq
```

### 查看最新快照

```bash
# 获取最后一次快照
grep "📸 Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  tail -1 | sed 's/.*Data Snapshot://g' | jq
```

### 提取特定数据

```bash
# 只看会话数据
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  sed 's/.*Data Snapshot://g' | jq '.data.conversations'

# 只看消息数据
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  sed 's/.*Data Snapshot://g' | jq '.data.messages'

# 查看统计信息
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  sed 's/.*Data Snapshot://g' | jq '.stats'
```

### 按时间筛选

```bash
# 查看特定时间段的快照
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  sed 's/.*Data Snapshot://g' | \
  jq 'select(.timestamp > "2025-10-29T10:00:00")'
```

---

## 实际示例

### 示例 1: 查看用户名

查看所有会话中的用户信息：

```bash
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  sed 's/.*Data Snapshot://g' | \
  jq -r '.data.conversations[] | "\(.userName) (\(.userId))"'
```

**输出**:
```
张三 (10001)
李四 (10002)
王五 (10003)
```

### 示例 2: 查看消息内容

查看最近的消息内容：

```bash
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  tail -1 | sed 's/.*Data Snapshot://g' | \
  jq -r '.data.messages[] | "[\(.senderName)] \(.content)"'
```

**输出**:
```
[张三] 你好，请问产品还有货吗？
[客服] 您好！有货的，欢迎下单。
[李四] 什么时候能发货？
```

### 示例 3: 数据统计

查看数据统计信息：

```bash
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  tail -1 | sed 's/.*Data Snapshot://g' | \
  jq '.stats.collections | to_entries[] | {type: .key, total: .value.total}'
```

**输出**:
```json
{"type":"conversations","total":3}
{"type":"messages","total":3}
{"type":"contents","total":1}
{"type":"comments","total":2}
{"type":"notifications","total":0}
```

---

## 性能考虑

### 日志大小估算

**单次快照大小**（估算）:
- 基础信息: ~200 字节
- 每个会话: ~300 字节
- 每条消息: ~200 字节（前10条）
- 每个作品: ~250 字节（前5个）
- 每条评论: ~200 字节（前10条）

**示例计算**:
- 10 个会话 + 10 条消息 + 5 个作品 + 10 条评论
- = 200 + (10×300) + (10×200) + (5×250) + (10×200)
- = 200 + 3000 + 2000 + 1250 + 2000
- = **8450 字节** (~8KB)

**每小时**:
- 快照间隔 30秒 = 120 次/小时
- 120 × 8KB = **960KB/小时**

**每天**:
- 24 小时 × 960KB = **23MB/天**

**Winston 自动轮转**:
- maxsize: 10MB
- maxFiles: 10
- 总空间: 100MB（约4天）

### 优化建议

如果快照过大：

#### 1. 增加间隔

```javascript
// 从 30 秒改为 60 秒
dataManager.startDataSnapshot(60000);
```

#### 2. 减少数量

修改 `logDataSnapshot()` 方法：

```javascript
data: {
  conversations: this.getAllConversations().slice(0, 5),  // 减少到5个
  messages: this.getAllMessages().slice(0, 5),            // 减少到5条
  contents: this.getAllContents().slice(0, 3),            // 减少到3个
  comments: this.getAllComments().slice(0, 5),            // 减少到5条
}
```

#### 3. 按需启用

仅在调试时启用快照：

```javascript
// 生产环境禁用
if (process.env.NODE_ENV === 'development') {
  dataManager.startDataSnapshot();
}
```

---

## 调试技巧

### 实时监控快照

```bash
# 实时查看快照日志
tail -f packages/worker/logs/douyin-data_acc-*.log | \
  grep --line-buffered "Data Snapshot"
```

### 导出快照到文件

```bash
# 导出所有快照到 JSON 文件
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  sed 's/.*Data Snapshot://g' > snapshots.json

# 使用 jq 分析
cat snapshots.json | jq '.data.conversations | length'
```

### 对比前后快照

```bash
# 获取第一次和最后一次快照
grep "Data Snapshot" packages/worker/logs/douyin-data_acc-*.log | \
  sed 's/.*Data Snapshot://g' > all-snapshots.json

# 第一次快照
head -1 all-snapshots.json | jq '.stats.collections.conversations.total'

# 最后一次快照
tail -1 all-snapshots.json | jq '.stats.collections.conversations.total'
```

---

## 与 Master 同步对比

### 快照 vs 同步

| 功能 | 数据快照 | Master 同步 |
|------|---------|------------|
| 目的 | 调试、验证 | 持久化存储 |
| 频率 | 30秒 | 5秒 |
| 位置 | Worker 日志 | Master 数据库 |
| 完整性 | 部分（限制数量）| 全部 |
| 持久性 | 临时（日志轮转）| 永久 |
| 查询 | 文本搜索 | SQL 查询 |

**建议**:
- 使用快照进行实时调试
- 使用同步进行数据持久化
- 两者互补，不冲突

---

## 故障排查

### 问题 1: 看不到快照日志

**检查步骤**:

```bash
# 1. 确认日志文件存在
ls packages/worker/logs/douyin-data_acc-*.log

# 2. 确认快照功能启动
grep "Data snapshot started" packages/worker/logs/data-manager_acc-*.log

# 3. 检查日志级别
echo $LOG_LEVEL  # 应该是 info 或 debug

# 4. 查看所有日志
cat packages/worker/logs/douyin-data_acc-*.log
```

### 问题 2: 快照间隔不准确

**原因**: Node.js 定时器精度有限

**解决**: 这是正常现象，误差在±几百毫秒范围内

### 问题 3: 日志文件过大

**解决**:

```bash
# 1. 检查文件大小
du -h packages/worker/logs/douyin-data_acc-*.log

# 2. 增加快照间隔
# 在代码中修改: dataManager.startDataSnapshot(60000)

# 3. 手动压缩旧日志
gzip packages/worker/logs/*.log.1
```

---

## 未来改进

### 计划功能

1. **智能快照** - 仅在数据变化时记录
2. **压缩快照** - 使用 gzip 压缩 JSON
3. **快照历史** - 独立的快照文件（非混在日志中）
4. **可视化** - Web UI 查看快照数据
5. **数据对比** - 自动对比快照差异

### 配置化

未来可能添加配置选项：

```javascript
dataManager.snapshotConfig = {
  enabled: true,
  interval: 30000,
  maxConversations: 10,
  maxMessages: 10,
  maxContents: 5,
  maxComments: 10,
  includeRawData: false, // 是否包含原始数据
};
```

---

## 相关文档

- [DataManager日志真实验证成功报告.md](./DataManager日志真实验证成功报告.md) - 日志验证
- [日志系统文件名清理功能实现.md](./日志系统文件名清理功能实现.md) - 文件名修复
- [DataManager日志验证结果和使用指南.md](./DataManager日志验证结果和使用指南.md) - 使用指南

---

**状态**: ✅ 已实现并测试
**维护者**: 系统开发团队
**最后更新**: 2025-10-29
