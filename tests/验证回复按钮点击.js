/**
 * 验证回复按钮点击功能
 * 使用多种点击方法测试
 */

const path = require('path');
const Database = require('better-sqlite3');

async function testReplyButtonClick() {
  console.log('📋 验证回复按钮点击功能\n');

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

  try {
    // 1. 导航到评论页�?
    console.log('📍 导航到评论管理页�?..');
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
    console.log('�?视频已选择\n');

    // 4. 查找"查看X条回�?按钮的详细信�?
    console.log('🔍 分析"查看X条回�?按钮...\n');

    const buttonDetails = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const buttons = [];

      allElements.forEach(el => {
        const text = (el.textContent || '').trim();
        const match = text.match(/^查看(\d+)条回�?/);

        if (match && el.offsetParent !== null) {
          // 获取详细信息
          buttons.push({
            text: text,
            replyCount: parseInt(match[1]),
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            // 获取父元素信�?
            parentTag: el.parentElement?.tagName,
            parentClass: el.parentElement?.className,
            // 获取位置信息
            rect: {
              x: el.getBoundingClientRect().x,
              y: el.getBoundingClientRect().y,
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
            },
            // 检查是否可点击
            pointerEvents: window.getComputedStyle(el).pointerEvents,
            cursor: window.getComputedStyle(el).cursor,
          });
        }
      });

      return buttons;
    });

    if (buttonDetails.length === 0) {
      console.log('�?没有找到"查看X条回�?按钮');
      console.log('   该视频的评论可能都没有回复\n');
      await context.close();
      db.close();
      return;
    }

    console.log(`找到 ${buttonDetails.length} �?查看回复"按钮:\n`);

    buttonDetails.forEach((btn, i) => {
      console.log(`${i + 1}. ${btn.text}`);
      console.log(`   标签: ${btn.tagName} | 类名: ${btn.className.substring(0, 50)}`);
      console.log(`   父元�? ${btn.parentTag} | 父类�? ${btn.parentClass.substring(0, 50)}`);
      console.log(`   位置: (${Math.round(btn.rect.x)}, ${Math.round(btn.rect.y)})`);
      console.log(`   大小: ${Math.round(btn.rect.width)} x ${Math.round(btn.rect.height)}`);
      console.log(`   pointerEvents: ${btn.pointerEvents} | cursor: ${btn.cursor}`);
      console.log('');
    });

    // 5. 尝试多种点击方法
    const firstButton = buttonDetails[0];
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🧪 测试点击第一个按�? ${firstButton.text}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 方法1: page.evaluate() 点击 (当前使用的方�?
    console.log('方法1: 使用 page.evaluate() 点击...');
    const method1Result = await page.evaluate((btnText) => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const target = allElements.find(el => el.textContent === btnText && el.offsetParent);

      if (target) {
        target.click();
        return { success: true, found: true };
      }
      return { success: false, found: false };
    }, firstButton.text);

    console.log(`  结果: ${method1Result.success ? '�?点击成功' : '�?点击失败'}`);
    await page.waitForTimeout(2000);

    // 检查点击后是否有讨论出�?
    const discussions1 = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent || '';
        if (text.match(/^回复.+?:/)) {
          results.push(text.substring(0, 50));
        }
      });
      return results;
    });

    console.log(`  讨论数量: ${discussions1.length}`);
    if (discussions1.length > 0) {
      console.log(`  示例: ${discussions1[0]}`);
    }
    console.log('');

    // 方法2: 使用坐标点击
    console.log('方法2: 使用坐标点击...');
    const clickX = firstButton.rect.x + firstButton.rect.width / 2;
    const clickY = firstButton.rect.y + firstButton.rect.height / 2;

    try {
      await page.mouse.click(clickX, clickY);
      console.log(`  结果: �?坐标点击成功 (${Math.round(clickX)}, ${Math.round(clickY)})`);
    } catch (error) {
      console.log(`  结果: �?坐标点击失败 - ${error.message}`);
    }

    await page.waitForTimeout(2000);

    const discussions2 = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent || '';
        if (text.match(/^回复.+?:/)) {
          results.push(text.substring(0, 50));
        }
      });
      return results;
    });

    console.log(`  讨论数量: ${discussions2.length}`);
    if (discussions2.length > 0) {
      console.log(`  示例: ${discussions2[0]}`);
    }
    console.log('');

    // 方法3: 使用 Playwright locator
    console.log('方法3: 使用 Playwright locator...');

    try {
      // 使用文本精确匹配
      const locator = page.locator(`text="${firstButton.text}"`).first();
      await locator.click({ timeout: 5000 });
      console.log('  结果: �?Locator点击成功');
    } catch (error) {
      console.log(`  结果: �?Locator点击失败 - ${error.message}`);
    }

    await page.waitForTimeout(2000);

    const discussions3 = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent || '';
        if (text.match(/^回复.+?:/)) {
          results.push(text.substring(0, 50));
        }
      });
      return results;
    });

    console.log(`  讨论数量: ${discussions3.length}`);
    if (discussions3.length > 0) {
      console.log(`  示例: ${discussions3[0]}`);
    }
    console.log('');

    // 总结
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 测试总结');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const allMethods = [
      { name: 'page.evaluate()', count: discussions1.length },
      { name: '坐标点击', count: discussions2.length },
      { name: 'Playwright locator', count: discussions3.length },
    ];

    allMethods.forEach((m, i) => {
      console.log(`方法${i + 1} (${m.name}): ${m.count > 0 ? '�?有效' : '�?无效'} (${m.count}条讨�?`);
    });

    console.log('');

    if (Math.max(...allMethods.map(m => m.count)) > 0) {
      console.log('�?找到有效的点击方�?');
      const bestMethod = allMethods.reduce((a, b) => a.count > b.count ? a : b);
      console.log(`   推荐使用: ${bestMethod.name} (获取�?{bestMethod.count}条讨�?\n`);
    } else {
      console.log('�?所有点击方法都无效!');
      console.log('   可能原因:');
      console.log('   1. 按钮需要特殊的事件触发');
      console.log('   2. 讨论数据通过异步API加载,需要等待更长时�?);
      console.log('   3. 讨论数据不在DOM�?而是在虚拟DOM或其他地方\n');
    }

  } catch (error) {
    console.error('�?测试失败:', error);
  } finally {
    console.log('⏸️  等待20�?可以手动检查页�?..');
    await page.waitForTimeout(20000);

    await context.close();
    db.close();
    console.log('\n�?测试完成');
  }
}

testReplyButtonClick().catch(error => {
  console.error('�?测试脚本执行失败:', error);
  process.exit(1);
});
