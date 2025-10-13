-- 社交媒体监控系统 - Worker数据库Schema
-- Database: worker_{id}.db
-- Version: 1.0.0

-- ============================================
-- 1. monitor_tasks - 监控任务表
-- ============================================
CREATE TABLE IF NOT EXISTS monitor_tasks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  monitor_interval INTEGER DEFAULT 30,
  last_run INTEGER,
  next_run INTEGER,
  status TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON monitor_tasks(next_run);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON monitor_tasks(status);

-- ============================================
-- 2. crawl_cache - 抓取缓存表
-- ============================================
CREATE TABLE IF NOT EXISTS crawl_cache (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  data_type TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  cache_value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(account_id, data_type, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON crawl_cache(expires_at);
