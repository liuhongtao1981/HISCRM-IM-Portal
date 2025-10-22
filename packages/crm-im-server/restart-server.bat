@echo off
echo ========================================
echo 重启 WebSocket 服务器
echo ========================================
echo.

echo [1/2] 查找并结束占用 8080 端口的进程...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080') do (
    echo 发现进程 PID: %%a
    taskkill /F /PID %%a 2>nul
)

echo.
echo 等待 2 秒...
timeout /t 2 /nobreak >nul

echo.
echo [2/2] 启动新服务器...
echo.
node server.js
