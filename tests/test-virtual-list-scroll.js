/**
 * 测试虚拟列表滚动提取功能
 *
 * 验证点：
 * 1. 能否正确滚动到指定索�? * 2. 滚动后是否能提取到不同的会话
 * 3. 最终能否提取到全部41个会�? */

const { chromium } = require('playwright');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const logger = createLogger('test-virtual-list-scroll', './logs');

async function testVirtualListScroll() {
  logger.info('🧪 开始测试虚拟列表滚动提取功�?..');

  let browser;
  try {
    // 1. 启动浏览�?    logger.info('启动测试浏览�?..');
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

    logger.info('�?假设已登录并在私信页面，开始测试滚�?..');

    // 3. 测试滚动函数
    logger.info('\n📜 测试1: 滚动到不同索引位�?);

    const testIndices = [0, 10, 20, 30, 40];

    for (const index of testIndices) {
      logger.info(`\n--- 滚动到索�?${index} ---`);

      // 滚动
      const scrollResult = await page.evaluate((targetIndex) => {
        const virtualList = document.querySelector('.ReactVirtualized__Grid') ||
                            document.querySelector('.ReactVirtualized__List');

        if (!virtualList) {
          return { success: false, reason: '未找到虚拟列�? };
        }

        const estimatedItemHeight = 80;
        const targetScrollTop = targetIndex * estimatedItemHeight;

        virtualList.scrollTop = targetScrollTop;

        return {
          success: true,
          targetScrollTop,
          actualScrollTop: virtualList.scrollTop,
          scrollHeight: virtualList.scrollHeight,
          clientHeight: virtualList.clientHeight
        };
      }, index);

      if (!scrollResult.success) {
        logger.error(`滚动失败: ${scrollResult.reason}`);
        continue;
      }

      logger.info(`scrollTop: ${scrollResult.actualScrollTop}/${scrollResult.scrollHeight}`);

      // 等待渲染
      await page.waitForTimeout(300);

      // 提取当前可见的会�?      const visible = await page.evaluate(() => {
        const listItems = document.querySelectorAll('[role="listitem"]');
        const names = [];

        listItems.forEach(item => {
          const nameEl = item.querySelector('[cursor="pointer"]');
          const userName = nameEl?.textContent?.trim();
          if (userName) {
            names.push(userName);
          }
        });

        return {
          totalVisible: listItems.length,
          names: names.slice(0, 5) // �?�?        };
      });

      logger.info(`可见会话�? ${visible.totalVisible}`);
      logger.info(`示例: ${visible.names.join(', ')}`);
    }

    // 4. 测试完整滚动提取
    logger.info('\n📜 测试2: 完整滚动提取所有会�?);

    const allConversations = new Map();
    const targetCount = 50;
    const batchSize = 10;

    for (let batchStart = 0; batchStart < targetCount; batchStart += batchSize) {
      logger.info(`\n处理批次 ${batchStart}-${batchStart + batchSize - 1}`);

      // 滚动到批次起�?      await page.evaluate((index) => {
        const virtualList = document.querySelector('.ReactVirtualized__Grid');
        if (virtualList) {
          virtualList.scrollTop = index * 80;
        }
      }, batchStart);

      await page.waitForTimeout(300);

      // 提取
      const visible = await page.evaluate(() => {
        const listItems = document.querySelectorAll('[role="listitem"]');
        const conversations = [];

        listItems.forEach(item => {
          const nameEl = item.querySelector('[cursor="pointer"]');
          const userName = nameEl?.textContent?.trim();
          if (userName) {
            conversations.push({ userName });
          }
        });

        return conversations;
      });

      // 去重
      visible.forEach(conv => {
        if (!allConversations.has(conv.userName)) {
          allConversations.set(conv.userName, conv);
        }
      });

      logger.info(`批次提取 ${visible.length} 个，累计唯一 ${allConversations.size} 个`);

      // 提前结束条件
      if (visible.length === 0) {
        logger.info('没有更多会话，提前结�?);
        break;
      }
    }

    // 5. 结果统计
    logger.info('\n📊 测试结果统计:');
    logger.info(`总共提取: ${allConversations.size} 个唯一会话`);
    logger.info(`�?0个会�? ${Array.from(allConversations.keys()).slice(0, 10).join(', ')}`);

    // 6. 验证
    const checks = {
      hasConversations: allConversations.size > 0,
      hasEnoughConversations: allConversations.size >= 17,
      reachedTarget: allConversations.size >= 40
    };

    logger.info('\n�?验证结果:');
    logger.info(`  - 是否提取到会�? ${checks.hasConversations ? '�? : '�?} (${allConversations.size}�?`);
    logger.info(`  - 是否超过基准(17): ${checks.hasEnoughConversations ? '�? : '�?}`);
    logger.info(`  - 是否接近目标(40+): ${checks.reachedTarget ? '�? : '�?}`);

    if (checks.hasEnoughConversations) {
      logger.info('\n🎉 滚动提取功能正常工作�?);
      return true;
    } else {
      logger.error('\n�?滚动提取功能可能有问�?);
      return false;
    }

  } catch (error) {
    logger.error('测试失败:', error);
    return false;
  } finally {
    if (browser) {
      logger.info('\n关闭浏览�?..');
      await browser.close();
    }
  }
}

// 运行测试
testVirtualListScroll().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  logger.error('测试异常:', err);
  process.exit(1);
});
