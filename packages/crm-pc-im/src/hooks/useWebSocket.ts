/**
 * React Hook: WebSocket 连接和消息管理
 *
 * 功能：
 * 1. 自动连接到 Master WebSocket
 * 2. 客户端注册和心跳
 * 3. 自动将推送消息添加到 Redux
 * 4. 错误处理和重连
 */

import { useEffect, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import websocketService from '../services/websocket'
import { addMessage, setLoading, setError } from '../store/chatSlice'
import { RootState } from '../store'
import type { Message } from '@shared/types'

interface UseWebSocketOptions {
  enabled?: boolean
  autoRegister?: boolean
  autoHeartbeat?: boolean
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    enabled = true,
    autoRegister = true,
    autoHeartbeat = true
  } = options

  const dispatch = useDispatch()
  const loading = useSelector((state: RootState) => state.chat.loading)
  const isConnected = useRef(false)
  const connectionAttempts = useRef(0)
  const maxRetries = 5

  // 连接到 Master
  const connect = useCallback(async () => {
    if (!enabled || isConnected.current) {
      return
    }

    try {
      dispatch(setLoading(true))
      dispatch(setError(null))

      console.log('[useWebSocket] 正在连接到 Master...')
      await websocketService.connect()

      isConnected.current = true
      connectionAttempts.current = 0

      // 自动注册
      if (autoRegister) {
        try {
          console.log('[useWebSocket] 正在注册客户端...')
          await websocketService.registerClient()
        } catch (error) {
          console.error('[useWebSocket] 客户端注册失败:', error)
          // 注册失败不中断连接，继续监听消息
        }
      }

      // 启动心跳
      if (autoHeartbeat) {
        console.log('[useWebSocket] 启动心跳保活...')
        websocketService.startHeartbeat()
      }

      // 监听推送消息
      websocketService.onMessage((crmMessage: Message) => {
        console.log('[useWebSocket] 收到推送消息，自动添加到 Redux:', {
          id: crmMessage.id,
          from: crmMessage.fromName,
          content: crmMessage.content.substring(0, 50)
        })
        dispatch(addMessage(crmMessage))
      })

      dispatch(setLoading(false))
      console.log('[useWebSocket] WebSocket 连接成功！')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      console.error('[useWebSocket] 连接失败:', errorMsg)

      connectionAttempts.current++

      if (connectionAttempts.current < maxRetries) {
        const delay = Math.min(1000 * (2 ** connectionAttempts.current), 30000)
        console.log(`[useWebSocket] ${delay}ms 后重试连接 (${connectionAttempts.current}/${maxRetries})...`)

        setTimeout(() => {
          connect()
        }, delay)
      } else {
        dispatch(setError(`WebSocket 连接失败：${errorMsg}`))
        dispatch(setLoading(false))
      }
    }
  }, [enabled, autoRegister, autoHeartbeat, dispatch])

  // 断开连接
  const disconnect = useCallback(() => {
    console.log('[useWebSocket] 正在断开 WebSocket 连接...')
    websocketService.disconnect()
    isConnected.current = false
  }, [])

  // 生命周期
  useEffect(() => {
    if (enabled) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, connect, disconnect])

  return {
    isConnected: isConnected.current,
    loading,
    connect,
    disconnect
  }
}
