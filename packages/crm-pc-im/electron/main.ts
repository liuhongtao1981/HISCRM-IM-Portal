import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'

// 使用环境变量判断,避免在模块顶层访问 app.isPackaged
const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null

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
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

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
