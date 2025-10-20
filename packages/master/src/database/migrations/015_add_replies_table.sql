-- 创建 replies 表（回复功能）
CREATE TABLE IF NOT EXISTS replies (
  -- 主键和幂等性
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  idempotency_key TEXT,

  -- 身份信息（三维标识）
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,

  -- 平台特定字段
  platform_target_id TEXT,
  video_id TEXT,
  user_id TEXT,

  -- 回复内容
  reply_content TEXT NOT NULL,

  -- 状态管理
  reply_status TEXT NOT NULL DEFAULT 'pending',
  submitted_count INTEGER DEFAULT 1,

  -- Worker 追踪
  assigned_worker_id TEXT,
  worker_platform TEXT,

  -- 时间戳（防延迟关键）
  first_submitted_at INTEGER NOT NULL,
  last_submitted_at INTEGER NOT NULL,
  executed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- 错误信息
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- 结果
  platform_reply_id TEXT,
  reply_data TEXT,

  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_worker_id) REFERENCES workers(id) ON DELETE SET NULL
);

-- 创建索引优化查询
CREATE UNIQUE INDEX IF NOT EXISTS idx_replies_request_id ON replies(request_id);
CREATE INDEX IF NOT EXISTS idx_replies_idempotency_key ON replies(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_replies_account ON replies(account_id);
CREATE INDEX IF NOT EXISTS idx_replies_worker ON replies(assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_replies_platform ON replies(platform);
CREATE INDEX IF NOT EXISTS idx_replies_status ON replies(reply_status);
CREATE INDEX IF NOT EXISTS idx_replies_target ON replies(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_replies_created ON replies(created_at);
CREATE INDEX IF NOT EXISTS idx_replies_executed ON replies(executed_at);
