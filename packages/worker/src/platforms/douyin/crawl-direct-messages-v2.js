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
const { DataSource } = require('../base/data-models');

const logger = createLogger('crawl-direct-messages-v2', './logs');

// ==================== 全局状态（用于 API 回调）====================
// 由于 API 回调是全局注册的，需要一个临时存储来关联 accountId 和 dataManager
const globalContext = {
  dataManager: null,  // 当前活动的 DataManager（在 crawl 函数中设置）
  accountId: null,    // 当前账户 ID
};

// 保留 apiData 用于向后兼容和调试
const apiData = {
  init: [],
  conversations: [],
  history: [],
  cache: {
    init: new Set(),
    conversations: new Set(),
    history: new Set()
  }
};

// ==================== 时间戳标准化函数 ====================

/**
 * 将各种格式的时间戳标准化为毫秒级时间戳
 *
 * 支持的输入格式:
 * - 毫秒级时间戳 (13位数字): 1730612345678
 * - 秒级时间戳 (10位数字): 1730612345
 * - ISO 8601 字符串: "2025-11-03T14:30:00.000Z"
 * - Date 对象
 *
 * @param {number|string|Date} timestamp - 原始时间戳
 * @returns {number} 毫秒级时间戳 (13位数字)
 */
function normalizeTimestamp(timestamp) {
  // 处理 null/undefined
  if (!timestamp) {
    return Date.now();
  }

  // 处理 Date 对象
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  // 处理数字
  if (typeof timestamp === 'number') {
    // 判断是秒级 (10位) 还是毫秒级 (13位)
    let timestampInMs;
    if (timestamp < 10000000000) {
      // 秒级时间戳，转换为毫秒
      timestampInMs = timestamp * 1000;
    } else {
      // 毫秒级时间戳，直接使用
      timestampInMs = Math.floor(timestamp);
    }

    // 🔧 时区修正: 抖音API返回的时间戳是UTC+8时区的
    // 需要减去8小时（28800000毫秒）转换为标准UTC时间戳
    const TIMEZONE_OFFSET_MS = 8 * 3600 * 1000; // 8小时 = 28800000毫秒
    return timestampInMs - TIMEZONE_OFFSET_MS;
  }

  // 处理字符串
  if (typeof timestamp === 'string') {
    // 尝试解析为数字
    const num = Number(timestamp);
    if (!isNaN(num)) {
      return normalizeTimestamp(num);
    }

    // 尝试解析为 ISO 8601 日期字符串
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // 无法解析，返回当前时间
  console.warn(`[normalizeTimestamp] Unable to parse timestamp: ${timestamp}, using current time`);
  return Date.now();
}

// ==================== API 回调函数（使用 DataManager）====================

/**
 * API 回调：初始化消息
 * 由 platform.js 注册到 APIInterceptorManager
 */
async function onMessageInitAPI(body) {
  if (!body || !body.data || !body.data.messages) return;

  // ✅ 使用 DataManager（如果可用）
  if (globalContext.dataManager && body.data.messages.length > 0) {
    try {
      const messages = globalContext.dataManager.batchUpsertMessages(
        body.data.messages,
        DataSource.API
      );
      logger.info(`✅ [API] 初始化消息 -> DataManager: ${messages.length} 条`);
    } catch (error) {
      logger.error(`[API] 初始化消息处理失败:`, error);
    }
  }

  // 保留旧逻辑用于调试
  apiData.init.push(body);
  logger.debug(`收集到初始化消息: ${body.data.messages.length} 条`);
}

/**
 * API 回调：会话列表
 * 由 platform.js 注册到 APIInterceptorManager
 * API: /creator/im/user_detail/ 返回 { user_list: [...] }
 */
async function onConversationListAPI(body) {
  if (!body || !body.user_list) return;

  // ✅ 使用 DataManager（如果可用）
  if (globalContext.dataManager && body.user_list.length > 0) {
    try {
      const conversations = globalContext.dataManager.batchUpsertConversations(
        body.user_list,
        DataSource.API
      );
      logger.info(`✅ [API] 会话列表 -> DataManager: ${conversations.length} 个会话`);
    } catch (error) {
      logger.error(`[API] 会话列表处理失败:`, error);
    }
  }

  // 保留旧逻辑用于调试
  apiData.conversations.push(body);
  logger.debug(`收集到会话列表: ${body.user_list.length} 个用户`);
}

/**
 * API 回调：消息历史
 * 由 platform.js 注册到 APIInterceptorManager
 */
async function onMessageHistoryAPI(body) {
  if (!body || !body.data || !body.data.messages) return;

  // ✅ 使用 DataManager（如果可用）
  if (globalContext.dataManager && body.data.messages.length > 0) {
    try {
      const messages = globalContext.dataManager.batchUpsertMessages(
        body.data.messages,
        DataSource.API
      );
      logger.info(`✅ [API] 历史消息 -> DataManager: ${messages.length} 条`);
    } catch (error) {
      logger.error(`[API] 历史消息处理失败:`, error);
    }
  }

  // 保留旧逻辑用于调试
  apiData.history.push(body);
  logger.debug(`收集到历史消息: ${body.data.messages.length} 条`);
}

/**
 * Phase 8 改进的私信爬虫（使用统一数据管理架构）
 * @param {Object} page - Playwright Page 实例
 * @param {Object} account - 账户信息
 * @param {Object} dataManager - DataManager 实例（可选，如果提供则使用新架构）
 * @returns {Promise<Object>} { conversations, directMessages, stats }
 */
async function crawlDirectMessagesV2(page, account, dataManager = null) {
  logger.info(`[Phase 8] Starting enhanced private message crawl for account ${account.id}`);

  // ✅ 设置全局上下文，让 API 回调可以访问 DataManager
  if (dataManager) {
    globalContext.dataManager = dataManager;
    globalContext.accountId = account.id;
    logger.info(`✅ [DataManager] 已启用统一数据管理架构`);
  } else {
    logger.warn(`⚠️  [DataManager] 未提供，使用旧的数据收集逻辑`);
  }

  try {
    // 清空之前的 API 数据
    apiData.init = [];
    apiData.conversations = [];
    apiData.history = [];
    apiData.cache.init.clear();
    apiData.cache.conversations.clear();
    apiData.cache.history.clear();
    logger.debug('已清空 API 数据存储');

    // API 拦截器已由 platform.js 在 initialize() 时统一注册
    logger.info('API 拦截器已全局启用（由 platform.js 管理）');

    // 第 2 步: 导航到私信页面
    logger.debug(`[Phase 8] Step 2: Navigating to direct messages page`);
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await page.waitForTimeout(2000);
    logger.info(`[Phase 8] Navigated to message page`);

    // 第 3 步: 获取会话列表
    logger.debug(`[Phase 8] Step 3: Extracting conversations list`);
    const conversations = await extractConversationsList(page, account, apiData);
    logger.info(`[Phase 8] Extracted ${conversations.length} conversations`);

    // 第 4 步: 对每个会话获取完整消息历史
    logger.debug(`[Phase 8] Step 4: Crawling complete message history for each conversation`);
    const directMessages = [];

    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];
      logger.info(`[Phase 8] Processing conversation ${i + 1}/${conversations.length}: ${conversation.platform_user_name}`);

      try {
        // 打开会话 - 使用刷新的会话列表
        const opened = await openConversationByIndex(page, conversation, i);
        if (!opened) {
          logger.warn(`[Phase 8] Failed to open conversation ${i}, skipping...`);
          continue;
        }

        // 加载完整消息历史 (分页加载)
        const messages = await crawlCompleteMessageHistory(page, conversation, account, apiData);

        directMessages.push(...messages);

        logger.info(`[Phase 8] Conversation ${conversation.platform_user_name}: ${messages.length} messages`);

        // ✅ 将 DOM 提取的消息发送到 DataManager
        if (dataManager && messages.length > 0) {
          try {
            // 转换 DOM 格式到 DataManager 期望的格式
            const formattedMessages = messages.map(msg => ({
              message_id: msg.platform_message_id,
              conversation_id: msg.conversation_id,
              sender_id: msg.platform_sender_id || 'unknown',
              sender_name: msg.platform_sender_name || msg.sender_nickname || 'Unknown', // ✅ 使用 React Fiber 提取的名称
              content: msg.content,
              type: msg.message_type || 'text',
              direction: msg.direction || 'incoming',
              created_at: msg.timestamp,
            }));

            const upsertedMessages = dataManager.batchUpsertMessages(formattedMessages, DataSource.DOM);
            logger.info(`✅ [DOM] 会话消息 -> DataManager: ${upsertedMessages.length} 条 (会话: ${conversation.platform_user_name})`);
          } catch (error) {
            logger.error(`[DOM] 消息入库失败 (会话: ${conversation.platform_user_name}):`, error);
          }
        }

        // 返回会话列表 - 改进的返回逻辑
        await returnToConversationList(page);

        // 等待会话列表重新渲染
        await page.waitForTimeout(800);
      } catch (error) {
        logger.error(`[Phase 8] Error processing conversation ${conversation.platform_user_name}:`, error);
      }
    }

    // 第 5 步: 从 API 响应中提取完整对象信息 (含 ID)
    logger.debug(`[Phase 8] Step 5: Extracting complete message objects with IDs from API responses`);
    const messagesWithIds = extractCompleteMessageObjects(directMessages, apiData);
    logger.info(`[Phase 8] Extracted complete message objects: ${messagesWithIds.length}`);

    // 第 6 步: 统计信息
    const stats = {
      conversationsCount: conversations.length,
      messagesCount: directMessages.length,
      messagesWithIdsCount: messagesWithIds.length,
      apiResponseCounts: {
        init: apiData.init.length,
        conversations: apiData.conversations.length,
        history: apiData.history.length,
        websocket: apiData.ws ? apiData.ws.length : 0
      },
      crawl_time: Math.floor(Date.now() / 1000)
    };

    // ✅ 如果使用了 DataManager，添加其统计信息
    if (dataManager) {
      const dmStats = dataManager.getStats();
      stats.dataManager = dmStats;
      logger.info(`✅ [DataManager] 统计:`, JSON.stringify(dmStats));
    }

    logger.info(`[Phase 8] ✅ Crawl completed: ${JSON.stringify(stats)}`);

    return {
      conversations,
      directMessages: messagesWithIds,
      stats
    };
  } catch (error) {
    logger.error(`[Phase 8] ❌ FATAL ERROR:`, error);
    throw error;
  } finally {
    // ✅ 清理全局上下文
    globalContext.dataManager = null;
    globalContext.accountId = null;
    logger.debug('已清理全局 DataManager 上下文');
  }
}

