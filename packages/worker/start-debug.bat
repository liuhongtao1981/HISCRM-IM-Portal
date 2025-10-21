@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════╗
echo ║     Worker DEBUG Mode 启动                  ║
echo ╚════════════════════════════════════════════╝
echo.

REM 设置环境变量
set DEBUG=true
set DEBUG_LOG_LEVEL=debug
set DEBUG_HEADLESS=false
set MCP_PORT=9222
set MCP_HOST=localhost

echo 📋 调试配置：
echo    ✅ DEBUG 模式: 启用
echo    ✅ 日志级别: debug
echo    ✅ 浏览器: 显示窗口 (headless: false)
echo    ✅ MCP 调试服务: http://localhost:9222
echo    ✅ WebSocket 浏览器直连: ws://localhost:9222
echo.
echo 🚀 启动 Worker...
echo.

REM 启动 Worker
node src/index.js

pause
