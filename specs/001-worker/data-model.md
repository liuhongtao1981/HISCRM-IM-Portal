# Data Model: 社交媒体账户监控与通知系统

**Date**: 2025-10-11
**Database**: SQLite 3.x
**ORM**: 直接使用better-sqlite3 (无ORM)

## Database Schema

### 主控数据库 (master.db)

#### 1. accounts - 社交媒体账户表

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,              -- UUID格式
  platform TEXT NOT NULL,            -- 平台类型: 'douyin', 'weibo', etc.
  account_name TEXT NOT NULL,        -- 账户显示名称
  account_id TEXT NOT NULL,          -- 平台账户ID
  credentials TEXT NOT NULL,         -- 加密后的登录凭证(JSON)
  status TEXT NOT NULL DEFAULT 'active',  -- active, paused, error, expired
  monitor_interval INTEGER DEFAULT 30,    -- 监控间隔(秒)
  last_check_time INTEGER,           -- 最后检查时间(Unix timestamp)
  assigned_worker_id TEXT,           -- 分配的Worker ID
  created_at INTEGER NOT NULL,       -- 创建时间
  updated_at INTEGER NOT NULL,       -- 更新时间
  UNIQUE(platform, account_id)
);

CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_worker ON accounts(assigned_worker_id);
```

**字段说明**:
- `credentials`: AES-256加密的JSON字符串,包含cookies或token
- `status`:
  - active: 正常监控中
  - paused: 用户暂停监控
  - error: 监控失败(凭证过期、网络错误等)
  - expired: 凭证已过期,需要重新认证

**示例数据**:
```json
{
  "id": "acc-001",
  "platform": "douyin",
  "account_name": "我的抖音账号",
  "account_id": "dy123456",
  "credentials": "encrypted_base64_string",
  "status": "active",
  "monitor_interval": 30,
  "assigned_worker_id": "worker-001"
}
```

---

#### 2. comments - 评论表

```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,              -- 评论ID(平台ID或UUID)
  account_id TEXT NOT NULL,         -- 关联账户ID
  platform_comment_id TEXT,         -- 平台原始评论ID
  content TEXT NOT NULL,            -- 评论内容
  author_name TEXT,                 -- 评论者昵称
  author_id TEXT,                   -- 评论者ID
  post_id TEXT,                     -- 关联的帖子/视频ID
  post_title TEXT,                  -- 帖子标题
  is_read BOOLEAN DEFAULT 0,        -- 是否已读
  detected_at INTEGER NOT NULL,     -- 检测时间
  created_at INTEGER NOT NULL,      -- 评论创建时间
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_comments_account ON comments(account_id);
CREATE INDEX idx_comments_read ON comments(is_read);
CREATE INDEX idx_comments_detected ON comments(detected_at);
```

**State Transitions**:
- 新检测: `is_read = 0`
- 用户查看: `is_read = 1`
- 自动清理: 30天后DELETE

---

#### 3. direct_messages - 私信表

```sql
CREATE TABLE direct_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform_message_id TEXT,
  content TEXT NOT NULL,
  sender_name TEXT,
  sender_id TEXT,
  direction TEXT NOT NULL,          -- 'incoming', 'outgoing'
  is_read BOOLEAN DEFAULT 0,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_dm_account ON direct_messages(account_id);
CREATE INDEX idx_dm_read ON direct_messages(is_read);
CREATE INDEX idx_dm_detected ON direct_messages(detected_at);
```

**字段说明**:
- `direction`:
  - incoming: 接收的私信
  - outgoing: 发送的私信(用于完整对话历史)

---

#### 4. notifications - 通知队列表

```sql
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,               -- 'comment', 'direct_message', 'system'
  account_id TEXT,                  -- 关联账户(可为空,系统通知无账户)
  related_id TEXT,                  -- 关联的评论或私信ID
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_sent BOOLEAN DEFAULT 0,        -- 是否已发送
  sent_at INTEGER,                  -- 发送时间
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_notifications_sent ON notifications(is_sent);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

