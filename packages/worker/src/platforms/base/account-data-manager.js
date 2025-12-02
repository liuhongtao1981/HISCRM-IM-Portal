/**
 * 账户数据管理器
 * 每个账户维护一个独立的数据管理器实例
 * 负责：
 * 1. 维护账户的所有数据（会话、消息、作品、评论等）
 * 2. 管理数据状态（新建、更新、已同步）
 * 3. 提供统一的数据访问接口
 * 4. 协调数据推送到 Master
 */

const {
  DataStatus,
  DataSource,
  Conversation,
  Message,
  Content,
  Comment,
  Notification,
  DataCollection,
} = require('./data-models');

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

class AccountDataManager {
  constructor(accountId, platform, dataPusher) {
    this.accountId = accountId;
    this.platform = platform;
    this.dataPusher = dataPusher;  // 数据推送器（与 Master 通信）

    this.logger = createLogger(`data-manager:${accountId}`);

    // 数据集合
    this.conversations = new DataCollection(Conversation);
    this.messages = new DataCollection(Message);
    this.contents = new DataCollection(Content);
    this.comments = new DataCollection(Comment);
    this.notifications = new DataCollection(Notification);

    // 推送配置
    this.pushConfig = {
      interval: 5000,           // 推送间隔（毫秒）
      batchSize: 100,           // 批量推送大小
      autoSync: true,           // 是否自动同步
    };

    // 推送定时器
    this.pushTimer = null;

    // 数据快照定时器
    this.snapshotTimer = null;

    // 统计信息
    this.stats = {
      lastPushTime: null,
      totalPushed: 0,
      pendingPush: 0,
    };

    // ✨ 新增：新消息检测标志
    this.hasNewMessages = false;
    this.newMessageDetails = {
      comments: [],    // 新评论列表
      messages: [],    // 新私信列表
    };
    this._isSyncing = false;  // 防抖标志

    this.logger.info(`AccountDataManager initialized for ${accountId}`);

    // 启动数据快照定时器（每30秒记录一次完整数据）
    this.startDataSnapshot();
  }

  // ==================== 会话管理 ====================

  /**
   * 添加或更新会话
   * @param {Object} conversationData - 会话数据（平台原始格式）
   * @param {DataSource} source - 数据来源
   * @returns {Conversation} 标准化的会话对象
   */
  upsertConversation(conversationData, source = DataSource.API) {
    const conversation = new Conversation();
    conversation.accountId = this.accountId;
    conversation.platform = this.platform;
    conversation.source = source;

    // 子类应该实现 mapConversationData 方法
    // 将平台特定数据映射到标准模型
    const mapped = this.mapConversationData(conversationData);
    Object.assign(conversation, mapped);

    // 生成唯一ID
    const id = this.generateConversationId(conversation);
    conversation.id = id;

    // 存储
    this.conversations.set(id, conversation);

    this.logger.debug(`Upserted conversation: ${id} (${conversation.userName})`);

    return conversation;
  }

  /**
   * 批量添加会话
   */
  batchUpsertConversations(conversationsData, source = DataSource.API) {
    const results = [];
    for (const data of conversationsData) {
      try {
        const conversation = this.upsertConversation(data, source);
        results.push(conversation);
      } catch (error) {
        this.logger.error(`Failed to upsert conversation:`, error);
      }
    }
    this.logger.info(`Batch upserted ${results.length} conversations`);
    return results;
  }

  /**
   * 获取会话
   */
  getConversation(id) {
    return this.conversations.get(id);
  }

  /**
   * 获取所有会话
   */
  getAllConversations() {
    return Array.from(this.conversations.items.values());
  }

  // ==================== 消息管理 ====================

  /**
   * 添加或更新消息
   */
  upsertMessage(messageData, source = DataSource.API) {
    // 检查是否已存在（用于判断是否为新消息）
    const tempId = this.generateMessageId({ messageId: messageData.messageId || messageData.msg_id });
    const isNew = !this.messages.items.has(tempId); // ✅ 修复：使用 items.has()

    const message = new Message();
    message.accountId = this.accountId;
    message.platform = this.platform;
    message.source = source;

    const mapped = this.mapMessageData(messageData);
    Object.assign(message, mapped);

    const id = this.generateMessageId(message);
    message.id = id;

    this.messages.set(id, message);

    // 更新会话的最后消息信息
    this.updateConversationLastMessage(message);

    // ✨ 新增：检测是否为新消息（inbound 且未读）
    if (isNew && message.direction === 'inbound' && !message.isRead) {
      this.hasNewMessages = true;
      this.newMessageDetails.messages.push(message);

      // 立即推送
      this.logger.info(`🔔 检测到新私信，触发立即推送: ${message.messageId}`);
      this.syncToMasterNow();
    }

    this.logger.debug(`Upserted message: ${id}`);

    return message;
  }

