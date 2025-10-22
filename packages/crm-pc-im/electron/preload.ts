import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  getDownloadPath: () => ipcRenderer.invoke('get-download-path'),
  downloadFile: (fileUrl: string, fileName: string) =>
    ipcRenderer.invoke('download-file', { fileUrl, fileName }),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  setWebSocketUrl: (url: string) => ipcRenderer.invoke('set-websocket-url', url),
  getWebSocketUrl: () => ipcRenderer.invoke('get-websocket-url'),
  showWindow: () => ipcRenderer.invoke('show-window')
})

declare global {
  interface Window {
    electron: {
      getDownloadPath: () => Promise<string>
      downloadFile: (fileUrl: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
      setWebSocketUrl: (url: string) => Promise<{ success: boolean; error?: string }>
      getWebSocketUrl: () => Promise<string>
      showWindow: () => Promise<{ success: boolean }>
    }
  }
}
