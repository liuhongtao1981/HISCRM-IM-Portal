@echo off
echo ==========================================
echo IM API HTTP 测试启动脚本
echo ==========================================
echo.

REM 切换到 Master 目录
cd /d "%~dp0\.."

REM 检查 Master 是否已经在运行
curl -s http://localhost:3000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo Master 服务器已在运行
    echo.
    echo 开始运行 HTTP API 测试...
    echo.
    node tests/test-im-api-http.js
    goto :end
)

echo Master 服务器未运行，正在启动...
echo.

REM 启动 Master 服务器（后台）
start /B "Master Server" cmd /c "npm start > logs\master-test.log 2>&1"

echo 等待 Master 服务器启动 (15秒)...
timeout /t 15 /nobreak >nul

REM 检查 Master 是否启动成功
curl -s http://localhost:3000/health >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ❌ Master 服务器启动失败
    echo 请检查日志: logs\master-test.log
    exit /b 1
)

echo ✅ Master 服务器启动成功
echo.
echo 开始运行 HTTP API 测试...
echo.

REM 运行 HTTP API 测试
node tests/test-im-api-http.js

:end
echo.
echo ==========================================
echo 测试完成
echo ==========================================
pause
