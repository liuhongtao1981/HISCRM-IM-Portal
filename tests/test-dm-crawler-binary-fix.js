/**
 * 测试私信爬虫二进制Protobuf修复
 *
 * 验证点：
 * 1. API拦截器能否检测到二进制Protobuf响应
 * 2. DOM提取方案是否被正确触�? * 3. 最终是否能提取到消息数据（> 0条）
 */

const path = require('path');

// 设置环境变量
process.env.WORKER_ID = 'test-worker-dm-binary';
process.env.WORKER_PORT = '4099';
process.env.MASTER_HOST = 'localhost';
process.env.MASTER_PORT = '3000';

const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('test-dm-binary-fix', './logs');

async function testDMCrawlerBinaryFix() {
  logger.info('🧪 开始测试私信爬虫二进制Protobuf修复...');

  try {
    // 1. 导入必要的模�?    const { chromium } = require('playwright');
    const crawlDirectMessagesV2 = require('../packages/worker/src/platforms/douyin/crawl-direct-messages-v2');

    // 2. 创建浏览器实例（模拟Worker环境�?    logger.info('启动测试浏览�?..');
    const browser = await chromium.launch({
      headless: false, // 显示浏览器以便观�?      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    // 3. 模拟账户信息
    const testAccount = {
      id: 'test-account-1',
      platform: 'douyin',
      platform_account_id: 'test_user_123'
    };

    logger.info('导航到抖音创作者中心登录页...');
    await page.goto('https://creator.douyin.com/');

    logger.info('⚠️ 请在浏览器中手动扫码登录...');
    logger.info('登录成功后，脚本将自动继续（等待60秒）...');

    // 等待用户登录
    await page.waitForTimeout(60000);

    logger.info('�?假设登录成功，开始测试爬�?..');

    // 4. 调用爬虫函数
    logger.info('📡 调用 crawlDirectMessagesV2...');
    const result = await crawlDirectMessagesV2(page, testAccount, null);

    // 5. 验证结果
    logger.info('📊 爬取结果:');
    logger.info(`  - 会话�? ${result.conversations.length}`);
    logger.info(`  - 消息�? ${result.directMessages.length}`);
    logger.info(`  - 数据来源: ${result.stats.dataSource || 'Unknown'}`);
    logger.info(`  - API响应计数: ${JSON.stringify(result.stats.apiResponseCounts)}`);

    // 6. 验证点检�?    const checks = {
      hasConversations: result.conversations.length > 0,
      hasMessages: result.directMessages.length > 0,
      isDOMMode: result.stats.dataSource?.includes('DOM'),
      hasBinaryDetection: result.stats.apiResponseCounts?.init > 0
    };

    logger.info('\n�?验证结果:');
    logger.info(`  - 是否提取到会�? ${checks.hasConversations ? '�? : '�?} (${result.conversations.length}�?`);
    logger.info(`  - 是否提取到消�? ${checks.hasMessages ? '�? : '�?} (${result.directMessages.length}�?`);
    logger.info(`  - 是否使用DOM模式: ${checks.isDOMMode ? '�? : '�?}`);
    logger.info(`  - 是否检测到API响应: ${checks.hasBinaryDetection ? '�? : '�?}`);

    // 7. 显示示例数据
    if (result.directMessages.length > 0) {
      logger.info('\n📝 示例消息:');
      result.directMessages.slice(0, 3).forEach((msg, i) => {
        logger.info(`  ${i + 1}. ${msg.userName || msg.sender_name}: ${msg.content?.substring(0, 50)}...`);
      });
    }

    // 8. 清理
    await browser.close();

    // 9. 总结
    const allPassed = Object.values(checks).every(v => v);
    if (allPassed) {
      logger.info('\n🎉 所有测试通过！二进制Protobuf修复方案工作正常�?);
      process.exit(0);
    } else {
      logger.error('\n�?部分测试失败，请检查日志�?);
      process.exit(1);
    }

  } catch (error) {
    logger.error('测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testDMCrawlerBinaryFix().catch(err => {
  logger.error('测试异常:', err);
  process.exit(1);
});
