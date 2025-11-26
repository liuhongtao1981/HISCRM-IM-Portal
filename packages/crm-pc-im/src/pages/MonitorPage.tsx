/**
 * 监控页面 - 消息监控面板 (微信风格)
 * 架构: 新媒体账户 -> 作品 -> 消息
 * 两列布局: 左侧账户列表 | 右侧消息对话框
 */

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Layout, Avatar, Badge, List, Typography, Empty, Input, Button, Dropdown, Menu, Tabs, Select, Tooltip, Modal } from 'antd'
import { UserOutlined, SendOutlined, SearchOutlined, MoreOutlined, CloseOutlined, LogoutOutlined, MessageOutlined, CommentOutlined, AppstoreOutlined, SortAscendingOutlined } from '@ant-design/icons'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import type { RootState } from '../store'
import {
  receiveMessage,
  stopFlashing,
  selectChannel,
  selectTopic,
  setChannels,
  setConnected,
  setTopics,
  setMessages,
  loadMoreChannels,
  updateChannelUnreadCount,
  incrementTopicUnreadCount,
  upsertChannel
} from '../store/monitorSlice'
import websocketService from '../services/websocket'
import type { ChannelMessage, Topic, Message, NewMessageHint } from '../shared/types-monitor'
import './MonitorPage.css'

// 声明 Electron API
declare global {
  interface Window {
    electron?: {
      showWindow: () => void
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
    }
  }
}

const { Sider, Content } = Layout
const { Text } = Typography
const { TextArea } = Input

