@echo off
chcp 936 >nul
echo ========================================
echo   HisCRM-IM 一键构建所有组件
echo ========================================
echo.

set SCRIPTS_DIR=%~dp0

echo 开始构建流程...
echo.

echo ----------------------------------------
echo [1/4] 构建 PC 客户端...
echo ----------------------------------------
call "%SCRIPTS_DIR%build-pc-im.bat"
if errorlevel 1 (
    echo ❌ PC 客户端构建失败！
    pause
    exit /b 1
)

echo.
echo ----------------------------------------
echo [2/4] 构建 Admin Web...
echo ----------------------------------------
call "%SCRIPTS_DIR%build-admin-web.bat"
if errorlevel 1 (
    echo ❌ Admin Web 构建失败！
    pause
    exit /b 1
)

echo.
echo ----------------------------------------
echo [3/4] 生成 Master 部署包...
echo ----------------------------------------
call "%SCRIPTS_DIR%deploy-master.bat"
if errorlevel 1 (
    echo ❌ Master 部署包生成失败！
    pause
    exit /b 1
)

echo.
echo ----------------------------------------
echo [4/4] 生成 Worker 部署包...
echo ----------------------------------------
call "%SCRIPTS_DIR%deploy-worker.bat"
if errorlevel 1 (
    echo ❌ Worker 部署包生成失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ 所有组件构建完成！
echo ========================================
echo.
echo 构建结果位于: %SCRIPTS_DIR%dist\
echo.
echo 目录结构:
echo   dist/
echo   ├── CRM-PC-IM.exe        # PC 客户端
echo   ├── admin-web/            # Admin Web 静态文件
echo   ├── master/               # Master 部署包
echo   └── worker/               # Worker 部署包
echo.
pause
