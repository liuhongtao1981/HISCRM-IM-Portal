/**
 * IM WebSocket 服务器
 * 实现 CRM IM Server 的 WebSocket 协议
 * 数据源: DataStore (Worker 推送的内存数据)
 */

const { createLogger } = require('@hiscrm-im/shared/utils/logger');

const logger = createLogger('im-websocket');

class IMWebSocketServer {
  constructor(io, dataStore, cacheDAO = null, accountDAO = null) {
    this.io = io;
    this.dataStore = dataStore;
    this.cacheDAO = cacheDAO;
    this.accountDAO = accountDAO;

    // 在线客户端管理
    this.monitorClients = new Map(); // clientId -> socketId
    this.adminClients = new Map();   // adminId -> socketId
    this.socketToClientId = new Map(); // socketId -> clientId

    logger.info('IM WebSocket Server initialized with CacheDAO and AccountDAO support');
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
      logger.error('[IM WS] Error stack:', error.stack);
      logger.error('[IM WS] accountDAO status:', this.accountDAO ? 'initialized' : 'NOT initialized');
      socket.emit('error', { message: '监控注册失败', details: error.message });
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
        isRead: false  // ✅ 统一使用 isRead 字段，默认未读
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

      // ✅ 从数据库查询账户信息（获取平台昵称和用户信息）
      let accountInfo = null;
      if (this.accountDAO) {
        try {
          accountInfo = this.accountDAO.findById(accountId);  // ✅ 正确的方法名
        } catch (error) {
          logger.warn(`[IM WS] Failed to get account info for ${accountId}:`, error.message);
        }
      } else {
        logger.warn('[IM WS] accountDAO is not initialized, using default values');
      }
      const accountName = accountInfo?.account_name || accountId;
      const avatar = accountInfo?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${accountId}`;
      const userInfo = accountInfo?.user_info || null;  // ✅ 获取用户信息字段
      const platform = accountData.platform || accountInfo?.platform || '';

      // 计算未读消息数
      const unreadCount = this.calculateUnreadCount(dataObj);

      // 查找最新消息
      const lastMessage = this.findLastMessage(dataObj);

      // 🔍 DEBUG: 打印 lastMessage 的内容
      if (lastMessage) {
        logger.info(`[DEBUG] lastMessage 对象:`);
        logger.info(`  content: ${lastMessage.content}`);
        logger.info(`  timestamp: ${lastMessage.timestamp}`);
        logger.info(`  typeof timestamp: ${typeof lastMessage.timestamp}`);
        logger.info(`  转换为日期: ${new Date(lastMessage.timestamp).toLocaleString('zh-CN')}`);
      }

      const channel = {
        id: accountId,
        name: accountName,  // ✅ 使用数据库中的平台昵称
        avatar: avatar,     // ✅ 使用数据库中的头像
        userInfo: userInfo, // ✅ 包含详细的用户信息（nickname, douyin_id等）
        platform: platform, // ✅ 平台标识
        description: accountData.platform || '',
        lastMessage: lastMessage?.content || '',
        lastMessageTime: lastMessage?.timestamp || accountData.lastUpdate || Date.now(),
        unreadCount: unreadCount,
        messageCount: dataObj.messages?.length || 0,
        isPinned: false,
        enabled: true
      };

      // 🔍 DEBUG: 打印 channel 对象
      logger.info(`[DEBUG] Channel 对象:`);
      logger.info(`  id: ${channel.id}`);
      logger.info(`  name: ${channel.name}`);  // ✅ DEBUG: 打印账户名称
      logger.info(`  avatar: ${channel.avatar?.substring(0, 60)}...`);
      logger.info(`  userInfo: ${channel.userInfo ? '存在' : '不存在'}`);
      if (channel.userInfo) {
        try {
          const parsed = JSON.parse(channel.userInfo);
          logger.info(`  userInfo.nickname: ${parsed.nickname}`);
          logger.info(`  userInfo.douyin_id: ${parsed.douyin_id || parsed.platformUserId}`);
        } catch (e) {
          logger.error(`  ❌ userInfo 解析失败: ${e.message}`);
        }
      }
      logger.info(`  platform: ${channel.platform}`);
      logger.info(`  lastMessageTime: ${channel.lastMessageTime}`);
      logger.info(`  typeof lastMessageTime: ${typeof channel.lastMessageTime}`);
      logger.info(`  转换为日期: ${new Date(channel.lastMessageTime).toLocaleString('zh-CN')}`);

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
    // ✅ 辅助函数: 归一化时间戳到毫秒级 (13位)
    const normalizeTimestamp = (timestamp) => {
      if (!timestamp) return Date.now();

      // 🔧 处理字符串类型的时间戳
      if (typeof timestamp === 'string') {
        // ✅ 优先尝试解析 ISO 8601 格式 (YYYY-MM-DDTHH:mm:ss.sssZ)
        if (timestamp.includes('T') || timestamp.includes('-')) {
          const isoDate = new Date(timestamp);
          if (!isNaN(isoDate.getTime())) {
            return isoDate.getTime();  // 返回毫秒级时间戳
          }
        }

        // 尝试解析中文日期字符串 "发布于2025年11月02日 09:00"
        const match = timestamp.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
        if (match) {
          const [, year, month, day, hour, minute] = match;
          const date = new Date(
            parseInt(year),
            parseInt(month) - 1,  // 月份从 0 开始
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
          );
          logger.debug(`[DEBUG] 解析中文日期字符串: ${timestamp} → ${date.getTime()}`);
          return date.getTime();  // 返回毫秒级时间戳
        }

        // 如果是纯数字字符串，转换为数字
        const numericTimestamp = parseInt(timestamp);
        if (!isNaN(numericTimestamp)) {
          timestamp = numericTimestamp;
        } else {
          // 无法解析，返回当前时间
          logger.warn(`[DEBUG] 无法解析时间戳字符串: ${timestamp}`);
          return Date.now();
        }
      }

      // 处理数字类型的时间戳
      // 如果是秒级 (10位),转换为毫秒
      if (timestamp < 10000000000) {
        return timestamp * 1000;
      }
      // 如果已经是毫秒级 (13位),直接返回
      return timestamp;
    };

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

        // ✅ 修复: 计算该作品的最新评论时间（从评论列表中获取，而不是 lastCrawlTime）
        let actualLastCommentTime = content.lastCrawlTime;
        if (contentComments.length > 0) {
          const sortedComments = [...contentComments].sort((a, b) => {
            const aTime = a.createdAt || a.timestamp || 0;
            const bTime = b.createdAt || b.timestamp || 0;
            return bTime - aTime;
          });
          const latestComment = sortedComments[0];
          actualLastCommentTime = latestComment.createdAt || latestComment.timestamp || content.lastCrawlTime;
        }

        const topic = {
          id: content.contentId,
          channelId: channelId,
          title: content.title || '无标题作品',
          description: content.description || '',
          createdTime: normalizeTimestamp(content.publishTime),  // ✅ 归一化时间戳
          lastMessageTime: normalizeTimestamp(actualLastCommentTime),  // ✅ 修复: 使用评论列表中的实际最新时间
          messageCount: contentComments.length,
          unreadCount: contentComments.filter(c => !c.isRead).length,  // ✅ 统一标准: 使用 isRead 字段
          isPinned: false,
          isPrivate: false  // ✅ 标记为评论主题（非私信）
        };

        // 🔍 DEBUG: 打印前3个作品的时间戳原始值和转换结果
        if (topics.length < 3) {
          logger.info(`[DEBUG] 作品 #${topics.length + 1} 时间戳:`);
          logger.info(`  content.publishTime (原始): ${content.publishTime}`);
          logger.info(`  content.lastCrawlTime (原始): ${content.lastCrawlTime}`);
          logger.info(`  topic.createdTime (归一化后): ${topic.createdTime} → ${new Date(topic.createdTime).toLocaleString('zh-CN')}`);
          logger.info(`  topic.lastMessageTime (归一化后): ${topic.lastMessageTime} → ${new Date(topic.lastMessageTime).toLocaleString('zh-CN')}`);
        }

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