/**
 * 滚动会话列表加载所有会话
 * 针对抖音私信页面的虚拟列表进行滚动，确保加载所有会话
 * @param {Page} page - Playwright页面对象
 */
async function scrollConversationListToLoadAll(page) {
  logger.info('[scrollConversationListToLoadAll] 开始滚动会话列表加载所有会话');

  try {
    // 等待会话列表渲染
    await page.waitForTimeout(1000);

    let previousCount = 0;
    let stableCount = 0;
    const MAX_STABLE_COUNT = 3; // 连续 3 次数量不变则认为已加载完成
    const MAX_ATTEMPTS = 20; // 最多尝试 20 次
    let attempts = 0;

    while (stableCount < MAX_STABLE_COUNT && attempts < MAX_ATTEMPTS) {
      attempts++;

      // 获取当前会话列表项数量
      const currentCount = await page.evaluate(() => {
        const items = document.querySelectorAll('[role="list-item"]');
        return items.length;
      });

      logger.debug(`[scrollConversationListToLoadAll] Attempt ${attempts}: 当前会话数 = ${currentCount}`);

      // 检查数量是否稳定
      if (currentCount === previousCount) {
        stableCount++;
        logger.debug(`[scrollConversationListToLoadAll] 数量稳定 (${stableCount}/${MAX_STABLE_COUNT})`);
      } else {
        stableCount = 0; // 重置稳定计数器
        previousCount = currentCount;
      }

      // 滚动到底部
      const scrolled = await page.evaluate(() => {
        try {
          // 尝试多种选择器找到会话列表容器
          const listContainer =
            document.querySelector('[role="list"]') ||
            document.querySelector('.conversation-list') ||
            document.querySelector('[class*="conversationList"]') ||
            document.querySelector('[class*="ChatList"]') ||
            document.querySelector('[class*="list"]');

          if (listContainer) {
            const previousScrollTop = listContainer.scrollTop;
            listContainer.scrollTop = listContainer.scrollHeight;
            const newScrollTop = listContainer.scrollTop;
            return {
              success: true,
              scrolled: newScrollTop > previousScrollTop,
              scrollTop: newScrollTop,
              scrollHeight: listContainer.scrollHeight
            };
          }

          return { success: false, message: '未找到列表容器' };
        } catch (error) {
          return { success: false, message: error.message };
        }
      });

      if (!scrolled.success) {
        logger.warn(`[scrollConversationListToLoadAll] 滚动失败: ${scrolled.message}`);
      } else if (!scrolled.scrolled) {
        logger.debug(`[scrollConversationListToLoadAll] 已经在底部`);
      } else {
        logger.debug(`[scrollConversationListToLoadAll] 滚动: ${scrolled.scrollTop}/${scrolled.scrollHeight}`);
      }

      // 等待新会话加载
      await page.waitForTimeout(500);
    }

    const finalCount = previousCount;
    logger.info(`[scrollConversationListToLoadAll] ✅ 滚动完成，共加载 ${finalCount} 个会话 (尝试 ${attempts} 次)`);

    // 滚动回顶部，方便后续操作
    await page.evaluate(() => {
      const listContainer =
        document.querySelector('[role="list"]') ||
        document.querySelector('.conversation-list') ||
        document.querySelector('[class*="conversationList"]') ||
        document.querySelector('[class*="ChatList"]') ||
        document.querySelector('[class*="list"]');

      if (listContainer) {
        listContainer.scrollTop = 0;
      }
    });

    await page.waitForTimeout(300);
    logger.debug('[scrollConversationListToLoadAll] 已滚动回顶部');

  } catch (error) {
    logger.error('[scrollConversationListToLoadAll] 滚动失败:', error);
  }
}

