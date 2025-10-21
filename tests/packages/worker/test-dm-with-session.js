/**
 * 测试脚本: 使用已登录的账户数据分析私信页面结构
 *
 * 这个脚本使用一个已登录账户的浏览器数据目录来打开私信页面
 * 运行: node test-dm-with-session.js [account_id]
 */

const { chromium } = require('playwright');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const path = require('path');
const fs = require('fs');

const logger = createLogger('test-dm-with-session', './logs');

/**
 * 获取账户列表
 */
async function getAccountsList() {
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'master', 'data', 'master.db');
    logger.debug(`Connecting to database: ${dbPath}`);
    const db = new Database(dbPath);

    const accounts = db.prepare(`
      SELECT id, account_name, platform, login_status
      FROM accounts
      LIMIT 10
    `).all();

    db.close();
    return accounts;
  } catch (error) {
    logger.error('Error getting accounts:', error.message);
    logger.error('Error details:', error);
    return [];
  }
}

/**
 * 分析已登录账户的私信页面
 */
async function analyzeWithLoginSession(accountId) {
  let browser;
  let page;

  try {
    // 获取账户的浏览器数据路径
    const browserDataPath = path.join(
      __dirname,
      'data',
      'browser',
      'worker-1',
      `browser_${accountId}`
    );

    logger.info(`📂 Looking for browser data at: ${browserDataPath}`);

    if (!fs.existsSync(browserDataPath)) {
      logger.warn(`⚠️ Browser data not found for account: ${accountId}`);
      logger.info('Available browser data directories:');

      const workerDataPath = path.join(__dirname, 'data', 'browser', 'worker-1');
      if (fs.existsSync(workerDataPath)) {
        const dirs = fs.readdirSync(workerDataPath);
        dirs.forEach(dir => logger.info(`  - ${dir}`));
      }
      return;
    }

    // 启动浏览器，使用已登录的会话
    logger.info('🚀 Launching browser with saved session...');
    browser = await chromium.launch({
      headless: false,
      args: [
        `--user-data-dir=${browserDataPath}`,
        '--disable-blink-features=AutomationControlled',
      ]
    });

    page = await browser.newPage();

    // 导航到私信页面
    logger.info('📍 Navigating to Douyin private messages page...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    logger.info('✅ Page loaded successfully\n');
    await page.waitForTimeout(3000);

    // 分析页面结构
    logger.info('🔍 Analyzing page structure with logged-in session...\n');

    const analysis = await page.evaluate(() => {
      const result = {
        timestamp: new Date().toISOString(),
        url: window.location.href,

        // 容器分析
        containers: {},

        // 项目分析
        items: {},

        // 虚拟列表信息
        virtualListInfo: {},

        // 样本 DOM
        domSamples: []
      };

      // ========== 分析容器 ==========
      const containers = [
        { name: 'grid[role="grid"]', selector: '[role="grid"]' },
        { name: 'list[role="list"]', selector: '[role="list"]' },
        { name: 'div[class*="conversation"]', selector: '[class*="conversation"]' },
        { name: 'div[class*="list"]', selector: 'div[class*="list"]' },
        { name: 'main', selector: 'main' }
      ];

      for (const { name, selector } of containers) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          result.containers[name] = {
            count: elements.length,
            firstElement: {
              tagName: elements[0].tagName,
              className: elements[0].className,
              role: elements[0].getAttribute('role'),
              id: elements[0].id,
              scrollHeight: elements[0].scrollHeight,
              clientHeight: elements[0].clientHeight,
              children: elements[0].children.length,
              textLength: elements[0].textContent?.length || 0
            }
          };
        }
      }

      // ========== 分析项目 ==========
      const itemSelectors = [
        { name: 'listitem[role="listitem"]', selector: '[role="listitem"]' },
        { name: 'li', selector: 'li' },
        { name: 'div[class*="item"]', selector: 'div[class*="item"]' },
        { name: 'div[class*="row"]', selector: 'div[class*="row"]' }
      ];

      for (const { name, selector } of itemSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const samples = [];
          for (let i = 0; i < Math.min(3, elements.length); i++) {
            samples.push({
              index: i,
              tagName: elements[i].tagName,
              className: elements[i].className?.substring(0, 100),
              textContent: elements[i].textContent?.substring(0, 150),
              children: elements[i].children.length
            });
          }

          result.items[name] = {
            count: elements.length,
            samples: samples
          };
        }
      }

      // ========== 虚拟列表信息 ==========
      const grid = document.querySelector('[role="grid"]') ||
                   document.querySelector('[role="list"]');
      if (grid) {
        result.virtualListInfo = {
          scrollable: grid.scrollHeight > grid.clientHeight,
          scrollHeight: grid.scrollHeight,
          clientHeight: grid.clientHeight,
          scrollTop: grid.scrollTop,
          hasVerticalScroll: grid.offsetHeight < grid.scrollHeight
        };
      }

      // ========== 采样完整 HTML ==========
      const firstItem = document.querySelector('[role="listitem"]');
      if (firstItem) {
        result.domSamples.push({
          type: 'First ListItem (truncated)',
          html: firstItem.outerHTML.substring(0, 1000)
        });
      }

      return result;
    });

    // 输出结果
    logger.info('═══════════════════════════════════════════════════════════\n');
    logger.info('📊 PAGE STRUCTURE ANALYSIS (WITH LOGIN)\n');

    logger.info('📦 Containers:');
    if (Object.keys(analysis.containers).length === 0) {
      logger.warn('  ⚠️ No containers found');
    } else {
      for (const [name, info] of Object.entries(analysis.containers)) {
        logger.info(`  ✅ ${name}: ${info.count} element(s)`);
        logger.info(`     └─ scroll: ${info.firstElement.scrollHeight}px, children: ${info.firstElement.children}`);
      }
    }
    logger.info('');

    logger.info('📋 Items:');
    if (Object.keys(analysis.items).length === 0) {
      logger.warn('  ⚠️ No items found');
    } else {
      for (const [name, info] of Object.entries(analysis.items)) {
        logger.info(`  ✅ ${name}: ${info.count} element(s)`);
        if (info.samples.length > 0) {
          logger.info(`     └─ Sample: "${info.samples[0].textContent?.substring(0, 60)}"`);
        }
      }
    }
    logger.info('');

    logger.info('🔄 Virtual List:');
    if (Object.keys(analysis.virtualListInfo).length > 0) {
      logger.info(`  Scrollable: ${analysis.virtualListInfo.scrollable}`);
      logger.info(`  Height: ${analysis.virtualListInfo.clientHeight}px`);
      logger.info(`  Scroll height: ${analysis.virtualListInfo.scrollHeight}px`);
    } else {
      logger.warn('  ⚠️ No virtual list found');
    }
    logger.info('');

    logger.info('═══════════════════════════════════════════════════════════\n');

    // 保存详细结果
    const resultFile = `test-dm-analysis-${accountId}.json`;
    fs.writeFileSync(resultFile, JSON.stringify(analysis, null, 2));
    logger.info(`✅ Analysis saved to: ${resultFile}\n`);

    // 提示：浏览器保持打开
    logger.info('💡 Browser remains open for manual inspection');
    logger.info('   You can inspect elements in DevTools');
    logger.info('   Press Ctrl+C to close\n');

    // 保持浏览器打开 60 秒
    await page.waitForTimeout(60000);

  } catch (error) {
    logger.error('❌ Error:', error.message);
    if (error.stack) logger.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
      logger.info('\n✅ Browser closed');
    }
  }
}

// 主函数
async function main() {
  const accountId = process.argv[2];

  if (!accountId) {
    logger.info('📝 Usage: node test-dm-with-session.js [account_id]\n');
    logger.info('📂 Available accounts:\n');

    const accounts = await getAccountsList();
    if (accounts.length === 0) {
      logger.warn('❌ No accounts found in database');
      return;
    }

    logger.info('ID | Name | Platform | Login Status');
    logger.info('---|------|----------|------------------');
    accounts.forEach(acc => {
      logger.info(`${acc.id.substring(0, 8)}... | ${acc.account_name} | ${acc.platform} | ${acc.login_status}`);
    });

    logger.info('\n💡 Example: node test-dm-with-session.js acc-fa3c0c7a-4980-406d-9f97-951509ff6090\n');
    return;
  }

  await analyzeWithLoginSession(accountId);
}

main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