  /**
   * 批量添加消息
   */
  batchUpsertMessages(messagesData, source = DataSource.API) {
    const results = [];
    for (const data of messagesData) {
      try {
        const message = this.upsertMessage(data, source);
        results.push(message);
      } catch (error) {
        this.logger.error(`Failed to upsert message:`, error);
      }
    }
    this.logger.info(`Batch upserted ${results.length} messages`);
    return results;
  }

  /**
   * 更新会话的最后消息信息
   */
  updateConversationLastMessage(message) {
    const conversation = this.conversations.get(message.conversationId);
    if (conversation) {
      conversation.lastMessageId = message.messageId;
      conversation.lastMessageContent = message.content;
      conversation.lastMessageType = message.type;
      conversation.lastMessageTime = message.createdAt;
      conversation.lastMessageSenderId = message.senderId;
      conversation.markUpdated();
      this.conversations.dirtyIds.add(conversation.id);
    }
  }

  // ==================== 作品管理 ====================

  /**
   * 添加或更新作品
   */
  upsertContent(contentData, source = DataSource.API) {
    // 检查是否已存在（用于判断是否为新作品）
    const tempId = this.generateContentId({ contentId: contentData.aweme_id || contentData.item_id_plain || contentData.item_id });
    const isNew = !this.contents.items.has(tempId);

    const content = new Content();
    content.accountId = this.accountId;
    content.platform = this.platform;
    content.source = source;

    const mapped = this.mapContentData(contentData);
    Object.assign(content, mapped);

    const id = this.generateContentId(content);
    content.id = id;

    this.contents.set(id, content);

    this.logger.debug(`Upserted content: ${id} (${content.title?.substring(0, 30) || 'no title'})`);

    // ✨ 返回是否为新作品（供 batchUpsertContents 使用）
    content._isNew = isNew;

    return content;
  }

  /**
   * 批量添加作品
   */
  batchUpsertContents(contentsData, source = DataSource.API) {
    const results = [];
    let hasNewContent = false;
    let hasUpdatedContent = false;
    let errorCount = 0;

    this.logger.debug(`📦 [批量处理] 收到 ${contentsData.length} 个作品数据`);

    for (let i = 0; i < contentsData.length; i++) {
      const data = contentsData[i];
      try {
        this.logger.debug(`🔧 [批量处理] 处理第 ${i + 1}/${contentsData.length} 个作品`);
        const content = this.upsertContent(data, source);
        results.push(content);

        // 检查是否有新作品或更新
        if (content._isNew) {
          hasNewContent = true;
        } else {
          // 已存在的作品也算作更新（统计数据可能变化）
          hasUpdatedContent = true;
        }
      } catch (error) {
        errorCount++;
        this.logger.error(`❌ [批量处理] 第 ${i + 1} 个作品处理失败:`, {
          error: error.message,
          stack: error.stack,
          data: {
            item_id: data.item_id,
            item_id_plain: data.item_id_plain,
            aweme_id: data.aweme_id,
            title: data.title || data.desc
          }
        });
      }
    }

    const statusMsg = hasNewContent
      ? (hasUpdatedContent ? 'has new + updated' : 'has new')
      : (hasUpdatedContent ? 'all updated' : 'all existing');
    this.logger.info(`✅ [批量处理] 完成: ${results.length}/${contentsData.length} 个成功, ${errorCount} 个失败 (${statusMsg})`);

    // ✨ 如果有新作品或更新，立即同步到 Master（统计数据可能变化）
    if ((hasNewContent || hasUpdatedContent) && this.pushConfig.autoSync) {
      const reason = hasNewContent ? '新作品' : '作品更新（统计数据）';
      this.logger.info(`🔔 检测到${reason}，触发立即推送到 Master`);
      this.syncToMasterNow();
    }

    return results;
  }

  // ==================== 评论管理 ====================

