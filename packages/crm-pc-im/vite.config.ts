import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync } from 'fs'

// 插件：复制 config.json 到构建输出目录
function copyConfigPlugin() {
  return {
    name: 'copy-config',
    closeBundle() {
      const src = path.resolve(__dirname, 'config.json')
      const dest = path.resolve(__dirname, 'dist/config.json')
      try {
        copyFileSync(src, dest)
        console.log('✓ config.json copied to dist/')
      } catch (err) {
        console.warn('Failed to copy config.json:', err)
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), copyConfigPlugin()],
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
