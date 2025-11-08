/**
 * 分析 ReactVirtualized innerScrollContainer 内的消息元素
 */

const { chromium } = require('playwright');
const path = require('path');

async function analyze() {
  console.log('\n=== 分析虚拟列表内部结构 ===\n');

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

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    console.log('连接到已打开的浏览器页面...\n');

    // 直接分析当前页面的虚拟列�?    const analysis = await page.evaluate(() => {
      const grid = document.querySelector('.ReactVirtualized__Grid');
      if (!grid) return { error: '没有找到虚拟列表' };

      const innerContainer = grid.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
      if (!innerContainer) return { error: '没有找到 innerScrollContainer' };

      // 分析 innerContainer 的所有子元素
      const children = Array.from(innerContainer.children);

      const samples = children.slice(0, 15).map((child, index) => {
        // 查找 React Fiber
        const fiberKey = Object.keys(child).find(key => key.startsWith('__react'));

        const sample = {
          index,
          tagName: child.tagName,
          className: child.className.substring(0, 150),
          textPreview: child.textContent ? child.textContent.substring(0, 100).replace(/\s+/g, ' ') : '',
          hasFiber: !!fiberKey,
          style: {
            position: child.style.position,
            top: child.style.top,
            left: child.style.left,
            height: child.style.height,
            width: child.style.width
          }
        };

        if (fiberKey) {
          const fiber = child[fiberKey];

          sample.fiberInfo = {
            hasProps: !!fiber.memoizedProps,
            propsKeys: fiber.memoizedProps ? Object.keys(fiber.memoizedProps) : []
          };

          // 深度搜索消息数据
          function searchDeep(f, depth = 0, maxDepth = 10) {
            if (!f || depth > maxDepth) return null;

            if (f.memoizedProps) {
              const props = f.memoizedProps;

              // 查找消息字段
              const messageFields = {};
              ['conversationId', 'serverId', 'msgId', 'messageId', 'id',
               'content', 'message', 'text', 'msgContent',
               'sender', 'userName', 'fromUser', 'toUser',
               'timestamp', 'createTime', 'sendTime', 'time'].forEach(key => {
                if (props[key] !== undefined) {
                  messageFields[key] = typeof props[key] === 'object'
                    ? JSON.stringify(props[key]).substring(0, 80)
                    : props[key];
                }
              });

              if (Object.keys(messageFields).length > 0) {
                return { messageFields, depth, allPropsKeys: Object.keys(props) };
              }
            }

            // 递归子节�?            if (f.child) {
              const result = searchDeep(f.child, depth + 1, maxDepth);
              if (result) return result;
            }

            // 递归兄弟节点（仅在前3层）
            if (depth < 3 && f.sibling) {
              const result = searchDeep(f.sibling, depth + 1, maxDepth);
              if (result) return result;
            }

            return null;
          }

          const deepResult = searchDeep(fiber);
          if (deepResult) {
            sample.messageData = deepResult;
          }
        }

        return sample;
      });

      return {
        totalChildren: children.length,
        samples
      };
    });

    if (analysis.error) {
      console.log(`�?${analysis.error}`);
      await context.close();
      return;
    }

    console.log(`📊 innerScrollContainer �?${analysis.totalChildren} 个子元素\n`);
    console.log('='.repeat(80));
    console.log('�?15 个子元素详细分析:');
    console.log('='.repeat(80) + '\n');

    let messageCount = 0;

    analysis.samples.forEach(sample => {
      console.log(`【元�?#${sample.index}】`);
      console.log(`  标签: ${sample.tagName}`);
      console.log(`  类名: ${sample.className || '(�?'}`);
      console.log(`  定位: position=${sample.style.position}, top=${sample.style.top}, left=${sample.style.left}`);
      console.log(`  尺寸: ${sample.style.width} × ${sample.style.height}`);
      console.log(`  文本: ${sample.textPreview || '(�?'}`);
      console.log(`  React Fiber: ${sample.hasFiber ? '�? : '�?}`);

      if (sample.fiberInfo) {
        console.log(`  Props数量: ${sample.fiberInfo.propsKeys.length}`);

        // 高亮消息相关的键
        const msgKeys = sample.fiberInfo.propsKeys.filter(k =>
          /message|content|text|msg|conversation|sender|time|id|user/i.test(k)
        );

        if (msgKeys.length > 0) {
          console.log(`  🔍 消息相关�? ${msgKeys.join(', ')}`);
        }
      }

      if (sample.messageData) {
        messageCount++;
        console.log(`  �?找到消息数据！（深度: ${sample.messageData.depth}）`);
        console.log(`  所有Props (${sample.messageData.allPropsKeys.length}�?: ${sample.messageData.allPropsKeys.join(', ')}`);
        console.log(`  消息字段:`);
        Object.entries(sample.messageData.messageFields).forEach(([key, value]) => {
          console.log(`    ${key}: ${value}`);
        });
      }

      console.log('');
    });

    console.log('='.repeat(80));
    console.log(`总结: �?${analysis.samples.length} 个元素中找到 ${messageCount} 个包含消息数据的元素`);
    console.log('='.repeat(80));

    console.log('\n浏览器将保持打开 60 �?..\n');
    await page.waitForTimeout(60000);

    await context.close();
    console.log('�?完成');

  } catch (error) {
    console.error('\n�?出错:', error.message);
    console.error(error.stack);
  }
}

analyze().catch(err => {
  console.error('失败:', err);
  process.exit(1);
});
