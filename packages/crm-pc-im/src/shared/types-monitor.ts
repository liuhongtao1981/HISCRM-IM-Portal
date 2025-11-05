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
  description?: string // 作品描述
  createdTime: number  // 创建时间
  lastMessageTime?: number  // 最后消息时间
  messageCount: number // 消息总数
  unreadCount: number  // 未读消息数
  lastMessage?: string // 最后一条消息内容
  isPinned: boolean    // 是否置顶
  isPrivate?: boolean  // 是否为私信主题
}

// 消息 (属于某个作品)
export interface Message {
  id: string
  topicId: string      // 所属作品ID
  channelId: string    // 所属新媒体账户ID
  fromName?: string    // 发送者名称
  fromId?: string      // 发送者ID
  content: string
  type: 'text' | 'file' | 'image' | 'comment' // 消息类型
  messageCategory?: 'private' | 'comment' // 消息分类: 私信或评论
  timestamp: number
  serverTimestamp?: number
  fileUrl?: string
  fileName?: string
  replyToId?: string   // 回复的消息ID (如果是回复消息)
  replyToContent?: string // 被回复的消息内容
  isHandled?: boolean  // 是否已处理
}

// 新媒体账户消息 (为了兼容旧的WebSocket事件)
export interface ChannelMessage {
  id: string
  channelId: string    // 所属新媒体账户(账户ID)
  topicId?: string     // 所属作品ID (新增)
  fromName?: string    // 发送者名称
  fromId?: string      // 发送者ID
  content: string
  type: 'text' | 'file' | 'image' | 'comment'
  messageCategory?: 'private' | 'comment' // 消息分类: 私信或评论
  timestamp: number
  serverTimestamp?: number
  fileUrl?: string
  fileName?: string
  replyToId?: string   // 回复的消息ID
  isHandled?: boolean  // 是否已处理
}
