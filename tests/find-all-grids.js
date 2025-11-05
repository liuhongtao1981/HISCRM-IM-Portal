/**
 * 查找页面上的所有虚拟列表容器并深度分析
 *
 * 运行后会等待30秒让你手动点击会话，然后自动分析所有容器
 */

const { chromium } = require('playwright');
const path = require('path');

async function findAllGrids() {
  console.log('\n' + '='.repeat(80));
  console.log('查找所有虚拟列表容器');
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

    console.log('导航到私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);
    console.log('✅ 页面已加载\n');

    console.log('='.repeat(80));
    console.log('请在 30 秒内完成以下操作:');
    console.log('  1. 点击左侧的一个会话');
    console.log('  2. 确保右侧显示了消息列表');
    console.log('  3. 滚动消息列表查看更多消息（如果需要）');
    console.log('='.repeat(80));
    console.log('\n倒计时: 30秒...\n');

    // 倒计时
    for (let i = 30; i > 0; i -= 5) {
      console.log(`还剩 ${i} 秒...`);
      await page.waitForTimeout(5000);
    }

    console.log('\n开始分析...\n');

    // 分析所有虚拟列表容器
    const analysis = await page.evaluate(() => {
      const allContainers = [];

      // 查找所有 role="grid" 元素
      const grids = document.querySelectorAll('[role="grid"]');

      grids.forEach((grid, gridIndex) => {
        const containerInfo = {
          type: 'role=grid',
          index: gridIndex,
          className: grid.className,
          html: grid.outerHTML.substring(0, 200)
        };

        // 查找内部容器
        let innerContainer = grid.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
        if (!innerContainer && grid.children.length > 0) {
          innerContainer = grid.children[0];
        }

        if (!innerContainer) {
          containerInfo.error = '没有找到内部容器';
          allContainers.push(containerInfo);
          return;
        }

        containerInfo.innerClassName = innerContainer.className;
        containerInfo.childCount = innerContainer.children.length;

        // 分析子元素
        const children = Array.from(innerContainer.children);
        const samples = children.slice(0, 10).map((child, i) => {
          const sample = {
            index: i,
            tagName: child.tagName,
            className: child.className.substring(0, 100),
            text: child.textContent ? child.textContent.substring(0, 120).replace(/\s+/g, ' ') : '',
            style: {
              position: child.style.position,
              top: child.style.top,
              height: child.style.height
            }
          };

          // 检查 React Fiber
          const fiberKey = Object.keys(child).find(key => key.startsWith('__react'));
          if (fiberKey) {
            sample.hasFiber = true;

            // 深度搜索消息数据
            function searchDeep(fiber, depth = 0) {
              if (!fiber || depth > 15) return null;

              if (fiber.memoizedProps) {
                const props = fiber.memoizedProps;
                const msgData = {};

                ['conversationId', 'serverId', 'msgId', 'messageId', 'id',
                 'content', 'message', 'text', 'msgContent',
                 'sender', 'senderName', 'userName',
                 'timestamp', 'createTime', 'sendTime'].forEach(key => {
                  if (props[key] !== undefined) {
                    msgData[key] = typeof props[key] === 'object'
                      ? JSON.stringify(props[key]).substring(0, 100)
                      : props[key];
                  }
                });

                if (Object.keys(msgData).length >= 2) {
                  return { msgData, depth, propsCount: Object.keys(props).length };
                }
              }

              if (fiber.child) {
                const result = searchDeep(fiber.child, depth + 1);
                if (result) return result;
              }

              if (depth < 5 && fiber.sibling) {
                const result = searchDeep(fiber.sibling, depth + 1);
                if (result) return result;
              }

              return null;
            }

            const msgData = searchDeep(child[fiberKey]);
            if (msgData) {
              sample.messageData = msgData;
            }
          }

          return sample;
        });

        containerInfo.samples = samples;
        containerInfo.messagesFound = samples.filter(s => s.messageData).length;

        allContainers.push(containerInfo);
      });

      return {
        totalGrids: grids.length,
        containers: allContainers
      };
    });

    // 打印结果
    console.log('='.repeat(80));
    console.log(`找到 ${analysis.totalGrids} 个虚拟列表容器`);
    console.log('='.repeat(80) + '\n');

    if (analysis.totalGrids === 0) {
      console.log('❌ 没有找到任何虚拟列表容器');
      console.log('可能原因: 页面结构改变，或消息列表未加载\n');
    } else {
      analysis.containers.forEach((container) => {
        console.log(`【容器 #${container.index + 1}】`);
        console.log(`  类型: ${container.type}`);
        console.log(`  类名: ${container.className}`);

        if (container.error) {
          console.log(`  ❌ 错误: ${container.error}\n`);
          return;
        }

        console.log(`  内部容器: ${container.innerClassName}`);
        console.log(`  子元素数: ${container.childCount}`);
        console.log(`  找到消息: ${container.messagesFound} / ${container.samples.length}`);

        if (container.messagesFound > 0) {
          console.log(`  \n  ✅✅✅ 这个容器包含消息数据！\n`);
          console.log(`  消息样本:`);

          container.samples.filter(s => s.messageData).forEach((sample, idx) => {
            console.log(`\n    消息 #${idx + 1} (元素 #${sample.index}):`);
            console.log(`      深度: ${sample.messageData.depth}`);
            console.log(`      Props总数: ${sample.messageData.propsCount}`);
            console.log(`      数据:`);
            Object.entries(sample.messageData.msgData).forEach(([key, value]) => {
              console.log(`        ${key}: ${value}`);
            });
          });
        } else {
          console.log(`\n  前3个元素预览:`);
          container.samples.slice(0, 3).forEach(sample => {
            console.log(`\n    元素 #${sample.index}:`);
            console.log(`      文本: ${sample.text || '(无)'}`);
            console.log(`      位置: ${sample.style.position}, top=${sample.style.top}`);
          });
        }

        console.log('\n' + '-'.repeat(80) + '\n');
      });
    }

    console.log('='.repeat(80));
    console.log('分析完成！浏览器将保持打开 60 秒');
    console.log('='.repeat(80) + '\n');

    await page.waitForTimeout(60000);
    await context.close();
    console.log('✅ 完成\n');

  } catch (error) {
    console.error('\n❌ 出错:', error.message);
    console.error(error.stack);
  }
}

findAllGrids().catch(err => {
  console.error('失败:', err);
  process.exit(1);
});