/**
 * 提取会话列表 - 改进版
 * 支持多种选择器和错误恢复
 * @param {Page} page - Playwright页面对象
 * @param {Object} account - 账户信息
 * @param {Object} apiData - API响应数据
 * @returns {Promise<Array>} conversations数组
 */
async function extractConversationsList(page, account, apiData = {}) {
  const conversations = [];

  try {
    // ========================================================================
    // 第 0 步：滚动会话列表加载所有会话（修复虚拟列表问题）
    // ========================================================================
    logger.info('[extractConversationsList] Step 0: Scrolling conversation list to load all conversations');
    await scrollConversationListToLoadAll(page);

    // ========================================================================
    // 优先方案：从 API 响应中提取会话数据（最可靠）
    // ========================================================================
    if (apiData.conversations && apiData.conversations.length > 0) {
      logger.info(`[extractConversationsList] Using API data: ${apiData.conversations.length} responses`);

      apiData.conversations.forEach((response, idx) => {
        // ✅ 修正：API 返回的是 user_list 而不是 data.conversations
        if (response.user_list && Array.isArray(response.user_list)) {
          logger.debug(`[extractConversationsList] API Response ${idx}: ${response.user_list.length} users`);

          response.user_list.forEach((userItem, userIdx) => {
            try {
              // ✅ 修正：从 user_list[].user_id 和 user_list[].user 提取数据
              const userId = String(userItem.user_id || '');
              const user = userItem.user || {};

              // 提取用户名
              const userName = user.nickname || user.unique_id || user.ShortId || 'Unknown';

              // 提取头像
              const userAvatar = user.avatar_thumb?.url_list?.[0] ||
                                 user.avatar_large?.url_list?.[0] ||
                                 user.avatar_medium?.url_list?.[0] ||
                                 null;

              if (!userId) {
                logger.warn(`[extractConversationsList] API User ${userIdx}: No user_id found, skipping`);
                return;
              }

              const conversation = {
                id: generateConversationId(account.id, userId),
                account_id: account.id,
                platform_user_id: userId,  // ✅ 使用真实的平台用户 ID
                platform_user_name: userName,  // ✅ 使用真实的用户昵称
                platform_user_avatar: userAvatar,  // ✅ 使用真实的头像 URL
                last_message_time: Math.floor(Date.now() / 1000),  // API 不包含消息信息，使用当前时间
                last_message_content: '',  // API 不包含消息内容
                platform_message_id: null,
                is_group: false,  // 私信一般是单聊
                unread_count: 0,  // API 不包含未读数
                is_pinned: false,
                is_muted: false,
                created_at: Date.now(),
                updated_at: Date.now()
              };

              conversations.push(conversation);
              logger.debug(`[extractConversationsList] API User ${userIdx}: ${userName} (ID: ${userId})`);

            } catch (error) {
              logger.warn(`[extractConversationsList] Error extracting API user ${userIdx}:`, error.message);
            }
          });
        }
      });

      if (conversations.length > 0) {
        logger.info(`[extractConversationsList] ✅ Extracted ${conversations.length} conversations from API`);
        return conversations;
      } else {
        logger.warn(`[extractConversationsList] API data available but no conversations extracted, falling back to DOM`);
      }
    }

    // ========================================================================
    // 备用方案：从 DOM 提取会话数据（当 API 数据不可用时）
    // ========================================================================
    logger.info(`[extractConversationsList] No API data available, using DOM extraction`);

    // 第 1 步: 调试页面结构
    logger.debug('[extractConversationsList] Step 1: Analyzing page structure');

    const pageAnalysis = await page.evaluate(() => {
      const analysis = {
        listContainers: [],
        itemCounts: {},
        pageTitle: document.title,
        url: window.location.href
      };

      // 查找可能的列表容器
      const selectors = [
        '[role="grid"]',
        '[role="list"]',
        '[class*="conversation"]',
        '[class*="virtualList"]',
        '.virtual-list',
        '[data-testid*="conversation"]'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          analysis.listContainers.push({
            selector,
            count: elements.length,
            firstElementClass: elements[0]?.className || 'no-class',
            firstElementRole: elements[0]?.getAttribute('role') || 'no-role'
          });
        }
      }

      // 统计不同类型的项目元素
      const itemSelectors = {
        '[role="listitem"]': '[role="listitem"]',
        '[role="gridcell"]': '[role="gridcell"]',
        '[class*="item"]': '[class*="item"]',
        'li': 'li'
      };

      for (const [name, selector] of Object.entries(itemSelectors)) {
        const count = document.querySelectorAll(selector).length;
        if (count > 0) {
          analysis.itemCounts[name] = count;
        }
      }

      return analysis;
    });

    logger.info('[extractConversationsList] Page analysis:', JSON.stringify(pageAnalysis));

    // 第 2 步: 尝试多个选择器提取会话
    logger.debug('[extractConversationsList] Step 2: Trying multiple selectors to find conversations');

    let conversationElements = [];
    const selectorsToTry = [
      '[role="list-item"]',                // Primary: list-item with hyphen (抖音使用)
      '[role="listitem"]',                 // Alternative: listitem without hyphen
      '[role="grid"] [role="list-item"]',  // Grid with list items
      '[role="list"] [role="list-item"]',  // List with list items
      '[class*="conversation-item"]',      // Conversation item class
      'li'                                 // Fallback to li elements
    ];

    for (const selector of selectorsToTry) {
      const elements = await page.locator(selector).all();
      if (elements.length > 0) {
        logger.info(`[extractConversationsList] Found ${elements.length} items with selector: ${selector}`);
        conversationElements = elements;
        break;
      } else {
        logger.debug(`[extractConversationsList] No items found with selector: ${selector}`);
      }
    }

    if (conversationElements.length === 0) {
      logger.warn('[extractConversationsList] ⚠️ No conversation elements found with any selector');
      // 尝试从 API 响应中恢复 (如果有的话)
      logger.info('[extractConversationsList] Will attempt to extract from API responses if available');
      return conversations;
    }

    logger.info(`[extractConversationsList] Successfully located ${conversationElements.length} conversation elements`);

    // 第 3 步: 提取会话信息
    logger.debug('[extractConversationsList] Step 3: Extracting conversation data from elements');

    for (let index = 0; index < conversationElements.length; index++) {
      try {
        const element = conversationElements[index];
        const content = await element.textContent();

        // 过滤空内容
        if (!content || content.trim().length === 0) {
          logger.debug(`[extractConversationsList] Skipping empty element at index ${index}`);
          continue;
        }

        // 解析时间和用户名
        const timeMatch = content.match(/(\d{1,2}:\d{2}|\d{1,2}-\d{2}|\d{4}-\d{1,2}-\d{1,2})/);
        const time = timeMatch ? timeMatch[0] : '';
        const text = content.replace(time, '').trim();

        // 检查是否是有效的会话
        if (text.length < 2) {
          logger.debug(`[extractConversationsList] Skipping element ${index}: text too short (${text.length} chars)`);
          continue;
        }

        // 提取用户名 (通常是第一行或第一个非空行)
        const userName = text.split('\n')[0].trim();

        if (!userName) {
          logger.debug(`[extractConversationsList] Skipping element ${index}: no user name found`);
          continue;
        }

        // ⚠️ 警告：DOM 提取无法获取真实的 platform_user_id
        // 使用用户名生成临时 ID (仅作为备用方案，优先使用 API 数据)
        const tempUserId = `user_${userName}`.replace(/\s+/g, '_');
        const conversationId = generateConversationId(account.id, tempUserId);

        logger.warn(`[extractConversationsList] DOM extraction: Using temporary user_id for ${userName}`);
        logger.warn(`[extractConversationsList] ⚠️ This may cause issues with user identification - API extraction preferred`);

        const conversation = {
          id: conversationId,
          account_id: account.id,
          platform_user_id: tempUserId,  // ⚠️ 临时 ID，非真实平台 ID
          platform_user_name: userName,  // ⚠️ 可能包含额外文本
          platform_user_avatar: null,     // ⚠️ 无法从 DOM 获取
          last_message_time: time ? parseInt(time) : Math.floor(Date.now() / 1000),
          last_message_content: text.substring(0, 100), // 限制长度
          platform_message_id: null,
          is_group: false,
          unread_count: 0,
          created_at: Date.now(),
          updated_at: Date.now()
        };

        conversations.push(conversation);
        logger.debug(`[extractConversationsList] Extracted conversation ${index + 1}: ${userName}`);

      } catch (error) {
        logger.warn(`[extractConversationsList] Error extracting conversation at index ${index}:`, error.message);
        continue;
      }
    }

    logger.info(`[extractConversationsList] ✅ Successfully extracted ${conversations.length} conversations from ${conversationElements.length} elements`);

  } catch (error) {
    logger.error('[extractConversationsList] Fatal error:', error);
    throw error;
  }

  return conversations;
}

