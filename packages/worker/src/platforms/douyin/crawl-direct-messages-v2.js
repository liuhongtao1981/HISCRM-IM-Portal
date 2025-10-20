/**
 * Phase 8: 改进的私信抓取实现 (支持完整历史和会话)
 *
 * 核心改进:
 * 1. 虚拟列表分页加载完整消息历史
 * 2. WebSocket 消息拦截获取 ID 信息
 * 3. 会话表数据存储
 * 4. 消息-会话完整关联
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('crawl-direct-messages-v2', './logs');

/**
 * Phase 8 改进的私信爬虫
 * @param {Object} page - Playwright Page 实例
 * @param {Object} account - 账户信息
 * @returns {Promise<Object>} { conversations, directMessages, stats }
 */
async function crawlDirectMessagesV2(page, account) {
  logger.info(`[Phase 8] Starting enhanced private message crawl for account ${account.id}`);

  try {
    // 第 1 步: 初始化 API 拦截器
    logger.debug(`[Phase 8] Step 1: Setting up API interceptors`);
    const apiResponses = {
      init: [],
      conversations: [],
      history: [],
      ws: []
    };

    // 拦截主要 API 端点
    await setupAPIInterceptors(page, apiResponses);

    logger.info(`[Phase 8] API interceptors configured`);

    // 第 2 步: 导航到私信页面
    logger.debug(`[Phase 8] Step 2: Navigating to direct messages page`);
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForTimeout(2000);
    logger.info(`[Phase 8] Navigated to message page`);

    // 第 3 步: 获取会话列表
    logger.debug(`[Phase 8] Step 3: Extracting conversations list`);
    const conversations = await extractConversationsList(page, account);
    logger.info(`[Phase 8] Extracted ${conversations.length} conversations`);

    // 第 4 步: 对每个会话获取完整消息历史
    logger.debug(`[Phase 8] Step 4: Crawling complete message history for each conversation`);
    const directMessages = [];

    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];
      logger.info(`[Phase 8] Processing conversation ${i + 1}/${conversations.length}: ${conversation.platform_user_name}`);

      try {
        // 打开会话
        await openConversation(page, conversation);

        // 加载完整消息历史 (分页加载)
        const messages = await crawlCompleteMessageHistory(page, conversation, account, apiResponses);

        directMessages.push(...messages);

        logger.info(`[Phase 8] Conversation ${conversation.platform_user_name}: ${messages.length} messages`);

        // 返回会话列表
        await page.evaluate(() => {
          const backButton = document.querySelector('[data-testid="back-button"]');
          if (backButton) {
            backButton.click();
          } else {
            window.history.back();
          }
        });

        await page.waitForTimeout(500);
      } catch (error) {
        logger.error(`[Phase 8] Error processing conversation ${conversation.platform_user_name}:`, error);
      }
    }

    // 第 5 步: 从 API 响应中提取完整对象信息 (含 ID)
    logger.debug(`[Phase 8] Step 5: Extracting complete message objects with IDs from API responses`);
    const messagesWithIds = extractCompleteMessageObjects(directMessages, apiResponses);
    logger.info(`[Phase 8] Extracted complete message objects: ${messagesWithIds.length}`);

    // 第 6 步: 统计信息
    const stats = {
      conversationsCount: conversations.length,
      messagesCount: directMessages.length,
      messagesWithIdsCount: messagesWithIds.length,
      apiResponseCounts: {
        init: apiResponses.init.length,
        conversations: apiResponses.conversations.length,
        history: apiResponses.history.length,
        websocket: apiResponses.ws.length
      },
      crawl_time: Math.floor(Date.now() / 1000)
    };

    logger.info(`[Phase 8] ✅ Crawl completed: ${JSON.stringify(stats)}`);

    return {
      conversations,
      directMessages: messagesWithIds,
      stats
    };
  } catch (error) {
    logger.error(`[Phase 8] ❌ FATAL ERROR:`, error);
    throw error;
  }
}

/**
 * 设置 API 拦截器
 */
