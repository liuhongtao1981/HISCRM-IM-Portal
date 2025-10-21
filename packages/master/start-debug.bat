@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════╗
echo ║     Master DEBUG Mode 启动                  ║
echo ║   (会自动启动 DEBUG 模式的 Worker)         ║
echo ╚════════════════════════════════════════════╝
echo.

REM 设置 Master DEBUG 环境变量
set DEBUG=true
set DEBUG_AUTO_START=true
set DEBUG_HEADLESS=false
set MCP_PORT=9222
set MCP_HOST=localhost

echo 📋 Master DEBUG 配置：
echo    ✅ DEBUG 模式: 启用
echo    ✅ Worker 自动启动: 启用
echo    ✅ MCP 调试服务: http://localhost:9222
echo    ✅ WebSocket 浏览器直连: ws://localhost:9222
echo    ✅ 浏览器显示: 启用
echo.
echo 🚀 启动 Master 和 Worker...
echo.

REM 启动 Master
npm run start:master

pause
