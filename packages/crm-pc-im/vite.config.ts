import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './src/shared')
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',  // 监听所有网络接口（IPv4 + IPv6）
    strictPort: true   // 如果端口被占用则失败，不尝试下一个端口
  },
  base: './'
})
