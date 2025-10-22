import { useState, useEffect, useRef } from 'react'
import { Input, Button, Empty, message, Spin, Alert } from 'antd'
import { SendOutlined, WifiOutlined, WifiOffOutlined, BellOutlined } from '@ant-design/icons'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState } from '../store'
import { getMockMessages } from '../services/mock'
import type { Message } from '@shared/types'
import MessageItem from './MessageItem'
import websocketService from '../services/websocket'
import { addMessage, setError, clearUnreadCount } from '../store/chatSlice'
import { useWebSocket } from '../hooks/useWebSocket'
import './ChatWindow.css'

interface ChatWindowProps {
  friendId: string
  topic: string
  currentUserId: string
}

export default function ChatWindow({ friendId, topic, currentUserId }: ChatWindowProps) {
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Redux selectors
  const friends = useSelector((state: RootState) => state.chat.friends)
  const user = useSelector((state: RootState) => state.user.user)
  const allMessages = useSelector((state: RootState) => state.chat.messages)
  const chatLoading = useSelector((state: RootState) => state.chat.loading)
  const chatError = useSelector((state: RootState) => state.chat.error)
  const unreadCount = useSelector((state: RootState) => state.chat.unreadCount)
  const dispatch = useDispatch()

  // WebSocket hook
  const { isConnected } = useWebSocket({
    enabled: true,
    autoRegister: true,
    autoHeartbeat: true
  })

  const currentFriend = friends.find(f => f.id === friendId)

  // 筛选当前会话的消息
  const messages = allMessages.filter(m =>
    (m.fromId === currentUserId && m.toId === friendId && m.topic === topic) ||
    (m.fromId === friendId && m.toId === currentUserId && m.topic === topic)
  )

  // 初始加载 Mock 消息
  useEffect(() => {
    const mockMessages = getMockMessages(friendId, topic)
    mockMessages.forEach(msg => {
      if (!allMessages.find(m => m.id === msg.id)) {
        dispatch(addMessage(msg))
      }
    })
    scrollToBottom()
  }, [friendId, topic])

  // 自动滚动到底部
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 清除未读计数
  useEffect(() => {
    if (unreadCount > 0) {
      dispatch(clearUnreadCount())
    }
  }, [unreadCount, dispatch])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim()) {
      message.warning('请输入消息内容')
      return
    }

    if (!user) {
      message.error('用户信息不存在')
      return
    }

    if (!isConnected) {
      message.error('WebSocket 未连接，无法发送消息')
      return
    }

    try {
      setLoading(true)

      const newMessage: Message = {
        id: `msg_${Date.now()}`,
        fromId: currentUserId,
        fromName: user.name,
        toId: friendId,
        topic: topic,
        content: inputValue.trim(),
        type: 'text',
        timestamp: Date.now()
      }

      // 添加到本地消息列表
      dispatch(addMessage(newMessage))

      // 通过 WebSocket 发送到服务器
      websocketService.sendMessage(newMessage)

      setInputValue('')
      console.log('[ChatWindow] 消息已发送:', newMessage)
    } catch (error) {
      console.error('[ChatWindow] 发送消息失败:', error)
      message.error('发送消息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadFile = async (msg: Message) => {
    if (msg.fileUrl && msg.fileName && window.electron) {
      message.info(`开始下载: ${msg.fileName}`)
      const result = await window.electron.downloadFile(msg.fileUrl, msg.fileName)
      if (result.success) {
        message.success('文件下载成功')
      } else {
        message.error('文件下载失败')
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className="chat-title">
          <span className="friend-name">{currentFriend?.name}</span>
          <span className="topic-name"> - {topic}</span>
        </div>
        <div className="chat-status">
          <span className="ws-status" style={{ marginRight: '16px' }}>
            {isConnected ? (
              <span style={{ color: '#52c41a' }}>
                <WifiOutlined /> 已连接
              </span>
            ) : (
              <span style={{ color: '#f5222d' }}>
                <WifiOffOutlined /> 未连接
              </span>
            )}
          </span>

          {unreadCount > 0 && (
            <span className="unread-badge" style={{ marginRight: '16px' }}>
              <BellOutlined /> {unreadCount} 条未读
            </span>
          )}

          {currentFriend?.status === 'online' ? (
            <span className="status-online">● 在线</span>
          ) : (
            <span className="status-offline">● 离线</span>
          )}
        </div>
      </div>

      {chatLoading && (
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Spin tip="正在连接到 Master..." />
        </div>
      )}

      {chatError && (
        <Alert
          message="连接错误"
          description={chatError}
          type="error"
          closable
          onClose={() => dispatch(setError(null))}
          style={{ margin: '8px' }}
        />
      )}

      <div className="chat-messages">
        {messages.length > 0 ? (
          <>
            {messages.map(msg => (
              <MessageItem
                key={msg.id}
                message={msg}
                isOwnMessage={msg.fromId === currentUserId}
                onDownloadFile={() => handleDownloadFile(msg)}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <Empty description="暂无消息" />
        )}
      </div>

      <div className="chat-input-area">
        <Input.TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isConnected ? '输入消息内容，Shift+Enter 换行...' : '等待连接...'}
          rows={3}
          disabled={loading || !isConnected}
          className="chat-input"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSendMessage}
          loading={loading}
          disabled={!isConnected}
          className="send-button"
        >
          发送
        </Button>
      </div>
    </div>
  )
}