/**
 * 打开会话 - 改进版（使用刷新的列表索引）
 * 支持多种查找方式和重试机制
 * 改进: 每次打开前重新查询会话列表，避免虚拟列表重新渲染导致的索引失效
 */
async function openConversationByIndex(page, conversation, conversationIndex) {
  logger.debug(`[openConversationByIndex] Opening conversation: ${conversation.platform_user_name} (index: ${conversationIndex})`);

  try {
    // 第 1 步: 重新获取最新的所有对话元素 (虚拟列表可能已重新渲染)
    await page.waitForTimeout(300); // 给虚拟列表一些时间稳定下来

    let allConversations = await page.locator('[role="list-item"]').all();
    logger.debug(`[openConversationByIndex] Step 1: Found ${allConversations.length} total conversation elements`);

    // 如果找不到会话元素，可能是标签页被改变了，尝试刷新或检查当前标签页
    if (allConversations.length === 0) {
      logger.warn(`[openConversationByIndex] No conversation elements found, might need to switch tab or refresh`);

      // 尝试通过导航刷新列表
      await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      await page.waitForTimeout(1000);

      allConversations = await page.locator('[role="list-item"]').all();
      logger.debug(`[openConversationByIndex] After refresh: Found ${allConversations.length} conversation elements`);
    }

    if (conversationIndex < 0 || conversationIndex >= allConversations.length) {
      logger.warn(`[openConversationByIndex] Invalid conversation index: ${conversationIndex} (total: ${allConversations.length})`);
      return false;
    }

    // 第 2 步: 点击指定索引的对话元素
    const element = allConversations[conversationIndex];
    logger.debug(`[openConversationByIndex] Step 2: Clicking conversation at index ${conversationIndex}`);

    await element.click();
    await page.waitForTimeout(1500);

    // 第 3 步: 验证是否成功打开了对话详情
    const isChatOpen = await page.evaluate(() => {
      // 检查是否已经进入对话详情页面
      return document.querySelector('[class*="message"]') !== null ||
             document.querySelector('[class*="chat"]') !== null ||
             window.location.href.includes('/chat/');
    });

    if (isChatOpen) {
      logger.info(`[openConversationByIndex] ✅ Successfully opened conversation at index ${conversationIndex}: ${conversation.platform_user_name}`);
      return true;
    } else {
      logger.warn(`[openConversationByIndex] ⚠️ Failed to open conversation - page structure not detected`);
      return false;
    }

  } catch (error) {
    logger.error(`[openConversationByIndex] Error opening conversation ${conversation.platform_user_name}:`, error.message);
    return false;
  }
}