      // 🔍 打印第一个 conversation 对象的完整结构
      if (conversationsList.length > 0) {
        const sampleConv = conversationsList[0];
        logger.info(`[DEBUG] 第一个 conversation 对象:`);
        logger.info(`  conversationId: ${sampleConv.conversationId}`);
        logger.info(`  userName: ${sampleConv.userName}`);
        logger.info(`  createdAt: ${sampleConv.createdAt} (${sampleConv.createdAt ? new Date(sampleConv.createdAt).toLocaleString('zh-CN') : 'N/A'})`);
        logger.info(`  updatedAt: ${sampleConv.updatedAt} (${sampleConv.updatedAt ? new Date(sampleConv.updatedAt).toLocaleString('zh-CN') : 'N/A'})`);
        logger.info(`  lastMessageTime: ${sampleConv.lastMessageTime} (${sampleConv.lastMessageTime ? new Date(sampleConv.lastMessageTime).toLocaleString('zh-CN') : 'N/A'})`);
        logger.info(`  所有字段: ${Object.keys(sampleConv).join(', ')}`);
      }

      for (const conversation of conversationsList) {
        // 计算该会话的消息数（使用 camelCase: conversationId）
        const conversationMessages = messagesList.filter(m => m.conversationId === conversation.conversationId);

        // ✅ 服务端过滤：跳过无消息的会话，不推送给 IM 客户端
        if (conversationMessages.length === 0) {
          logger.debug(`[FILTER] 跳过无消息的会话: ${conversation.userName || conversation.conversationId}`);
          continue;  // 跳过此会话，不添加到 topics 列表
        }

        // ✅ 实时计算未读消息数量（不使用数据库的 unreadCount）
        // 统一标准：使用内存对象的 isRead 字段
        const unreadMessages = conversationMessages.filter(m => !m.isRead);

        // ✅ 计算该会话的最新消息时间（从消息列表中获取，而不是数据库的 lastMessageTime）
        const sortedMessages = [...conversationMessages].sort((a, b) => {
          const aTime = a.createdAt || a.timestamp || 0;
          const bTime = b.createdAt || b.timestamp || 0;
          return bTime - aTime;  // 降序排序，最新的在前
        });
        const latestMessage = sortedMessages[0];
        const actualLastMessageTime = latestMessage ? (latestMessage.createdAt || latestMessage.timestamp) : conversation.lastMessageTime;

        // ✅ 只推送有消息的会话
        const topic = {
          id: conversation.conversationId,
          channelId: channelId,
          title: conversation.userName || '未知用户',
          description: `私信会话 (${conversationMessages.length}条消息)`,
          createdTime: normalizeTimestamp(conversation.createdAt),  // ✅ 修复: 归一化时间戳
          lastMessageTime: normalizeTimestamp(actualLastMessageTime),  // ✅ 修复: 使用消息列表中的实际最新时间
          messageCount: conversationMessages.length,
          unreadCount: unreadMessages.length,  // ✅ 实时计算: 从内存中的消息列表计算未读数量
          isPinned: false,
          isPrivate: true  // ✅ 新增: 标记为私信主题
        };

        topics.push(topic);

        // 🔍 调试日志：打印未读消息计算结果
        if (unreadMessages.length > 0) {
          logger.info(`[UNREAD] 会话 "${conversation.userName}" 有 ${unreadMessages.length} 条未读消息 (总消息数: ${conversationMessages.length})`);
        }
      }

