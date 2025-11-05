/**
 * 完整的私信消息分析流程
 * 1. 打开浏览器并导航到私信页面
 * 2. 点击第一个会话
 * 3. 深度分析消息虚拟列表结构
 */

const { chromium } = require('playwright');
const path = require('path');

async function completeAnalysis() {
  console.log('\n' + '='.repeat(80));
  console.log('抖音私信消息完整分析');
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

    // 步骤 1: 导航到私信页面
    console.log('📍 步骤 1: 导航到私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);
    console.log('✅ 页面已加载\n');

    // 步骤 2: 点击第一个会话
    console.log('📍 步骤 2: 点击第一个会话...');

    const conversations = await page.$$('li[class*="item"]');
    let clicked = false;

    for (let i = 0; i < Math.min(conversations.length, 40); i++) {
      const text = await conversations[i].textContent();
      // 跳过导航项
      if (text && text.length > 15 && !text.includes('首页') && !text.includes('管理') && !text.includes('中心')) {
        await conversations[i].click();
        console.log(`✅ 已点击会话 #${i}: ${text.substring(0, 40)}...\n`);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log('❌ 没有找到可点击的会话');
      await context.close();
      return;
    }

    // 等待消息加载
    await page.waitForTimeout(3000);

    // 步骤 3: 分析虚拟列表结构
    console.log('📍 步骤 3: 分析消息虚拟列表结构...\n');

    const analysis = await page.evaluate(() => {
      // 查找虚拟列表容器
      const grid = document.querySelector('[role="grid"]') ||
                    document.querySelector('.ReactVirtualized__Grid');

      if (!grid) {
        return { error: '没有找到虚拟列表容器' };
      }

      const innerContainer = grid.children[0];
      if (!innerContainer) {
        return { error: '虚拟列表容器为空' };
      }

      // 分析 innerContainer 的子元素
      const children = Array.from(innerContainer.children);

      function deepSearchMessage(fiber, depth = 0, maxDepth = 12) {
        if (!fiber || depth > maxDepth) return null;

        if (fiber.memoizedProps) {
          const props = fiber.memoizedProps;
          const messageFields = {};

          // 检查所有可能的消息字段
          const targetKeys = [
            'conversationId', 'serverId', 'msgId', 'messageId', 'id',
            'content', 'message', 'text', 'msgContent', 'msg',
            'sender', 'senderName', 'userName', 'user', 'fromUser',
            'timestamp', 'createTime', 'sendTime', 'time', 'date'
          ];

          targetKeys.forEach(key => {
            if (props[key] !== undefined) {
              const value = props[key];
              messageFields[key] = typeof value === 'object'
                ? (value && (value.text || value.content) ? (value.text || value.content) : JSON.stringify(value).substring(0, 100))
                : value;
            }
          });

          if (Object.keys(messageFields).length > 2) {  // 至少有2个消息字段
            return {
              messageFields,
              depth,
              totalPropsCount: Object.keys(props).length,
              allPropsKeys: Object.keys(props)
            };
          }
        }

        // 递归子节点
        if (fiber.child) {
          const result = deepSearchMessage(fiber.child, depth + 1, maxDepth);
          if (result) return result;
        }

        // 递归兄弟节点（前5层）
        if (depth < 5 && fiber.sibling) {
          const result = deepSearchMessage(fiber.sibling, depth + 1, maxDepth);
          if (result) return result;
        }

        return null;
      }

      const samples = [];

      // 分析前20个子元素
      for (let i = 0; i < Math.min(20, children.length); i++) {
        const child = children[i];

        const sample = {
          index: i,
          tagName: child.tagName,
          className: child.className.substring(0, 120),
          textPreview: child.textContent ? child.textContent.substring(0, 120).replace(/\s+/g, ' ') : '',
          style: {
            position: child.style.position,
            top: child.style.top,
            height: child.style.height
          }
        };

        // 查找 React Fiber
        const fiberKey = Object.keys(child).find(key => key.startsWith('__react'));

        if (fiberKey) {
          sample.hasFiber = true;
          const fiber = child[fiberKey];

          if (fiber && fiber.memoizedProps) {
            sample.immediatePropKeys = Object.keys(fiber.memoizedProps);
          }

          // 深度搜索
          const deepResult = deepSearchMessage(fiber);
          if (deepResult) {
            sample.messageData = deepResult;
          }
        }

        samples.push(sample);
      }

      return {
        containerClassName: grid.className,
        innerContainerClassName: innerContainer.className,
        totalChildren: children.length,
        samples
      };
    });

    if (analysis.error) {
      console.log(`❌ ${analysis.error}\n`);
      await context.close();
      return;
    }

    // 打印分析结果
    console.log('='.repeat(80));
    console.log('虚拟列表信息:');
    console.log('='.repeat(80));
    console.log(`容器类名: ${analysis.containerClassName}`);
    console.log(`内部容器类名: ${analysis.innerContainerClassName}`);
    console.log(`子元素总数: ${analysis.totalChildren}`);
    console.log('');

    console.log('='.repeat(80));
    console.log(`分析前 ${analysis.samples.length} 个子元素:`);
    console.log('='.repeat(80) + '\n');

    let foundMessageCount = 0;

    analysis.samples.forEach(sample => {
      console.log(`【元素 #${sample.index}】`);
      console.log(`  标签: ${sample.tagName}`);
      console.log(`  类名: ${sample.className || '(无)'}`);
      console.log(`  位置: position=${sample.style.position}, top=${sample.style.top}, height=${sample.style.height}`);
      console.log(`  文本: ${sample.textPreview || '(无)'}`);
      console.log(`  React Fiber: ${sample.hasFiber ? '✅' : '❌'}`);

      if (sample.immediatePropKeys && sample.immediatePropKeys.length > 0) {
        const msgKeys = sample.immediatePropKeys.filter(k =>
          /message|content|text|msg|conversation|sender|time|id|user/i.test(k)
        );

        if (msgKeys.length > 0) {
          console.log(`  直接Props中的消息键: ${msgKeys.join(', ')}`);
        }
      }

      if (sample.messageData) {
        foundMessageCount++;
        console.log(`  ✅✅✅ 找到消息数据！(深度: ${sample.messageData.depth}, Props总数: ${sample.messageData.totalPropsCount})`);
        console.log(`  所有Props键: ${sample.messageData.allPropsKeys.join(', ')}`);
        console.log(`  消息数据:`);
        Object.entries(sample.messageData.messageFields).forEach(([key, value]) => {
          console.log(`    📌 ${key}: ${value}`);
        });
      }

      console.log('');
    });

    console.log('='.repeat(80));
    console.log(`✨ 总结: 在 ${analysis.samples.length} 个元素中找到 ${foundMessageCount} 个包含消息数据的元素`);
    console.log('='.repeat(80) + '\n');

    if (foundMessageCount > 0) {
      console.log('🎉 成功！找到了消息数据的位置和结构！\n');
    } else {
      console.log('⚠️ 警告：没有找到消息数据，可能需要：');
      console.log('  1. 增加深度搜索的层数');
      console.log('  2. 检查是否有iframe');
      console.log('  3. 检查消息是否通过API动态加载\n');
    }

    console.log('浏览器将保持打开 90 秒，请手动检查页面...\n');
    await page.waitForTimeout(90000);

    await context.close();
    console.log('✅ 分析完成\n');

  } catch (error) {
    console.error('\n❌ 出错:', error.message);
    console.error(error.stack);
  }
}

completeAnalysis().catch(err => {
  console.error('脚本失败:', err);
  process.exit(1);
});
