@echo off
REM HisCRM-IM 环境设置脚本 (Windows)
REM 用于快速生成 .env 和 config.json 配置文件

chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║        HisCRM-IM 环境配置向导 (Windows)                   ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM 检查必要的文件
if not exist ".env.example" (
    echo ❌ 错误: 找不到 .env.example 文件
    pause
    exit /b 1
)

if not exist "config.example.json" (
    echo ❌ 错误: 找不到 config.example.json 文件
    pause
    exit /b 1
)

REM 询问部署环境
echo 选择部署环境:
echo   1) 开发环境 (development)
echo   2) 测试环境 (staging)
echo   3) 生产环境 (production)
echo.
set /p ENV_CHOICE="请输入选择 (1-3): "

if "%ENV_CHOICE%"=="1" (
    set ENVIRONMENT=development
    set APP_ROOT=./
    set MASTER_HOST=0.0.0.0
    set MASTER_PORT=3000
    set WORKER_MASTER_HOST=localhost
    set WORKER_MASTER_PORT=3000
    set LOG_LEVEL=debug
) else if "%ENV_CHOICE%"=="2" (
    set ENVIRONMENT=staging
    set /p APP_ROOT="请输入应用根目录 (默认: C:\opt\hiscrm-im): "
    if "!APP_ROOT!"=="" set APP_ROOT=C:\opt\hiscrm-im
    set MASTER_HOST=0.0.0.0
    set MASTER_PORT=3000
    set /p WORKER_MASTER_HOST="请输入 Master 主机名 (默认: localhost): "
    if "!WORKER_MASTER_HOST!"=="" set WORKER_MASTER_HOST=localhost
    set WORKER_MASTER_PORT=3000
    set LOG_LEVEL=info
) else if "%ENV_CHOICE%"=="3" (
    set ENVIRONMENT=production
    set /p APP_ROOT="请输入应用根目录 (默认: C:\opt\hiscrm-im): "
    if "!APP_ROOT!"=="" set APP_ROOT=C:\opt\hiscrm-im
    set /p MASTER_HOST="请输入 Master 绑定地址 (默认: 0.0.0.0): "
    if "!MASTER_HOST!"=="" set MASTER_HOST=0.0.0.0
    set MASTER_PORT=3000
    set /p WORKER_MASTER_HOST="请输入 Master 主机名 (默认: master): "
    if "!WORKER_MASTER_HOST!"=="" set WORKER_MASTER_HOST=master
    set WORKER_MASTER_PORT=3000
    set LOG_LEVEL=info
) else (
    echo ❌ 无效的选择
    pause
    exit /b 1
)

REM Worker 配置
set /p WORKER_ID="请输入 Worker ID (默认: worker-1): "
if "!WORKER_ID!"=="" set WORKER_ID=worker-1

set /p WORKER_MAX_ACCOUNTS="请输入 Worker 最大账户数 (默认: 10): "
if "!WORKER_MAX_ACCOUNTS!"=="" set WORKER_MAX_ACCOUNTS=10

REM 创建 .env 文件
echo.
echo 📝 生成 .env 文件...
copy .env.example .env >nul

REM 创建 config.json 文件
echo 📝 生成 config.json 文件...

(
    echo {
    echo   "environment": "!ENVIRONMENT!",
    echo   "paths": {
    echo     "projectRoot": "!APP_ROOT!",
    echo     "master": {
    echo       "data": "!APP_ROOT!/data/master",
    echo       "logs": "!APP_ROOT!/logs/master"
    echo     },
    echo     "worker": {
    echo       "data": "!APP_ROOT!/data/worker",
    echo       "platforms": "!APP_ROOT!/packages/worker/src/platforms",
    echo       "logs": "!APP_ROOT!/logs/worker"
    echo     }
    echo   },
    echo   "server": {
    echo     "master": {
    echo       "host": "!MASTER_HOST!",
    echo       "port": !MASTER_PORT!
    echo     }
    echo   },
    echo   "worker": {
    echo     "id": "!WORKER_ID!",
    echo     "maxAccounts": !WORKER_MAX_ACCOUNTS!,
    echo     "masterHost": "!WORKER_MASTER_HOST!",
    echo     "masterPort": !WORKER_MASTER_PORT!
    echo   },
    echo   "logging": {
    echo     "level": "!LOG_LEVEL!",
    echo     "format": "json"
    echo   }
    echo }
) > config.json

echo ✅ config.json 文件已生成

REM 显示配置信息
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                     配置完成！                             ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 📋 配置信息摘要:
echo   环境: !ENVIRONMENT!
echo   应用根目录: !APP_ROOT!
echo   Master: !MASTER_HOST!:!MASTER_PORT!
echo   Worker: !WORKER_ID! -^> !WORKER_MASTER_HOST!:!WORKER_MASTER_PORT!
echo   日志级别: !LOG_LEVEL!
echo.
echo 📁 生成的文件:
echo   • .env
echo   • config.json
echo.
echo 🚀 后续步骤:
echo   1. 审查生成的配置文件 (type .env ^& type config.json^)
echo   2. 根据需要进行调整
echo   3. 启动应用: npm run start:master ^& npm run start:worker
echo.
echo 📚 更多信息:
echo   • 查看部署指南: .docs\17-部署指南-环境配置系统.md
echo   • 查看配置示例: config.example.json
echo.

pause
