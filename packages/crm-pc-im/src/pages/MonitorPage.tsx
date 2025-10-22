/**
 * 监控页面 - 消息监控面板 (微信风格)
 * 架构: 新媒体账户 -> 作品 -> 消息
 * 两列布局: 左侧账户列表 | 右侧消息对话框
 */

import { useState, useEffect, useRef } from 'react'
import { Layout, Avatar, Badge, List, Typography, Empty, Input, Button, Dropdown, Menu } from 'antd'
import { UserOutlined, SendOutlined, SearchOutlined, MoreOutlined, CloseOutlined } from '@ant-design/icons'
import { useSelector, useDispatch } from 'react-redux'
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
  const channels = useSelector((state: RootState) => state.monitor.channels)
  const topics = useSelector((state: RootState) => state.monitor.topics)
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
  const textAreaRef = useRef<any>(null)
  const channelListRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)

  const selectedChannel = channels.find(ch => ch.id === selectedChannelId)
  const currentTopics = selectedChannelId ? topics[selectedChannelId] || [] : []
  const selectedTopic = currentTopics.find(tp => tp.id === selectedTopicId)

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

  // 确保 channelDisplayCount 有默认值
  const safeChannelDisplayCount = channelDisplayCount || 20
  const displayedChannels = filteredChannels.slice(0, Math.min(safeChannelDisplayCount, filteredChannels.length))

  // 连接服务器
  useEffect(() => {
    const connectToServer = async () => {
      try {
        let clientId = localStorage.getItem('crm-im-client-id')
        if (!clientId) {
          clientId = `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          localStorage.setItem('crm-im-client-id', clientId)
        }

        await websocketService.connect('ws://localhost:8080')
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

  // 发送消息
  const handleSendMessage = () => {
    if (!replyContent.trim() || !selectedChannelId || !selectedTopicId) {
      return
    }

    websocketService.emit('monitor:reply', {
      channelId: selectedChannelId,
      topicId: selectedTopicId,
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
        {selectedChannel && selectedTopic ? (
          <>
            {/* 对话框头部 */}
            <div className="wechat-chat-header">
              <div className="wechat-chat-title">
                <Text strong style={{ fontSize: 16 }}>
                  {selectedChannel.name}
                </Text>
                {currentTopics.length > 1 && (
                  <Dropdown overlay={topicsMenu} trigger={['click']}>
                    <Button type="text" size="small" style={{ marginLeft: 8 }}>
                      {selectedTopic.title} ({currentTopics.length})
                    </Button>
                  </Dropdown>
                )}
              </div>
              <div className="wechat-chat-actions">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {isConnected ? '● 在线' : '○ 离线'}
                </Text>
              </div>
            </div>

            {/* 消息列表 */}
            <div ref={messageListRef} className="wechat-message-list">
              {currentMessages.length > 0 ? (
                (() => {
                  // 分离主消息（评论）和讨论回复
                  const mainMessages = currentMessages.filter(msg => !msg.replyToId)
                  const discussions = currentMessages.filter(msg => msg.replyToId)

                  // 渲染消息和其讨论
                  const renderMessageWithDiscussions = (mainMsg: Message) => {
                    const isReply = mainMsg.fromId === 'monitor_client' || mainMsg.fromName === '客服'
                    const msgDiscussions = discussions.filter(d => d.replyToId === mainMsg.id)

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
                                {mainMsg.type === 'text' ? (
                                  <Text>{mainMsg.content}</Text>
                                ) : mainMsg.type === 'file' ? (
                                  <Text>[文件] {mainMsg.fileName}</Text>
                                ) : (
                                  <Text>[图片]</Text>
                                )}
                              </div>

                              {!isReply && (
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
