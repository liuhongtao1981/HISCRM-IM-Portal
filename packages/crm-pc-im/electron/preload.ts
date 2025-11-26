import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  getDownloadPath: () => ipcRenderer.invoke('get-download-path'),
  downloadFile: (fileUrl: string, fileName: string) =>
    ipcRenderer.invoke('download-file', { fileUrl, fileName }),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  setWebSocketUrl: (url: string) => ipcRenderer.invoke('set-websocket-url', url),
  getWebSocketUrl: () => ipcRenderer.invoke('get-websocket-url'),
  showWindow: () => ipcRenderer.invoke('show-window'),

  // 登录助手相关
  send: (channel: string, data: any) => {
    // 白名单：只允许特定事件
    const validChannels = ['start-manual-login']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },
  on: (channel: string, func: (...args: any[]) => void) => {
    // 白名单：只允许监听特定事件
    const validChannels = [
      'login-browser-opened',
      'login-success',
      'login-failed',
      'login-timeout',
      'login-cancelled',
      'account-status-updated'
    ]
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => func(...args))
    }
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

declare global {
  interface Window {
    electron: {
      getDownloadPath: () => Promise<string>
      downloadFile: (fileUrl: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
      setWebSocketUrl: (url: string) => Promise<{ success: boolean; error?: string }>
      getWebSocketUrl: () => Promise<string>
      showWindow: () => Promise<{ success: boolean }>
      send: (channel: string, data: any) => void
      on: (channel: string, func: (...args: any[]) => void) => void
      removeAllListeners: (channel: string) => void
    }
  }
}
