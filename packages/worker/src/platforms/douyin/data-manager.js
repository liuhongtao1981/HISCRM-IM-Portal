/**
 * 抖音平台数据管理器
 * 实现抖音特定的数据映射逻辑
 */

const { AccountDataManager } = require('../base/account-data-manager');
const { DataSource } = require('../base/data-models');
const { createLogger } = require('@hiscrm-im/shared/utils/logger');

class DouyinDataManager extends AccountDataManager {
  constructor(accountId, dataPusher) {

    super(accountId, 'douyin', dataPusher);
    this.logger = createLogger(`douyin-data:${accountId}`);
  }

  // ==================== 会话数据映射 ====================

  /**
   * 映射抖音会话数据到标准格式
   * API: /creator/im/user_detail/ 返回 { user_list: [...] }
   */
  mapConversationData(douyinData) {
    return {
      // 基础信息
      conversationId: String(douyinData.user_id || douyinData.conversation_id),
      type: 'private', // 抖音目前只支持私聊

      // 对方信息
      userId: String(douyinData.user_id),
      userName: douyinData.user?.nickname || douyinData.nickname || 'Unknown',
      userAvatar: this.extractAvatarUrl(douyinData.user?.avatar_thumb || douyinData.avatar),
      userProfile: douyinData.user || null,

      // 会话状态（API 不提供，使用默认值）
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      isBlocked: false,

      // 最后消息信息（API 不提供，后续从消息中更新）
      lastMessageId: null,
      lastMessageContent: '',
      lastMessageType: 'text',
      lastMessageTime: Date.now(),
      lastMessageSenderId: null,

      // 时间戳
      createdAt: Date.now(),
      updatedAt: Date.now(),

      // 保留原始数据
      rawData: douyinData,
    };
  }

  // ==================== 消息数据映射 ====================

  /**
   * 映射抖音消息数据到标准格式
   * 来源：DOM 提取或 API
   */
  mapMessageData(douyinData) {
    // 发送者和接收者 ID
    // 爬虫v2提取的字段: platform_sender_id, recipient_id
    // 老版本字段: sender_id, from_user_id, to_user_id
    const senderId = String(
      douyinData.platform_sender_id ||
      douyinData.sender_id ||
      douyinData.from_user_id ||
      'unknown'
    );

    const recipientId = String(
      douyinData.recipient_id ||
      douyinData.to_user_id ||
      'unknown'
    );

    // ✅ 关键修复：直接使用 conversation_id，不做任何推断
    // conversation_id 来自 React Fiber props.conversationId，这是抖音前端提供的唯一会话标识
    // 格式可能是复杂的字符串（如 "0:1:userId:otherUserId"），但这个完整字符串才能唯一标识会话
    let conversationId = douyinData.conversation_id;

    // 只有在完全缺失时才记录警告
    if (!conversationId || conversationId === 'undefined') {
      this.logger.warn(`[警告] 消息 ${douyinData.platform_message_id || douyinData.message_id} 缺少 conversation_id！这会导致无法正确分组消息。senderId: ${senderId}, recipientId: ${recipientId}, direction: ${douyinData.direction}`);
      // 使用 senderId 或 recipientId 作为后备
      conversationId = senderId !== 'unknown' ? senderId : recipientId;
    }

    return {
      // 关联信息
      messageId: String(douyinData.message_id || douyinData.msg_id || douyinData.platform_message_id || `msg_${Date.now()}`),
      conversationId: String(conversationId),

      // 发送者信息
      senderId: senderId,
      senderName: douyinData.platform_sender_name || douyinData.sender_name || douyinData.from_nickname || 'Unknown',
      senderAvatar: this.extractAvatarUrl(douyinData.sender_avatar || douyinData.from_avatar),

      // 接收者信息
      recipientId: recipientId,
      recipientName: douyinData.recipient_name || douyinData.to_nickname,

      // 消息内容
      type: this.mapMessageType(douyinData.type || douyinData.msg_type),
      content: douyinData.content || douyinData.text || '',
      mediaUrl: this.extractMediaUrl(douyinData),
      thumbnailUrl: douyinData.thumbnail_url || null,

      // 消息状态
      // ⭐ 统一消息方向命名: incoming → inbound, outgoing → outbound
      direction: this.normalizeDirection(douyinData.direction),
      status: 'delivered',
      isRecalled: douyinData.is_recalled || false,

      // 时间戳
      createdAt: douyinData.created_at || douyinData.create_time || Date.now(),
      updatedAt: Date.now(),

      // 保留原始数据
      rawData: douyinData,
    };
  }

