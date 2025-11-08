/**
 * 快速测试私信点击功�?
 * 验证是否能成功点击会话并进入详情�?
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function quickTestDirectMessageClick() {
  console.log('🚀 快速测试私信点击功能\n');

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
    console.log('📍 步骤1: 导航到私信页�?);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);
    console.log(`�?当前URL: ${page.url()}\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 步骤2: 查找会话列表');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 确保�?全部"标签�?
    await page.evaluate(() => {
      const allTab = Array.from(document.querySelectorAll('*'))
        .find(el => el.textContent?.trim() === '全部');
      if (allTab) allTab.click();
    });
    await page.waitForTimeout(1000);

    // 查找会话列表
    const conversations = await page.locator('[role="list-item"]').all();
    console.log(`�?找到 ${conversations.length} 个会话\n`);

    if (conversations.length === 0) {
      console.log('�?未找到会�?');
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 步骤3: 点击第一个会�?);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 获取点击前的信息
    const beforeClick = await page.evaluate(() => {
      return {
        url: window.location.href,
        hasMessageInput: document.querySelector('textarea') !== null,
        hasListItems: document.querySelectorAll('[role="list-item"]').length,
      };
    });

    console.log('点击前状�?');
    console.log('  URL:', beforeClick.url);
    console.log('  有textarea:', beforeClick.hasMessageInput ? '�? : '�?);
    console.log('  会话数量:', beforeClick.hasListItems);
    console.log('');

    // 点击第一个会�?
    await conversations[0].click();
    console.log('�?已点击第一个会�?);

    // 等待页面变化
    await page.waitForTimeout(3000);

    // 获取点击后的信息
    const afterClick = await page.evaluate(() => {
      return {
        url: window.location.href,
        hasMessageInput: document.querySelector('textarea') !== null,
        hasContentEditable: document.querySelector('[contenteditable="true"]') !== null,
        hasMessageClass: document.querySelector('[class*="message"]') !== null,
        hasChatClass: document.querySelector('[class*="chat"]') !== null,
        hasListItems: document.querySelectorAll('[role="list-item"]').length,

        // 查找可能的消息容�?
        messageContainers: Array.from(document.querySelectorAll('[class*="message-list"], [class*="chat-content"], [class*="message-container"]'))
          .map(el => ({
            className: el.className,
            childCount: el.children.length,
          })),
      };
    });

    console.log('点击后状�?');
    console.log('  URL:', afterClick.url);
    console.log('  URL变化:', beforeClick.url !== afterClick.url ? '�?�? : '�?�?);
    console.log('  有textarea:', afterClick.hasMessageInput ? '�? : '�?);
    console.log('  有contenteditable:', afterClick.hasContentEditable ? '�? : '�?);
    console.log('  有message class:', afterClick.hasMessageClass ? '�? : '�?);
    console.log('  有chat class:', afterClick.hasChatClass ? '�? : '�?);
    console.log('  会话列表数量:', afterClick.hasListItems);
    console.log('  消息容器数量:', afterClick.messageContainers.length);
    console.log('');

    if (afterClick.messageContainers.length > 0) {
      console.log('消息容器详情:');
      afterClick.messageContainers.forEach((container, i) => {
        console.log(`  容器${i + 1}:`);
        console.log(`    className: ${container.className.substring(0, 50)}...`);
        console.log(`    子元素数: ${container.childCount}`);
      });
      console.log('');
    }

    // 判断是否成功打开
    const isDetailPageOpen =
      afterClick.hasMessageInput ||
      afterClick.hasContentEditable ||
      (beforeClick.url !== afterClick.url) ||
      (afterClick.messageContainers.length > 0 && afterClick.hasListItems === 0);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 结果判断');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (isDetailPageOpen) {
      console.log('�?会话详情页已打开!');
      console.log('');
      console.log('验证依据:');
      if (afterClick.hasMessageInput) console.log('  �?找到消息输入�?textarea)');
      if (afterClick.hasContentEditable) console.log('  �?找到可编辑元�?);
      if (beforeClick.url !== afterClick.url) console.log('  �?URL发生变化');
      if (afterClick.messageContainers.length > 0) console.log(`  �?找到${afterClick.messageContainers.length}个消息容器`);
      if (afterClick.hasListItems === 0) console.log('  �?会话列表已隐�?);

      console.log('\n📍 步骤4: 检查消息历�?);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // 查找消息元素
      const messages = await page.evaluate(() => {
        const selectors = [
          '[class*="message"]',
          '[class*="bubble"]',
          '[class*="chat-item"]',
        ];

        const results = {};
        selectors.forEach(sel => {
          const elements = document.querySelectorAll(sel);
          results[sel] = elements.length;
        });

        return results;
      });

      console.log('消息元素统计:');
      Object.entries(messages).forEach(([selector, count]) => {
        console.log(`  ${selector}: ${count}个`);
      });

    } else {
      console.log('�?会话详情页未打开');
      console.log('');
      console.log('可能原因:');
      console.log('  1. 点击没有触发(元素被遮�?)');
      console.log('  2. 页面结构与预期不�?);
      console.log('  3. 需要特殊的点击方式');
      console.log('');
      console.log('当前验证逻辑过于宽泛:');
      console.log(`  hasMessageClass: ${afterClick.hasMessageClass} (整个页面都有)` );
      console.log(`  hasChatClass: ${afterClick.hasChatClass} (整个页面都有)`);
    }

  } catch (error) {
    console.error('\n�?测试失败:', error);
    console.error(error.stack);
  } finally {
    console.log('\n⏸️  等待20秒后关闭浏览�?(请查看页面状�?...');
    await page.waitForTimeout(20000);

    await context.close();
    db.close();
    console.log('\n�?测试完成');
  }
}

quickTestDirectMessageClick().catch(error => {
  console.error('�?测试脚本执行失败:', error);
  process.exit(1);
});
