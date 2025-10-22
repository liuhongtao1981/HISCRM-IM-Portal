import { useState, useEffect } from 'react'
import { Avatar, Button, Badge } from 'antd'
import { LogoutOutlined } from '@ant-design/icons'
import { useDispatch } from 'react-redux'
import { setFriends, setConversations } from '../store/chatSlice'
import { getMockFriendsList, getMockConversations } from '../services/mock'
import type { User, FriendItem, Conversation } from '@shared/types'
import './FriendList.css'

interface FriendListProps {
  onSelectConversation: (friendId: string, topic: string) => void
  onLogout: () => void
  currentUser: User | null
}

export default function FriendList({
  onSelectConversation,
  onLogout,
  currentUser
}: FriendListProps) {
  const dispatch = useDispatch()
  const [friends, setLocalFriends] = useState<FriendItem[]>([])
  const [conversations, setLocalConversations] = useState<Conversation[]>([])
  const [expandedFriends, setExpandedFriends] = useState<string[]>([])

  useEffect(() => {
    const mockFriends = getMockFriendsList()
    setLocalFriends(mockFriends)
    dispatch(setFriends(mockFriends))

    const mockConversations = getMockConversations()
    setLocalConversations(mockConversations)
    dispatch(setConversations(mockConversations))
  }, [dispatch])

  const getConversationsForFriend = (friendId: string) => {
    return conversations.filter(c => c.friendId === friendId)
  }

  const toggleFriend = (friendId: string) => {
    setExpandedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    )
  }

  return (
    <div className="friend-list">
      <div className="friend-list-header">
        <div className="user-info">
          <Avatar size={32} src={currentUser?.avatar} />
          <div className="user-name">{currentUser?.name}</div>
        </div>
      </div>

      <div className="friend-list-content">
        {friends.map(friend => {
          const friendConversations = getConversationsForFriend(friend.id)
          const hasUnread = friendConversations.some(c => c.unreadCount > 0)
          const totalUnread = friendConversations.reduce((sum, c) => sum + c.unreadCount, 0)

          return (
            <div key={friend.id} className="friend-item-wrapper">
              <div className="friend-header" onClick={() => toggleFriend(friend.id)}>
                <Badge count={hasUnread ? totalUnread : 0} className="unread-badge">
                  <Avatar
                    size={40}
                    src={friend.avatar}
                    className={`friend-avatar ${friend.status}`}
                  />
                </Badge>
                <div className="friend-info">
                  <div className="friend-name">{friend.name}</div>
                  <div className="friend-status">
                    {friend.status === 'online' ? (
                      <span className="status-online">● 在线</span>
                    ) : (
                      <span className="status-offline">● 离线</span>
                    )}
                  </div>
                </div>
              </div>

              {expandedFriends.includes(friend.id) && friendConversations.length > 0 && (
                <div className="topic-list">
                  {friendConversations.map(conv => (
                    <div
                      key={`${conv.friendId}-${conv.topic}`}
                      className={`topic-item ${conv.isFlashing ? 'flashing' : ''}`}
                      onClick={() => onSelectConversation(conv.friendId, conv.topic)}
                    >
                      <div className="topic-content">
                        <div className="topic-name">{conv.topic}</div>
                        <div className="topic-preview">
                          {conv.lastMessage.type === 'file'
                            ? `📎 ${conv.lastMessage.fileName}`
                            : conv.lastMessage.content.substring(0, 30)}
                        </div>
                      </div>
                      {conv.unreadCount > 0 && (
                        <Badge count={conv.unreadCount} className="topic-badge" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="friend-list-footer">
        <Button
          type="text"
          danger
          icon={<LogoutOutlined />}
          onClick={onLogout}
          block
          className="logout-btn"
        >
          退出登录
        </Button>
      </div>
    </div>
  )
}
