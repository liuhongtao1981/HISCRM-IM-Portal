/**
 * 诊断私信会话列表问题
 * 详细检查会话列表元素是否能找到
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function diagnoseConversationList() {
  console.log('🔍 诊断私信会话列表\n');

  // 1. 连接数据�?
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('�?未找到抖音账�?);
    db.close();
    process.exit(1);
  }

  console.log(`�?账户: ${account.platform_username || account.id}\n`);

  // 2. 启动浏览�?
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // 3. 导航到私信页�?
    console.log('📍 导航到私信页�?..');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('�?等待页面加载完成...');
    await page.waitForTimeout(5000);

    console.log(`�?当前 URL: ${page.url()}\n`);

    // 4. 尝试多种选择器查找会话列�?
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔬 测试多种会话列表选择�?);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const selectors = [
      '[role="list-item"]',
      '.semi-list-item',
      '[class*="list-item"]',
      '[class*="conversation"]',
      '[class*="dialog"]',
      'li[role="list-item"]',
      '.semi-list .semi-list-item',
      '[class*="chat-list"]',
    ];

    const results = await page.evaluate((selectorList) => {
      const findings = [];

      for (const selector of selectorList) {
        const elements = document.querySelectorAll(selector);
        findings.push({
          selector: selector,
          count: elements.length,
          sample: elements.length > 0 ? {
            tagName: elements[0].tagName,
            className: elements[0].className,
            innerHTML: elements[0].innerHTML.substring(0, 200),
          } : null
        });
      }

      return findings;
    }, selectors);

    console.log('选择器测试结�?\n');
    results.forEach((result, i) => {
      console.log(`${i + 1}. ${result.selector}`);
      console.log(`   找到: ${result.count} 个元素`);
      if (result.sample) {
        console.log(`   标签: <${result.sample.tagName}>`);
        console.log(`   类名: ${result.sample.className}`);
        console.log(`   内容: ${result.sample.innerHTML.substring(0, 100)}...\n`);
      } else {
        console.log('   �?未找到任何元素\n');
      }
    });

    // 5. 检查页面整体结�?
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 页面整体结构分析');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const pageStructure = await page.evaluate(() => {
      return {
        bodyText: document.body.innerText.substring(0, 500),
        hasLoginIndicator: document.body.innerText.includes('登录') ||
                          document.body.innerText.includes('扫码'),
        totalElements: document.querySelectorAll('*').length,
        hasListRole: document.querySelectorAll('[role="list"]').length,
        hasListItemRole: document.querySelectorAll('[role="list-item"]').length,
        hasSemiPrefix: document.querySelectorAll('[class*="semi"]').length,
        mainContainerClasses: document.querySelector('body > div')?.className || 'N/A',
      };
    });

    console.log('页面信息:');
    console.log(`  总元素数: ${pageStructure.totalElements}`);
    console.log(`  有登录提�? ${pageStructure.hasLoginIndicator ? '⚠️  �? : '�?�?}`);
    console.log(`  [role="list"]: ${pageStructure.hasListRole} 个`);
    console.log(`  [role="list-item"]: ${pageStructure.hasListItemRole} 个`);
    console.log(`  [class*="semi"]: ${pageStructure.hasSemiPrefix} 个`);
    console.log(`  主容器类�? ${pageStructure.mainContainerClasses}\n`);

    if (pageStructure.hasLoginIndicator) {
      console.log('⚠️  警告: 页面可能需要登录\n');
    }

    console.log('页面文本预览:');
    console.log(pageStructure.bodyText);
    console.log('\n');

    // 6. 截图保存当前页面
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📸 保存页面截图');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const screenshotPath = path.join(__dirname, 'conversation-list-diagnosis.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`�?截图已保�? ${screenshotPath}\n`);

    // 7. 尝试使用 Playwright Locator 查找
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 使用 Playwright Locator 查找');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      const locator = page.locator('[role="list-item"]');
      const count = await locator.count();
      console.log(`Playwright Locator 找到: ${count} 个会话\n`);

      if (count > 0) {
        console.log('�?Playwright Locator 可以找到会话列表');
        console.log('�?个会�?');
        const all = await locator.all();
        for (let i = 0; i < Math.min(3, all.length); i++) {
          const text = await all[i].innerText();
          console.log(`  ${i + 1}. ${text.substring(0, 100)}...`);
        }
      } else {
        console.log('�?Playwright Locator 未找到会话列�?);
      }
    } catch (e) {
      console.error('�?Playwright Locator 查找失败:', e.message);
    }

    // 8. 总结
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 诊断总结');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const bestSelector = results.find(r => r.count > 0);
    if (bestSelector) {
      console.log(`�?建议使用选择�? ${bestSelector.selector}`);
      console.log(`   找到 ${bestSelector.count} 个会话\n`);
    } else {
      console.log('�?所有选择器都未找到会话元素\n');
      console.log('可能原因:');
      console.log('  1. 页面未完全加�?);
      console.log('  2. 需要先登录');
      console.log('  3. 页面结构发生变化');
      console.log('  4. 等待时间不足\n');
      console.log('建议:');
      console.log('  - 检查截图确认页面状�?);
      console.log('  - 手动打开浏览器查看页�?);
      console.log('  - 增加等待时间\n');
    }

  } catch (error) {
    console.error('\n�?诊断失败:', error);
    console.error(error.stack);
  } finally {
    console.log('\n⏸️  等待15秒后关闭浏览�?(请查看页面状�?...');
    await page.waitForTimeout(15000);

    await context.close();
    db.close();
    console.log('\n�?诊断完成');
  }
}

diagnoseConversationList().catch(error => {
  console.error('�?脚本执行失败:', error);
  process.exit(1);
});
