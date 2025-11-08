/**
 * 辅助工具 - 分析页面中所有可能的"查看回复"按钮
 * 帮助找到正确的选择�?
 */

const path = require('path');
const Database = require('better-sqlite3');

async function findReplyButtons() {
  console.log('🔍 查找"查看回复"按钮的完整结构\n');

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

    // 3. 选择视频
    console.log('📍 选择第一个视�?..\n');
    await page.evaluate(() => {
      const containers = document.querySelectorAll('.container-Lkxos9');
      if (containers.length > 0) {
        containers[0].click();
      }
    });

    await page.waitForTimeout(3000);

    // 4. 分析所有可能包�?查看回复"文本的元�?
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 分析所有包�?回复"文本的元�?);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const allElements = await page.evaluate(() => {
      const results = [];

      // 查找所有包�?回复"文本的元�?
      document.querySelectorAll('*').forEach(el => {
        const text = (el.textContent || '').trim();

        if (text.includes('回复') || text.includes('查看')) {
          // 检查是否精确匹�?"查看X条回�?
          const exactMatch = text.match(/^查看\d+条回�?/);

          if (exactMatch) {
            results.push({
              type: 'exact_match',
              text: text,
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              innerHTML: el.innerHTML.substring(0, 200),
              outerHTML: el.outerHTML.substring(0, 300),
              parent: {
                tagName: el.parentElement?.tagName,
                className: el.parentElement?.className.substring(0, 100),
              },
              style: {
                display: window.getComputedStyle(el).display,
                cursor: window.getComputedStyle(el).cursor,
                visibility: window.getComputedStyle(el).visibility,
                opacity: window.getComputedStyle(el).opacity,
              },
              isVisible: el.offsetParent !== null,
              position: {
                x: el.getBoundingClientRect().x,
                y: el.getBoundingClientRect().y,
                width: el.getBoundingClientRect().width,
                height: el.getBoundingClientRect().height,
              }
            });
          }
        }
      });

      return results;
    });

    if (allElements.length === 0) {
      console.log('�?未找到匹�?查看X条回�?的元�?');
      console.log('\n可能原因:');
      console.log('  1. 当前视频的评论没有回�?);
      console.log('  2. 需要滚动才能看到回复按�?);
      console.log('  3. 按钮使用了不同的文本格式\n');

      // 查找所有包�?回复"的元�?
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 所有包�?回复"的元�?(�?0�?:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      const allReplyElements = await page.evaluate(() => {
        const results = [];

        document.querySelectorAll('*').forEach(el => {
          const text = (el.textContent || '').trim();

          if (text.includes('回复')) {
            results.push({
              text: text.substring(0, 50),
              tagName: el.tagName,
              className: el.className.substring(0, 80),
            });
          }
        });

        return results.slice(0, 10);
      });

      allReplyElements.forEach((el, i) => {
        console.log(`${i + 1}. <${el.tagName}> ${el.text}`);
        console.log(`   class: ${el.className}`);
        console.log('');
      });

    } else {
      console.log(`�?找到 ${allElements.length} 个精确匹配的元素!\n`);

      allElements.forEach((el, i) => {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`元素 ${i + 1}: ${el.text}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

        console.log(`标签: <${el.tagName}>`);
        console.log(`类名: ${el.className}`);
        console.log(`ID: ${el.id || '(�?'}`);
        console.log('');

        console.log('父元�?');
        console.log(`  标签: <${el.parent.tagName}>`);
        console.log(`  类名: ${el.parent.className}`);
        console.log('');

        console.log('样式:');
        console.log(`  display: ${el.style.display}`);
        console.log(`  cursor: ${el.style.cursor}`);
        console.log(`  visibility: ${el.style.visibility}`);
        console.log(`  opacity: ${el.style.opacity}`);
        console.log('');

        console.log(`可见�? ${el.isVisible ? '�?可见' : '�?不可�?}`);
        console.log(`位置: (${Math.round(el.position.x)}, ${Math.round(el.position.y)})`);
        console.log(`大小: ${Math.round(el.position.width)}x${Math.round(el.position.height)}`);
        console.log('');

        console.log('outerHTML:');
        console.log(el.outerHTML);
        console.log('');
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 推荐的选择�?);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // 分析最佳选择�?
      if (allElements.length > 0) {
        const first = allElements[0];

        console.log('方案1 - 类名选择�?');
        if (first.className) {
          const classes = first.className.split(' ');
          const mainClass = classes[0];
          console.log(`  document.querySelector('.${mainClass}')`);
          console.log(`  �? document.querySelectorAll('[class*="${mainClass.split('-')[0]}"]')`);
        } else {
          console.log('  (元素没有class)');
        }
        console.log('');

        console.log('方案2 - 标签+文本选择�?(Playwright):');
        console.log(`  page.getByText('${first.text}')`);
        console.log('');

        console.log('方案3 - CSS选择�?');
        console.log(`  ${first.tagName.toLowerCase()}${first.className ? '.' + first.className.split(' ').join('.') : ''}`);
        console.log('');
      }
    }

  } catch (error) {
    console.error('�?测试失败:', error);
  } finally {
    console.log('\n⏸️  等待30�?可以手动检查页�?..');
    await page.waitForTimeout(30000);

    await context.close();
    db.close();
    console.log('\n�?测试完成');
  }
}

findReplyButtons().catch(error => {
  console.error('�?测试脚本执行失败:', error);
  process.exit(1);
});