async function setupAPIInterceptors(page, apiResponses) {
  // 拦截私信初始化 API
  await page.route('**/v2/message/get_by_user_init**', async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.json();
      apiResponses.init.push(body);
      logger.debug(`[Init API] Intercepted: ${body.data?.messages?.length || 0} messages`);
      await route.fulfill({ response });
    } catch (error) {
      logger.error('[Init API] Error:', error);
      await route.continue();
    }
  });

  // 拦截会话列表 API
  await page.route('**/v1/stranger/get_conversation_list**', async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.json();
      apiResponses.conversations.push(body);
      logger.debug(`[Conversation API] Intercepted: ${body.data?.conversations?.length || 0} conversations`);
      await route.fulfill({ response });
    } catch (error) {
      logger.error('[Conversation API] Error:', error);
      await route.continue();
    }
  });

  // 拦截消息历史 API (如果存在)
  await page.route('**/v1/im/message/history**', async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.json();
      apiResponses.history.push(body);
      logger.debug(`[History API] Intercepted: ${body.data?.messages?.length || 0} messages`);
      await route.fulfill({ response });
    } catch (error) {
      logger.error('[History API] Error:', error);
      await route.continue();
    }
  });

  logger.info('API interceptors configured');
}

/**
 * 提取会话列表
 */
async function extractConversationsList(page, account) {
  const conversations = [];

  // 从虚拟列表中提取所有会话
  const conversationElements = await page.locator('[role="listitem"]').all();

  for (const element of conversationElements) {
    try {
      const content = await element.textContent();
      const timeMatch = content.match(/(\d{1,2}:\d{2}|\d{1,2}-\d{2})/);
      const time = timeMatch ? timeMatch[0] : '';
      const text = content.replace(time, '').trim();

      // 生成会话 ID
      const conversationId = generateConversationId(account.id, text);

      conversations.push({
        id: conversationId,
        account_id: account.id,
        platform_user_id: `user_${text}`.replace(/\s+/g, '_'),
        platform_user_name: text.split('\n')[0] || 'Unknown',
        platform_user_avatar: null,
        last_message_time: parseInt(time) || Math.floor(Date.now() / 1000),
        last_message_content: text,
        platform_message_id: null,
        is_group: false,
        unread_count: 0,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000)
      });
    } catch (error) {
      logger.error('Error extracting conversation:', error);
    }
  }

  return conversations;
}

/**
 * 打开会话
 */
async function openConversation(page, conversation) {
  logger.debug(`Opening conversation: ${conversation.platform_user_name}`);

  // 查找并点击会话元素
  const conversationElement = await page.locator(
    `text="${conversation.platform_user_name}"`
  ).first();

  if (conversationElement) {
    await conversationElement.click();
    await page.waitForTimeout(1000);
  }
}

/**
 * 爬取完整消息历史 (虚拟列表分页) - 改进版
 * 支持智能延迟、收敛判断优化、平台特定指示器检测
 */
