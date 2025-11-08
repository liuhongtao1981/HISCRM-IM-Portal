/**
 * 专门调试私信消息虚拟列表 - 排除导航元素
 */

const { chromium } = require('playwright');
const path = require('path');

async function debugMessages() {
  console.log('\n=== 抖音私信消息调试（精准定位）===\n');

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

    console.log('�?浏览器已启动');

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // 导航到私信页�?    console.log('\n导航到私信页�?..');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(3000);
    console.log('�?页面已加载\n');

    // 点击第一个会�?    console.log('点击第一个会�?..');
    const conversations = await page.$$('li[class*="item"]');
    if (conversations.length > 0) {
      // 跳过导航项，找到实际的会话列�?      let clicked = false;
      for (let i = 0; i < Math.min(conversations.length, 30); i++) {
        const text = await conversations[i].textContent();
        // 跳过导航项（通常文本很短�?        if (text && text.length > 10 && !text.includes('首页') && !text.includes('管理')) {
          await conversations[i].click();
          console.log(`�?已点击会�?#${i}: ${text.substring(0, 30)}...\n`);
          clicked = true;
          break;
        }
      }

      if (!clicked && conversations.length > 20) {
        // 如果�?0个都是导航，尝试点击�?1个（可能是会话列表开始的地方�?        await conversations[20].click();
        console.log('�?已点击会�?#20\n');
      }
    }

    await page.waitForTimeout(2000);

    console.log('='.repeat(70));
    console.log('开始分析消息虚拟列�?);
    console.log('='.repeat(70) + '\n');

    // 步骤 1: 找到消息容器
    const containerInfo = await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]');
      if (!grid) return { error: '没有找到 [role="grid"] 容器' };

      return {
        className: grid.className,
        childCount: grid.children.length,
        tagName: grid.tagName,
        html: grid.outerHTML.substring(0, 300)
      };
    });

    if (containerInfo.error) {
      console.log(`�?${containerInfo.error}`);
    } else {
      console.log('�?找到消息容器:');
      console.log(`   标签: ${containerInfo.tagName}`);
      console.log(`   类名: ${containerInfo.className}`);
      console.log(`   子元素数: ${containerInfo.childCount}`);
      console.log(`   HTML预览: ${containerInfo.html}...\n`);
    }

    // 步骤 2: 分析消息容器内的元素
    const messageAnalysis = await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]');
      if (!grid) return { error: '没有找到容器' };

      const children = Array.from(grid.children);
      const samples = children.slice(0, 10).map((child, index) => {
        const fiberKey = Object.keys(child).find(key => key.startsWith('__react'));

        const result = {
          index,
          tagName: child.tagName,
          className: child.className.substring(0, 100),
          textPreview: child.textContent ? child.textContent.substring(0, 80).replace(/\s+/g, ' ') : '',
          hasFiber: !!fiberKey,
          propsKeys: []
        };

        if (fiberKey) {
          const fiber = child[fiberKey];
          if (fiber && fiber.memoizedProps) {
            result.propsKeys = Object.keys(fiber.memoizedProps);
          }
        }

        return result;
      });

      return { totalChildren: children.length, samples };
    });

    if (messageAnalysis.error) {
      console.log(`�?${messageAnalysis.error}`);
    } else {
      console.log(`📊 消息容器内有 ${messageAnalysis.totalChildren} 个子元素\n`);
      console.log('�?10 个子元素分析:\n');

      messageAnalysis.samples.forEach(sample => {
        console.log(`元素 #${sample.index}:`);
        console.log(`  标签: ${sample.tagName}`);
        console.log(`  类名: ${sample.className || '(�?'}`);
        console.log(`  文本: ${sample.textPreview || '(�?'}`);
        console.log(`  React Fiber: ${sample.hasFiber ? '�? : '�?}`);

        if (sample.hasFiber && sample.propsKeys.length > 0) {
          const messageKeys = sample.propsKeys.filter(k =>
            /message|content|text|msg|conversation|sender|time|id|user/i.test(k)
          );

          if (messageKeys.length > 0) {
            console.log(`  🔍 消息相关�?(${messageKeys.length}�?: ${messageKeys.join(', ')}`);
          }

          console.log(`  总Props�? ${sample.propsKeys.length}`);
        }
        console.log('');
      });
    }

    // 步骤 3: 深度搜索消息数据
    console.log('='.repeat(70));
    console.log('深度搜索消息数据');
    console.log('='.repeat(70) + '\n');

    const deepSearch = await page.evaluate(() => {
      function searchFiberTree(fiber, depth = 0, maxDepth = 8, path = '') {
        if (!fiber || depth > maxDepth) return [];

        const findings = [];

        if (fiber.memoizedProps) {
          const props = fiber.memoizedProps;
          const keys = Object.keys(props);

          // 查找消息相关数据
          const messageData = {};
          const targetKeys = [
            'conversationId', 'serverId', 'msgId', 'messageId', 'id',
            'content', 'message', 'text', 'msgContent',
            'sender', 'senderName', 'userName',
            'timestamp', 'createTime', 'sendTime', 'time'
          ];

          targetKeys.forEach(key => {
            if (props[key] !== undefined) {
              const value = props[key];
              messageData[key] = typeof value === 'object'
                ? (value && value.text ? value.text : JSON.stringify(value).substring(0, 100))
                : value;
            }
          });

          if (Object.keys(messageData).length > 0) {
            findings.push({
              path: path || 'root',
              depth,
              messageData,
              allKeys: keys.length
            });
          }
        }

        // 递归子节�?        if (fiber.child) {
          findings.push(...searchFiberTree(fiber.child, depth + 1, maxDepth, path + '.child'));
        }

        // 在前3层递归兄弟节点
        if (depth < 3 && fiber.sibling) {
          findings.push(...searchFiberTree(fiber.sibling, depth + 1, maxDepth, path + '.sibling'));
        }

        return findings;
      }

      const grid = document.querySelector('[role="grid"]');
      if (!grid || !grid.children[0]) return { error: '没有找到消息元素' };

      const allFindings = [];

      // 检查前5个子元素
      for (let i = 0; i < Math.min(5, grid.children.length); i++) {
        const child = grid.children[i];
        const fiberKey = Object.keys(child).find(key => key.startsWith('__react'));

        if (fiberKey) {
          const findings = searchFiberTree(child[fiberKey], 0, 8, `element[${i}]`);
          if (findings.length > 0) {
            allFindings.push(...findings);
          }
        }
      }

      return { findings: allFindings };
    });

    if (deepSearch.error) {
      console.log(`�?${deepSearch.error}`);
    } else if (deepSearch.findings.length === 0) {
      console.log('�?没有�?React Fiber 树中找到消息数据');
    } else {
      console.log(`�?找到 ${deepSearch.findings.length} 个包含消息数据的节点:\n`);

      deepSearch.findings.forEach((finding, index) => {
        console.log(`发现 #${index + 1}:`);
        console.log(`  路径: ${finding.path}`);
        console.log(`  深度: ${finding.depth}`);
        console.log(`  Props总数: ${finding.allKeys}`);
        console.log(`  消息数据:`);
        Object.entries(finding.messageData).forEach(([key, value]) => {
          console.log(`    ${key}: ${value}`);
        });
        console.log('');
      });
    }

    console.log('='.repeat(70));
    console.log('浏览器将保持打开 60 秒，请手动检�?..');
    console.log('='.repeat(70));

    await page.waitForTimeout(60000);
    await context.close();
    console.log('\n�?调试完成');

  } catch (error) {
    console.error('\n�?出错:', error.message);
    console.error(error.stack);
  }
}

debugMessages().catch(err => {
  console.error('脚本失败:', err);
  process.exit(1);
});
