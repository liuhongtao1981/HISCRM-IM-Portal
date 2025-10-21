/**
 * 简化版 - 直接在 MCP 中测试的消息提取代码
 * 这个脚本提取核心的提取逻辑，用于快速验证
 */

// 模拟 page.evaluate 的测试函数
function testExtractMessages() {
  const messages = [];

  // 第 1 步: 尝试多种选择器找到消息元素
  let messageElements = [];

  const selectors = [
    '[class*="message"]',      // 包含 "message" 的 class
    '[class*="item-message"]', // 特定的项目消息
    '[class*="chat-item"]',    // 聊天项目
    '[role="listitem"]'        // 备选: 按 role 查找
  ];

  console.log('[测试] 开始查找消息元素...');

  for (const selector of selectors) {
    messageElements = document.querySelectorAll(selector);
    if (messageElements.length > 0) {
      console.log(`[测试] ✅ 使用选择器 "${selector}" 找到 ${messageElements.length} 条消息`);
      break;
    }
  }

  if (messageElements.length === 0) {
    console.log('[测试] ❌ 没有找到任何消息元素');
    return messages;
  }

  // 第 2 步: 从每个元素提取消息
  console.log(`[测试] 开始从 ${messageElements.length} 个元素中提取数据...`);

  let messageIndex = 0;
  messageElements.forEach((element, index) => {
    try {
      const content = element.textContent || '';

      // 跳过空元素或太短的
      if (content.trim().length < 2) {
        console.log(`[测试] 跳过元素 ${index}: 内容过短 (${content.length} 字)`);
        return;
      }

      // 提取时间戳
      const timeMatch = content.match(/(\d{1,2}:\d{2}|\d{1,2}-\d{2}|\d{4}-\d{1,2}-\d{1,2})/);
      const time = timeMatch ? timeMatch[0] : '';

      // 提取消息内容
      let text = content.replace(time || '', '').trim();
      text = text.replace(/已读|置顶|删除/g, '').trim();

      // 检测消息方向
      const className = element?.className || '';
      const direction = className.includes('box-item') ? 'outbound' :
                       className.includes('text-item') ? 'inbound' : 'unknown';

      // 计算内容哈希
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
      }
      const contentHash = Math.abs(hash).toString(36);

      if (text && text.length > 0) {
        messages.push({
          index: messageIndex++,
          timestamp: time,
          content: text.substring(0, 300),
          direction,
          hash: contentHash,
          className: className.substring(0, 60)
        });

        console.log(`[测试] ✅ 消息 ${messageIndex}: [${direction}] ${time || 'N/A'} - "${text.substring(0, 50)}..."`);
      }
    } catch (error) {
      console.error(`[测试] ❌ 解析元素 ${index} 失败:`, error.message);
    }
  });

  console.log(`\n[测试] 完成！共提取 ${messageIndex} 条消息\n`);

  return {
    messagesFound: messages.length,
    messages,
    summary: {
      total: messages.length,
      inbound: messages.filter(m => m.direction === 'inbound').length,
      outbound: messages.filter(m => m.direction === 'outbound').length,
      unknown: messages.filter(m => m.direction === 'unknown').length
    }
  };
}

// 测试打开会话的逻辑
function testOpenConversation(conversationIndex = 0) {
  console.log(`\n[打开会话] 尝试打开会话 ${conversationIndex}...`);

  // 第 1 步: 获取所有会话元素
  const allConversations = document.querySelectorAll('[role="list-item"]');
  console.log(`[打开会话] 找到 ${allConversations.length} 个会话元素`);

  if (conversationIndex < 0 || conversationIndex >= allConversations.length) {
    console.log(`[打开会话] ❌ 索引 ${conversationIndex} 无效`);
    return { success: false };
  }

  // 第 2 步: 获取目标元素
  const element = allConversations[conversationIndex];
  console.log(`[打开会话] 目标元素 HTML:`, element.outerHTML.substring(0, 200));
  console.log(`[打开会话] 目标元素文本:`, element.textContent.substring(0, 100));

  // 第 3 步: 模拟点击效果
  console.log(`[打开会话] ✅ 应该点击元素...`);

  // 验证能否找到消息
  setTimeout(() => {
    const messageElements = document.querySelectorAll('[class*="message"]');
    console.log(`[打开会话] 打开后找到 ${messageElements.length} 个消息元素`);
  }, 1500);

  return {
    success: true,
    elementIndex: conversationIndex,
    elementText: element.textContent.substring(0, 150)
  };
}

console.log('✅ 消息提取测试脚本已加载');
console.log('在浏览器控制台运行: testExtractMessages() - 提取当前页面的消息');
console.log('在浏览器控制台运行: testOpenConversation(0) - 测试打开第一个会话');