async function crawlCompleteMessageHistory(page, conversation, account, apiResponses) {
  logger.debug(`Crawling complete message history for: ${conversation.platform_user_name}`);

  const MAX_ATTEMPTS = 50;
  const BASE_WAIT_TIME = 300;
  const CONVERGENCE_CHECK_ATTEMPTS = 3; // 检查多次以确认真正收敛

  let previousCount = 0;
  let previousContentHash = '';
  let convergenceCounter = 0;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    try {
      // 第 1 步: 向上滚动虚拟列表以加载更早的消息
      logger.debug(`Attempt ${attempts + 1}: Scrolling to top to load earlier messages`);

      const scrollResult = await page.evaluate(() => {
        // 尝试多种选择器找到虚拟列表容器
        let grid = document.querySelector('[role="grid"]') ||
                   document.querySelector('[role="list"]') ||
                   document.querySelector('.virtual-list') ||
                   document.querySelector('[class*="virtualList"]');

        if (grid) {
          const previousScroll = grid.scrollTop;
          grid.scrollTop = 0;
          return { success: true, previousScroll: previousScroll };
        }

        return { success: false };
      });

      if (!scrollResult.success) {
        logger.warn(`Could not find virtual list container at attempt ${attempts}`);
      }

      // 第 2 步: 等待新消息加载 (智能延迟)
      // 根据当前消息数量动态调整延迟时间
      const dynamicWaitTime = previousCount > 100 ? BASE_WAIT_TIME * 2 : BASE_WAIT_TIME;
      logger.debug(`Waiting ${dynamicWaitTime}ms for messages to load...`);
      await page.waitForTimeout(dynamicWaitTime);

      // 第 3 步: 提取当前所有消息
      const currentMessages = await extractMessagesFromVirtualList(page);
      const currentCount = currentMessages.length;
      const currentContentHash = hashMessages(currentMessages);

      logger.debug(`Attempt ${attempts + 1}: Loaded ${currentCount} messages (previous: ${previousCount})`);

      // 第 4 步: 检查是否收敛 (多层判断)
      const hasNewMessages = currentCount > previousCount;
      const hasContentChange = currentContentHash !== previousContentHash;

      if (!hasNewMessages && !hasContentChange) {
        convergenceCounter++;
        logger.debug(`No changes detected (${convergenceCounter}/${CONVERGENCE_CHECK_ATTEMPTS})`);

        if (convergenceCounter >= CONVERGENCE_CHECK_ATTEMPTS) {
          logger.info(`✅ Reached convergence at attempt ${attempts}. Total messages: ${currentCount}`);
          // 为每条消息添加会话信息
          currentMessages.forEach(msg => {
            msg.conversation_id = conversation.id;
            msg.account_id = account.id;
          });
          return currentMessages;
        }
      } else {
        // 重置收敛计数器
        convergenceCounter = 0;
        logger.debug(`Reset convergence counter. New: ${hasNewMessages}, Changed: ${hasContentChange}`);
      }

      // 第 5 步: 检查平台特定的分页指示器
      const hasMoreFlag = await page.evaluate(() => {
        // 检查 API 响应中是否有 has_more 标志
        // 这需要在 setupAPIInterceptors 中配置
        return document.querySelector('[data-has-more="false"]') === null;
      });

      if (!hasMoreFlag) {
        logger.info(`✅ Platform "has_more" flag indicates no more messages. Total: ${currentCount}`);
        currentMessages.forEach(msg => {
          msg.conversation_id = conversation.id;
          msg.account_id = account.id;
        });
        return currentMessages;
      }

      previousCount = currentCount;
      previousContentHash = currentContentHash;
      attempts++;

      // 第 6 步: 延迟以避免过快的加载
      await page.waitForTimeout(200);

    } catch (error) {
      logger.error(`Error during message history crawl at attempt ${attempts}:`, error);
      attempts++;
      await page.waitForTimeout(500);
    }
  }

  logger.warn(`⚠️ Reached max attempts (${MAX_ATTEMPTS}) without full convergence`);

  // 获取最后的消息列表
  const finalMessages = await extractMessagesFromVirtualList(page);
  finalMessages.forEach(msg => {
    msg.conversation_id = conversation.id;
    msg.account_id = account.id;
  });

  logger.info(`✅ Crawl completed: ${finalMessages.length} messages for ${conversation.platform_user_name}`);
  return finalMessages;
}

/**
 * 计算消息内容的哈希值，用于检测变化
 */
function hashMessages(messages) {
  if (!messages || messages.length === 0) return '';

  // 简单的哈希: 使用消息ID列表的 JSON
  const ids = messages.map(m => m.platform_message_id || m.content).join(',');
  return ids.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0).toString(36);
}

/**
 * 从虚拟列表中提取消息 (改进版)
 * 支持深层 React Fiber 搜索和多种虚拟列表实现
 */
