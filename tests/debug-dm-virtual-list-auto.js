/**
 * 调试抖音私信虚拟列表 - 自动化版本
 * 自动点击会话并分析虚拟列表内容
 */

const { chromium } = require('playwright');
const path = require('path');

async function debugVirtualList() {
  console.log('\n=== 抖音私信虚拟列表调试（自动化）===\n');

  const userDataDir = path.join(
    __dirname,
    '../packages/worker/data/browser/worker1/browser_acc-98296c87-2e42-447a-9d8b-8be008ddb6e4'
  );

  console.log(`使用浏览器数据目录: ${userDataDir}\n`);

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    console.log('✅ 浏览器已启动');

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    // 导航到抖音创作者私信页面
    console.log('\n导航到抖音创作者私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('✅ 页面已加载');

    // 等待页面完全加载
    await page.waitForTimeout(3000);

    // 查找并点击第一个会话
    console.log('\n查找会话列表...');

    // 尝试多种选择器找到会话列表项
    const conversationSelectors = [
      '[class*="conversation"]',
      '[class*="chat-item"]',
      '[class*="message-item"]',
      '[role="listitem"]',
      'li[class*="item"]'
    ];

    let conversationClicked = false;
    for (const selector of conversationSelectors) {
      try {
        const conversations = await page.$$(selector);
        console.log(`选择器 "${selector}" 找到 ${conversations.length} 个元素`);

        if (conversations.length > 0) {
          console.log(`\n点击第一个会话（使用选择器: ${selector}）...`);
          await conversations[0].click();
          conversationClicked = true;
          break;
        }
      } catch (error) {
        // 继续尝试下一个选择器
      }
    }

    if (!conversationClicked) {
      console.log('⚠️ 没有找到会话列表，尝试手动定位...');

      // 打印页面 DOM 结构帮助调试
      const domStructure = await page.evaluate(() => {
        const body = document.body;
        const getAllClasses = (element, depth = 0, maxDepth = 3) => {
          if (depth > maxDepth) return [];

          const classes = [];
          if (element.className && typeof element.className === 'string') {
            classes.push(`${'  '.repeat(depth)}${element.tagName}: ${element.className}`);
          }

          for (let child of element.children) {
            classes.push(...getAllClasses(child, depth + 1, maxDepth));
          }

          return classes;
        };

        return getAllClasses(body).slice(0, 50); // 只取前50个
      });

      console.log('\nDOM 结构（前50个元素）:');
      domStructure.forEach(line => console.log(line));
    }

    // 等待消息列表加载
    console.log('\n等待消息列表加载...');
    await page.waitForTimeout(2000);

    console.log('\n开始调试虚拟列表...\n');
    console.log('='.repeat(60));

    // ============================================================
    // 步骤 1: 查找所有可能包含消息的元素
    // ============================================================
    console.log('\n【步骤 1】查找消息元素');
    console.log('-'.repeat(60));

    const step1Result = await page.evaluate(() => {
      const selectors = [
        '[role="grid"]',
        '[role="list"]',
        '[class*="message"]',
        '[class*="Message"]',
        '[class*="msg"]',
        '[class*="chat"]',
        '[class*="item"]',
        '[role="listitem"]',
        '[role*="article"]'
      ];

      const results = {};
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        results[selector] = elements.length;
      });

      return results;
    });

    console.log('各选择器找到的元素数量:');
    Object.entries(step1Result).forEach(([selector, count]) => {
      const status = count > 0 ? '✅' : '  ';
      console.log(`${status} ${selector.padEnd(30)} : ${count} 个`);
    });

    // ============================================================
    // 步骤 2: 详细分析消息元素的 React Fiber 结构
    // ============================================================
    console.log('\n【步骤 2】分析 React Fiber 结构');
    console.log('-'.repeat(60));

    const step2Result = await page.evaluate(() => {
      // 尝试多个选择器
      const allElements = document.querySelectorAll('[class*="message"], [class*="Message"], [class*="item"], [role="listitem"]');

      if (allElements.length === 0) {
        return { error: '没有找到任何消息元素' };
      }

      const samples = [];
      const maxSamples = 10;

      Array.from(allElements).slice(0, maxSamples).forEach((element, index) => {
        const sample = {
          index,
          tagName: element.tagName,
          className: element.className.substring(0, 100),
          textPreview: element.textContent ? element.textContent.substring(0, 80).replace(/\s+/g, ' ') : '',
          hasFiber: false,
          fiberKey: null,
          propsKeys: []
        };

        // 查找所有以 __react 开头的键
        const reactKeys = Object.keys(element).filter(key => key.startsWith('__react'));

        if (reactKeys.length > 0) {
          sample.hasFiber = true;
          sample.fiberKey = reactKeys[0];

          const fiber = element[reactKeys[0]];
          if (fiber && fiber.memoizedProps) {
            sample.propsKeys = Object.keys(fiber.memoizedProps);
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
      console.log(`总共找到 ${step2Result.totalElements} 个潜在消息元素\n`);
      console.log(`分析前 ${step2Result.samples.length} 个元素:\n`);

      step2Result.samples.forEach(sample => {
        console.log(`元素 #${sample.index}:`);
        console.log(`  标签: ${sample.tagName}`);
        console.log(`  类名: ${sample.className || '(无)'}`);
        console.log(`  文本: ${sample.textPreview || '(无文本)'}`);
        console.log(`  React Fiber: ${sample.hasFiber ? '✅ 存在' : '❌ 不存在'}`);

        if (sample.hasFiber) {
          console.log(`  Fiber 键: ${sample.fiberKey}`);
          console.log(`  Props 键 (${sample.propsKeys.length}个):`);

          // 高亮显示消息相关的键
          const messageRelatedKeys = sample.propsKeys.filter(key =>
            /message|content|text|msg|conversation|sender|time|id/i.test(key)
          );

          if (messageRelatedKeys.length > 0) {
            console.log(`    🔍 消息相关: ${messageRelatedKeys.join(', ')}`);
          }

          const otherKeys = sample.propsKeys.filter(key =>
            !/message|content|text|msg|conversation|sender|time|id/i.test(key)
          ).slice(0, 10);

          if (otherKeys.length > 0) {
            console.log(`    其他: ${otherKeys.join(', ')}${sample.propsKeys.length > 10 ? '...' : ''}`);
          }
        }
        console.log('');
      });
    }

    // ============================================================
    // 步骤 3: 深度查找消息数据
    // ============================================================
    console.log('【步骤 3】深度搜索消息数据');
    console.log('-'.repeat(60));

    const step3Result = await page.evaluate(() => {
      function deepSearchFiber(fiber, maxDepth = 5, currentDepth = 0, path = 'root') {
        if (!fiber || currentDepth > maxDepth) return [];

        const findings = [];

        if (fiber.memoizedProps) {
          const props = fiber.memoizedProps;
          const keys = Object.keys(props);

          // 检查消息相关的属性
          const messageProps = {};
          const importantKeys = ['conversationId', 'serverId', 'msgId', 'id', 'content', 'message', 'text', 'sender', 'timestamp', 'createTime'];

          importantKeys.forEach(key => {
            if (props[key] !== undefined) {
              messageProps[key] = typeof props[key] === 'object'
                ? JSON.stringify(props[key]).substring(0, 100)
                : props[key];
            }
          });

          if (Object.keys(messageProps).length > 0) {
            findings.push({
              path,
              depth: currentDepth,
              messageProps,
              allPropsCount: keys.length
            });
          }
        }

        // 递归子节点
        if (fiber.child) {
          findings.push(...deepSearchFiber(fiber.child, maxDepth, currentDepth + 1, path + '.child'));
        }

        // 递归兄弟节点（只在顶层）
        if (currentDepth === 0 && fiber.sibling) {
          findings.push(...deepSearchFiber(fiber.sibling, maxDepth, currentDepth + 1, path + '.sibling'));
        }

        return findings;
      }

      const allElements = document.querySelectorAll('[class*="message"], [class*="Message"], [class*="item"]');
      const allFindings = [];

      Array.from(allElements).slice(0, 5).forEach((element, index) => {
        const fiberKey = Object.keys(element).find(key => key.startsWith('__react'));
        if (fiberKey) {
          const findings = deepSearchFiber(element[fiberKey]);
          if (findings.length > 0) {
            allFindings.push({ elementIndex: index, findings });
          }
        }
      });

      return { totalSearched: Math.min(allElements.length, 5), results: allFindings };
    });

    console.log(`搜索了前 ${step3Result.totalSearched} 个元素\n`);

    if (step3Result.results.length === 0) {
      console.log('❌ 没有在 React Fiber 中找到消息数据');
    } else {
      console.log(`✅ 在 ${step3Result.results.length} 个元素中找到消息数据:\n`);

      step3Result.results.forEach(result => {
        console.log(`元素 #${result.elementIndex}:`);
        result.findings.forEach((finding, idx) => {
          console.log(`  发现 #${idx + 1}:`);
          console.log(`    路径: ${finding.path}`);
          console.log(`    深度: ${finding.depth}`);
          console.log(`    总Props数: ${finding.allPropsCount}`);
          console.log(`    消息数据:`, finding.messageProps);
        });
        console.log('');
      });
    }

    // ============================================================
    // 步骤 4: 测试当前提取逻辑
    // ============================================================
    console.log('【步骤 4】测试当前的提取逻辑');
    console.log('-'.repeat(60));

    const step4Result = await page.evaluate(() => {
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

            // 原始提取逻辑
            if (props.conversationId || props.serverId || props.content || props.message) {
              const messageId = props.serverId || props.msgId || props.id;
              if (messageId && !processedIds.has(messageId)) {
                processedIds.add(messageId);
                messages.push({
                  conversationId: props.conversationId,
                  serverId: props.serverId,
                  content: props.content,
                  message: props.message,
                  hasConversationId: !!props.conversationId,
                  hasServerId: !!props.serverId,
                  hasContent: !!props.content,
                  hasMessage: !!props.message
                });
              }
            }
          } catch (error) {
            // 忽略
          }
        });

        return {
          totalElements: allElements.length,
          extractedCount: messages.length,
          samples: messages.slice(0, 5)
        };
      }

      return extractMessagesFromVirtualList();
    });

    console.log(`扫描元素数: ${step4Result.totalElements}`);
    console.log(`提取消息数: ${step4Result.extractedCount}`);

    if (step4Result.extractedCount === 0) {
      console.log('\n❌ 当前提取逻辑返回 0 条消息！');
      console.log('\n可能原因:');
      console.log('  1. Props 中没有 conversationId/serverId/content/message 属性');
      console.log('  2. 消息数据在更深层的 Fiber 节点中');
      console.log('  3. 抖音更新了页面结构');
    } else {
      console.log(`\n✅ 成功提取 ${step4Result.extractedCount} 条消息\n`);
      console.log('消息样本:');
      step4Result.samples.forEach((msg, index) => {
        console.log(`\n  消息 #${index + 1}:`);
        console.log(`    conversationId: ${msg.hasConversationId ? '✅' : '❌'} ${msg.conversationId || ''}`);
        console.log(`    serverId: ${msg.hasServerId ? '✅' : '❌'} ${msg.serverId || ''}`);
        console.log(`    content: ${msg.hasContent ? '✅' : '❌'}`);
        console.log(`    message: ${msg.hasMessage ? '✅' : '❌'}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('调试完成！浏览器将保持打开 30 秒...');
    console.log('='.repeat(60) + '\n');

    // 保持浏览器打开 30 秒
    await page.waitForTimeout(30000);

    await context.close();
    console.log('✅ 浏览器已关闭');

  } catch (error) {
    console.error('\n❌ 调试过程出错:', error.message);
    console.error(error.stack);
  }
}

debugVirtualList().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
