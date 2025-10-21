/**
 * 测试脚本: 分析抖音私信页面的真实 DOM 结构
 *
 * 用途: 帮助调试 extractConversationsList 函数
 * 运行: node test-dm-page-structure.js
 */

const { chromium } = require('playwright');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('test-dm-page-structure', './logs');

/**
 * 分析页面结构
 */
async function analyzePageStructure() {
  let browser;
  let page;

  try {
    // 启动浏览器
    logger.info('🚀 Launching browser...');
    browser = await chromium.launch({
      headless: false,  // 显示浏览器窗口以便观察
      args: [
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

    logger.info('✅ Page loaded successfully');
    await page.waitForTimeout(2000);

    // 分析页面结构
    logger.info('🔍 Analyzing page structure...\n');

    const analysis = await page.evaluate(() => {
      const result = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        title: document.title,

        // 1. 查找所有可能的容器
        containers: {},

        // 2. 查找所有项目元素
        itemElements: {},

        // 3. 虚拟列表信息
        virtualListInfo: {},

        // 4. 样本数据
        sampleElements: []
      };

      // ========== 分析容器 ==========
      const containerSelectors = {
        'grid[role="grid"]': '[role="grid"]',
        'list[role="list"]': '[role="list"]',
        'div[class*="conversation"]': '[class*="conversation"]',
        'div[class*="virtual"]': '[class*="virtual"]',
        'ul': 'ul',
        'ol': 'ol'
      };

      for (const [name, selector] of Object.entries(containerSelectors)) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          result.containers[name] = {
            count: elements.length,
            firstElement: {
              tagName: elements[0].tagName,
              className: elements[0].className,
              role: elements[0].getAttribute('role'),
              id: elements[0].id,
              dataTestId: elements[0].getAttribute('data-testid'),
              childrenCount: elements[0].children.length,
              textContentLength: elements[0].textContent?.length || 0
            }
          };
        }
      }

      // ========== 分析项目元素 ==========
      const itemSelectors = {
        'listitem[role="listitem"]': '[role="listitem"]',
        'gridcell[role="gridcell"]': '[role="gridcell"]',
        'li': 'li',
        'div[class*="item"]': 'div[class*="item"]',
        'div[class*="conversation"]': 'div[class*="conversation"]'
      };

      for (const [name, selector] of Object.entries(itemSelectors)) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          result.itemElements[name] = {
            count: elements.length,
            parents: {},
            samples: []
          };

          // 分析父元素类型
          for (let i = 0; i < Math.min(3, elements.length); i++) {
            const parent = elements[i].parentElement;
            const parentKey = `${parent.tagName}[role="${parent.getAttribute('role')}"]`;
            result.itemElements[name].parents[parentKey] = (result.itemElements[name].parents[parentKey] || 0) + 1;

            // 收集样本元素信息
            result.itemElements[name].samples.push({
              index: i,
              tagName: elements[i].tagName,
              className: elements[i].className,
              role: elements[i].getAttribute('role'),
              textContent: elements[i].textContent?.substring(0, 100),
              hasChildren: elements[i].children.length,
              childrenTypes: Array.from(elements[i].children).map(c => c.tagName).join(',')
            });
          }
        }
      }

      // ========== 虚拟列表信息 ==========
      const grid = document.querySelector('[role="grid"]') || document.querySelector('[role="list"]');
      if (grid) {
        result.virtualListInfo = {
          scrollTop: grid.scrollTop,
          scrollHeight: grid.scrollHeight,
          clientHeight: grid.clientHeight,
          canScroll: grid.scrollHeight > grid.clientHeight,
          style: {
            overflow: window.getComputedStyle(grid).overflow,
            height: window.getComputedStyle(grid).height
          }
        };
      }

      // ========== 收集样本 DOM 树 ==========
      const firstListItem = document.querySelector('[role="listitem"]');
      if (firstListItem) {
        result.sampleElements.push({
          type: 'First ListItem HTML',
          html: firstListItem.outerHTML.substring(0, 500)
        });
      }

      return result;
    });

    // 输出分析结果
    logger.info('═══════════════════════════════════════════════════════════\n');
    logger.info('PAGE STRUCTURE ANALYSIS\n');

    logger.info('📌 Page Info:');
    logger.info(`  URL: ${analysis.url}`);
    logger.info(`  Title: ${analysis.title}`);
    logger.info(`  Timestamp: ${analysis.timestamp}\n`);

    logger.info('📦 Containers Found:');
    if (Object.keys(analysis.containers).length === 0) {
      logger.warn('  ⚠️ No containers found!');
    } else {
      for (const [name, info] of Object.entries(analysis.containers)) {
        logger.info(`  ✅ ${name}: ${info.count} element(s)`);
        logger.info(`     └─ Tag: ${info.firstElement.tagName}, Class: ${info.firstElement.className}`);
        logger.info(`     └─ Children: ${info.firstElement.childrenCount}, Text length: ${info.firstElement.textContentLength}`);
      }
    }
    logger.info('');

    logger.info('📋 Item Elements Found:');
    if (Object.keys(analysis.itemElements).length === 0) {
      logger.warn('  ⚠️ No item elements found!');
    } else {
      for (const [name, info] of Object.entries(analysis.itemElements)) {
        logger.info(`  ✅ ${name}: ${info.count} element(s)`);
        logger.info(`     └─ Parents: ${JSON.stringify(info.parents)}`);
        if (info.samples.length > 0) {
          logger.info(`     └─ Sample 1: ${info.samples[0].textContent?.substring(0, 50) || '(empty)'}`);
        }
      }
    }
    logger.info('');

    logger.info('🔄 Virtual List Info:');
    if (Object.keys(analysis.virtualListInfo).length === 0) {
      logger.warn('  ⚠️ No virtual list container found');
    } else {
      logger.info(`  Scroll Top: ${analysis.virtualListInfo.scrollTop}`);
      logger.info(`  Scroll Height: ${analysis.virtualListInfo.scrollHeight}`);
      logger.info(`  Client Height: ${analysis.virtualListInfo.clientHeight}`);
      logger.info(`  Can Scroll: ${analysis.virtualListInfo.canScroll}`);
      logger.info(`  Overflow: ${analysis.virtualListInfo.style.overflow}`);
    }
    logger.info('');

    logger.info('═══════════════════════════════════════════════════════════\n');

    // 输出详细的样本 JSON
    logger.info('📊 DETAILED ANALYSIS (JSON):\n');
    logger.info(JSON.stringify(analysis, null, 2));

    // 保存到文件
    const fs = require('fs');
    fs.writeFileSync(
      'test-dm-page-structure-result.json',
      JSON.stringify(analysis, null, 2)
    );
    logger.info('\n✅ Analysis saved to: test-dm-page-structure-result.json');

    // 继续等待，让用户可以在浏览器中检查
    logger.info('\n⏳ Browser will stay open for 60 seconds. Press Ctrl+C to close.');
    await page.waitForTimeout(60000);

  } catch (error) {
    logger.error('❌ Error during analysis:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      logger.info('Browser closed');
    }
  }
}

// 运行分析
analyzePageStructure().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
