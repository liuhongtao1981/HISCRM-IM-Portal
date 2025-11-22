@echo off
chcp 936 >nul
echo ========================================
echo   Worker 进程部署脚本
echo ========================================
echo.

set WORKER_DIR=%~dp0..\packages\worker
set DEPLOY_DIR=%~dp0dist\worker

echo [1/5] 创建部署目录...
if not exist "%DEPLOY_DIR%" mkdir "%DEPLOY_DIR%"

echo [2/5] 复制源代码...
xcopy /s /e /y /i "%WORKER_DIR%\src" "%DEPLOY_DIR%\src\" >nul
copy /y "%WORKER_DIR%\package.json" "%DEPLOY_DIR%\" >nul
if exist "%WORKER_DIR%\package-lock.json" copy /y "%WORKER_DIR%\package-lock.json" "%DEPLOY_DIR%\" >nul

echo [3/5] 创建环境变量配置文件...
echo # Worker 进程环境变量配置 > "%DEPLOY_DIR%\.env.example"
echo # 复制此文件为 .env 并修改配置 >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # Worker 唯一标识 >> "%DEPLOY_DIR%\.env.example"
echo WORKER_ID=worker-1 >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # Worker 端口 >> "%DEPLOY_DIR%\.env.example"
echo WORKER_PORT=4000 >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # Master 服务器地址 >> "%DEPLOY_DIR%\.env.example"
echo MASTER_HOST=localhost >> "%DEPLOY_DIR%\.env.example"
echo MASTER_PORT=3000 >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # 运行环境 >> "%DEPLOY_DIR%\.env.example"
echo NODE_ENV=production >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # 浏览器设置 >> "%DEPLOY_DIR%\.env.example"
echo HEADLESS=true >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # 日志级别 >> "%DEPLOY_DIR%\.env.example"
echo LOG_LEVEL=info >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # 最大账户数 >> "%DEPLOY_DIR%\.env.example"
echo MAX_ACCOUNTS=10 >> "%DEPLOY_DIR%\.env.example"

echo [4/5] 创建启动脚本...
echo @echo off > "%DEPLOY_DIR%\start.bat"
echo chcp 936 ^>nul >> "%DEPLOY_DIR%\start.bat"
echo echo 启动 Worker 进程... >> "%DEPLOY_DIR%\start.bat"
echo cd /d "%%~dp0" >> "%DEPLOY_DIR%\start.bat"
echo. >> "%DEPLOY_DIR%\start.bat"
echo if not exist .env ( >> "%DEPLOY_DIR%\start.bat"
echo     echo ❌ 错误: 未找到 .env 文件 >> "%DEPLOY_DIR%\start.bat"
echo     echo 请复制 .env.example 为 .env 并修改配置 >> "%DEPLOY_DIR%\start.bat"
echo     pause >> "%DEPLOY_DIR%\start.bat"
echo     exit /b 1 >> "%DEPLOY_DIR%\start.bat"
echo ^) >> "%DEPLOY_DIR%\start.bat"
echo. >> "%DEPLOY_DIR%\start.bat"
echo if not exist node_modules ( >> "%DEPLOY_DIR%\start.bat"
echo     echo 正在安装依赖... >> "%DEPLOY_DIR%\start.bat"
echo     call npm install --production >> "%DEPLOY_DIR%\start.bat"
echo ^) >> "%DEPLOY_DIR%\start.bat"
echo. >> "%DEPLOY_DIR%\start.bat"
echo echo 安装 Playwright 浏览器... >> "%DEPLOY_DIR%\start.bat"
echo call npx playwright install chromium >> "%DEPLOY_DIR%\start.bat"
echo. >> "%DEPLOY_DIR%\start.bat"
echo echo 启动服务... >> "%DEPLOY_DIR%\start.bat"
echo node src/index.js >> "%DEPLOY_DIR%\start.bat"

echo [5/5] 创建 PM2 配置文件...
echo module.exports = { > "%DEPLOY_DIR%\ecosystem.config.js"
echo   apps: [{ >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     name: 'hiscrm-worker-1', >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     script: 'src/index.js', >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     instances: 1, >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     autorestart: true, >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     watch: false, >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     max_memory_restart: '2G', >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     env: { >> "%DEPLOY_DIR%\ecosystem.config.js"
echo       NODE_ENV: 'production', >> "%DEPLOY_DIR%\ecosystem.config.js"
echo       WORKER_ID: 'worker-1' >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     } >> "%DEPLOY_DIR%\ecosystem.config.js"
echo   }] >> "%DEPLOY_DIR%\ecosystem.config.js"
echo }; >> "%DEPLOY_DIR%\ecosystem.config.js"

echo.
echo ========================================
echo ✅ Worker 部署包已生成！
echo ========================================
echo.
echo 部署位置: %DEPLOY_DIR%
echo.
echo 下一步操作:
echo   1. 复制 %DEPLOY_DIR% 到服务器
echo   2. 复制 .env.example 为 .env 并修改配置
echo      重要: 每个 Worker 必须有唯一的 WORKER_ID
echo   3. 运行: npm install --production
echo   4. 运行: npx playwright install chromium
echo   5. 启动方式:
echo      - 直接启动: start.bat
echo      - PM2 启动: pm2 start ecosystem.config.js
echo.
echo 多 Worker 部署:
echo   - 复制整个目录为 worker-2, worker-3...
echo   - 修改每个目录的 .env 中的 WORKER_ID 和 WORKER_PORT
echo   - 分别启动
echo.
pause
