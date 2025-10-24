/**
 * 专门诊断消息元素的 React Fiber 结构
 * 目的: 找到正确的 Fiber 数据提取方法
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function diagnoseMessageFiber() {
  console.log('🔬 诊断消息元素的 React Fiber 结构\n');

  // 1. 连接数据库
  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');
  console.log(`✅ 账户: ${account.id}\n`);

  // 2. 启动浏览器
  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // 3. 导航并打开会话
    console.log('📍 导航到私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(5000);
    await page.waitForSelector('[role="list-item"]', { timeout: 10000 });

    // 点击最后一个会话
    const conversations = await page.locator('[role="list-item"]').all();
    await conversations[conversations.length - 1].click();
    await page.waitForTimeout(3000);

    console.log('✅ 会话已打开\n');

    // 4. 专门查找消息容器内的元素
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 查找消息容器');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const messageContainerInfo = await page.evaluate(() => {
      // 查找可能的消息容器
      const grids = document.querySelectorAll('[role="grid"]');

      const results = {
        grids: [],
        messageElements: [],
      };

      grids.forEach((grid, gridIndex) => {
        const gridInfo = {
          index: gridIndex,
          className: grid.className,
          childCount: grid.children.length,
          scrollHeight: grid.scrollHeight,
          clientHeight: grid.clientHeight,
          innerHTML: grid.innerHTML.substring(0, 500),
        };

        // 检查这个 grid 是否包含消息
        const messagesInGrid = grid.querySelectorAll('[class*="message"]');
        gridInfo.messageCount = messagesInGrid.length;

        results.grids.push(gridInfo);

        // 如果这个 grid 包含消息，深入分析
        if (messagesInGrid.length > 0) {
          messagesInGrid.forEach((msgEl, msgIndex) => {
            results.messageElements.push({
              gridIndex: gridIndex,
              messageIndex: msgIndex,
              className: msgEl.className,
              textContent: msgEl.textContent?.substring(0, 100) || '',
              parentChain: getParentChain(msgEl, 5),
            });
          });
        }
      });

      function getParentChain(element, maxDepth) {
        const chain = [];
        let current = element;
        let depth = 0;

        while (current && depth < maxDepth) {
          chain.push({
            tag: current.tagName,
            className: current.className,
            id: current.id,
            role: current.getAttribute('role'),
          });
          current = current.parentElement;
          depth++;
        }

        return chain;
      }

      return results;
    });

    console.log(`找到 ${messageContainerInfo.grids.length} 个 [role="grid"] 容器:\n`);
    messageContainerInfo.grids.forEach((grid, i) => {
      console.log(`Grid ${i + 1}:`);
      console.log(`  className: ${grid.className}`);
      console.log(`  子元素数: ${grid.childCount}`);
      console.log(`  消息数: ${grid.messageCount}`);
      console.log(`  scrollHeight: ${grid.scrollHeight}px`);
      console.log(`  clientHeight: ${grid.clientHeight}px\n`);
    });

    console.log(`\n找到 ${messageContainerInfo.messageElements.length} 个消息元素\n`);

    if (messageContainerInfo.messageElements.length > 0) {
      console.log('消息元素详情:');
      messageContainerInfo.messageElements.slice(0, 3).forEach((msg, i) => {
        console.log(`\n消息 ${i + 1}:`);
        console.log(`  className: ${msg.className}`);
        console.log(`  文本: ${msg.textContent}`);
        console.log(`  父级链 (前3层):`);
        msg.parentChain.slice(0, 3).forEach((parent, j) => {
          console.log(`    ${j}. <${parent.tag}> class="${parent.className}" role="${parent.role || ''}"`);
        });
      });
    }

    // 5. 深入分析消息元素的 React Fiber
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔬 深度分析消息元素的 React Fiber');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const fiberDeepAnalysis = await page.evaluate(() => {
      const results = [];

      // 只分析消息容器内的元素
      const messageGrid = Array.from(document.querySelectorAll('[role="grid"]'))
        .find(grid => grid.querySelectorAll('[class*="message"]').length > 0);

      if (!messageGrid) {
        return { error: '未找到包含消息的 grid' };
      }

      // 获取所有消息元素
      const messageElements = messageGrid.querySelectorAll('[class*="message"]');

      messageElements.forEach((element, elementIndex) => {
        // 只分析前 3 个
        if (elementIndex >= 3) return;

        const fiberKey = Object.keys(element).find(key => key.startsWith('__react'));
        if (!fiberKey) {
          results.push({
            elementIndex: elementIndex,
            className: element.className,
            error: '没有 React Fiber 键',
          });
          return;
        }

        const analysis = {
          elementIndex: elementIndex,
          className: element.className,
          textContent: element.textContent?.substring(0, 50) || '',
          fiberKey: fiberKey,
          fiberTree: [],
        };

        // 向上遍历 Fiber 树
        let current = element[fiberKey];
        let depth = 0;

        while (current && depth < 30) {
          const node = {
            depth: depth,
            type: typeof current.type === 'function' ? current.type.name : (current.type || 'unknown'),
            propsKeys: current.memoizedProps ? Object.keys(current.memoizedProps) : [],
            props: {},
          };

          // 记录所有 props
          if (current.memoizedProps) {
            const props = current.memoizedProps;

            // 记录所有非函数的 props
            Object.keys(props).forEach(key => {
              const value = props[key];

              if (typeof value === 'function') {
                node.props[key] = '[Function]';
              } else if (typeof value === 'object' && value !== null) {
                // 对于对象，记录其键
                if (Array.isArray(value)) {
                  node.props[key] = `[Array(${value.length})]`;
                } else {
                  const objKeys = Object.keys(value);
                  if (objKeys.length > 0 && objKeys.length < 10) {
                    node.props[key] = `{${objKeys.join(', ')}}`;

                    // 如果是消息相关的对象，展开
                    if (key === 'content' || key === 'message' || key === 'data') {
                      node.props[key + '_expanded'] = {};
                      objKeys.forEach(objKey => {
                        const objValue = value[objKey];
                        if (typeof objValue !== 'function' && typeof objValue !== 'object') {
                          node.props[key + '_expanded'][objKey] = objValue;
                        } else if (typeof objValue === 'string') {
                          node.props[key + '_expanded'][objKey] = objValue.substring(0, 100);
                        }
                      });
                    }
                  } else {
                    node.props[key] = `{${objKeys.length} keys}`;
                  }
                }
              } else if (typeof value === 'string') {
                node.props[key] = value.substring(0, 100);
              } else {
                node.props[key] = value;
              }
            });
          }

          analysis.fiberTree.push(node);
          current = current.return;
          depth++;
        }

        results.push(analysis);
      });

      return results;
    });

    if (fiberDeepAnalysis.error) {
      console.log(`❌ ${fiberDeepAnalysis.error}`);
    } else {
      fiberDeepAnalysis.forEach((analysis, i) => {
        console.log(`\n━━━ 消息元素 ${i + 1} ━━━`);
        console.log(`className: ${analysis.className}`);
        console.log(`文本: ${analysis.textContent}`);
        console.log(`Fiber 键: ${analysis.fiberKey}`);
        console.log(`\nFiber 树 (前 15 层):\n`);

        analysis.fiberTree.slice(0, 15).forEach(node => {
          console.log(`深度 ${node.depth}: ${node.type}`);

          if (Object.keys(node.props).length > 0) {
            console.log(`  Props: ${JSON.stringify(node.props, null, 2)}`);
          }
          console.log('');
        });
      });
    }

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

diagnoseMessageFiber().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
