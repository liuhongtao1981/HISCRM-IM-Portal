-- Migration 016: Add sender_name column to direct_messages table
-- 为 direct_messages 表添加 sender_name 列

-- 检查列是否存在，如果不存在则添加
ALTER TABLE direct_messages ADD COLUMN sender_name TEXT DEFAULT NULL;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_name ON direct_messages(sender_name);
