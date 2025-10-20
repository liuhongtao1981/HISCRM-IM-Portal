/**
 * 平台管理 API 路由
 * 提供系统支持的平台列表接口
 */

const express = require('express');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { PATHS } = require('@hiscrm-im/shared/config/paths');

const logger = createLogger('platforms-api');

const path = require('path');
const fs = require('fs');

/**
 * 平台显示名称映射
 */
const PLATFORM_LABELS = {
  'douyin': '抖音',
  'xiaohongshu': '小红书',
  'weibo': '微博',
  'tiktok': 'TikTok',
  'instagram': 'Instagram'
};

/**
 * 从文件系统扫描所有可用的平台
 * 用于在数据库为空时的备选方案
 */
function scanAvailablePlatforms() {
  const platformsSet = new Map();

  try {
    // 使用共享配置中的平台路径
    const platformsDir = PATHS.worker.platforms;

    logger.debug(`Scanning platforms directory: ${platformsDir}`);

    if (!fs.existsSync(platformsDir)) {
      logger.warn(`Worker platforms directory not found at: ${platformsDir}`);
      return platformsSet;
    }

    logger.debug(`Found platforms directory, scanning: ${platformsDir}`);
    const entries = fs.readdirSync(platformsDir, { withFileTypes: true });
    logger.debug(`Found ${entries.length} entries in platforms directory`);

    for (const entry of entries) {
      logger.debug(`Checking entry: ${entry.name} (isDirectory: ${entry.isDirectory()})`);

      // 跳过 base 目录
      if (entry.name === 'base' || !entry.isDirectory()) {
        logger.debug(`  -> Skipping ${entry.name}`);
        continue;
      }

      const platformDir = path.join(platformsDir, entry.name);
      const configPath = path.join(platformDir, 'config.json');

      logger.debug(`  -> Looking for config at: ${configPath}`);

      // 检查 config.json 是否存在
      if (!fs.existsSync(configPath)) {
        logger.debug(`  -> Config not found, skipping`);
        continue;
      }

      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        logger.info(`  -> Found platform: ${config.platform} (${config.displayName})`);

        platformsSet.set(config.platform, {
          value: config.platform,
          label: PLATFORM_LABELS[config.platform] || config.displayName || config.platform,
          enabled: config.enabled !== false,
          source: 'filesystem'
        });
      } catch (error) {
        logger.warn(`Failed to parse config for platform ${entry.name}:`, error.message);
      }
    }

    logger.info(`Scanned ${platformsSet.size} platforms from filesystem`);
  } catch (error) {
    logger.debug('Failed to scan filesystem platforms:', error.message);
  }

  return platformsSet;
}

/**
 * 创建平台路由
 * @param {Database} db - SQLite 数据库实例
 * @param {Object} options - 配置选项
 * @param {Function} options.getWorkerRegistry - 获取 Worker 注册表的函数
 * @returns {Router}
 */
