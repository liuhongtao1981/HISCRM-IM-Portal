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
    return {
      // 关联信息
      messageId: String(douyinData.message_id || douyinData.msg_id || `msg_${Date.now()}`),
      conversationId: String(douyinData.conversation_id),

      // 发送者信息
      senderId: String(douyinData.sender_id || douyinData.from_user_id),
      senderName: douyinData.sender_name || douyinData.from_nickname || 'Unknown',
      senderAvatar: this.extractAvatarUrl(douyinData.sender_avatar || douyinData.from_avatar),

      // 接收者信息
      recipientId: String(douyinData.recipient_id || douyinData.to_user_id),
      recipientName: douyinData.recipient_name || douyinData.to_nickname,

      // 消息内容
      type: this.mapMessageType(douyinData.type || douyinData.msg_type),
      content: douyinData.content || douyinData.text || '',
      mediaUrl: this.extractMediaUrl(douyinData),
      thumbnailUrl: douyinData.thumbnail_url || null,

      // 消息状态
      direction: douyinData.direction || 'incoming',
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
    return {
      // 基础信息
      contentId: String(douyinData.aweme_id || douyinData.item_id),
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
      publishTime: douyinData.create_time || douyinData.publish_time || Date.now(),
      location: douyinData.poi_name || null,
      tags: this.extractTags(douyinData),

      // 状态
      visibility: 'public',
      isTop: douyinData.is_top || false,
      allowComment: douyinData.allow_comment !== false,
      allowShare: douyinData.allow_share !== false,

      // 时间戳
      createdAt: douyinData.create_time || Date.now(),
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
   * API: /comment/list 返回 { comment_info_list: [...] }
   */
  mapCommentData(douyinData) {
    return {
      // 关联信息
      commentId: String(douyinData.cid || douyinData.comment_id),
      contentId: String(douyinData.aweme_id || douyinData.item_id),
      parentCommentId: douyinData.reply_id ? String(douyinData.reply_id) : null,

      // 作者信息
      authorId: String(douyinData.user?.uid || douyinData.user_id),
      authorName: douyinData.user?.nickname || douyinData.nickname || 'Unknown',
      authorAvatar: this.extractAvatarUrl(douyinData.user?.avatar_thumb),
      authorLevel: douyinData.user?.level || null,

      // 评论内容
      content: douyinData.text || douyinData.content || '',
      images: this.extractCommentImages(douyinData),

      // 回复信息
      replyToUserId: douyinData.reply_to_userid ? String(douyinData.reply_to_userid) : null,
      replyToUserName: douyinData.reply_to_username || null,

      // 统计数据
      likeCount: douyinData.digg_count || douyinData.like_count || 0,
      replyCount: douyinData.reply_comment_total || douyinData.reply_count || 0,

      // 状态
      isPinned: douyinData.is_pinned || false,
      isAuthorReply: douyinData.is_author || false,
      isLiked: douyinData.user_digged === 1,

      // 时间戳
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
