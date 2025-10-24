/**
 * 诊断私信消息的 DOM 结构和 React Fiber 数据
 * 目的: 找出为什么消息提取返回 0 条
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function diagnoseDMStructure() {
  console.log('🔍 诊断私信消息 DOM 结构\n');

  // 1. 连接数据库
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  if (!account) {
    console.log('❌ 未找到抖音账户');
    db.close();
    process.exit(1);
  }

  console.log(`✅ 账户: ${account.platform_username} (ID: ${account.id})\n`);

  // 2. 启动浏览器
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // 3. 导航到私信页面
    console.log('📍 导航到私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('⏳ 等待页面加载...');
    await page.waitForTimeout(5000);

    // 4. 等待会话列表
    await page.waitForSelector('[role="list-item"]', { timeout: 10000 });
    console.log('✅ 会话列表已加载\n');

    // 5. 获取第一个会话（应该是最后测试中的第 4 个会话）
    const conversations = await page.locator('[role="list-item"]').all();
    console.log(`找到 ${conversations.length} 个会话\n`);

    // 6. 点击最后一个会话（包含正常消息的那个）
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👆 点击最后一个会话（应该有正常消息）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await conversations[conversations.length - 1].click();
    await page.waitForTimeout(3000);

    // 7. 检查是否成功打开
    const hasContentEditable = await page.evaluate(() => {
      return document.querySelector('[contenteditable="true"]') !== null;
    });

    console.log(`输入框存在: ${hasContentEditable ? '✅' : '❌'}\n`);

    if (!hasContentEditable) {
      console.log('❌ 会话未成功打开，停止诊断');
      return;
    }

    // 8. 第一步: 查找消息容器
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 第一步: 查找消息容器');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const containerAnalysis = await page.evaluate(() => {
      return {
        roleGrid: document.querySelectorAll('[role="grid"]').length,
        roleList: document.querySelectorAll('[role="list"]').length,
        virtualList: document.querySelectorAll('.virtual-list, [class*="virtualList"]').length,
        messageClass: document.querySelectorAll('[class*="message"]').length,
        itemClass: document.querySelectorAll('[class*="item"]').length,
        roleArticle: document.querySelectorAll('[role*="article"]').length,
      };
    });

    console.log('容器元素统计:');
    console.log(`  [role="grid"]: ${containerAnalysis.roleGrid} 个`);
    console.log(`  [role="list"]: ${containerAnalysis.roleList} 个`);
    console.log(`  .virtual-list / [class*="virtualList"]: ${containerAnalysis.virtualList} 个`);
    console.log(`  [class*="message"]: ${containerAnalysis.messageClass} 个`);
    console.log(`  [class*="item"]: ${containerAnalysis.itemClass} 个`);
    console.log(`  [role*="article"]: ${containerAnalysis.roleArticle} 个\n`);

    // 9. 第二步: 检查 React Fiber
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔬 第二步: 检查 React Fiber 数据');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const fiberAnalysis = await page.evaluate(() => {
      const results = {
        totalElements: 0,
        elementsWithFiber: 0,
        messagesFound: [],
        fiberSamples: [],
      };

      const allElements = document.querySelectorAll('[class*="message"], [class*="item"], [role*="article"]');
      results.totalElements = allElements.length;

      allElements.forEach((element, index) => {
        // 检查是否有 React Fiber 键
        const fiberKey = Object.keys(element).find(key => key.startsWith('__react'));

        if (fiberKey) {
          results.elementsWithFiber++;

          // 只检查前 5 个元素作为样本
          if (results.fiberSamples.length < 5) {
            let current = element[fiberKey];
            let depth = 0;
            const sample = {
              elementIndex: index,
              elementClass: element.className,
              fiberKey: fiberKey,
              foundMessageData: false,
              propsFound: [],
            };

            // 向上遍历 Fiber 树
            while (current && depth < 20) {
              if (current.memoizedProps) {
                const props = current.memoizedProps;

                // 记录找到的 props
                const foundProps = {};
                if (props.conversationId) foundProps.conversationId = props.conversationId;
                if (props.serverId) foundProps.serverId = props.serverId;
                if (props.messageId) foundProps.messageId = props.messageId;
                if (props.id) foundProps.id = props.id;
                if (props.content) foundProps.content = typeof props.content === 'string' ? props.content.substring(0, 50) : '{object}';
                if (props.text) foundProps.text = props.text.substring(0, 50);
                if (props.message) foundProps.message = typeof props.message === 'string' ? props.message.substring(0, 50) : '{object}';
                if (props.timestamp) foundProps.timestamp = props.timestamp;
                if (props.createdAt) foundProps.createdAt = props.createdAt;
                if (props.isFromMe !== undefined) foundProps.isFromMe = props.isFromMe;

                if (Object.keys(foundProps).length > 0) {
                  sample.propsFound.push({
                    depth: depth,
                    props: foundProps,
                  });

                  // 检查是否是消息数据
                  if (props.conversationId || props.serverId || props.messageId) {
                    sample.foundMessageData = true;

                    // 尝试提取完整消息
                    const msgContent = props.content || {};
                    const textContent = msgContent.text || props.text || '';

                    if (textContent) {
                      results.messagesFound.push({
                        index: results.messagesFound.length,
                        messageId: props.serverId || props.messageId || props.id,
                        conversationId: props.conversationId,
                        content: textContent.substring(0, 100),
                        timestamp: props.timestamp || props.createdAt,
                        depth: depth,
                      });
                    }
                  }
                }
              }

              current = current.return;
              depth++;
            }

            results.fiberSamples.push(sample);
          }
        }
      });

      return results;
    });

    console.log(`总元素数: ${fiberAnalysis.totalElements}`);
    console.log(`有 Fiber 数据的元素: ${fiberAnalysis.elementsWithFiber}`);
    console.log(`找到的消息: ${fiberAnalysis.messagesFound.length} 条\n`);

    if (fiberAnalysis.messagesFound.length > 0) {
      console.log('✅ 成功通过 React Fiber 提取到消息!\n');
      console.log('前 5 条消息:');
      fiberAnalysis.messagesFound.slice(0, 5).forEach((msg, i) => {
        console.log(`  ${i + 1}. ID: ${msg.messageId}`);
        console.log(`     内容: ${msg.content}`);
        console.log(`     深度: ${msg.depth}`);
        console.log(`     会话ID: ${msg.conversationId}\n`);
      });
    } else {
      console.log('❌ 未通过 React Fiber 提取到任何消息\n');
      console.log('Fiber 样本分析 (前 5 个元素):');
      fiberAnalysis.fiberSamples.forEach((sample, i) => {
        console.log(`  样本 ${i + 1}:`);
        console.log(`    元素索引: ${sample.elementIndex}`);
        console.log(`    元素 class: ${sample.elementClass}`);
        console.log(`    Fiber 键: ${sample.fiberKey}`);
        console.log(`    找到消息数据: ${sample.foundMessageData ? '✅' : '❌'}`);
        console.log(`    找到的 props (${sample.propsFound.length} 个):`);

        if (sample.propsFound.length > 0) {
          sample.propsFound.slice(0, 3).forEach((propEntry, j) => {
            console.log(`      深度 ${propEntry.depth}:`, JSON.stringify(propEntry.props, null, 2));
          });
        } else {
          console.log('      (无相关 props)');
        }
        console.log('');
      });
    }

    // 10. 第三步: 直接查看 DOM 内容
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 第三步: 直接查看 DOM 内容');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const domContent = await page.evaluate(() => {
      const messages = [];

      // 尝试多种选择器
      const selectors = [
        '[class*="message"]',
        '[class*="item"]',
        '[role*="article"]',
        '[data-message-id]',
        '[data-msg-id]',
      ];

      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          messages.push({
            selector: selector,
            count: elements.length,
            samples: Array.from(elements).slice(0, 3).map(el => ({
              tag: el.tagName,
              classes: el.className,
              text: el.textContent?.substring(0, 100) || '',
              attributes: Array.from(el.attributes || []).map(attr => `${attr.name}="${attr.value}"`),
            })),
          });
        }
      });

      return messages;
    });

    console.log('DOM 内容分析:');
    domContent.forEach(result => {
      console.log(`\n选择器: ${result.selector}`);
      console.log(`元素数量: ${result.count}`);
      console.log('前 3 个样本:');
      result.samples.forEach((sample, i) => {
        console.log(`  ${i + 1}. <${sample.tag}> class="${sample.classes}"`);
        console.log(`     文本: ${sample.text}`);
        console.log(`     属性: ${sample.attributes.join(', ')}\n`);
      });
    });

  } catch (error) {
    console.error('\n❌ 诊断失败:', error);
    console.error(error.stack);
  } finally {
    console.log('\n⏸️  等待 15 秒后关闭浏览器...');
    await page.waitForTimeout(15000);

    await context.close();
    db.close();
    console.log('\n✅ 诊断完成');
  }
}

diagnoseDMStructure().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
