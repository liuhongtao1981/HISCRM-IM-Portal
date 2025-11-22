@echo off
chcp 936 >nul
echo ========================================
echo   CRM-PC-IM 编译生成脚本
echo ========================================
echo.

cd /d "%~dp0..\packages\crm-pc-im"

echo [1/3] 清理旧的构建...
if exist release rmdir /s /q release

echo [2/3] 开始编译打包...
call npm run electron:build
if errorlevel 1 (
    echo.
    echo ❌ 编译失败！
    pause
    exit /b 1
)

echo.
echo [3/3] 复制到 scripts 目录...
if not exist "%~dp0dist" mkdir "%~dp0dist"
copy /y "release\CRM-PC-IM.exe" "%~dp0dist\"
if errorlevel 1 (
    echo ❌ 复制失败！
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ 编译完成！
echo ========================================
echo.
echo 文件位置:
echo   - packages\crm-pc-im\release\CRM-PC-IM.exe
echo   - scripts\dist\CRM-PC-IM.exe
echo.
pause
