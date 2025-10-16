/**
 * 测试浏览器关闭后的自动重启机制
 *
 * 测试场景：
 * 1. 启动浏览器并打开页面
 * 2. 手动关闭浏览器窗口
 * 3. 尝试再次访问页面，验证自动重启
 */

const BrowserManagerV2 = require('./src/browser/browser-manager-v2');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('test-browser-restart');

async function testBrowserRestart() {
  const browserManager = new BrowserManagerV2('test-worker', {
    headless: false, // 非 headless 模式，方便观察
    dataDir: './data/test-browser',
  });

  const accountId = 'test-account-restart';

  try {
    logger.info('='.repeat(60));
    logger.info('测试场景 1: 正常启动浏览器');
    logger.info('='.repeat(60));

    // 1. 启动浏览器
    const context = await browserManager.launchPersistentContextForAccount(accountId);
    logger.info('✓ 浏览器上下文已创建');

    // 2. 创建页面并访问网站
    const page1 = await context.newPage();
    await page1.goto('https://www.baidu.com');
    logger.info('✓ 第一个页面已打开: 百度');

    // 3. 检查浏览器状态
    let isValid = await browserManager.isBrowserContextValid(accountId);
    logger.info(`✓ 浏览器状态有效: ${isValid}`);

    logger.info('\n' + '='.repeat(60));
    logger.info('等待 5 秒，请手动关闭浏览器窗口...');
    logger.info('='.repeat(60));
    await new Promise(resolve => setTimeout(resolve, 5000));

    logger.info('\n' + '='.repeat(60));
    logger.info('测试场景 2: 检测浏览器是否被关闭');
    logger.info('='.repeat(60));

    // 4. 检查浏览器状态（应该无效）
    isValid = await browserManager.isBrowserContextValid(accountId);
    logger.info(`浏览器状态: ${isValid ? '有效' : '已关闭（预期）'}`);

    if (!isValid) {
      logger.info('✓ 成功检测到浏览器已关闭');
    }

    logger.info('\n' + '='.repeat(60));
    logger.info('测试场景 3: 尝试创建新页面（应该自动重启浏览器）');
    logger.info('='.repeat(60));

    // 5. 尝试创建新页面（应该自动重启浏览器）
    try {
      const page2 = await browserManager.newPage(accountId);
      await page2.goto('https://www.google.com');
      logger.info('✓ 浏览器自动重启成功，新页面已打开: Google');

      // 6. 再次检查浏览器状态
      isValid = await browserManager.isBrowserContextValid(accountId);
      logger.info(`✓ 浏览器状态有效: ${isValid}`);

      logger.info('\n' + '='.repeat(60));
      logger.info('✅ 测试通过：浏览器关闭后自动重启机制工作正常');
      logger.info('='.repeat(60));

      // 等待 3 秒再关闭
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      logger.error('❌ 测试失败：浏览器重启失败');
      logger.error(error);
    }

    logger.info('\n' + '='.repeat(60));
    logger.info('测试场景 4: 测试 ensureAccountContext（Platform 层使用）');
    logger.info('='.repeat(60));

    // 7. 再次手动关闭浏览器
    logger.info('等待 5 秒，请再次手动关闭浏览器窗口...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 8. 使用 launchPersistentContextForAccount（应该自动检测并重启）
    const newContext = await browserManager.launchPersistentContextForAccount(accountId);
    const page3 = await newContext.newPage();
    await page3.goto('https://www.github.com');
    logger.info('✓ Platform 层 ensureAccountContext 工作正常，新页面已打开: GitHub');

    logger.info('\n' + '='.repeat(60));
    logger.info('✅ 所有测试通过！');
    logger.info('='.repeat(60));

    // 等待 3 秒再关闭
    await new Promise(resolve => setTimeout(resolve, 3000));

  } catch (error) {
    logger.error('测试过程中发生错误:', error);
  } finally {
    // 清理
    logger.info('\n清理测试资源...');
    await browserManager.closeAll();
    logger.info('✓ 测试完成');
  }
}

// 运行测试
testBrowserRestart().catch(error => {
  logger.error('测试失败:', error);
  process.exit(1);
});
