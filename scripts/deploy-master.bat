@echo off
chcp 936 >nul
echo ========================================
echo   Master 服务器部署脚本
echo ========================================
echo.

set MASTER_DIR=%~dp0..\packages\master
set DEPLOY_DIR=%~dp0dist\master

echo [1/5] 创建部署目录...
if not exist "%DEPLOY_DIR%" mkdir "%DEPLOY_DIR%"

echo [2/5] 复制源代码...
xcopy /s /e /y /i "%MASTER_DIR%\src" "%DEPLOY_DIR%\src\" >nul
copy /y "%MASTER_DIR%\package.json" "%DEPLOY_DIR%\" >nul
if exist "%MASTER_DIR%\package-lock.json" copy /y "%MASTER_DIR%\package-lock.json" "%DEPLOY_DIR%\" >nul

echo [3/5] 创建环境变量配置文件...
echo # Master 服务器环境变量配置 > "%DEPLOY_DIR%\.env.example"
echo # 复制此文件为 .env 并修改配置 >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # 服务端口 >> "%DEPLOY_DIR%\.env.example"
echo PORT=3000 >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # 运行环境 >> "%DEPLOY_DIR%\.env.example"
echo NODE_ENV=production >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # 数据库路径 >> "%DEPLOY_DIR%\.env.example"
echo DB_PATH=./data/master.db >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # 日志级别 >> "%DEPLOY_DIR%\.env.example"
echo LOG_LEVEL=info >> "%DEPLOY_DIR%\.env.example"
echo. >> "%DEPLOY_DIR%\.env.example"
echo # CORS 允许的域名 >> "%DEPLOY_DIR%\.env.example"
echo CORS_ORIGIN=* >> "%DEPLOY_DIR%\.env.example"

echo [4/5] 创建启动脚本...
echo @echo off > "%DEPLOY_DIR%\start.bat"
echo chcp 936 ^>nul >> "%DEPLOY_DIR%\start.bat"
echo echo 启动 Master 服务器... >> "%DEPLOY_DIR%\start.bat"
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
echo echo 启动服务... >> "%DEPLOY_DIR%\start.bat"
echo node src/index.js >> "%DEPLOY_DIR%\start.bat"

echo [5/5] 创建 PM2 配置文件...
echo module.exports = { > "%DEPLOY_DIR%\ecosystem.config.js"
echo   apps: [{ >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     name: 'hiscrm-master', >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     script: 'src/index.js', >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     instances: 1, >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     autorestart: true, >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     watch: false, >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     max_memory_restart: '1G', >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     env: { >> "%DEPLOY_DIR%\ecosystem.config.js"
echo       NODE_ENV: 'production' >> "%DEPLOY_DIR%\ecosystem.config.js"
echo     } >> "%DEPLOY_DIR%\ecosystem.config.js"
echo   }] >> "%DEPLOY_DIR%\ecosystem.config.js"
echo }; >> "%DEPLOY_DIR%\ecosystem.config.js"

echo.
echo ========================================
echo ✅ Master 部署包已生成！
echo ========================================
echo.
echo 部署位置: %DEPLOY_DIR%
echo.
echo 下一步操作:
echo   1. 复制 %DEPLOY_DIR% 到服务器
echo   2. 复制 .env.example 为 .env 并修改配置
echo   3. 运行: npm install --production
echo   4. 启动方式:
echo      - 直接启动: start.bat
echo      - PM2 启动: pm2 start ecosystem.config.js
echo.
pause
