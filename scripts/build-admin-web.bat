@echo off
chcp 936 >nul
echo ========================================
echo   Admin-Web 构建脚本
echo ========================================
echo.

cd /d "%~dp0..\packages\admin-web"

echo [1/3] 清理旧的构建...
if exist build rmdir /s /q build

echo [2/3] 开始构建生产版本...
call npm run build
if errorlevel 1 (
    echo.
    echo ❌ 构建失败！
    pause
    exit /b 1
)

echo.
echo [3/3] 复制到 scripts/dist 目录...
if not exist "%~dp0dist\admin-web" mkdir "%~dp0dist\admin-web"
xcopy /s /e /y /i "build\*" "%~dp0dist\admin-web\"
if errorlevel 1 (
    echo ❌ 复制失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ 构建完成！
echo ========================================
echo.
echo 文件位置:
echo   - packages\admin-web\build\ (源位置)
echo   - scripts\dist\admin-web\ (复制后)
echo.
echo 部署方式:
echo   将 admin-web 目录复制到 Web 服务器
echo   或使用 Nginx/Apache 托管静态文件
echo.
pause
