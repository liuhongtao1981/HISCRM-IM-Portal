/**
 * WebSocket 连接服务
 */

import { io, Socket } from 'socket.io-client'
import { WS_EVENTS } from '@shared/constants'
import type { Message } from '@shared/types'

class WebSocketService {
  private socket: Socket | null = null
  private url: string = 'ws://localhost:8080'
  private isConnected: boolean = false

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.url = url
        this.socket = io(url, {
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
          transports: ['websocket', 'polling']
        })

        this.socket.on(WS_EVENTS.CONNECT, () => {
          console.log('[WebSocket] 已连接到服务器')
          this.isConnected = true
          resolve()
        })

        this.socket.on(WS_EVENTS.ERROR, (error) => {
          console.error('[WebSocket] 连接错误:', error)
          reject(error)
        })

        this.socket.on(WS_EVENTS.DISCONNECT, () => {
          console.log('[WebSocket] 连接已断开')
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
