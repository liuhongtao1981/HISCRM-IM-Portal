/**
 * WebSocket 连接服务 - Master 协议版本
 *
 * 核心改动：
 * 1. 连接到 Master（而不是 crm-im-server）
 * 2. 添加客户端注册机制（client:register）
 * 3. 添加心跳机制（client:heartbeat）
 * 4. 在消息接收/发送时做协议转换
 * 5. 添加消息确认机制（notification:ack）
 */

import { io, Socket } from 'socket.io-client'
import { WS_EVENTS } from '@shared/constants'
import type { Message } from '@shared/types'
import {
  convertMasterToCrm,
  convertCrmToMaster,
  generateClientId,
  formatMasterMessageForLog,
  formatCrmMessageForLog,
} from './protocol-converter'

class WebSocketService {
  private socket: Socket | null = null
  private url: string = 'http://localhost:3000' // Master 默认地址
  private isConnected: boolean = false
  private clientId: string = generateClientId()
  private deviceType: string = 'desktop'
  private heartbeatInterval: NodeJS.Timeout | null = null
  private messageCallbacks: ((message: Message) => void)[] = []

  /**
   * 连接到 Master
   */
  connect(url?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (url) {
          this.url = url
        }

        console.log(`[WebSocket] 正在连接到 Master: ${this.url}`)

        // 连接到 Master 的根命名空间
        this.socket = io(this.url, {
          path: '/socket.io/',
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
          transports: ['websocket', 'polling'],
          query: {
            clientId: this.clientId,
            deviceType: this.deviceType,
          },
        })

        this.socket.on(WS_EVENTS.CONNECT, () => {
          console.log('[WebSocket] 已连接到 Master')
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
          if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval)
            this.heartbeatInterval = null
          }
        })

        // 监听 Master 推送的消息
        this.socket.on('message', (masterMessage: any) => {
          console.log('[WebSocket] 收到 Master 消息:', formatMasterMessageForLog(masterMessage))

          // 转换为 crm 格式
          const crmMessage = convertMasterToCrm(masterMessage)

          // 分发给所有监听器
          this.messageCallbacks.forEach((callback) => {
            try {
              callback(crmMessage)
            } catch (error) {
              console.error('[WebSocket] 消息回调执行出错:', error)
            }
          })

          // 发送确认信号给 Master
          if (masterMessage.id) {
            this.sendNotificationAck(masterMessage.id)
          }
        })

        // 注册响应处理
        this.socket.on('client:register:success', (data) => {
          console.log('[WebSocket] 客户端注册成功:', data)
        })

        this.socket.on('client:register:error', (error) => {
          console.error('[WebSocket] 客户端注册失败:', error)
        })

        // 调试：监听所有事件
        this.socket.onAny((eventName, ...args) => {
          if (!['message'].includes(eventName)) {
            console.log(`[WebSocket] 收到事件: ${eventName}`, args)
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 注册客户端到 Master
   *
   * 必须在 connect() 之后调用
   */
  async registerClient(deviceId?: string, deviceType?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        reject(new Error('WebSocket 未连接'))
        return
      }

      if (deviceId) {
        this.clientId = deviceId
      }
      if (deviceType) {
        this.deviceType = deviceType
      }

      console.log('[WebSocket] 正在向 Master 注册客户端:', {
        clientId: this.clientId,
        deviceType: this.deviceType,
      })

      // 监听注册响应（一次性）
      const successHandler = (data: any) => {
        console.log('[WebSocket] 客户端注册成功:', data)
        this.socket?.off('client:register:error', errorHandler)
        resolve()
      }

      const errorHandler = (error: any) => {
        console.error('[WebSocket] 客户端注册失败:', error)
        this.socket?.off('client:register:success', successHandler)
        reject(error)
      }

      this.socket.once('client:register:success', successHandler)
      this.socket.once('client:register:error', errorHandler)

      // 发送注册请求
      this.socket.emit('client:register', {
        client_id: this.clientId,
        device_id: this.clientId,
        device_type: this.deviceType,
        app_version: '0.0.1',
      })

      // 30 秒超时
      setTimeout(() => {
        this.socket?.off('client:register:success', successHandler)
        this.socket?.off('client:register:error', errorHandler)
        reject(new Error('客户端注册超时'))
      }, 30000)
    })
  }

  /**
   * 启动心跳机制
   *
   * Master 需要定期收到心跳信号来确认客户端在线
   * 默认每 25 秒发送一次（Master 要求 30 秒内至少一次）
   */
  startHeartbeat(interval: number = 25000): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    console.log('[WebSocket] 启动心跳机制，间隔:', interval, 'ms')

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('client:heartbeat', {
          client_id: this.clientId,
          timestamp: Date.now(),
        })
      }
    }, interval)
  }

  /**
   * 停止心跳机制
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
      console.log('[WebSocket] 停止心跳机制')
    }
  }

  /**
   * 发送确认信号给 Master
   *
   * 通知 Master 客户端已收到并处理了某条消息
   */
  sendNotificationAck(notificationId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('client:notification:ack', {
        notification_id: notificationId,
        client_id: this.clientId,
        timestamp: Date.now(),
      })
    }
  }

  disconnect(): void {
    console.log('[WebSocket] 正在断开连接')
    this.stopHeartbeat()
    if (this.socket) {
      this.socket.disconnect()
      this.isConnected = false
    }
  }

  getIsConnected(): boolean {
    return this.isConnected
  }

  getClientId(): string {
    return this.clientId
  }

  /**
   * 注册消息监听器
   *
   * 改动：支持多个回调函数，每个都会收到转换后的 crm 格式消息
   */
  onMessage(callback: (message: Message) => void): void {
    this.messageCallbacks.push(callback)
  }

  /**
   * 发送消息给 Master
   *
   * 内部会自动将 crm 格式转换为 Master 格式
   */
  sendMessage(crmMessage: Message): void {
    if (!this.socket || !this.isConnected) {
      console.error('[WebSocket] 未连接，无法发送消息')
      return
    }

    // 转换为 Master 格式
    const masterMessage = convertCrmToMaster(crmMessage)

    console.log('[WebSocket] 发送消息到 Master:', formatCrmMessageForLog(crmMessage))

    // 发送给 Master
    this.socket.emit('message', masterMessage)
  }

  /**
   * 通用事件监听（低级别 API）
   */
  on(event: string, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  /**
   * 通用事件发送（低级别 API）
   */
  emit(event: string, data: any): void {
    if (this.socket) {
      this.socket.emit(event, data)
    }
  }

  /**
   * 移除事件监听
   */
  off(event: string): void {
    if (this.socket) {
      this.socket.off(event)
    }
  }
}

export const websocketService = new WebSocketService()
export default websocketService