  /**
   * 统一消息方向命名
   * @param {string} direction - 原始方向 ('incoming'|'outgoing'|'inbound'|'outbound')
   * @returns {string} 标准方向 ('inbound'|'outbound')
   */
  normalizeDirection(direction) {
    if (!direction) return 'inbound';
    
    const normalized = direction.toLowerCase();
    if (normalized === 'incoming') return 'inbound';
    if (normalized === 'outgoing') return 'outbound';
    if (normalized === 'inbound') return 'inbound';
    if (normalized === 'outbound') return 'outbound';
    
    // 默认返回 inbound
    return 'inbound';
  }

  /**
   * 映射消息类型
   */
  mapMessageType(douyinType) {
    const typeMap = {
      'text': 'text',
      'image': 'image',
      'video': 'video',
      'audio': 'audio',
      'file': 'file',
      'link': 'link',
      'card': 'card',
    };
    return typeMap[douyinType] || 'text';
  }

  // ==================== 作品数据映射 ====================

  /**
   * 映射抖音作品数据到标准格式
   * API: /creator/item/list 返回 { item_info_list: [...] }
   */
  mapContentData(douyinData) {
    // 优先使用 aweme_id，如果没有则从分享链接提取
    let awemeId = douyinData.aweme_id || douyinData.item_id_plain;
    const secItemId = douyinData.sec_item_id || douyinData.item_id;

    // 如果没有 aweme_id，尝试从 share_url 提取
    if (!awemeId && douyinData.share_url) {
      const match = douyinData.share_url.match(/\/video\/(\d+)/);
      if (match) {
        awemeId = match[1];
        this.logger.info(`✅ [mapContentData] 从 share_url 提取 aweme_id: ${awemeId}`);
      } else {
        this.logger.warn(`⚠️  [mapContentData] 无法从 share_url 提取 aweme_id: ${douyinData.share_url}`);
      }
    }

    // 如果还是没有，尝试从生成的 URL 提取（使用 item_id 作为 aweme_id）
    if (!awemeId && secItemId) {
      // item_id 本身就是 Base64 编码的，不能直接用
      // 但我们可以尝试从其他字段获取
      this.logger.warn(`⚠️  [mapContentData] 作品只有 sec_item_id，无 aweme_id: ${secItemId.substring(0, 40)}...`);
    }

    this.logger.debug(`📝 [mapContentData] ID 字段:`, {
      aweme_id: awemeId,
      sec_item_id: secItemId ? secItemId.substring(0, 40) + '...' : null,
      share_url: douyinData.share_url
    });

    // 优先使用纯数字 ID（与评论匹配）
    const contentId = String(awemeId || secItemId);

    return {
      // 基础信息
      contentId,
      type: this.mapContentType(douyinData),
      title: douyinData.desc || douyinData.title || '',
      description: douyinData.desc || '',
      coverUrl: this.extractCoverUrl(douyinData),
      url: douyinData.share_url || `https://www.douyin.com/video/${douyinData.aweme_id}`,

      // 媒体信息
      mediaUrls: this.extractMediaUrls(douyinData),
      duration: douyinData.duration || douyinData.video?.duration || 0,
      width: douyinData.video?.width || 0,
      height: douyinData.video?.height || 0,

      // 作者信息
      authorId: String(douyinData.author_user_id || douyinData.anchor_user_id),
      authorName: douyinData.author?.nickname || '',
      authorAvatar: this.extractAvatarUrl(douyinData.author?.avatar_thumb),

      // 统计数据
      viewCount: this.extractCount(douyinData, 'play_count', 'view_count'),
      likeCount: this.extractCount(douyinData, 'digg_count', 'like_count'),
      commentCount: this.extractCount(douyinData, 'comment_count'),
      shareCount: this.extractCount(douyinData, 'share_count'),
      collectCount: this.extractCount(douyinData, 'collect_count'),

      // 发布信息
      publishTime: this.parsePublishTime(douyinData.create_time || douyinData.publish_time),
      location: douyinData.poi_name || null,
      tags: this.extractTags(douyinData),

      // 状态
      visibility: 'public',
      isTop: douyinData.is_top || false,
      allowComment: douyinData.allow_comment !== false,
      allowShare: douyinData.allow_share !== false,

      // 时间戳
      createdAt: this.parsePublishTime(douyinData.create_time),
      updatedAt: Date.now(),

      // 保留原始数据
      rawData: douyinData,
    };
  }

