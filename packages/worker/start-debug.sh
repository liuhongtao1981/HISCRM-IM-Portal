#!/bin/bash

# Worker DEBUG 模式启动脚本
# 用于调试浏览器回复功能

echo "╔════════════════════════════════════════════╗"
echo "║     Worker DEBUG Mode 启动                  ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 设置环境变量
export DEBUG=true
export DEBUG_LOG_LEVEL=debug
export DEBUG_HEADLESS=false  # 显示浏览器窗口
export MCP_PORT=9222
export MCP_HOST=localhost

echo "📋 调试配置："
echo "   ✅ DEBUG 模式: 启用"
echo "   ✅ 日志级别: debug"
echo "   ✅ 浏览器: 显示窗口（headless: false）"
echo "   ✅ MCP 调试服务: http://localhost:9222"
echo "   ✅ WebSocket 浏览器直连: ws://localhost:9222"
echo ""

echo "🚀 启动 Worker..."
echo ""

# 启动 Worker
node src/index.js

