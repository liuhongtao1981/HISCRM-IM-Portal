/**
 * conversations API 数据结构调试脚本
 *
 * 用途：
 * 1. 拦截 get_conversation_list API
 * 2. 输出完整的 JSON 响应结构
 * 3. 分析字段映射问题
 *
 * 使用方法：
 * 1. 在 crawl-direct-messages-v2.js 中添加此调试代码
 * 2. 运行私信爬虫
 * 3. 查看日志中的 conversations API 响应
 */

// ============================================================================
// 在 setupAPIInterceptors() 函数中的 conversations 拦截部分添加以下代码：
// ============================================================================

/*
await page.route('**\/v1/stranger/get_conversation_list**', async (route) => {
  try {
    const response = await route.fetch();
    const body = await response.json();

    // 🔍 DEBUG: 输出完整的 conversations API 响应
    logger.info('\n╔═══════════════════════════════════════════════════════════════╗');
    logger.info('║  🔍 Conversations API Response - Complete Structure           ║');
    logger.info('╚═══════════════════════════════════════════════════════════════╝\n');

    // 1. 输出完整的 JSON（格式化）
    logger.info('📦 Complete JSON (formatted):');
    logger.info(JSON.stringify(body, null, 2));

    // 2. 输出 conversations 数组的结构
    if (body.data && Array.isArray(body.data.conversations)) {
      logger.info(`\n📋 Conversations Array (${body.data.conversations.length} items):`);

      // 输出第一个 conversation 的完整结构
      if (body.data.conversations.length > 0) {
        const firstConv = body.data.conversations[0];
        logger.info('\n🔍 First Conversation Object:');
        logger.info(JSON.stringify(firstConv, null, 2));

        // 输出所有字段的详细信息
        logger.info('\n📊 Field Analysis:');
        for (const [key, value] of Object.entries(firstConv)) {
          const valueType = Array.isArray(value) ? 'array' : typeof value;
          let displayValue = value;

          if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              displayValue = `[Array, length: ${value.length}]`;
            } else {
              displayValue = `{Object, keys: ${Object.keys(value).join(', ')}}`;
            }
          } else if (typeof value === 'string' && value.length > 100) {
            displayValue = value.substring(0, 100) + '...';
          }

          logger.info(`   ${key}: ${displayValue} (${valueType})`);
        }

        // 重点检查用户相关字段
        logger.info('\n🎯 User-related Fields:');
        const userFields = ['user_id', 'uid', 'user', 'from_user', 'to_user', 'participant', 'participants'];
        userFields.forEach(field => {
          if (firstConv.hasOwnProperty(field)) {
            logger.info(`   ✅ ${field}: ${JSON.stringify(firstConv[field])}`);
          }
        });

        // 检查用户名相关字段
        logger.info('\n📝 Username-related Fields:');
        const nameFields = ['user_name', 'username', 'name', 'nickname', 'nick_name', 'display_name'];
        nameFields.forEach(field => {
          if (firstConv.hasOwnProperty(field)) {
            logger.info(`   ✅ ${field}: ${JSON.stringify(firstConv[field])}`);
          }
        });
      }
    }

    logger.info('\n╚═══════════════════════════════════════════════════════════════╝\n');

    // 继续原有逻辑
    apiResponses.conversations.push(body);
    await route.fulfill({ response });

  } catch (error) {
    logger.error('Conversations API interception error:', error);
    await route.continue();
  }
});
*/

// ============================================================================
// 预期的 conversations API 响应结构分析
// ============================================================================

/**
 * 典型的抖音 conversations API 响应结构：
 *
 * {
 *   "data": {
 *     "conversations": [
 *       {
 *         "conversation_id": "string",           // 会话 ID
 *         "conversation_short_id": "string",     // 短 ID
 *         "user_id": "number",                   // ✅ 用户 ID（真实 ID）
 *         "sec_user_id": "string",               // 安全用户 ID
 *         "user": {                              // ✅ 用户对象（包含详细信息）
 *           "uid": "string",
 *           "sec_uid": "string",
 *           "nickname": "string",                // ✅ 用户昵称
 *           "avatar_thumb": {
 *             "url_list": ["string"]             // ✅ 头像 URL
 *           },
 *           "unique_id": "string",               // 唯一 ID
 *           "short_id": "string"
 *         },
 *         "last_message": {                      // 最后一条消息
 *           "message_id": "string",
 *           "content": "string",
 *           "msg_type": "number",
 *           "create_time": "number"
 *         },
 *         "unread_count": "number",              // 未读数
 *         "is_pinned": "boolean",                // 是否置顶
 *         "is_muted": "boolean",                 // 是否静音
 *         "update_time": "number"                // 更新时间
 *       }
 *     ],
 *     "has_more": "boolean",
 *     "cursor": "string"
 *   },
 *   "extra": {
 *     "now": "number"
 *   },
 *   "status_code": 0
 * }
 */