**Notification Flow**:
1. Worker检测到新消息 → INSERT通知
2. 主控推送给客户端 → UPDATE is_sent=1
3. 客户端确认 → 可选DELETE或保留7天

---

#### 5. workers - Worker节点注册表

```sql
CREATE TABLE workers (
  id TEXT PRIMARY KEY,              -- Worker ID
  host TEXT NOT NULL,               -- Worker主机地址
  port INTEGER NOT NULL,            -- Worker端口
  status TEXT NOT NULL,             -- online, offline, error
  assigned_accounts INTEGER DEFAULT 0,  -- 分配的账户数量
  last_heartbeat INTEGER NOT NULL,  -- 最后心跳时间
  started_at INTEGER NOT NULL,      -- 启动时间
  version TEXT,                     -- Worker版本号
  metadata TEXT                     -- Worker元数据(JSON)
);

CREATE INDEX idx_workers_status ON workers(status);
```

**Worker Status**:
- online: 正常运行,心跳正常
- offline: 心跳超时(>30秒)
- error: Worker报告错误状态

---

#### 6. client_sessions - 客户端会话表

```sql
CREATE TABLE client_sessions (
  id TEXT PRIMARY KEY,              -- 会话ID
  device_id TEXT NOT NULL,          -- 设备唯一标识
  device_type TEXT NOT NULL,        -- 'desktop', 'ios', 'android'
  device_name TEXT,                 -- 设备名称
  socket_id TEXT,                   -- Socket.IO连接ID
  status TEXT NOT NULL,             -- online, offline
  last_seen INTEGER NOT NULL,       -- 最后活跃时间
  connected_at INTEGER NOT NULL,    -- 连接时间
  UNIQUE(device_id)
);

CREATE INDEX idx_sessions_status ON client_sessions(status);
```

---

#### 7. notification_rules - 通知规则表

```sql
CREATE TABLE notification_rules (
  id TEXT PRIMARY KEY,
  account_id TEXT,                  -- NULL表示全局规则
  rule_type TEXT NOT NULL,          -- 'keyword', 'schedule', 'priority'
  config TEXT NOT NULL,             -- 规则配置(JSON)
  enabled BOOLEAN DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE INDEX idx_rules_enabled ON notification_rules(enabled);
```

**Rule Types**:
- keyword: 关键词过滤 `{"keywords": ["重要", "紧急"], "action": "notify"}`
- schedule: 免打扰时段 `{"start": "22:00", "end": "08:00", "action": "silent"}`
- priority: 优先级规则 `{"accounts": ["acc-001"], "sound": "high"}`

---

### Worker数据库 (worker_{id}.db)

#### 8. monitor_tasks - 监控任务表

```sql
CREATE TABLE monitor_tasks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,         -- 关联的主控账户ID
  platform TEXT NOT NULL,
  monitor_interval INTEGER DEFAULT 30,
  last_run INTEGER,                 -- 最后执行时间
  next_run INTEGER,                 -- 下次执行时间
  status TEXT NOT NULL,             -- pending, running, completed, failed
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_tasks_next_run ON monitor_tasks(next_run);
CREATE INDEX idx_tasks_status ON monitor_tasks(status);
```

---

#### 9. crawl_cache - 抓取缓存表

```sql
CREATE TABLE crawl_cache (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  data_type TEXT NOT NULL,          -- 'comment', 'message', 'profile'
  cache_key TEXT NOT NULL,          -- 缓存键(平台ID)
  cache_value TEXT NOT NULL,        -- 缓存内容(JSON)
  expires_at INTEGER NOT NULL,      -- 过期时间
  created_at INTEGER NOT NULL,
  UNIQUE(account_id, data_type, cache_key)
);

CREATE INDEX idx_cache_expires ON crawl_cache(expires_at);
```

**用途**: 避免重复抓取相同的评论或私信

---

## Entity Relationships

