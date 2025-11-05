/**
 * 统一数据模型定义
 * 所有平台的数据都应该映射到这些标准模型
 *
 * 设计原则：
 * 1. 平台无关：字段名不包含平台特定术语
 * 2. 类型明确：每个字段都有明确的类型和说明
 * 3. 状态管理：每个对象都有状态字段
 * 4. 时间戳：记录创建和更新时间
 * 5. 变更追踪：记录数据来源和变更历史
 */

/**
 * 数据状态枚举
 */
const DataStatus = {
  NEW: 'new',           // 新数据，未推送
  SYNCED: 'synced',     // 已同步到 Master
  UPDATED: 'updated',   // 本地已更新，待同步
  DELETED: 'deleted',   // 已删除，待同步
  ERROR: 'error',       // 同步失败
};

/**
 * 数据来源枚举
 */
const DataSource = {
  API: 'api',           // 来自 API 拦截
  DOM: 'dom',           // 来自 DOM 解析
  REACT_FIBER: 'fiber', // 来自 React Fiber
  MANUAL: 'manual',     // 手动输入
};

/**
 * 基础数据对象
 * 所有数据模型都应该继承此基类
 */
class BaseDataModel {
  constructor() {
    this.id = null;                    // 唯一标识（UUID）
    this.accountId = null;             // 所属账户ID
    this.platform = null;              // 平台标识（douyin/xiaohongshu）

    // 状态管理
    this.status = DataStatus.NEW;      // 数据状态
    this.source = null;                // 数据来源
    this.version = 1;                  // 版本号（用于冲突检测）

    // 时间戳
    this.createdAt = null;             // 创建时间（平台时间）
    this.updatedAt = null;             // 更新时间（平台时间）
    this.localCreatedAt = Date.now();  // 本地创建时间
    this.localUpdatedAt = Date.now();  // 本地更新时间
    this.lastSyncAt = null;            // 最后同步时间

    // 平台原始数据（用于调试）
    this.rawData = null;               // 平台原始数据
  }

  /**
   * 标记为已更新
   */
  markUpdated() {
    this.status = DataStatus.UPDATED;
    this.localUpdatedAt = Date.now();
    this.version++;
  }

  /**
   * 标记为已同步
   */
  markSynced() {
    this.status = DataStatus.SYNCED;
    this.lastSyncAt = Date.now();
  }

  /**
   * 标记为删除
   */
  markDeleted() {
    this.status = DataStatus.DELETED;
    this.localUpdatedAt = Date.now();
  }

  /**
   * 获取用于推送的数据（去除内部字段）
   */
  toSyncData() {
    const { rawData, ...syncData } = this;
    return syncData;
  }
}

/**
 * 会话模型
 * 代表与某个用户/群组的对话
 */
class Conversation extends BaseDataModel {
  constructor() {
    super();

    // 基础信息
    this.conversationId = null;        // 会话ID（平台特定）
    this.type = 'private';             // 会话类型：private/group

    // 对方信息
    this.userId = null;                // 对方用户ID（平台特定）
    this.userName = null;              // 对方用户名
    this.userAvatar = null;            // 对方头像URL
    this.userProfile = null;           // 对方完整资料（可选）

    // 群组信息（仅 type=group 时有效）
    this.groupId = null;               // 群组ID
    this.groupName = null;             // 群组名称
    this.groupAvatar = null;           // 群组头像
    this.memberCount = 0;              // 群组成员数

    // 会话状态
    this.unreadCount = 0;              // 未读消息数
    this.isPinned = false;             // 是否置顶
    this.isMuted = false;              // 是否免打扰
    this.isBlocked = false;            // 是否拉黑

    // 最后消息信息
    this.lastMessageId = null;         // 最后一条消息ID
    this.lastMessageContent = null;    // 最后一条消息内容
    this.lastMessageType = 'text';     // 最后一条消息类型
    this.lastMessageTime = null;       // 最后一条消息时间
    this.lastMessageSenderId = null;   // 最后一条消息发送者ID
  }
}

/**
 * 消息模型
 * 代表单条私信/群消息
 */
class Message extends BaseDataModel {
  constructor() {
    super();

    // 关联信息
    this.messageId = null;             // 消息ID（平台特定）
    this.conversationId = null;        // 所属会话ID

    // 发送者信息
    this.senderId = null;              // 发送者ID（平台特定）
    this.senderName = null;            // 发送者名称
    this.senderAvatar = null;          // 发送者头像

    // 接收者信息
    this.recipientId = null;           // 接收者ID
    this.recipientName = null;         // 接收者名称

    // 消息内容
    this.type = 'text';                // 消息类型：text/image/video/audio/file/link/card
    this.content = null;               // 文本内容
    this.mediaUrl = null;              // 媒体URL（图片/视频/音频）
    this.thumbnailUrl = null;          // 缩略图URL
    this.fileUrl = null;               // 文件URL
    this.fileName = null;              // 文件名
    this.fileSize = 0;                 // 文件大小（字节）

    // 消息状态
    this.direction = 'incoming';       // 方向：incoming/outgoing
    this.status = 'delivered';         // 状态：sending/sent/delivered/read/failed
    this.isRecalled = false;           // 是否已撤回
    this.isRead = false;               // ✅ 是否已读（用于未读数统计）

    // 引用消息（回复功能）
    this.replyToMessageId = null;      // 引用的消息ID
    this.replyToContent = null;        // 引用的消息内容
  }
}

/**
 * 作品模型
 * 代表用户发布的作品（视频/图文等）
 */
