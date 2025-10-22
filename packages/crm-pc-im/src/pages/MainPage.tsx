import { useState, useEffect } from 'react'
import { Layout, message } from 'antd'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState } from '../store'
import FriendList from '../components/FriendList'
import ChatWindow from '../components/ChatWindow'
import websocketService from '../services/websocket'
import { addMessage } from '../store/chatSlice'
import './MainPage.css'

interface MainPageProps {
  onLogout: () => void
}

export default function MainPage({ onLogout }: MainPageProps) {
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const user = useSelector((state: RootState) => state.user.user)
  const websocketUrl = useSelector((state: RootState) => state.user.websocketUrl)
  const dispatch = useDispatch()

  // WebSocket 连接和事件监听
  useEffect(() => {
    if (!user) return

    const connectWebSocket = async () => {
      try {
        await websocketService.connect(websocketUrl)
        console.log('[MainPage] WebSocket 已连接')

        // 发送用户登录事件
        websocketService.emit('user:login', {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          status: user.status
        })

        // 监听登录成功
        websocketService.on('user:login:success', (data) => {
          console.log('[MainPage] 登录成功:', data)
          message.success(`已连接到服务器`)
        })

        // 监听接收消息
        websocketService.onMessage((msg) => {
          console.log('[MainPage] 收到消息:', msg)
          dispatch(addMessage(msg))
          message.info(`收到来自 ${msg.fromName} 的新消息`)
        })

        // 监听在线状态变化
        websocketService.onStatusChange((data) => {
          console.log('[MainPage] 状态变化:', data)
        })
      } catch (error) {
        console.error('[MainPage] WebSocket 连接失败:', error)
        message.error('连接服务器失败')
      }
    }

    connectWebSocket()

    // 清理函数
    return () => {
      if (user) {
        websocketService.emit('user:logout', { userId: user.id })
        websocketService.disconnect()
      }
    }
  }, [user, websocketUrl, dispatch])

  const handleSelectConversation = (friendId: string, topic: string) => {
    setSelectedFriend(friendId)
    setSelectedTopic(topic)
  }

  const handleLogout = () => {
    if (user) {
      websocketService.emit('user:logout', { userId: user.id })
      websocketService.disconnect()
    }
    message.info('已登出')
    onLogout()
  }

  return (
    <Layout className="main-page">
      <Layout.Sider width={280} className="friend-list-sider">
        <FriendList
          onSelectConversation={handleSelectConversation}
          onLogout={handleLogout}
          currentUser={user}
        />
      </Layout.Sider>

      <Layout.Content className="chat-content">
        {selectedFriend && selectedTopic ? (
          <ChatWindow
            friendId={selectedFriend}
            topic={selectedTopic}
            currentUserId={user?.id || ''}
          />
        ) : (
          <div className="empty-state">
            <p>请选择一个聊天对话</p>
          </div>
        )}
      </Layout.Content>
    </Layout>
  )
}