// ============================================================================
// 当前代码的问题
// ============================================================================

/**
 * 问题 1：platform_user_id 使用了占位符
 *
 * 当前代码（crawl-direct-messages-v2.js:464）：
 * ```javascript
 * platform_user_id: `user_${userName}`.replace(/\s+/g, '_'),
 * ```
 *
 * 问题：
 * - 使用用户名生成占位符 ID（如 "user_张三"）
 * - 不是真实的平台 user_id
 * - 导致无法用于 API 调用或关联
 *
 * 正确做法：
 * ```javascript
 * platform_user_id: conversation.user_id || conversation.user?.uid || conversation.sec_user_id
 * ```
 */

/**
 * 问题 2：platform_user_name 可能不正确
 *
 * 当前代码（crawl-direct-messages-v2.js:465）：
 * ```javascript
 * platform_user_name: userName,
 * ```
 *
 * 这里的 userName 是从 DOM 提取的，可能包含：
 * - 多余的空格
 * - 其他文本（如时间、消息内容）
 * - 不是真实的用户昵称
 *
 * 正确做法：
 * ```javascript
 * platform_user_name: conversation.user?.nickname || conversation.user?.unique_id
 * ```
 */

/**
 * 问题 3：platform_user_avatar 始终为 null
 *
 * 当前代码（crawl-direct-messages-v2.js:466）：
 * ```javascript
 * platform_user_avatar: null,
 * ```
 *
 * 正确做法：
 * ```javascript
 * platform_user_avatar: conversation.user?.avatar_thumb?.url_list?.[0] || null
 * ```
 */

// ============================================================================
// 修复方案
// ============================================================================

/**
 * 方案 1：优先使用 API 数据（推荐）✅
 *
 * 位置：crawl-direct-messages-v2.js
 *
 * 步骤：
 * 1. 从 apiResponses.conversations 中提取真实数据
 * 2. 使用 conversation.user_id 作为 platform_user_id
 * 3. 使用 conversation.user.nickname 作为 platform_user_name
 * 4. 使用 conversation.user.avatar_thumb.url_list[0] 作为头像
 * 5. DOM 提取作为备用方案
 */

/**
 * 方案 2：同时记录 DOM 和 API 数据
 *
 * 在日志中同时输出：
 * - DOM 提取的数据
 * - API 返回的数据
 * - 对比差异
 */

// ============================================================================
// 修复代码示例
// ============================================================================

/**
 * 改进的 extractConversationsList() 函数：
 *
 * async function extractConversationsList(page, account, apiResponses) {
 *   // 1. 优先从 API 提取
 *   if (apiResponses.conversations && apiResponses.conversations.length > 0) {
 *     logger.info(`Extracting conversations from API responses (${apiResponses.conversations.length} responses)`);
 *
 *     const conversations = [];
 *     apiResponses.conversations.forEach(response => {
 *       if (response.data?.conversations) {
 *         response.data.conversations.forEach(conv => {
 *           conversations.push({
 *             id: generateConversationId(account.id, conv.user_id),
 *             account_id: account.id,
 *             platform_user_id: String(conv.user_id || conv.user?.uid),  // ✅ 真实 ID
 *             platform_user_name: conv.user?.nickname || conv.user?.unique_id,  // ✅ 真实昵称
 *             platform_user_avatar: conv.user?.avatar_thumb?.url_list?.[0] || null,  // ✅ 真实头像
 *             last_message_time: conv.last_message?.create_time || conv.update_time,
 *             last_message_content: conv.last_message?.content || '',
 *             platform_message_id: conv.last_message?.message_id || null,
 *             is_group: conv.is_group || false,
 *             unread_count: conv.unread_count || 0,
 *             is_pinned: conv.is_pinned || false,
 *             is_muted: conv.is_muted || false,
 *             created_at: Math.floor(Date.now() / 1000),
 *             updated_at: Math.floor(Date.now() / 1000)
 *           });
 *         });
 *       }
 *     });
 *
 *     logger.info(`✅ Extracted ${conversations.length} conversations from API`);
 *     return conversations;
 *   }
 *
 *   // 2. 如果 API 没有数据，使用 DOM 提取（备用方案）
 *   logger.warn('No API data available, falling back to DOM extraction');
 *   return extractConversationsFromDOM(page, account);
 * }
 */

module.exports = {
  // 导出调试函数供测试使用
};