  /**
   * 映射作品类型
   */
  mapContentType(douyinData) {
    if (douyinData.aweme_type === 0 || douyinData.media_type === 'video') {
      return 'video';
    }
    if (douyinData.aweme_type === 68 || douyinData.media_type === 'image') {
      return 'image';
    }
    if (douyinData.aweme_type === 4) {
      return 'live';
    }
    return 'video'; // 默认
  }

  // ==================== 评论数据映射 ====================

  /**
   * 映射抖音评论数据到标准格式
   * ✅ 简化版：数据已在 API 回调中通过 normalizeCommentData() 统一转换
   *
   * 注意：此方法接收的 douyinData 已经是统一格式，包含：
   * - comment_id, cid (统一为字符串)
   * - aweme_id, item_id (作品ID已补充)
   * - user_info (统一格式，包含 uid, nickname, avatar_url)
   * - create_time, digg_count, reply_count (统一为数字)
   */
  mapCommentData(douyinData) {
    // ✅ 数据已统一，字段访问简单明了
    const awemeId = douyinData.aweme_id || douyinData.item_id;
    const contentId = awemeId || 'undefined';

    if (contentId === 'undefined' || !contentId) {
      this.logger.warn(`⚠️ [mapCommentData] 评论缺少 aweme_id，这可能是讨论回复`);
    }

    return {
      // 关联信息（字段已统一）
      commentId: String(douyinData.cid || douyinData.comment_id),
      contentId: String(contentId),
      parentCommentId: douyinData.parent_comment_id
        ? String(douyinData.parent_comment_id)
        : null,

      // 作者信息（字段已统一为 user_info）
      authorId: String(douyinData.user_info?.uid || 'unknown'),
      authorName: douyinData.user_info?.nickname || 'Unknown',
      authorAvatar: douyinData.user_info?.avatar_url || null,
      authorLevel: douyinData.user?.level || null,

      // 评论内容（字段已统一）
      content: douyinData.text || douyinData.content || '',
      images: douyinData.image_list || null,

      // 回复信息
      replyToUserId: douyinData.reply_to_userid ? String(douyinData.reply_to_userid) : null,
      replyToUserName: douyinData.reply_to_username || null,

      // 统计数据（类型已统一为数字）
      likeCount: douyinData.digg_count || 0,
      replyCount: douyinData.reply_count || 0,

      // 状态
      isPinned: douyinData.is_pinned || false,
      isAuthorReply: douyinData.is_author || false,
      isLiked: douyinData.user_digged === 1,

      // 时间戳（类型已统一为数字）
      createdAt: douyinData.create_time || Date.now(),
      updatedAt: Date.now(),

      // 保留原始数据
      rawData: douyinData,
    };
  }

  // ==================== 通知数据映射 ====================

  /**
   * 映射抖音通知数据到标准格式
   */
  mapNotificationData(douyinData) {
    return {
      // 基础信息
      notificationId: String(douyinData.notice_id || `notif_${Date.now()}`),
      type: this.mapNotificationType(douyinData.type),

      // 触发者信息
      triggerId: String(douyinData.user?.uid || douyinData.from_user_id),
      triggerName: douyinData.user?.nickname || '',
      triggerAvatar: this.extractAvatarUrl(douyinData.user?.avatar_thumb),

      // 关联内容
      relatedContentId: douyinData.aweme_id ? String(douyinData.aweme_id) : null,
      relatedCommentId: douyinData.comment_id ? String(douyinData.comment_id) : null,

      // 通知内容
      title: douyinData.title || '',
      content: douyinData.content || douyinData.text || '',
      imageUrl: this.extractImageUrl(douyinData),
      linkUrl: douyinData.schema_url || null,

      // 状态
      isRead: douyinData.is_read || false,

      // 时间戳
      createdAt: douyinData.create_time || Date.now(),
      updatedAt: Date.now(),

      // 保留原始数据
      rawData: douyinData,
    };
  }

  /**
   * 映射通知类型
   */
  mapNotificationType(douyinType) {
    const typeMap = {
      '1': 'like',
      '2': 'comment',
      '3': 'follow',
      '4': 'mention',
      '5': 'system',
    };
    return typeMap[String(douyinType)] || 'system';
  }

