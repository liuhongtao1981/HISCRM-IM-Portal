#!/bin/bash

# Master DEBUG 模式启动脚本
# 会自动启动 DEBUG 模式的 Worker

echo "╔════════════════════════════════════════════╗"
echo "║     Master DEBUG Mode 启动                  ║"
echo "║   (会自动启动 DEBUG 模式的 Worker)         ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 设置 Master DEBUG 环境变量
export DEBUG=true
export DEBUG_AUTO_START=true
export DEBUG_HEADLESS=false
export MCP_PORT=9222
export MCP_HOST=localhost

echo "📋 Master DEBUG 配置："
echo "   ✅ DEBUG 模式: 启用"
echo "   ✅ Worker 自动启动: 启用"
echo "   ✅ MCP 调试服务: http://localhost:9222"
echo "   ✅ WebSocket 浏览器直连: ws://localhost:9222"
echo "   ✅ 浏览器显示: 启用"
echo ""

echo "🚀 启动 Master 和 Worker..."
echo ""

# 启动 Master
npm run start:master