/**
 * 返回会话列表 - 改进版
 * 优先点击返回按钮，只有在找不到按钮时才使用 URL 导航
 * 防止频繁导航被抖音识别为机器人行为
 */
async function returnToConversationList(page) {
  logger.debug(`[returnToConversationList] Attempting to return to conversation list`);

  try {
    // 直接点击 .semi-button-content 返回按钮
    // 用户已在浏览器控制台验证: $(".semi-button-content").click() 可以返回
    logger.info(`[returnToConversationList] Clicking .semi-button-content back button`);

    const clickResult = await page.evaluate(() => {
      const elem = document.querySelector('.semi-button-content');
      if (elem) {
        elem.click();
        return { success: true };
      }
      return { success: false };
    });

    if (clickResult.success) {
      logger.info(`[returnToConversationList] Back button clicked, waiting for list to appear...`);
      await page.waitForTimeout(1500);

      // 检查是否真的返回到了会话列表 (列表中应该有 role="list-item" 元素)
      const hasConversationList = await page.evaluate(() => {
        return document.querySelectorAll('[role="list-item"]').length > 0;
      });

      if (hasConversationList) {
        logger.info(`[returnToConversationList] ✅ Successfully returned to conversation list`);
        // 点击"全部"tab 确保显示所有会话
        await clickAllTab(page);
        return true;
      } else {
        logger.warn(`[returnToConversationList] ⚠️ Back button click did not show conversation list, might be navigation`);
      }
    }

    // 备用: 使用 locator 点击
    logger.debug(`[returnToConversationList] Trying locator method`);
    const element = await page.locator('.semi-button-content').first();
    const isVisible = await element.isVisible().catch(() => false);

    if (isVisible) {
      logger.info(`[returnToConversationList] Clicking back button via locator`);
      await element.click();
      await page.waitForTimeout(1500);

      const hasConversationList = await page.evaluate(() => {
        return document.querySelectorAll('[role="list-item"]').length > 0;
      });

      if (hasConversationList) {
        logger.info(`[returnToConversationList] ✅ Successfully returned to conversation list`);
        // 点击"全部"tab 确保显示所有会话
        await clickAllTab(page);
        return true;
      }
    }

    // 最后才使用 URL 导航
    logger.warn(`[returnToConversationList] Back button not found or ineffective, using URL navigation`);
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(1500);
    logger.info(`[returnToConversationList] ✅ Navigated back to conversation list via URL`);
    return true;

  } catch (error) {
    logger.error(`[returnToConversationList] Error:`, error.message);
    return false;
  }
}