class Content extends BaseDataModel {
  constructor() {
    super();

    // 基础信息
    this.contentId = null;             // 作品ID（平台特定）
    this.type = 'video';               // 作品类型：video/image/article/live
    this.title = null;                 // 标题
    this.description = null;           // 描述
    this.coverUrl = null;              // 封面URL
    this.url = null;                   // 作品URL

    // 媒体信息
    this.mediaUrls = [];               // 媒体URL列表（多图/视频）
    this.duration = 0;                 // 时长（秒，仅视频）
    this.width = 0;                    // 宽度（像素）
    this.height = 0;                   // 高度（像素）

    // 作者信息
    this.authorId = null;              // 作者ID
    this.authorName = null;            // 作者名称
    this.authorAvatar = null;          // 作者头像

    // 统计数据
    this.viewCount = 0;                // 播放/浏览数
    this.likeCount = 0;                // 点赞数
    this.commentCount = 0;             // 评论数
    this.shareCount = 0;               // 分享数
    this.collectCount = 0;             // 收藏数

    // 发布信息
    this.publishTime = null;           // 发布时间
    this.location = null;              // 发布地点
    this.tags = [];                    // 标签列表

    // 状态
    this.visibility = 'public';        // 可见性：public/private/friends
    this.isTop = false;                // 是否置顶
    this.allowComment = true;          // 是否允许评论
    this.allowShare = true;            // 是否允许分享
  }
}

/**
 * 评论模型
 * 代表对作品的评论
 */
class Comment extends BaseDataModel {
  constructor() {
    super();

    // 关联信息
    this.commentId = null;             // 评论ID（平台特定）
    this.contentId = null;             // 所属作品ID
    this.parentCommentId = null;       // 父评论ID（如果是回复）

    // 作者信息
    this.authorId = null;              // 评论者ID
    this.authorName = null;            // 评论者名称
    this.authorAvatar = null;          // 评论者头像
    this.authorLevel = null;           // 评论者等级

    // 评论内容
    this.content = null;               // 评论文本
    this.images = [];                  // 评论图片URL列表

    // 回复信息
    this.replyToUserId = null;         // @的用户ID
    this.replyToUserName = null;       // @的用户名称

    // 统计数据
    this.likeCount = 0;                // 点赞数
    this.replyCount = 0;               // 回复数

    // 状态
    this.isPinned = false;             // 是否置顶
    this.isAuthorReply = false;        // 是否作者回复
    this.isLiked = false;              // 当前账户是否点赞
    this.isRead = false;               // ✅ 是否已读（用于未读数统计）
  }
}

/**
 * 通知模型
 * 代表系统通知、点赞、关注等
 */
class Notification extends BaseDataModel {
  constructor() {
    super();

    // 基础信息
    this.notificationId = null;        // 通知ID（平台特定）
    this.type = 'like';                // 通知类型：like/comment/follow/mention/system

    // 触发者信息
    this.triggerId = null;             // 触发者ID
    this.triggerName = null;           // 触发者名称
    this.triggerAvatar = null;         // 触发者头像

    // 关联内容
    this.relatedContentId = null;      // 关联作品ID
    this.relatedCommentId = null;      // 关联评论ID

    // 通知内容
    this.title = null;                 // 通知标题
    this.content = null;               // 通知内容
    this.imageUrl = null;              // 通知图片
    this.linkUrl = null;               // 跳转链接

    // 状态
    this.isRead = false;               // 是否已读
  }
}

/**
 * 数据集合（用于批量管理）
 */
class DataCollection {
  constructor(ModelClass) {
    this.ModelClass = ModelClass;
    this.items = new Map();            // id -> Model 实例
    this.dirtyIds = new Set();         // 待同步的 ID 集合
  }

  /**
   * 添加或更新数据
   */
  set(id, data) {
    if (this.items.has(id)) {
      // 更新现有数据
      const existing = this.items.get(id);
      Object.assign(existing, data);
      existing.markUpdated();
    } else {
      // 创建新数据
      const instance = new this.ModelClass();
      Object.assign(instance, data);
      instance.id = id;
      this.items.set(id, instance);
    }
    this.dirtyIds.add(id);
  }

  /**
   * 获取数据
   */
  get(id) {
    return this.items.get(id);
  }

  /**
   * 删除数据
   */
  delete(id) {
    const item = this.items.get(id);
    if (item) {
      item.markDeleted();
      this.dirtyIds.add(id);
    }
  }

  /**
   * 获取所有待同步的数据
   */
  getDirtyData() {
    const dirty = [];
    for (const id of this.dirtyIds) {
      const item = this.items.get(id);
      if (item && item.status !== DataStatus.SYNCED) {
        dirty.push(item.toSyncData());
      }
    }
    return dirty;
  }

  /**
   * 标记数据为已同步
   */
  markSynced(ids) {
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) {
        item.markSynced();
        this.dirtyIds.delete(id);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      total: this.items.size,
      new: 0,
      updated: 0,
      synced: 0,
      deleted: 0,
      error: 0,
    };

    for (const item of this.items.values()) {
      stats[item.status]++;
    }

    return stats;
  }

  /**
   * 清理已同步的旧数据（可选）
   */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) { // 默认7天
    const now = Date.now();
    const toDelete = [];

    for (const [id, item] of this.items.entries()) {
      if (item.status === DataStatus.SYNCED &&
          item.lastSyncAt &&
          (now - item.lastSyncAt) > maxAge) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.items.delete(id);
      this.dirtyIds.delete(id);
    }

    return toDelete.length;
  }
}

module.exports = {
  // 枚举
  DataStatus,
  DataSource,

  // 基类
  BaseDataModel,

  // 数据模型
  Conversation,
  Message,
  Content,
  Comment,
  Notification,

  // 集合管理
  DataCollection,
};
