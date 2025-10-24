/**
 * 测试返回按钮选择器
 * 验证 .semi-button-content 选择器是否正确
 */

const Database = require('better-sqlite3');
const path = require('path');

async function testBackButtonSelector() {
  console.log('📋 测试返回按钮选择器\n');

  // 1. 读取账户信息
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    process.exit(1);
  }

  console.log(`✅ 找到账户: ${account.id} (${account.platform})\n`);

  // 2. 连接到浏览器
  const { chromium } = require('playwright');

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  console.log(`📂 浏览器数据目录: ${userDataDir}\n`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // 3. 导航到私信页面
  console.log('📍 导航到私信页面...');
  await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await page.waitForTimeout(3000);

  // 4. 测试选择器
  console.log('\n🔍 测试返回按钮选择器:\n');

  const tests = [
    '.semi-button-content',
    'button[aria-label="返回"]',
    'button:has-text("返回")',
    '.semi-button',
    '[class*="back"]',
    '[class*="return"]',
    'svg[class*="close"]',
    'svg[class*="back"]',
  ];

  for (const selector of tests) {
    try {
      const count = await page.locator(selector).count();
      const isVisible = count > 0 ? await page.locator(selector).first().isVisible() : false;

      console.log(`${count > 0 ? '✅' : '❌'} ${selector.padEnd(40)} - ${count} 个元素${isVisible ? ' (可见)' : ' (隐藏)'}`);

      if (count > 0 && isVisible) {
        // 获取元素文本
        const text = await page.locator(selector).first().textContent();
        const innerText = await page.locator(selector).first().innerText().catch(() => '');
        console.log(`   文本: "${text?.trim() || innerText?.trim() || '(无文本)'}"`);

        // 获取元素类名
        const className = await page.locator(selector).first().getAttribute('class');
        console.log(`   类名: ${className || '(无类名)'}`);
      }
    } catch (error) {
      console.log(`❌ ${selector.padEnd(40)} - 错误: ${error.message}`);
    }
  }

  // 5. 打开第一个会话,查看返回按钮
  console.log('\n📍 打开第一个会话,查看返回按钮...\n');

  await page.waitForTimeout(2000);

  const conversations = await page.locator('[role="list-item"]').count();
  console.log(`✅ 找到 ${conversations} 个会话\n`);

  if (conversations > 0) {
    // 点击第一个会话
    await page.locator('[role="list-item"]').first().click();
    await page.waitForTimeout(3000);

    console.log('🔍 在会话页面测试返回按钮选择器:\n');

    for (const selector of tests) {
      try {
        const count = await page.locator(selector).count();
        const isVisible = count > 0 ? await page.locator(selector).first().isVisible() : false;

        console.log(`${count > 0 ? '✅' : '❌'} ${selector.padEnd(40)} - ${count} 个元素${isVisible ? ' (可见)' : ' (隐藏)'}`);

        if (count > 0 && isVisible) {
          const text = await page.locator(selector).first().textContent();
          const innerText = await page.locator(selector).first().innerText().catch(() => '');
          console.log(`   文本: "${text?.trim() || innerText?.trim() || '(无文本)'}"`);

          const className = await page.locator(selector).first().getAttribute('class');
          console.log(`   类名: ${className || '(无类名)'}`);
        }
      } catch (error) {
        console.log(`❌ ${selector.padEnd(40)} - 错误: ${error.message}`);
      }
    }

    // 6. 尝试点击返回
    console.log('\n🔄 尝试点击返回按钮...\n');

    // 方法1: .semi-button-content
    try {
      const elem = await page.locator('.semi-button-content').first();
      if (await elem.isVisible()) {
        console.log('✅ 找到 .semi-button-content,点击...');
        await elem.click();
        await page.waitForTimeout(2000);

        // 检查是否返回到列表
        const listCount = await page.locator('[role="list-item"]').count();
        if (listCount > 0) {
          console.log(`✅ 成功返回到会话列表 (${listCount} 个会话)`);
        } else {
          console.log('❌ 点击后未返回到列表');
        }
      } else {
        console.log('❌ .semi-button-content 不可见');
      }
    } catch (error) {
      console.log(`❌ 点击失败: ${error.message}`);
    }
  }

  // 7. 等待查看
  console.log('\n⏸️  等待 10 秒,可以手动查看页面...');
  await page.waitForTimeout(10000);

  console.log('\n✅ 测试完成');

  await context.close();
  db.close();
}

testBackButtonSelector().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