/**
 * 点击"全部"tab 确保显示所有会话
 */
async function clickAllTab(page) {
  try {
    logger.debug(`[clickAllTab] Attempting to click '全部' tab`);

    // 点击第一个 tab（"全部"）
    const allTab = await page.locator('role=tab', { name: '全部' }).first();
    const isVisible = await allTab.isVisible().catch(() => false);

    if (isVisible) {
      await allTab.click();
      logger.info(`[clickAllTab] ✅ Clicked '全部' tab`);
      await page.waitForTimeout(1000);
      return true;
    }

    // 备用: 通过 querySelector 点击
    await page.evaluate(() => {
      const tabs = document.querySelectorAll('[role="tab"]');
      if (tabs.length > 0) {
        tabs[0].click(); // 点击第一个 tab（通常是"全部"）
      }
    });
    logger.debug(`[clickAllTab] Clicked first tab via evaluate`);
    await page.waitForTimeout(1000);
    return true;

  } catch (error) {
    logger.debug(`[clickAllTab] Failed to click '全部' tab: ${error.message}`);
    return false;
  }
}

/**
 * 打开会话 - 原始版本（保留以备后用）
 * @deprecated 使用 openConversationByIndex 代替
 */
async function openConversation(page, conversation, conversationIndex) {
  return openConversationByIndex(page, conversation, conversationIndex);
}

/**
 * 爬取完整消息历史 (虚拟列表分页) - 改进版
 * 支持智能延迟、收敛判断优化、平台特定指示器检测
 */