  /**
   * 添加或更新评论
   */
  upsertComment(commentData, source = DataSource.API) {
    // 检查是否已存在（用于判断是否为新消息）
    const tempId = this.generateCommentId({ commentId: commentData.commentId || commentData.cid });
    const isNew = !this.comments.items.has(tempId); // ✅ 修复：使用 items.has()

    const comment = new Comment();
    comment.accountId = this.accountId;
    comment.platform = this.platform;
    comment.source = source;

    const mapped = this.mapCommentData(commentData);
    Object.assign(comment, mapped);

    const id = this.generateCommentId(comment);
    comment.id = id;

    this.comments.set(id, comment);

    // ✨ 新增：检测是否为新评论并推送
    if (isNew) {
      if (comment.direction === 'inbound' && !comment.isRead) {
        // Inbound 评论：别人发给我们的，作为新消息提醒推送
        this.hasNewMessages = true;
        this.newMessageDetails.comments.push(comment);
        this.logger.info(`🔔 检测到新评论（inbound），触发立即推送: ${comment.commentId}`);
        this.syncToMasterNow();
      } else if (comment.direction === 'outbound') {
        // Outbound 评论：我们发送的评论，也推送到 Master（但不作为新消息提醒）
        this.logger.info(`📤 检测到自己发送的评论（outbound），触发推送: ${comment.commentId}`);
        this.syncToMasterNow();
      }
    }

    this.logger.debug(`Upserted comment: ${id}`);

    return comment;
  }

  /**
   * 批量添加评论
   */
  batchUpsertComments(commentsData, source = DataSource.API) {
    const results = [];
    for (const data of commentsData) {
      try {
        const comment = this.upsertComment(data, source);
        results.push(comment);
      } catch (error) {
        this.logger.error(`Failed to upsert comment:`, error);
      }
    }
    this.logger.info(`Batch upserted ${results.length} comments`);
    return results;
  }

  // ==================== 通知管理 ====================

  /**
   * 添加通知
   */
  addNotification(notificationData, source = DataSource.API) {
    const notification = new Notification();
    notification.accountId = this.accountId;
    notification.platform = this.platform;
    notification.source = source;

    const mapped = this.mapNotificationData(notificationData);
    Object.assign(notification, mapped);

    const id = this.generateNotificationId(notification);
    notification.id = id;

    this.notifications.set(id, notification);

    this.logger.debug(`Added notification: ${id}`);

    return notification;
  }

  // ==================== 数据映射接口（子类实现） ====================

  /**
   * 映射会话数据（子类必须实现）
   * 将平台特定格式转换为标准格式
   */
  mapConversationData(platformData) {
    throw new Error('mapConversationData must be implemented by subclass');
  }

  /**
   * 映射消息数据（子类必须实现）
   */
  mapMessageData(platformData) {
    throw new Error('mapMessageData must be implemented by subclass');
  }

  /**
   * 映射作品数据（子类必须实现）
   */
  mapContentData(platformData) {
    throw new Error('mapContentData must be implemented by subclass');
  }

  /**
   * 映射评论数据（子类必须实现）
   */
  mapCommentData(platformData) {
    throw new Error('mapCommentData must be implemented by subclass');
  }

  /**
   * 映射通知数据（子类必须实现）
   */
  mapNotificationData(platformData) {
    throw new Error('mapNotificationData must be implemented by subclass');
  }

  // ==================== ID 生成（子类可以覆盖） ====================

  generateConversationId(conversation) {
    // ✅ 使用 conversationId (即对方的 secUid)
    return `conv_${this.accountId}_${conversation.conversationId}`;
  }

  generateMessageId(message) {
    return `msg_${this.accountId}_${message.messageId}`;
  }

  generateContentId(content) {
    return `cont_${this.accountId}_${content.contentId}`;
  }

  generateCommentId(comment) {
    return `comm_${this.accountId}_${comment.commentId}`;
  }

  generateNotificationId(notification) {
    return `notif_${this.accountId}_${notification.notificationId}_${Date.now()}`;
  }

  // ==================== 数据推送 ====================

  /**
   * 启动自动推送
   */
  startAutoSync() {
    if (this.pushTimer) {
      clearInterval(this.pushTimer);
    }

    this.pushConfig.autoSync = true;
    this.pushTimer = setInterval(() => {
      this.syncAll().catch(error => {
        this.logger.error('Auto sync failed:', error);
      });
    }, this.pushConfig.interval);

    this.logger.info(`Auto sync started (interval: ${this.pushConfig.interval}ms)`);
  }

  /**
   * 停止自动推送
   */
  stopAutoSync() {
    if (this.pushTimer) {
      clearInterval(this.pushTimer);
      this.pushTimer = null;
    }
    this.pushConfig.autoSync = false;
    this.logger.info('Auto sync stopped');
  }

