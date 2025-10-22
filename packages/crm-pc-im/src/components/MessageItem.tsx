import { Tag, Button, Tooltip } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { Message } from '@shared/types'
import './MessageItem.css'

interface MessageItemProps {
  message: Message
  isOwnMessage: boolean
  onDownloadFile: () => void
}

export default function MessageItem({ message, isOwnMessage, onDownloadFile }: MessageItemProps) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isSameDay = date.toDateString() === now.toDateString()

    if (isSameDay) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } else {
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  return (
    <div className={`message-item ${isOwnMessage ? 'own-message' : 'other-message'}`}>
      <div className="message-content">
        {message.type === 'text' ? (
          <div className="message-text">{message.content}</div>
        ) : (
          <div className="message-file">
            <div className="file-info">
              <span className="file-icon">📎</span>
              <span className="file-name">{message.fileName || '文件'}</span>
            </div>
            <Tooltip title="下载文件">
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                onClick={onDownloadFile}
              />
            </Tooltip>
          </div>
        )}
      </div>

      <div className="message-meta">
        <span className="message-time">{formatTime(message.timestamp)}</span>
        {!isOwnMessage && (
          <Tag color="blue" className="sender-tag">
            {message.fromName}
          </Tag>
        )}
      </div>
    </div>
  )
}
