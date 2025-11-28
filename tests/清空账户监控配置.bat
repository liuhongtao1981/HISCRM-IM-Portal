@echo off
chcp 65001 >nul
echo ========================================
echo 清空账户监控配置脚本
echo ========================================
echo.
echo 此脚本将清空所有账户的 monitoring_config 字段
echo 执行后所有账户将使用 config.json 中的平台配置
echo.
echo 数据库路径: ..\packages\master\data\master.db
echo.
pause

cd /d "%~dp0..\packages\master"

echo.
echo 正在执行 SQL...
sqlite3 data\master.db "UPDATE accounts SET monitoring_config = NULL;"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ 配置清空成功！
    echo.
    echo 下一步：
    echo 1. 重启 Worker 进程以使配置生效
    echo 2. config.json 中的 commentCrawler.enabled = false 将生效
) else (
    echo.
    echo ❌ 执行失败，错误代码: %ERRORLEVEL%
)

echo.
pause
