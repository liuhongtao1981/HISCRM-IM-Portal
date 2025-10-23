/**
 * Redux 聊天状态切片
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Message, Conversation, FriendItem } from '@shared/types'

interface ChatState {
  messages: Message[]
  conversations: Conversation[]
  friends: FriendItem[]
}

const initialState: ChatState = {
  messages: [],
  conversations: [],
  friends: []
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setMessages: (state, action: PayloadAction<Message[]>) => {
      state.messages = action.payload
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload)
    },
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
    setFriends: (state, action: PayloadAction<FriendItem[]>) => {
      state.friends = action.payload
    },
    updateFriendStatus: (state, action: PayloadAction<{ friendId: string; status: 'online' | 'offline' }>) => {
      const friend = state.friends.find(f => f.id === action.payload.friendId)
      if (friend) {
        friend.status = action.payload.status
      }
    },
    clearAllData: (state) => {
      state.messages = []
      state.conversations = []
      state.friends = []
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
  clearAllData
} = chatSlice.actions

export default chatSlice.reducer
