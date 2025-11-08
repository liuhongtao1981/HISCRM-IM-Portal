/**
 * 验证抖音私信页面的原始ID数据
 * 使用 Playwright 连接到正在运行的浏览器实�? */

const { chromium } = require('playwright');
const path = require('path');

const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const WORKER_ID = 'worker-1';

// 浏览器用户数据目�?const USER_DATA_DIR = path.join(
  __dirname,
  '../packages/worker/data/browser',
  WORKER_ID,
  `browser_${ACCOUNT_ID}`
);

console.log('\n' + '='.repeat(80));
console.log('验证抖音私信页面的原始ID数据');
console.log('='.repeat(80) + '\n');

async function main() {
  let browser;
  let context;
  let page;

  try {
    console.log('【步�?1】启动浏览器...\n');
    console.log('  用户数据目录:', USER_DATA_DIR);

    // 启动浏览器上下文
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });

    page = context.pages()[0] || await context.newPage();

    console.log('  �?浏览器已启动\n');

    // 导航到私信页�?    console.log('【步�?2】导航到私信页面...\n');
    const dmUrl = 'https://www.douyin.com/falcon/webcast_openpc/pages/im/index.html';

    await page.goto(dmUrl, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('  �?页面加载完成\n');

    // 等待会话列表加载
    console.log('【步�?3】等待会话列表加�?..\n');
    await page.waitForTimeout(3000);

    // 提取会话列表的原始数�?    console.log('【步�?4】提取会话列表数据（从API响应�?..\n');

    const conversationApiData = await page.evaluate(() => {
      // 查找所有会话列表项�?React Fiber
      const conversationElements = document.querySelectorAll('.conversation-item, [class*="conversation"], [class*="user-item"]');
      const conversations = [];

      conversationElements.forEach(el => {
        const fiberKey = Object.keys(el).find(key => key.startsWith('__reactFiber$'));
        if (!fiberKey) return;

        const fiber = el[fiberKey];
        let current = fiber;
        let depth = 0;

        // 向上遍历查找包含 user_id 的数�?        while (current && depth < 15) {
          const props = current.memoizedProps;
          const state = current.memoizedState;

          if (props) {
            // 查找 user_id �?conversation_id
            if (props.user_id || props.userId || props.user?.user_id) {
              conversations.push({
                user_id: props.user_id || props.userId || props.user?.user_id,
                conversation_id: props.conversation_id || props.conversationId,
                nickname: props.nickname || props.user?.nickname || props.userName,
                source: 'React Fiber Props',
                raw: {
                  user_id: props.user_id,
                  userId: props.userId,
                  conversation_id: props.conversation_id,
                  conversationId: props.conversationId,
                }
              });
              break;
            }
          }

          current = current.return;
          depth++;
        }
      });

      return conversations;
    });

    console.log('  找到会话�?', conversationApiData.length);
    if (conversationApiData.length > 0) {
      console.log('\n  会话列表�?�?\n');
      conversationApiData.slice(0, 5).forEach((conv, idx) => {
        console.log(`    ${idx + 1}. ${conv.nickname || '未知'}`);
        console.log(`       user_id: ${conv.user_id}`);
        console.log(`       conversation_id: ${conv.conversation_id || '(�?'}`);
        console.log(`       ID格式: ${conv.user_id?.startsWith('MS4wLjABAAAA') ? 'Base64长ID' : '纯数字ID'}`);
        console.log('');
      });
    }

    // 点击第一个会话，查看消息
    console.log('【步�?5】点击第一个会话，查看消息...\n');

    const firstConversation = await page.$('.conversation-item, [class*="conversation-item"], [class*="user-item"]');
    if (firstConversation) {
      await firstConversation.click();
      await page.waitForTimeout(2000);

      console.log('  �?已点击会话\n');

      // 提取消息数据
      console.log('【步�?6】提取消息数据（从DOM�?..\n');

      const messageData = await page.evaluate(() => {
        // 查找消息容器
        const messageContainers = document.querySelectorAll('.box-content-jSgLQF, [class*="message"], [class*="chat-item"]');
        const messages = [];

        messageContainers.forEach(el => {
          const fiberKey = Object.keys(el).find(key => key.startsWith('__reactFiber$'));
          if (!fiberKey) return;

          const fiber = el[fiberKey];
          let current = fiber;
          let depth = 0;

          // 向上遍历查找包含 conversation_id 的数�?          while (current && depth < 10) {
            const props = current.memoizedProps;

            if (props && props.serverId) {
              messages.push({
                message_id: props.serverId,
                conversation_id: props.conversationId,
                sender_id: props.sender?.userId || props.sender?.user_id,
                sender_name: props.sender?.nickname,
                content: props.content?.substring(0, 50),
                source: 'React Fiber Props',
                raw: {
                  conversationId: props.conversationId,
                  senderId: props.sender?.userId,
                  serverId: props.serverId,
                }
              });
              break;
            }

            current = current.return;
            depth++;
          }
        });

        return messages;
      });

      console.log('  找到消息�?', messageData.length);
      if (messageData.length > 0) {
        console.log('\n  消息列表�?�?\n');
        messageData.slice(0, 5).forEach((msg, idx) => {
          console.log(`    ${idx + 1}. ${msg.sender_name || '未知'}`);
          console.log(`       message_id: ${msg.message_id}`);
          console.log(`       conversation_id: ${msg.conversation_id}`);
          console.log(`       sender_id: ${msg.sender_id}`);
          console.log(`       ID格式: ${msg.conversation_id?.startsWith('MS4wLjABAAAA') ? 'Base64长ID' : '纯数字ID'}`);
          console.log(`       内容: ${msg.content}...`);
          console.log('');
        });
      }

      // 分析ID格式分布
      console.log('【步�?7】分析ID格式分布...\n');

      const conversationIdFormats = {
        base64: conversationApiData.filter(c => c.user_id?.startsWith('MS4wLjABAAAA')).length,
        numeric: conversationApiData.filter(c => c.user_id && /^\d+$/.test(c.user_id)).length,
        other: conversationApiData.filter(c => c.user_id && !c.user_id.startsWith('MS4wLjABAAAA') && !/^\d+$/.test(c.user_id)).length,
      };

      const messageConvIdFormats = {
        base64: messageData.filter(m => m.conversation_id?.startsWith('MS4wLjABAAAA')).length,
        numeric: messageData.filter(m => m.conversation_id && /^\d+$/.test(m.conversation_id)).length,
        other: messageData.filter(m => m.conversation_id && !m.conversation_id.startsWith('MS4wLjABAAAA') && !/^\d+$/.test(m.conversation_id)).length,
      };

      console.log('  会话列表中的user_id格式:');
      console.log(`    Base64长ID (MS4wLjABAAAA...): ${conversationIdFormats.base64}`);
      console.log(`    纯数字ID: ${conversationIdFormats.numeric}`);
      console.log(`    其他格式: ${conversationIdFormats.other}`);
      console.log('');

      console.log('  消息中的conversation_id格式:');
      console.log(`    Base64长ID (MS4wLjABAAAA...): ${messageConvIdFormats.base64}`);
      console.log(`    纯数字ID: ${messageConvIdFormats.numeric}`);
      console.log(`    其他格式: ${messageConvIdFormats.other}`);
      console.log('');

      // 验证是否所有会话都有user_id
      console.log('【步�?8】验证数据完整�?..\n');

      const missingUserId = conversationApiData.filter(c => !c.user_id);
      const missingConvId = messageData.filter(m => !m.conversation_id);

      if (missingUserId.length > 0) {
        console.log(`  ⚠️ ${missingUserId.length} 个会话缺少user_id`);
      } else {
        console.log('  �?所有会话都有user_id');
      }

      if (missingConvId.length > 0) {
        console.log(`  ⚠️ ${missingConvId.length} 条消息缺少conversation_id`);
      } else {
        console.log('  �?所有消息都有conversation_id');
      }

      console.log('');

      // 尝试匹配会话和消�?      console.log('【步�?9】尝试匹配会话和消息...\n');

      let matchedCount = 0;
      let unmatchedMessages = [];

      messageData.forEach(msg => {
        const matchedConv = conversationApiData.find(conv =>
          conv.user_id === msg.conversation_id ||
          conv.conversation_id === msg.conversation_id
        );

        if (matchedConv) {
          matchedCount++;
        } else {
          unmatchedMessages.push(msg);
        }
      });

      console.log(`  成功匹配: ${matchedCount} / ${messageData.length} 条消息`);
      console.log(`  无法匹配: ${unmatchedMessages.length} 条消息`);

      if (unmatchedMessages.length > 0) {
        console.log('\n  无法匹配的消息（�?条）:\n');
        unmatchedMessages.slice(0, 3).forEach((msg, idx) => {
          console.log(`    ${idx + 1}. ${msg.sender_name || '未知'}`);
          console.log(`       conversation_id: ${msg.conversation_id}`);
          console.log(`       原因: 会话列表中没有对应的user_id或conversation_id`);
          console.log('');
        });
      }
    } else {
      console.log('  �?未找到会话列表项');
    }

    console.log('='.repeat(80));
    console.log('验证完成！按任意键关闭浏览器...');
    console.log('='.repeat(80) + '\n');

    // 等待用户输入
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

  } catch (error) {
    console.error('\n�?错误:', error.message);
    console.error(error.stack);
  } finally {
    if (context) {
      await context.close();
      console.log('\n�?浏览器已关闭');
    }
  }
}

main().catch(console.error);
