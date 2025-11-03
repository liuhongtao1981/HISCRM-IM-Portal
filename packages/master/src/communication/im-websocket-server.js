/**
 * IM WebSocket 服务器
 * 实现 CRM IM Server 的 WebSocket 协议
 * 数据源: DataStore (Worker 推送的内存数据)
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('im-websocket');

class IMWebSocketServer {
  constructor(io, dataStore, commentsDAO = null, messagesDAO = null) {
    this.io = io;
    this.dataStore = dataStore;
    this.commentsDAO = commentsDAO;
    this.messagesDAO = messagesDAO;

    // 在线客户端管理
    this.monitorClients = new Map(); // clientId -> socketId
    this.adminClients = new Map();   // adminId -> socketId
    this.socketToClientId = new Map(); // socketId -> clientId

    logger.info('IM WebSocket Server initialized');
  }

  /**
   * 设置 Socket.IO 命名空间和事件处理
   */
  setupHandlers() {
    // 使用根命名空间 (兼容 CRM IM Server)
    this.io.on('connection', (socket) => {
      logger.info(`[IM WS] New client connected: ${socket.id}`);

      // 监控客户端注册
      socket.on('monitor:register', (data) => {
        this.handleMonitorRegister(socket, data);
      });

      // 请求频道列表
      socket.on('monitor:request_channels', () => {
        this.handleRequestChannels(socket);
      });

      // 请求主题列表
      socket.on('monitor:request_topics', (data) => {
        this.handleRequestTopics(socket, data);
      });

      // 请求消息列表
      socket.on('monitor:request_messages', (data) => {
        this.handleRequestMessages(socket, data);
      });

      // 发送回复
      socket.on('monitor:reply', (data) => {
        this.handleMonitorReply(socket, data);
      });

      // ============ 已读状态处理事件 ============

      // 标记单条消息已读
      socket.on('monitor:mark_as_read', (data) => {
        this.handleMarkAsRead(socket, data);
      });

      // 批量标记已读
      socket.on('monitor:mark_batch_as_read', (data) => {
        this.handleMarkBatchAsRead(socket, data);
      });

      // 按作品标记所有评论已读
      socket.on('monitor:mark_topic_as_read', (data) => {
        this.handleMarkTopicAsRead(socket, data);
      });

      // 按会话标记所有私信已读
      socket.on('monitor:mark_conversation_as_read', (data) => {
        this.handleMarkConversationAsRead(socket, data);
      });

      // 获取未读计数
      socket.on('monitor:get_unread_count', (data) => {
        this.handleGetUnreadCount(socket, data);
      });

      // 断开连接
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });

    logger.info('IM WebSocket handlers setup complete');
  }

  /**
   * 处理监控客户端注册
   */
  handleMonitorRegister(socket, data) {
    try {
      const clientId = data.clientId || socket.id;
      const clientType = data.clientType || 'monitor';

      // 保存客户端映射
      if (clientType === 'admin') {
        this.adminClients.set(clientId, socket.id);
        logger.info(`[IM WS] Admin registered: ${clientId}`);
      } else {
        this.monitorClients.set(clientId, socket.id);
        logger.info(`[IM WS] Monitor client registered: ${clientId}`);
      }

      this.socketToClientId.set(socket.id, clientId);

      // 发送频道列表
      const channels = this.getChannelsFromDataStore();
      socket.emit('monitor:channels', { channels });

      // 注册确认
      socket.emit('monitor:registered', {
        success: true,
        channelCount: channels.length,
        clientId: clientId,
        clientType: clientType
      });

      logger.info(`[IM WS] Client registered: ${clientId}, type: ${clientType}, channels: ${channels.length}`);
    } catch (error) {
      logger.error('[IM WS] Monitor register error:', error);
      socket.emit('error', { message: '监控注册失败' });
    }
  }

  /**
   * 处理请求频道列表
   */
  handleRequestChannels(socket) {
    try {
      const channels = this.getChannelsFromDataStore();
      socket.emit('monitor:channels', { channels });
      logger.info(`[IM WS] Sent ${channels.length} channels to ${socket.id}`);
    } catch (error) {
      logger.error('[IM WS] Request channels error:', error);
    }
  }

  /**
   * 处理请求主题列表
   */
  handleRequestTopics(socket, data) {
    try {
      const { channelId } = data;
      logger.info(`[IM WS] Request topics for channel: ${channelId}`);

      const topics = this.getTopicsFromDataStore(channelId);
      socket.emit('monitor:topics', { channelId, topics });

      logger.info(`[IM WS] Sent ${topics.length} topics for channel ${channelId}`);
    } catch (error) {
      logger.error('[IM WS] Request topics error:', error);
    }
  }

  /**
   * 处理请求消息列表
   */
  handleRequestMessages(socket, data) {
    try {
      const { topicId } = data;
      logger.info(`[IM WS] Request messages for topic: ${topicId}`);

      const messages = this.getMessagesFromDataStore(topicId);
      socket.emit('monitor:messages', { topicId, messages });

      logger.info(`[IM WS] Sent ${messages.length} messages for topic ${topicId}`);
    } catch (error) {
      logger.error('[IM WS] Request messages error:', error);
    }
  }

  /**
   * 处理监控客户端回复
   */
  handleMonitorReply(socket, data) {
    try {
      const { channelId, topicId, content, replyToId, replyToContent, messageCategory } = data;  // ✅ 接收 messageCategory
      logger.info(`[IM WS] Monitor reply:`, { channelId, topicId, content, messageCategory });

      // 根据消息分类确定消息类型
      const messageType = messageCategory === 'private' ? 'text' : 'comment';

      // 创建回复消息
      const replyMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        channelId,
        topicId,
        fromName: '客服',
        fromId: 'monitor_client',
        content,
        type: messageType,  // ✅ 根据分类设置类型
        messageCategory: messageCategory || 'comment',  // ✅ 新增: 消息分类，默认为 'comment'
        timestamp: Date.now(),
        serverTimestamp: Date.now(),
        replyToId,
        replyToContent,
        isHandled: false  // ✅ 新增: 默认未处理
      };

      // 广播给所有监控客户端
      this.broadcastToMonitors('channel:message', replyMessage);

      // 确认回复成功
      socket.emit('reply:success', { messageId: replyMessage.id });

      logger.info(`[IM WS] Reply sent: ${replyMessage.id}, category: ${messageCategory || 'comment'}`);
    } catch (error) {
      logger.error('[IM WS] Monitor reply error:', error);
    }
  }

  /**
   * 处理断开连接
   */
  handleDisconnect(socket) {
    const clientId = this.socketToClientId.get(socket.id);
    if (clientId) {
      this.socketToClientId.delete(socket.id);

      if (this.adminClients.has(clientId)) {
        logger.info(`[IM WS] Admin disconnected: ${clientId}`);
      } else if (this.monitorClients.has(clientId)) {
        logger.info(`[IM WS] Monitor client disconnected: ${clientId}`);
      }
    }
    logger.info(`[IM WS] Client disconnected: ${socket.id}`);
  }

  /**
   * 从 DataStore 获取频道列表
   * 频道 = 账户
   */
  getChannelsFromDataStore() {
    const channels = [];

    // 遍历 DataStore 中的所有账户
    for (const [accountId, accountData] of this.dataStore.accounts) {
      // DataStore 数据结构是 {accountId, platform, lastUpdate, data}
      const dataObj = accountData.data || accountData;

      // 计算未读消息数
      const unreadCount = this.calculateUnreadCount(dataObj);

      // 查找最新消息
      const lastMessage = this.findLastMessage(dataObj);

      const channel = {
        id: accountId,
        name: accountData.accountName || accountId,
        avatar: accountData.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`,
        description: accountData.platform || '',
        lastMessage: lastMessage?.content || '',
        lastMessageTime: lastMessage?.timestamp || accountData.lastUpdate || Date.now(),
        unreadCount: unreadCount,
        messageCount: dataObj.messages?.length || 0,
        isPinned: false,
        enabled: true
      };

      channels.push(channel);
    }

    // 按最后消息时间排序
    channels.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

    return channels;
  }

  /**
   * 从 DataStore 获取主题列表
   * 主题 = 作品/会话
   */
  getTopicsFromDataStore(channelId) {
    const accountData = this.dataStore.accounts.get(channelId);

    // 详细的调试日志
    logger.info(`[DEBUG] getTopicsFromDataStore called for channel: ${channelId}`);
    logger.info(`[DEBUG] accountData exists: ${!!accountData}`);

    if (!accountData) {
      logger.warn(`[DEBUG] No accountData found for channel: ${channelId}`);
      return [];
    }

    // 输出 accountData 的所有字段名
    const fields = Object.keys(accountData);
    logger.info(`[DEBUG] accountData fields: ${fields.join(', ')}`);

    // DataStore 数据结构是 {accountId, platform, lastUpdate, data}
    // 实际数据在 data 字段中
    const dataObj = accountData.data || accountData;

    // 检查各个字段的值（DataStore 使用 Map 存储，需要用 .size）
    const contentsSize = dataObj.contents instanceof Map ? dataObj.contents.size : (dataObj.contents?.length || 0);
    const conversationsSize = dataObj.conversations instanceof Map ? dataObj.conversations.size : (dataObj.conversations?.length || 0);
    const commentsSize = dataObj.comments instanceof Map ? dataObj.comments.size : (dataObj.comments?.length || 0);
    const messagesSize = dataObj.messages instanceof Map ? dataObj.messages.size : (dataObj.messages?.length || 0);

    logger.info(`[DEBUG] dataObj.contents exists: ${!!dataObj.contents}, size: ${contentsSize}`);
    logger.info(`[DEBUG] dataObj.conversations exists: ${!!dataObj.conversations}, size: ${conversationsSize}`);
    logger.info(`[DEBUG] dataObj.comments exists: ${!!dataObj.comments}, size: ${commentsSize}`);
    logger.info(`[DEBUG] dataObj.messages exists: ${!!dataObj.messages}, size: ${messagesSize}`);

    const topics = [];

    // 从作品创建主题
    if (contentsSize > 0) {
      logger.info(`[DEBUG] Processing ${contentsSize} contents`);
      const contentsList = dataObj.contents instanceof Map ? Array.from(dataObj.contents.values()) : dataObj.contents;
      const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);

      // 调试：输出所有评论的 contentId
      const commentContentIds = commentsList.map(c => c.contentId);
      logger.warn(`[DEBUG] 评论的 contentId 列表: ${JSON.stringify(commentContentIds)}`);

      // 调试：输出所有作品的 contentId
      const contentIds = contentsList.map(c => c.contentId);
      logger.warn(`[DEBUG] 作品的 contentId 列表: ${JSON.stringify(contentIds)}`);

      let topicsWithComments = 0;

      for (const content of contentsList) {
        // 计算该作品的评论数（使用 camelCase: contentId）
        const contentComments = commentsList.filter(c => c.contentId === content.contentId);

        if (contentComments.length > 0) {
          topicsWithComments++;
          logger.warn(`[DEBUG] 作品 "${content.title}" (contentId: ${content.contentId}) 有 ${contentComments.length} 条评论`);
        }

        const topic = {
          id: content.contentId,
          channelId: channelId,
          title: content.title || '无标题作品',
          description: content.description || '',
          createdTime: content.publishTime || Date.now(),
          lastMessageTime: content.lastCrawlTime || Date.now(),
          messageCount: contentComments.length,
          unreadCount: contentComments.filter(c => c.isHandled === undefined || !c.isHandled).length,  // 修改：使用 isHandled 而不是 isNew，默认未处理
          isPinned: false
        };

        topics.push(topic);
      }
      logger.info(`[DEBUG] Created ${topics.length} topics from contents`);
      logger.warn(`[DEBUG] 其中有评论的主题数: ${topicsWithComments}`);
    } else {
      logger.warn(`[DEBUG] No contents found or contents is empty`);
    }

    // 从会话创建主题
    if (conversationsSize > 0) {
      logger.info(`[DEBUG] Processing ${conversationsSize} conversations`);
      const beforeCount = topics.length;
      const conversationsList = dataObj.conversations instanceof Map ? Array.from(dataObj.conversations.values()) : dataObj.conversations;
      const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : (dataObj.messages || []);

      for (const conversation of conversationsList) {
        // 计算该会话的消息数（使用 camelCase: conversationId）
        const conversationMessages = messagesList.filter(m => m.conversationId === conversation.conversationId);

        const topic = {
          id: conversation.conversationId,
          channelId: channelId,
          title: conversation.userName || '未知用户',
          description: `私信会话`,
          createdTime: conversation.createdAt || Date.now(),
          lastMessageTime: conversation.updatedAt || Date.now(),
          messageCount: conversationMessages.length,
          unreadCount: conversation.unreadCount || 0,
          isPinned: false,
          isPrivate: true  // ✅ 新增: 标记为私信主题
        };

        topics.push(topic);
      }
      logger.info(`[DEBUG] Created ${topics.length - beforeCount} topics from conversations`);
    } else {
      logger.warn(`[DEBUG] No conversations found or conversations is empty`);
    }

    // 按最后消息时间排序
    topics.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

    logger.info(`[DEBUG] Total topics created: ${topics.length}`);

    return topics;
  }

  /**
   * 从 DataStore 获取消息列表
   */
  getMessagesFromDataStore(topicId) {
    const messages = [];

    // 遍历所有账户查找该主题的消息
    for (const [accountId, accountData] of this.dataStore.accounts) {
      // DataStore 数据结构是 {accountId, platform, lastUpdate, data}
      const dataObj = accountData.data || accountData;

      // 查找评论消息 (topicId = contentId，使用 camelCase)
      if (dataObj.comments) {
        const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : dataObj.comments;
        const comments = commentsList.filter(c => c.contentId === topicId);
        for (const comment of comments) {
          // 如果是作者回复，fromId 设置为 'monitor_client'，fromName 设置为 '客服'
          const isAuthorReply = comment.isAuthorReply || false;
          // 处理 parentCommentId: "0" 表示顶级评论(没有父评论)
          const parentId = comment.parentCommentId;
          // 将 "0", 0, null, undefined, "" 都转换为 null
          const replyToId = (!parentId || parentId === '0' || parentId === 0) ? null : parentId;

          // DEBUG: 输出转换结果
          if (comment.commentId === '7566864433692459826') {
            logger.info(`[DEBUG] parentId="${parentId}", type=${typeof parentId}, replyToId=${replyToId}`);
          }

          messages.push({
            id: comment.commentId,
            channelId: accountId,
            topicId: topicId,
            fromName: isAuthorReply ? '客服' : (comment.authorName || '未知用户'),
            fromId: isAuthorReply ? 'monitor_client' : (comment.authorId || ''),
            content: comment.content || '',
            type: 'comment',  // ✅ 修改: 评论消息类型为 'comment'
            messageCategory: 'comment',  // ✅ 新增: 消息分类为 'comment'
            timestamp: comment.createdAt || Date.now(),
            serverTimestamp: comment.detectedAt || Date.now(),
            replyToId: replyToId,  // ✅ 修复: "0" 转换为 null
            replyToContent: null,
            direction: isAuthorReply ? 'outgoing' : 'incoming',  // 作者回复为outgoing，其他为incoming
            isAuthorReply: isAuthorReply,
            isHandled: comment.isHandled || false  // ✅ 新增: 是否已处理，默认为 false
          });
        }
      }

      // 查找私信消息 (topicId = conversationId，使用 camelCase)
      if (dataObj.messages) {
        const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : dataObj.messages;
        const msgs = messagesList.filter(m => m.conversationId === topicId);
        for (const msg of msgs) {
          // 如果是 outgoing 消息（我发的），fromId 设置为 'monitor_client'，fromName 设置为 '客服'
          const isOutgoing = msg.direction === 'outgoing';
          messages.push({
            id: msg.messageId,
            channelId: accountId,
            topicId: topicId,
            fromName: isOutgoing ? '客服' : (msg.senderName || '未知用户'),
            fromId: isOutgoing ? 'monitor_client' : (msg.senderId || ''),
            content: msg.content || '',
            type: msg.messageType || 'text',
            messageCategory: 'private',  // ✅ 新增: 消息分类为 'private'
            timestamp: msg.createdAt || Date.now(),
            serverTimestamp: msg.detectedAt || Date.now(),
            replyToId: null,
            replyToContent: null,
            direction: msg.direction || 'incoming',  // 消息方向：incoming/outgoing
            recipientId: msg.recipientId || '',
            recipientName: msg.recipientName || '',
            isHandled: msg.isHandled || false  // ✅ 新增: 是否已处理，默认为 false
          });
        }
      }
    }

    // 按时间排序
    messages.sort((a, b) => a.timestamp - b.timestamp);

    return messages;
  }

  /**
   * 计算未读消息数（使用 camelCase 字段名）
   */
  calculateUnreadCount(dataObj) {
    let unreadCount = 0;

    // 处理 Map 或 Array
    const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);
    const conversationsList = dataObj.conversations instanceof Map ? Array.from(dataObj.conversations.values()) : (dataObj.conversations || []);

    // 计算未读评论数（使用 isHandled 而不是 isNew）
    if (commentsList.length > 0) {
      unreadCount += commentsList.filter(c => c.isHandled === undefined || !c.isHandled).length;
    }

    // 计算未读会话消息数（使用 camelCase: unreadCount）
    if (conversationsList.length > 0) {
      unreadCount += conversationsList.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
    }

    return unreadCount;
  }

  /**
   * 查找最新消息（使用 camelCase 字段名）
   */
  findLastMessage(dataObj) {
    let lastMessage = null;
    let latestTime = 0;

    // 处理 Map 或 Array
    const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);
    const messagesList = dataObj.messages instanceof Map ? Array.from(dataObj.messages.values()) : (dataObj.messages || []);

    // 检查评论（使用 camelCase: createdAt）
    if (commentsList.length > 0) {
      const latestComment = commentsList.reduce((latest, current) => {
        return (current.createdAt > latest.createdAt) ? current : latest;
      });
      if (latestComment.createdAt > latestTime) {
        latestTime = latestComment.createdAt;
        lastMessage = {
          content: latestComment.content,
          timestamp: latestComment.createdAt
        };
      }
    }

    // 检查私信（使用 camelCase: createdAt）
    if (messagesList.length > 0) {
      const latestMsg = messagesList.reduce((latest, current) => {
        return (current.createdAt > latest.createdAt) ? current : latest;
      });
      if (latestMsg.createdAt > latestTime) {
        latestTime = latestMsg.createdAt;
        lastMessage = {
          content: latestMsg.content,
          timestamp: latestMsg.createdAt
        };
      }
    }

    return lastMessage;
  }

  /**
   * 广播消息给所有监控客户端
   */
  broadcastToMonitors(event, data) {
    // 发送给监控客户端
    this.monitorClients.forEach((socketId, clientId) => {
      this.io.to(socketId).emit(event, data);
    });

    // 发送给管理页面
    this.adminClients.forEach((socketId, clientId) => {
      this.io.to(socketId).emit(event, data);
    });

    logger.debug(`[IM WS] Broadcasted ${event} to ${this.monitorClients.size} monitors and ${this.adminClients.size} admins`);
  }

  /**
   * 当 Worker 推送新数据到 DataStore 时调用
   * 通知所有连接的客户端
   */
  onDataStoreUpdate(accountId) {
    logger.info(`[IM WS] DataStore updated for account: ${accountId}`);

    // 通知客户端刷新频道列表
    const channels = this.getChannelsFromDataStore();
    this.broadcastToMonitors('monitor:channels', { channels });
  }

  /**
   * 当收到新消息时通知客户端
   */
  onNewMessage(accountId, message) {
    logger.info(`[IM WS] New message for account: ${accountId}`);

    // 广播新消息
    this.broadcastToMonitors('channel:message', {
      ...message,
      channelId: accountId
    });
  }

  // ============================================================================
  // 已读状态处理方法
  // ============================================================================

  /**
   * 处理单条消息标记已读
   */
  handleMarkAsRead(socket, data) {
    try {
      const { type, id, channelId } = data;

      if (!type || !id) {
        socket.emit('error', { message: '缺少必要参数: type 和 id' });
        return;
      }

      if (!this.commentsDAO && !this.messagesDAO) {
        socket.emit('error', { message: '已读功能未启用（缺少 DAO）' });
        return;
      }

      let success = false;
      const readAt = Math.floor(Date.now() / 1000);

      if (type === 'comment' && this.commentsDAO) {
        success = this.commentsDAO.markAsRead(id, readAt);
      } else if (type === 'message' && this.messagesDAO) {
        success = this.messagesDAO.markAsRead(id, readAt);
      } else {
        socket.emit('error', { message: `不支持的消息类型: ${type}` });
        return;
      }

      if (success) {
        // 响应客户端
        socket.emit('monitor:mark_as_read_response', {
          success: true,
          id,
          type,
          read_at: readAt
        });

        // 广播给所有客户端
        this.broadcastToMonitors('monitor:message_read', {
          type,
          id,
          channelId,
          read_at: readAt
        });

        logger.info(`[IM WS] Message marked as read: ${type}/${id}`);
      } else {
        socket.emit('error', { message: '标记失败：消息不存在' });
      }

    } catch (error) {
      logger.error('[IM WS] Mark as read error:', error);
      socket.emit('error', { message: '标记已读失败' });
    }
  }

  /**
   * 处理批量标记已读
   */
  handleMarkBatchAsRead(socket, data) {
    try {
      const { type, ids, channelId } = data;

      if (!type || !ids || !Array.isArray(ids)) {
        socket.emit('error', { message: '缺少必要参数: type 和 ids 数组' });
        return;
      }

      if (!this.commentsDAO && !this.messagesDAO) {
        socket.emit('error', { message: '已读功能未启用（缺少 DAO）' });
        return;
      }

      let count = 0;
      const readAt = Math.floor(Date.now() / 1000);

      if (type === 'comment' && this.commentsDAO) {
        count = this.commentsDAO.markBatchAsRead(ids, readAt);
      } else if (type === 'message' && this.messagesDAO) {
        count = this.messagesDAO.markBatchAsRead(ids, readAt);
      } else {
        socket.emit('error', { message: `不支持的消息类型: ${type}` });
        return;
      }

      // 响应客户端
      socket.emit('monitor:mark_batch_as_read_response', {
        success: true,
        count,
        type,
        read_at: readAt
      });

      // 广播给所有客户端
      this.broadcastToMonitors('monitor:messages_read', {
        type,
        ids,
        channelId,
        count,
        read_at: readAt
      });

      logger.info(`[IM WS] ${count} messages marked as read: ${type}`);

    } catch (error) {
      logger.error('[IM WS] Batch mark as read error:', error);
      socket.emit('error', { message: '批量标记已读失败' });
    }
  }

  /**
   * 处理按作品标记所有评论已读
   */
  handleMarkTopicAsRead(socket, data) {
    try {
      const { channelId, topicId } = data;

      if (!channelId || !topicId) {
        socket.emit('error', { message: '缺少必要参数: channelId 和 topicId' });
        return;
      }

      if (!this.commentsDAO) {
        socket.emit('error', { message: '评论已读功能未启用（缺少 CommentsDAO）' });
        return;
      }

      const readAt = Math.floor(Date.now() / 1000);
      const count = this.commentsDAO.markTopicAsRead(topicId, channelId, readAt);

      // 响应客户端
      socket.emit('monitor:mark_topic_as_read_response', {
        success: true,
        count,
        topicId,
        channelId,
        read_at: readAt
      });

      // 广播给所有客户端
      this.broadcastToMonitors('monitor:topic_read', {
        topicId,
        channelId,
        count,
        read_at: readAt
      });

      logger.info(`[IM WS] ${count} comments in topic ${topicId} marked as read`);

    } catch (error) {
      logger.error('[IM WS] Mark topic as read error:', error);
      socket.emit('error', { message: '按作品标记已读失败' });
    }
  }

  /**
   * 处理按会话标记所有私信已读
   */
  handleMarkConversationAsRead(socket, data) {
    try {
      const { channelId, conversationId } = data;

      if (!channelId || !conversationId) {
        socket.emit('error', { message: '缺少必要参数: channelId 和 conversationId' });
        return;
      }

      if (!this.messagesDAO) {
        socket.emit('error', { message: '私信已读功能未启用（缺少 MessagesDAO）' });
        return;
      }

      const readAt = Math.floor(Date.now() / 1000);
      const count = this.messagesDAO.markConversationAsRead(conversationId, channelId, readAt);

      // 响应客户端
      socket.emit('monitor:mark_conversation_as_read_response', {
        success: true,
        count,
        conversationId,
        channelId,
        read_at: readAt
      });

      // 广播给所有客户端
      this.broadcastToMonitors('monitor:conversation_read', {
        conversationId,
        channelId,
        count,
        read_at: readAt
      });

      logger.info(`[IM WS] ${count} messages in conversation ${conversationId} marked as read`);

    } catch (error) {
      logger.error('[IM WS] Mark conversation as read error:', error);
      socket.emit('error', { message: '按会话标记已读失败' });
    }
  }

  /**
   * 处理获取未读计数
   */
  handleGetUnreadCount(socket, data) {
    try {
      const { channelId } = data || {};

      if (!this.commentsDAO && !this.messagesDAO) {
        socket.emit('error', { message: '未读计数功能未启用（缺少 DAO）' });
        return;
      }

      let unreadCounts = {
        comments: 0,
        messages: 0,
        total: 0
      };

      if (channelId) {
        // 查询特定频道的未读数
        if (this.commentsDAO) {
          unreadCounts.comments = this.commentsDAO.countUnread(channelId);
        }
        if (this.messagesDAO) {
          unreadCounts.messages = this.messagesDAO.countUnread(channelId);
        }
        unreadCounts.total = unreadCounts.comments + unreadCounts.messages;

        socket.emit('monitor:unread_count_response', {
          success: true,
          channelId,
          unread: unreadCounts
        });
      } else {
        // 查询所有频道的未读数（按频道分组）
        const byChannel = {};

        if (this.commentsDAO) {
          const commentsByAccount = this.commentsDAO.countUnreadByAccount();
          for (const [accountId, count] of Object.entries(commentsByAccount)) {
            if (!byChannel[accountId]) {
              byChannel[accountId] = { comments: 0, messages: 0, total: 0 };
            }
            byChannel[accountId].comments = count;
            byChannel[accountId].total += count;
            unreadCounts.comments += count;
          }
        }

        if (this.messagesDAO) {
          const messagesByAccount = this.messagesDAO.countUnreadByAccount();
          for (const [accountId, count] of Object.entries(messagesByAccount)) {
            if (!byChannel[accountId]) {
              byChannel[accountId] = { comments: 0, messages: 0, total: 0 };
            }
            byChannel[accountId].messages = count;
            byChannel[accountId].total += count;
            unreadCounts.messages += count;
          }
        }

        unreadCounts.total = unreadCounts.comments + unreadCounts.messages;

        socket.emit('monitor:unread_count_response', {
          success: true,
          unread: unreadCounts,
          byChannel
        });
      }

      logger.debug(`[IM WS] Unread count: ${unreadCounts.total} (comments: ${unreadCounts.comments}, messages: ${unreadCounts.messages})`);

    } catch (error) {
      logger.error('[IM WS] Get unread count error:', error);
      socket.emit('error', { message: '获取未读计数失败' });
    }
  }
}

module.exports = IMWebSocketServer;
