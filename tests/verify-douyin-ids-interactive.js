/**
 * 抖音私信ID验证工具（交互式�? * 使用 Playwright 启动一个可控的浏览�? */

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
console.log('抖音私信ID验证工具（交互式�?);
console.log('='.repeat(80) + '\n');

async function main() {
  let context;

  try {
    console.log('【步�?1】启动浏览器（使用已有用户数据）...\n');
    console.log('  用户数据目录:', USER_DATA_DIR);

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

    // 导航到私信页�?    console.log('【步�?2】导航到私信页面...\n');
    const dmUrl = 'https://www.douyin.com/falcon/webcast_openpc/pages/im/index.html';

    try {
      await page.goto(dmUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log('  �?页面加载完成\n');
    } catch (error) {
      console.log('  ⚠️ 页面加载超时，继续执�?..\n');
    }

    // 等待页面渲染
    await page.waitForTimeout(5000);

    console.log('【步�?3】分析页面结�?..\n');

    // 查找所有可能的会话容器
    const pageAnalysis = await page.evaluate(() => {
      const results = {
        possibleConversationContainers: [],
        possibleMessageContainers: [],
        reactFiberFound: false,
        totalElements: 0,
      };

      // 查找所有可能包含会话的元素
      const allDivs = document.querySelectorAll('div');
      results.totalElements = allDivs.length;

      allDivs.forEach((div, index) => {
        // 检查是否有 React Fiber
        const fiberKey = Object.keys(div).find(key => key.startsWith('__reactFiber$'));
        if (fiberKey) {
          results.reactFiberFound = true;

          const fiber = div[fiberKey];
          const props = fiber?.memoizedProps;

          // 查找包含用户信息的props
          if (props) {
            if (props.user_id || props.userId || props.user?.user_id || props.user?.nickname) {
              results.possibleConversationContainers.push({
                index,
                className: div.className,
                user_id: props.user_id || props.userId || props.user?.user_id,
                nickname: props.user?.nickname || props.nickname,
                conversation_id: props.conversation_id || props.conversationId,
              });
            }

            // 查找包含消息信息的props
            if (props.serverId || props.messageId || props.content) {
              results.possibleMessageContainers.push({
                index,
                className: div.className,
                serverId: props.serverId,
                messageId: props.messageId,
                conversationId: props.conversationId,
                content: props.content?.substring(0, 30),
              });
            }
          }
        }
      });

      return results;
    });

    console.log('  页面分析结果:');
    console.log(`    总元素数: ${pageAnalysis.totalElements}`);
    console.log(`    React Fiber: ${pageAnalysis.reactFiberFound ? '�?找到' : '�?未找�?}`);
    console.log(`    可能的会话容�? ${pageAnalysis.possibleConversationContainers.length} 个`);
    console.log(`    可能的消息容�? ${pageAnalysis.possibleMessageContainers.length} 个`);
    console.log('');

    // 如果找到会话容器
    if (pageAnalysis.possibleConversationContainers.length > 0) {
      console.log('【步�?4】提取会话数�?..\n');

      const conversations = pageAnalysis.possibleConversationContainers;
      console.log(`  找到 ${conversations.length} 个会�?\n`);

      const idFormats = {
        base64: 0,
        numeric: 0,
        other: 0,
      };

      conversations.slice(0, 10).forEach((conv, idx) => {
        const userId = conv.user_id;
        let format = 'other';

        if (userId) {
          if (userId.startsWith('MS4wLjABAAAA')) {
            format = 'Base64长ID';
            idFormats.base64++;
          } else if (/^\d+$/.test(userId)) {
            format = '纯数字ID';
            idFormats.numeric++;
          } else {
            idFormats.other++;
          }
        }

        console.log(`    ${idx + 1}. ${conv.nickname || '未知'}`);
        console.log(`       user_id: ${userId || '(�?'}`);
        console.log(`       conversation_id: ${conv.conversation_id || '(�?'}`);
        console.log(`       ID格式: ${format}`);
        console.log('');
      });

      console.log('  ID格式统计:');
      console.log(`    Base64长ID (MS4wLjABAAAA...): ${idFormats.base64}`);
      console.log(`    纯数字ID: ${idFormats.numeric}`);
      console.log(`    其他格式: ${idFormats.other}`);
      console.log('');
    }

    // 如果找到消息容器
    if (pageAnalysis.possibleMessageContainers.length > 0) {
      console.log('【步�?5】提取消息数�?..\n');

      const messages = pageAnalysis.possibleMessageContainers;
      console.log(`  找到 ${messages.length} 条消�?\n`);

      const idFormats = {
        base64: 0,
        numeric: 0,
        other: 0,
        missing: 0,
      };

      messages.slice(0, 10).forEach((msg, idx) => {
        const convId = msg.conversationId;
        let format = 'other';

        if (!convId) {
          format = '(缺少)';
          idFormats.missing++;
        } else if (convId.startsWith('MS4wLjABAAAA')) {
          format = 'Base64长ID';
          idFormats.base64++;
        } else if (/^\d+$/.test(convId)) {
          format = '纯数字ID';
          idFormats.numeric++;
        } else {
          idFormats.other++;
        }

        console.log(`    ${idx + 1}. 消息`);
        console.log(`       messageId: ${msg.serverId || msg.messageId || '(�?'}`);
        console.log(`       conversationId: ${convId || '(�?'}`);
        console.log(`       ID格式: ${format}`);
        console.log(`       内容: ${msg.content || '(�?'}...`);
        console.log('');
      });

      console.log('  conversation_id格式统计:');
      console.log(`    Base64长ID (MS4wLjABAAAA...): ${idFormats.base64}`);
      console.log(`    纯数字ID: ${idFormats.numeric}`);
      console.log(`    缺少conversation_id: ${idFormats.missing}`);
      console.log(`    其他格式: ${idFormats.other}`);
      console.log('');
    }

    // 如果都没找到，打印诊断信�?    if (pageAnalysis.possibleConversationContainers.length === 0 && pageAnalysis.possibleMessageContainers.length === 0) {
      console.log('⚠️ 未找到会话或消息数据！\n');
      console.log('可能的原�?');
      console.log('  1. 页面尚未加载完成');
      console.log('  2. 需要手动登�?);
      console.log('  3. 页面结构已改�?);
      console.log('');
      console.log('建议：请在浏览器中手动导航到私信页面，然后刷新此脚本\n');
    }

    // 保存完整数据到JSON
    console.log('【步�?6】保存原始数�?..\n');

    const fs = require('fs');
    const outputPath = path.join(__dirname, 'douyin-id-analysis.json');

    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      conversations: pageAnalysis.possibleConversationContainers,
      messages: pageAnalysis.possibleMessageContainers,
      stats: {
        totalConversations: pageAnalysis.possibleConversationContainers.length,
        totalMessages: pageAnalysis.possibleMessageContainers.length,
        reactFiberFound: pageAnalysis.reactFiberFound,
      }
    }, null, 2));

    console.log(`  �?数据已保存到: ${outputPath}\n`);

    console.log('='.repeat(80));
    console.log('验证完成！浏览器保持打开状态，方便你手动检查�?);
    console.log('�?Ctrl+C 关闭浏览�?);
    console.log('='.repeat(80) + '\n');

    // 保持浏览器打开
    await new Promise(() => {});

  } catch (error) {
    console.error('\n�?错误:', error.message);
    console.error(error.stack);
  } finally {
    // 不自动关闭，让用户手动关�?  }
}

main().catch(console.error);
