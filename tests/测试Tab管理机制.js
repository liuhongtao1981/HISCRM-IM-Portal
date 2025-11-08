/**
 * 测试 Tab 管理机制
 *
 * 测试场景�?
 * 1. 蜘蛛任务窗口（持久）
 * 2. 登录任务窗口（非持久，登录后关闭�?
 * 3. 登录检测窗口（复用或新建）
 * 4. 回复任务窗口（非持久，完成后关闭�?
 * 5. 保留最后一个窗口（防止浏览器退出）
 *
 * 使用方法�?
 * node tests/测试Tab管理机制.js
 */

const { TabManager, TabTag } = require('../packages/worker/src/browser/tab-manager');
const { chromium } = require('playwright');
const path = require('path');

const accountId = 'test-account-1';
const userDataDir = path.join(__dirname, `../packages/worker/data/browser/test-browser`);

console.log('='.repeat(80));
console.log('测试 Tab 管理机制');
console.log('='.repeat(80));
console.log('');

(async () => {
  let context;
  let browserManager;
  let tabManager;

  try {
    // 1. 启动浏览�?
    console.log('1. 启动浏览�?..');
    console.log('-'.repeat(80));

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      slowMo: 500,
    });

    // 模拟 BrowserManager
    browserManager = {
      contexts: new Map([[accountId, context]]),
    };

    // 创建 TabManager
    tabManager = new TabManager(browserManager);

    console.log('�?浏览器启动成�?);
    console.log('');

    // 2. 测试蜘蛛任务窗口（持久）
    console.log('2. 测试蜘蛛任务窗口（持久）...');
    console.log('-'.repeat(80));

    const spider1 = await tabManager.getPageForTask(accountId, {
      tag: TabTag.SPIDER_DM,
      persistent: true,
      shareable: false,
      forceNew: false,
    });

    console.log(`�?创建私信蜘蛛窗口: tabId=${spider1.tabId}, shouldClose=${spider1.shouldClose}`);

    await spider1.page.goto('https://creator.douyin.com/creator-micro/data/following/chat');
    await spider1.page.waitForTimeout(2000);

    const spider2 = await tabManager.getPageForTask(accountId, {
      tag: TabTag.SPIDER_COMMENT,
      persistent: true,
      shareable: false,
      forceNew: false,
    });

    console.log(`�?创建评论蜘蛛窗口: tabId=${spider2.tabId}, shouldClose=${spider2.shouldClose}`);

    await spider2.page.goto('https://creator.douyin.com/creator-micro/interactive/comment');
    await spider2.page.waitForTimeout(2000);

    tabManager.printTabs(accountId);
    console.log('');

    // 3. 测试回复任务窗口（非持久，完成后关闭�?
    console.log('3. 测试回复任务窗口（非持久�?..');
    console.log('-'.repeat(80));

    const reply1 = await tabManager.getPageForTask(accountId, {
      tag: TabTag.REPLY_COMMENT,
      persistent: false,
      shareable: false,
      forceNew: true,
    });

    console.log(`�?创建回复窗口: tabId=${reply1.tabId}, shouldClose=${reply1.shouldClose}`);

    await reply1.page.goto('https://www.baidu.com');
    await reply1.page.waitForTimeout(2000);

    tabManager.printTabs(accountId);
    console.log('');

    // 模拟回复完成，关闭窗�?
    console.log('⏱️  模拟回复完成，关闭窗�?..');
    const closed1 = await tabManager.closeTab(accountId, reply1.tabId);
    console.log(`${closed1 ? '�? : '�?} 关闭回复窗口: ${closed1 ? '成功' : '失败'}`);

    tabManager.printTabs(accountId);
    console.log('');

    // 4. 测试登录任务窗口（非持久�?
    console.log('4. 测试登录任务窗口（非持久�?..');
    console.log('-'.repeat(80));

    const login1 = await tabManager.getPageForTask(accountId, {
      tag: TabTag.LOGIN,
      persistent: false,
      shareable: false,
      forceNew: true,
    });

    console.log(`�?创建登录窗口: tabId=${login1.tabId}, shouldClose=${login1.shouldClose}`);

    await login1.page.goto('https://www.douyin.com/passport/web/login');
    await login1.page.waitForTimeout(2000);

    tabManager.printTabs(accountId);
    console.log('');

    // 5. 测试登录检测（复用登录窗口�?
    console.log('5. 测试登录检测（复用登录窗口�?..');
    console.log('-'.repeat(80));

    const check1 = await tabManager.getPageForTask(accountId, {
      tag: TabTag.LOGIN,
      persistent: false,
      shareable: true,  // �?可以公用登录窗口
      forceNew: false,
    });

    console.log(`�?登录检测复用登录窗�? tabId=${check1.tabId}, shouldClose=${check1.shouldClose}`);
    console.log(`   页面URL: ${check1.page.url()}`);

    tabManager.printTabs(accountId);
    console.log('');

    // 模拟登录成功，关闭登录窗�?
    console.log('⏱️  模拟登录成功，关闭登录窗�?..');
    const closed2 = await tabManager.closeTab(accountId, login1.tabId);
    console.log(`${closed2 ? '�? : '�?} 关闭登录窗口: ${closed2 ? '成功' : '失败'}`);

    tabManager.printTabs(accountId);
    console.log('');

    // 6. 测试登录检测（新建检测窗口）
    console.log('6. 测试登录检测（新建检测窗口）...');
    console.log('-'.repeat(80));

    const check2 = await tabManager.getPageForTask(accountId, {
      tag: TabTag.LOGIN_CHECK,
      persistent: false,
      shareable: false,
      forceNew: true,  // �?强制新建
    });

    console.log(`�?创建登录检测窗�? tabId=${check2.tabId}, shouldClose=${check2.shouldClose}`);

    await check2.page.goto('https://creator.douyin.com/');
    await check2.page.waitForTimeout(2000);

    tabManager.printTabs(accountId);
    console.log('');

    // 检测完成，关闭检测窗�?
    console.log('⏱️  检测完成，关闭检测窗�?..');
    const closed3 = await tabManager.closeTab(accountId, check2.tabId);
    console.log(`${closed3 ? '�? : '�?} 关闭检测窗�? ${closed3 ? '成功' : '失败'}`);

    tabManager.printTabs(accountId);
    console.log('');

    // 7. 测试保留最后一个窗�?
    console.log('7. 测试保留最后一个窗�?..');
    console.log('-'.repeat(80));

    // 尝试关闭私信蜘蛛窗口
    console.log('⏱️  尝试关闭私信蜘蛛窗口...');
    const closed4 = await tabManager.closeTab(accountId, spider1.tabId);
    console.log(`${closed4 ? '�? : '�?} 关闭私信蜘蛛窗口: ${closed4 ? '成功' : '失败'}`);

    tabManager.printTabs(accountId);
    console.log('');

    // 尝试关闭评论蜘蛛窗口（最后一个）
    console.log('⚠️  尝试关闭最后一个窗口（评论蜘蛛�?..');
    const closed5 = await tabManager.closeTab(accountId, spider2.tabId);
    console.log(`${closed5 ? '�? : '�?} 关闭评论蜘蛛窗口: ${closed5 ? '成功' : '失败'}`);

    if (!closed5) {
      console.log('�?最后一个窗口被保留，转换为占位窗口');
    }

    tabManager.printTabs(accountId);
    console.log('');

    // 8. 统计信息
    console.log('8. Tab 统计信息:');
    console.log('-'.repeat(80));

    const stats = tabManager.getTabStats(accountId);
    console.log(`�?Tab �? ${stats.total}`);
    console.log(`持久 Tab: ${stats.persistent}`);
    console.log(`临时 Tab: ${stats.temporary}`);
    console.log(`�?Tag 统计:`);
    for (const [tag, count] of Object.entries(stats.byTag)) {
      console.log(`   ${tag}: ${count}`);
    }
    console.log('');

    // 等待用户观察
    console.log('⏸️  �?Ctrl+C 关闭浏览�?..');
    await new Promise(resolve => {
      process.on('SIGINT', () => {
        console.log('\n正在关闭浏览�?..');
        resolve();
      });
    });

  } catch (error) {
    console.error('�?测试过程中出�?', error);

  } finally {
    // 清理
    if (tabManager && accountId) {
      await tabManager.clearAccountTabs(accountId);
    }

    if (context) {
      await context.close();
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('测试完成');
    console.log('='.repeat(80));
  }
})();