async function crawlCompleteMessageHistory(page, conversation, account, apiData) {
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
            // 使用 senderId 作为 conversationId (for inbound)
            const originalConvId = msg.conversation_id;
            if (msg.direction === 'inbound' && msg.platform_sender_id) {
              msg.conversation_id = msg.platform_sender_id;
            } else {
              msg.conversation_id = conversation.platform_user_id || conversation.id;
            }
            logger.warn(`[Line 755] 消息 ${msg.platform_message_id} conversationId: ${originalConvId} -> ${msg.conversation_id} (direction: ${msg.direction}, senderId: ${msg.platform_sender_id})`);
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
          // 使用 senderId 作为 conversationId (for inbound)
          const originalConvId = msg.conversation_id;
          if (msg.direction === 'inbound' && msg.platform_sender_id) {
            msg.conversation_id = msg.platform_sender_id;
          } else {
            msg.conversation_id = conversation.platform_user_id || conversation.id;
          }
          logger.warn(`[Line 783] 消息 ${msg.platform_message_id} conversationId: ${originalConvId} -> ${msg.conversation_id} (direction: ${msg.direction}, senderId: ${msg.platform_sender_id})`);
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
    // ✅ 最终修复方案：根据消息方向使用不同的逻辑
    // - inbound 消息：对方是发送者，使用 platform_sender_id 作为会话ID
    // - outbound 消息：需要使用 conversation.platform_user_id 或其他方式获取对方ID
    const originalConvId = msg.conversation_id;
    let conversationId;
    if (msg.direction === 'inbound' && msg.platform_sender_id) {
      // inbound 消息：发送者就是对方，这是纯数字 ID
      conversationId = msg.platform_sender_id;
    } else {
      // outbound 消息：使用外层的 conversation.platform_user_id
      conversationId = conversation.platform_user_id || conversation.id;
    }
    logger.warn(`[Line 814] 消息 ${msg.platform_message_id} conversationId: ${originalConvId} -> ${conversationId} (direction: ${msg.direction}, senderId: ${msg.platform_sender_id}, platform_user_id: ${conversation.platform_user_id})`);
    msg.conversation_id = conversationId;
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
  logger.debug('Extracting messages from virtual list (enhanced with Douyin-specific selectors)');

  return await page.evaluate(() => {
    const messages = [];

    // Phase 8 改进: 从 React Fiber 虚拟列表中直接提取完整的消息数据
    // 包括: conversationId, messageId, isFromMe, timestamp, content
    // 这个方法已在真实抖音私信页面验证有效

    const allElements = document.querySelectorAll('[class*="message"], [class*="item"], [role*="article"]');

    allElements.forEach((element) => {
      try {
        const fiberKey = Object.keys(element).find(key => key.startsWith('__react'));
        if (!fiberKey) return;

        let current = element[fiberKey];
        let depth = 0;
        let found = false;

        // 递归查找包含消息数据的 React Fiber 节点
        while (current && depth < 20 && !found) {
          if (current.memoizedProps) {
            const props = current.memoizedProps;

            // 检查是否包含消息数据（关键字段）
            if (props.conversationId || props.serverId || props.content || props.message) {
              const msgContent = props.content || {};
              const textContent = msgContent.text || '';

              // 只有当有实际内容时才添加
              if (textContent || props.messageId || props.serverId) {
                // ✅ 关键修复：会话 ID 应该是**对方用户的 ID**，而不是抖音的 props.conversationId
                // props.conversationId 是会话级别的ID，同一会话中所有消息都相同
                // 我们需要根据消息方向来确定对方是谁
                let realConversationId;
                let recipientId = null;

                if (!props.isFromMe) {
                  // inbound 消息：对方是发送者
                  const senderId = props.sender || props.senderId;
                  realConversationId = senderId;  // 会话ID = 对方用户ID
                  recipientId = props.receiver || props.receiverId || null;
                } else {
                  // outbound 消息：对方的 ID 需要从 conversationId 中提取
                  // conversationId 格式可能是 "0:1:ourId:otherUserId"
                  if (props.conversationId && props.conversationId.includes(':')) {
                    const parts = props.conversationId.split(':');
                    // 最后一部分通常是对方的用户 ID
                    const otherUserId = parts[parts.length - 1];
                    realConversationId = otherUserId;  // 会话ID = 对方用户ID
                    recipientId = otherUserId;
                  } else {
                    // 如果 conversationId 不是 ":" 分隔格式，直接使用
                    realConversationId = props.conversationId;
                    recipientId = props.conversationId;
                  }
                }

                const message = {
                  index: messages.length,
                  platform_message_id: props.serverId || props.id || `msg_${messages.length}`,
                  conversation_id: realConversationId,
                  platform_user_id: props.conversationId, // 保存原始的完整 conversationId 用于参考
                  content: textContent.substring(0, 500) || (props.text || '').substring(0, 500),
                  timestamp: props.timestamp || props.createdAt || new Date().toISOString(),
                  message_type: props.type || 'text',
                  // ✅ 发送者ID
                  platform_sender_id: props.sender || props.senderId || (props.isFromMe ? 'self' : 'other'),
                  // ✅ 发送者昵称
                  platform_sender_name: props.nickname || props.senderName || (props.isFromMe ? 'Me' : 'Other'),
                  // ✅ 发送者头像URL（仅对方消息有此字段）
                  sender_avatar: props.avatar || null,
                  // ✅ 发送者昵称（仅对方消息有此字段）
                  sender_nickname: props.nickname || null,
                  // ✅ 新增：接收者ID
                  recipient_id: recipientId,
                  // ✅ 新增：接收者昵称（如果有）
                  recipient_name: props.receiverName || null,
                  direction: props.isFromMe ? 'outbound' : 'inbound',
                  created_at: normalizeTimestamp(props.timestamp || props.createdAt),
                  is_read: props.isRead || false,
                  status: props.status || 'sent'
                };

                messages.push(message);
                found = true;
              }
            }
          }

          current = current.child;
          depth++;
        }
      } catch (e) {
        console.debug('Error extracting from Fiber:', e.message);
      }
    });

    // 去重：使用 messageId 去重
    const deduped = [];
    const seen = new Set();

    messages.forEach(msg => {
      if (!seen.has(msg.platform_message_id)) {
        seen.add(msg.platform_message_id);
        deduped.push(msg);
      }
    });

    console.debug(`Successfully extracted ${deduped.length} messages from React Fiber virtual list`);
    return deduped;

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
    function extractFromDOM(content, element) {
      // 支持多种时间格式: HH:MM, MM-DD, YYYY-MM-DD
      const timeMatch = content.match(/(\d{1,2}:\d{2}|\d{1,2}-\d{2}|\d{4}-\d{1,2}-\d{1,2})/);
      const time = timeMatch ? timeMatch[0] : '';

      // 移除时间戳，清理文本
      let text = content.replace(time, '').trim();
      text = text.replace(/已读|置顶|删除/g, '').trim();

      // 检测消息方向（根据 class 名称）
      const className = element?.className || '';
      const direction = className.includes('box-item') ? 'outbound' :
                       className.includes('text-item') ? 'inbound' : 'inbound';

      return { timeMatch: time, text, direction };
    }

    /**
     * 计算内容哈希用于去重
     */
    function hashContent(text) {
      if (!text || text.length < 2) return '';

      // 简单的哈希函数
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为 32 位整数
      }
      return Math.abs(hash).toString(36);
    }
  });
}

/**
 * 提取完整的消息对象 (含所有 ID 信息) - 改进版
 * 支持三层数据合并: API > WebSocket > DOM
 */
