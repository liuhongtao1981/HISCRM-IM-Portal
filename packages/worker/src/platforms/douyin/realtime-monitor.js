/**
 * Douyin Realtime Monitor
 *
 * Features: Manage realtime monitoring task for a single account
 * Architecture: Work cooperatively with MonitorTask (scheduled crawler)
 *
 * Workflow:
 * 1. Inject Hook script into browser page
 * 2. Expose Node.js function to browser (page.exposeFunction)
 * 3. Receive realtime data from browser, push to Master via DataManager
 * 4. Listen to page navigation events, auto re-inject Hook
 *
 * Data Deduplication:
 * - Use Set to track processed message IDs
 * - Complement with MonitorTask's CacheHandler
 *
 * @author Claude Code
 * @date 2025-11-06
 */

const path = require('path');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');
const { DataSource } = require('../base/data-models');

const logger = createLogger('douyin-realtime-monitor');

/**
 * Douyin Realtime Monitor
 */
class DouyinRealtimeMonitor {
  /**
   * Constructor
   * @param {Object} account - Account object
   * @param {Object} page - Playwright Page instance
   * @param {Object} dataManager - DouyinDataManager instance
   */
  constructor(account, page, dataManager) {
    this.account = account;
    this.page = page;
    this.dataManager = dataManager;

    // Monitor status
    this.isRunning = false;
    this.hooksInstalled = false;

    // Processed message IDs (deduplication)
    this.processedIds = new Set();

    // Statistics
    this.stats = {
      messagesReceived: 0,
      commentsReceived: 0,
      messagesProcessed: 0,
      commentsProcessed: 0,
      messagesDuplicated: 0,
      commentsDuplicated: 0,
      errors: 0,
      startTime: null
    };

    logger.info(`RealtimeMonitor created for account ${account.id}`);
  }

  /**
   * Start realtime monitoring
   */
  async start() {
    if (this.isRunning) {
      logger.warn(`RealtimeMonitor already running for account ${this.account.id}`);
      return;
    }

    logger.info(`Starting realtime monitor for account ${this.account.id}`);

    try {
      // 1. Inject Hook script
      await this.installHooks();

      // 2. Expose Node.js function to browser
      await this.exposeHandlers();

      // 3. Setup page navigation listener
      this.setupNavigationListener();

      this.isRunning = true;
      this.stats.startTime = Date.now();

      logger.info(`RealtimeMonitor started for account ${this.account.id}`);
    } catch (error) {
      logger.error(`Failed to start RealtimeMonitor for account ${this.account.id}:`, error);
      throw error;
    }
  }

  /**
   * Stop realtime monitoring
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info(`Stopping RealtimeMonitor for account ${this.account.id}`);

    this.isRunning = false;
    this.hooksInstalled = false;

    // Cleanup processed IDs (keep recent 1000 to prevent memory leak)
    if (this.processedIds.size > 1000) {
      const idsArray = Array.from(this.processedIds);
      this.processedIds = new Set(idsArray.slice(-1000));
    }

    logger.info(`RealtimeMonitor stopped for account ${this.account.id}`, this.getStats());
  }

  /**
   * Inject Hook script into browser page
   */
  async installHooks() {
    logger.info(`Installing realtime hooks for account ${this.account.id}...`);

    try {
      // 1. Wait for DOM content loaded
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });

      // 2. **关键**: 等待 IM 入口按钮出现 (这是数据的锚点!)
      try {
        await this.page.waitForSelector('[data-e2e="im-entry"]', {
          timeout: 15000,
          state: 'attached'
        });
      } catch (error) {
        // 备用选择器
        await this.page.waitForSelector(
          '[class*="im-entry"], [class*="message-entry"], #root',
          { timeout: 5000, state: 'attached' }
        ).catch(() => null);
      }

      // 3. Additional wait for React to initialize Store
      await this.page.waitForTimeout(2000);