export default function MonitorPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const channels = useSelector((state: RootState) => state.monitor.channels)
  const topics = useSelector((state: RootState) => state.monitor.topics)
  const messages = useSelector((state: RootState) => state.monitor.messages)
  const selectedChannelId = useSelector((state: RootState) => state.monitor.selectedChannelId)
  const selectedTopicId = useSelector((state: RootState) => state.monitor.selectedTopicId)
  const isConnected = useSelector((state: RootState) => state.monitor.isConnected)
  const channelDisplayCount = useSelector((state: RootState) => state.monitor.channelDisplayCount)

  // 单独 select 当前选中主题的消息，确保能检测到变化
  const currentMessages = useSelector((state: RootState) => {
    if (!state.monitor.selectedTopicId) return []
    return state.monitor.messages[state.monitor.selectedTopicId] || []
  })

  const [searchText, setSearchText] = useState('') // 账户搜索
  const [replyContent, setReplyContent] = useState('')
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null)
  const [activeTab, setActiveTab] = useState<'private' | 'comment' | 'works'>('comment') // 当前活动标签页
  const [showCommentList, setShowCommentList] = useState(true) // 评论Tab下是否显示列表(而不是对话)
  const [showPrivateList, setShowPrivateList] = useState(true) // 私信Tab下是否显示列表(而不是对话)
  const [isSending, setIsSending] = useState(false) // 是否正在发送消息
  const [sendingQueues, setSendingQueues] = useState<Record<string, any[]>>({}) // 发送队列 topicId -> SendingMessage[]
  const [worksSortBy, setWorksSortBy] = useState<'createdTime' | 'viewCount' | 'likeCount' | 'commentCount' | 'shareCount' | 'favoriteCount' | 'danmakuCount' | 'dislikeCount' | 'downloadCount' | 'subscribeCount' | 'unsubscribeCount' | 'likeRate' | 'commentRate' | 'shareRate' | 'favoriteRate' | 'dislikeRate' | 'subscribeRate' | 'unsubscribeRate' | 'completionRate' | 'completionRate5s' | 'avgViewSecond' | 'avgViewProportion' | 'bounceRate2s' | 'fanViewProportion' | 'homepageVisitCount' | 'coverShow'>('createdTime') // 作品列表排序字段

  // ✅ 合并正常消息和发送队列消息
  const allMessages = useMemo(() => {
    if (!selectedTopicId) return []
    
    const normalMessages = currentMessages
    const sendingMessages = sendingQueues[selectedTopicId] || []
    
    // 将发送队列消息转换为Message格式并添加特殊标记
    const sendingAsMessages: Message[] = sendingMessages.map(sendingMsg => ({
      id: sendingMsg.id,
      topicId: sendingMsg.topicId,
      channelId: sendingMsg.channelId,
      fromName: sendingMsg.fromName,
      fromId: sendingMsg.fromId,
      authorAvatar: sendingMsg.authorAvatar,
      content: sendingMsg.content,
      type: (sendingMsg.messageCategory === 'private' ? 'text' : 'comment') as Message['type'],
      messageCategory: sendingMsg.messageCategory,
      direction: 'outbound' as 'outbound',
      timestamp: sendingMsg.timestamp,
      serverTimestamp: sendingMsg.timestamp,
      replyToId: sendingMsg.replyToId,
      replyToContent: sendingMsg.replyToContent,
      status: 'sending' as 'sending',
      isSending: true  // 特殊标记
    } as Message))
    
    // 合并并按时间排序
    const combined = [...normalMessages, ...sendingAsMessages]
    return combined.sort((a, b) => a.timestamp - b.timestamp)
  }, [currentMessages, sendingQueues, selectedTopicId])
  const textAreaRef = useRef<any>(null)
  const channelListRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  // ✨ 新增：防抖定时器（用于合并短时间内的多条消息提示）
  const refreshTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  // ✨ 新增：账号列表自动刷新定时器
  const refreshChannelsIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const selectedChannel = channels.find(ch => ch.id === selectedChannelId)

  // ✨ 优化：使用 useSelector 直接选择当前账户的 topics，确保能检测到变化
  const currentTopics = useSelector((state: RootState) => {
    if (!state.monitor.selectedChannelId) return []
    return state.monitor.topics[state.monitor.selectedChannelId] || []
  })

  const selectedTopic = currentTopics.find(tp => tp.id === selectedTopicId)

  // 计算私信和评论的未处理数量（汇总该账户下所有作品的未读消息）
  const privateUnhandledCount = React.useMemo(() => {
    if (!selectedChannelId) return 0

    // 遍历该账户的所有作品，汇总私信未读数
    return currentTopics.reduce((sum, topic) => {
      if (topic.isPrivate) {
        // 对于私信主题，使用服务端推送的 unreadCount
        return sum + (topic.unreadCount || 0)
      }
      return sum
    }, 0)
  }, [selectedChannelId, currentTopics])

  const commentUnhandledCount = React.useMemo(() => {
    if (!selectedChannelId) return 0

    // 遍历该账户的所有作品，汇总评论未读数
    return currentTopics.reduce((sum, topic) => {
      if (!topic.isPrivate) {
        // 对于评论主题，使用服务端推送的 unreadCount
        return sum + (topic.unreadCount || 0)
      }
      return sum
    }, 0)
  }, [selectedChannelId, currentTopics])

  // 根据当前标签页过滤消息（使用合并后的消息列表）
  const filteredMessages = allMessages.filter(msg => {
    if (activeTab === 'private') {
      return msg.messageCategory === 'private'
    } else {
      // 评论标签页:显示评论消息或没有分类的消息(兼容旧数据)
      return msg.messageCategory === 'comment' || !msg.messageCategory
    }
  })

  // 构建未读评论列表(按作品分组,显示每个作品的未读数量和最新消息)
  // 构建评论列表（显示所有作品，未读在前，已读在后）
  const unreadCommentsByTopic = React.useMemo(() => {
    if (!selectedChannelId) return []

    const topicsWithComments: Array<{
      topic: Topic
      messageCount: number
      unreadCount: number
      lastMessage?: Message
    }> = []

    // 遍历该账户的所有作品
    currentTopics.forEach(topic => {
      // ✅ 只处理评论作品 (isPrivate = false)
      if (!topic.isPrivate) {
        // 获取该作品的所有评论消息（如果已加载）
        const topicMessages = messages[topic.id] || []
        const commentMessages = topicMessages.filter(msg =>
          (msg.messageCategory === 'comment' || !msg.messageCategory)
        )

        // 按时间降序排序，取最新的一条
        const sortedMessages = [...commentMessages].sort((a, b) => b.timestamp - a.timestamp)

        // ✅ 使用服务端推送的 unreadCount
        const unreadCount = topic.unreadCount || 0
        const messageCount = commentMessages.length || topic.messageCount || 0

        // ✅ 只显示有评论的作品（过滤掉评论数为 0 的作品）
        if (messageCount > 0) {
          topicsWithComments.push({
            topic,
            messageCount: messageCount,
            unreadCount: unreadCount,
            lastMessage: sortedMessages[0]  // 可能为 undefined
          })
        }
      }
    })

    // ✅ 排序逻辑：未读的在前，已读的在后；同类按最新消息时间降序
    return topicsWithComments.sort((a, b) => {
      // 先按未读状态分组（有未读的排在前面）
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1

      // 同类按最新消息时间降序（最新的在最上面）
      const aTime = a.lastMessage?.timestamp || a.topic.lastMessageTime || 0
      const bTime = b.lastMessage?.timestamp || b.topic.lastMessageTime || 0
      return bTime - aTime
    })
  }, [selectedChannelId, currentTopics, messages])

  // 构建私信列表(按作品分组,按最新消息时间倒序排列)
  const privateMessagesByTopic = React.useMemo(() => {
    if (!selectedChannelId) return []

    const topicsWithPrivate: Array<{
      topic: Topic
      messageCount: number
      unreadCount: number
      lastMessage?: Message  // ✅ 改为可选,因为可能还没加载消息
    }> = []

    // 遍历该账户的所有主题(包括普通作品和私信主题)
    currentTopics.forEach(topic => {
      // ✅ 修复: 如果主题标记为私信主题,直接添加到列表,不需要等待消息加载
      if (topic.isPrivate) {
        // 获取该主题的所有消息(如果已加载)
        const topicMessages = messages[topic.id] || []
        const privateMessages = topicMessages.filter(msg =>
          msg.messageCategory === 'private'
        )

        // 按时间降序排序,取最新的一条
        const sortedMessages = [...privateMessages].sort((a, b) => b.timestamp - a.timestamp)

        // ✅ 修复未读数跳动问题：完全信任服务端推送的 unreadCount
        // 服务端基于完整的 DataStore 数据计算，客户端只有部分消息
        // 客户端不应该用不完整的数据覆盖服务端的准确值
        const unreadCount = topic.unreadCount || 0

        topicsWithPrivate.push({
          topic,
          messageCount: privateMessages.length || topic.messageCount || 0,  // 优先使用已加载的消息数
          unreadCount: unreadCount,
          lastMessage: sortedMessages[0]  // 可能为 undefined
        })
      }
    })

    // ✅ 排序逻辑：未读的在前，已读的在后；同类按最新消息时间降序
    return topicsWithPrivate.sort((a, b) => {
      // 先按未读状态分组（有未读的排在前面）
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1

      // 同类按最新消息时间降序（最新的在最上面）
      const aTime = a.lastMessage?.timestamp || a.topic.lastMessageTime || 0
      const bTime = b.lastMessage?.timestamp || b.topic.lastMessageTime || 0
      return bTime - aTime
    })
  }, [selectedChannelId, currentTopics, messages])

  // 调试日志
  useEffect(() => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[当前状态]', {
      selectedChannelId,
      selectedTopicId,
      '作品数量': currentTopics.length,
      '消息数量': currentMessages.length,
      '当前作品': selectedTopic?.title
    })

    // ✅ 调试：显示 currentTopics 的详细信息
    if (currentTopics.length > 0) {
      console.log('[当前账户的作品列表]')
      currentTopics.slice(0, 3).forEach((topic, index) => {
        console.log(`  ${index + 1}. ${topic.title} (ID: ${topic.id}, 未读: ${topic.unreadCount}, 私信: ${topic.isPrivate})`)
      })
      if (currentTopics.length > 3) {
        console.log(`  ... 还有 ${currentTopics.length - 3} 个作品`)
      }
    } else {
      console.log('[当前账户没有作品数据]')
    }

    // ✅ 调试：显示 Redux store 中所有账户的 topics 数量
    console.log('[Redux store 中所有账户的 topics]')
    Object.keys(topics).forEach(channelId => {
      const topicCount = topics[channelId]?.length || 0
      const marker = channelId === selectedChannelId ? '👉' : '  '
      console.log(`  ${marker} ${channelId}: ${topicCount} 个作品`)
    })
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }, [selectedChannelId, selectedTopicId, currentTopics, currentMessages.length, selectedTopic, topics])

  // 过滤账户列表
  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(searchText.toLowerCase())
  )

  // 显示所有账户（带登录状态排序）
  const displayedChannels = useMemo(() => {
    return [...filteredChannels].sort((a, b) => {
      // ✅ 直接使用服务器返回的 isLoggedIn 字段
      const aIsLoggedIn = a.isLoggedIn ?? false
      const bIsLoggedIn = b.isLoggedIn ?? false

      // Layer 1: 登录的账户排在前面
      if (aIsLoggedIn && !bIsLoggedIn) return -1
      if (!aIsLoggedIn && bIsLoggedIn) return 1

      // Layer 2: 登录的账户按最后消息时间倒序（最新消息在最上面）
      if (aIsLoggedIn && bIsLoggedIn) {
        const aTime = a.lastMessageTime || 0
        const bTime = b.lastMessageTime || 0
        return bTime - aTime
      }

      // Layer 3: 未登录的账户按名称排序
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  }, [filteredChannels])

  // ✨ 新增：处理新消息简易提示（带防抖机制）
  const handleNewMessageHint = React.useCallback((hint: NewMessageHint) => {
    console.log('🔔 收到新消息提示:', hint)

    // 1️⃣ 立即更新红点未读数（不防抖，实时显示）
    dispatch(updateChannelUnreadCount({
      channelId: hint.channelId,
      unreadCount: hint.totalUnreadCount,
    }))

    // 🆕 立即更新个别作品/会话的未读数（解决左侧列表红点不实时显示的问题）
    if (hint.messageType === 'comment' && hint.topicId && hint.commentCount) {
      // 评论：立即增加作品未读数
      dispatch(incrementTopicUnreadCount({
        channelId: hint.channelId,
        topicId: hint.topicId,
        increment: hint.commentCount,
      }))
      console.log(`🔴 立即更新作品未读数: ${hint.topicTitle} +${hint.commentCount}`)
    } else if (hint.messageType === 'private_message' && hint.conversationId && hint.messageCount) {
      // 私信：立即增加会话未读数
      dispatch(incrementTopicUnreadCount({
        channelId: hint.channelId,
        topicId: hint.conversationId,
        increment: hint.messageCount,
      }))
      console.log(`🔴 立即更新会话未读数: ${hint.fromUserName} +${hint.messageCount}`)
    }

    // 2️⃣ 显示浏览器通知（不防抖，实时提醒）
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const title = hint.messageType === 'comment' ? '新评论' : '新私信'
      const body = hint.messageType === 'comment'
        ? `${hint.topicTitle} 收到 ${hint.commentCount} 条新评论`
        : `${hint.fromUserName} 发来 ${hint.messageCount} 条新消息`

      new Notification(title, { body })
    }

    // 3️⃣ 防抖刷新详细数据（1秒内多次提示合并处理）
    const refreshKey = hint.messageType === 'comment'
      ? `${hint.channelId}_comment_${hint.topicId}`
      : `${hint.channelId}_message_${hint.conversationId}`

    // 清除之前的定时器
    if (refreshTimers.current.has(refreshKey)) {
      clearTimeout(refreshTimers.current.get(refreshKey)!)
      console.log('⏰ 清除旧的刷新定时器:', refreshKey)
    }

    // 设置新的定时器（1秒后执行）
    const timer = setTimeout(() => {
      console.log('📥 执行防抖刷新:', refreshKey)

      if (hint.messageType === 'comment') {
        handleCommentHint(hint)
      } else if (hint.messageType === 'private_message') {
        handlePrivateMessageHint(hint)
      }

      // 清理定时器
      refreshTimers.current.delete(refreshKey)
    }, 1000) // 1秒防抖

    refreshTimers.current.set(refreshKey, timer)
    console.log('⏰ 设置新的刷新定时器:', refreshKey)
  }, [dispatch])

  // ✨ 新增：处理评论提示
  const handleCommentHint = React.useCallback((hint: NewMessageHint) => {
    // 如果当前在该账户的页面
    if (selectedChannelId === hint.channelId) {
      console.log('📥 当前在该账户页面，刷新 topics')

      // 主动请求 topics 刷新
      websocketService.emit('monitor:request_topics', {
        channelId: hint.channelId,
      })

      // 如果当前正在查看该作品的评论
      if (selectedTopicId === hint.topicId) {
        console.log('📥 当前在该作品页面，刷新 messages')

        // 主动请求 messages 刷新
        websocketService.emit('monitor:request_messages', {
          channelId: hint.channelId,
          topicId: hint.topicId,
          messageType: 'comment',
        })
      }
    } else {
      console.log('📌 不在该账户页面，只更新红点')
    }
  }, [selectedChannelId, selectedTopicId])

  // ✨ 新增：处理私信提示
  const handlePrivateMessageHint = React.useCallback((hint: NewMessageHint) => {
    // 如果当前在该账户的页面
    if (selectedChannelId === hint.channelId) {
      console.log('📥 当前在该账户页面，刷新 topics')

      // 主动请求 topics 刷新
      websocketService.emit('monitor:request_topics', {
        channelId: hint.channelId,
      })

      // 如果当前正在查看该会话的私信
      if (selectedTopicId === hint.conversationId) {
        console.log('📥 当前在该会话页面，刷新 messages')

        // 主动请求 messages 刷新
        websocketService.emit('monitor:request_messages', {
          channelId: hint.channelId,
          topicId: hint.conversationId,
          messageType: 'direct_message',
        })
      }
    } else {
      console.log('📌 不在该账户页面，只更新红点')
    }
  }, [selectedChannelId, selectedTopicId])

  // 连接服务器
  useEffect(() => {
    const connectToServer = async () => {
      try {
        let clientId = localStorage.getItem('crm-im-client-id')
        if (!clientId) {
          clientId = `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          localStorage.setItem('crm-im-client-id', clientId)
        }

        // 不传 URL 参数,使用 config.json 中的配置
        await websocketService.connect()
        console.log('[监控] WebSocket 连接成功')
        dispatch(setConnected(true))

        console.log('[监控] 发送注册请求:', { clientType: 'monitor', clientId })
        websocketService.emit('monitor:register', {
          clientType: 'monitor',
          clientId: clientId
        })

        // 监听新媒体账户列表
        websocketService.on('monitor:channels', (data: any) => {
          dispatch(setChannels(data.channels))
          data.channels.forEach((channel: any) => {
            websocketService.emit('monitor:request_topics', { channelId: channel.id })
          })
        })

        // 定时刷新账号列表（每30秒）
        refreshChannelsIntervalRef.current = setInterval(() => {
          console.log('[自动刷新] 请求账号列表更新')
          websocketService.emit('monitor:sync', {})
        }, 30000)

        // 监听账号状态更新（从 Master 接收）
        window.electron?.on('account-status-updated', (data: any) => {
          console.log('[账号状态更新]', data)
          // 刷新账号列表
          websocketService.emit('monitor:sync', {})
        })

        // ✅ 监听 channel:status_update 事件（实时更新头像、昵称、登录状态等）
        websocketService.on('channel:status_update', (data: any) => {
          console.log('[WebSocket] 收到事件: channel:status_update', data)
          if (data.channel) {
            const ch = data.channel
            // 计算登录状态：loginStatus === 'logged_in' && workerStatus === 'online'
            const isLoggedIn = ch.loginStatus === 'logged_in' && ch.workerStatus === 'online'
            // 转换为 Channel 格式并更新
            dispatch(upsertChannel({
              id: ch.id,
              name: ch.platformUsername || ch.accountName || ch.id,
              avatar: ch.avatar || '',
              platform: ch.platform,
              description: ch.platform || '',
              enabled: true,
              isPinned: false,
              unreadCount: 0,
              isFlashing: false,
              isLoggedIn: isLoggedIn,  // ✅ 包含登录状态
            }))
            console.log(`[channel:status_update] ✅ 已更新账户: ${ch.platformUsername}, isLoggedIn: ${isLoggedIn}`)
          }
        })

        // 监听作品列表
        websocketService.on('monitor:topics', (data: any) => {
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          console.log('📡 [WebSocket] 收到服务端推送 monitor:topics')
          console.log(`   频道ID: ${data.channelId}`)
          console.log(`   Topics 数量: ${data.topics ? data.topics.length : 0}`)

          // 统计未读数
          let privateUnread = 0
          let commentUnread = 0
          if (data.topics) {
            data.topics.forEach((topic: any) => {
              const unread = topic.unreadCount || 0
              if (topic.isPrivate) {
                privateUnread += unread
              } else {
                commentUnread += unread
              }
            })
          }
          console.log(`   📧 私信未读: ${privateUnread}`)
          console.log(`   💬 评论未读: ${commentUnread}`)
          console.log(`   📊 总未读: ${privateUnread + commentUnread}`)
          console.log('   → 调用 dispatch(setTopics)')
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

          dispatch(setTopics({ channelId: data.channelId, topics: data.topics }))
        })

        // 监听消息列表（从服务器返回的历史消息）
        websocketService.on('monitor:messages', (data: any) => {
          console.log('[监听] 收到消息列表:', data)
          if (data.topicId && data.messages) {
            dispatch(setMessages({ topicId: data.topicId, messages: data.messages }))
          }
        })

        // 监听新消息
        websocketService.on('channel:message', (message: ChannelMessage) => {
          console.log('[监听] 收到新消息:', message)
          
          // ✅ 统一的消息过滤逻辑（与 monitorSlice 保持一致）
          const messageIsRead = (message as any).isRead === true;
          const isOutbound = (message as any).direction === 'outbound';
          const isMonitorUser = message.fromId && message.fromId.includes('monitor');
          const isCustomerService = message.fromName === '客服';
          const isUserMessage = !messageIsRead && !isOutbound && !isMonitorUser && !isCustomerService;
          
          console.log('[DEBUG] 消息判断:', {
            direction: (message as any).direction,
            isRead: (message as any).isRead,
            fromId: message.fromId,
            fromName: message.fromName,
            messageIsRead,
            isOutbound,
            isMonitorUser,
            isCustomerService,
            isUserMessage
          })
          
          dispatch(receiveMessage(message))
          
          // ✅ 只有用户发送的消息才触发窗口显示和停止晃动
          if (isUserMessage) {
            if (window.electron?.showWindow) {
              window.electron.showWindow()
            }
            setTimeout(() => {
              dispatch(stopFlashing(message.channelId))
            }, 2000)
          }
        })

        // ✅ 监听发送队列更新
        websocketService.on('monitor:sending_queue', (data: any) => {
          console.log('[监听] 发送队列更新:', data)
          const { topicId, sendingMessages } = data
          setSendingQueues(prev => ({
            ...prev,
            [topicId]: sendingMessages
          }))
          // 重置发送状态（当队列更新时，说明发送操作已完成）
          setIsSending(false)
        })

        // ✨ 新增：监听新消息简易提示
        websocketService.on('monitor:new_message_hint', handleNewMessageHint)

        websocketService.emit('monitor:request_channels')
      } catch (error) {
        console.error('[监控] 连接失败:', error)
        dispatch(setConnected(false))
      }
    }

    connectToServer()
    return () => {
      websocketService.off('monitor:new_message_hint')
      websocketService.disconnect()
      // 清理定时器
      if (refreshChannelsIntervalRef.current) {
        clearInterval(refreshChannelsIntervalRef.current)
        refreshChannelsIntervalRef.current = null
      }
      // 移除 Electron 事件监听
      window.electron?.removeAllListeners('account-status-updated')
    }
  }, [dispatch, handleNewMessageHint])

  // ✨ 新增：清理防抖定时器
  useEffect(() => {
    return () => {
      refreshTimers.current.forEach(timer => clearTimeout(timer))
      refreshTimers.current.clear()
    }
  }, [])

  // 滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    }
  }, [currentMessages])

  // 选择账户并自动选择对应的作品
  const handleSelectChannel = (channelId: string) => {
    dispatch(selectChannel(channelId))
    websocketService.emit('monitor:request_topics', { channelId })

    // 如果当前在评论Tab,显示未读评论列表
    if (activeTab === 'comment') {
      setShowCommentList(true)
    } else if (activeTab === 'private') {
      setShowPrivateList(true)
    }

    // 延迟选择作品（优先选择有未读消息的作品，否则选择最新消息的作品）
    setTimeout(() => {
      const topicsForChannel = topics[channelId] || []
      if (topicsForChannel.length > 0) {
        // 优先选择有未读消息的作品
        let targetTopic = topicsForChannel.find(t => t.unreadCount > 0)

        // 如果没有未读消息，选择最新消息的作品
        if (!targetTopic) {
          const sortedTopics = [...topicsForChannel].sort((a, b) => {
            const aTime = a.lastMessageTime || 0
            const bTime = b.lastMessageTime || 0
            return bTime - aTime
          })
          targetTopic = sortedTopics[0]
        }

        if (targetTopic) {
          console.log('[自动选择作品]', targetTopic.id, targetTopic.title)
          dispatch(selectTopic(targetTopic.id))
          websocketService.emit('monitor:request_messages', { topicId: targetTopic.id })

          // ✅ 标记为已读：根据作品类型发送对应的标记已读事件
          if (targetTopic.isPrivate) {
            // 私信会话
            console.log('[标记已读] 私信会话 conversationId:', targetTopic.id, 'channelId:', channelId)
            websocketService.emit('monitor:mark_conversation_as_read', {
              channelId: channelId,
              conversationId: targetTopic.id
            })
          } else {
            // 评论作品
            console.log('[标记已读] 作品评论 topicId:', targetTopic.id, 'channelId:', channelId)
            websocketService.emit('monitor:mark_topic_as_read', {
              channelId: channelId,
              topicId: targetTopic.id
            })
          }
        }
      }
    }, 100)
  }

  // 处理账户点击（未登录账户弹出确认对话框）
  const handleChannelClick = (channel: any) => {
    // ✅ 直接使用服务器返回的 isLoggedIn 字段
    const isLoggedIn = channel.isLoggedIn ?? false

    if (isLoggedIn) {
      // 已登录账户，直接选择
      handleSelectChannel(channel.id)
    } else {
      // 未登录账户，弹出确认对话框
      Modal.confirm({
        title: '账户未登录',
        content: `账户 "${channel.name}" 尚未登录，是否现在登录？`,
        okText: '是的，登录',
        cancelText: '取消',
        onOk: () => {
          console.log('[登录助手] 用户确认登录账户:', channel.id)
          // 发送 IPC 消息到主进程启动手动登录
          if (window.electron) {
            window.electron.send('start-manual-login', {
              accountId: channel.id,
              platform: channel.platform || 'douyin'
            })
          }
        }
      })
    }
  }

  // 选择作品
  const handleSelectTopic = (topicId: string) => {
    console.log('[选择作品] topicId:', topicId)
    dispatch(selectTopic(topicId))

    // 请求该作品的消息列表
    websocketService.emit('monitor:request_messages', { topicId })
    console.log('[请求消息] topicId:', topicId)

    // ✅ 标记为已读：根据作品类型发送对应的标记已读事件
    if (selectedChannelId) {
      const topic = currentTopics.find(t => t.id === topicId)
      if (topic) {
        if (topic.isPrivate) {
          // 私信会话
          console.log('[标记已读] 私信会话 conversationId:', topicId, 'channelId:', selectedChannelId)
          websocketService.emit('monitor:mark_conversation_as_read', {
            channelId: selectedChannelId,
            conversationId: topicId
          })
        } else {
          // 评论作品
          console.log('[标记已读] 作品评论 topicId:', topicId, 'channelId:', selectedChannelId)
          websocketService.emit('monitor:mark_topic_as_read', {
            channelId: selectedChannelId,
            topicId: topicId
          })
        }
      }
    }
  }

  // 从未读评论列表点击进入对话
  const handleEnterTopicFromCommentList = (topicId: string) => {
    console.log('[从未读列表进入] topicId:', topicId)
    dispatch(selectTopic(topicId))
    websocketService.emit('monitor:request_messages', { topicId })
    setShowCommentList(false) // 切换到对话视图

    // ✅ 标记该作品的所有评论为已读
    if (selectedChannelId) {
      console.log('[标记已读] 作品评论 topicId:', topicId, 'channelId:', selectedChannelId)
      websocketService.emit('monitor:mark_topic_as_read', {
        channelId: selectedChannelId,
        topicId: topicId
      })
    }
  }

  // 返回未读评论列表
  const handleBackToCommentList = () => {
    setShowCommentList(true)
    dispatch(selectTopic('')) // 清除选中的作品
  }

  // 从私信列表点击进入对话
  const handleEnterTopicFromPrivateList = (topicId: string) => {
    console.log('[从私信列表进入] topicId:', topicId)
    dispatch(selectTopic(topicId))
    websocketService.emit('monitor:request_messages', { topicId })
    setShowPrivateList(false) // 切换到对话视图

    // ✅ 标记该会话的所有私信为已读
    if (selectedChannelId) {
      console.log('[标记已读] 私信会话 conversationId:', topicId, 'channelId:', selectedChannelId)
      websocketService.emit('monitor:mark_conversation_as_read', {
        channelId: selectedChannelId,
        conversationId: topicId
      })
    }
  }

  // 返回私信列表
  const handleBackToPrivateList = () => {
    setShowPrivateList(true)
    dispatch(selectTopic('')) // 清除选中的作品
  }

  // 发送消息
  const handleSendMessage = () => {
    if (!replyContent.trim() || !selectedChannelId || !selectedTopicId || isSending) {
      return
    }

    setIsSending(true) // 开始发送

    // ✅ 获取当前登录用户信息
    const currentUser = localStorage.getItem('username') || '客服'
    const currentUserId = localStorage.getItem('crm-im-client-id') || 'monitor_client'
    const currentUserAvatar = localStorage.getItem('user-avatar') || null

    // 🔍 DEBUG: 发送前状态检查
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📤 [发送消息] 发送前状态:')
    console.log('  activeTab:', activeTab)
    console.log('  replyToMessage:', replyToMessage)
    if (replyToMessage) {
      console.log('    ├─ id:', replyToMessage.id)
      console.log('    ├─ content:', replyToMessage.content)
      console.log('    ├─ fromName:', replyToMessage.fromName)
      console.log('    └─ messageCategory:', (replyToMessage as any).messageCategory)
    } else {
      console.log('    └─ replyToMessage 为 null (直接发送，不回复具体评论)')
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // 发送到服务器
    const replyData = {
      channelId: selectedChannelId,
      topicId: selectedTopicId,
      type: activeTab === 'private' ? 'text' : 'comment',
      messageCategory: activeTab,
      replyToId: replyToMessage?.id || null,  // ✅ 修复: undefined -> null
      replyToContent: replyToMessage?.content || null,  // ✅ 修复: undefined -> null
      content: replyContent.trim(),
      fromName: currentUser,
      fromId: currentUserId,
      authorAvatar: currentUserAvatar
    }

    // 🔍 DEBUG: 最终发送数据
    console.log('📤 [发送消息] 最终发送数据:')
    console.log('  replyToId:', replyData.replyToId, '(null表示给作品发一级评论)')
    console.log('  replyToContent:', replyData.replyToContent)
    console.log('  content:', replyData.content)
    console.log('  messageCategory:', replyData.messageCategory)
    console.log('  完整数据:', replyData)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    websocketService.emit('monitor:reply', replyData)

    setReplyContent('')
    setReplyToMessage(null)
  }

  // 取消回复
  const handleCancelReply = () => {
    setReplyToMessage(null)
  }

  // 回复某条消息
  const handleReplyToMessage = (message: Message) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('💬 [点击讨论] 设置回复目标:')
    console.log('  message.id:', message.id)
    console.log('  message.content:', message.content)
    console.log('  message.fromName:', message.fromName)
    console.log('  message.messageCategory:', (message as any).messageCategory)
    console.log('  完整message对象:', message)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    setReplyToMessage(message)
    textAreaRef.current?.focus()
  }

  // 退出登录
  const handleLogout = () => {
    // 清除登录状态
    localStorage.removeItem('isLoggedIn')
    localStorage.removeItem('username')
    // 断开 WebSocket 连接
    websocketService.disconnect()
    // 跳转到登录页
    navigate('/login')
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const date = new Date(timestamp)

    // 获取今天 0 点的时间戳
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()

    // 1分钟内：显示"刚刚"
    if (diff < 60000) return '刚刚'

    // 1小时内：显示"X分钟前"
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`

    // ✅ 修复：只有今天的消息才显示时间，其他都显示日期
    if (timestamp >= todayStart) {
      // 今天的消息：显示时间（如 "10:58"）
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else {
      // 昨天及更早的消息：显示日期（如 "11/04"）
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
    }
  }

  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 截断文本
  const truncateText = (text: string, maxLength: number = 20) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  // 作品下拉菜单
  const topicsMenu = (
    <Menu
      onClick={({ key }) => {
        console.log('[切换作品]', key)
        handleSelectTopic(key)
      }}
      items={currentTopics.map(topic => ({
        key: topic.id,
        label: (
          <div>
            <Text strong>{topic.title}</Text>
            {topic.unreadCount > 0 && (
              <Badge count={topic.unreadCount} style={{ marginLeft: 8 }} />
            )}
          </div>
        )
      }))}
    />
  )

  return (
    <Layout className="wechat-monitor-page">
      {/* 左侧账户列表 */}
      <Sider width={300} className="wechat-account-list">
        {/* 搜索框 */}
        <div className="wechat-search-box">
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索账户"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            bordered={false}
          />
        </div>

        {/* 账户列表 */}
        <div ref={channelListRef} className="wechat-account-scroll">
          <List
            dataSource={displayedChannels}
            renderItem={(channel) => {
              const isSelected = channel.id === selectedChannelId
              const hasUnread = channel.unreadCount > 0

              // ✅ 解析用户信息用于显示（通用结构，支持所有平台）
              let userInfo = null
              try {
                userInfo = channel.userInfo ? JSON.parse(channel.userInfo) : null
              } catch (e) {
                console.error('Failed to parse userInfo:', e)
              }

              // ✅ 优先使用 userInfo 中的字段，fallback 到 channel 字段
              const displayAvatar = userInfo?.avatar || channel.avatar
              const displayName = userInfo?.nickname || channel.name
              // ✅ 统一使用 platform_user_id（兼容旧格式）
              const platformUserId = userInfo?.platform_user_id || userInfo?.platformUserId || null

              // ✅ 直接使用服务器返回的 isLoggedIn 字段
              const isLoggedIn = channel.isLoggedIn ?? false

              return (
                <div
                  key={channel.id}
                  className={`wechat-account-item ${isSelected ? 'selected' : ''} ${channel.isFlashing ? 'flashing' : ''} ${!isLoggedIn ? 'not-logged-in' : ''}`}
                  onClick={() => handleChannelClick(channel)}
                >
                  <Badge count={channel.unreadCount} offset={[0, 10]}>
                    <div style={{ position: 'relative' }}>
                      <Avatar
                        src={displayAvatar}
                        icon={<UserOutlined />}
                        size={48}
                        style={!isLoggedIn ? { filter: 'grayscale(100%)', opacity: 0.6 } : undefined}
                      />
                      {/* 状态点 */}
                      <div style={{
                        position: 'absolute',
                        bottom: 2,
                        right: 2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: isLoggedIn ? '#52c41a' : '#d9d9d9',
                        border: '2px solid #fff',
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.1)'
                      }} />
                    </div>
                  </Badge>
                  <div className="wechat-account-info">
                    <div className="wechat-account-header">
                      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <Text strong className={hasUnread ? 'unread' : ''}>
                          {displayName}
                        </Text>
                        {platformUserId && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {platformUserId}
                          </Text>
                        )}
                      </div>
                      <Text type="secondary" className="wechat-time">
                        {channel.lastMessageTime ? formatTime(channel.lastMessageTime) : ''}
                      </Text>
                    </div>
                    <div className="wechat-account-last-msg">
                      <Text type="secondary" ellipsis className={hasUnread ? 'unread' : ''}>
                        {channel.lastMessage ? truncateText(channel.lastMessage, 18) : '暂无消息'}
                      </Text>
                    </div>
                  </div>
                </div>
              )
            }}
            locale={{
              emptyText: (
                <Empty
                  description={searchText ? '未找到匹配的账户' : '暂无账户'}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )
            }}
          />
        </div>
      </Sider>

      {/* 右侧消息对话框 */}
      <Content className="wechat-chat-content">
        {selectedChannel && (
          selectedTopic ||
          (activeTab === 'comment' && showCommentList) ||
          (activeTab === 'private' && showPrivateList)
        ) ? (
          <>
            {/* 对话框头部 */}
            <div className="wechat-chat-header">
              <div className="wechat-chat-title">
                <Text strong style={{ fontSize: 16 }}>
                  {selectedChannel.name}
                </Text>
              </div>
              <div className="wechat-chat-actions">
                <Text type="secondary" style={{ fontSize: 12, marginRight: 12 }}>
                  {isConnected ? '● 在线' : '○ 离线'}
                </Text>
                <Button
                  type="text"
                  icon={<LogoutOutlined />}
                  onClick={handleLogout}
                  danger
                >
                  退出登录
                </Button>
              </div>
            </div>

            {/* 标签页切换 */}
            <Tabs
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as 'private' | 'comment' | 'works')}
              style={{ padding: '0 20px', backgroundColor: '#f7f7f7' }}
              items={[
                {
                  key: 'comment',
                  label: (
                    <span>
                      <CommentOutlined />
                      作品评论
                      {commentUnhandledCount > 0 && (
                        <Badge
                          count={commentUnhandledCount}
                          style={{ marginLeft: 8 }}
                        />
                      )}
                    </span>
                  ),
                },
                {
                  key: 'private',
                  label: (
                    <span>
                      <MessageOutlined />
                      私信
                      {privateUnhandledCount > 0 && (
                        <Badge
                          count={privateUnhandledCount}
                          style={{ marginLeft: 8 }}
                        />
                      )}
                    </span>
                  ),
                },
                {
                  key: 'works',
                  label: (
                    <span>
                      <AppstoreOutlined />
                      作品列表
                      <Badge
                        count={currentTopics.filter(t => !t.isPrivate).length}
                        style={{ marginLeft: 8, backgroundColor: '#52c41a' }}
                      />
                    </span>
                  ),
                },
              ]}
            />

            {/* 评论Tab下的评论列表（显示所有作品，未读在前） */}
            {activeTab === 'comment' && showCommentList ? (
              <div className="wechat-comment-list" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                {unreadCommentsByTopic.length > 0 ? (
                  <List
                    dataSource={unreadCommentsByTopic}
                    renderItem={(item) => {
                      const isRead = item.unreadCount === 0
                      return (
                        <List.Item
                          key={item.topic.id}
                          onClick={() => handleEnterTopicFromCommentList(item.topic.id)}
                          style={{
                            cursor: 'pointer',
                            padding: '16px',
                            marginBottom: '12px',
                            backgroundColor: isRead ? '#fafafa' : '#fff',
                            borderRadius: '8px',
                            border: '1px solid #e8e8e8',
                            transition: 'all 0.3s',
                            opacity: isRead ? 0.7 : 1
                          }}
                          className={isRead ? 'read-comment-item' : 'unread-comment-item'}
                        >
                          <List.Item.Meta
                            avatar={
                              <Badge count={item.unreadCount} offset={[-5, 5]}>
                                <Avatar
                                  size={48}
                                  src={item.topic.avatar}
                                  icon={<CommentOutlined />}
                                  style={{ backgroundColor: '#1890ff' }}
                                />
                              </Badge>
                            }
                            title={
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text strong style={{ fontSize: 15 }}>
                                  {item.topic.title}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {(() => {
                                    // ✅ 优先使用消息的时间戳，如果没有则使用作品的最后消息时间
                                    const timestamp = item.lastMessage?.timestamp || item.topic.lastMessageTime
                                    const now = Date.now()
                                    const diff = now - timestamp

                                    // 🔧 如果时间差小于 60 秒，可能是 lastCrawlTime 使用了当前时间
                                    // 这种情况下显示日期而不是"刚刚"
                                    if (diff < 60000 && !item.lastMessage) {
                                      // 没有消息详情且显示"刚刚"，改为显示日期
                                      const date = new Date(timestamp)
                                      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
                                    }

                                    return formatTime(timestamp)
                                  })()}
                                </Text>
                              </div>
                            }
                            description={
                              <div>
                                {/* ✅ 优先使用 topic 的 lastMessageContent（服务端计算的最新消息） */}
                                {item.topic.lastMessageContent ? (
                                  <Text type="secondary" style={{ fontSize: 13 }}>
                                    {item.topic.lastMessageFromName || '未知用户'}: {truncateText(item.topic.lastMessageContent, 50)}
                                  </Text>
                                ) : item.lastMessage ? (
                                  <Text type="secondary" style={{ fontSize: 13 }}>
                                    {item.lastMessage.fromName}: {truncateText(item.lastMessage.content, 50)}
                                  </Text>
                                ) : isRead ? (
                                  <Text type="secondary" style={{ fontSize: 13 }}>
                                    {item.topic.description || '暂无评论'}
                                  </Text>
                                ) : (
                                  <Text type="secondary" style={{ fontSize: 13 }}>
                                    {item.unreadCount} 条未读评论
                                  </Text>
                                )}
                              </div>
                            }
                          />
                        </List.Item>
                      )
                    }}
                  />
                ) : (
                  <Empty
                    description="暂无评论"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    style={{ marginTop: '100px' }}
                  />
                )}
              </div>
            ) : activeTab === 'private' && showPrivateList ? (
              /* 私信Tab下的私信列表 */
              <div className="wechat-private-list" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                {privateMessagesByTopic.length > 0 ? (
                  <List
                    dataSource={privateMessagesByTopic}
                    renderItem={(item) => (
                      <List.Item
                        key={item.topic.id}
                        onClick={() => handleEnterTopicFromPrivateList(item.topic.id)}
                        style={{
                          cursor: 'pointer',
                          padding: '16px',
                          marginBottom: '12px',
                          backgroundColor: '#fff',
                          borderRadius: '8px',
                          border: '1px solid #e8e8e8',
                          transition: 'all 0.3s'
                        }}
                        className="private-message-item"
                      >
                        <List.Item.Meta
                          avatar={
                            <Badge count={item.unreadCount} offset={[-5, 5]}>
                              <Avatar
                                size={48}
                                src={item.topic.avatar}
                                icon={<MessageOutlined />}
                                style={{ backgroundColor: '#52c41a' }}
                              />
                            </Badge>
                          }
                          title={
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text strong style={{ fontSize: 15 }}>
                                {item.topic.title}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {item.lastMessage ? formatTime(item.lastMessage.timestamp) : (item.topic.lastMessageTime ? formatTime(item.topic.lastMessageTime) : '')}
                              </Text>
                            </div>
                          }
                          description={
                            <div>
                              <Text type="secondary" style={{ fontSize: 13 }}>
                                {/* ✅ 优先使用 topic 的 lastMessageContent（服务端计算的最新消息） */}
                                {item.topic.lastMessageContent
                                  ? `${item.topic.lastMessageFromName || '未知用户'}: ${truncateText(item.topic.lastMessageContent, 50)}`
                                  : item.lastMessage
                                  ? `${item.lastMessage.fromName}: ${truncateText(item.lastMessage.content, 50)}`
                                  : (item.topic.description || '暂无消息')}
                              </Text>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty
                    description="暂无私信"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    style={{ marginTop: '100px' }}
                  />
                )}
              </div>
            ) : activeTab === 'works' ? (
              /* 作品列表Tab - 显示用户的所有作品及统计数据 */
              <div className="wechat-works-list" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                {/* 排序选择器 */}
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SortAscendingOutlined style={{ fontSize: 16, color: '#8c8c8c' }} />
                  <Text type="secondary">排序：</Text>
                  <Select
                    value={worksSortBy}
                    onChange={(value) => setWorksSortBy(value)}
                    style={{ width: 160 }}
                    options={[
                      { value: 'createdTime', label: '发布时间' },
                      { value: 'viewCount', label: '浏览数' },
                      { value: 'likeCount', label: '点赞数' },
                      { value: 'likeRate', label: '点赞率' },
                      { value: 'commentCount', label: '评论数' },
                      { value: 'commentRate', label: '评论率' },
                      { value: 'shareCount', label: '分享数' },
                      { value: 'shareRate', label: '分享率' },
                      { value: 'favoriteCount', label: '收藏数' },
                      { value: 'favoriteRate', label: '收藏率' },
                      { value: 'danmakuCount', label: '弹幕数' },
                      { value: 'dislikeCount', label: '不喜欢数' },
                      { value: 'downloadCount', label: '下载数' },
                      { value: 'subscribeCount', label: '订阅数' },
                      { value: 'unsubscribeCount', label: '取消订阅数' },
                      { value: 'dislikeRate', label: '不喜欢率' },
                      { value: 'subscribeRate', label: '订阅率' },
                      { value: 'unsubscribeRate', label: '取消订阅率' },
                      { value: 'completionRate', label: '完播率' },
                      { value: 'completionRate5s', label: '5秒完播率' },
                      { value: 'avgViewSecond', label: '平均观看时长' },
                      { value: 'avgViewProportion', label: '平均观看比例' },
                      { value: 'bounceRate2s', label: '2秒跳出率' },
                      { value: 'fanViewProportion', label: '粉丝观看比例' },
                      { value: 'homepageVisitCount', label: '主页访问数' },
                      { value: 'coverShow', label: '封面展示次数' },
                    ]}
                  />
                </div>

                {currentTopics.filter(t => !t.isPrivate).length > 0 ? (
                  <List
                    dataSource={currentTopics.filter(t => !t.isPrivate).sort((a, b) => {
                      // 根据选择的字段进行倒序排序
                      const aValue = a[worksSortBy] ?? 0
                      const bValue = b[worksSortBy] ?? 0
                      return bValue - aValue
                    })}
                    renderItem={(topic) => {
                      const thumbnail = topic.thumbnail || topic.avatar

                      return (
                        <List.Item
                          key={topic.id}
                          style={{
                            padding: '12px 16px',
                            transition: 'background-color 0.2s',
                            borderRadius: 4
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#fafafa'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          <div style={{ display: 'flex', gap: 16, width: '100%', alignItems: 'flex-start' }}>
                            {/* 左侧缩略图 - 点击打开URL */}
                            <div
                              style={{
                                width: 120,
                                height: 68,
                                flexShrink: 0,
                                borderRadius: 4,
                                overflow: 'hidden',
                                backgroundColor: '#f5f5f5',
                                position: 'relative',
                                cursor: topic.url ? 'pointer' : 'default'
                              }}
                              onClick={async (e) => {
                                e.stopPropagation();
                                // 如果作品有URL,在浏览器中打开
                                if (topic.url && window.electron?.openExternal) {
                                  try {
                                    await window.electron.openExternal(topic.url)
                                  } catch (error) {
                                    console.error('打开作品链接失败:', error)
                                  }
                                }
                              }}
                            >
                              {thumbnail ? (
                                <img
                                  alt={topic.title}
                                  src={thumbnail}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                  }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                              ) : (
                                <AppstoreOutlined style={{
                                  position: 'absolute',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  fontSize: 32,
                                  color: '#d9d9d9'
                                }} />
                              )}
                              {/* 未读标记 */}
                              {topic.unreadCount > 0 && (
                                <Badge
                                  count={topic.unreadCount}
                                  style={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                  }}
                                />
                              )}
                            </div>

                            {/* 右侧信息区域 */}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {/* 第一行：标题和发布时间 */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Text strong style={{
                                  fontSize: 14,
                                  flex: 1,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginRight: 12
                                }}>
                                  {topic.title}
                                </Text>
                                <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                                  {new Date(topic.createdTime).toLocaleDateString('zh-CN', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit'
                                  })}
                                </Text>
                              </div>

                              {/* 第二行：基础统计数量 */}
                              <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '8px 16px',
                                fontSize: 12
                              }}>
                                {/* 浏览数 */}
                                {topic.viewCount !== undefined && (
                                  <span>
                                    <Text type="secondary">浏览:</Text> <Text>{topic.viewCount.toLocaleString()}</Text>
                                  </span>
                                )}

                                {/* 点赞数 */}
                                {topic.likeCount !== undefined && (
                                  <span>
                                    <Text type="secondary">点赞:</Text> <Text>{topic.likeCount.toLocaleString()}</Text>
                                  </span>
                                )}

                                {/* 评论数 */}
                                {topic.commentCount !== undefined && (
                                  <span>
                                    <Text type="secondary">评论:</Text> <Text>{topic.commentCount.toLocaleString()}</Text>
                                  </span>
                                )}

                                {/* 分享数 */}
                                {topic.shareCount !== undefined && (
                                  <span>
                                    <Text type="secondary">分享:</Text> <Text>{topic.shareCount.toLocaleString()}</Text>
                                  </span>
                                )}

                                {/* 收藏数 */}
                                {topic.favoriteCount !== undefined && (
                                  <span>
                                    <Text type="secondary">收藏:</Text> <Text>{topic.favoriteCount.toLocaleString()}</Text>
                                  </span>
                                )}

                                {/* 弹幕数 */}
                                {topic.danmakuCount !== undefined && (
                                  <span>
                                    <Text type="secondary">弹幕:</Text> <Text>{topic.danmakuCount.toLocaleString()}</Text>
                                  </span>
                                )}

                                {/* 下载数 */}
                                {topic.downloadCount !== undefined && (
                                  <span>
                                    <Text type="secondary">下载:</Text> <Text>{topic.downloadCount.toLocaleString()}</Text>
                                  </span>
                                )}

                                {/* 订阅数 */}
                                {topic.subscribeCount !== undefined && (
                                  <span>
                                    <Text type="secondary">订阅:</Text> <Text>{topic.subscribeCount.toLocaleString()}</Text>
                                  </span>
                                )}
                              </div>

                              {/* 第三行：统计比率 */}
                              {(topic.likeRate !== undefined || topic.commentRate !== undefined ||
                                topic.shareRate !== undefined || topic.favoriteRate !== undefined ||
                                topic.dislikeRate !== undefined || topic.subscribeRate !== undefined ||
                                topic.unsubscribeRate !== undefined) && (
                                <div style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '8px 16px',
                                  fontSize: 12
                                }}>
                                  {/* 点赞率 */}
                                  {topic.likeRate !== undefined && (
                                    <span>
                                      <Text type="secondary">点赞率:</Text>{' '}
                                      <Tooltip title="每1000次曝光中的点赞次数">
                                        <Text style={{ color: '#ff4d4f', cursor: 'help' }}>
                                          {(topic.likeRate * 1000).toFixed(1)}‰
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 评论率 */}
                                  {topic.commentRate !== undefined && (
                                    <span>
                                      <Text type="secondary">评论率:</Text>{' '}
                                      <Tooltip title="每1000次曝光中的评论次数">
                                        <Text style={{ color: '#52c41a', cursor: 'help' }}>
                                          {(topic.commentRate * 1000).toFixed(1)}‰
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 分享率 */}
                                  {topic.shareRate !== undefined && (
                                    <span>
                                      <Text type="secondary">分享率:</Text>{' '}
                                      <Tooltip title="每1000次曝光中的分享次数">
                                        <Text style={{ color: '#faad14', cursor: 'help' }}>
                                          {(topic.shareRate * 1000).toFixed(1)}‰
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 收藏率 */}
                                  {topic.favoriteRate !== undefined && (
                                    <span>
                                      <Text type="secondary">收藏率:</Text>{' '}
                                      <Tooltip title="每1000次曝光中的收藏次数">
                                        <Text style={{ color: '#722ed1', cursor: 'help' }}>
                                          {(topic.favoriteRate * 1000).toFixed(1)}‰
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 不喜欢率 */}
                                  {topic.dislikeRate !== undefined && (
                                    <span>
                                      <Text type="secondary">不喜欢率:</Text>{' '}
                                      <Tooltip title="每1000次曝光中的不喜欢次数">
                                        <Text style={{ color: '#8c8c8c', cursor: 'help' }}>
                                          {(topic.dislikeRate * 1000).toFixed(1)}‰
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 订阅率 */}
                                  {topic.subscribeRate !== undefined && (
                                    <span>
                                      <Text type="secondary">订阅率:</Text>{' '}
                                      <Tooltip title="每1000次曝光中的订阅次数">
                                        <Text style={{ color: '#1890ff', cursor: 'help' }}>
                                          {(topic.subscribeRate * 1000).toFixed(1)}‰
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 取消订阅率 */}
                                  {topic.unsubscribeRate !== undefined && (
                                    <span>
                                      <Text type="secondary">取消订阅率:</Text>{' '}
                                      <Tooltip title="每1000次曝光中的取消订阅次数">
                                        <Text style={{ color: '#ff7875', cursor: 'help' }}>
                                          {(topic.unsubscribeRate * 1000).toFixed(1)}‰
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* 第四行：高级分析指标（如果有数据才显示）*/}
                              {(topic.completionRate !== undefined || topic.avgViewSecond !== undefined ||
                                topic.fanViewProportion !== undefined || topic.homepageVisitCount !== undefined ||
                                topic.completionRate5s !== undefined || topic.avgViewProportion !== undefined ||
                                topic.bounceRate2s !== undefined || topic.coverShow !== undefined) && (
                                <div style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '8px 16px',
                                  fontSize: 12,
                                  paddingTop: 4,
                                  borderTop: '1px dashed #f0f0f0'
                                }}>
                                  {/* 完播率 */}
                                  {topic.completionRate !== undefined && (
                                    <span>
                                      <Text type="secondary">完播率:</Text>{' '}
                                      <Tooltip title="观看完整视频的用户比例">
                                        <Text style={{ color: '#52c41a', cursor: 'help' }}>
                                          {(topic.completionRate * 100).toFixed(1)}%
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 5秒完播率 */}
                                  {topic.completionRate5s !== undefined && (
                                    <span>
                                      <Text type="secondary">5秒完播:</Text>{' '}
                                      <Tooltip title="观看超过5秒的用户比例">
                                        <Text style={{ cursor: 'help' }}>
                                          {(topic.completionRate5s * 100).toFixed(1)}%
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 平均观看 */}
                                  {topic.avgViewSecond !== undefined && (
                                    <span>
                                      <Text type="secondary">平均观看:</Text>{' '}
                                      <Tooltip title="用户平均观看视频的时长">
                                        <Text style={{ cursor: 'help' }}>
                                          {topic.avgViewSecond.toFixed(1)}秒
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 平均观看比例 */}
                                  {topic.avgViewProportion !== undefined && (
                                    <span>
                                      <Text type="secondary">平均观看比例:</Text>{' '}
                                      <Tooltip title="用户平均观看视频的比例">
                                        <Text style={{ cursor: 'help' }}>
                                          {(topic.avgViewProportion * 100).toFixed(1)}%
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 2秒跳出率 */}
                                  {topic.bounceRate2s !== undefined && (
                                    <span>
                                      <Text type="secondary">2秒跳出:</Text>{' '}
                                      <Tooltip title="观看少于2秒就离开的用户比例">
                                        <Text style={{ color: '#ff4d4f', cursor: 'help' }}>
                                          {(topic.bounceRate2s * 100).toFixed(1)}%
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 粉丝观看比例 */}
                                  {topic.fanViewProportion !== undefined && (
                                    <span>
                                      <Text type="secondary">粉丝占比:</Text>{' '}
                                      <Tooltip title="观看者中粉丝的比例">
                                        <Text style={{ cursor: 'help' }}>
                                          {(topic.fanViewProportion * 100).toFixed(1)}%
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 主页访问 */}
                                  {topic.homepageVisitCount !== undefined && (
                                    <span>
                                      <Text type="secondary">主页访问:</Text>{' '}
                                      <Tooltip title="通过此视频访问主页的次数">
                                        <Text style={{ cursor: 'help' }}>
                                          {topic.homepageVisitCount.toLocaleString()}
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}

                                  {/* 封面展示 */}
                                  {topic.coverShow !== undefined && (
                                    <span>
                                      <Text type="secondary">封面展示:</Text>{' '}
                                      <Tooltip title="视频封面被展示的次数">
                                        <Text style={{ cursor: 'help' }}>
                                          {topic.coverShow.toLocaleString()}
                                        </Text>
                                      </Tooltip>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </List.Item>
                      )
                    }}
                  />
                ) : (
                  <Empty
                    description="暂无作品"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    style={{ marginTop: '100px' }}
                  />
                )}
              </div>
            ) : (
              <>
                {/* 对话视图 - 显示返回按钮 (评论Tab) */}
                {activeTab === 'comment' && !showCommentList && selectedTopic && (
                  <div style={{
                    padding: '12px 20px',
                    backgroundColor: '#f7f7f7',
                    borderBottom: '1px solid #e8e8e8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <Button
                      type="link"
                      icon={<CloseOutlined />}
                      onClick={handleBackToCommentList}
                      style={{ padding: 0 }}
                    >
                      返回未读列表
                    </Button>
                    <Text strong style={{ fontSize: 14, color: '#191919' }}>
                      {selectedTopic.title}
                    </Text>
                  </div>
                )}

                {/* 对话视图 - 显示返回按钮 (私信Tab) */}
                {activeTab === 'private' && !showPrivateList && selectedTopic && (
                  <div style={{
                    padding: '12px 20px',
                    backgroundColor: '#f7f7f7',
                    borderBottom: '1px solid #e8e8e8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <Button
                      type="link"
                      icon={<CloseOutlined />}
                      onClick={handleBackToPrivateList}
                      style={{ padding: 0 }}
                    >
                      返回私信列表
                    </Button>
                    <Text strong style={{ fontSize: 14, color: '#191919' }}>
                      {selectedTopic.title}
                    </Text>
                  </div>
                )}

                {/* 消息列表 */}
                <div ref={messageListRef} className="wechat-message-list">
              {filteredMessages.length > 0 ? (
                (() => {
                  // 私信Tab下显示所有消息(不区分主消息和讨论),评论Tab下区分主消息和讨论
                  const mainMessages = activeTab === 'private'
                    ? filteredMessages
                    : filteredMessages.filter(msg => !msg.replyToId)
                  const discussions = activeTab === 'private'
                    ? []
                    : filteredMessages.filter(msg => msg.replyToId)

                  // 🔍 调试计数器
                  let debugCounter = 0

                  // 渲染消息和其讨论
                  const renderMessageWithDiscussions = (mainMsg: Message) => {
                    // ✅ 优先使用 direction 字段判断（私信消息），fallback 到 fromId（评论消息）
                    // fromId 以 'monitor_' 开头表示是客服回复（客户端ID格式: monitor_{timestamp}_{random}）
                    const isReply = (mainMsg as any).direction === 'outbound' ||
                                    (mainMsg.fromId && mainMsg.fromId.startsWith('monitor_'))
                    const msgDiscussions = activeTab === 'private'
                      ? []
                      : discussions.filter(d => d.replyToId === mainMsg.id)

                    // ✅ 统一使用 mainMsg.authorAvatar 作为头像来源
                    // 如果 Master 没有提供头像，fallback 到左侧账户列表的头像
                    const avatarSrc = mainMsg.authorAvatar || (isReply && selectedChannel ? selectedChannel.avatar : undefined)

                    // 🔍 调试: 打印前3条消息的头像数据
                    if (activeTab === 'private' && selectedTopic && debugCounter < 3) {
                      console.log('[IM-Client] Private message avatar debug (new logic):', {
                        messageId: mainMsg.id,
                        direction: (mainMsg as any).direction,
                        fromId: mainMsg.fromId,
                        fromName: mainMsg.fromName,
                        isReply,
                        msgAuthorAvatar: mainMsg.authorAvatar,
                        finalAvatarSrc: avatarSrc
                      })
                      debugCounter++
                    }

                    return (
                      <div key={mainMsg.id} className="wechat-message-group">
                        {/* 主消息 */}
                        <div className={`wechat-message-item ${isReply ? 'message-right' : 'message-left'}`}>
                          <div className="wechat-message-avatar">
                            <Avatar
                              size={40}
                              src={avatarSrc}
                              icon={<UserOutlined />}
                              style={avatarSrc ? undefined : (isReply ? { backgroundColor: '#07c160' } : undefined)}
                            />
                          </div>

                          <div className="wechat-message-body">
                            <div className="wechat-message-meta">
                              <Text strong style={{ fontSize: 13 }}>
                                {mainMsg.fromName || '未知用户'}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                                {formatMessageTime(mainMsg.timestamp)}
                              </Text>
                              {selectedTopic && (
                                <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                                  | {selectedTopic.title}
                                </Text>
                              )}
                            </div>

                            <div className="wechat-message-content">
                              <div 
                                className={`wechat-message-bubble ${isReply ? 'bubble-right' : 'bubble-left'} ${
                                  (mainMsg as any).isSending ? 'sending' : ''
                                }`}
                              >
                                {mainMsg.type === 'text' || mainMsg.type === 'comment' ? (
                                  <div>
                                    <Text>{mainMsg.content}</Text>

                                    {/* 显示发送状态 */}
                                    {(mainMsg as any).isSending && (
                                      <div className="sending-indicator">
                                        <span className="spinner">🔄</span>
                                        <span>正在发送</span>
                                      </div>
                                    )}
                                  </div>
                                ) : mainMsg.type === 'file' ? (
                                  <Text>[文件] {mainMsg.fileName}</Text>
                                ) : mainMsg.type === 'image' ? (
                                  <Text>[图片]</Text>
                                ) : (
                                  <Text>{mainMsg.content}</Text>
                                )}
                              </div>

                              {/* 评论Tab下显示讨论按钮,私信Tab下不显示 */}
                              {!isReply && activeTab === 'comment' && (
                                <div className="wechat-message-actions">
                                  <Button
                                    type="link"
                                    size="small"
                                    onClick={() => handleReplyToMessage(mainMsg)}
                                  >
                                    讨论
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 讨论回复列表 */}
                        {msgDiscussions.length > 0 && (
                          <div className="wechat-discussions-list">
                            {msgDiscussions.map((discussion) => {
                              const isDiscussionReply = discussion.fromId === 'monitor_client' || discussion.fromName === '客服'

                              return (
                                <div key={discussion.id} className="wechat-discussion-item">
                                  <Avatar
                                    size={32}
                                    src={isDiscussionReply ? undefined : discussion.authorAvatar}
                                    icon={<UserOutlined />}
                                    style={isDiscussionReply ? { backgroundColor: '#07c160' } : undefined}
                                  />
                                  <div className="wechat-discussion-content">
                                    <div className="wechat-discussion-meta">
                                      <Text strong style={{ fontSize: 12 }}>
                                        {discussion.fromName || '未知用户'}
                                      </Text>
                                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                                        {formatMessageTime(discussion.timestamp)}
                                      </Text>
                                    </div>
                                    <div className="wechat-discussion-text">
                                      <Text style={{ fontSize: 13 }}>{discussion.content}</Text>
                                    </div>
                                    {/* ✅ 为讨论添加回复按钮 - 强制显示用于测试 */}
                                    <div className="wechat-discussion-actions" style={{ marginTop: 4 }}>
                                      <Button
                                        type="link"
                                        size="small"
                                        onClick={() => {
                                          console.log('[DEBUG] 点击讨论回复按钮:', discussion);
                                          handleReplyToMessage(discussion);
                                        }}
                                        style={{ padding: 0, height: 'auto', fontSize: 12, color: '#1890ff' }}
                                      >
                                        回复{!isDiscussionReply ? '' : '(客服)'}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return mainMessages.map(renderMessageWithDiscussions)
                })()
              ) : (
                <div className="wechat-empty-messages">
                  <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
                </div>

                {/* 输入框区域 */}
                <div className="wechat-input-area">
              {replyToMessage && (
                <div className="wechat-reply-hint">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    讨论 {replyToMessage.fromName}: {truncateText(replyToMessage.content, 30)}
                  </Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={handleCancelReply}
                  />
                </div>
              )}
              <div className="wechat-input-wrapper">
                <TextArea
                  ref={textAreaRef}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息 (Enter发送, Shift+Enter换行)"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  bordered={false}
                  className="wechat-textarea"
                />
                <Button
                  type="primary"
                  icon={isSending ? undefined : <SendOutlined />}
                  loading={isSending}
                  onClick={handleSendMessage}
                  disabled={!replyContent.trim() || isSending}
                  className="wechat-send-btn"
                >
                  {isSending ? '发送中' : '发送'}
                </Button>
              </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="wechat-empty-state">
            <Empty
              description="请选择一个账户开始对话"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        )}
      </Content>
    </Layout>
  )
}
