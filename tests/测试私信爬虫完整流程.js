/**
 * 测试私信爬虫完整流程
 * 模拟实际运行环境,输出详细日志
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');
const { createLogger } = require('../packages/shared/utils/logger');

// 创建日志记录器
const logger = createLogger('test-dm-crawler', './logs');

async function testCompleteDMCrawl() {
  console.log('🧪 测试私信爬虫完整流程\n');

  // 1. 连接数据库
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    db.close();
    process.exit(1);
  }

  console.log(`✅ 账户: ${account.id}\n`);

  // 2. 启动浏览器
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // 3. 导入爬虫模块
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🕷️  开始执行私信爬虫');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { crawlDirectMessagesV2 } = require('../packages/worker/src/platforms/douyin/crawl-direct-messages-v2');

    // 4. 执行爬虫 (只爬一个会话测试)
    logger.info('Starting direct message crawl test');
    console.log('📍 开始抓取私信...\n');

    const result = await crawlDirectMessagesV2(page, account);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 抓取结果统计');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`会话数量: ${result.conversations.length}`);
    console.log(`消息数量: ${result.directMessages.length}`);
    console.log(`统计信息:`, JSON.stringify(result.stats, null, 2));
    console.log('');

    if (result.conversations.length === 0) {
      console.log('❌ 会话数量为 0!');
      console.log('\n可能原因:');
      console.log('  1. 会话列表选择器未匹配到元素');
      console.log('  2. 页面加载不完整');
      console.log('  3. 需要检查日志文件查看详细错误\n');
      console.log('日志位置: logs/test-dm-crawler.log\n');
    } else {
      console.log('✅ 成功提取会话列表!\n');
      console.log('前5个会话:');
      result.conversations.slice(0, 5).forEach((conv, i) => {
        console.log(`  ${i + 1}. ${conv.platform_user_name || conv.conversation_id}`);
        console.log(`     ID: ${conv.conversation_id}`);
        console.log(`     索引: ${conv.conversationIndex}\n`);
      });
    }

    if (result.directMessages.length === 0 && result.conversations.length > 0) {
      console.log('⚠️  有会话但无消息数据!');
      console.log('\n可能原因:');
      console.log('  1. 会话点击失败 - openConversationByIndex 返回 false');
      console.log('  2. 验证逻辑未通过 - 没有找到 contenteditable');
      console.log('  3. 消息提取逻辑失败 - React Fiber 提取失败\n');
    } else if (result.directMessages.length > 0) {
      console.log('✅ 成功提取消息数据!\n');
      console.log('前5条消息:');
      result.directMessages.slice(0, 5).forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg.content_text || msg.content || '(无文本)'}`);
        console.log(`     类型: ${msg.message_type}`);
        console.log(`     会话ID: ${msg.conversation_id}\n`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 检查日志文件获取详细信息');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('日志文件:');
    console.log('  - logs/crawl-direct-messages-v2.log');
    console.log('  - logs/test-dm-crawler.log\n');
    console.log('查找关键日志:');
    console.log('  - "[extractConversationsList]" - 会话列表提取');
    console.log('  - "[openConversationByIndex]" - 会话点击');
    console.log('  - "[crawlCompleteMessageHistory]" - 消息提取\n');

  } catch (error) {
    console.error('\n❌ 爬取失败:', error);
    console.error(error.stack);
    logger.error('Crawl failed:', error);
  } finally {
    console.log('\n⏸️  等待10秒后关闭浏览器...');
    await page.waitForTimeout(10000);

    await context.close();
    db.close();
    console.log('\n✅ 测试完成');
  }
}

testCompleteDMCrawl().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
