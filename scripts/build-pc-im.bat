@echo off
REM ============================================
REM HisCRM-IM CRM PC IM 打包脚本 (Windows)
REM ============================================

setlocal enabledelayedexpansion

echo ============================================
echo 开始打包 CRM PC IM Electron 应用
echo ============================================

REM 设置颜色
color 0A

REM 检查 Node.js
echo 检查 Node.js 版本...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Node.js 未安装，请先安装 Node.js 18 或更高版本
    pause
    exit /b 1
)
echo [✓] Node.js 已安装:
node -v

REM 进入 CRM PC IM 目录
cd /d "%~dp0..\packages\crm-pc-im"

REM 检查目录是否存在
if not exist "package.json" (
    echo [错误] 未找到 package.json，请确认目录正确
    pause
    exit /b 1
)

REM 检查 config.json
echo.
echo 检查配置文件...
if not exist "config.json" (
    echo [错误] config.json 不存在，请创建配置文件
    pause
    exit /b 1
)
echo [✓] 配置文件存在

REM 显示当前配置
echo.
echo 当前配置:
type config.json
echo.

REM 询问是否修改配置
set /p MODIFY_CONFIG="是否需要修改配置? (y/n): "
if /i "%MODIFY_CONFIG%"=="y" (
    echo 请手动编辑 config.json 文件...
    notepad config.json
)

REM 清理旧的构建产物
echo.
echo 清理旧的构建产物...
if exist "dist" rd /s /q dist
if exist "dist-electron" rd /s /q dist-electron
if exist "release" rd /s /q release
echo [✓] 清理完成

REM 安装依赖
echo.
echo 安装依赖...
call npm install
if %errorlevel% neq 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo [✓] 依赖安装完成

REM 运行构建验证
echo.
echo 运行构建验证...
node verify-build.js
if %errorlevel% neq 0 (
    echo [警告] 构建验证未通过，但继续执行...
)

REM 构建应用
echo.
echo 构建 Vite 项目...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] Vite 构建失败
    pause
    exit /b 1
)
echo [✓] Vite 构建完成

REM 构建 Electron
echo.
echo 构建 Electron...
call npm run build:electron
if %errorlevel% neq 0 (
    echo [错误] Electron 构建失败
    pause
    exit /b 1
)
echo [✓] Electron 构建完成

REM 打包 Electron 应用
echo.
echo 打包 Electron 应用 (这可能需要几分钟)...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win portable
if %errorlevel% neq 0 (
    echo [错误] Electron 打包失败
    pause
    exit /b 1
)
echo [✓] 打包完成

REM 检查输出文件
echo.
echo 检查输出文件...
if exist "release\CRM-PC-IM.exe" (
    echo [✓] 打包成功！
    echo.
    echo ============================================
    echo 打包完成！
    echo ============================================
    echo 输出文件: release\CRM-PC-IM.exe
    for %%I in ("release\CRM-PC-IM.exe") do echo 文件大小: %%~zI 字节
    echo.
    echo 可以将此文件分发给用户使用
    echo.

    REM 询问是否打开输出目录
    set /p OPEN_DIR="是否打开输出目录? (y/n): "
    if /i "!OPEN_DIR!"=="y" (
        explorer release
    )
) else (
    echo [错误] 未找到输出文件 release\CRM-PC-IM.exe
    pause
    exit /b 1
)

pause
