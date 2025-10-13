# 数据库字典 - HisCrm-IM 社交媒体监控系统

**版本**: 1.0.0
**数据库类型**: SQLite 3.x
**ORM**: 无 (直接使用 better-sqlite3)
**最后更新**: 2025-10-13

---

## 📚 目录

- [数据库架构概览](#数据库架构概览)
- [主控数据库 (master.db)](#主控数据库-masterdb)
  - [1. accounts - 账户表](#1-accounts---账户表)
  - [2. comments - 评论表](#2-comments---评论表)
  - [3. direct_messages - 私信表](#3-direct_messages---私信表)
  - [4. notifications - 通知表](#4-notifications---通知表)
  - [5. workers - Worker节点表](#5-workers---worker节点表)
  - [6. client_sessions - 客户端会话表](#6-client_sessions---客户端会话表)
  - [7. notification_rules - 通知规则表](#7-notification_rules---通知规则表)
- [Worker数据库 (worker_{id}.db)](#worker数据库-worker_iddb)
  - [8. monitor_tasks - 监控任务表](#8-monitor_tasks---监控任务表)
  - [9. crawl_cache - 抓取缓存表](#9-crawl_cache---抓取缓存表)
- [数据关系图](#数据关系图)
- [索引策略](#索引策略)
- [数据保留策略](#数据保留策略)
- [常用查询示例](#常用查询示例)

---

## 数据库架构概览

### 数据库分布

```
HisCrm-IM 系统
├── Master (主控服务)
│   └── data/master.db              # 主控数据库
│       ├── accounts                # 7张表
│       ├── comments
│       ├── direct_messages
│       ├── notifications
│       ├── workers
│       ├── client_sessions
│       └── notification_rules
│
└── Worker (监控进程)
    ├── data/browser/worker-1/
    │   └── worker_1.db             # Worker-1 数据库
    │       ├── monitor_tasks       # 2张表
    │       └── crawl_cache
    │
    ├── data/browser/worker-2/
    │   └── worker_2.db             # Worker-2 数据库
    │
    └── data/browser/worker-3/
        └── worker_3.db             # Worker-3 数据库
```

### 数据隔离原则

- ✅ **Master-Worker隔离**: 主控和Worker使用独立数据库文件
- ✅ **Worker间隔离**: 每个Worker有独立数据目录和数据库
- ✅ **并发安全**: 使用SQLite WAL模式提高并发读写性能
- ✅ **数据一致性**: Master通过Socket.IO与Worker通信同步状态

---

## 主控数据库 (master.db)

**位置**: `packages/master/data/master.db`
**Schema文件**: `packages/master/src/database/schema.sql`

### 配置

```javascript
// WAL模式 - 提高并发性能
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000'); // 64MB缓存
```

---

### 1. accounts - 账户表

**用途**: 存储用户配置的社交媒体账户信息

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 账户唯一ID (UUID格式) |
| platform | TEXT | NOT NULL | 平台类型: 'douyin', 'weibo'等 |
| account_name | TEXT | NOT NULL | 账户显示名称 (用户自定义) |
| account_id | TEXT | NOT NULL | 平台原始账户ID |
| credentials | TEXT | NOT NULL | **加密**的登录凭证 (JSON字符串) |
| status | TEXT | NOT NULL, DEFAULT 'active' | 账户状态 |
| monitor_interval | INTEGER | DEFAULT 30 | 监控间隔 (秒) |
| last_check_time | INTEGER | NULL | 最后检查时间 (Unix timestamp) |
| assigned_worker_id | TEXT | NULL | 分配的Worker ID |
| created_at | INTEGER | NOT NULL | 创建时间 (Unix timestamp) |
| updated_at | INTEGER | NOT NULL | 更新时间 (Unix timestamp) |

#### 唯一约束

```sql
UNIQUE(platform, account_id)  -- 同一平台同一账户只能添加一次
```

#### 索引

```sql
CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_worker ON accounts(assigned_worker_id);
```

#### 字段详细说明

##### status 状态枚举

| 值 | 说明 | 触发条件 |
|----|------|----------|
| `active` | 正常监控中 | 默认状态,Worker正常运行 |
| `paused` | 用户暂停监控 | 用户手动暂停 |
| `error` | 监控失败 | Worker报告错误(网络、限流等) |
| `expired` | 凭证已过期 | 登录状态失效,需重新认证 |

##### credentials 凭证加密

```javascript
// 加密前 (明文JSON)
{
  "cookies": [...],
  "token": "xxx",
  "sessionId": "yyy"
}

// 加密后 (AES-256-CBC)
credentials: "U2FsdGVkX1+..."  // Base64编码的加密字符串
```

#### 示例数据

```json
{
  "id": "acc-550e8400-e29b-41d4-a716-446655440000",
  "platform": "douyin",
  "account_name": "我的抖音营销号",
  "account_id": "dy_123456789",
  "credentials": "U2FsdGVkX1+vupppZksvRf5pq5g5XjFRl...",
  "status": "active",
  "monitor_interval": 30,
  "last_check_time": 1697184000,
  "assigned_worker_id": "worker-001",
  "created_at": 1697100000,
  "updated_at": 1697184000
}
```

#### 业务规则

- ✅ 监控间隔范围: 10-300秒 (防止过于频繁)
- ✅ 账户名称长度: 1-50字符
- ✅ 凭证必须加密存储,禁止明文
- ✅ Worker离线时,账户需重新分配

---

### 2. comments - 评论表

**用途**: 存储监控到的评论数据

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 评论唯一ID (UUID) |
| account_id | TEXT | NOT NULL, FK | 关联的账户ID |
| platform_comment_id | TEXT | NULL | 平台原始评论ID |
| content | TEXT | NOT NULL | 评论内容 (最大10000字符) |
| author_name | TEXT | NULL | 评论者昵称 |
| author_id | TEXT | NULL | 评论者平台ID |
| post_id | TEXT | NULL | 关联的帖子/视频ID |
| post_title | TEXT | NULL | 帖子标题 |
| is_read | BOOLEAN | DEFAULT 0 | 是否已读 (0=未读, 1=已读) |
| detected_at | INTEGER | NOT NULL | 检测时间 (Unix timestamp) |
| created_at | INTEGER | NOT NULL | 评论创建时间 (Unix timestamp) |

#### 外键

```sql
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
```

#### 索引

```sql
CREATE INDEX idx_comments_account ON comments(account_id);
CREATE INDEX idx_comments_read ON comments(is_read);
CREATE INDEX idx_comments_detected ON comments(detected_at);
```

#### 状态流转

```
新检测 → is_read=0 (未读)
   ↓
用户查看 → is_read=1 (已读)
   ↓
30天后 → DELETE (自动清理)
```

#### 示例数据

```json
{
  "id": "cmt-660e8400-e29b-41d4-a716-446655440001",
  "account_id": "acc-550e8400-e29b-41d4-a716-446655440000",
  "platform_comment_id": "7289374892374892",
  "content": "这个产品真的很棒!想了解更多信息",
  "author_name": "张三",
  "author_id": "user_987654",
  "post_id": "video_123456",
  "post_title": "产品演示视频",
  "is_read": 0,
  "detected_at": 1697184100,
  "created_at": 1697184050
}
```

---

### 3. direct_messages - 私信表

**用途**: 存储监控到的私信数据

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 私信唯一ID (UUID) |
| account_id | TEXT | NOT NULL, FK | 关联的账户ID |
| platform_message_id | TEXT | NULL | 平台原始私信ID |
| content | TEXT | NOT NULL | 私信内容 (最大20000字符) |
| sender_name | TEXT | NULL | 发送者昵称 |
| sender_id | TEXT | NULL | 发送者平台ID |
| direction | TEXT | NOT NULL | 消息方向 |
| is_read | BOOLEAN | DEFAULT 0 | 是否已读 |
| detected_at | INTEGER | NOT NULL | 检测时间 (Unix timestamp) |
| created_at | INTEGER | NOT NULL | 私信创建时间 (Unix timestamp) |

#### direction 方向枚举

| 值 | 说明 |
|----|------|
| `incoming` | 接收的私信 (别人发给我) |
| `outgoing` | 发送的私信 (我发给别人,用于完整对话历史) |

#### 外键和索引

```sql
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE

CREATE INDEX idx_dm_account ON direct_messages(account_id);
CREATE INDEX idx_dm_read ON direct_messages(is_read);
CREATE INDEX idx_dm_detected ON direct_messages(detected_at);
```

#### 示例数据

```json
{
  "id": "dm-770e8400-e29b-41d4-a716-446655440002",
  "account_id": "acc-550e8400-e29b-41d4-a716-446655440000",
  "platform_message_id": "msg_9876543210",
  "content": "你好,想咨询一下产品价格",
  "sender_name": "李四",
  "sender_id": "user_111222",
  "direction": "incoming",
  "is_read": 0,
  "detected_at": 1697184200,
  "created_at": 1697184180
}
```

---

### 4. notifications - 通知表

**用途**: 通知队列,用于向客户端推送消息

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 通知唯一ID (UUID) |
| type | TEXT | NOT NULL | 通知类型 |
| account_id | TEXT | NULL, FK | 关联账户ID (系统通知可为空) |
| related_id | TEXT | NULL | 关联的评论/私信ID |
| title | TEXT | NOT NULL | 通知标题 |
| content | TEXT | NOT NULL | 通知内容 |
| data | TEXT | NULL | 附加数据 (JSON) |
| is_sent | BOOLEAN | DEFAULT 0 | 是否已发送 |
| sent_at | INTEGER | NULL | 发送时间 (Unix timestamp) |
| created_at | INTEGER | NOT NULL | 创建时间 (Unix timestamp) |

#### type 类型枚举

| 值 | 说明 | account_id | related_id |
|----|------|------------|------------|
| `comment` | 新评论通知 | 必填 | comments.id |
| `direct_message` | 新私信通知 | 必填 | direct_messages.id |
| `system` | 系统通知 | 可空 | NULL |
| `account_error` | 账户错误通知 | 必填 | NULL |

#### 通知流程

```
1. Worker检测到新消息
   ↓
2. INSERT通知 (is_sent=0)
   ↓
3. Master推送给客户端
   ↓
4. UPDATE is_sent=1, sent_at=now()
   ↓
5. 7天后自动DELETE
```

#### 索引

```sql
CREATE INDEX idx_notifications_sent ON notifications(is_sent);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

#### 示例数据

```json
{
  "id": "ntf-880e8400-e29b-41d4-a716-446655440003",
  "type": "comment",
  "account_id": "acc-550e8400-e29b-41d4-a716-446655440000",
  "related_id": "cmt-660e8400-e29b-41d4-a716-446655440001",
  "title": "新评论提醒",
  "content": "张三 评论了你的视频: 这个产品真的很棒!想了解更多信息",
  "data": "{\"post_title\":\"产品演示视频\",\"url\":\"https://...\"}",
  "is_sent": 0,
  "sent_at": null,
  "created_at": 1697184150
}
```

---

### 5. workers - Worker节点表

**用途**: 管理Worker进程的注册和健康状态

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | Worker唯一ID |
| host | TEXT | NOT NULL | Worker主机地址 |
| port | INTEGER | NOT NULL | Worker端口 |
| status | TEXT | NOT NULL | Worker状态 |
| assigned_accounts | INTEGER | DEFAULT 0 | 已分配的账户数量 |
| last_heartbeat | INTEGER | NOT NULL | 最后心跳时间 (Unix timestamp) |
| started_at | INTEGER | NOT NULL | 启动时间 (Unix timestamp) |
| version | TEXT | NULL | Worker版本号 (如 "1.0.0") |
| metadata | TEXT | NULL | Worker元数据 (JSON) |

#### status 状态枚举

| 值 | 说明 | 判断条件 |
|----|------|----------|
| `online` | 正常运行 | 心跳正常 (< 30秒) |
| `offline` | 离线 | 心跳超时 (> 30秒) |
| `error` | 错误 | Worker报告错误状态 |

#### 索引

```sql
CREATE INDEX idx_workers_status ON workers(status);
```

#### 心跳机制

```javascript
// Worker每10秒发送心跳
setInterval(() => {
  socket.emit('worker:heartbeat', { workerId, timestamp: Date.now() });
}, 10000);

// Master检测心跳超时
if (now - worker.last_heartbeat > 30000) {
  worker.status = 'offline';
  // 重新分配账户
}
```

#### 示例数据

```json
{
  "id": "worker-001",
  "host": "192.168.1.100",
  "port": 3001,
  "status": "online",
  "assigned_accounts": 5,
  "last_heartbeat": 1697184300,
  "started_at": 1697180000,
  "version": "1.0.0",
  "metadata": "{\"cpu\":\"50%\",\"memory\":\"150MB\",\"pid\":12345}"
}
```

---

### 6. client_sessions - 客户端会话表

**用途**: 管理桌面和移动客户端的连接会话

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 会话唯一ID (UUID) |
| device_id | TEXT | NOT NULL, UNIQUE | 设备唯一标识 |
| device_type | TEXT | NOT NULL | 设备类型 |
| device_name | TEXT | NULL | 设备名称 (用户自定义) |
| socket_id | TEXT | NULL | Socket.IO连接ID |
| status | TEXT | NOT NULL | 会话状态 |
| last_seen | INTEGER | NOT NULL | 最后活跃时间 (Unix timestamp) |
| connected_at | INTEGER | NOT NULL | 连接时间 (Unix timestamp) |

#### device_type 设备类型

| 值 | 说明 |
|----|------|
| `desktop` | Electron桌面客户端 |
| `ios` | iOS移动客户端 |
| `android` | Android移动客户端 |
| `web` | Web浏览器客户端 (如有) |

#### status 状态枚举

| 值 | 说明 |
|----|------|
| `online` | 在线 |
| `offline` | 离线 |

#### 索引

```sql
CREATE INDEX idx_sessions_status ON client_sessions(status);
```

#### 示例数据

```json
{
  "id": "sess-990e8400-e29b-41d4-a716-446655440004",
  "device_id": "desktop-mac-001",
  "device_type": "desktop",
  "device_name": "张三的MacBook Pro",
  "socket_id": "abc123xyz456",
  "status": "online",
  "last_seen": 1697184350,
  "connected_at": 1697180000
}
```

---

### 7. notification_rules - 通知规则表

**用途**: 用户自定义的通知过滤和优先级规则

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 规则唯一ID (UUID) |
| account_id | TEXT | NULL, FK | 关联账户ID (NULL=全局规则) |
| rule_type | TEXT | NOT NULL | 规则类型 |
| config | TEXT | NOT NULL | 规则配置 (JSON) |
| enabled | BOOLEAN | DEFAULT 1 | 是否启用 |
| created_at | INTEGER | NOT NULL | 创建时间 (Unix timestamp) |

#### rule_type 规则类型

| 类型 | 说明 | config示例 |
|------|------|-----------|
| `keyword` | 关键词过滤 | `{"keywords":["重要","紧急"],"action":"notify"}` |
| `schedule` | 免打扰时段 | `{"start":"22:00","end":"08:00","action":"silent"}` |
| `priority` | 优先级 | `{"accounts":["acc-001"],"sound":"high"}` |

#### 外键和索引

```sql
FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE

CREATE INDEX idx_rules_enabled ON notification_rules(enabled);
```

#### 示例数据

```json
// 关键词规则
{
  "id": "rule-001",
  "account_id": "acc-550e8400-e29b-41d4-a716-446655440000",
  "rule_type": "keyword",
  "config": "{\"keywords\":[\"合作\",\"采购\",\"价格\"],\"action\":\"notify\"}",
  "enabled": 1,
  "created_at": 1697180000
}

// 免打扰规则
{
  "id": "rule-002",
  "account_id": null,  // 全局规则
  "rule_type": "schedule",
  "config": "{\"start\":\"22:00\",\"end\":\"08:00\",\"action\":\"silent\"}",
  "enabled": 1,
  "created_at": 1697180000
}
```

---

## Worker数据库 (worker_{id}.db)

**位置**: `packages/worker/data/browser/worker-{id}/worker_{id}.db`
**Schema文件**: `packages/worker/src/database/schema.sql`

### 数据隔离

- 每个Worker进程有独立的数据库文件
- 数据库文件位于Worker专属目录
- Worker之间完全隔离,无共享数据

---

### 8. monitor_tasks - 监控任务表

**用途**: Worker本地的监控任务管理

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 任务唯一ID (UUID) |
| account_id | TEXT | NOT NULL | 关联的账户ID (引用Master) |
| platform | TEXT | NOT NULL | 平台类型 |
| monitor_interval | INTEGER | DEFAULT 30 | 监控间隔 (秒) |
| last_run | INTEGER | NULL | 最后执行时间 (Unix timestamp) |
| next_run | INTEGER | NULL | 下次执行时间 (Unix timestamp) |
| status | TEXT | NOT NULL | 任务状态 |
| retry_count | INTEGER | DEFAULT 0 | 重试次数 |
| error_message | TEXT | NULL | 错误信息 |
| created_at | INTEGER | NOT NULL | 创建时间 (Unix timestamp) |

#### status 状态枚举

| 值 | 说明 |
|----|------|
| `pending` | 待执行 |
| `running` | 执行中 |
| `completed` | 已完成 |
| `failed` | 失败 (达到最大重试次数) |

#### 索引

```sql
CREATE INDEX idx_tasks_next_run ON monitor_tasks(next_run);
CREATE INDEX idx_tasks_status ON monitor_tasks(status);
```

#### 任务调度逻辑

```javascript
// node-cron每10秒检查一次
cron.schedule('*/10 * * * * *', async () => {
  const now = Date.now();
  const tasks = db.prepare(`
    SELECT * FROM monitor_tasks
    WHERE next_run <= ? AND status = 'pending'
  `).all(now);

  for (const task of tasks) {
    await executeMonitorTask(task);
  }
});
```

#### 示例数据

```json
{
  "id": "task-001",
  "account_id": "acc-550e8400-e29b-41d4-a716-446655440000",
  "platform": "douyin",
  "monitor_interval": 30,
  "last_run": 1697184300,
  "next_run": 1697184330,
  "status": "completed",
  "retry_count": 0,
  "error_message": null,
  "created_at": 1697180000
}
```

---

### 9. crawl_cache - 抓取缓存表

**用途**: 避免重复抓取相同的评论或私信

#### 表结构

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY | 缓存唯一ID (UUID) |
| account_id | TEXT | NOT NULL | 关联账户ID |
| data_type | TEXT | NOT NULL | 数据类型 |
| cache_key | TEXT | NOT NULL | 缓存键 (平台ID) |
| cache_value | TEXT | NOT NULL | 缓存内容 (JSON) |
| expires_at | INTEGER | NOT NULL | 过期时间 (Unix timestamp) |
| created_at | INTEGER | NOT NULL | 创建时间 (Unix timestamp) |

#### 唯一约束

```sql
UNIQUE(account_id, data_type, cache_key)
```

#### data_type 数据类型

| 值 | 说明 | cache_key示例 |
|----|------|---------------|
| `comment` | 评论 | 平台评论ID |
| `message` | 私信 | 平台私信ID |
| `profile` | 用户资料 | 用户ID |

#### 索引

```sql
CREATE INDEX idx_cache_expires ON crawl_cache(expires_at);
```

#### 缓存策略

```javascript
// 检查缓存是否存在
const cached = db.prepare(`
  SELECT * FROM crawl_cache
  WHERE account_id = ? AND data_type = ? AND cache_key = ?
  AND expires_at > ?
`).get(accountId, 'comment', commentId, Date.now());

if (cached) {
  // 已存在,跳过
  return null;
}

// 不存在,插入缓存
db.prepare(`
  INSERT OR REPLACE INTO crawl_cache
  (id, account_id, data_type, cache_key, cache_value, expires_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(
  uuid(),
  accountId,
  'comment',
  commentId,
  JSON.stringify(comment),
  Date.now() + 86400000, // 24小时过期
  Date.now()
);
```

#### 示例数据

```json
{
  "id": "cache-001",
  "account_id": "acc-550e8400-e29b-41d4-a716-446655440000",
  "data_type": "comment",
  "cache_key": "7289374892374892",
  "cache_value": "{\"content\":\"...\",\"author\":\"...\"}",
  "expires_at": 1697270400,
  "created_at": 1697184000
}
```

---

## 数据关系图

### 主控数据库关系

```
┌─────────────────┐
│    accounts     │───┐
└─────────────────┘   │
         │            │
         │ 1          │ 1
         │            │
         ↓ N          ↓ N
┌─────────────────┐  ┌──────────────────┐
│    comments     │  │ direct_messages  │
└─────────────────┘  └──────────────────┘
         │                    │
         └────────┬───────────┘
                  │
                  ↓ related_id
         ┌─────────────────┐
         │ notifications   │
         └─────────────────┘

┌─────────────────┐
│    accounts     │───┐
└─────────────────┘   │ N
         │ 1          │
         ↓ N          │
┌─────────────────┐   │
│notification_rules│   │
└─────────────────┘   │
                      │
              ┌───────┴────────┐
              │    workers     │
              └────────────────┘
                 assigned_worker_id

┌──────────────────┐
│ client_sessions  │  (独立表,无外键)
└──────────────────┘
```

### Worker数据库关系

```
Worker-1 Database
┌─────────────────┐
│ monitor_tasks   │  (引用 Master.accounts.id)
└─────────────────┘

┌─────────────────┐
│  crawl_cache    │  (引用 Master.accounts.id)
└─────────────────┘

(Worker数据库不使用外键约束)
```

---

## 索引策略

### 主控数据库索引

```sql
-- accounts表
idx_accounts_status       ON accounts(status)              -- 按状态筛选账户
idx_accounts_worker       ON accounts(assigned_worker_id) -- Worker查找分配的账户

-- comments表
idx_comments_account      ON comments(account_id)          -- 按账户查询评论
idx_comments_read         ON comments(is_read)             -- 查询未读评论
idx_comments_detected     ON comments(detected_at)         -- 按时间排序

-- direct_messages表
idx_dm_account            ON direct_messages(account_id)   -- 按账户查询私信
idx_dm_read               ON direct_messages(is_read)      -- 查询未读私信
idx_dm_detected           ON direct_messages(detected_at)  -- 按时间排序

-- notifications表
idx_notifications_sent    ON notifications(is_sent)        -- 查询待发送通知
idx_notifications_created ON notifications(created_at)     -- 按时间排序

-- workers表
idx_workers_status        ON workers(status)               -- 查询在线Worker

-- client_sessions表
idx_sessions_status       ON client_sessions(status)       -- 查询在线客户端

-- notification_rules表
idx_rules_enabled         ON notification_rules(enabled)   -- 查询启用的规则
```

### Worker数据库索引

```sql
-- monitor_tasks表
idx_tasks_next_run        ON monitor_tasks(next_run)       -- 任务调度
idx_tasks_status          ON monitor_tasks(status)         -- 按状态筛选

-- crawl_cache表
idx_cache_expires         ON crawl_cache(expires_at)       -- 清理过期缓存
```

---

## 数据保留策略

### 自动清理规则

#### 1. 历史消息清理 (30天保留)

```sql
-- 每天凌晨3点执行
DELETE FROM comments
WHERE detected_at < (strftime('%s', 'now') - 2592000);  -- 30天 = 2592000秒

DELETE FROM direct_messages
WHERE detected_at < (strftime('%s', 'now') - 2592000);
```

#### 2. 通知记录清理 (7天保留)

```sql
-- 已发送且超过7天的删除
DELETE FROM notifications
WHERE is_sent = 1
AND created_at < (strftime('%s', 'now') - 604800);  -- 7天 = 604800秒
```

#### 3. 离线会话清理 (30天保留)

```sql
-- 超过30天未活跃的删除
DELETE FROM client_sessions
WHERE status = 'offline'
AND last_seen < (strftime('%s', 'now') - 2592000);
```

#### 4. 离线Worker清理 (7天保留)

```sql
-- 离线超过7天的删除
DELETE FROM workers
WHERE status = 'offline'
AND last_heartbeat < (strftime('%s', 'now') - 604800);
```

#### 5. Worker缓存清理 (自动过期)

```sql
-- 每小时执行一次
DELETE FROM crawl_cache
WHERE expires_at < strftime('%s', 'now');
```

### 备份策略

```bash
#!/bin/bash
# 每天凌晨2点备份 master.db

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d)
DB_FILE="./data/master.db"

# 创建备份
sqlite3 $DB_FILE ".backup '$BACKUP_DIR/master_$DATE.db'"

# 保留最近7天的备份
find $BACKUP_DIR -name "master_*.db" -mtime +7 -delete
```

---

## 常用查询示例

### 1. 获取账户的未读消息统计

```sql
SELECT
  a.id,
  a.account_name,
  (SELECT COUNT(*) FROM comments WHERE account_id = a.id AND is_read = 0) AS unread_comments,
  (SELECT COUNT(*) FROM direct_messages WHERE account_id = a.id AND is_read = 0) AS unread_messages
FROM accounts a
WHERE a.status = 'active';
```

### 2. 获取需要重新分配的账户 (Worker离线)

```sql
SELECT a.*
FROM accounts a
LEFT JOIN workers w ON a.assigned_worker_id = w.id
WHERE a.status = 'active'
  AND (w.status = 'offline' OR w.id IS NULL);
```

### 3. 获取待发送的通知 (批量推送)

```sql
SELECT * FROM notifications
WHERE is_sent = 0
ORDER BY created_at ASC
LIMIT 100;
```

### 4. 获取账户的历史消息 (合并评论和私信)

```sql
SELECT * FROM (
  -- 评论
  SELECT
    id,
    'comment' AS type,
    content,
    author_name AS from_name,
    detected_at,
    created_at,
    is_read
  FROM comments
  WHERE account_id = ?

  UNION ALL

  -- 私信
  SELECT
    id,
    'message' AS type,
    content,
    sender_name AS from_name,
    detected_at,
    created_at,
    is_read
  FROM direct_messages
  WHERE account_id = ?
)
ORDER BY detected_at DESC
LIMIT ? OFFSET ?;
```

### 5. 获取在线Worker列表及负载

```sql
SELECT
  id,
  host,
  port,
  assigned_accounts,
  (strftime('%s', 'now') - last_heartbeat) AS seconds_since_heartbeat,
  version
FROM workers
WHERE status = 'online'
ORDER BY assigned_accounts ASC;  -- 按负载升序,用于分配新账户
```

### 6. 获取所有在线客户端

```sql
SELECT
  device_type,
  device_name,
  socket_id,
  (strftime('%s', 'now') - last_seen) AS seconds_since_active
FROM client_sessions
WHERE status = 'online'
ORDER BY last_seen DESC;
```

### 7. 应用通知规则 (关键词过滤示例)

```sql
-- 查询包含关键词的未读评论
SELECT c.*
FROM comments c
JOIN notification_rules nr ON (nr.account_id = c.account_id OR nr.account_id IS NULL)
WHERE c.is_read = 0
  AND nr.rule_type = 'keyword'
  AND nr.enabled = 1
  AND (
    -- JSON关键词匹配 (需要在应用层处理)
    c.content LIKE '%重要%' OR
    c.content LIKE '%紧急%'
  );
```

### 8. 统计账户互动数据 (最近7天)

```sql
SELECT
  a.account_name,
  COUNT(DISTINCT c.id) AS comment_count,
  COUNT(DISTINCT dm.id) AS message_count,
  COUNT(DISTINCT c.id) + COUNT(DISTINCT dm.id) AS total_interactions
FROM accounts a
LEFT JOIN comments c ON a.id = c.account_id
  AND c.detected_at >= (strftime('%s', 'now') - 604800)
LEFT JOIN direct_messages dm ON a.id = dm.account_id
  AND dm.detected_at >= (strftime('%s', 'now') - 604800)
WHERE a.status = 'active'
GROUP BY a.id
ORDER BY total_interactions DESC;
```

---

## 数据迁移

### 初始化数据库

```javascript
// packages/master/src/database/init.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function initDatabase() {
  const dbPath = path.join(__dirname, '../../data/master.db');
  const db = new Database(dbPath);

  // 启用WAL模式
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // 执行schema
  const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  );
  db.exec(schema);

  console.log('Database initialized successfully');
  return db;
}

module.exports = { initDatabase };
```

### 版本管理

```
packages/master/src/database/migrations/
├── 001_initial.sql           # 初始schema
├── 002_add_data_field.sql    # 添加 notifications.data 字段
└── 003_add_rules_table.sql   # 添加 notification_rules 表
```

```javascript
// migration runner
function runMigrations(db) {
  // 创建版本表
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  // 获取当前版本
  const currentVersion = db.prepare(
    'SELECT MAX(version) as version FROM schema_version'
  ).get()?.version || 0;

  // 执行未应用的migrations
  const migrationFiles = fs.readdirSync('./migrations')
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const version = parseInt(file.split('_')[0]);
    if (version > currentVersion) {
      const sql = fs.readFileSync(`./migrations/${file}`, 'utf8');
      db.exec(sql);
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
        .run(version, Date.now());
      console.log(`Applied migration: ${file}`);
    }
  }
}
```

---

## 性能优化建议

### 1. 使用预编译语句

```javascript
// ❌ 不推荐
db.exec(`SELECT * FROM accounts WHERE id = '${accountId}'`);

// ✅ 推荐
const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
const account = stmt.get(accountId);
```

### 2. 批量插入使用事务

```javascript
// ❌ 慢 (每次插入都提交)
comments.forEach(c => {
  db.prepare('INSERT INTO comments ...').run(c);
});

// ✅ 快 (批量提交)
const insertStmt = db.prepare('INSERT INTO comments (id, account_id, ...) VALUES (?, ?, ...)');
const insertMany = db.transaction((comments) => {
  for (const c of comments) {
    insertStmt.run(c.id, c.account_id, ...);
  }
});
insertMany(comments);
```

### 3. 定期VACUUM

```sql
-- 压缩数据库,回收空间
VACUUM;

-- 重建索引
REINDEX;
```

### 4. 监控数据库大小

```javascript
const fs = require('fs');
const stats = fs.statSync('./data/master.db');
const sizeMB = stats.size / (1024 * 1024);

if (sizeMB > 2000) {
  console.warn('Database size exceeds 2GB, consider archiving old data');
}
```

---

## 安全注意事项

### 1. 凭证加密

```javascript
const crypto = require('crypto');

// 加密
function encryptCredentials(plaintext, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

// 解密
function decryptCredentials(encrypted, key) {
  const [ivBase64, data] = encrypted.split(':');
  const iv = Buffer.from(ivBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

### 2. SQL注入防护

```javascript
// ❌ 危险 - SQL注入风险
const query = `SELECT * FROM accounts WHERE account_name = '${name}'`;

// ✅ 安全 - 使用参数化查询
const stmt = db.prepare('SELECT * FROM accounts WHERE account_name = ?');
const account = stmt.get(name);
```

### 3. 数据库文件权限

```bash
# 限制数据库文件权限
chmod 600 data/master.db
chmod 600 data/master.db-wal
chmod 600 data/master.db-shm
```

---

## 相关文档

- [数据模型设计](./specs/001-worker/data-model.md)
- [Master Schema](./packages/master/src/database/schema.sql)
- [Worker Schema](./packages/worker/src/database/schema.sql)
- [API契约文档](./specs/001-worker/contracts/)

---

**文档版本**: 1.0.0
**最后更新**: 2025-10-13
**维护者**: 开发团队
