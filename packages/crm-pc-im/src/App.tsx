import { useEffect } from 'react'
import MonitorPage from './pages/MonitorPage'
import { websocketService } from '@services/websocket'
import './App.css'

function App() {
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // 1. 连接到 Master
        const masterUrl = process.env.REACT_APP_MASTER_URL || 'http://localhost:3000'
        await websocketService.connect(masterUrl)
        console.log('[App] 已连接到 Master:', masterUrl)

        // 2. 注册客户端到 Master
        // 生成唯一的设备 ID（可以从本地存储读取以保持一致性）
        const deviceId = getOrCreateDeviceId()
        await websocketService.registerClient(deviceId, 'desktop')
        console.log('[App] 已向 Master 注册客户端:', deviceId)

        // 3. 启动心跳机制（必须）
        websocketService.startHeartbeat(25000) // 每 25 秒发送一次
        console.log('[App] 已启动心跳机制')

        // 4. 监听消息（UI 层会自动处理 crm 格式的消息）
        websocketService.onMessage((crmMessage) => {
          console.log('[App] 收到消息:', crmMessage)
          // Redux/Store 会处理后续逻辑
        })
      } catch (error) {
        console.error('[App] 初始化失败:', error)
      }
    }

    initializeApp()

    return () => {
      websocketService.stopHeartbeat()
      websocketService.disconnect()
    }
  }, [])

  return (
    <div className="app">
      <MonitorPage />
    </div>
  )
}

/**
 * 获取或创建设备 ID
 *
 * 使用本地存储保证客户端的唯一性
 */
function getOrCreateDeviceId(): string {
  const storageKey = 'crm_pc_im_device_id'
  let deviceId = localStorage.getItem(storageKey)

  if (!deviceId) {
    // 首次运行，生成新的设备 ID
    deviceId = `crm-pc-im_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    localStorage.setItem(storageKey, deviceId)
  }

  return deviceId
}

export default App