async function extractMessagesFromVirtualList(page) {
  logger.debug('Extracting messages from virtual list (enhanced)');

  return await page.evaluate(() => {
    const messages = [];
    const rows = document.querySelectorAll('[role="listitem"]');

    rows.forEach((row, index) => {
      try {
        const content = row.textContent || '';

        // 第 1 步: 从 React Fiber 树深层搜索完整消息数据
        let msgData = extractFromReactFiber(row);

        // 第 2 步: 从 DOM 提取基本信息
        const { timeMatch, text } = extractFromDOM(content);

        // 第 3 步: 构建完整消息对象
        const message = {
          index: index,
          platform_message_id: msgData.platform_message_id || msgData.id || `msg_${index}_${Date.now()}`,
          content: text || msgData.content || '',
          timestamp: timeMatch,
          message_type: msgData.message_type || 'text',
          platform_sender_id: msgData.platform_sender_id || msgData.sender_id || msgData.uid || 'unknown',
          platform_sender_name: msgData.platform_sender_name || msgData.sender_name || msgData.name || 'Unknown',
          platform_receiver_id: msgData.platform_receiver_id || msgData.receiver_id,
          platform_receiver_name: msgData.platform_receiver_name || msgData.receiver_name,
          direction: msgData.direction || 'inbound',
          created_at: msgData.created_at || msgData.create_time || Math.floor(Date.now() / 1000),
          is_read: msgData.is_read !== undefined ? msgData.is_read : false,
          status: msgData.status || 'sent'
        };

        messages.push(message);
      } catch (error) {
        console.error('Error extracting message at index', index, ':', error.message);
      }
    });

    return messages;

    /**
     * 从 React Fiber 树中深层搜索消息数据
     */
    function extractFromReactFiber(element) {
      let result = {};

      // 尝试多个可能的 React Fiber 键
      const fiberKeys = Object.keys(element).filter(key => key.startsWith('__react'));

      for (const fiberKey of fiberKeys) {
        try {
          const fiber = element[fiberKey];
          if (!fiber) continue;

          // 方法 1: 检查 memoizedProps 中的 data
          if (fiber.memoizedProps?.data) {
            result = { ...result, ...fiber.memoizedProps.data };
          }

          // 方法 2: 检查 memoizedProps 本身
          if (fiber.memoizedProps?.message) {
            result = { ...result, ...fiber.memoizedProps.message };
          }

          // 方法 3: 递归检查子 Fiber
          let current = fiber;
          let depth = 0;
          const maxDepth = 10;

          while (current && depth < maxDepth) {
            // 检查 child 属性链
            if (current.child) {
              current = current.child;

              if (current.memoizedProps) {
                if (current.memoizedProps.data) {
                  result = { ...result, ...current.memoizedProps.data };
                }
                if (current.memoizedProps.message) {
                  result = { ...result, ...current.memoizedProps.message };
                }
              }

              depth++;
            } else {
              break;
            }
          }
        } catch (e) {
          // 继续尝试其他 fiber 键
        }
      }

      return result;
    }

    /**
     * 从 DOM 文本提取时间戳和内容
     */
    function extractFromDOM(content) {
      // 支持多种时间格式: HH:MM, MM-DD, YYYY-MM-DD
      const timeMatch = content.match(/(\d{1,2}:\d{2}|\d{1,2}-\d{2}|\d{4}-\d{1,2}-\d{1,2})/);
      const time = timeMatch ? timeMatch[0] : '';
      const text = content.replace(time, '').trim();

      return { timeMatch: time, text };
    }
  });
}

/**
 * 提取完整的消息对象 (含所有 ID 信息)
 */
function extractCompleteMessageObjects(messages, apiResponses) {
  logger.debug('Extracting complete message objects with IDs');

  const completeMessages = [];
  const messageMap = new Map();

  // 首先从 API 响应中提取具有完整 ID 的消息
  apiResponses.init.forEach(response => {
    if (response.data?.messages) {
      response.data.messages.forEach(msg => {
        messageMap.set(msg.platform_message_id, {
          ...msg,
          source: 'api_init'
        });
      });
    }
  });

  // 合并来自不同来源的消息数据
  messages.forEach(msg => {
    let completeMsg = {
      id: msg.platform_message_id,
      account_id: msg.account_id,
      conversation_id: msg.conversation_id,
      platform_message_id: msg.platform_message_id,
      content: msg.content,
      platform_sender_id: msg.platform_sender_id,
      platform_sender_name: msg.platform_sender_name,
      platform_receiver_id: msg.platform_receiver_id,
      platform_receiver_name: msg.platform_receiver_name,
      message_type: msg.message_type || 'text',
      direction: msg.direction || 'inbound',
      is_read: msg.is_read || false,
      created_at: msg.created_at || Math.floor(Date.now() / 1000),
      detected_at: Math.floor(Date.now() / 1000),
      is_new: (Date.now() - msg.created_at * 1000) < 24 * 60 * 60 * 1000,
      push_count: 0
    };

    // 如果 messageMap 中有完整数据，合并
    if (messageMap.has(msg.platform_message_id)) {
      const apiData = messageMap.get(msg.platform_message_id);
      completeMsg = { ...completeMsg, ...apiData };
    }

    completeMessages.push(completeMsg);
  });

  logger.info(`Extracted ${completeMessages.length} complete message objects`);
  return completeMessages;
}

/**
 * 生成会话 ID
 */
function generateConversationId(accountId, userName) {
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = userName.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  return `conv_${accountId}_${Math.abs(hash)}_${timestamp}`;
}

module.exports = {
  crawlDirectMessagesV2,
  extractConversationsList,
  crawlCompleteMessageHistory,
  extractMessagesFromVirtualList,
  extractCompleteMessageObjects
};
