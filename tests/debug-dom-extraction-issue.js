/**
 * 调试DOM提取0会话问题
 *
 * 目的：验证extractVisibleConversations()使用的选择器是否正�? */

const { chromium } = require('playwright');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('debug-dom-extraction', './logs');

async function debugDOMExtraction() {
  logger.info('🔍 开始调试DOM提取问题...');

  let browser;
  try {
    // 1. 启动浏览�?    logger.info('启动浏览�?..');
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    const page = await context.newPage();

    // 2. 导航到抖音私信页�?    logger.info('导航到抖音创作者中�?..');
    await page.goto('https://creator.douyin.com/');

    logger.info('⚠️ 请在浏览器中手动扫码登录...');
    logger.info('登录成功后，请手动导航到"私信管理"页面');
    logger.info('等待60�?..');
    await page.waitForTimeout(60000);

    logger.info('�?假设已登录并在私信页面，开始诊�?..');

    // 3. 测试原始选择�?    logger.info('\n📋 测试1: 原始选择�?);
    const originalTest = await page.evaluate(() => {
      const listItems = document.querySelectorAll('[role="listitem"]');
      const cursorPointers = document.querySelectorAll('[cursor="pointer"]');

      return {
        listItemsCount: listItems.length,
        cursorPointersCount: cursorPointers.length,
        listItemsExist: listItems.length > 0
      };
    });

    logger.info(`[role="listitem"] 找到: ${originalTest.listItemsCount} 个`);
    logger.info(`[cursor="pointer"] 找到: ${originalTest.cursorPointersCount} 个`);

    // 4. 查找可能的替代选择�?    logger.info('\n📋 测试2: 查找替代选择�?);
    const alternatives = await page.evaluate(() => {
      const results = {};

      // 测试各种可能的选择�?      const selectors = [
        '[role="listitem"]',
        '.ReactVirtualized__Grid__innerScrollContainer > div',
        '[class*="conversation"]',
        '[class*="user"]',
        '[class*="message"]',
        '[data-e2e*="conversation"]',
        '[data-e2e*="user"]',
        'div[class*="list"] > div',
        'div[id*="list"] > div'
      ];

      selectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          results[selector] = {
            count: elements.length,
            sample: elements.length > 0 ? elements[0].className : null
          };
        } catch (err) {
          results[selector] = { error: err.message };
        }
      });

      return results;
    });

    logger.info('选择器测试结�?');
    Object.entries(alternatives).forEach(([selector, result]) => {
      if (result.error) {
        logger.error(`  ${selector}: �?${result.error}`);
      } else {
        logger.info(`  ${selector}: ${result.count} �?(示例class: ${result.sample})`);
      }
    });

    // 5. 检查虚拟列表容�?    logger.info('\n📋 测试3: 虚拟列表容器');
    const virtualListInfo = await page.evaluate(() => {
      const grid = document.querySelector('.ReactVirtualized__Grid');
      const list = document.querySelector('.ReactVirtualized__List');
      const innerContainer = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');

      return {
        hasGrid: !!grid,
        hasList: !!list,
        hasInnerContainer: !!innerContainer,
        gridScrollTop: grid?.scrollTop,
        gridScrollHeight: grid?.scrollHeight,
        gridClientHeight: grid?.clientHeight,
        innerContainerChildren: innerContainer?.children.length
      };
    });

    logger.info('虚拟列表容器信息:');
    Object.entries(virtualListInfo).forEach(([key, value]) => {
      logger.info(`  ${key}: ${value}`);
    });

    // 6. 提取实际的会话元素结�?    logger.info('\n📋 测试4: 分析会话元素结构');
    const structure = await page.evaluate(() => {
      const grid = document.querySelector('.ReactVirtualized__Grid');
      if (!grid) return { error: '未找到虚拟列�? };

      const innerContainer = grid.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
      if (!innerContainer) return { error: '未找到innerScrollContainer' };

      const children = Array.from(innerContainer.children);
      const first3 = children.slice(0, 3).map((child, index) => {
        return {
          index,
          tagName: child.tagName,
          className: child.className,
          id: child.id,
          role: child.getAttribute('role'),
          childCount: child.children.length,
          textContent: child.textContent?.substring(0, 100)
        };
      });

      return {
        totalChildren: children.length,
        first3Elements: first3
      };
    });

    logger.info('会话元素结构:');
    logger.info(JSON.stringify(structure, null, 2));

    // 7. 尝试使用新选择器提取会�?    logger.info('\n📋 测试5: 尝试新选择器提取会�?);
    const newExtractionTest = await page.evaluate(() => {
      const conversations = [];

      // 方法1: 通过innerScrollContainer的直接子元素
      const innerContainer = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
      if (innerContainer) {
        const items = Array.from(innerContainer.children);

        items.forEach((item, index) => {
          // 查找用户名（可能在多个位置）
          const allTexts = Array.from(item.querySelectorAll('div, span'))
            .map(el => el.textContent?.trim())
            .filter(t => t && t.length > 0 && t.length < 50);

          // 第一个较长的文本可能是用户名
          const userName = allTexts.find(t => t.length > 2 && !t.match(/^\d{2}-\d{2}$/));

          if (userName) {
            conversations.push({
              index,
              userName,
              method: 'innerScrollContainer.children'
            });
          }
        });
      }

      return {
        method1Count: conversations.length,
        method1Sample: conversations.slice(0, 5)
      };
    });

    logger.info('新选择器提取测�?');
    logger.info(`  提取数量: ${newExtractionTest.method1Count}`);
    logger.info(`  示例: ${JSON.stringify(newExtractionTest.method1Sample, null, 2)}`);

    // 8. 滚动测试
    logger.info('\n📋 测试6: 滚动后重新测�?);

    // 滚动到索�?0
    await page.evaluate(() => {
      const grid = document.querySelector('.ReactVirtualized__Grid');
      if (grid) {
        grid.scrollTop = 10 * 80;
      }
    });

    await page.waitForTimeout(500);

    const afterScrollTest = await page.evaluate(() => {
      const listItems = document.querySelectorAll('[role="listitem"]');
      const innerContainer = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
      const innerChildren = innerContainer?.children.length || 0;

      return {
        listItemsCount: listItems.length,
        innerChildrenCount: innerChildren
      };
    });

    logger.info(`滚动�?[role="listitem"]: ${afterScrollTest.listItemsCount} 个`);
    logger.info(`滚动�?innerContainer.children: ${afterScrollTest.innerChildrenCount} 个`);

    // 9. 总结
    logger.info('\n📊 诊断总结:');
    logger.info(`  - 原始选择器可用�? ${originalTest.listItemsExist ? '�? : '�?}`);
    logger.info(`  - 虚拟列表存在: ${virtualListInfo.hasGrid ? '�? : '�?}`);
    logger.info(`  - 会话元素总数: ${structure.totalChildren || 0}`);
    logger.info(`  - 新选择器提取成�? ${newExtractionTest.method1Count > 0 ? '�? : '�?}`);

    logger.info('\n�?诊断完成！请查看上述输出找出问题根源');

  } catch (error) {
    logger.error('诊断失败:', error);
  } finally {
    if (browser) {
      logger.info('\n等待60秒后关闭浏览器（供查看结果）...');
      await page.waitForTimeout(60000);
      await browser.close();
    }
  }
}

// 运行诊断
debugDOMExtraction().catch(err => {
  logger.error('诊断异常:', err);
  process.exit(1);
});
