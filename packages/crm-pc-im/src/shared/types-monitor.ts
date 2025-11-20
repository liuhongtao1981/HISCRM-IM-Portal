/**
 * 监控系统的类型定义
 * 架构: 新媒体账户 -> 作品 -> 消息
 */

// 新媒体账户
export interface Channel {
  id: string           // 新媒体账户ID
  name: string         // 新媒体账户名称
  avatar: string       // 头像
  userInfo?: string    // 用户详细信息 (JSON字符串: {nickname, douyin_id, avatar等})
  description?: string // 描述
  platform?: string    // 平台标签 (如: 抖音、快手、小红书)
  enabled: boolean     // 是否启用
  isPinned: boolean    // 是否置顶
  unreadCount: number  // 未读消息数 (所有作品的未读消息总数)
  lastMessage?: string // 最后一条消息内容
  lastMessageTime?: number  // 最后消息时间
  isFlashing: boolean  // 是否正在晃动
  topicCount?: number  // 作品总数
}

// 作品 (一个新媒体账户包含多个作品)
export interface Topic {
  id: string           // 作品ID
  channelId: string    // 所属新媒体账户ID
  title: string        // 作品标题
  avatar?: string      // ✅ 头像URL (私信会话使用对方用户头像，作品使用缩略图)
  description?: string // 作品描述
  createdTime: number  // 创建时间
  lastMessageTime?: number  // 最后消息时间
  lastMessageContent?: string  // ✅ 最后一条消息的内容
  lastMessageFromName?: string // ✅ 最后一条消息的发送者
  messageCount: number // 消息总数
  unreadCount: number  // 未读消息数
  lastMessage?: string // 最后一条消息内容（已废弃，使用 lastMessageContent）
  isPinned: boolean    // 是否置顶
  isPrivate?: boolean  // 是否为私信主题

  // ✅ 作品统计数据
  viewCount?: number     // 浏览数
  likeCount?: number     // 点赞数
  commentCount?: number  // 评论数
  shareCount?: number    // 分享数
  collectCount?: number  // 收藏数
  thumbnail?: string     // 缩略图URL（优先使用，如果没有则使用 avatar）
}

// 消息 (属于某个作品)
export interface Message {
  id: string
  topicId: string      // 所属作品ID
  channelId: string    // 所属新媒体账户ID
  fromName?: string    // 发送者名称
  fromId?: string      // 发送者ID
  authorAvatar?: string // ✅ 新增: 发送者头像URL
  content: string
  type: 'text' | 'file' | 'image' | 'comment' // 消息类型
  messageCategory?: 'private' | 'comment' // 消息分类: 私信或评论
  direction?: 'inbound' | 'outbound' // ✅ 新增: 消息方向 (inbound=用户发的, outbound=客服发的)
  timestamp: number
  serverTimestamp?: number
  fileUrl?: string
  fileName?: string
  replyToId?: string   // 回复的消息ID (如果是回复消息)
  replyToContent?: string // 被回复的消息内容
  isHandled?: boolean  // 是否已处理
  status?: 'sending' | 'sent' | 'failed' // ✅ 新增: 消息状态
  isTemporary?: boolean // ✅ 新增: 是否为临时消息（发送中占位符）
}

// 新媒体账户消息 (为了兼容旧的WebSocket事件)
export interface ChannelMessage {
  id: string
  channelId: string    // 所属新媒体账户(账户ID)
  topicId?: string     // 所属作品ID (新增)
  fromName?: string    // 发送者名称
  fromId?: string      // 发送者ID
  authorAvatar?: string // ✅ 新增: 发送者头像URL
  content: string
  type: 'text' | 'file' | 'image' | 'comment'
  messageCategory?: 'private' | 'comment' // 消息分类: 私信或评论
  timestamp: number
  serverTimestamp?: number
  fileUrl?: string
  fileName?: string
  replyToId?: string   // 回复的消息ID
  isHandled?: boolean  // 是否已处理
  status?: 'sending' | 'sent' | 'failed' // ✅ 新增: 消息状态
  isTemporary?: boolean // ✅ 新增: 是否为临时消息（发送中占位符）
}

// ✨ 新增：新消息简易提示
export interface NewMessageHint {
  channelId: string          // 账户 ID
  platform: string           // 平台（douyin, xiaohongshu）
  messageType: 'comment' | 'private_message'  // 消息类型

  // 评论相关（messageType='comment' 时）
  topicId?: string           // 作品 ID
  topicTitle?: string        // 作品标题
  commentCount?: number      // 该作品新增评论数

  // 私信相关（messageType='private_message' 时）
  conversationId?: string    // 会话 ID
  fromUserId?: string        // 发送者 ID
  fromUserName?: string      // 发送者名称
  messageCount?: number      // 该会话新增消息数

  // 汇总信息
  totalUnreadCount: number   // 该账户总未读数
  timestamp: number          // 时间戳
}