```
accounts (1) ──< (N) comments
accounts (1) ──< (N) direct_messages
accounts (1) ──< (N) notifications
accounts (N) ──> (1) workers (assigned_worker_id)
accounts (1) ──< (N) notification_rules

client_sessions (独立表,无外键)
monitor_tasks (Worker本地表,account_id仅作引用)
crawl_cache (Worker本地表)
```

---

## Data Validation Rules

### accounts表
- `platform`: 必须是支持的平台列表(初期仅'douyin')
- `account_name`: 长度1-50字符
- `credentials`: 必须是加密后的字符串
- `monitor_interval`: 范围10-300秒(防止过于频繁)

### comments表
- `content`: 不能为空,最大10000字符
- `detected_at`: 必须≤当前时间
- `created_at`: 必须≤detected_at

### direct_messages表
- `direction`: 枚举值['incoming', 'outgoing']
- `content`: 最大20000字符

### workers表
- `last_heartbeat`: 超过30秒未更新 → status='offline'
- `assigned_accounts`: 不能超过配置的最大值(默认10)

---

## Data Retention Policy

### 自动清理规则
- **历史消息**: 保留30天,每天凌晨3点清理
  ```sql
  DELETE FROM comments WHERE detected_at < (strftime('%s', 'now') - 2592000);
  DELETE FROM direct_messages WHERE detected_at < (strftime('%s', 'now') - 2592000);
  ```

- **通知记录**: 已发送且超过7天的删除
  ```sql
  DELETE FROM notifications WHERE is_sent = 1 AND created_at < (strftime('%s', 'now') - 604800);
  ```

- **离线会话**: 超过30天未活跃的删除
  ```sql
  DELETE FROM client_sessions WHERE status = 'offline' AND last_seen < (strftime('%s', 'now') - 2592000);
  ```

- **Worker记录**: 离线超过7天的删除
  ```sql
  DELETE FROM workers WHERE status = 'offline' AND last_heartbeat < (strftime('%s', 'now') - 604800);
  ```

### 备份策略
- 每天凌晨2点自动备份master.db
- 保留最近7天的备份
- Worker数据库不备份(可重建)

---

## Query Patterns

### 常用查询

#### 1. 获取账户的未读消息数
```sql
SELECT
  (SELECT COUNT(*) FROM comments WHERE account_id = ? AND is_read = 0) AS unread_comments,
  (SELECT COUNT(*) FROM direct_messages WHERE account_id = ? AND is_read = 0) AS unread_messages;
```

#### 2. 获取需要重新分配的账户(Worker离线)
```sql
SELECT a.*
FROM accounts a
LEFT JOIN workers w ON a.assigned_worker_id = w.id
WHERE w.status = 'offline' OR w.id IS NULL;
```

#### 3. 获取待发送的通知
```sql
SELECT * FROM notifications
WHERE is_sent = 0
ORDER BY created_at ASC
LIMIT 100;
```

#### 4. 获取账户的历史消息(分页)
```sql
SELECT * FROM (
  SELECT id, 'comment' AS type, content, author_name AS from_name, detected_at, created_at
  FROM comments WHERE account_id = ?
  UNION ALL
  SELECT id, 'message' AS type, content, sender_name AS from_name, detected_at, created_at
  FROM direct_messages WHERE account_id = ?
)
ORDER BY detected_at DESC
LIMIT ? OFFSET ?;
```

---

## Migration Strategy

### 初始化
```javascript
// packages/master/src/database/init.js
const Database = require('better-sqlite3');
const db = new Database('./data/master.db');

// 启用WAL模式(提高并发性)
db.pragma('journal_mode = WAL');

// 执行建表SQL
db.exec(fs.readFileSync('./schema.sql', 'utf8'));
```

### 版本升级
使用简单的migration文件管理:
```
packages/master/src/database/migrations/
├── 001_initial.sql
├── 002_add_notification_rules.sql
└── 003_add_worker_metadata.sql
```

每次启动检查版本,执行未应用的migration。