  /**
   * 同步所有待推送的数据
   */
  async syncAll() {
    const startTime = Date.now();

    // 收集所有待推送的数据
    const toSync = {
      conversations: this.conversations.getDirtyData(),
      messages: this.messages.getDirtyData(),
      contents: this.contents.getDirtyData(),
      comments: this.comments.getDirtyData(),
      notifications: this.notifications.getDirtyData(),
    };

    // 统计
    const total = Object.values(toSync).reduce((sum, arr) => sum + arr.length, 0);

    if (total === 0) {
      this.logger.debug('No data to sync');
      return { synced: 0, failed: 0 };
    }

    this.logger.info(`Syncing ${total} items...`, {
      conversations: toSync.conversations.length,
      messages: toSync.messages.length,
      contents: toSync.contents.length,
      comments: toSync.comments.length,
      notifications: toSync.notifications.length,
    });

    try {
      // 推送到 Master
      const result = await this.dataPusher.pushData(this.accountId, toSync);

      // 标记为已同步
      if (result.success) {
        this.conversations.markSynced(result.syncedIds.conversations || []);
        this.messages.markSynced(result.syncedIds.messages || []);
        this.contents.markSynced(result.syncedIds.contents || []);
        this.comments.markSynced(result.syncedIds.comments || []);
        this.notifications.markSynced(result.syncedIds.notifications || []);

        this.stats.lastPushTime = Date.now();
        this.stats.totalPushed += result.synced || 0;

        const duration = Date.now() - startTime;
        this.logger.info(`✅ Synced ${result.synced} items in ${duration}ms`);

        return { synced: result.synced, failed: result.failed || 0 };
      } else {
        this.logger.error('Sync failed:', result.error);
        return { synced: 0, failed: total };
      }
    } catch (error) {
      this.logger.error('Sync error:', error);
      return { synced: 0, failed: total };
    }
  }

  /**
   * 手动触发推送（忽略定时器）
   */
  async syncNow() {
    this.logger.info('Manual sync triggered');
    return await this.syncAll();
  }

  // ==================== 数据快照 ====================

  /**
   * 启动数据快照定时器
   * 定期将完整数据序列化到日志中，便于调试和数据验证
   * 同时推送完整数据到 Master
   */
  startDataSnapshot(interval = 30000) {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }

    this.snapshotTimer = setInterval(() => {
      this.logDataSnapshot();
      // ✨ 新增：同步数据到 Master
      this.syncToMaster();
    }, interval);

