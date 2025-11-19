/**
 * WebSocket 连接服务
 */

import { io, Socket } from 'socket.io-client'
import { WS_EVENTS } from '@shared/constants'
import type { Message } from '@shared/types'

// 尝试导入 config.json，如果失败则使用默认值
let config: any = { websocket: { url: 'http://localhost:3000' } }
try {
  // @ts-ignore - config.json 在构建时会被复制到输出目录
  config = require('../../config.json')
} catch (err) {
  console.warn('[WebSocket] 无法加载 config.json，使用默认配置')
}

class WebSocketService {
  private socket: Socket | null = null
  private url: string = config.websocket?.url || 'http://localhost:3000'
  private isConnected: boolean = false

  connect(url?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // 如果提供了 url 参数,则使用参数;否则使用配置文件或默认值
        const connectionUrl = url || this.url
        this.url = connectionUrl

        console.log('[WebSocket] 配置信息:', {
          connectionUrl,
          config: config.websocket
        })

        // 连接到 Master 服务器的根命名空间 (IM WebSocket Server)
        // 注意：不要使用 /client namespace，IM WebSocket Server 监听根命名空间
        this.socket = io(connectionUrl, {
          reconnection: config.websocket?.reconnection ?? true,
          reconnectionDelay: config.websocket?.reconnectionDelay ?? 1000,
          reconnectionDelayMax: config.websocket?.reconnectionDelayMax ?? 5000,
          reconnectionAttempts: config.websocket?.reconnectionAttempts ?? 5,
          transports: ['websocket', 'polling']
        })

        this.socket.on(WS_EVENTS.CONNECT, () => {
          console.log('[WebSocket] ✅ 已成功连接到服务器:', connectionUrl)
          this.isConnected = true
          resolve()
        })

        this.socket.on('connect_error', (error) => {
          console.error('[WebSocket] ❌ 连接错误:', error.message)
        })

        this.socket.on(WS_EVENTS.ERROR, (error) => {
          console.error('[WebSocket] ❌ Socket 错误:', error)
          reject(error)
        })

        this.socket.on(WS_EVENTS.DISCONNECT, (reason) => {
          console.log('[WebSocket] ⚠️  连接已断开, 原因:', reason)
          this.isConnected = false
        })

        // 添加全局事件监听器用于调试
        this.socket.onAny((eventName, ...args) => {
          console.log(`[WebSocket] 收到事件: ${eventName}`, args)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.isConnected = false
    }
  }

  getIsConnected(): boolean {
    return this.isConnected
  }

  onMessage(callback: (message: Message) => void): void {
    if (this.socket) {
      this.socket.on(WS_EVENTS.MESSAGE, callback)
    }
  }

  onStatusChange(callback: (data: { userId: string; status: string }) => void): void {
    if (this.socket) {
      this.socket.on(WS_EVENTS.STATUS_CHANGE, callback)
    }
  }

  onFileTransfer(callback: (fileData: any) => void): void {
    if (this.socket) {
      this.socket.on(WS_EVENTS.FILE_TRANSFER, callback)
    }
  }

  sendMessage(message: Message): void {
    if (this.socket) {
      this.socket.emit(WS_EVENTS.MESSAGE, message)
    }
  }

  on(event: string, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  emit(event: string, data: any): void {
    if (this.socket) {
      this.socket.emit(event, data)
    }
  }

  off(event: string): void {
    if (this.socket) {
      this.socket.off(event)
    }
  }
}

export const websocketService = new WebSocketService()
export default websocketService
