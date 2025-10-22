/**
 * Redux 聊天状态切片
 *
 * 改进：
 * 1. 添加 loading/error 状态用于推送消息处理
 * 2. 添加 unreadCount 追踪未读消息数量
 * 3. 支持自动去重（相同 ID 的消息不重复添加）
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Message, Conversation, FriendItem } from '@shared/types'

interface ChatState {
  messages: Message[]
  conversations: Conversation[]
  friends: FriendItem[]
  loading: boolean
  error: string | null
  unreadCount: number
}

const initialState: ChatState = {
  messages: [],
  conversations: [],
  friends: [],
  loading: false,
  error: null,
  unreadCount: 0
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    // 消息管理
    setMessages: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      // 自动去重：如果消息 ID 已存在则不添加
      if (!state.messages.find(m => m.id === action.payload.id)) {
        state.messages.push(action.payload)
      }
    },
    // 会话管理
    setConversations: (state, action: PayloadAction<Conversation[]>) => {
      state.conversations = action.payload
    },
    updateConversation: (state, action: PayloadAction<Conversation>) => {
      const index = state.conversations.findIndex(
        c => c.friendId === action.payload.friendId && c.topic === action.payload.topic
      )
      if (index !== -1) {
        state.conversations[index] = action.payload
      }
    },
    addConversation: (state, action: PayloadAction<Conversation>) => {
      const exists = state.conversations.some(
        c => c.friendId === action.payload.friendId && c.topic === action.payload.topic
      )
      if (!exists) {
        state.conversations.push(action.payload)
      }
    },
    // 好友管理
    setFriends: (state, action: PayloadAction<FriendItem[]>) => {
      state.friends = action.payload
    },
    updateFriendStatus: (state, action: PayloadAction<{ friendId: string; status: 'online' | 'offline' }>) => {
      const friend = state.friends.find(f => f.id === action.payload.friendId)
      if (friend) {
        friend.status = action.payload.status
      }
    },
    // 加载和错误状态
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    // 未读计数
    setUnreadCount: (state, action: PayloadAction<number>) => {
      state.unreadCount = action.payload
    },
    incrementUnreadCount: (state) => {
      state.unreadCount++
    },
    clearUnreadCount: (state) => {
      state.unreadCount = 0
    },
    // 批量清除
    clearAllData: (state) => {
      state.messages = []
      state.conversations = []
      state.friends = []
      state.unreadCount = 0
      state.error = null
    }
  }
})

export const {
  setMessages,
  addMessage,
  setConversations,
  updateConversation,
  addConversation,
  setFriends,
  updateFriendStatus,
  setLoading,
  setError,
  setUnreadCount,
  incrementUnreadCount,
  clearUnreadCount,
  clearAllData
} = chatSlice.actions

export default chatSlice.reducer
