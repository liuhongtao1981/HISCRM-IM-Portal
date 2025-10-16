-- Migration: 添加 user_info 和 fingerprint 字段到 accounts 表
-- Date: 2025-10-16
-- Description: 存储登录后的用户信息(昵称、头像、抖音号等)和浏览器指纹配置

-- 添加 user_info 字段 (JSON格式,存储用户信息)
ALTER TABLE accounts ADD COLUMN user_info TEXT;

-- 添加 fingerprint 字段 (JSON格式,存储浏览器指纹配置)
ALTER TABLE accounts ADD COLUMN fingerprint TEXT;

-- 添加索引以便快速查询
CREATE INDEX IF NOT EXISTS idx_accounts_platform_account ON accounts(platform, account_id);
