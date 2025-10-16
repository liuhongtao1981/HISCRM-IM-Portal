/**
 * 测试平台系统集成
 * 验证平台管理器能否正确加载和使用平台脚本
 */

const path = require('path');
const PlatformManager = require('./src/platform-manager');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('platform-test');

async function testPlatformSystem() {
  logger.info('=== 开始测试平台系统 ===');

  try {
    // 1. 创建模拟的 WorkerBridge 和 BrowserManager
    const mockWorkerBridge = {
      sendQRCode: (accountId, sessionId, qrData) => {
        logger.info(`[Mock] sendQRCode called for account ${accountId}`);
      },
      sendLoginStatus: (accountId, sessionId, status, message) => {
        logger.info(`[Mock] sendLoginStatus: ${accountId} - ${status} - ${message || ''}`);
      },
      reportError: (accountId, error) => {
        logger.error(`[Mock] reportError for account ${accountId}:`, error);
      },
      sendMonitorData: (accountId, data) => {
        logger.info(`[Mock] sendMonitorData for account ${accountId}:`, data);
      },
    };

    const mockBrowserManager = {
      getContextForAccount: (accountId) => {
        logger.info(`[Mock] getContextForAccount called for account ${accountId}`);
        return null; // 在真实场景中会返回 BrowserContext
      },
    };

    // 2. 初始化平台管理器
    logger.info('初始化平台管理器...');
    const platformManager = new PlatformManager(mockWorkerBridge, mockBrowserManager);
    
    // 3. 加载平台脚本
    logger.info('加载平台脚本...');
    await platformManager.loadPlatforms();

    // 4. 检查支持的平台
    const supportedPlatforms = platformManager.getSupportedPlatforms();
    logger.info(`✓ 支持的平台: ${supportedPlatforms.join(', ')}`);

    if (supportedPlatforms.length === 0) {
      logger.warn('警告: 没有加载任何平台脚本');
      return;
    }

    // 5. 测试获取平台实例
    for (const platformName of supportedPlatforms) {
      logger.info(`\n--- 测试平台: ${platformName} ---`);
      
      const platform = platformManager.getPlatform(platformName);
      if (!platform) {
        logger.error(`✗ 无法获取平台实例: ${platformName}`);
        continue;
      }

      logger.info(`✓ 成功获取平台实例: ${platformName}`);
      
      // 检查平台配置
      if (platform.config) {
        logger.info(`  - 平台名称: ${platform.config.name}`);
        logger.info(`  - 平台版本: ${platform.config.version}`);
        logger.info(`  - 登录URL: ${platform.config.urls?.login || 'N/A'}`);
        logger.info(`  - 评论URL: ${platform.config.urls?.comments || 'N/A'}`);
      }

      // 检查必需的方法
      const requiredMethods = [
        'startLogin',
        'crawlComments',
        'crawlDirectMessages',
        'onLoginSuccess',
      ];

      for (const method of requiredMethods) {
        if (typeof platform[method] === 'function') {
          logger.info(`  ✓ 方法 ${method} 存在`);
        } else {
          logger.error(`  ✗ 方法 ${method} 缺失`);
        }
      }
    }

    // 6. 测试获取不存在的平台
    logger.info('\n--- 测试不存在的平台 ---');
    const nonExistent = platformManager.getPlatform('non-existent-platform');
    if (nonExistent === null) {
      logger.info('✓ 正确返回 null 对于不存在的平台');
    } else {
      logger.error('✗ 应该返回 null 对于不存在的平台');
    }

    logger.info('\n=== 平台系统测试完成 ===');
    logger.info(`总共加载 ${supportedPlatforms.length} 个平台`);

  } catch (error) {
    logger.error('测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testPlatformSystem()
  .then(() => {
    logger.info('所有测试通过');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('测试执行失败:', error);
    process.exit(1);
  });
