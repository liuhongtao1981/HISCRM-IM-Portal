-- 清空所有账户的 monitoring_config 字段
-- 这样所有账户将使用平台配置文件 (config.json) 中的默认配置

-- 方案1: 清空所有账户的配置（推荐）
UPDATE accounts SET monitoring_config = NULL;

-- 方案2: 只清空抖音平台账户的配置
-- UPDATE accounts SET monitoring_config = NULL WHERE platform = 'douyin';

-- 方案3: 只清空特定账户的配置（替换 'account_id_here' 为实际账户ID）
-- UPDATE accounts SET monitoring_config = NULL WHERE id = 'account_id_here';

-- 执行后需要重启 Worker 进程以使配置生效
