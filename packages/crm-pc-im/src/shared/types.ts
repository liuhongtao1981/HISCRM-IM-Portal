/**
 * 共享类型定义
 */

// 用户类型
export interface User {
  id: string
  name: string
  avatar: string
  status: 'online' | 'offline'
}

// 消息类型
export interface Message {
  id: string
  fromId: string
  fromName: string
  toId: string
  topic: string
  content: string
  type: 'text' | 'file'
  timestamp: number
  fileUrl?: string
  fileName?: string
}

// 会话（按好友和作品分组）
export interface Conversation {
  friendId: string
  friendName: string
  friendAvatar: string
  topic: string
  lastMessage: Message
  unreadCount: number
  isFlashing: boolean
}

// 好友列表项
export interface FriendItem {
  id: string
  name: string
  avatar: string
  status: 'online' | 'offline'
  lastSeenTime?: number
}

// WebSocket 消息事件
export interface WebSocketMessage {
  type: 'message' | 'status' | 'file' | 'notification'
  data: any
}

// 文件传输信息
export interface FileTransfer {
  id: string
  fromId: string
  fileName: string
  fileSize: number
  fileUrl: string
  downloadPath: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
  timestamp: number
}