  // ==================== 辅助方法 ====================

  /**
   * 提取头像 URL
   */
  extractAvatarUrl(avatarData) {
    if (!avatarData) return null;
    if (typeof avatarData === 'string') return avatarData;
    return avatarData.url_list?.[0] || avatarData.url || null;
  }

  /**
   * 提取封面 URL
   */
  extractCoverUrl(contentData) {
    if (contentData.cover_image_url) return contentData.cover_image_url;
    if (contentData.video?.cover?.url_list?.[0]) return contentData.video.cover.url_list[0];
    if (contentData.video?.origin_cover?.url_list?.[0]) return contentData.video.origin_cover.url_list[0];
    return null;
  }

  /**
   * 提取媒体 URL 列表
   */
  extractMediaUrls(contentData) {
    const urls = [];

    // 视频
    if (contentData.video?.play_addr?.url_list) {
      urls.push(...contentData.video.play_addr.url_list);
    }

    // 图片（图集）
    if (contentData.images && Array.isArray(contentData.images)) {
      for (const img of contentData.images) {
        if (img.url_list?.[0]) {
          urls.push(img.url_list[0]);
        }
      }
    }

    return urls;
  }

  /**
   * 提取消息媒体 URL
   */
  extractMediaUrl(messageData) {
    if (messageData.image_url) return messageData.image_url;
    if (messageData.video_url) return messageData.video_url;
    if (messageData.audio_url) return messageData.audio_url;
    if (messageData.media?.url) return messageData.media.url;
    return null;
  }

  /**
   * 提取统计数据
   */
  extractCount(data, ...keys) {
    // 优先从 statistics 中提取
    if (data.statistics) {
      for (const key of keys) {
        if (data.statistics[key] !== undefined) {
          return parseInt(data.statistics[key]) || 0;
        }
      }
    }

    // 直接从数据中提取
    for (const key of keys) {
      if (data[key] !== undefined) {
        return parseInt(data[key]) || 0;
      }
    }

    return 0;
  }

  /**
   * 提取标签
   */
  extractTags(contentData) {
    const tags = [];

    if (contentData.text_extra && Array.isArray(contentData.text_extra)) {
      for (const extra of contentData.text_extra) {
        if (extra.hashtag_name) {
          tags.push(extra.hashtag_name);
        }
      }
    }

    if (contentData.video_tag && Array.isArray(contentData.video_tag)) {
      for (const tag of contentData.video_tag) {
        if (tag.tag_name) {
          tags.push(tag.tag_name);
        }
      }
    }

    return tags;
  }

  /**
   * 解析发布时间（支持中文字符串和时间戳）
   */
  parsePublishTime(publishTime) {
    if (!publishTime) return Date.now();

    // 如果已经是数字（时间戳），直接返回
    if (typeof publishTime === 'number') {
      // 判断是秒级还是毫秒级
      return publishTime < 10000000000 ? publishTime * 1000 : publishTime;
    }

    // 如果是字符串，尝试解析中文日期 "发布于2025年11月04日 14:16"
    if (typeof publishTime === 'string') {
      const match = publishTime.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute] = match;
        const date = new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hour),
          parseInt(minute)
        );
        return date.getTime(); // 返回毫秒时间戳
      }

      // 尝试解析为数字字符串
      const num = Number(publishTime);
      if (!isNaN(num)) {
        return num < 10000000000 ? num * 1000 : num;
      }

      // 尝试解析为标准日期字符串
      const date = new Date(publishTime);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }
    }

    // 无法解析，返回当前时间
    return Date.now();
  }

  /**
   * 提取评论图片
   */
  extractCommentImages(commentData) {
    const images = [];

    if (commentData.image_list && Array.isArray(commentData.image_list)) {
      for (const img of commentData.image_list) {
        if (img.origin_url?.url_list?.[0]) {
          images.push(img.origin_url.url_list[0]);
        }
      }
    }

    return images;
  }

  /**
   * 提取图片 URL
   */
  extractImageUrl(data) {
    if (data.image_url) return data.image_url;
    if (data.cover_url) return data.cover_url;
    if (data.image?.url_list?.[0]) return data.image.url_list[0];
    return null;
  }

  // ==================== ID 生成（覆盖基类） ====================

  generateConversationId(conversation) {
    return `conv_${this.accountId}_${conversation.userId}`;
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
}

module.exports = { DouyinDataManager };