    this.logger.info(`Data snapshot started (interval: ${interval}ms)`);
  }

  /**
   * 停止数据快照
   */
  stopDataSnapshot() {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    this.logger.info('Data snapshot stopped');
  }

  /**
   * 记录数据快照
   * 将所有数据序列化为 JSON 并记录到日志
   */
  logDataSnapshot() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      accountId: this.accountId,
      platform: this.platform,
      stats: this.getStats(),
      data: {
        conversations: this.getAllConversations().map(c => this.serializeConversation(c)),
        messages: this.getAllMessages().slice(0, 10).map(m => this.serializeMessage(m)), // 只取前10条避免日志过大
        contents: this.getAllContents().slice(0, 5).map(c => this.serializeContent(c)),
        comments: this.getAllComments().slice(0, 10).map(c => this.serializeComment(c)),
      },
    };

    // 直接传递对象，让 Winston 处理 JSON 序列化
    this.logger.info('📸 Data Snapshot', { snapshot });
  }

  /**
   * 同步数据到 Master
   * 推送完整数据快照到 Master 的内存存储
   */
  async syncToMaster() {
    if (!this.dataPusher) {
      this.logger.warn('DataPusher not available, skip sync');
      return;
    }

    if (!this.pushConfig.autoSync) {
      this.logger.debug('Auto sync disabled, skip sync');
      return;
    }

    try {
      const snapshot = this.toSyncFormat();

      // 使用 dataPusher 推送完整快照
      await this.dataPusher.pushDataSync({
        accountId: this.accountId,
        platform: this.platform,
        snapshot: {
          platform: this.platform,
          data: snapshot,
        },
        timestamp: Date.now(),
      });

      this.stats.lastPushTime = Date.now();
      this.stats.totalPushed++;

      this.logger.info(`✅ Data synced to Master`, {
        comments: snapshot.comments?.length || 0,
        contents: snapshot.contents?.length || 0,
        conversations: snapshot.conversations?.length || 0,
        messages: snapshot.messages?.length || 0,
      });
    } catch (error) {
      console.error('[syncToMaster] ❌ 推送失败:', error);
      this.logger.error('Failed to sync data to Master:', error);
    }
  }

  /**
   * ✨ 新增：立即推送数据到 Master（新消息时调用）
   * 相比定期推送，这个方法会立即执行，不等待定时器
   */
  async syncToMasterNow() {
    // 防抖：如果正在推送，则跳过
    if (this._isSyncing) {
      this.logger.debug('Already syncing, skip immediate push');
      return;
    }

    this._isSyncing = true;

    try {
      await this.syncToMaster();

      // 清除新消息标志
      this.hasNewMessages = false;
      this.newMessageDetails = {
        comments: [],
        messages: [],
      };
    } finally {
      this._isSyncing = false;
    }
  }

  /**
   * 转换为同步格式
   * 返回完整的数据快照（不截断）
   */
  toSyncFormat() {
    return {
      comments: this.getAllComments(),
      contents: this.getAllContents(),
      conversations: this.getAllConversations(),
      messages: this.getAllMessages(),
      notifications: Array.from(this.notifications.items.values()),
    };
  }

  /**
   * 序列化会话对象（只保留关键字段）
   */
  serializeConversation(conversation) {
    return {
      id: conversation.id,
      conversationId: conversation.conversationId,
      userId: conversation.userId,
      userName: conversation.userName,
      userAvatar: conversation.userAvatar,
      unreadCount: conversation.unreadCount,
      lastMessageContent: conversation.lastMessageContent,
      lastMessageTime: conversation.lastMessageTime,
      status: conversation.status,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * 序列化消息对象
   */
  serializeMessage(message) {
    return {
      id: message.id,
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.senderName,
      type: message.type,
      content: message.content?.substring(0, 100), // 截断长内容
      direction: message.direction,
      status: message.status,
      createdAt: message.createdAt,
    };
  }

  /**
   * 序列化作品对象
   */
  serializeContent(content) {
    return {
      id: content.id,
      contentId: content.contentId,
      type: content.type,
      title: content.title?.substring(0, 50),
      description: content.description?.substring(0, 100),
      viewCount: content.viewCount,
      likeCount: content.likeCount,
      commentCount: content.commentCount,
      publishTime: content.publishTime,
      status: content.status,
    };
  }

  /**
   * 序列化评论对象
   */
  serializeComment(comment) {
    return {
      id: comment.id,
      commentId: comment.commentId,
      contentId: comment.contentId,
      authorId: comment.authorId,
      authorName: comment.authorName,
      content: comment.content?.substring(0, 100),
      likeCount: comment.likeCount,
      replyCount: comment.replyCount,
      status: comment.status,
      createdAt: comment.createdAt,
    };
  }

  /**
   * 获取所有消息
   */
  getAllMessages() {
    return Array.from(this.messages.items.values());
  }

  /**
   * 获取所有作品
   */
  getAllContents() {
    return Array.from(this.contents.items.values());
  }

  /**
   * 获取所有评论
   */
  getAllComments() {
    return Array.from(this.comments.items.values());
  }

  // ==================== 统计信息 ====================

  /**
   * 获取数据统计
   */
  getStats() {
    return {
      account: {
        id: this.accountId,
        platform: this.platform,
      },
      collections: {
        conversations: this.conversations.getStats(),
        messages: this.messages.getStats(),
        contents: this.contents.getStats(),
        comments: this.comments.getStats(),
        notifications: this.notifications.getStats(),
      },
      sync: {
        lastPushTime: this.stats.lastPushTime,
        totalPushed: this.stats.totalPushed,
        autoSync: this.pushConfig.autoSync,
        interval: this.pushConfig.interval,
      },
    };
  }

  /**
   * 打印统计信息
   */
  printStats() {
    const stats = this.getStats();
    this.logger.info('=== Data Manager Stats ===');
    this.logger.info(`Account: ${stats.account.id} (${stats.account.platform})`);
    this.logger.info(`Conversations: ${stats.collections.conversations.total} (${stats.collections.conversations.new} new, ${stats.collections.conversations.updated} updated)`);
    this.logger.info(`Messages: ${stats.collections.messages.total} (${stats.collections.messages.new} new)`);
    this.logger.info(`Contents: ${stats.collections.contents.total} (${stats.collections.contents.new} new)`);
    this.logger.info(`Comments: ${stats.collections.comments.total} (${stats.collections.comments.new} new)`);
    this.logger.info(`Notifications: ${stats.collections.notifications.total} (${stats.collections.notifications.new} new)`);
    this.logger.info(`Sync: ${stats.sync.autoSync ? 'enabled' : 'disabled'}, total pushed: ${stats.sync.totalPushed}`);
  }

  // ==================== 清理 ====================

  /**
   * 清理资源
   */
  destroy() {
    this.stopAutoSync();
    this.stopDataSnapshot();
    this.logger.info(`AccountDataManager destroyed for ${this.accountId}`);
  }
}

module.exports = { AccountDataManager };
