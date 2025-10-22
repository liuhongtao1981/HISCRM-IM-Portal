/**
 * Redux Store 配置
 */

import { configureStore } from '@reduxjs/toolkit'
import userReducer from './userSlice'
import chatReducer from './chatSlice'
import monitorReducer from './monitorSlice'

// 从localStorage加载持久化状态
const loadState = () => {
  try {
    const serializedState = localStorage.getItem('crm-im-monitor-state')
    if (serializedState === null) {
      return undefined
    }
    const state = JSON.parse(serializedState)

    // 验证关键字段,如果缺失则清除旧数据
    if (state?.monitor &&
        (typeof state.monitor.channelPageSize === 'undefined' ||
         typeof state.monitor.channelDisplayCount === 'undefined')) {
      console.warn('[Store] 检测到旧的持久化数据,已清除')
      localStorage.removeItem('crm-im-monitor-state')
      return undefined
    }

    return state
  } catch (err) {
    console.error('加载持久化状态失败:', err)
    return undefined
  }
}

// 保存状态到localStorage
const saveState = (state: any) => {
  try {
    const serializedState = JSON.stringify(state)
    localStorage.setItem('crm-im-monitor-state', serializedState)
  } catch (err) {
    console.error('保存持久化状态失败:', err)
  }
}

// 加载持久化的monitor状态
const persistedState = loadState()

export const store = configureStore({
  reducer: {
    user: userReducer,
    chat: chatReducer,
    monitor: monitorReducer
  },
  preloadedState: persistedState ? { monitor: persistedState.monitor } : undefined
})

// 防抖保存函数
let saveTimeout: NodeJS.Timeout | null = null
const debouncedSave = (state: any) => {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(() => {
    saveState(state)
  }, 500) // 500ms防抖
}

// 订阅store变化,自动保存monitor状态
store.subscribe(() => {
  const state = store.getState()
  debouncedSave({
    monitor: {
      channels: state.monitor.channels,
      topics: state.monitor.topics,
      messages: state.monitor.messages,
      selectedChannelId: state.monitor.selectedChannelId,
      selectedTopicId: state.monitor.selectedTopicId,
      channelPageSize: state.monitor.channelPageSize,
      channelDisplayCount: state.monitor.channelDisplayCount,
      isConnected: false // 不持久化连接状态
    }
  })
})

// 页面关闭前保存状态
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
    const state = store.getState()
    saveState({
      monitor: {
        channels: state.monitor.channels,
        topics: state.monitor.topics,
        messages: state.monitor.messages,
        selectedChannelId: state.monitor.selectedChannelId,
        selectedTopicId: state.monitor.selectedTopicId,
        channelPageSize: state.monitor.channelPageSize,
        channelDisplayCount: state.monitor.channelDisplayCount,
        isConnected: false
      }
    })
  })
}

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
