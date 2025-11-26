import { app, BrowserWindow, ipcMain, session } from 'electron'
import path from 'path'
import fs from 'fs'
import { io, Socket } from 'socket.io-client'

// 使用环境变量判断,避免在模块顶层访问 app.isPackaged
const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null
let socketClient: Socket | null = null
let loginAssistant: any = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: !isDev,
    title: 'CRM PC IM'
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // 不自动打开开发者工具，需要时按 F12 或 Ctrl+Shift+I
    // mainWindow.webContents.openDevTools()
  } else {
    const indexPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'index.html')
      : path.join(__dirname, '../dist/index.html')

    mainWindow.loadFile(indexPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // ✅ 设置请求拦截器，绕过抖音等平台图片的防盗链
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        '*://*.douyinpic.com/*',
        '*://*.douyin.com/*',
        '*://*.tiktokcdn.com/*',
        '*://*.xiaohongshu.com/*',
        '*://*.xhscdn.com/*'
      ]
    },
    (details, callback) => {
      // 移除或修改 Referer header 来绕过防盗链
      delete details.requestHeaders['Referer']
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  createWindow()

  // 初始化 Socket.IO 客户端和登录助手
  initializeSocketClient()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC 事件处理
ipcMain.handle('get-download-path', async () => {
  const downloadPath = path.join(app.getPath('userData'), 'download')
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true })
  }
  return downloadPath
})

ipcMain.handle('download-file', async (_event, { fileUrl, fileName }) => {
  try {
    const downloadPath = path.join(app.getPath('userData'), 'download')
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true })
    }
    const filePath = path.join(downloadPath, fileName)

    // 这里实现文件下载逻辑
    // 暂时返回模拟结果
    return { success: true, filePath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-file', async (_event, filePath) => {
  try {
    const { shell } = require('electron')
    await shell.openPath(filePath)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-external', async (_event, url) => {
  try {
    const { shell } = require('electron')
    await shell.openExternal(url)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('set-websocket-url', async (_event, url) => {
  try {
    // 保存 WebSocket 地址到本地存储
    const userDataPath = app.getPath('userData')
    const configPath = path.join(userDataPath, 'config.json')

    let config: any = {}
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }

    config.websocketUrl = url
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('get-websocket-url', async () => {
  try {
    const userDataPath = app.getPath('userData')
    const configPath = path.join(userDataPath, 'config.json')

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return config.websocketUrl || 'ws://localhost:8080'
    }

    return 'ws://localhost:8080'
  } catch (error) {
    return 'ws://localhost:8080'
  }
})

// 显示窗口 (最小化时自动弹出,并跳到所有窗口最前面)
ipcMain.handle('show-window', async () => {
  if (mainWindow) {
    // 如果窗口最小化,先恢复
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    // 设置窗口置顶
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
    mainWindow.show()
    mainWindow.focus()

    // 短暂延迟后取消置顶,避免一直在最前面
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false)
      }
    }, 1000)

    return { success: true }
  }
  return { success: false }
})

/**
 * 初始化 Socket.IO 客户端并连接到 Master 服务器
 */
async function initializeSocketClient() {
  try {
    // 1. 加载配置文件获取 WebSocket URL
    const configPath = path.join(app.getPath('userData'), 'config.json')
    let websocketUrl = 'http://127.0.0.1:3000' // 默认值（使用IPv4地址避免IPv6解析问题）

    console.log('[Main] userData 路径:', app.getPath('userData'))
    console.log('[Main] config.json 路径:', configPath)
    console.log('[Main] config.json 是否存在:', fs.existsSync(configPath))

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      console.log('[Main] 配置文件内容:', JSON.stringify(config, null, 2))
      websocketUrl = config.websocketUrl || config.websocket?.url || websocketUrl
    }

    console.log('[Main] 连接到 Master 服务器:', websocketUrl)

    // 2. 创建 Socket.IO 客户端（连接到 /client 命名空间）
    const clientNamespaceUrl = `${websocketUrl}/client`
    console.log('[Main] 完整命名空间URL:', clientNamespaceUrl)

    socketClient = io(clientNamespaceUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    })

    console.log('[Main] Socket.IO 客户端已创建, 开始连接...')

    // 3. 监听连接事件
    socketClient.on('connect', () => {
      console.log('[Main] ✅ 已成功连接到 Master 服务器, socket.id:', socketClient.id)

      // 初始化登录助手
      const LoginAssistant = require(path.join(__dirname, '../src/main/login-assistant.js'))
      loginAssistant = new LoginAssistant(socketClient)
      console.log('[Main] ✅ 登录助手已初始化')
    })

    socketClient.on('connect_error', (error) => {
      console.error('[Main] ❌ 连接 Master 失败:', error.message)
      console.error('[Main] ❌ 错误详情:', error)
      console.error('[Main] ❌ 错误类型:', error.type)
      console.error('[Main] ❌ 错误描述:', error.description)
    })

    socketClient.on('disconnect', (reason) => {
      console.log('[Main] ⚠️  与 Master 断开连接, 原因:', reason)
    })

    // 4. 监听账户状态更新（从 Master 接收）
    // Master 推送的事件名是 'channel:status_update'
    socketClient.on('channel:status_update', (data) => {
      console.log('[Main] 收到账户状态更新:', data)

      // 转发给渲染进程（提取 channel 数据）
      if (mainWindow && data && data.channel) {
        mainWindow.webContents.send('account-status-updated', data.channel)
      }
    })

  } catch (error) {
    console.error('[Main] Socket.IO 初始化失败:', error)
  }
}
