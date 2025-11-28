@echo off
chcp 65001 >nul
echo ========================================
echo  API 爬虫测试启动脚本
echo ========================================
echo.

echo [1/3] 检查配置...
findstr "API_CRAWLER_ENABLED=true" packages\worker\.env >nul
if %errorlevel% == 0 (
    echo ✓ API 爬虫已启用
) else (
    echo ✗ API 爬虫未启用，请检查 .env 文件
    pause
    exit /b 1
)

echo.
echo [2/3] 当前测试配置：
echo   - 执行间隔: 30 秒（自动执行）
echo   - 作品数量: 最多 2 页 x 10 个 = 20 个作品
echo   - 评论数量: 每作品最多 2 页 x 10 条 = 20 条
echo   - 二级评论: 每评论最多 2 页 x 10 条 = 20 条
echo   - 延迟时间: 0.2-0.5 秒（已优化以加快测试）
echo.

echo [3/3] 启动服务...
echo.

start "Master 服务" cmd /k "cd packages\master && echo Master 服务启动中... && npm start"
timeout /t 3 /nobreak >nul

start "Worker 服务" cmd /k "cd packages\worker && echo Worker 服务启动中... && npm start"

echo.
echo ========================================
echo  服务已启动！
echo ========================================
echo.
echo 查看日志：
echo   - Master 日志: 第一个命令行窗口
echo   - Worker 日志: 第二个命令行窗口
echo.
echo API 爬虫将在 Worker 初始化完成后立即执行首次抓取
echo 后续每 30 秒自动执行一次
echo.
echo 按任意键关闭此窗口...
pause >nul
