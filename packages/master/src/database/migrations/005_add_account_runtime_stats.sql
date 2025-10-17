-- 添加账号运行时统计字段
-- Migration 005: Add account runtime statistics fields

-- 爬虫统计信息
ALTER TABLE accounts ADD COLUMN total_comments INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN total_works INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN total_followers INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN total_following INTEGER DEFAULT 0;

-- 最近爬取统计
ALTER TABLE accounts ADD COLUMN recent_comments_count INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN recent_works_count INTEGER DEFAULT 0;

-- 运行时状态
ALTER TABLE accounts ADD COLUMN worker_status TEXT DEFAULT 'offline';
ALTER TABLE accounts ADD COLUMN last_crawl_time INTEGER;
ALTER TABLE accounts ADD COLUMN last_heartbeat_time INTEGER;
ALTER TABLE accounts ADD COLUMN error_count INTEGER DEFAULT 0;
ALTER TABLE accounts ADD COLUMN last_error_message TEXT;
