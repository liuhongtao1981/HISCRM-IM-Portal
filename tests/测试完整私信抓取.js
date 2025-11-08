/**
 * 测试完整的私信抓取流�?
 * 验证会话点击、消息加载、数据提取是否正�?
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function testFullDirectMessageCrawl() {
  console.log('🚀 测试完整私信抓取流程\n');

  // 1. 获取账户
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
  console.log('�?账户信息:');
  console.log('   ID:', account.id);
  console.log('   平台用户ID:', account.platform_user_id);
  console.log('');

  // 2. 启动浏览�?
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  console.log('🌐 启动浏览�?..');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🕷�? 开始执行完整私信抓�?);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 3. 导入爬虫模块
    const { crawlDirectMessagesV2 } = require('../packages/worker/src/platforms/douyin/crawl-direct-messages-v2');

    // 4. 执行爬虫 (只抓�?个会话用于测�?
    const result = await crawlDirectMessagesV2(page, account);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 抓取结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(`会话数量: ${result.conversations.length}`);
    console.log(`私信数量: ${result.directMessages.length}\n`);

    if (result.conversations.length > 0) {
      console.log('�?个会�?');
      result.conversations.slice(0, 3).forEach((conv, i) => {
        console.log(`  ${i + 1}. ${conv.platform_user_name || '未知用户'}`);
        console.log(`     会话ID: ${conv.platform_conversation_id?.substring(0, 30)}...`);
        console.log(`     最后消�? ${conv.last_message_content?.substring(0, 30)}...`);
        console.log('');
      });
    }

    if (result.directMessages.length > 0) {
      console.log('�?0条私�?');
      result.directMessages.slice(0, 10).forEach((msg, i) => {
        const createTime = new Date(msg.create_time * 1000);
        const direction = msg.direction === 'incoming' ? '👤' : '📤';
        console.log(`  ${i + 1}. ${direction} ${msg.sender_name || '未知'}: ${msg.content?.substring(0, 30)}...`);
        console.log(`     �?${createTime.toLocaleString('zh-CN')}`);
        console.log('');
      });
    } else {
      console.log('⚠️  私信数量�?\n');
      console.log('可能原因:');
      console.log('  1. 会话点击失败 (验证openConversationByIndex日志)');
      console.log('  2. 消息历史加载失败');
      console.log('  3. API拦截失败');
      console.log('  4. 数据提取失败');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 统计信息');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log(JSON.stringify(result.stats, null, 2));

  } catch (error) {
    console.error('\n�?抓取失败:', error);
    console.error(error.stack);
  } finally {
    console.log('\n⏸️  等待20秒后关闭浏览�?..');
    await page.waitForTimeout(20000);

    await context.close();
    db.close();
    console.log('\n�?测试完成');
  }
}

testFullDirectMessageCrawl().catch(error => {
  console.error('�?测试失败:', error);
  process.exit(1);
});
