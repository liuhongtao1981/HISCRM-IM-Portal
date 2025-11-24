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

      // 📊 调试日志 - 记录原始数据
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🔄 [setTopics] 接收到服务端数据')
      console.log(`   频道ID: ${channelId}`)
      console.log(`   Topics 数量: ${topics.length}`)

      // 计算详细未读数
      let privateUnread = 0
      let commentUnread = 0
      topics.forEach(topic => {
        const unread = topic.unreadCount || 0
        if (topic.isPrivate) {
          privateUnread += unread
        } else {
          commentUnread += unread
        }
        if (unread > 0) {
          console.log(`     - ${topic.isPrivate ? '[私信]' : '[评论]'} ${topic.title}: ${unread} 条未读`)
        }
      })
      console.log(`   📧 私信未读: ${privateUnread}`)
      console.log(`   💬 评论未读: ${commentUnread}`)
      console.log(`   📊 总未读: ${privateUnread + commentUnread}`)

      // ✅ 修复：直接替换而非合并，服务端返回的数据是完整且正确的
      // 无论是推送还是主动请求，每次都应该是最新的完整数据
      state.topics[channelId] = topics

      // 更新新媒体账户的作品数量和未读消息数
      const channel = state.channels.find(ch => ch.id === channelId)
      if (channel) {
        const oldUnread = channel.unreadCount
        channel.topicCount = topics.length

        // ✅ 汇总该账户下所有作品的未读消息数
        channel.unreadCount = topics.reduce((sum, topic) => sum + (topic.unreadCount || 0), 0)

        console.log(`   ✅ 更新左侧徽章: ${oldUnread} → ${channel.unreadCount}`)
        if (oldUnread !== channel.unreadCount) {
          console.log(`   ⚠️  徽章数字发生变化！差异: ${channel.unreadCount - oldUnread}`)
        }
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
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

      // ✅ 去重：检查消息是否已存在
      const existingMessageIndex = state.messages[topicId].findIndex(m => m.id === message.id)
      if (existingMessageIndex >= 0) {
        // 消息已存在，更新而不是添加
        console.log(`[Store] ⚠️ 消息已存在，更新: ${message.id}`)
        state.messages[topicId][existingMessageIndex] = message
      } else {
        // 新消息，添加到列表
        state.messages[topicId].push(message)
        console.log(`[Store] ✅ 添加新消息到作品 ${topicId}，消息ID: ${message.id}`)
      }
      console.log(`[Store] 当前作品 ${topicId} 消息总数: ${state.messages[topicId].length}`)

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

      // ✅ 检查消息方向，只有用户发送的消息才增加未读计数
      // 判断优先级（从高到低）：
      // 1. 如果消息已标记为已读(isRead=true)，一定不是未读消息
      // 2. 如果消息方向是outbound（客服发出），一定不增加未读
      // 3. 如果fromId包含'monitor'，是客服消息
      // 4. 如果fromName是'客服'，是客服消息
      const messageIsRead = (message as any).isRead === true;
      const isOutbound = (message as any).direction === 'outbound';
      const isMonitorUser = message.fromId && message.fromId.includes('monitor');
      const isCustomerService = message.fromName === '客服';
      
      // 只有不满足以上任何条件的消息才是"用户消息"
      const isUserMessage = !messageIsRead && !isOutbound && !isMonitorUser && !isCustomerService;
      
      // 🔍 详细调试信息
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🔍 [消息过滤判断] 详细分析')
      console.log(`   topicId: ${topicId}`)
      console.log(`   fromName: "${message.fromName}"`)
      console.log(`   fromId: "${message.fromId}"`)
      console.log(`   direction: "${(message as any).direction}"`)
      console.log(`   isRead: ${(message as any).isRead}`)
      console.log(`   messageCategory: "${message.messageCategory}"`)
      console.log(`   content: "${message.content?.substring(0, 50)}..."`)
      console.log(`   判断结果:`)
      console.log(`     - messageIsRead: ${messageIsRead}`)
      console.log(`     - isOutbound: ${isOutbound}`)
      console.log(`     - isMonitorUser: ${isMonitorUser}`)
      console.log(`     - isCustomerService: ${isCustomerService}`)
      console.log(`     - 最终 isUserMessage: ${isUserMessage}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      
      // 如果不是当前选中的作品，且是用户消息，增加未读计数
      if (state.selectedTopicId !== topicId && isUserMessage) {
        topic.unreadCount += 1
      }

      // 更新频道信息
      const channel = state.channels.find(ch => ch.id === channelId)
      if (channel) {
        channel.lastMessage = message.content
        channel.lastMessageTime = message.timestamp

        // ✅ 只有在以下条件同时满足时才增加频道未读计数：
        // 1. 不是当前选中的新媒体账户
        // 2. 是用户消息（不是客服发送的）
        if (state.selectedChannelId !== channelId && isUserMessage) {
          channel.unreadCount += 1
          channel.isFlashing = true
          console.log(`   ✅ 增加频道未读数: ${channel.name} -> ${channel.unreadCount}`)
        } else {
          console.log(`   ⏭️  跳过频道未读数增加:`, {
            isCurrentChannel: state.selectedChannelId === channelId,
            isUserMessage
          })
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
      const channelId = action.payload

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('👆 [selectChannel] 用户点击账户')
      console.log(`   频道ID: ${channelId}`)

      const channel = state.channels.find(ch => ch.id === channelId)
      if (channel) {
        console.log(`   账户名: ${channel.name}`)
        console.log(`   点击前徽章: ${channel.unreadCount}`)
      }

      state.selectedChannelId = channelId
      state.selectedTopicId = null // 清除选中的作品

      // ✅ 保留 topics 数据，避免切换账户时右侧闪烁为空
      // 服务端会推送最新数据并覆盖旧数据
      const oldTopics = state.topics[channelId]
      if (oldTopics && oldTopics.length > 0) {
        console.log(`   保留 ${oldTopics.length} 个作品（等待服务端推送最新数据）`)
      } else {
        console.log(`   该账户暂无本地数据，等待服务端推送`)
      }

      // 清除该新媒体账户的未读计数
      if (channel) {
        channel.unreadCount = 0
        channel.isFlashing = false
        console.log(`   ✅ 重置徽章为 0`)
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    },

    // 选择作品
    selectTopic: (state, action: PayloadAction<string>) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('👉 [selectTopic] 用户选择作品')
      console.log(`   作品ID: ${action.payload}`)

      state.selectedTopicId = action.payload

      // ❌ 暂时注释：不在客户端修改未读数，避免与服务端数据不一致导致跳动
      // 真正的已读标记应该通过 API 调用服务端，由服务端推送更新
      // if (state.selectedChannelId) {
      //   const topics = state.topics[state.selectedChannelId]
      //   if (topics) {
      //     const topic = topics.find(t => t.id === action.payload)
      //     if (topic) {
      //       topic.unreadCount = 0
      //     }
      //     const channel = state.channels.find(ch => ch.id === state.selectedChannelId)
      //     if (channel) {
      //       channel.unreadCount = topics.reduce((sum, t) => sum + (t.unreadCount || 0), 0)
      //     }
      //   }
      // }

      console.log('   ✅ 仅更新 selectedTopicId，不修改未读数')
      console.log('   💡 未读数由服务端统一管理')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
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
    },

    // ✨ 新增：更新账户未读数（用于新消息提示）
    updateChannelUnreadCount: (state, action: PayloadAction<{
      channelId: string
      unreadCount: number
    }>) => {
      const { channelId, unreadCount } = action.payload
      const channel = state.channels.find(ch => ch.id === channelId)
      if (channel) {
        console.log(`[Store] 更新账户未读数: ${channel.name} -> ${unreadCount}`)
        channel.unreadCount = unreadCount

        // 如果有未读消息，标记为闪烁
        if (unreadCount > 0) {
          channel.isFlashing = true
        }

        // 重新排序账户列表（有未读的在前）
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
      }
    },

    // ✨ 新增：增加单个作品的未读数（用于新消息实时提示）
    incrementTopicUnreadCount: (state, action: PayloadAction<{
      channelId: string
      topicId: string
      increment: number
    }>) => {
      const { channelId, topicId, increment } = action.payload

      console.log(`[Store] incrementTopicUnreadCount 被调用: channelId=${channelId}, topicId=${topicId}, increment=${increment}`)

      // 查找对应的topic
      if (!state.topics[channelId]) {
        console.warn(`[Store] ❌ 找不到账户的topics数据: ${channelId}`)
        console.log(`[Store] 当前 topics keys:`, Object.keys(state.topics))
        return
      }

      const topic = state.topics[channelId].find(t => t.id === topicId)
      if (!topic) {
        console.warn(`[Store] ❌ 在账户 ${channelId} 中找不到 topic: ${topicId}`)
        console.log(`[Store] 该账户的 topics:`, state.topics[channelId].map(t => `${t.id}:${t.title}`))
        return
      }

      const oldUnread = topic.unreadCount
      topic.unreadCount = (topic.unreadCount || 0) + increment
      console.log(`[Store] ✅ 增加作品未读数: ${topic.title} ${oldUnread} -> ${topic.unreadCount}`)

      // 同时更新账户的总未读数
      const channel = state.channels.find(ch => ch.id === channelId)
      if (channel) {
        const oldChannelUnread = channel.unreadCount
        channel.unreadCount = state.topics[channelId].reduce((sum, t) => sum + (t.unreadCount || 0), 0)
        console.log(`[Store] ✅ 更新账户总未读数: ${channel.name} ${oldChannelUnread} -> ${channel.unreadCount}`)

        // 如果有未读消息，标记为闪烁
        if (channel.unreadCount > 0) {
          channel.isFlashing = true
        }
      } else {
        console.warn(`[Store] ❌ 找不到账户: ${channelId}`)
      }
    },

    // 移除临时消息（发送中的占位符）
    removeTemporaryMessage: (state, action: PayloadAction<{
      channelId: string
      topicId: string
      content: string
      showError?: boolean
      error?: string
    }>) => {
      const { channelId, topicId, content } = action.payload
      
      if (state.messages[topicId]) {
        // 查找并移除匹配的临时消息
        const messageIndex = state.messages[topicId].findIndex(msg => 
          (msg as any).isTemporary && 
          msg.content === content &&
          msg.channelId === channelId
        )
        
        if (messageIndex >= 0) {
          state.messages[topicId].splice(messageIndex, 1)
          console.log(`[Store] 已移除临时消息: "${content}" (索引: ${messageIndex})`)
          
          // 更新作品的消息计数
          if (state.topics[channelId]) {
            const topic = state.topics[channelId].find(t => t.id === topicId)
            if (topic) {
              topic.messageCount = state.messages[topicId].length
            }
          }
        } else {
          console.warn(`[Store] 未找到要移除的临时消息: "${content}"`)
        }
      }
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
  resetChannelDisplay,
  updateChannelUnreadCount,
  incrementTopicUnreadCount,
  removeTemporaryMessage
} = monitorSlice.actions

export default monitorSlice.reducer
