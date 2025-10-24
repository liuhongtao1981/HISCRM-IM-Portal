/**
 * 验证私信会话点击和消息提取
 * 目的: 检查原始验证逻辑是否正确,以及消息提取是否工作
 */

const path = require('path');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

async function verifyDMExtraction() {
  console.log('🔍 验证私信会话点击和消息提取\n');

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
    // 3. 导航到私信页面 (正确的 URL)
    console.log('📍 导航到私信页面...');
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('⏳ 等待页面加载完成...');
    await page.waitForTimeout(5000);

    console.log(`✅ 当前 URL: ${page.url()}\n`);

    // 3.5. 检查登录状态
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 检查登录状态');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const loginStatus = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      return {
        url: window.location.href,
        hasQRCode: document.querySelector('[class*="qrcode"]') !== null ||
                   document.querySelector('canvas') !== null,
        hasLoginButton: bodyText.includes('登录') || bodyText.includes('扫码'),
        bodyTextPreview: bodyText.substring(0, 500),
      };
    });

    console.log(`当前 URL: ${loginStatus.url}`);
    console.log(`有二维码: ${loginStatus.hasQRCode ? '⚠️  是 (需要登录)' : '✅ 否'}`);
    console.log(`有登录按钮: ${loginStatus.hasLoginButton ? '⚠️  是 (需要登录)' : '✅ 否'}`);

    if (loginStatus.hasQRCode || loginStatus.hasLoginButton) {
      console.log('\n❌ 账户未登录,无法继续测试');
      console.log('请先手动登录账户,然后重新运行此脚本\n');
      console.log('页面文本预览:');
      console.log(loginStatus.bodyTextPreview);
      return;
    }

    console.log('✅ 账户已登录\n');

    // 3.6. 等待会话列表加载
    console.log('⏳ 等待会话列表加载...');
    try {
      await page.waitForSelector('[role="list-item"]', { timeout: 10000 });
      console.log('✅ 会话列表已加载\n');
    } catch (e) {
      console.log('⚠️  等待超时,会话列表可能未加载\n');
    }

    // 4. 获取会话列表
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 第一步: 检查会话列表');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const allConversations = await page.locator('[role="list-item"]').all();
    console.log(`✅ 找到 ${allConversations.length} 个会话\n`);

    if (allConversations.length === 0) {
      console.log('❌ 没有找到会话元素');
      console.log('提示: 请检查页面是否加载完成,或选择器是否正确\n');
      return;
    }

    // 5. 点击前的状态检查
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 点击前的页面状态');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const beforeState = await page.evaluate(() => {
      return {
        hasMessageClass: document.querySelector('[class*="message"]') !== null,
        hasChatClass: document.querySelector('[class*="chat"]') !== null,
        urlIncludesChat: window.location.href.includes('/chat/'),
        hasTextarea: document.querySelector('textarea') !== null,
        hasContentEditable: document.querySelector('[contenteditable="true"]') !== null,
      };
    });

    console.log('点击前状态:');
    console.log(`  有 [class*="message"]: ${beforeState.hasMessageClass ? '✅' : '❌'}`);
    console.log(`  有 [class*="chat"]: ${beforeState.hasChatClass ? '✅' : '❌'}`);
    console.log(`  URL 包含 /chat/: ${beforeState.urlIncludesChat ? '✅' : '❌'}`);
    console.log(`  有 textarea: ${beforeState.hasTextarea ? '✅' : '❌'}`);
    console.log(`  有 contenteditable: ${beforeState.hasContentEditable ? '✅' : '❌'}\n`);

    // 6. 检查原始验证逻辑
    const originalCheck = beforeState.hasMessageClass || beforeState.hasChatClass || beforeState.urlIncludesChat;
    console.log(`原始验证逻辑 (message || chat || url): ${originalCheck ? '✅ 会返回 true' : '❌ 会返回 false'}`);

    if (originalCheck) {
      console.log('⚠️  警告: 原始验证逻辑在点击前就返回 true!');
      console.log('   这意味着验证逻辑可能过于宽松\n');
    } else {
      console.log('✅ 原始验证逻辑正确: 点击前返回 false\n');
    }

    // 7. 点击第一个会话
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👆 第二步: 点击第一个会话');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const firstConversation = allConversations[0];
    await firstConversation.click();
    console.log('✅ 已点击第一个会话');

    await page.waitForTimeout(2000);

    // 8. 点击后的状态检查
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 点击后的页面状态');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const afterState = await page.evaluate(() => {
      return {
        hasMessageClass: document.querySelector('[class*="message"]') !== null,
        hasChatClass: document.querySelector('[class*="chat"]') !== null,
        urlIncludesChat: window.location.href.includes('/chat/'),
        hasTextarea: document.querySelector('textarea') !== null,
        hasContentEditable: document.querySelector('[contenteditable="true"]') !== null,
        messageElements: document.querySelectorAll('[class*="message"]').length,
        chatElements: document.querySelectorAll('[class*="chat"]').length,
      };
    });

    console.log('点击后状态:');
    console.log(`  有 [class*="message"]: ${afterState.hasMessageClass ? '✅' : '❌'}`);
    console.log(`  有 [class*="chat"]: ${afterState.hasChatClass ? '✅' : '❌'}`);
    console.log(`  URL 包含 /chat/: ${afterState.urlIncludesChat ? '✅' : '❌'}`);
    console.log(`  有 textarea: ${afterState.hasTextarea ? '✅' : '❌'}`);
    console.log(`  有 contenteditable: ${afterState.hasContentEditable ? '✅' : '❌'}`);
    console.log(`  message 元素数量: ${afterState.messageElements}`);
    console.log(`  chat 元素数量: ${afterState.chatElements}\n`);

    // 9. 验证原始验证逻辑
    const originalCheckAfter = afterState.hasMessageClass || afterState.hasChatClass || afterState.urlIncludesChat;
    console.log(`原始验证逻辑 (message || chat || url): ${originalCheckAfter ? '✅ 会返回 true' : '❌ 会返回 false'}\n`);

    if (originalCheckAfter) {
      console.log('✅ 原始验证逻辑正确: 点击后返回 true');
    } else {
      console.log('❌ 原始验证逻辑失败: 点击后仍返回 false');
    }

    // 10. 测试消息提取 (React Fiber 方法)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔬 第三步: 测试消息提取 (React Fiber)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const messages = await page.evaluate(() => {
      const results = [];

      // 查找所有可能的消息容器
      const messageContainers = document.querySelectorAll('[class*="message"]');

      for (const element of messageContainers) {
        // 尝试从 React Fiber 提取
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber$'));

        if (fiberKey) {
          const fiber = element[fiberKey];

          try {
            // 遍历 Fiber 树寻找消息数据
            let current = fiber;
            let depth = 0;

            while (current && depth < 10) {
              const props = current.memoizedProps;

              if (props) {
                // 检查是否有消息数据结构
                if (props.content || props.text || props.message) {
                  results.push({
                    source: 'react-fiber',
                    depth: depth,
                    data: {
                      content: props.content,
                      text: props.text,
                      message: props.message,
                      timestamp: props.timestamp || props.time,
                      author: props.author || props.from,
                    }
                  });
                  break;
                }
              }

              current = current.return;
              depth++;
            }
          } catch (e) {
            // 忽略提取错误
          }
        }
      }

      return results;
    });

    console.log(`找到 ${messages.length} 条通过 React Fiber 提取的消息\n`);

    if (messages.length > 0) {
      console.log('✅ React Fiber 消息提取成功!\n');
      console.log('前5条消息:');
      messages.slice(0, 5).forEach((msg, i) => {
        console.log(`  ${i + 1}. [深度 ${msg.depth}]`, JSON.stringify(msg.data, null, 2));
      });
    } else {
      console.log('⚠️  React Fiber 未提取到消息数据\n');
      console.log('可能原因:');
      console.log('  1. 消息数据结构发生变化');
      console.log('  2. React Fiber 键名变化');
      console.log('  3. 需要调整提取逻辑\n');
    }

    // 11. 总结
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 验证总结');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('1. 会话列表选择器 [role="list-item"]:');
    console.log(`   ${allConversations.length > 0 ? '✅ 正确' : '❌ 失败'}`);

    console.log('\n2. 原始验证逻辑 (message || chat || url):');
    if (!originalCheck && originalCheckAfter) {
      console.log('   ✅ 完全正确 - 点击前返回 false, 点击后返回 true');
    } else if (originalCheck && originalCheckAfter) {
      console.log('   ⚠️  过于宽松 - 点击前后都返回 true');
      console.log('   建议: 使用更严格的验证逻辑 (textarea/contenteditable)');
    } else if (!originalCheck && !originalCheckAfter) {
      console.log('   ❌ 点击后仍返回 false - 验证逻辑不正确');
    }

    console.log('\n3. React Fiber 消息提取:');
    console.log(`   ${messages.length > 0 ? '✅ 正常工作' : '⚠️  未提取到数据'}`);

    console.log('\n4. 建议:');
    if (originalCheck) {
      console.log('   - 建议使用更严格的验证逻辑 (检查 textarea 或 contenteditable)');
      console.log('   - 当前验证逻辑可能在点击前就返回 true');
    } else {
      console.log('   - 原始验证逻辑工作正常,可以保留');
    }

    if (messages.length === 0) {
      console.log('   - 需要调试 React Fiber 消息提取逻辑');
      console.log('   - 可能需要更新 Fiber 遍历深度或数据结构匹配');
    }

  } catch (error) {
    console.error('\n❌ 验证失败:', error);
    console.error(error.stack);
  } finally {
    console.log('\n⏸️  等待10秒后关闭浏览器...');
    await page.waitForTimeout(10000);

    await context.close();
    db.close();
    console.log('\n✅ 验证完成');
  }
}

verifyDMExtraction().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
