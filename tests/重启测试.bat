@echo off
chcp 65001
echo ===== 清理所有进程 =====

echo 1. 杀死占用 3000 端口的进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%a 2>nul

echo 2. 杀死所有 Chrome 进程...
taskkill /F /IM chrome.exe 2>nul

echo 3. 等待 2 秒...
timeout /t 2 >nul

echo 4. 清理 Worker 日志...
del /F /Q packages\worker\logs\worker.log 2>nul

echo 5. 删除浏览器数据目录...
rd /S /Q packages\worker\data\browser\worker1\browser_acc-98296c87-2e42-447a-9d8b-8be008ddb6e4 2>nul

echo ===== 清理完成 =====
echo.
echo 请手动启动 Master: cd packages/master ^&^& npm start
pause
