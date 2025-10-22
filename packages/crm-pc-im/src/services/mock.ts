/**
 * Mock 数据服务
 */

import type { User, FriendItem, Message, Conversation } from '@shared/types'

// Mock 所有可登录的用户
export const mockUsers: Record<string, User> = {
  'user_001': {
    id: 'user_001',
    name: '张三',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John',
    status: 'online'
  },
  'friend_001': {
    id: 'friend_001',
    name: '李四',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    status: 'online'
  },
  'friend_002': {
    id: 'friend_002',
    name: '王五',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
    status: 'online'
  },
  'friend_003': {
    id: 'friend_003',
    name: '赵六',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carol',
    status: 'online'
  }
}

// Mock 当前登录用户 (默认)
export const mockCurrentUser: User = mockUsers['user_001']

// Mock 好友列表
export const mockFriendsList: FriendItem[] = [
  {
    id: 'friend_001',
    name: '李四',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    status: 'online',
    lastSeenTime: Date.now()
  },
  {
    id: 'friend_002',
    name: '王五',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
    status: 'offline',
    lastSeenTime: Date.now() - 3600000
  },
  {
    id: 'friend_003',
    name: '赵六',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Carol',
    status: 'online',
    lastSeenTime: Date.now()
  },
  {
    id: 'friend_004',
    name: '钱七',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
    status: 'offline',
    lastSeenTime: Date.now() - 7200000
  }
]

// Mock 消息数据
export const mockMessages: Message[] = [
  {
    id: 'msg_001',
    fromId: 'friend_001',
    fromName: '李四',
    toId: 'user_001',
    topic: '项目 A - 需求讨论',
    content: '你好，关于项目 A 的需求，我有几个想法想和你讨论',
    type: 'text',
    timestamp: Date.now() - 600000
  },
  {
    id: 'msg_002',
    fromId: 'user_001',
    fromName: '张三',
    toId: 'friend_001',
    topic: '项目 A - 需求讨论',
    content: '好的，我们可以在下午 3 点开个会讨论一下',
    type: 'text',
    timestamp: Date.now() - 540000
  },
  {
    id: 'msg_003',
    fromId: 'friend_001',
    fromName: '李四',
    toId: 'user_001',
    topic: '项目 A - 进度跟进',
    content: '项目 A 的第一阶段已经完成，附件是详细报告',
    type: 'file',
    timestamp: Date.now() - 300000,
    fileUrl: 'http://example.com/files/report.pdf',
    fileName: 'project_a_phase1_report.pdf'
  },
  {
    id: 'msg_004',
    fromId: 'friend_002',
    fromName: '王五',
    toId: 'user_001',
    topic: '项目 B - 技术方案',
    content: '我已经完成了技术方案文档的初稿',
    type: 'text',
    timestamp: Date.now() - 1800000
  }
]

// Mock 会话列表
export const mockConversations: Conversation[] = [
  {
    friendId: 'friend_001',
    friendName: '李四',
    friendAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    topic: '项目 A - 需求讨论',
    lastMessage: mockMessages[1],
    unreadCount: 0,
    isFlashing: false
  },
  {
    friendId: 'friend_001',
    friendName: '李四',
    friendAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
    topic: '项目 A - 进度跟进',
    lastMessage: mockMessages[2],
    unreadCount: 1,
    isFlashing: true
  },
  {
    friendId: 'friend_002',
    friendName: '王五',
    friendAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
    topic: '项目 B - 技术方案',
    lastMessage: mockMessages[3],
    unreadCount: 0,
    isFlashing: false
  }
]

export const getMockLoginUser = () => mockCurrentUser
export const getMockUserById = (userId: string) => mockUsers[userId]
export const getAllMockUsers = () => Object.values(mockUsers)
export const getMockFriendsList = () => mockFriendsList
export const getMockMessages = (friendId?: string, topic?: string) => {
  let filtered = [...mockMessages]
  if (friendId) {
    filtered = filtered.filter(m => m.fromId === friendId || m.toId === friendId)
  }
  if (topic) {
    filtered = filtered.filter(m => m.topic === topic)
  }
  return filtered.sort((a, b) => a.timestamp - b.timestamp)
}
export const getMockConversations = () => mockConversations
