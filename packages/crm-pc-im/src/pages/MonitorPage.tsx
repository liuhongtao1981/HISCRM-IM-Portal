/**
 * 监控页面 - 消息监控面板 (微信风格)
 * 架构: 新媒体账户 -> 作品 -> 消息
 * 两列布局: 左侧账户列表 | 右侧消息对话框
 */

import React, { useState, useEffect, useRef } from 'react'
import { Layout, Avatar, Badge, List, Typography, Empty, Input, Button, Dropdown, Menu, Tabs } from 'antd'
import { UserOutlined, SendOutlined, SearchOutlined, MoreOutlined, CloseOutlined, LogoutOutlined, MessageOutlined, CommentOutlined } from '@ant-design/icons'
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
  loadMoreChannels
} from '../store/monitorSlice'
import websocketService from '../services/websocket'
import type { ChannelMessage, Topic, Message } from '../shared/types-monitor'
import './MonitorPage.css'

// 声明 Electron API
declare global {
  interface Window {
    electron?: {
      showWindow: () => void
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
  const [activeTab, setActiveTab] = useState<'private' | 'comment'>('comment') // 当前活动标签页
  const [showCommentList, setShowCommentList] = useState(true) // 评论Tab下是否显示列表(而不是对话)
  const [showPrivateList, setShowPrivateList] = useState(true) // 私信Tab下是否显示列表(而不是对话)
  const textAreaRef = useRef<any>(null)
  const channelListRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)

  const selectedChannel = channels.find(ch => ch.id === selectedChannelId)
  const currentTopics = selectedChannelId ? topics[selectedChannelId] || [] : []
  const selectedTopic = currentTopics.find(tp => tp.id === selectedTopicId)

  // 计算私信和评论的未处理数量
  const privateUnhandledCount = currentMessages.filter(msg =>
    msg.messageCategory === 'private' && !msg.isHandled
  ).length
  const commentUnhandledCount = currentMessages.filter(msg =>
    (msg.messageCategory === 'comment' || !msg.messageCategory) && !msg.isHandled
  ).length

  // 根据当前标签页过滤消息
  const filteredMessages = currentMessages.filter(msg => {
    if (activeTab === 'private') {
      return msg.messageCategory === 'private'
    } else {
      // 评论标签页:显示评论消息或没有分类的消息(兼容旧数据)
      return msg.messageCategory === 'comment' || !msg.messageCategory
    }
  })

  // 构建未读评论列表(按作品分组,显示每个作品的未读数量和最新消息)
  const unreadCommentsByTopic = React.useMemo(() => {
    if (!selectedChannelId) return []

    const topicsWithUnread: Array<{
      topic: Topic
      unreadCount: number
      lastUnreadMessage: Message
    }> = []

    // 遍历该账户的所有作品
    currentTopics.forEach(topic => {
      // 获取该作品的所有未读评论消息
      const topicMessages = messages[topic.id] || []
      const unreadMessages = topicMessages.filter(msg =>
        (msg.messageCategory === 'comment' || !msg.messageCategory) &&
        !msg.isHandled &&
        msg.fromId !== 'monitor_client' // 排除客服自己发的消息
      )

      if (unreadMessages.length > 0) {
        // 按时间降序排序,取最新的一条
        const sortedUnread = [...unreadMessages].sort((a, b) => b.timestamp - a.timestamp)
        topicsWithUnread.push({
          topic,
          unreadCount: unreadMessages.length,
          lastUnreadMessage: sortedUnread[0]
        })
      }
    })

    // 按最新未读消息时间降序排列
    return topicsWithUnread.sort((a, b) =>
      b.lastUnreadMessage.timestamp - a.lastUnreadMessage.timestamp
    )
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

        // ✅ 优先使用服务端推送的 unreadCount，如果消息已加载则使用客户端计算的
        let unreadCount = topic.unreadCount || 0  // 默认使用服务端的值
        if (topicMessages.length > 0) {
          // 消息已加载，使用客户端计算的未读数
          const unreadMessages = privateMessages.filter(msg =>
            !msg.isHandled && msg.fromId !== 'monitor_client'
          )
          unreadCount = unreadMessages.length
        }

        topicsWithPrivate.push({
          topic,
          messageCount: privateMessages.length || topic.messageCount || 0,  // 优先使用已加载的消息数
          unreadCount: unreadCount,
          lastMessage: sortedMessages[0]  // 可能为 undefined
        })
      }
    })

    // ✅ 排序逻辑：1. 未读消息优先  2. 按最新消息时间降序
    return topicsWithPrivate.sort((a, b) => {
      // 1. 优先比较未读数（未读数多的在前）
      if (a.unreadCount !== b.unreadCount) {
        return b.unreadCount - a.unreadCount
      }

      // 2. 未读数相同，按最新消息时间排序（新的在前）
      const aTime = a.lastMessage?.timestamp || a.topic.lastMessageTime || 0
      const bTime = b.lastMessage?.timestamp || b.topic.lastMessageTime || 0
      return bTime - aTime
    })
  }, [selectedChannelId, currentTopics, messages])

  // 调试日志
  useEffect(() => {
    console.log('[当前状态]', {
      selectedChannelId,
      selectedTopicId,
      '作品数量': currentTopics.length,
      '消息数量': currentMessages.length,
      '当前作品': selectedTopic?.title
    })
  }, [selectedChannelId, selectedTopicId, currentTopics.length, currentMessages.length, selectedTopic])

  // 过滤账户列表
  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(searchText.toLowerCase())
  )

  // 显示所有账户（不限制数量）
  const displayedChannels = filteredChannels

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
          console.log('[DEBUG] 接收到的原始 channels 数据:', JSON.stringify(data.channels.slice(0, 2), null, 2))
          if (data.channels.length > 0) {
            const firstChannel = data.channels[0]
            console.log('[DEBUG] 第一个 channel 的 lastMessageTime:', firstChannel.lastMessageTime)
            console.log('[DEBUG] 转换为日期:', new Date(firstChannel.lastMessageTime))
            console.log('[DEBUG] typeof lastMessageTime:', typeof firstChannel.lastMessageTime)
          }
          dispatch(setChannels(data.channels))
          data.channels.forEach((channel: any) => {
            websocketService.emit('monitor:request_topics', { channelId: channel.id })
          })
        })

        // 监听作品列表
        websocketService.on('monitor:topics', (data: any) => {
          console.log('[监听] 收到作品列表:', data)
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
          dispatch(receiveMessage(message))
          if (window.electron?.showWindow) {
            window.electron.showWindow()
          }
          setTimeout(() => {
            dispatch(stopFlashing(message.channelId))
          }, 2000)
        })

        websocketService.emit('monitor:request_channels')
      } catch (error) {
        console.error('[监控] 连接失败:', error)
        dispatch(setConnected(false))
      }
    }

    connectToServer()
    return () => {
      websocketService.disconnect()
    }
  }, [dispatch])

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
          console.log('[选择作品]', targetTopic.id, targetTopic.title)
          dispatch(selectTopic(targetTopic.id))
          websocketService.emit('monitor:request_messages', { topicId: targetTopic.id })
        }
      }
    }, 100)
  }

  // 选择作品
  const handleSelectTopic = (topicId: string) => {
    console.log('[选择作品] topicId:', topicId)
    dispatch(selectTopic(topicId))

    // 请求该作品的消息列表
    websocketService.emit('monitor:request_messages', { topicId })
    console.log('[请求消息] topicId:', topicId)
  }

  // 从未读评论列表点击进入对话
  const handleEnterTopicFromCommentList = (topicId: string) => {
    console.log('[从未读列表进入] topicId:', topicId)
    dispatch(selectTopic(topicId))
    websocketService.emit('monitor:request_messages', { topicId })
    setShowCommentList(false) // 切换到对话视图
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
  }

  // 返回私信列表
  const handleBackToPrivateList = () => {
    setShowPrivateList(true)
    dispatch(selectTopic('')) // 清除选中的作品
  }

  // 发送消息
  const handleSendMessage = () => {
    if (!replyContent.trim() || !selectedChannelId || !selectedTopicId) {
      return
    }

    // 立即在本地添加消息(乐观更新)
    const tempMessage: ChannelMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      topicId: selectedTopicId,
      channelId: selectedChannelId,
      fromName: '客服',
      fromId: 'monitor_client',
      content: replyContent.trim(),
      type: 'comment',
      timestamp: Date.now(),
      serverTimestamp: Date.now(),
      replyToId: replyToMessage?.id,
      replyToContent: replyToMessage?.content
    }

    // 立即更新本地状态
    dispatch(receiveMessage(tempMessage))

    // 发送到服务器
    websocketService.emit('monitor:reply', {
      channelId: selectedChannelId,
      topicId: selectedTopicId,
      type: 'comment',  // 指定消息类型为评论
      replyToId: replyToMessage?.id,
      replyToContent: replyToMessage?.content,
      content: replyContent.trim()
    })

    setReplyContent('')
    setReplyToMessage(null)
  }

  // 取消回复
  const handleCancelReply = () => {
    setReplyToMessage(null)
  }

  // 回复某条消息
  const handleReplyToMessage = (message: Message) => {
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

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
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

              return (
                <div
                  key={channel.id}
                  className={`wechat-account-item ${isSelected ? 'selected' : ''} ${channel.isFlashing ? 'flashing' : ''}`}
                  onClick={() => handleSelectChannel(channel.id)}
                >
                  <Badge count={channel.unreadCount} offset={[0, 10]}>
                    <Avatar
                      src={channel.avatar}
                      icon={<UserOutlined />}
                      size={48}
                    />
                  </Badge>
                  <div className="wechat-account-info">
                    <div className="wechat-account-header">
                      <Text strong className={hasUnread ? 'unread' : ''}>
                        {channel.name}
                      </Text>
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
        {selectedChannel && (selectedTopic || (activeTab === 'comment' && showCommentList)) ? (
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
              onChange={(key) => setActiveTab(key as 'private' | 'comment')}
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
              ]}
            />

            {/* 评论Tab下的未读评论列表 */}
            {activeTab === 'comment' && showCommentList ? (
              <div className="wechat-unread-comment-list" style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                {unreadCommentsByTopic.length > 0 ? (
                  <List
                    dataSource={unreadCommentsByTopic}
                    renderItem={(item) => (
                      <List.Item
                        key={item.topic.id}
                        onClick={() => handleEnterTopicFromCommentList(item.topic.id)}
                        style={{
                          cursor: 'pointer',
                          padding: '16px',
                          marginBottom: '12px',
                          backgroundColor: '#fff',
                          borderRadius: '8px',
                          border: '1px solid #e8e8e8',
                          transition: 'all 0.3s'
                        }}
                        className="unread-comment-item"
                      >
                        <List.Item.Meta
                          avatar={
                            <Badge count={item.unreadCount} offset={[-5, 5]}>
                              <Avatar
                                size={48}
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
                                {formatTime(item.lastUnreadMessage.timestamp)}
                              </Text>
                            </div>
                          }
                          description={
                            <div>
                              <Text type="secondary" style={{ fontSize: 13 }}>
                                {item.lastUnreadMessage.fromName}: {truncateText(item.lastUnreadMessage.content, 50)}
                              </Text>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty
                    description="暂无未读评论"
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
                                {item.lastMessage
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

                  // 渲染消息和其讨论
                  const renderMessageWithDiscussions = (mainMsg: Message) => {
                    const isReply = mainMsg.fromId === 'monitor_client' || mainMsg.fromName === '客服'
                    const msgDiscussions = activeTab === 'private'
                      ? []
                      : discussions.filter(d => d.replyToId === mainMsg.id)

                    return (
                      <div key={mainMsg.id} className="wechat-message-group">
                        {/* 主消息 */}
                        <div className={`wechat-message-item ${isReply ? 'message-right' : 'message-left'}`}>
                          <div className="wechat-message-avatar">
                            <Avatar
                              size={40}
                              icon={<UserOutlined />}
                              style={isReply ? { backgroundColor: '#07c160' } : undefined}
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
                              <div className={`wechat-message-bubble ${isReply ? 'bubble-right' : 'bubble-left'}`}>
                                {mainMsg.type === 'text' || mainMsg.type === 'comment' ? (
                                  <Text>{mainMsg.content}</Text>
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
                  icon={<SendOutlined />}
                  onClick={handleSendMessage}
                  disabled={!replyContent.trim()}
                  className="wechat-send-btn"
                >
                  发送
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
