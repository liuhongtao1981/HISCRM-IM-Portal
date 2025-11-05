/**
 * 调试抖音私信虚拟列表 - 检查为什么消息提取返回0
 *
 * 使用 Playwright MCP 连接到抖音私信页面，运行调试脚本
 */

const { chromium } = require('playwright');
const path = require('path');

async function debugVirtualList() {
  console.log('\n=== 抖音私信虚拟列表调试 ===\n');

  // 使用与 Worker 相同的 User Data 目录（已登录的浏览器）
  const userDataDir = path.join(
    __dirname,
    '../packages/worker/data/browser/worker1/browser_acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  );

  console.log(`使用浏览器数据目录: ${userDataDir}\n`);

  let context;
  try {
    // 启动浏览器（使用已登录的会话）
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    console.log('✅ 浏览器已启动');

    // 获取第一个页面或创建新页面
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // 导航到抖音私信页面
    console.log('\n导航到抖音私信页面...');
    await page.goto('https://www.douyin.com/falcon/webcast_openpc/pages/douyin_reflow/index', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('✅ 页面已加载');
    console.log('\n请在浏览器中：');
    console.log('1. 确保已登录');
    console.log('2. 点击左侧的"私信"标签');
    console.log('3. 点击任意一个会话，查看右侧消息列表');
    console.log('\n按 Enter 键继续调试...');

    // 等待用户确认
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });

    console.log('\n开始调试虚拟列表...\n');

    // ============================================================
    // 调试步骤 1: 查找所有可能包含消息的元素
    // ============================================================
    console.log('=== 步骤 1: 查找消息元素 ===');
    const step1Result = await page.evaluate(() => {
      const selectors = [
        '[role="grid"]',
        '[role="list"]',
        '[class*="message"]',
        '[class*="item"]',
        '[role*="article"]'
      ];

      const results = {};
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        results[selector] = elements.length;
      });

      return results;
    });

    console.log('找到的元素数量:');
    Object.entries(step1Result).forEach(([selector, count]) => {
      console.log(`  ${selector}: ${count} 个`);
    });

    // ============================================================
    // 调试步骤 2: 检查 React Fiber 结构
    // ============================================================
    console.log('\n=== 步骤 2: 检查 React Fiber 结构 ===');
    const step2Result = await page.evaluate(() => {
      const allElements = document.querySelectorAll('[class*="message"], [class*="item"], [role*="article"]');

      if (allElements.length === 0) {
        return { error: '没有找到消息元素' };
      }

      const samples = [];
      // 检查前 5 个元素
      Array.from(allElements).slice(0, 5).forEach((element, index) => {
        const sample = {
          index,
          className: element.className,
          textPreview: element.textContent ? element.textContent.substring(0, 50) : '',
          hasFiber: false,
          fiberKeys: [],
          fiberPropsKeys: []
        };

        // 查找 React Fiber 键
        const fiberKey = Object.keys(element).find(key => key.startsWith('__react'));
        if (fiberKey) {
          sample.hasFiber = true;
          sample.fiberKeys.push(fiberKey);

          const fiber = element[fiberKey];
          if (fiber && fiber.memoizedProps) {
            sample.fiberPropsKeys = Object.keys(fiber.memoizedProps);
          }
        }

        samples.push(sample);
      });

      return {
        totalElements: allElements.length,
        samples
      };
    });

    if (step2Result.error) {
      console.log(`❌ ${step2Result.error}`);
    } else {
      console.log(`总共找到 ${step2Result.totalElements} 个元素`);
      console.log('\n前 5 个元素的 React Fiber 分析:');
      step2Result.samples.forEach(sample => {
        console.log(`\n  元素 ${sample.index}:`);
        console.log(`    className: ${sample.className}`);
        console.log(`    文本预览: ${sample.textPreview}`);
        console.log(`    有 React Fiber: ${sample.hasFiber ? '✅' : '❌'}`);
        if (sample.hasFiber) {
          console.log(`    Fiber 键: ${sample.fiberKeys.join(', ')}`);
          console.log(`    Props 键: ${sample.fiberPropsKeys.join(', ')}`);
        }
      });
    }

    // ============================================================
    // 调试步骤 3: 深度遍历 React Fiber 查找消息数据
    // ============================================================
    console.log('\n=== 步骤 3: 深度遍历 React Fiber 查找消息数据 ===');
    const step3Result = await page.evaluate(() => {
      function findMessageDataInFiber(fiber, maxDepth = 10, path = '') {
        if (!fiber || maxDepth <= 0) return null;

        const results = [];

        // 检查当前节点的 memoizedProps
        if (fiber.memoizedProps) {
          const props = fiber.memoizedProps;
          const keys = Object.keys(props);

          // 检查是否包含消息相关的键
          const messageKeys = ['conversationId', 'serverId', 'content', 'message', 'text', 'msgId', 'id'];
          const foundKeys = keys.filter(key => messageKeys.some(mk => key.toLowerCase().includes(mk.toLowerCase())));

          if (foundKeys.length > 0) {
            results.push({
              path,
              foundKeys,
              sample: foundKeys.slice(0, 3).reduce((obj, key) => {
                obj[key] = typeof props[key] === 'object'
                  ? JSON.stringify(props[key]).substring(0, 100)
                  : props[key];
                return obj;
              }, {})
            });
          }
        }

        // 递归检查子节点
        if (fiber.child) {
          const childResults = findMessageDataInFiber(fiber.child, maxDepth - 1, path + ' > child');
          if (childResults) results.push(...(Array.isArray(childResults) ? childResults : [childResults]));
        }

        // 递归检查兄弟节点
        if (fiber.sibling) {
          const siblingResults = findMessageDataInFiber(fiber.sibling, maxDepth - 1, path + ' > sibling');
          if (siblingResults) results.push(...(Array.isArray(siblingResults) ? siblingResults : [siblingResults]));
        }

        return results.length > 0 ? results : null;
      }

      const testElement = document.querySelector('[class*="message"]');
      if (!testElement) {
        return { error: '没有找到消息元素' };
      }

      const fiberKey = Object.keys(testElement).find(key => key.startsWith('__react'));
      if (!fiberKey) {
        return { error: '消息元素没有 React Fiber' };
      }

      const messageData = findMessageDataInFiber(testElement[fiberKey]);
      return { messageData };
    });

    if (step3Result.error) {
      console.log(`❌ ${step3Result.error}`);
    } else if (step3Result.messageData) {
      console.log('找到的消息数据结构:');
      step3Result.messageData.forEach((data, index) => {
        console.log(`\n  结果 ${index + 1}:`);
        console.log(`    路径: ${data.path}`);
        console.log(`    找到的键: ${data.foundKeys.join(', ')}`);
        console.log(`    数据样本:`, data.sample);
      });
    } else {
      console.log('❌ 在 React Fiber 树中没有找到消息数据');
    }

    // ============================================================
    // 调试步骤 4: 测试当前的提取逻辑
    // ============================================================
    console.log('\n=== 步骤 4: 测试当前的 extractMessagesFromVirtualList 逻辑 ===');
    const step4Result = await page.evaluate(() => {
      // 复制爬虫中的提取逻辑
      function extractMessagesFromVirtualList() {
        const allElements = document.querySelectorAll(
          '[class*="message"], [class*="item"], [role*="article"]'
        );

        const messages = [];
        const processedIds = new Set();

        allElements.forEach((element) => {
          try {
            const fiberKey = Object.keys(element).find(key => key.startsWith('__react'));
            if (!fiberKey) return;

            const fiber = element[fiberKey];
            if (!fiber || !fiber.memoizedProps) return;

            const props = fiber.memoizedProps;

            // 检查是否包含消息数据
            if (props.conversationId || props.serverId || props.content || props.message) {
              const messageId = props.serverId || props.msgId || props.id;
              if (messageId && !processedIds.has(messageId)) {
                processedIds.add(messageId);
                messages.push({
                  conversationId: props.conversationId,
                  serverId: props.serverId,
                  content: props.content,
                  message: props.message,
                  allPropsKeys: Object.keys(props)
                });
              }
            }
          } catch (error) {
            // 忽略错误
          }
        });

        return {
          totalElements: allElements.length,
          extractedCount: messages.length,
          samples: messages.slice(0, 3)
        };
      }

      return extractMessagesFromVirtualList();
    });

    console.log(`找到元素: ${step4Result.totalElements}`);
    console.log(`提取消息: ${step4Result.extractedCount}`);
    if (step4Result.extractedCount > 0) {
      console.log('\n提取的消息样本:');
      step4Result.samples.forEach((msg, index) => {
        console.log(`\n  消息 ${index + 1}:`);
        console.log(`    Props 键: ${msg.allPropsKeys.join(', ')}`);
        console.log(`    数据:`, msg);
      });
    } else {
      console.log('❌ 当前提取逻辑返回 0 条消息');
    }

    console.log('\n\n=== 调试完成 ===');
    console.log('浏览器将保持打开状态，请按 Ctrl+C 退出...');

    // 保持浏览器打开
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ 调试过程出错:', error.message);
    console.error(error.stack);
  } finally {
    // 不关闭浏览器，方便手动检查
  }
}

debugVirtualList().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
