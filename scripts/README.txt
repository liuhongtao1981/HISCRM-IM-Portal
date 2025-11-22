========================================
HisCRM-IM 构建与部署脚本
========================================

一、脚本清单
========================================

【构建脚本】
1. build-all.bat           # 一键构建所有组件
2. build-pc-im.bat         # 构建 PC 客户端 (Electron)
3. build-admin-web.bat     # 构建 Admin Web (React)

【部署脚本】
4. deploy-master.bat       # 生成 Master 部署包
5. deploy-worker.bat       # 生成 Worker 部署包

【说明文档】
6. README.txt              # 本文件

二、快速开始
========================================

【方式一：一键构建所有组件】

双击运行: build-all.bat

自动完成:
  ✅ PC 客户端编译
  ✅ Admin Web 构建
  ✅ Master 部署包生成
  ✅ Worker 部署包生成

结果位于: scripts/dist/

【方式二：单独构建组件】

根据需要运行对应脚本:
  - build-pc-im.bat       # 只构建 PC 客户端
  - build-admin-web.bat   # 只构建 Admin Web
  - deploy-master.bat     # 只生成 Master 部署包
  - deploy-worker.bat     # 只生成 Worker 部署包

三、输出目录结构
========================================

scripts/dist/
├── CRM-PC-IM.exe          # PC 客户端 (77MB)
│
├── admin-web/              # Admin Web 静态文件
│   ├── index.html
│   ├── assets/
│   └── ...
│
├── master/                 # Master 服务器部署包
│   ├── src/               # 源代码
│   ├── package.json
│   ├── .env.example       # 环境变量示例
│   ├── start.bat          # 启动脚本
│   └── ecosystem.config.js # PM2 配置
│
└── worker/                 # Worker 进程部署包
    ├── src/               # 源代码
    ├── package.json
    ├── .env.example       # 环境变量示例
    ├── start.bat          # 启动脚本
    └── ecosystem.config.js # PM2 配置

四、PC 客户端部署
========================================

【文件】
scripts/dist/CRM-PC-IM.exe (77MB)

【使用方法】
1. 复制 exe 到客户端电脑
2. 创建 config.json (与 exe 同目录):
   {
     "websocketUrl": "http://服务器IP:3000"
   }
3. 双击运行 CRM-PC-IM.exe