function createPlatformsRouter(db, options = {}) {
  const router = express.Router();
  const { getWorkerRegistry } = options;

  /**
   * GET /api/v1/platforms
   * 获取系统支持的所有平台
   *
   * 响应示例：
   * {
   *   "success": true,
   *   "data": [
   *     { "value": "douyin", "label": "抖音", "enabled": true },
   *     { "value": "xiaohongshu", "label": "小红书", "enabled": true }
   *   ],
   *   "total": 2
   * }
   */
  router.get('/', (req, res) => {
    try {
      logger.debug('Fetching supported platforms');

      // 收集平台列表
      const platformsSet = new Map(); // platform -> { label, enabled, accountCount }

      // 1. 从已配置的账户获取平台统计
      logger.debug('Step 1: Fetching platforms from database accounts');
      const accountPlatforms = db.prepare(`
        SELECT platform, COUNT(*) as count
        FROM accounts
        GROUP BY platform
      `).all();

      logger.debug(`Found ${accountPlatforms.length} platforms from database accounts`);
      accountPlatforms.forEach(row => {
        logger.debug(`  - Platform from DB: ${row.platform} (${row.count} accounts)`);
        if (!platformsSet.has(row.platform)) {
          platformsSet.set(row.platform, {
            value: row.platform,
            label: PLATFORM_LABELS[row.platform] || row.platform,
            enabled: true,
            accountCount: row.count
          });
        } else {
          const platform = platformsSet.get(row.platform);
          platform.accountCount = row.count;
        }
      });

      // 2. 从 Worker 注册信息获取能力支持的平台
      logger.debug('Step 2: Fetching platforms from Worker registry');
      if (getWorkerRegistry) {
        try {
          const workers = getWorkerRegistry().getAll();
          logger.debug(`Found ${workers.length} workers`);

          workers.forEach(worker => {
            logger.debug(`  - Worker: ${worker.id} capabilities: ${JSON.stringify(worker.capabilities)}`);
            if (worker.capabilities && Array.isArray(worker.capabilities)) {
              worker.capabilities.forEach(platform => {
                if (!platformsSet.has(platform)) {
                  logger.debug(`    -> Adding platform from Worker: ${platform}`);
                  platformsSet.set(platform, {
                    value: platform,
                    label: PLATFORM_LABELS[platform] || platform,
                    enabled: true,
                    workerSupport: true
                  });
                }
              });
            }
          });
        } catch (error) {
          logger.warn('Failed to get platforms from worker registry:', error.message);
          // 继续使用数据库中的平台信息
        }
      }

      // 3. 从文件系统扫描已定义的平台（作为备选/补充）
      logger.debug('Step 3: Scanning filesystem for platforms');
      const fsPlatforms = scanAvailablePlatforms();
      logger.debug(`Found ${fsPlatforms.size} platforms from filesystem`);
      for (const [platformName, platformInfo] of fsPlatforms) {
        logger.debug(`  - Platform from filesystem: ${platformName}`);
        if (!platformsSet.has(platformName)) {
          logger.debug(`    -> Adding platform from filesystem: ${platformName}`);
          platformsSet.set(platformName, platformInfo);
        }
      }

      // 4. 如果仍然没有找到任何平台，返回默认支持的平台
      if (platformsSet.size === 0) {
        logger.info('No platforms found, returning defaults');
        platformsSet.set('douyin', {
          value: 'douyin',
          label: '抖音',
          enabled: true,
          accountCount: 0
        });
        platformsSet.set('xiaohongshu', {
          value: 'xiaohongshu',
          label: '小红书',
          enabled: true,
          accountCount: 0
        });
      }

      // 转换为数组并排序
      const platforms = Array.from(platformsSet.values())
        .sort((a, b) => a.value.localeCompare(b.value));

      logger.info(`Found ${platforms.length} platforms`, {
        platforms: platforms.map(p => p.value)
      });

      res.json({
        success: true,
        data: platforms,
        total: platforms.length
      });
    } catch (error) {
      logger.error('Failed to get platforms:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * GET /api/v1/platforms/:platform
   * 获取特定平台的详细信息
   */
  router.get('/:platform', (req, res) => {
    try {
      const { platform } = req.params;

      logger.debug(`Fetching platform info: ${platform}`);

      // 获取该平台的账户数
      const accountStats = db.prepare(`
        SELECT COUNT(*) as count FROM accounts WHERE platform = ?
      `).get(platform);

      // 获取该平台的活跃账户数
      const activeStats = db.prepare(`
        SELECT COUNT(*) as count FROM accounts WHERE platform = ? AND status = 'active'
      `).get(platform);

      res.json({
        success: true,
        data: {
          value: platform,
          label: PLATFORM_LABELS[platform] || platform,
          totalAccounts: accountStats?.count || 0,
          activeAccounts: activeStats?.count || 0,
          enabled: true
        }
      });
    } catch (error) {
      logger.error(`Failed to get platform info for ${req.params.platform}:`, error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * GET /api/v1/platforms/stats/summary
   * 获取所有平台的统计汇总
   */
  router.get('/stats/summary', (req, res) => {
    try {
      logger.debug('Fetching platforms statistics summary');

      const stats = db.prepare(`
        SELECT
          platform,
          COUNT(*) as total_accounts,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_accounts,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_accounts
        FROM accounts
        GROUP BY platform
      `).all();

      const summary = stats.map(row => ({
        platform: row.platform,
        label: PLATFORM_LABELS[row.platform] || row.platform,
        totalAccounts: row.total_accounts,
        activeAccounts: row.active_accounts || 0,
        errorAccounts: row.error_accounts || 0
      }));

      res.json({
        success: true,
        data: summary,
        total: summary.length
      });
    } catch (error) {
      logger.error('Failed to get platforms statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  return router;
}

module.exports = createPlatformsRouter;
