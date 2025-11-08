/**
 * 验证私信爬虫的用户信息提取功�?
 * 测试 sender_avatar �?sender_nickname 字段
 */

const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const path = require('path');

async function testUserInfoExtraction() {
  console.log('🔍 测试用户信息提取功能\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
  if (!account) {
    console.log('�?未找到抖音账�?);
    db.close();
    return;
  }

  console.log(`📱 使用账户: ${account.platform_username || account.id}\n`);

  // 加载爬虫模块
  const { crawlDirectMessagesV2 } = require('../packages/worker/src/platforms/douyin/crawl-direct-messages-v2');

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);

  console.log('🌐 启动浏览�?..');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    console.log('🕷�?开始爬取私�?..\n');

    const result = await crawlDirectMessagesV2(page, account);

    console.log('\n' + '='.repeat(60));
    console.log('📊 爬取结果');
    console.log('='.repeat(60));
    console.log(`会话数量: ${result.conversations.length}`);
    console.log(`消息数量: ${result.directMessages.length}\n`);

    if (result.directMessages.length === 0) {
      console.log('�?未提取到任何消息');
      await context.close();
      db.close();
      return;
    }

    // 统计用户信息字段
    let hasSenderId = 0;
    let hasAvatar = 0;
    let hasNickname = 0;
    let inboundWithAvatar = 0;
    let outboundWithAvatar = 0;

    result.directMessages.forEach(msg => {
      if (msg.platform_sender_id && msg.platform_sender_id !== 'unknown' && msg.platform_sender_id !== 'self' && msg.platform_sender_id !== 'other') {
        hasSenderId++;
      }
      if (msg.sender_avatar) {
        hasAvatar++;
        if (msg.direction === 'inbound') inboundWithAvatar++;
        if (msg.direction === 'outbound') outboundWithAvatar++;
      }
      if (msg.sender_nickname) {
        hasNickname++;
      }
    });

    console.log('📈 用户信息提取统计�?);
    console.log(`  有效 platform_sender_id: ${hasSenderId}/${result.directMessages.length} (${(hasSenderId / result.directMessages.length * 100).toFixed(1)}%)`);
    console.log(`  �?sender_avatar: ${hasAvatar}/${result.directMessages.length} (${(hasAvatar / result.directMessages.length * 100).toFixed(1)}%)`);
    console.log(`  �?sender_nickname: ${hasNickname}/${result.directMessages.length} (${(hasNickname / result.directMessages.length * 100).toFixed(1)}%)`);
    console.log(`  对方消息有头�? ${inboundWithAvatar}`);
    console.log(`  自己消息有头�? ${outboundWithAvatar}`);

    // 显示�?5 条消息的详细信息
    console.log('\n' + '='.repeat(60));
    console.log('📝 �?5 条消息详�?);
    console.log('='.repeat(60));

    result.directMessages.slice(0, 5).forEach((msg, i) => {
      console.log(`\n消息 ${i + 1}:`);
      console.log(`  ID: ${msg.platform_message_id}`);
      console.log(`  方向: ${msg.direction === 'inbound' ? '接收' : '发�?}`);
      console.log(`  发送者ID: ${msg.platform_sender_id || '(�?'}`);
      console.log(`  发送者昵�? ${msg.sender_nickname || '(�?'}`);
      console.log(`  发送者头�? ${msg.sender_avatar ? '�?(' + msg.sender_avatar.substring(0, 50) + '...)' : '(�?'}`);
      console.log(`  内容: ${(msg.content || '').substring(0, 50)}...`);
    });

    // 验证结果
    console.log('\n' + '='.repeat(60));
    console.log('�?验证结果');
    console.log('='.repeat(60));

    const tests = [
      {
        name: '所有消息都有发送者ID',
        pass: hasSenderId >= result.directMessages.length * 0.9, // 90%以上
        actual: `${hasSenderId}/${result.directMessages.length}`
      },
      {
        name: '对方消息有头像和昵称',
        pass: hasAvatar > 0 && hasNickname > 0,
        actual: `头像: ${hasAvatar}, 昵称: ${hasNickname}`
      },
      {
        name: '提取到的消息数量合理',
        pass: result.directMessages.length >= 5,
        actual: `${result.directMessages.length} 条消息`
      }
    ];

    tests.forEach((test, i) => {
      const status = test.pass ? '�?通过' : '�?失败';
      console.log(`${i + 1}. ${test.name}: ${status}`);
      console.log(`   实际�? ${test.actual}`);
    });

    const allPassed = tests.every(t => t.pass);

    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('🎉 所有测试通过！用户信息提取功能正常！');
    } else {
      console.log('⚠️ 部分测试失败，请检查爬虫实�?);
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n�?测试出错:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n�?等待 5 秒后关闭浏览�?..');
    await page.waitForTimeout(5000);

    console.log('🔒 关闭浏览�?..');
    await context.close();
    db.close();
  }
}

testUserInfoExtraction();
