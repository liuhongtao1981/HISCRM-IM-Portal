/**
 * 实时调试消息提取问题
 *
 * 直接连接到正在运行的浏览器，执行消息提取逻辑，并捕获所有日�? */

const { chromium } = require('playwright');

async function debugMessageExtraction() {
  console.log('================================');
  console.log('实时调试消息提取');
  console.log('================================\n');

  // 连接到已有的浏览器（需�?Worker 正在运行�?  let browser, context, page;

  try {
    // 方法1: 通过 CDP 连接
    const cdpUrl = 'http://localhost:9222'; // Worker �?DevTools 端口
    console.log(`尝试连接到浏览器: ${cdpUrl}`);

    browser = await chromium.connectOverCDP(cdpUrl).catch(err => {
      console.log(`CDP 连接失败: ${err.message}`);
      return null;
    });

    if (!browser) {
      console.log('\n�?无法连接到浏览器');
      console.log('请确�?Worker 正在运行，并且开启了调试端口');
      console.log('环境变量: DEBUG=true, DEBUG_PORT=9222');
      return;
    }

    console.log('�?已连接到浏览器\n');

    // 获取当前页面
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      console.log('�?没有找到浏览器上下文');
      return;
    }

    context = contexts[0];
    const pages = context.pages();

    if (pages.length === 0) {
      console.log('�?没有打开的页�?);
      return;
    }

    page = pages[0];
    console.log(`�?当前页面: ${await page.title()}`);
    console.log(`   URL: ${page.url()}\n`);

    // 监听浏览器控制台
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[浏览�?${type}] ${text}`);
    });

    // 执行消息提取逻辑
    console.log('开始执行消息提�?..\n');

    const result = await page.evaluate(() => {
      const logs = [];
      const messages = [];

      // 查找消息容器
      const messageContainer = document.querySelector('.box-content-jSgLQF');
      logs.push(`messageContainer: ${!!messageContainer}`);

      if (!messageContainer) {
        return { messages: [], logs: logs, error: '未找到消息容�? };
      }

      const innerContainer = messageContainer.children[0];
      logs.push(`innerContainer: ${!!innerContainer}`);

      if (!innerContainer) {
        return { messages: [], logs: logs, error: '容器没有子元�? };
      }

      const allElements = Array.from(innerContainer.children);
      logs.push(`找到 ${allElements.length} 个元素`);

      console.log(`🔍 找到 ${allElements.length} 个元素`); // �?这个会被 page.on('console') 捕获

      // 遍历元素
      let fiberCount = 0;
      let propsCount = 0;

      allElements.forEach((element, index) => {
        const fiberKey = Object.keys(element).find(key => key.startsWith('__react'));

        if (fiberKey) {
          fiberCount++;

          // 简化的 Fiber 搜索
          function findProps(fiber, depth = 0) {
            if (!fiber || depth > 10) return null;

            if (fiber.memoizedProps) {
              const props = fiber.memoizedProps;

              // 检查条�?              if (props.serverId && props.content && props.sender && props.conversationId) {
                return props;
              }
            }

            if (fiber.child) {
              const result = findProps(fiber.child, depth + 1);
              if (result) return result;
            }

            return null;
          }

          const props = findProps(element[fiberKey]);

          if (props) {
            propsCount++;

            console.log(`�?[${index}] 找到 props:`, {
              serverId: props.serverId,
              hasSender: !!props.sender,
              senderType: typeof props.sender,
              senderValue: JSON.stringify(props.sender).substring(0, 50),
              hasContent: !!props.content,
              contentType: typeof props.content,
              contentKeys: Object.keys(props.content || {}),
              hasConversationId: !!props.conversationId
            });

            // 提取消息内容
            const msgContent = props.content || {};
            const textContent = msgContent.text || props.text || '';

            console.log(`   textContent: "${textContent}" (length: ${textContent.length})`);
            console.log(`   条件检�? textContent || serverId = ${!!(textContent || props.serverId)}`);

            // 添加消息条件
            if (textContent || props.serverId) {
              console.log(`   �?满足添加条件，准备添加消息`);

              messages.push({
                platform_message_id: props.serverId,
                content: textContent,
                direction: props.isFromMe ? 'outbound' : 'inbound',
                sender: props.sender,
                conversationId: props.conversationId
              });

              console.log(`   �?已添加消息，当前总数: ${messages.length}`);
            } else {
              console.warn(`   �?不满足添加条件`);
            }
          }
        }
      });

      logs.push(`fiberCount: ${fiberCount}, propsCount: ${propsCount}, messages: ${messages.length}`);
      console.log(`📊 统计: fiber=${fiberCount}, props=${propsCount}, messages=${messages.length}`);

      return {
        messages: messages,
        logs: logs,
        stats: {
          elements: allElements.length,
          fiberCount: fiberCount,
          propsCount: propsCount,
          messagesCount: messages.length
        }
      };
    });

    // 输出结果
    console.log('\n================================');
    console.log('执行结果:');
    console.log('================================');
    console.log('日志:', result.logs);
    console.log('统计:', result.stats);
    console.log('消息数量:', result.messages.length);

    if (result.error) {
      console.log('错误:', result.error);
    }

    if (result.messages.length > 0) {
      console.log('\n提取到的消息:');
      result.messages.forEach((msg, i) => {
        console.log(`  [${i+1}] ${msg.platform_message_id}: "${msg.content.substring(0, 50)}"`);
      });
    } else {
      console.log('\n�?没有提取到任何消�?);
    }

  } catch (error) {
    console.error('\n执行失败:', error.message);
    console.error(error.stack);
  } finally {
    // 不要关闭浏览器（它是 Worker 的浏览器�?    console.log('\n调试完成');
  }
}

// 运行
debugMessageExtraction().catch(console.error);
