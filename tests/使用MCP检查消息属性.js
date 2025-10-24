/**
 * 使用 Playwright 连接到已存在的浏览器，检查消息属性
 */

const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const path = require('path');

async function checkMessagePropertiesViaMCP() {
  console.log('🔍 使用 Playwright 检查消息属性\n');

  const dbPath = path.join(__dirname, '../packages/master/data/master.db');
  const db = new Database(dbPath);

  const account = db.prepare('SELECT * FROM accounts WHERE platform = ?').get('douyin');
  if (!account) {
    console.log('❌ 未找到抖音账户');
    db.close();
    return;
  }

  console.log(`📱 使用账户: ${account.platform_username || account.id}\n`);

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_' + account.id);

  console.log('🌐 启动浏览器...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: ['--remote-debugging-port=9222']  // 启用远程调试
  });

  const page = await context.newPage();

  try {
    console.log('📍 当前 URL:', page.url());

    // 如果不在私信页面，导航到私信页面
    if (!page.url().includes('chat')) {
      console.log('🌐 导航到私信页面...');
      await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForTimeout(3000);
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 步骤 1: 查找并点击会话');
    console.log('='.repeat(60));

    // 等待会话列表加载
    await page.waitForTimeout(2000);

    // 查找会话
    const conversationSelectors = [
      '[class*="conversation-item"]',
      '[class*="session-item"]',
      '[class*="chat-item"]',
      '[role="listitem"]',
      'div[class*="list"] > div'
    ];

    let conversations = null;
    let usedSelector = '';

    for (const selector of conversationSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0 && elements.length < 100) {  // 避免匹配过多
        conversations = elements;
        usedSelector = selector;
        console.log(`✅ 使用选择器 "${selector}" 找到 ${elements.length} 个会话`);
        break;
      }
    }

    if (!conversations || conversations.length === 0) {
      console.log('❌ 未找到会话');

      // 尝试截图
      await page.screenshot({ path: 'tests/debug-no-conversations.png' });
      console.log('📸 已保存截图: tests/debug-no-conversations.png');

      await context.close();
      db.close();
      return;
    }

    // 点击第一个会话
    console.log(`\n🖱️ 点击第一个会话...`);
    await conversations[0].click();
    await page.waitForTimeout(3000);

    console.log('\n' + '='.repeat(60));
    console.log('📋 步骤 2: 提取消息元素的所有属性');
    console.log('='.repeat(60) + '\n');

    // 执行提取逻辑
    const result = await page.evaluate(() => {
      const allElements = document.querySelectorAll('[class*="message"], [class*="item"], [role*="article"]');

      const messages = [];
      let analyzed = 0;

      allElements.forEach((element, index) => {
        const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'));
        if (!fiberKey) return;

        let current = element[fiberKey];
        let depth = 0;
        let found = false;

        // 向上遍历
        while (current && depth < 20 && !found) {
          if (current.memoizedProps) {
            const props = current.memoizedProps;

            if (props.conversationId || props.serverId || props.content || props.message) {
              analyzed++;

              const msgContent = props.content || {};
              const textContent = msgContent.text || '';

              // 提取所有可能的用户相关属性
              const messageData = {
                index: index,
                depth: depth,

                // 核心属性
                serverId: props.serverId,
                conversationId: props.conversationId,
                messageId: props.messageId,
                isFromMe: props.isFromMe,
                type: props.type,

                // 内容
                text: textContent,

                // 时间
                createdAt: props.createdAt,

                // 用户信息
                user: props.user,
                sender: props.sender,
                senderInfo: props.senderInfo,
                fromUser: props.fromUser,
                toUser: props.toUser,

                // 头像
                avatar: props.avatar,
                avatarUrl: props.avatarUrl,
                senderAvatar: props.senderAvatar,

                // 昵称
                nickname: props.nickname,
                senderNickname: props.senderNickname,
                userName: props.userName,
                name: props.name,

                // 所有属性键
                allPropsKeys: Object.keys(props)
              };

              messages.push(messageData);
              found = true;
            }
          }

          current = current.return;
          depth++;
        }
      });

      return {
        totalElements: allElements.length,
        analyzedMessages: analyzed,
        messages: messages
      };
    });

    console.log(`总元素数: ${result.totalElements}`);
    console.log(`有效消息数: ${result.analyzedMessages}\n`);

    if (result.messages.length === 0) {
      console.log('❌ 未提取到任何消息数据');
      await page.screenshot({ path: 'tests/debug-no-messages.png' });
      console.log('📸 已保存截图: tests/debug-no-messages.png');
    } else {
      console.log('✅ 成功提取消息数据\n');

      // 分析前 5 条消息
      result.messages.slice(0, 5).forEach((msg, i) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 消息 ${i + 1}`);
        console.log(`${'='.repeat(60)}`);
        console.log(`元素索引: ${msg.index}, Fiber深度: ${msg.depth}`);
        console.log(`\n【核心标识】`);
        console.log(`  serverId: ${msg.serverId}`);
        console.log(`  conversationId: ${msg.conversationId}`);
        console.log(`  text: ${(msg.text || '').substring(0, 50)}...`);

        console.log(`\n【用户信息】`);
        console.log(`  user:`, msg.user ? JSON.stringify(msg.user, null, 2) : 'null');
        console.log(`  sender:`, msg.sender ? JSON.stringify(msg.sender, null, 2) : 'null');
        console.log(`  senderInfo:`, msg.senderInfo ? JSON.stringify(msg.senderInfo, null, 2) : 'null');
        console.log(`  fromUser:`, msg.fromUser ? JSON.stringify(msg.fromUser, null, 2) : 'null');
        console.log(`  toUser:`, msg.toUser ? JSON.stringify(msg.toUser, null, 2) : 'null');

        console.log(`\n【头像】`);
        console.log(`  avatar:`, msg.avatar);
        console.log(`  avatarUrl:`, msg.avatarUrl);
        console.log(`  senderAvatar:`, msg.senderAvatar);

        console.log(`\n【昵称】`);
        console.log(`  nickname:`, msg.nickname);
        console.log(`  senderNickname:`, msg.senderNickname);
        console.log(`  userName:`, msg.userName);
        console.log(`  name:`, msg.name);

        console.log(`\n【所有属性键】 (${msg.allPropsKeys.length} 个)`);
        console.log(`  ${msg.allPropsKeys.join(', ')}`);
      });

      // 统计
      console.log(`\n\n${'='.repeat(60)}`);
      console.log('📊 统计结果');
      console.log(`${'='.repeat(60)}`);

      const hasUser = result.messages.filter(m => m.user || m.sender || m.senderInfo || m.fromUser || m.toUser).length;
      const hasAvatar = result.messages.filter(m => m.avatar || m.avatarUrl || m.senderAvatar).length;
      const hasNickname = result.messages.filter(m => m.nickname || m.senderNickname || m.userName || m.name).length;

      console.log(`\n包含用户信息的消息: ${hasUser}/${result.messages.length} ${hasUser > 0 ? '✅' : '❌'}`);
      console.log(`包含头像的消息: ${hasAvatar}/${result.messages.length} ${hasAvatar > 0 ? '✅' : '❌'}`);
      console.log(`包含昵称的消息: ${hasNickname}/${result.messages.length} ${hasNickname > 0 ? '✅' : '❌'}`);

      // 导出完整数据
      const fs = require('fs');
      fs.writeFileSync(
        path.join(__dirname, 'message-properties-result.json'),
        JSON.stringify(result, null, 2)
      );
      console.log(`\n📁 完整数据已保存到: tests/message-properties-result.json`);
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n\n⏳ 保持浏览器打开 30 秒，请手动查看...');
    await page.waitForTimeout(30000);

    console.log('🔒 关闭浏览器...');
    await context.close();
    db.close();
  }
}

checkMessagePropertiesViaMCP();
