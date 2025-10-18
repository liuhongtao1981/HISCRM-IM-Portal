-- Migration: 014_add_is_new_and_push_count_fields.sql
-- 目的：为所有数据表添加 is_new 和 push_count 字段
-- is_new: 标记数据是否为新数据（基于 created_at 时间判断）
-- push_count: Worker 推送次数计数器（仅 Worker 使用）

-- ============================================
-- 1. COMMENTS 表
-- ============================================

-- 检查并添加 push_count 字段（is_new 已存在于 012 迁移中）
ALTER TABLE comments ADD COLUMN push_count INTEGER DEFAULT 0;

-- ============================================
-- 2. DIRECT_MESSAGES 表
-- ============================================

-- 添加 is_new 字段（默认为 true 表示新数据）
ALTER TABLE direct_messages ADD COLUMN is_new BOOLEAN DEFAULT 1;

-- 添加 push_count 字段
ALTER TABLE direct_messages ADD COLUMN push_count INTEGER DEFAULT 0;

-- ============================================
-- 3. DOUYIN_VIDEOS 表
-- ============================================

-- 添加 is_new 字段（默认为 true 表示新数据）
ALTER TABLE douyin_videos ADD COLUMN is_new BOOLEAN DEFAULT 1;

-- 添加 push_count 字段
ALTER TABLE douyin_videos ADD COLUMN push_count INTEGER DEFAULT 0;

-- ============================================
-- 字段说明
-- ============================================

-- is_new 字段规则：
--   true  = 新数据（平台上最近 24 小时内创建的内容）
--   false = 旧数据（超过 24 小时前创建的内容）
--   计算规则：is_new = (now() - created_at) < 86400 秒

-- push_count 字段规则：
--   0 = 未推送
--   1-2 = 已推送 1-2 次
--   3 = 已推送 3 次（达到最大），之后 Worker 将停止推送并设置 is_new=false
--   仅用于 Worker 的推送计数，Master 不修改此字段