【特性】
✅ HashRouter 路由 (支持 file:// 协议)
✅ 无白屏问题
✅ 可按 F12 打开开发者工具

五、Admin Web 部署
========================================

【文件】
scripts/dist/admin-web/ (React 静态文件)

【部署方式一：Nginx】

server {
    listen 3001;
    root /path/to/admin-web;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

【部署方式二：Apache】

<VirtualHost *:3001>
    DocumentRoot /path/to/admin-web
    <Directory /path/to/admin-web>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>

【部署方式三：静态文件服务器】

npx serve -s admin-web -l 3001

六、Master 服务器部署
========================================

【部署包】
scripts/dist/master/

【部署步骤】

1. 复制到服务器:
   scp -r dist/master/ user@server:/opt/hiscrm/

2. 进入目录:
   cd /opt/hiscrm/master

3. 配置环境变量:
   copy .env.example .env
   编辑 .env 文件

4. 安装依赖:
   npm install --production

5. 启动服务:
   方式一 (直接启动):
     start.bat

   方式二 (PM2 后台):
     pm2 start ecosystem.config.js
     pm2 save

【环境变量说明】

.env 文件配置:

# 服务端口
PORT=3000

# 运行环境
NODE_ENV=production

# 数据库路径
DB_PATH=./data/master.db

# 日志级别 (error/warn/info/debug)
LOG_LEVEL=info

# CORS 允许的域名 (* 表示全部)
CORS_ORIGIN=*

【验证运行】

浏览器访问: http://服务器IP:3000
返回 API 信息则成功

七、Worker 进程部署
========================================

【部署包】
scripts/dist/worker/

【部署步骤】

1. 复制到服务器:
   scp -r dist/worker/ user@server:/opt/hiscrm/

2. 进入目录:
   cd /opt/hiscrm/worker

3. 配置环境变量:
   copy .env.example .env
   编辑 .env 文件

4. 安装依赖:
   npm install --production
   npx playwright install chromium

5. 启动服务:
   方式一 (直接启动):
     start.bat

   方式二 (PM2 后台):
     pm2 start ecosystem.config.js
     pm2 save

【环境变量说明】

.env 文件配置:

# Worker 唯一标识 (多 Worker 时必须不同)
WORKER_ID=worker-1

# Worker 端口 (多 Worker 时必须不同)
WORKER_PORT=4000

# Master 服务器地址
MASTER_HOST=localhost
MASTER_PORT=3000

# 运行环境
NODE_ENV=production

# 浏览器模式 (true=无头模式)
HEADLESS=true

# 日志级别
LOG_LEVEL=info

# 单个 Worker 最大账户数
MAX_ACCOUNTS=10

【多 Worker 部署】

部署多个 Worker 提高容量:

1. 复制 worker 目录:
   cp -r worker worker-2
   cp -r worker worker-3

2. 修改每个目录的 .env:
   worker/.env:
     WORKER_ID=worker-1
     WORKER_PORT=4000

   worker-2/.env:
     WORKER_ID=worker-2
     WORKER_PORT=4001

   worker-3/.env:
     WORKER_ID=worker-3
     WORKER_PORT=4002

3. 分别启动:
   cd worker && pm2 start ecosystem.config.js
   cd worker-2 && pm2 start ecosystem.config.js
   cd worker-3 && pm2 start ecosystem.config.js

【验证运行】

查看 Master 日志,应显示 Worker 已连接

八、完整部署流程
========================================

【服务器环境准备】

1. 安装 Node.js:
   https://nodejs.org/ (v18 或以上)

2. 安装 PM2:
   npm install -g pm2

3. (可选) 安装 Nginx/Apache 用于 Admin Web

【构建阶段 (开发机器)】

1. 运行构建脚本:
   cd scripts
   build-all.bat

2. 打包 dist 目录:
   压缩 scripts/dist/ 为 zip

【部署阶段 (服务器)】

1. 上传并解压 dist.zip

2. 部署 Master:
   cd dist/master
   copy .env.example .env
   # 编辑 .env
   npm install --production
   pm2 start ecosystem.config.js

3. 部署 Worker:
   cd dist/worker
   copy .env.example .env
   # 编辑 .env
   npm install --production
   npx playwright install chromium
   pm2 start ecosystem.config.js

4. 部署 Admin Web:
   # 配置 Nginx/Apache 指向 dist/admin-web

5. 分发 PC 客户端:
   将 dist/CRM-PC-IM.exe 分发给用户

【验证部署】

1. 检查服务状态:
   pm2 status

2. 查看日志:
   pm2 logs

3. 访问 Admin Web:
   http://服务器IP:3001

4. 运行 PC 客户端测试连接

九、常见问题
========================================

【问题 1: 构建失败】

原因: 依赖未安装
解决:
  cd packages/crm-pc-im && npm install
  cd packages/admin-web && npm install

【问题 2: Master 启动失败】

原因: 端口被占用
解决: 修改 .env 中的 PORT

【问题 3: Worker 无法连接 Master】

原因: MASTER_HOST 配置错误
解决: 检查 .env 中的 MASTER_HOST 和 MASTER_PORT

【问题 4: PC 客户端白屏】

原因: 使用旧版本
解决: 确认使用最新构建的 exe (2025-11-22 12:28+)

【问题 5: Admin Web 404】

原因: Nginx/Apache 配置错误
解决: 确保配置了 try_files 或 FallbackResource

十、技术支持
========================================

【文档位置】
项目根目录 docs/ 文件夹

【关键文档】
- 02-MASTER-系统文档.md
- 03-WORKER-系统文档.md
- CLAUDE.md (项目概述)

【日志位置】
- Master: logs/master.log
- Worker: logs/worker.log
- PM2: ~/.pm2/logs/

========================================
