/**
 * 测试根目录的原始爬虫版本
 * 验证原始版本是否仍然能工作
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');
const { createLogger } = require('../packages/shared/utils/logger');

// 导入根目录的原始爬虫
const { crawlDirectMessagesV2 } = require('../crawl-direct-messages-v2.js');

const logger = createLogger('test-original-crawler', './logs');

async function testOriginalCrawler() {
  console.log('🧪 测试根目录原始爬虫版本\n');

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
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🕷️  执行根目录原始爬虫');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    logger.info('Starting original crawler test');
    console.log('📍 开始抓取私信...\n');

    const result = await crawlDirectMessagesV2(page, account);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 抓取结果统计');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`会话数量: ${result.conversations.length}`);
    console.log(`消息数量: ${result.directMessages.length}`);
    console.log(`完整消息对象: ${result.messagesWithIds ? result.messagesWithIds.length : 0}`);
    console.log(`\n统计信息:`, JSON.stringify(result.stats, null, 2));
    console.log('');

    if (result.conversations.length === 0) {
      console.log('❌ 会话数量为 0!');
    } else {
      console.log('✅ 成功提取会话列表!\n');
      console.log('前3个会话:');
      result.conversations.slice(0, 3).forEach((conv, i) => {
        console.log(`  ${i + 1}. ${conv.platform_user_name || conv.conversation_id}`);
      });
    }

    console.log('');

    if (result.directMessages.length === 0) {
      console.log('❌ 消息数量为 0!');
      console.log('\nAPI 拦截统计:');
      if (result.stats && result.stats.apiResponseCounts) {
        console.log(`  init: ${result.stats.apiResponseCounts.init} 次`);
        console.log(`  conversations: ${result.stats.apiResponseCounts.conversations} 次`);
        console.log(`  history: ${result.stats.apiResponseCounts.history} 次`);
        console.log(`  websocket: ${result.stats.apiResponseCounts.websocket} 次`);
      }
    } else {
      console.log('✅ 成功提取消息数据!\n');
      console.log('前5条消息:');
      result.directMessages.slice(0, 5).forEach((msg, i) => {
        console.log(`  ${i + 1}. ${msg.content || '(无文本)'}`);
        console.log(`     ID: ${msg.platform_message_id}`);
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 检查日志文件');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('日志文件:');
    console.log('  - logs/crawl-direct-messages-v2.log');
    console.log('  - logs/test-original-crawler.log\n');

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

testOriginalCrawler().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