function extractCompleteMessageObjects(messages, apiData) {
  logger.debug('Extracting complete message objects with IDs');

  const completeMessages = [];
  const messageMap = new Map();
  let mergeStats = { api: 0, partial: 0, dom: 0 };

  // 第 1 步: 从所有 API 响应中提取完整数据 (最高优先级)
  const apiSources = [
    { type: 'init', responses: apiData.init },
    { type: 'history', responses: apiData.history },
    { type: 'conversations', responses: apiData.conversations }
  ];

  apiSources.forEach(source => {
    source.responses.forEach(response => {
      if (response.data?.messages) {
        response.data.messages.forEach(msg => {
          // 使用多个可能的 ID 字段
          const msgId = msg.platform_message_id || msg.id || msg.msg_id;

          if (msgId && !messageMap.has(msgId)) {
            messageMap.set(msgId, {
              ...msg,
              source: `api_${source.type}`,
              completeness: 'full'
            });
          }
        });
      }
    });
  });

  // 第 2 步: 合并 DOM 提取的消息和 API 数据
  messages.forEach((msg, index) => {
    try {
      // 生成后备 ID (如果 API 数据中没有)
      const msgId = msg.platform_message_id;

      let completeMsg = {
        id: msgId,
        account_id: msg.account_id,
        conversation_id: msg.conversation_id,
        platform_message_id: msgId,
        content: msg.content || '',
        platform_sender_id: msg.platform_sender_id || 'unknown',
        platform_sender_name: msg.platform_sender_name || 'Unknown',
        // ✅ 新增：发送者头像和昵称
        sender_avatar: msg.sender_avatar || null,
        sender_nickname: msg.sender_nickname || null,
        platform_receiver_id: msg.platform_receiver_id,
        platform_receiver_name: msg.platform_receiver_name,
        message_type: msg.message_type || 'text',
        direction: msg.direction || 'inbound',
        is_read: msg.is_read || false,
        created_at: msg.created_at || Date.now(),
        detected_at: Date.now(),
        is_new: true,  // ✅ 修改: 首次抓取的消息 is_new = true（时效性由 Master 判断）
        push_count: 0
      };

      // 第 3 步: 尝试从 API 数据中填充缺失的字段
      if (messageMap.has(msgId)) {
        const apiData = messageMap.get(msgId);

        // 字段优先级: API > DOM
        completeMsg = mergeMessageData(completeMsg, apiData);
        mergeStats.api++;
      } else {
        // 第 4 步: 为未匹配到 API 数据的消息生成唯一 ID
        if (msgId.startsWith('msg_')) {
          // 这是一个生成的临时 ID，尝试基于内容生成更稳定的 ID
          const contentHash = hashContent(msg.content);
          completeMsg.platform_message_id = `msg_${msg.account_id}_${contentHash}`;
          mergeStats.partial++;
        }
      }

      completeMessages.push(completeMsg);
    } catch (error) {
      logger.error(`Error processing message at index ${index}:`, error.message);
    }
  });

  // 第 5 步: 验证完整性和排序
  validateAndSortMessages(completeMessages);

  logger.info(`✅ Extracted ${completeMessages.length} complete message objects:`, {
    fromAPI: mergeStats.api,
    partial: mergeStats.partial,
    fromDOM: completeMessages.length - mergeStats.api - mergeStats.partial
  });

  return completeMessages;
}

/**
 * 合并消息数据，API 优先级高于 DOM
 */
function mergeMessageData(domMsg, apiData) {
  return {
    ...domMsg,
    // API 字段覆盖 DOM 字段 (优先级: API > DOM)
    platform_message_id: apiData.platform_message_id || apiData.id || domMsg.platform_message_id,
    platform_sender_id: apiData.platform_sender_id || apiData.sender_id || apiData.uid || domMsg.platform_sender_id,
    platform_sender_name: apiData.platform_sender_name || apiData.sender_name || apiData.name || domMsg.platform_sender_name,
    platform_receiver_id: apiData.platform_receiver_id || apiData.receiver_id || domMsg.platform_receiver_id,
    platform_receiver_name: apiData.platform_receiver_name || apiData.receiver_name || domMsg.platform_receiver_name,
    message_type: apiData.message_type || domMsg.message_type,
    direction: apiData.direction || domMsg.direction,
    is_read: apiData.is_read !== undefined ? apiData.is_read : domMsg.is_read,
    created_at: apiData.created_at || apiData.create_time || domMsg.created_at,
    status: apiData.status || domMsg.status,
    source: apiData.source
  };
}

/**
 * 计算内容哈希值
 */
function hashContent(content) {
  if (!content) return 'empty';

  // 简单的哈希: 使用内容的前 100 个字符
  const str = content.substring(0, 100);
  return str.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0).toString(36);
}

/**
 * 验证和排序消息
 */
function validateAndSortMessages(messages) {
  // 按创建时间排序
  messages.sort((a, b) => {
    const aTime = a.created_at || 0;
    const bTime = b.created_at || 0;
    return aTime - bTime;
  });

  // 验证必需字段
  let validCount = 0;
  let warningCount = 0;

  messages.forEach((msg, index) => {
    if (msg.platform_message_id && msg.platform_sender_id && msg.content) {
      validCount++;
    } else {
      warningCount++;
      if (warningCount <= 5) { // 只记录前 5 个警告
        logger.debug(`Message at index ${index} has missing fields:`, {
          hasId: !!msg.platform_message_id,
          hasSender: !!msg.platform_sender_id,
          hasContent: !!msg.content
        });
      }
    }
  });

  logger.debug(`Message validation: ${validCount} valid, ${warningCount} with missing fields`);
}

/**
 * 生成会话 ID
 */
function generateConversationId(accountId, userIdOrName) {
  // ✅ 如果传入的是 Base64 格式的 userId（如 MS4wLjABAAAA...），直接使用
  // 这样可以与会话列表中的 user_id 匹配
  if (typeof userIdOrName === 'string' && userIdOrName.startsWith('MS4wLjABAAAA')) {
    return userIdOrName;
  }

  // ⚠️  兼容旧代码：如果是用户名，生成基于哈希的ID
  const timestamp = Math.floor(Date.now() / 1000);
  const hash = userIdOrName.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  return `conv_${accountId}_${Math.abs(hash)}_${timestamp}`;
}

module.exports = {
  // API 回调函数（由 platform.js 注册）
  onMessageInitAPI,
  onConversationListAPI,
  onMessageHistoryAPI,

  // 爬取函数
  crawlDirectMessagesV2,

  // 全局上下文（供 platform.js 初始化时访问）
  globalContext,

  // 工具函数（保留用于测试）
  extractConversationsList,
  crawlCompleteMessageHistory,
  extractMessagesFromVirtualList,
  extractCompleteMessageObjects
};