      // 4. Get Hook script paths (通用框架 + 平台配置)
      const baseHookPath = path.join(__dirname, '..', 'base', 'hooks', 'base-realtime-hook.js');
      const configPath = path.join(__dirname, 'hooks', 'douyin-realtime-config.js');

      // 5. Inject scripts into page (先注入通用框架,再注入平台配置)
      await this.page.addScriptTag({ path: baseHookPath });

      await this.page.waitForTimeout(500); // 等待框架初始化

      await this.page.addScriptTag({ path: configPath });

      // 6. Wait for script execution (配置脚本会自动初始化)
      await this.page.waitForTimeout(1000);

      // 7. Verify installation
      const installed = await this.page.evaluate(() => {
        return typeof window.__checkRealtimeHooks === 'function';
      });

      if (installed) {
        this.hooksInstalled = true;
        logger.info(`Realtime hooks installed for account ${this.account.id}`);
      } else {
        logger.warn(`Realtime hooks verification failed for account ${this.account.id}`);
      }
    } catch (error) {
      logger.error(`Failed to install realtime hooks for account ${this.account.id}:`, error);
      throw error;
    }
  }

  /**
   * Expose Node.js function to browser
   * Enable Hook script to send data via window.__sendRealtimeData
   */
  async exposeHandlers() {
    logger.info(`Exposing handlers for account ${this.account.id}...`);

    try {
      // Expose data receiver function
      await this.page.exposeFunction('__sendRealtimeData', async (data) => {
        await this.handleRealtimeData(data);
      });

      logger.info(`Handlers exposed for account ${this.account.id}`);
    } catch (error) {
      // Ignore if function already exists
      if (error.message.includes('already exists')) {
        logger.info(`Handlers already exposed for account ${this.account.id}`);
      } else {
        logger.error(`Failed to expose handlers for account ${this.account.id}:`, error);
        throw error;
      }
    }
  }

  /**
   * Setup page navigation listener, auto re-inject Hook
   */
  setupNavigationListener() {
    this.page.on('framenavigated', async (frame) => {
      if (frame !== this.page.mainFrame()) return;

      logger.info(`Page navigated, reinstalling hooks for account ${this.account.id}...`);

      // Mark as not installed
      this.hooksInstalled = false;

      // Wait for page load
      await this.page.waitForTimeout(2000);

      // Reinstall Hook
      try {
        await this.installHooks();
      } catch (error) {
        logger.error(`Failed to reinstall hooks after navigation:`, error);
      }
    });

    logger.info(`Navigation listener setup for account ${this.account.id}`);
  }

  /**
   * Handle realtime data from browser
   * @param {Object} data - { type: 'message'|'comment', data: Object, timestamp: number }
   */
  async handleRealtimeData(data) {
    if (!this.isRunning) {
      logger.debug(`RealtimeMonitor not running, ignoring data for account ${this.account.id}`);
      return;
    }

    try {
      const { type, data: rawData, timestamp } = data;

      // Handle by type
      if (type === 'message') {
        await this.handleRealtimeMessage(rawData, timestamp);
      } else if (type === 'comment') {
        await this.handleRealtimeComment(rawData, timestamp);
      } else {
        logger.warn(`Unknown realtime data type: ${type}`);
      }
    } catch (error) {
      logger.error(`Error handling realtime data for account ${this.account.id}:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Handle realtime message
   * @param {Object} rawMsg - Raw message object (from msgListToPush)
   * @param {number} timestamp - Capture timestamp
   */
  async handleRealtimeMessage(rawMsg, timestamp) {
    this.stats.messagesReceived++;

    // 1. Deduplication check
    const messageId = rawMsg.platform_message_id || rawMsg.message_id || rawMsg.serverId || rawMsg.id;

    if (!messageId) {
      logger.warn('Message has no ID, skipping');
      return;
    }

    if (this.processedIds.has(messageId)) {
      logger.debug(`Message ${messageId} already processed, skipping`);
      this.stats.messagesDuplicated++;
      return;
    }

    // 2. Process conversation and user info if provided
    if (rawMsg.conversation_info && rawMsg.user_info) {
      try {
        logger.info(`[Realtime] Processing conversation and user info for message ${messageId.substring(0, 12)}...`);
        
        // Prepare conversation data in platform format for upsertConversation
        // 匹配 DataManager.mapConversationData 期望的格式
        const conversationData = {
          // ⭐ 基础标识: user_id 使用发送人的 secUid (这样可以关联消息)
          user_id: rawMsg.user_info.secUid,
          
          // 用户信息 (嵌套对象格式,匹配 API 格式)
          user: {
            nickname: rawMsg.user_info.nickname,
            unique_id: rawMsg.user_info.uniqueId,
            sec_uid: rawMsg.user_info.secUid,
            avatar_thumb: {
              url_list: rawMsg.user_info.avatar ? [rawMsg.user_info.avatar] : []
            }
          },
          
          // 也提供扁平格式作为后备
          nickname: rawMsg.user_info.nickname,
          avatar: rawMsg.user_info.avatar ? {
            url_list: [rawMsg.user_info.avatar]
          } : null,
          
          // 会话附加信息
          conversation_short_id: rawMsg.conversation_info.conversationShortId,
          unread_count: rawMsg.conversation_info.unreadCount || 0,
          last_message: {
            content: rawMsg.content || rawMsg.conversation_info.lastMessageContent,
            created_time: rawMsg.created_at * 1000 || rawMsg.conversation_info.lastMessageTime
          }
        };
        
        // Use DataManager's upsertConversation method
        // This will automatically mark it as dirty for sync to Master
        const conversation = this.dataManager.upsertConversation(conversationData, DataSource.REALTIME);
        logger.info(`✅ [Realtime] Conversation upserted: ${conversation.id} (${conversation.userName})`);
        
      } catch (error) {
        logger.error(`Failed to process conversation info for message ${messageId}:`, error);
      }
    }

    // 3. Use DataManager to process message
    logger.info(`[Realtime] Processing message: ${messageId.substring(0, 12)}... (account: ${this.account.id})`);

    // 4. Push to DataManager using batch method
    try {
      // Use batchUpsertMessages with array containing single message
      const upserted = this.dataManager.batchUpsertMessages([rawMsg], DataSource.REALTIME);
      
      if (upserted && upserted.length > 0) {
        this.processedIds.add(messageId);
        this.stats.messagesProcessed++;
        logger.info(`✅ [Realtime] Message processed successfully: ${messageId.substring(0, 12)}...`);
      } else {
        logger.warn(`⚠️ [Realtime] Message not processed (possibly duplicate): ${messageId}`);
      }
    } catch (error) {
      logger.error(`Failed to process realtime message ${messageId}:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Handle realtime comment
   * @param {Object} rawNotice - Raw notice object (from noticePushList)
   * @param {number} timestamp - Capture timestamp
   */
  async handleRealtimeComment(rawNotice, timestamp) {
    this.stats.commentsReceived++;

    // 1. Deduplication check
    const commentId = rawNotice.nid_str || rawNotice.nid;
    if (!commentId) {
      logger.warn('Comment has no ID, skipping');
      return;
    }

    if (this.processedIds.has(commentId)) {
      logger.debug(`Comment ${commentId} already processed, skipping`);
      this.stats.commentsDuplicated++;
      return;
    }

    // 2. Format comment data
    const formattedComment = this.formatComment(rawNotice);

    logger.info(`[Realtime] Captured comment: ${commentId.substring(0, 12)}... (account: ${this.account.id})`);

    // 3. Push to DataManager
    try {
      await this.dataManager.pushComment(formattedComment, DataSource.REALTIME);
      this.processedIds.add(commentId);
      this.stats.commentsProcessed++;
    } catch (error) {
      logger.error(`Failed to push realtime comment ${commentId}:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Format message data
   * @param {Object} raw - Raw message object
   * @returns {Object} Standardized message object
   */
  formatMessage(raw) {
    return {
      // Required fields
      platform_message_id: raw.serverId || raw.id,
      platform_conversation_id: raw.conversationId || raw.conversation_id,
      sender_id: raw.fromUserId || raw.from_user_id,
      sender_name: raw.fromUserName || raw.from_user_name,
      sender_avatar: raw.fromUserAvatar || raw.from_user_avatar,
      content: raw.text || '',
      message_type: raw.type || 1,
      timestamp: raw.timestamp || Date.now(),

      // Optional fields
      reply_to_message_id: raw.replyToMessageId || null,
      attachments: raw.attachments || [],
      metadata: {
        source: 'realtime',
        captured_at: Date.now(),
        raw_type: raw.type
      }
    };
  }

  /**
   * Format comment data
   * @param {Object} raw - Raw notice object
   * @returns {Object} Standardized comment object
   */
  formatComment(raw) {
    return {
      // Required fields
      platform_comment_id: raw.nid_str || raw.nid,
      platform_content_id: raw.item_id || raw.aweme_id,
      commenter_id: raw.from_user?.uid || raw.from_user_id,
      commenter_name: raw.from_user?.nickname || raw.from_user_name,
      commenter_avatar: raw.from_user?.avatar_url || raw.from_user_avatar,
      content: raw.content || raw.text || '',
      timestamp: raw.timestamp || Date.now(),

      // Optional fields
      parent_comment_id: raw.parent_comment_id || null,
      reply_to_user_id: raw.reply_to_user_id || null,
      reply_to_user_name: raw.reply_to_user_name || null,
      content_title: raw.title || '',
      content_cover: raw.cover || '',
      metadata: {
        source: 'realtime',
        captured_at: Date.now(),
        notice_type: raw.type
      }
    };
  }

  /**
   * Get monitoring statistics
   * @returns {Object}
   */
  getStats() {
    const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;

    return {
      account_id: this.account.id,
      is_running: this.isRunning,
      hooks_installed: this.hooksInstalled,
      uptime_ms: uptime,
      uptime_min: (uptime / 1000 / 60).toFixed(1),
      messages_received: this.stats.messagesReceived,
      comments_received: this.stats.commentsReceived,
      messages_processed: this.stats.messagesProcessed,
      comments_processed: this.stats.commentsProcessed,
      messages_duplicated: this.stats.messagesDuplicated,
      comments_duplicated: this.stats.commentsDuplicated,
      errors: this.stats.errors,
      processed_ids_size: this.processedIds.size
    };
  }

  /**
   * Health check
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    try {
      // Check if page exists
      if (!this.page || this.page.isClosed()) {
        return {
          healthy: false,
          reason: 'Page is closed'
        };
      }

      // Check if Hook is installed
      const hookInstalled = await this.page.evaluate(() => {
        return typeof window.__checkRealtimeHooks === 'function'
          ? window.__checkRealtimeHooks()
          : null;
      });

      if (!hookInstalled) {
        return {
          healthy: false,
          reason: 'Hooks not installed',
          will_reinstall: true
        };
      }

      return {
        healthy: true,
        hooks_installed: hookInstalled,
        stats: this.getStats()
      };
    } catch (error) {
      logger.error(`Health check failed for account ${this.account.id}:`, error);
      return {
        healthy: false,
        reason: error.message
      };
    }
  }

  /**
   * Reinstall Hook (for failure recovery)
   */
  async reinstallHooks() {
    logger.info(`Reinstalling hooks for account ${this.account.id}...`);

    try {
      this.hooksInstalled = false;
      await this.installHooks();
      logger.info(`Hooks reinstalled for account ${this.account.id}`);
    } catch (error) {
      logger.error(`Failed to reinstall hooks for account ${this.account.id}:`, error);
      throw error;
    }
  }
}

module.exports = DouyinRealtimeMonitor;
