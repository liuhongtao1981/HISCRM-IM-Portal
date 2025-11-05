/**
 * 监控系统的状态管理
 * 架构: 新媒体账户 -> 作品 -> 消息
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Channel, Topic, Message, ChannelMessage } from '../shared/types-monitor'

interface MonitorState {
  channels: Channel[]
  topics: Record<string, Topic[]>  // channelId -> topics[]
  messages: Record<string, Message[]>  // topicId -> messages[]
  selectedChannelId: string | null
  selectedTopicId: string | null
  isConnected: boolean
  channelPageSize: number  // 每页显示的新媒体账户数
  channelDisplayCount: number  // 当前显示的新媒体账户数
}

const initialState: MonitorState = {
  channels: [],
  topics: {},
  messages: {},
  selectedChannelId: null,
  selectedTopicId: null,
  isConnected: false,
  channelPageSize: 20,
  channelDisplayCount: 999  // 显示所有账户
}

const monitorSlice = createSlice({
  name: 'monitor',
  initialState,
  reducers: {
    // 设置新媒体账户列表
    setChannels: (state, action: PayloadAction<Channel[]>) => {
      state.channels = action.payload.map(ch => ({
        ...ch,
        unreadCount: ch.unreadCount || 0,  // ✅ 保留服务端推送的未读数
        isFlashing: false,
        topicCount: 0
      }))

      // 初始排序:有消息的新媒体账户在前
      state.channels.sort((a, b) => {
        // 1. 置顶的在前
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1

        // 2. 有消息的在前(lastMessageTime不为null)
        const aHasMessage = a.lastMessageTime !== null && a.lastMessageTime !== undefined
        const bHasMessage = b.lastMessageTime !== null && b.lastMessageTime !== undefined
        if (aHasMessage && !bHasMessage) return -1
        if (!aHasMessage && bHasMessage) return 1

        // 3. 按最新消息时间降序
        const aTime = a.lastMessageTime || 0
        const bTime = b.lastMessageTime || 0
        return bTime - aTime
      })
    },

    // 添加或更新新媒体账户
    upsertChannel: (state, action: PayloadAction<Channel>) => {
      const index = state.channels.findIndex(ch => ch.id === action.payload.id)
      if (index >= 0) {
        state.channels[index] = { ...state.channels[index], ...action.payload }
      } else {
        state.channels.push(action.payload)
      }
    },

    // 设置某个新媒体账户的作品列表
    setTopics: (state, action: PayloadAction<{ channelId: string; topics: Topic[] }>) => {
      const { channelId, topics } = action.payload

      // ✅ 修复: 合并更新而非完全替换，避免会话消失
      const existingTopics = state.topics[channelId] || []
      const topicMap = new Map(existingTopics.map(t => [t.id, t]))

      // 更新或添加新 topics
      topics.forEach(topic => {
        topicMap.set(topic.id, topic)
      })

      state.topics[channelId] = Array.from(topicMap.values())

      // 更新新媒体账户的作品数量和未读消息数
      const channel = state.channels.find(ch => ch.id === channelId)
      if (channel) {
        channel.topicCount = state.topics[channelId].length

        // ✅ 汇总该账户下所有作品的未读消息数
        channel.unreadCount = state.topics[channelId].reduce((sum, topic) => sum + (topic.unreadCount || 0), 0)
      }
    },

    // 添加或更新作品
    upsertTopic: (state, action: PayloadAction<Topic>) => {
      const topic = action.payload
      const channelId = topic.channelId

      if (!state.topics[channelId]) {
        state.topics[channelId] = []
      }

      const index = state.topics[channelId].findIndex(t => t.id === topic.id)
      if (index >= 0) {
        state.topics[channelId][index] = { ...state.topics[channelId][index], ...topic }
      } else {
        state.topics[channelId].push(topic)
      }

      // 更新新媒体账户的作品数量
      const channel = state.channels.find(ch => ch.id === channelId)
      if (channel) {
        channel.topicCount = state.topics[channelId].length
      }
    },

    // 设置某个作品的消息列表
    setMessages: (state, action: PayloadAction<{ topicId: string; messages: Message[] }>) => {
      const { topicId, messages } = action.payload
      console.log(`[Store] 设置作品 ${topicId} 的消息列表，消息数量: ${messages.length}`)
      state.messages[topicId] = messages
    },

    // 接收新消息 (兼容旧的 ChannelMessage 格式)
    receiveMessage: (state, action: PayloadAction<ChannelMessage>) => {
      const channelMessage = action.payload
      console.log('[Store] 接收新消息:', channelMessage)
      const channelId = channelMessage.channelId
      const topicId = channelMessage.topicId || 'default' // 如果没有topicId，使用默认作品
      console.log(`[Store] channelId: ${channelId}, topicId: ${topicId}`)

      // 转换为新的 Message 格式
      const message: Message = {
        id: channelMessage.id,
        topicId: topicId,
        channelId: channelId,
        fromName: channelMessage.fromName,
        fromId: channelMessage.fromId,
        content: channelMessage.content,
        type: channelMessage.type,
        messageCategory: channelMessage.messageCategory, // 添加消息分类
        timestamp: channelMessage.timestamp,
        serverTimestamp: channelMessage.serverTimestamp,
        fileUrl: channelMessage.fileUrl,
        fileName: channelMessage.fileName,
        replyToId: channelMessage.replyToId
      }

      // 添加消息到对应作品
      if (!state.messages[topicId]) {
        state.messages[topicId] = []
      }
      state.messages[topicId].push(message)
      console.log(`[Store] 已添加消息到作品 ${topicId}，当前消息数: ${state.messages[topicId].length}`)

      // 更新主题信息
      if (!state.topics[channelId]) {
        state.topics[channelId] = []
      }
      let topic = state.topics[channelId].find(t => t.id === topicId)
      if (!topic) {
        // 如果作品不存在，创建默认作品
        topic = {
          id: topicId,
          channelId: channelId,
          title: '默认作品',
          createdTime: Date.now(),
          messageCount: 0,
          unreadCount: 0,
          isPinned: false
        }
        state.topics[channelId].push(topic)
      }

      topic.lastMessage = message.content
      topic.lastMessageTime = message.timestamp
      topic.messageCount = state.messages[topicId].length

      // 如果不是当前选中的作品，增加未读计数
      if (state.selectedTopicId !== topicId) {
        topic.unreadCount += 1
      }

      // 更新频道信息
      const channel = state.channels.find(ch => ch.id === channelId)
      if (channel) {
        channel.lastMessage = message.content
        channel.lastMessageTime = message.timestamp

        // 如果不是当前选中的新媒体账户，增加未读计数并触发晃动
        if (state.selectedChannelId !== channelId) {
          channel.unreadCount += 1
          channel.isFlashing = true
        }
      }

      // 重新排序新媒体账户列表
      state.channels.sort((a, b) => {
        // 1. 置顶的在前
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1

        // 2. 有未读消息的在前
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1

        // 3. 按最新消息时间降序
        const aTime = a.lastMessageTime || 0
        const bTime = b.lastMessageTime || 0
        return bTime - aTime
      })
    },

    // 添加回复消息
    addReply: (state, action: PayloadAction<Message>) => {
      const message = action.payload
      const topicId = message.topicId

      if (!state.messages[topicId]) {
        state.messages[topicId] = []
      }
      state.messages[topicId].push(message)

      // 更新主题信息
      const channelId = message.channelId
      if (state.topics[channelId]) {
        const topic = state.topics[channelId].find(t => t.id === topicId)
        if (topic) {
          topic.lastMessage = message.content
          topic.lastMessageTime = message.timestamp
          topic.messageCount = state.messages[topicId].length
        }
      }
    },

    // 停止新媒体账户晃动
    stopFlashing: (state, action: PayloadAction<string>) => {
      const channel = state.channels.find(ch => ch.id === action.payload)
      if (channel) {
        channel.isFlashing = false
      }
    },

    // 选择新媒体账户
    selectChannel: (state, action: PayloadAction<string>) => {
      state.selectedChannelId = action.payload
      state.selectedTopicId = null // 清除选中的作品

      // 清除该新媒体账户的未读计数
      const channel = state.channels.find(ch => ch.id === action.payload)
      if (channel) {
        channel.unreadCount = 0
        channel.isFlashing = false
      }
    },

    // 选择作品
    selectTopic: (state, action: PayloadAction<string>) => {
      state.selectedTopicId = action.payload

      // 清除该作品的未读计数
      if (state.selectedChannelId) {
        const topics = state.topics[state.selectedChannelId]
        if (topics) {
          const topic = topics.find(t => t.id === action.payload)
          if (topic) {
            topic.unreadCount = 0
          }

          // ✅ 重新计算该账户的总未读数
          const channel = state.channels.find(ch => ch.id === state.selectedChannelId)
          if (channel) {
            channel.unreadCount = topics.reduce((sum, t) => sum + (t.unreadCount || 0), 0)
          }
        }
      }
    },

    // 清除选择
    clearSelection: (state) => {
      state.selectedChannelId = null
      state.selectedTopicId = null
    },

    // 设置连接状态
    setConnected: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload
    },

    // 清空所有数据
    clearAll: (state) => {
      state.channels = []
      state.topics = {}
      state.messages = {}
      state.selectedChannelId = null
      state.selectedTopicId = null
      state.isConnected = false
      state.channelDisplayCount = state.channelPageSize
    },

    // 加载更多新媒体账户
    loadMoreChannels: (state) => {
      state.channelDisplayCount += state.channelPageSize
    },

    // 重置新媒体账户显示数量
    resetChannelDisplay: (state) => {
      state.channelDisplayCount = state.channelPageSize
    }
  }
})

export const {
  setChannels,
  upsertChannel,
  setTopics,
  upsertTopic,
  setMessages,
  receiveMessage,
  addReply,
  stopFlashing,
  selectChannel,
  selectTopic,
  clearSelection,
  setConnected,
  clearAll,
  loadMoreChannels,
  resetChannelDisplay
} = monitorSlice.actions

export default monitorSlice.reducer
