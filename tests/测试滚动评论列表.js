/**
 * 测试滚动评论列表功能
 * 找到正确的滚动容�?
 */

const path = require('path');
const Database = require('better-sqlite3');

async function testCommentScroll() {
  console.log('📋 测试滚动评论列表\n');

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

    // 3. 选择�?7条评论的视频
    console.log('📍 选择视频...\n');
    await page.evaluate(() => {
      const containers = document.querySelectorAll('.container-Lkxos9');
      if (containers.length > 0) {
        containers[0].click();
      }
    });

    await page.waitForTimeout(3000);

    // 4. 分析页面中所有可滚动的容�?
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 查找可滚动容�?);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const scrollableContainers = await page.evaluate(() => {
      const results = [];
      const selectors = [
        '[class*="comment"]',
        '[class*="panel"]',
        '[class*="scroll"]',
        '[class*="list"]',
        '[role="tabpanel"]',
        'tabpanel',
      ];

      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);

        elements.forEach((el, idx) => {
          const style = window.getComputedStyle(el);
          const isScrollable = el.scrollHeight > el.clientHeight &&
                              (style.overflowY === 'auto' || style.overflowY === 'scroll');

          if (isScrollable) {
            results.push({
              selector,
              index: idx,
              tagName: el.tagName,
              className: el.className.substring(0, 80),
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              scrollTop: el.scrollTop,
              overflowY: style.overflowY,
            });
          }
        });
      });

      return results;
    });

    if (scrollableContainers.length === 0) {
      console.log('�?没有找到可滚动容�?\n');
    } else {
      console.log(`找到 ${scrollableContainers.length} 个可滚动容器:\n`);

      scrollableContainers.forEach((c, i) => {
        console.log(`${i + 1}. ${c.tagName} (${c.selector})`);
        console.log(`   类名: ${c.className}`);
        console.log(`   滚动区域: ${c.scrollHeight}px (可见: ${c.clientHeight}px)`);
        console.log(`   当前位置: ${c.scrollTop}px`);
        console.log(`   overflow-y: ${c.overflowY}`);
        console.log('');
      });
    }

    // 5. 尝试滚动第一个可滚动容器
    if (scrollableContainers.length > 0) {
      const target = scrollableContainers[0];

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🧪 测试滚动第一个容�?(${target.selector})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // 滚动到底�?
      console.log('1. 滚动到底�?..');
      const scrollResult = await page.evaluate((targetSelector, targetIndex) => {
        const containers = document.querySelectorAll(targetSelector);
        const container = containers[targetIndex];

        if (!container) return { success: false };

        const beforeScroll = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;

        // 滚动到底�?
        container.scrollTop = scrollHeight;

        return {
          success: true,
          beforeScroll,
          afterScroll: container.scrollTop,
          scrollHeight,
          clientHeight,
          scrolled: container.scrollTop > beforeScroll,
        };
      }, target.selector, target.index);

      console.log(`   滚动前位�? ${scrollResult.beforeScroll}px`);
      console.log(`   滚动后位�? ${scrollResult.afterScroll}px`);
      console.log(`   滚动距离: ${scrollResult.afterScroll - scrollResult.beforeScroll}px`);
      console.log(`   ${scrollResult.scrolled ? '�?滚动成功' : '�?滚动失败'}\n`);

      await page.waitForTimeout(2000);

      // 检查是否有"没有更多评论"
      const hasNoMoreText = await page.evaluate(() => {
        const allText = Array.from(document.querySelectorAll('*'))
          .map(el => el.textContent)
          .join(' ');
        return allText.includes('没有更多评论');
      });

      console.log(`2. 检�?没有更多评论"文本: ${hasNoMoreText ? '�?已到�? : '�?未找�?}\n`);

      // 计算评论数量
      const commentCount = await page.evaluate(() => {
        return document.querySelectorAll('[class*="comment"]').length;
      });

      console.log(`3. 当前评论元素数量: ${commentCount}\n`);

      // 多次滚动测试
      console.log('4. 测试多次滚动加载更多评论...\n');

      let lastCommentCount = commentCount;
      let scrollAttempts = 0;
      const maxScrolls = 5;

      while (scrollAttempts < maxScrolls) {
        // 滚动到底�?
        await page.evaluate((targetSelector, targetIndex) => {
          const containers = document.querySelectorAll(targetSelector);
          const container = containers[targetIndex];
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }, target.selector, target.index);

        await page.waitForTimeout(1500);

        const currentCount = await page.evaluate(() => {
          return document.querySelectorAll('[class*="comment"]').length;
        });

        console.log(`   �?{scrollAttempts + 1}次滚�? ${lastCommentCount} �?${currentCount} 评论`);

        if (currentCount > lastCommentCount) {
          lastCommentCount = currentCount;
        } else {
          console.log(`   评论数量未增�?可能已经全部加载\n`);
          break;
        }

        scrollAttempts++;
      }

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`�?滚动测试完成`);
      console.log(`   总滚动次�? ${scrollAttempts}`);
      console.log(`   最终评论数: ${lastCommentCount}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }

  } catch (error) {
    console.error('�?测试失败:', error);
  } finally {
    console.log('⏸️  等待15�?可以手动查看页面...');
    await page.waitForTimeout(15000);

    await context.close();
    db.close();
    console.log('\n�?测试完成');
  }
}

testCommentScroll().catch(error => {
  console.error('�?测试脚本执行失败:', error);
  process.exit(1);
});
