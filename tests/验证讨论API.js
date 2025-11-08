/**
 * 验证讨论API是否能被正确拦截
 */

const Database = require('better-sqlite3');
const path = require('path');

async function verifyDiscussionAPI() {
  console.log('📋 验证讨论API拦截\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);
  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('�?未找到抖音账�?);
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // API拦截�?
  const interceptedAPIs = [];

  page.on('response', async (response) => {
    const url = response.url();

    // 拦截所有包含reply的API
    if (url.includes('reply')) {
      try {
        const json = await response.json();
        interceptedAPIs.push({
          url,
          hasReplyList: !!json.reply_list,
          replyCount: json.reply_list?.length || 0,
          firstReply: json.reply_list?.[0] || null,
        });

        console.log(`\n🔍 拦截到reply API:`);
        console.log(`  URL: ${url.substring(0, 100)}...`);
        console.log(`  reply_list存在: ${!!json.reply_list}`);
        console.log(`  回复数量: ${json.reply_list?.length || 0}`);

        if (json.reply_list && json.reply_list[0]) {
          console.log(`\n📝 第一条回复数据结�?`);
          const keys = Object.keys(json.reply_list[0]);
          console.log(`  字段数量: ${keys.length}`);
          console.log(`  字段列表: ${keys.join(', ')}`);

          // 检查关键字�?
          const reply = json.reply_list[0];
          console.log(`\n  关键字段�?`);
          console.log(`    cid: ${reply.cid || '(�?'}`);
          console.log(`    text: ${(reply.text || '').substring(0, 50)}${reply.text?.length > 50 ? '...' : ''}`);
          console.log(`    user.nickname: ${reply.user?.nickname || '(�?'}`);
          console.log(`    user.uid: ${reply.user?.uid || '(�?'}`);
          console.log(`    user.avatar_thumb.url_list[0]: ${reply.user?.avatar_thumb?.url_list?.[0]?.substring(0, 60) || '(�?'}...`);
          console.log(`    digg_count: ${reply.digg_count || 0}`);
          console.log(`    reply_comment_total: ${reply.reply_comment_total || 0}`);
          console.log(`    create_time: ${reply.create_time || '(�?'}`);
        }
      } catch (error) {
        console.log(`  ⚠️  解析失败: ${error.message}`);
      }
    }
  });

  console.log('�?API拦截器已启动\n');

  // 导航到评论页�?
  console.log('📍 导航到评论管理页�?..');
  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForTimeout(2000);

  // 点击选择作品
  console.log('📍 点击选择作品...');
  try {
    await page.click('span:has-text("选择作品")', { timeout: 5000 });
    await page.waitForTimeout(1500);
  } catch (e) {}

  // 选择77条评论的视频
  console.log('📍 选择�?7条评论的视频...');
  await page.evaluate(() => {
    const containers = document.querySelectorAll('.container-Lkxos9');
    for (const container of containers) {
      const commentCountEl = container.querySelector('.right-os7ZB9 > div:last-child');
      const text = commentCountEl?.innerText?.trim() || '';
      if (text === '77') {
        container.click();
        return;
      }
    }
  });

  await page.waitForTimeout(3000);
  console.log('�?视频已选择,等待评论加载...\n');

  // 查找第一�?查看X条回�?按钮
  console.log('🔍 查找"查看X条回�?按钮...');
  const buttonText = await page.evaluate(() => {
    const allElements = Array.from(document.querySelectorAll('*'));
    const target = allElements.find(el => {
      const text = el.textContent || '';
      return /^查看\d+条回�?/.test(text) && el.offsetParent !== null;
    });
    return target?.textContent || null;
  });

  if (!buttonText) {
    console.log('�?没有找到"查看X条回�?按钮\n');
    await context.close();
    db.close();
    return;
  }

  console.log(`�?找到按钮: ${buttonText}\n`);

  // 点击按钮
  console.log(`🖱�? 点击 ${buttonText}...`);
  await page.evaluate((btnText) => {
    const allElements = Array.from(document.querySelectorAll('*'));
    const target = allElements.find(el => el.textContent === btnText && el.offsetParent !== null);
    if (target) target.click();
  }, buttonText);

  console.log('�?等待API响应...\n');
  await page.waitForTimeout(3000);

  // 统计结果
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 API拦截结果');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (interceptedAPIs.length === 0) {
    console.log('�?未拦截到任何reply API\n');
    console.log('🔍 可能的原�?');
    console.log('  1. API URL不包�?reply"关键�?);
    console.log('  2. API响应不是JSON格式');
    console.log('  3. 点击没有触发API请求\n');
  } else {
    console.log(`�?成功拦截 ${interceptedAPIs.length} 个reply API\n`);

    interceptedAPIs.forEach((api, i) => {
      console.log(`API ${i + 1}:`);
      console.log(`  URL包含reply: ✅`);
      console.log(`  有reply_list字段: ${api.hasReplyList ? '�? : '�?}`);
      console.log(`  回复数量: ${api.replyCount}`);
      console.log('');
    });
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('⏸️  等待 10 �?..');
  await page.waitForTimeout(10000);

  await context.close();
  db.close();
  console.log('\n�?测试完成');
}

verifyDiscussionAPI().catch(error => {
  console.error('�?测试失败:', error);
  process.exit(1);
});
