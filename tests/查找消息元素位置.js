/**
 * 查找消息元素的准确位置
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function findMessageElements() {
  console.log('🔍 查找消息元素的准确位置\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);
  const account = db.prepare('SELECT * FROM accounts WHERE platform = ? LIMIT 1').get('douyin');

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(5000);
    await page.waitForSelector('[role="list-item"]', { timeout: 10000 });

    // 点击最后一个会话
    const conversations = await page.locator('[role="list-item"]').all();
    console.log(`找到 ${conversations.length} 个会话，点击最后一个...\n`);
    await conversations[conversations.length - 1].click();
    await page.waitForTimeout(3000);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 查找所有 [class*="message"] 元素');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const messageInfo = await page.evaluate(() => {
      const messageElements = document.querySelectorAll('[class*="message"]');
      const results = [];

      messageElements.forEach((el, index) => {
        // 获取父级链
        function getParentChain(element, maxDepth = 10) {
          const chain = [];
          let current = element;
          let depth = 0;

          while (current && depth < maxDepth) {
            chain.push({
              tag: current.tagName,
              className: current.className,
              id: current.id,
              role: current.getAttribute('role'),
              hasReactFiber: Object.keys(current).some(key => key.startsWith('__react')),
            });
            current = current.parentElement;
            depth++;
          }

          return chain;
        }

        results.push({
          index: index,
          tag: el.tagName,
          className: el.className,
          text: el.textContent?.substring(0, 100) || '',
          hasReactFiber: Object.keys(el).some(key => key.startsWith('__react')),
          parentChain: getParentChain(el),
        });
      });

      return results;
    });

    console.log(`找到 ${messageInfo.length} 个 [class*="message"] 元素\n`);

    messageInfo.forEach((msg, i) => {
      console.log(`━━━ 元素 ${i + 1} ━━━`);
      console.log(`<${msg.tag}> class="${msg.className}"`);
      console.log(`文本: ${msg.text}`);
      console.log(`有 React Fiber: ${msg.hasReactFiber ? '✅' : '❌'}`);
      console.log(`\n父级链 (前 10 层):`);

      msg.parentChain.forEach((parent, j) => {
        const fiberMark = parent.hasReactFiber ? ' [有Fiber]' : '';
        const roleMark = parent.role ? ` role="${parent.role}"` : '';
        console.log(`  ${j}. <${parent.tag}>${roleMark} class="${parent.className}"${fiberMark}`);
      });
      console.log('\n');
    });

    // 检查 React Fiber 深度
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔬 检查消息元素的 React Fiber 数据');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const fiberData = await page.evaluate(() => {
      const messageElements = document.querySelectorAll('[class*="message"]');
      const results = [];

      messageElements.forEach((el, index) => {
        const fiberKey = Object.keys(el).find(key => key.startsWith('__react'));

        if (!fiberKey) {
          results.push({
            index: index,
            className: el.className,
            error: '没有 React Fiber 键',
          });
          return;
        }

        const analysis = {
          index: index,
          className: el.className,
          text: el.textContent?.substring(0, 50) || '',
          propsAtDepth: [],
        };

        let current = el[fiberKey];
        let depth = 0;

        while (current && depth < 30) {
          if (current.memoizedProps && Object.keys(current.memoizedProps).length > 0) {
            const props = current.memoizedProps;
            const relevantProps = {};

            // 只记录可能相关的 props
            ['conversationId', 'serverId', 'messageId', 'id', 'content', 'text', 'message',
             'timestamp', 'createdAt', 'isFromMe', 'direction', 'type'].forEach(key => {
              if (props[key] !== undefined) {
                if (typeof props[key] === 'string') {
                  relevantProps[key] = props[key].substring(0, 100);
                } else if (typeof props[key] === 'object' && props[key] !== null) {
                  relevantProps[key] = `{${Object.keys(props[key]).join(', ')}}`;
                } else {
                  relevantProps[key] = props[key];
                }
              }
            });

            if (Object.keys(relevantProps).length > 0) {
              analysis.propsAtDepth.push({
                depth: depth,
                props: relevantProps,
              });
            }
          }

          current = current.return;
          depth++;
        }

        results.push(analysis);
      });

      return results;
    });

    fiberData.forEach((data, i) => {
      console.log(`\n消息元素 ${i + 1}:`);
      console.log(`className: ${data.className}`);
      console.log(`文本: ${data.text || '(无文本)'}`);

      if (data.error) {
        console.log(`❌ ${data.error}`);
      } else if (data.propsAtDepth.length === 0) {
        console.log(`⚠️  在 30 层 Fiber 树中未找到相关 props`);
      } else {
        console.log(`✅ 找到 ${data.propsAtDepth.length} 层包含相关 props:`);
        data.propsAtDepth.forEach(({depth, props}) => {
          console.log(`  深度 ${depth}:`, JSON.stringify(props, null, 2));
        });
      }
    });

  } catch (error) {
    console.error('\n❌ 查找失败:', error);
    console.error(error.stack);
  } finally {
    console.log('\n⏸️  等待 15 秒后关闭浏览器...');
    await page.waitForTimeout(15000);

    await context.close();
    db.close();
    console.log('\n✅ 查找完成');
  }
}

findMessageElements().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
