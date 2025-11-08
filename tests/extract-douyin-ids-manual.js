/**
 * 手动提取抖音私信ID（等待用户手动操作后提取�? */

const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

const ACCOUNT_ID = 'acc-98296c87-2e42-447a-9d8b-8be008ddb6e4';
const WORKER_ID = 'worker-1';

const USER_DATA_DIR = path.join(
  __dirname,
  '../packages/worker/data/browser',
  WORKER_ID,
  `browser_${ACCOUNT_ID}`
);

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askUser(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

console.log('\n' + '='.repeat(80));
console.log('抖音私信ID手动提取工具');
console.log('='.repeat(80) + '\n');

async function main() {
  let context;

  try {
    console.log('【步�?1】启动浏览器...\n');

    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      viewport: { width: 1400, height: 900 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });

    const page = context.pages()[0] || await context.newPage();
    console.log('  �?浏览器已启动\n');

    console.log('【步�?2】导航到私信页面...\n');
    const dmUrl = 'https://www.douyin.com/falcon/webcast_openpc/pages/im/index.html';

    await page.goto(dmUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('  �?页面已导航\n');

    console.log('='.repeat(80));
    console.log('请在浏览器中完成以下操作�?);
    console.log('  1. 确保已经登录');
    console.log('  2. 确保私信列表已加�?);
    console.log('  3. 点击任意一个会话，查看消息');
    console.log('  4. 等待消息加载完成');
    console.log('='.repeat(80) + '\n');

    await askUser('完成上述操作后，按回车键继续...');

    console.log('\n【步�?3】开始提取数�?..\n');

    // 提取完整的页面数�?    const extractedData = await page.evaluate(() => {
      const results = {
        conversations: [],
        messages: [],
        rawHtml: {
          conversationListClass: [],
          messageListClass: [],
        }
      };

      // 查找所有包�?React Fiber 的元�?      const allElements = document.querySelectorAll('*');

      allElements.forEach((el, index) => {
        const fiberKey = Object.keys(el).find(key => key.startsWith('__reactFiber$'));
        if (!fiberKey) return;

        const fiber = el[fiberKey];
        let current = fiber;
        let depth = 0;

        // 向上遍历查找数据
        while (current && depth < 20) {
          const props = current.memoizedProps;

          if (props) {
            // 会话数据特征
            if (props.user_id || props.userId ||
                (props.user && (props.user.user_id || props.user.nickname))) {

              const convData = {
                user_id: props.user_id || props.userId || props.user?.user_id,
                conversation_id: props.conversation_id || props.conversationId,
                nickname: props.nickname || props.user?.nickname,
                avatar: props.avatar || props.user?.avatar_thumb?.url_list?.[0],
                className: el.className,
              };

              // 避免重复
              const exists = results.conversations.find(c =>
                c.user_id === convData.user_id && c.nickname === convData.nickname
              );

              if (!exists && convData.user_id) {
                results.conversations.push(convData);
                if (!results.rawHtml.conversationListClass.includes(el.className)) {
                  results.rawHtml.conversationListClass.push(el.className);
                }
              }
            }

            // 消息数据特征
            if (props.serverId || props.messageId ||
                (props.content && props.conversationId)) {

              const msgData = {
                message_id: props.serverId || props.messageId,
                conversation_id: props.conversationId,
                sender_id: props.sender?.userId || props.sender?.user_id,
                sender_name: props.sender?.nickname,
                content: props.content?.substring(0, 100),
                direction: props.direction,
                className: el.className,
              };

              // 避免重复
              const exists = results.messages.find(m =>
                m.message_id === msgData.message_id
              );

              if (!exists && msgData.message_id) {
                results.messages.push(msgData);
                if (!results.rawHtml.messageListClass.includes(el.className)) {
                  results.rawHtml.messageListClass.push(el.className);
                }
              }
            }
          }

          current = current.return;
          depth++;
        }
      });

      return results;
    });

    console.log('  �?数据提取完成\n');

    // 分析结果
    console.log('【步�?4】分析提取的数据...\n');

    console.log(`  会话总数: ${extractedData.conversations.length}`);
    console.log(`  消息总数: ${extractedData.messages.length}`);
    console.log('');

    if (extractedData.conversations.length > 0) {
      console.log('  会话ID格式统计:');

      const convIdFormats = {
        base64: extractedData.conversations.filter(c => c.user_id?.startsWith('MS4wLjABAAAA')).length,
        numeric: extractedData.conversations.filter(c => c.user_id && /^\d+$/.test(c.user_id)).length,
        other: extractedData.conversations.filter(c => c.user_id && !c.user_id.startsWith('MS4wLjABAAAA') && !/^\d+$/.test(c.user_id)).length,
      };

      console.log(`    Base64长ID (MS4wLjABAAAA...): ${convIdFormats.base64}`);
      console.log(`    纯数字ID: ${convIdFormats.numeric}`);
      console.log(`    其他格式: ${convIdFormats.other}`);
      console.log('');

      console.log('  会话列表（前10个）:\n');
      extractedData.conversations.slice(0, 10).forEach((conv, idx) => {
        const format = conv.user_id?.startsWith('MS4wLjABAAAA') ? 'Base64长ID' :
                      /^\d+$/.test(conv.user_id) ? '纯数字ID' : '其他';
        console.log(`    ${idx + 1}. ${conv.nickname || '未知'}`);
        console.log(`       user_id: ${conv.user_id}`);
        console.log(`       conversation_id: ${conv.conversation_id || '(�?'}`);
        console.log(`       ID格式: ${format}`);
        console.log('');
      });
    }

    if (extractedData.messages.length > 0) {
      console.log('  消息conversation_id格式统计:');

      const msgIdFormats = {
        base64: extractedData.messages.filter(m => m.conversation_id?.startsWith('MS4wLjABAAAA')).length,
        numeric: extractedData.messages.filter(m => m.conversation_id && /^\d+$/.test(m.conversation_id)).length,
        missing: extractedData.messages.filter(m => !m.conversation_id).length,
        other: extractedData.messages.filter(m => m.conversation_id && !m.conversation_id.startsWith('MS4wLjABAAAA') && !/^\d+$/.test(m.conversation_id)).length,
      };

      console.log(`    Base64长ID (MS4wLjABAAAA...): ${msgIdFormats.base64}`);
      console.log(`    纯数字ID: ${msgIdFormats.numeric}`);
      console.log(`    缺少conversation_id: ${msgIdFormats.missing}`);
      console.log(`    其他格式: ${msgIdFormats.other}`);
      console.log('');

      console.log('  消息列表（前10条）:\n');
      extractedData.messages.slice(0, 10).forEach((msg, idx) => {
        const format = msg.conversation_id?.startsWith('MS4wLjABAAAA') ? 'Base64长ID' :
                      msg.conversation_id && /^\d+$/.test(msg.conversation_id) ? '纯数字ID' :
                      !msg.conversation_id ? '(缺少)' : '其他';
        console.log(`    ${idx + 1}. ${msg.sender_name || '未知'}`);
        console.log(`       message_id: ${msg.message_id}`);
        console.log(`       conversation_id: ${msg.conversation_id || '(�?'}`);
        console.log(`       ID格式: ${format}`);
        console.log(`       内容: ${msg.content}...`);
        console.log('');
      });
    }

    // 匹配分析
    if (extractedData.conversations.length > 0 && extractedData.messages.length > 0) {
      console.log('【步�?5】匹配分�?..\n');

      let matched = 0;
      let unmatched = [];

      extractedData.messages.forEach(msg => {
        const matchedConv = extractedData.conversations.find(conv =>
          conv.user_id === msg.conversation_id ||
          conv.conversation_id === msg.conversation_id
        );

        if (matchedConv) {
          matched++;
        } else {
          unmatched.push(msg);
        }
      });

      console.log(`  成功匹配: ${matched} / ${extractedData.messages.length} 条消息`);
      console.log(`  无法匹配: ${unmatched.length} 条消息`);
      console.log('');

      if (unmatched.length > 0) {
        console.log('  无法匹配的消息（�?条）:\n');
        unmatched.slice(0, 5).forEach((msg, idx) => {
          console.log(`    ${idx + 1}. conversation_id: ${msg.conversation_id}`);
          console.log(`       发送�? ${msg.sender_name}`);
          console.log(`       内容: ${msg.content}...`);
          console.log('');
        });
      }
    }

    // 保存数据
    console.log('【步�?6】保存数�?..\n');

    const fs = require('fs');
    const outputPath = path.join(__dirname, 'douyin-id-analysis.json');

    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      stats: {
        conversations: extractedData.conversations.length,
        messages: extractedData.messages.length,
      },
      conversations: extractedData.conversations,
      messages: extractedData.messages,
      rawHtml: extractedData.rawHtml,
    }, null, 2));

    console.log(`  �?数据已保存到: ${outputPath}\n`);

    console.log('='.repeat(80));
    console.log('数据提取完成�?);
    console.log('='.repeat(80) + '\n');

    await askUser('按回车键关闭浏览�?..');

    await context.close();
    console.log('\n�?浏览器已关闭');

  } catch (error) {
    console.error('\n�?错误:', error.message);
    console.error(error.stack);
  } finally {
    rl.close();
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

main().catch(console.error);
