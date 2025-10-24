/**
 * 验证load-more元素的文本提取
 */

const path = require('path');
const Database = require('better-sqlite3');

async function testTextExtraction() {
  console.log('🔍 验证元素文本提取\n');

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
    // 导航到评论页面
    console.log('📍 导航到评论管理页面...');
    await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(3000);

    // 点击选择作品
    console.log('📍 点击选择作品...');
    try {
      await page.click('span:has-text("选择作品")', { timeout: 5000 });
      await page.waitForTimeout(1500);
    } catch (e) {}

    // 选择视频
    console.log('📍 选择视频...\n');
    await page.evaluate(() => {
      const containers = document.querySelectorAll('.container-Lkxos9');
      if (containers.length > 0) {
        containers[0].click();
      }
    });

    await page.waitForTimeout(3000);

    // 滚动到底部
    console.log('📜 滚动到底部...');
    await page.evaluate(() => {
      const tabpanel = document.querySelector('[role="tabpanel"]');
      if (tabpanel) {
        tabpanel.scrollTop = tabpanel.scrollHeight;
      }
    });

    await page.waitForTimeout(2000);

    // 分析load-more元素
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 分析 load-more 元素');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const analysis = await page.evaluate(() => {
      const results = [];
      const buttons = document.querySelectorAll('[class*="load-more"]');

      buttons.forEach((el, index) => {
        // 获取各种文本属性
        results.push({
          index,
          textContent: el.textContent,
          textContentTrim: (el.textContent || '').trim(),
          innerText: el.innerText,
          innerHTML: el.innerHTML,
          childNodes: Array.from(el.childNodes).map(node => ({
            nodeType: node.nodeType,
            nodeName: node.nodeName,
            nodeValue: node.nodeValue,
            textContent: node.textContent,
          })),
          children: Array.from(el.children).map(child => ({
            tagName: child.tagName,
            className: child.className,
            textContent: child.textContent,
          })),
          className: el.className,
          tagName: el.tagName,
        });
      });

      return results;
    });

    if (analysis.length === 0) {
      console.log('❌ 没有找到 load-more 元素\n');
    } else {
      console.log(`✅ 找到 ${analysis.length} 个 load-more 元素\n`);

      analysis.forEach((item, i) => {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`元素 ${i + 1}:`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        console.log(`标签: <${item.tagName}>`);
        console.log(`类名: ${item.className}\n`);

        console.log('文本属性:');
        console.log(`  textContent: "${item.textContent}"`);
        console.log(`  textContent.trim(): "${item.textContentTrim}"`);
        console.log(`  innerText: "${item.innerText}"`);
        console.log('');

        console.log('innerHTML:');
        console.log(`  ${item.innerHTML}`);
        console.log('');

        console.log(`子节点 (${item.childNodes.length} 个):`);
        item.childNodes.forEach((node, j) => {
          console.log(`  ${j + 1}. ${node.nodeName} (type: ${node.nodeType})`);
          if (node.nodeType === 3) { // TEXT_NODE
            console.log(`     文本: "${node.textContent}"`);
          } else if (node.nodeType === 1) { // ELEMENT_NODE
            console.log(`     textContent: "${node.textContent}"`);
          }
        });
        console.log('');

        console.log(`子元素 (${item.children.length} 个):`);
        item.children.forEach((child, j) => {
          console.log(`  ${j + 1}. <${child.tagName}> ${child.className}`);
          console.log(`     textContent: "${child.textContent}"`);
        });
        console.log('');

        // 正则匹配测试
        const match = item.textContentTrim.match(/^查看(\d+)条回复$/);
        console.log('正则匹配测试:');
        console.log(`  模式: /^查看(\\d+)条回复$/`);
        console.log(`  结果: ${match ? `✅ 匹配成功, 回复数=${match[1]}` : '❌ 不匹配'}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    console.log('⏸️  等待10秒后关闭浏览器...');
    await page.waitForTimeout(10000);

    await context.close();
    db.close();
    console.log('\n✅ 测试完成');
  }
}

testTextExtraction().catch(error => {
  console.error('❌ 测试脚本执行失败:', error);
  process.exit(1);
});
