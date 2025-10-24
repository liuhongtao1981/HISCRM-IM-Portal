/**
 * 从DOM直接提取讨论数据
 * 验证点击"查看回复"后,讨论数据是否出现在DOM中
 */

const path = require('path');
const Database = require('better-sqlite3');

async function extractDiscussionsFromDOM() {
  console.log('📋 测试从DOM提取讨论数据\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);
  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // 1. 导航到评论页面
    console.log('📍 导航到评论管理页面...');
    await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // 2. 点击选择作品
    console.log('📍 点击选择作品...');
    try {
      await page.click('span:has-text("选择作品")', { timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch (e) {}

    // 3. 选择有评论的视频
    console.log('📍 选择视频...');
    await page.evaluate(() => {
      const containers = document.querySelectorAll('.container-Lkxos9');
      if (containers.length > 0) {
        containers[0].click();
      }
    });

    await page.waitForTimeout(3000);
    console.log('✅ 视频已选择\n');

    // 4. 查找并点击第一个"查看X条回复"按钮
    console.log('🖱️  查找"查看X条回复"按钮...');
    const buttonInfo = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const button = allElements.find(el => {
        const text = el.textContent || '';
        return /^查看\d+条回复$/.test(text) && el.offsetParent !== null;
      });

      if (button) {
        return {
          text: button.textContent,
          found: true
        };
      }
      return { found: false };
    });

    if (!buttonInfo.found) {
      console.log('❌ 没有找到"查看X条回复"按钮');
      console.log('   说明这个视频的评论都没有回复\n');
      await context.close();
      db.close();
      return;
    }

    console.log(`✅ 找到按钮: ${buttonInfo.text}`);

    // 5. 点击按钮
    console.log(`🖱️  点击 ${buttonInfo.text}...\n`);
    await page.evaluate((btnText) => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const target = allElements.find(el => el.textContent === btnText && el.offsetParent);
      if (target) target.click();
    }, buttonInfo.text);

    await page.waitForTimeout(2000);

    // 6. 从DOM提取展开的讨论数据
    console.log('📊 从DOM提取讨论数据...\n');

    const discussions = await page.evaluate(() => {
      const results = [];

      // 策略1: 查找所有包含"回复"关键字的元素
      const allElements = Array.from(document.querySelectorAll('*'));

      allElements.forEach(el => {
        const text = el.textContent || '';

        // 匹配 "回复XXX:" 格式
        if (text.match(/^回复.+?:/)) {
          // 尝试提取用户信息
          const parent = el.closest('[class*="comment"]') || el.parentElement;

          results.push({
            type: 'reply_prefix',
            content: text.substring(0, 100),
            className: el.className,
            tagName: el.tagName,
          });
        }
      });

      return results;
    });

    console.log(`找到 ${discussions.length} 个可能的讨论元素:\n`);

    discussions.slice(0, 10).forEach((d, i) => {
      console.log(`${i + 1}. ${d.content}`);
      console.log(`   标签: ${d.tagName}, 类名: ${d.className.substring(0, 50)}`);
      console.log('');
    });

    // 7. 尝试更精确的提取
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 精确提取讨论数据');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const preciseDiscussions = await page.evaluate(() => {
      const results = [];

      // 查找所有评论项
      const commentItems = document.querySelectorAll('[class*="comment"]');

      commentItems.forEach((item, idx) => {
        // 检查是否包含"回复XXX:"
        const text = item.textContent || '';
        const replyMatch = text.match(/回复(.+?):/);

        if (replyMatch && item.offsetParent) {
          // 尝试提取完整信息
          const userNameEl = item.querySelector('[class*="user"]') || item.querySelector('[class*="name"]');
          const timeEl = item.querySelector('[class*="time"]') || item.querySelector('[class*="date"]');

          results.push({
            index: idx,
            replyTo: replyMatch[1],
            userName: userNameEl?.textContent || '未知',
            time: timeEl?.textContent || '未知',
            content: text.substring(0, 200),
          });
        }
      });

      return results;
    });

    console.log(`提取到 ${preciseDiscussions.length} 条精确的讨论数据:\n`);

    preciseDiscussions.forEach((d, i) => {
      console.log(`${i + 1}. 用户: ${d.userName}`);
      console.log(`   回复: ${d.replyTo}`);
      console.log(`   时间: ${d.time}`);
      console.log(`   内容: ${d.content.substring(0, 100)}...`);
      console.log('');
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (preciseDiscussions.length > 0) {
      console.log('✅ 成功从DOM提取到讨论数据!');
      console.log('   这证明讨论数据在DOM中,而不是通过单独的API加载\n');
      console.log('💡 建议: 修改爬虫从DOM直接提取讨论数据\n');
    } else {
      console.log('⚠️  未能从DOM提取到讨论数据\n');
      console.log('可能原因:');
      console.log('  1. 选择器不正确');
      console.log('  2. 讨论数据结构与预期不同');
      console.log('  3. 需要手动检查页面HTML结构\n');
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    console.log('⏸️  等待10秒,可以手动查看页面...');
    await page.waitForTimeout(10000);

    await context.close();
    db.close();
    console.log('\n✅ 测试完成');
  }
}

extractDiscussionsFromDOM().catch(error => {
  console.error('❌ 测试脚本执行失败:', error);
  process.exit(1);
});
