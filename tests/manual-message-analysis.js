/**
 * 手动操作后分析消息
 *
 * 使用步骤:
 * 1. 脚本打开浏览器并导航到私信页面
 * 2. 你手动点击一个会话，查看右侧的消息列表
 * 3. 在终端按 Enter 继续
 * 4. 脚本分析当前页面上所有的虚拟列表容器
 */

const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

// 创建读取行的接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function waitForEnter(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      resolve();
    });
  });
}

async function manualAnalysis() {
  console.log('\n' + '='.repeat(80));
  console.log('抖音私信消息手动分析');
  console.log('='.repeat(80) + '\n');

  const userDataDir = path.join(
    __dirname,
    '../packages/worker/data/browser/worker1/browser_acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  );

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    console.log('✅ 浏览器已启动\n');

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // 导航到私信页面
    console.log('导航到私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(2000);
    console.log('✅ 页面已加载\n');

    console.log('='.repeat(80));
    console.log('请在浏览器中进行以下操作:');
    console.log('  1. 点击左侧的一个会话');
    console.log('  2. 确保右侧显示了消息列表');
    console.log('  3. 如果需要，滚动消息列表加载更多消息');
    console.log('='.repeat(80));

    await waitForEnter('\n操作完成后，按 Enter 键继续分析...\n');

    console.log('\n开始分析页面上的所有虚拟列表容器...\n');

    // 查找并分析所有可能的虚拟列表容器
    const allContainers = await page.evaluate(() => {
      const results = [];

      // 查找所有可能的虚拟列表容器
      const selectors = [
        '[role="grid"]',
        '.ReactVirtualized__Grid',
        '[class*="VirtualList"]',
        '[class*="virtual-list"]',
        '[class*="message-list"]'
      ];

      selectors.forEach(selector => {
        const containers = document.querySelectorAll(selector);
        containers.forEach((container, index) => {
          const innerContainer = container.querySelector('.ReactVirtualized__Grid__innerScrollContainer') ||
                                 container.children[0];

          if (!innerContainer) return;

          const children = Array.from(innerContainer.children);

          results.push({
            selector,
            containerIndex: index,
            containerClassName: container.className,
            innerClassName: innerContainer.className,
            childCount: children.length,
            samples: children.slice(0, 5).map((child, i) => ({
              index: i,
              tagName: child.tagName,
              className: child.className.substring(0, 100),
              text: child.textContent ? child.textContent.substring(0, 100).replace(/\s+/g, ' ') : '',
              style: {
                position: child.style.position,
                top: child.style.top,
                height: child.style.height
              }
            }))
          });
        });
      });

      return results;
    });

    console.log(`找到 ${allContainers.length} 个虚拟列表容器\n`);

    if (allContainers.length === 0) {
      console.log('❌ 没有找到任何虚拟列表容器');
      console.log('\n可能的原因:');
      console.log('  1. 页面结构已改变');
      console.log('  2. 消息列表未加载');
      console.log('  3. 使用了iframe\n');
    } else {
      allContainers.forEach((container, idx) => {
        console.log('='.repeat(80));
        console.log(`容器 #${idx + 1} (${container.selector})`);
        console.log('='.repeat(80));
        console.log(`  类名: ${container.containerClassName}`);
        console.log(`  内部容器: ${container.innerClassName}`);
        console.log(`  子元素数: ${container.childCount}`);
        console.log('\n  前5个子元素:');

        container.samples.forEach(sample => {
          console.log(`\n    元素 #${sample.index}:`);
          console.log(`      标签: ${sample.tagName}`);
          console.log(`      类名: ${sample.className || '(无)'}`);
          console.log(`      位置: ${sample.style.position}, top=${sample.style.top}, height=${sample.style.height}`);
          console.log(`      文本: ${sample.text || '(无)'}`);
        });

        console.log('');
      });
    }

    // 让用户选择要深度分析的容器
    console.log('='.repeat(80));
    console.log('根据上面的信息，哪个容器看起来是消息列表？');
    console.log('提示: 消息列表通常:');
    console.log('  - 子元素数量较多 (>10)');
    console.log('  - 每个子元素有具体的消息文本');
    console.log('  - 元素使用 absolute 定位');
    console.log('='.repeat(80));

    const containerChoice = await new Promise((resolve) => {
      rl.question(`\n请输入容器编号 (1-${allContainers.length}), 或输入 0 跳过: `, (answer) => {
        resolve(parseInt(answer) - 1);
      });
    });

    if (containerChoice >= 0 && containerChoice < allContainers.length) {
      console.log(`\n正在深度分析容器 #${containerChoice + 1}...\n`);

      const deepAnalysis = await page.evaluate((containerIdx) => {
        const selectors = [
          '[role="grid"]',
          '.ReactVirtualized__Grid',
          '[class*="VirtualList"]',
          '[class*="virtual-list"]',
          '[class*="message-list"]'
        ];

        let allContainers = [];
        selectors.forEach(selector => {
          const found = Array.from(document.querySelectorAll(selector));
          allContainers.push(...found);
        });

        // 去重
        allContainers = Array.from(new Set(allContainers));

        const container = allContainers[containerIdx];
        if (!container) return { error: '容器不存在' };

        const innerContainer = container.querySelector('.ReactVirtualized__Grid__innerScrollContainer') ||
                               container.children[0];
        if (!innerContainer) return { error: '没有内部容器' };

        const children = Array.from(innerContainer.children);

        function deepSearchMessage(fiber, depth = 0, maxDepth = 15) {
          if (!fiber || depth > maxDepth) return null;

          if (fiber.memoizedProps) {
            const props = fiber.memoizedProps;
            const messageFields = {};

            const targetKeys = [
              'conversationId', 'serverId', 'msgId', 'messageId', 'id',
              'content', 'message', 'text', 'msgContent', 'msg',
              'sender', 'senderName', 'userName', 'user', 'fromUser', 'toUser',
              'timestamp', 'createTime', 'sendTime', 'time', 'date'
            ];

            targetKeys.forEach(key => {
              if (props[key] !== undefined) {
                const value = props[key];
                messageFields[key] = typeof value === 'object'
                  ? JSON.stringify(value).substring(0, 150)
                  : value;
              }
            });

            if (Object.keys(messageFields).length >= 2) {
              return {
                messageFields,
                depth,
                allKeys: Object.keys(props)
              };
            }
          }

          if (fiber.child) {
            const result = deepSearchMessage(fiber.child, depth + 1, maxDepth);
            if (result) return result;
          }

          if (depth < 5 && fiber.sibling) {
            const result = deepSearchMessage(fiber.sibling, depth + 1, maxDepth);
            if (result) return result;
          }

          return null;
        }

        const results = [];

        for (let i = 0; i < Math.min(15, children.length); i++) {
          const child = children[i];
          const fiberKey = Object.keys(child).find(key => key.startsWith('__react'));

          if (fiberKey) {
            const deepResult = deepSearchMessage(child[fiberKey]);
            if (deepResult) {
              results.push({
                elementIndex: i,
                ...deepResult
              });
            }
          }
        }

        return { results };
      }, containerChoice);

      if (deepAnalysis.error) {
        console.log(`❌ ${deepAnalysis.error}`);
      } else if (deepAnalysis.results.length === 0) {
        console.log('❌ 在前15个元素中没有找到消息数据');
      } else {
        console.log(`✅ 找到 ${deepAnalysis.results.length} 个包含消息数据的元素:\n`);

        deepAnalysis.results.forEach((result, idx) => {
          console.log(`消息 #${idx + 1} (元素 #${result.elementIndex}):`);
          console.log(`  深度: ${result.depth}`);
          console.log(`  所有Props (${result.allKeys.length}个): ${result.allKeys.join(', ')}`);
          console.log(`  消息数据:`);
          Object.entries(result.messageFields).forEach(([key, value]) => {
            console.log(`    📌 ${key}: ${value}`);
          });
          console.log('');
        });
      }
    }

    console.log('='.repeat(80));
    console.log('分析完成！浏览器将保持打开状态');
    console.log('按 Ctrl+C 退出脚本并关闭浏览器');
    console.log('='.repeat(80) + '\n');

    // 保持浏览器打开直到用户按 Ctrl+C
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ 出错:', error.message);
    console.error(error.stack);
  } finally {
    rl.close();
  }
}

manualAnalysis().catch(err => {
  console.error('脚本失败:', err);
  rl.close();
  process.exit(1);
});