      // 🔍 打印第一个 topic 对象
      if (topics.length > beforeCount) {
        const sampleTopic = topics[beforeCount];
        logger.info(`[DEBUG] 第一个 topic 对象:`);
        logger.info(`  id: ${sampleTopic.id}`);
        logger.info(`  title: ${sampleTopic.title}`);
        logger.info(`  createdTime: ${sampleTopic.createdTime} (${new Date(sampleTopic.createdTime).toLocaleString('zh-CN')})`);
        logger.info(`  lastMessageTime: ${sampleTopic.lastMessageTime} (${new Date(sampleTopic.lastMessageTime).toLocaleString('zh-CN')})`);
      }

      logger.info(`[DEBUG] Created ${topics.length - beforeCount} topics from conversations`);
    } else {
      logger.warn(`[DEBUG] No conversations found or conversations is empty`);
    }

    // ✅ 问题2修复: 排序逻辑 - 优先显示有未读消息的会话，然后按最后消息时间排序
    topics.sort((a, b) => {
      // 1. 优先比较未读数（未读数多的在前）
      if (a.unreadCount !== b.unreadCount) {
        return b.unreadCount - a.unreadCount;
      }
      // 2. 未读数相同，按最后消息时间排序（新的在前）
      return b.lastMessageTime - a.lastMessageTime;
    });

    logger.info(`[DEBUG] Total topics created: ${topics.length}`);

    return topics;
  }

  /**
   * 从 DataStore 获取消息列表
   */
  getMessagesFromDataStore(topicId) {
    const messages = [];

    // ✅ 辅助函数: 归一化时间戳到毫秒级 (13位)
    const normalizeTimestamp = (timestamp) => {
      if (!timestamp) return Date.now();

      // 🔧 处理字符串类型的时间戳
      if (typeof timestamp === 'string') {
        // ✅ 优先尝试解析 ISO 8601 格式 (YYYY-MM-DDTHH:mm:ss.sssZ)
        if (timestamp.includes('T') || timestamp.includes('-')) {
          const isoDate = new Date(timestamp);
          if (!isNaN(isoDate.getTime())) {
            return isoDate.getTime();  // 返回毫秒级时间戳
          }
        }

        // 尝试解析中文日期字符串 "发布于2025年11月02日 09:00"
        const match = timestamp.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
        if (match) {
          const [, year, month, day, hour, minute] = match;
          const date = new Date(
            parseInt(year),
            parseInt(month) - 1,  // 月份从 0 开始
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
          );
          logger.debug(`[DEBUG] 解析中文日期字符串: ${timestamp} → ${date.getTime()}`);
          return date.getTime();  // 返回毫秒级时间戳
        }

        // 如果是纯数字字符串，转换为数字
        const numericTimestamp = parseInt(timestamp);
        if (!isNaN(numericTimestamp)) {
          timestamp = numericTimestamp;
        } else {
          // 无法解析，返回当前时间
          logger.warn(`[DEBUG] 无法解析时间戳字符串: ${timestamp}`);
          return Date.now();
        }
      }

      // 处理数字类型的时间戳
      // 如果是秒级 (10位),转换为毫秒
      if (timestamp < 10000000000) {
        return timestamp * 1000;
      }
      // 如果已经是毫秒级 (13位),直接返回
      return timestamp;
    };

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
            timestamp: normalizeTimestamp(comment.createdAt),  // ✅ 修复: 归一化时间戳
            serverTimestamp: normalizeTimestamp(comment.detectedAt),  // ✅ 修复: 归一化时间戳
            replyToId: replyToId,  // ✅ 修复: "0" 转换为 null
            replyToContent: null,
            direction: isAuthorReply ? 'outgoing' : 'incoming',  // 作者回复为outgoing，其他为incoming
            isAuthorReply: isAuthorReply,
            isRead: comment.isRead || false  // ✅ 统一标准: 使用 isRead 字段
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
            timestamp: normalizeTimestamp(msg.createdAt),  // ✅ 修复: 归一化时间戳
            serverTimestamp: normalizeTimestamp(msg.detectedAt),  // ✅ 修复: 归一化时间戳
            replyToId: null,
            replyToContent: null,
            direction: msg.direction || 'incoming',  // 消息方向：incoming/outgoing
            recipientId: msg.recipientId || '',
            recipientName: msg.recipientName || '',
            isRead: msg.isRead || false  // ✅ 统一标准: 使用 isRead 字段
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

    // 计算未读评论数（✅ 统一标准: 使用 isRead）
    if (commentsList.length > 0) {
      unreadCount += commentsList.filter(c => !c.isRead).length;
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

    // 辅助函数：统一时间戳为毫秒级 (13位)
    const normalizeTimestamp = (timestamp) => {
      if (!timestamp) return Date.now();

      // 🔧 处理字符串类型的时间戳
      if (typeof timestamp === 'string') {
        // ✅ 优先尝试解析 ISO 8601 格式 (YYYY-MM-DDTHH:mm:ss.sssZ)
        if (timestamp.includes('T') || timestamp.includes('-')) {
          const isoDate = new Date(timestamp);
          if (!isNaN(isoDate.getTime())) {
            return isoDate.getTime();  // 返回毫秒级时间戳
          }
        }

        // 尝试解析中文日期字符串 "发布于2025年11月02日 09:00"
        const match = timestamp.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
        if (match) {
          const [, year, month, day, hour, minute] = match;
          const date = new Date(
            parseInt(year),
            parseInt(month) - 1,  // 月份从 0 开始
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
          );
          logger.debug(`[DEBUG] 解析中文日期字符串: ${timestamp} → ${date.getTime()}`);
          return date.getTime();  // 返回毫秒级时间戳
        }

        // 如果是纯数字字符串，转换为数字
        const numericTimestamp = parseInt(timestamp);
        if (!isNaN(numericTimestamp)) {
          timestamp = numericTimestamp;
        } else {
          // 无法解析，返回当前时间
          logger.warn(`[DEBUG] 无法解析时间戳字符串: ${timestamp}`);
          return Date.now();
        }
      }

      // 处理数字类型的时间戳
      // 如果是秒级 (10位)，转换为毫秒级
      if (timestamp < 10000000000) {
        return timestamp * 1000;
      }
      // 如果已经是毫秒级 (13位)，直接返回
      return timestamp;
    };

    // 检查评论（使用 camelCase: createdAt）
    if (commentsList.length > 0) {
      const latestComment = commentsList.reduce((latest, current) => {
        // ✅ 修复: 使用归一化后的时间戳进行比较
        const currentTime = normalizeTimestamp(current.createdAt);
        const latestTime = normalizeTimestamp(latest.createdAt);
        return (currentTime > latestTime) ? current : latest;
      });
      const normalizedTime = normalizeTimestamp(latestComment.createdAt);
      if (normalizedTime > latestTime) {
        latestTime = normalizedTime;
        lastMessage = {
          content: latestComment.content,
          timestamp: normalizedTime  // ✅ 使用标准化后的毫秒级时间戳
        };
      }
    }

    // 检查私信（使用 camelCase: createdAt）
    if (messagesList.length > 0) {
      const latestMsg = messagesList.reduce((latest, current) => {
        // ✅ 修复: 使用归一化后的时间戳进行比较
        const currentTime = normalizeTimestamp(current.createdAt);
        const latestTime = normalizeTimestamp(latest.createdAt);
        return (currentTime > latestTime) ? current : latest;
      });
      const normalizedTime = normalizeTimestamp(latestMsg.createdAt);
      if (normalizedTime > latestTime) {
        latestTime = normalizedTime;
        lastMessage = {
          content: latestMsg.content,
          timestamp: normalizedTime  // ✅ 使用标准化后的毫秒级时间戳
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

      if (!this.cacheDAO) {
        socket.emit('error', { message: '已读功能未启用（缺少 CacheDAO）' });
        return;
      }

      let success = false;
      const readAt = Math.floor(Date.now() / 1000);

      if (type === 'comment') {
        success = this.cacheDAO.markCommentAsRead(id, readAt);

        // ✅ 同步更新内存对象
        if (success && channelId) {
          const accountData = this.dataStore.accounts.get(channelId);
          if (accountData && accountData.data.comments.has(id)) {
            const comment = accountData.data.comments.get(id);
            comment.isRead = true;
            logger.debug(`[IM WS] Memory object updated: comment/${id} isRead=true`);
          }
        }
      } else if (type === 'message') {
        success = this.cacheDAO.markMessageAsRead(id, readAt);

        // ✅ 同步更新内存对象
        if (success && channelId) {
          const accountData = this.dataStore.accounts.get(channelId);
          if (accountData && accountData.data.messages.has(id)) {
            const message = accountData.data.messages.get(id);
            message.isRead = true;
            logger.debug(`[IM WS] Memory object updated: message/${id} isRead=true`);
          }
        }
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

      if (!this.cacheDAO) {
        socket.emit('error', { message: '已读功能未启用（缺少 CacheDAO）' });
        return;
      }

      let count = 0;
      const readAt = Math.floor(Date.now() / 1000);

      if (type === 'comment') {
        count = this.cacheDAO.markCommentsAsRead(ids, readAt);

        // ✅ 同步更新内存对象
        if (count > 0 && channelId) {
          const accountData = this.dataStore.accounts.get(channelId);
          if (accountData) {
            ids.forEach(id => {
              if (accountData.data.comments.has(id)) {
                const comment = accountData.data.comments.get(id);
                comment.isRead = true;
              }
            });
            logger.debug(`[IM WS] Memory objects updated: ${count} comments isRead=true`);
          }
        }
      } else if (type === 'message') {
        count = this.cacheDAO.markMessagesAsRead(ids, readAt);

        // ✅ 同步更新内存对象
        if (count > 0 && channelId) {
          const accountData = this.dataStore.accounts.get(channelId);
          if (accountData) {
            ids.forEach(id => {
              if (accountData.data.messages.has(id)) {
                const message = accountData.data.messages.get(id);
                message.isRead = true;
              }
            });
            logger.debug(`[IM WS] Memory objects updated: ${count} messages isRead=true`);
          }
        }
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

      if (!this.cacheDAO) {
        socket.emit('error', { message: '评论已读功能未启用（缺少 CacheDAO）' });
        return;
      }

      const readAt = Math.floor(Date.now() / 1000);
      const count = this.cacheDAO.markTopicAsRead(topicId, channelId, readAt);

      // ✅ 同步更新内存对象
      if (count > 0 && channelId) {
        const accountData = this.dataStore.accounts.get(channelId);
        if (accountData) {
          // 遍历所有评论，找到属于该作品的评论并标记为已读
          for (const comment of accountData.data.comments.values()) {
            if (comment.contentId === topicId && !comment.isRead) {
              comment.isRead = true;
            }
          }
          logger.debug(`[IM WS] Memory objects updated: topic/${topicId} all comments isRead=true`);
        }
      }

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

      // ✅ 重新推送更新后的 topics（包含新的未读数）
      const updatedTopics = this.getTopicsFromDataStore(channelId);
      this.broadcastToMonitors('monitor:topics', {
        channelId,
        topics: updatedTopics
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

      if (!this.cacheDAO) {
        socket.emit('error', { message: '私信已读功能未启用（缺少 CacheDAO）' });
        return;
      }

      const readAt = Math.floor(Date.now() / 1000);
      const count = this.cacheDAO.markConversationAsRead(conversationId, channelId, readAt);

      // ✅ 同步更新内存对象
      if (count > 0 && channelId) {
        const accountData = this.dataStore.accounts.get(channelId);
        if (accountData) {
          // 遍历所有私信，找到属于该会话的消息并标记为已读
          for (const message of accountData.data.messages.values()) {
            if (message.conversationId === conversationId && !message.isRead) {
              message.isRead = true;
            }
          }
          logger.debug(`[IM WS] Memory objects updated: conversation/${conversationId} all messages isRead=true`);
        }
      }

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

      // ✅ 重新推送更新后的 topics（包含新的未读数）
      const updatedTopics = this.getTopicsFromDataStore(channelId);
      this.broadcastToMonitors('monitor:topics', {
        channelId,
        topics: updatedTopics
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

      if (!this.cacheDAO) {
        socket.emit('error', { message: '未读计数功能未启用（缺少 CacheDAO）' });
        return;
      }

      let unreadCounts = {
        comments: 0,
        messages: 0,
        total: 0
      };

      if (channelId) {
        // 查询特定频道的未读数
        unreadCounts.comments = this.cacheDAO.countUnreadComments(channelId);
        unreadCounts.messages = this.cacheDAO.countUnreadMessages(channelId);
        unreadCounts.total = unreadCounts.comments + unreadCounts.messages;

        socket.emit('monitor:unread_count_response', {
          success: true,
          channelId,
          unread: unreadCounts
        });
      } else {
        // 查询所有频道的未读数（按频道分组）
        const byChannel = {};

        const commentsByAccount = this.cacheDAO.countUnreadCommentsByAccount();
        for (const [accountId, count] of Object.entries(commentsByAccount)) {
          if (!byChannel[accountId]) {
            byChannel[accountId] = { comments: 0, messages: 0, total: 0 };
          }
          byChannel[accountId].comments = count;
          byChannel[accountId].total += count;
          unreadCounts.comments += count;
        }

        const messagesByAccount = this.cacheDAO.countUnreadMessagesByAccount();
        for (const [accountId, count] of Object.entries(messagesByAccount)) {
          if (!byChannel[accountId]) {
            byChannel[accountId] = { comments: 0, messages: 0, total: 0 };
          }
          byChannel[accountId].messages = count;
          byChannel[accountId].total += count;
          unreadCounts.messages += count;
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

  /**
   * 启动未读消息定期推送
   * @param {number} interval - 轮询间隔（毫秒），默认 5000ms
   */
  startUnreadNotificationPolling(interval = 5000) {
    // 如果已经有定时器在运行，先停止
    if (this.unreadPollingTimer) {
      clearInterval(this.unreadPollingTimer);
    }

    // 存储上一次的未读数，用于检测变化
    this.lastUnreadCounts = new Map(); // accountId -> { comments, messages, total }

    this.unreadPollingTimer = setInterval(() => {
      this.checkAndPushUnreadNotifications();
    }, interval);

    logger.info(`[IM WS] Unread notification polling started (interval: ${interval}ms)`);
  }

  /**
   * 停止未读消息定期推送
   */
  stopUnreadNotificationPolling() {
    if (this.unreadPollingTimer) {
      clearInterval(this.unreadPollingTimer);
      this.unreadPollingTimer = null;
      logger.info('[IM WS] Unread notification polling stopped');
    }
  }

  /**
   * 检测并推送未读消息通知
   */
  checkAndPushUnreadNotifications() {
    try {
      // 如果没有连接的客户端，跳过
      if (this.monitorClients.size === 0 && this.adminClients.size === 0) {
        return;
      }

      // 遍历所有账户，检测未读数变化
      const accounts = this.dataStore.accounts; // Map<accountId, AccountData>

      for (const [accountId, accountData] of accounts) {
        if (!accountData || !accountData.data) continue;

        // 计算当前未读数
        const currentUnread = {
          comments: this.calculateUnreadComments(accountData.data),
          messages: this.calculateUnreadMessages(accountData.data),
          total: 0
        };
        currentUnread.total = currentUnread.comments + currentUnread.messages;

        // 获取上一次的未读数
        const lastUnread = this.lastUnreadCounts.get(accountId) || { comments: 0, messages: 0, total: 0 };

        // 检测是否有新的未读消息
        if (currentUnread.total > lastUnread.total) {
          const newComments = currentUnread.comments - lastUnread.comments;
          const newMessages = currentUnread.messages - lastUnread.messages;

          logger.info(`[IM WS] New unread detected for ${accountId}: +${newComments} comments, +${newMessages} messages`);

          // 广播未读数更新
          this.broadcastToMonitors('monitor:unread_update', {
            channelId: accountId,
            unread: currentUnread,
            delta: {
              comments: newComments,
              messages: newMessages,
              total: currentUnread.total - lastUnread.total
            }
          });

          // 更新缓存
          this.lastUnreadCounts.set(accountId, currentUnread);
        } else if (currentUnread.total < lastUnread.total) {
          // 未读数减少（用户标记已读）
          logger.debug(`[IM WS] Unread decreased for ${accountId}: ${lastUnread.total} -> ${currentUnread.total}`);
          this.lastUnreadCounts.set(accountId, currentUnread);
        }
      }
    } catch (error) {
      logger.error('[IM WS] Check unread notifications error:', error);
    }
  }

  /**
   * 计算未读评论数
   * ✅ 统一使用 isRead 字段（与 getTopicsFromDataStore 一致）
   */
  calculateUnreadComments(dataObj) {
    const commentsList = dataObj.comments instanceof Map ? Array.from(dataObj.comments.values()) : (dataObj.comments || []);
    return commentsList.filter(c => !c.isRead).length;  // ✅ 改为使用 isRead
  }

  /**
   * 计算未读私信数
   */
  calculateUnreadMessages(dataObj) {
    const conversationsList = dataObj.conversations instanceof Map ? Array.from(dataObj.conversations.values()) : (dataObj.conversations || []);
    return conversationsList.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
  }
}

module.exports = IMWebSocketServer;
