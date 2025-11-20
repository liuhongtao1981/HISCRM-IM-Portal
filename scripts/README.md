# HisCRM-IM 部署脚本说明

本目录包含 HisCRM-IM 系统的生产部署脚本和配置文件。

## 📁 目录结构

```
scripts/
├── README.md                           # 本说明文件
├── install-environment.sh              # 环境安装脚本（Linux）
├── deploy-all.sh                       # 一键部署脚本（Master + Admin Web）
├── deploy-master.sh                    # Master 服务器部署脚本
├── deploy-admin-web.sh                 # Admin Web 部署脚本
├── build-pc-im.bat                     # CRM PC IM 打包脚本（Windows）
└── config/                             # 配置文件模板
    ├── master.env.production           # Master 生产环境配置
    ├── admin-web.env.production        # Admin Web 生产环境配置
    └── crm-pc-im.config.production.json # CRM PC IM 生产环境配置
```

## 🚀 快速开始

### 1. 环境准备（Linux 服务器）

在全新的 Linux 服务器上运行环境安装脚本：

```bash
# 给脚本添加执行权限
chmod +x scripts/install-environment.sh

# 运行环境安装脚本
bash scripts/install-environment.sh
```

此脚本将自动安装：
- Node.js 18.x LTS
- npm
- PM2
- Nginx
- SQLite3
- Playwright 系统依赖

### 2. 上传代码到服务器

将整个项目代码上传到服务器的 `/var/www/hiscrm-im` 目录：

```bash
# 方法 1: 使用 Git
cd /var/www/hiscrm-im
git clone https://github.com/your-repo/hiscrm-im.git .

# 方法 2: 使用 rsync
rsync -avz --progress /local/path/hiscrm-im/ user@server:/var/www/hiscrm-im/

# 方法 3: 使用 scp
scp -r /local/path/hiscrm-im user@server:/var/www/hiscrm-im/
```

### 3. 一键部署（推荐）

使用一键部署脚本自动部署 Master 和 Admin Web：

```bash
cd /var/www/hiscrm-im

# 给脚本添加执行权限
chmod +x scripts/deploy-all.sh

# 运行一键部署脚本
bash scripts/deploy-all.sh
```

脚本将自动：
- 安装所有依赖
- 配置环境变量
- 部署 Master 服务器
- 部署 Admin Web
- 配置 Nginx

### 4. 手动部署（可选）

如果需要单独部署某个组件：

#### 部署 Master 服务器

```bash
cd /var/www/hiscrm-im
chmod +x scripts/deploy-master.sh
bash scripts/deploy-master.sh
```

#### 部署 Admin Web

```bash
cd /var/www/hiscrm-im
chmod +x scripts/deploy-admin-web.sh

# 可选：设置自定义域名和端口
export ADMIN_DOMAIN="admin.example.com"
export NGINX_PORT=80

bash scripts/deploy-admin-web.sh
```

## 🖥️ CRM PC IM 打包（Windows）

在 Windows 开发机上打包 Electron 客户端：

### 1. 配置生产环境 URL

编辑 `packages/crm-pc-im/config.json`：

```json
{
  "websocket": {
    "url": "http://your-production-server:3000"
  }
}
```

或使用模板：

```powershell
copy scripts\config\crm-pc-im.config.production.json packages\crm-pc-im\config.json
```

然后编辑 `config.json` 修改 `url` 为你的生产服务器地址。

### 2. 运行打包脚本

双击运行 `scripts\build-pc-im.bat` 或在命令行中执行：

```powershell
cd E:\HISCRM-IM-main
scripts\build-pc-im.bat
```

### 3. 分发客户端

打包完成后，可执行文件位于：

```
packages/crm-pc-im/release/CRM-PC-IM.exe
```

将此文件分发给用户即可使用。

## ⚙️ 配置说明

### Master 服务器配置

配置文件：`packages/master/.env`

**必须修改的配置项：**

1. **ENCRYPTION_KEY** - 加密密钥（32字符随机字符串）
   ```bash
   # 生成随机密钥
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **CORS_ORIGIN** - 允许的跨域源
   ```env
   # 开发环境
   CORS_ORIGIN=*

   # 生产环境（推荐）
   CORS_ORIGIN=https://admin.example.com,https://crm.example.com
   ```

3. **LOG_LEVEL** - 日志级别
   ```env
   # 生产环境建议使用 info 或 warn
   LOG_LEVEL=info
   ```

4. **PORT** - 服务端口
   ```env
   PORT=3000
   ```

完整配置请参考：`scripts/config/master.env.production`

### Admin Web 配置

配置文件：`packages/admin-web/.env`

**必须修改的配置项：**

1. **REACT_APP_MASTER_URL** - Master 服务器地址
   ```env
   # 使用服务器 IP 或域名
   REACT_APP_MASTER_URL=http://192.168.1.100:3000
   # 或
   REACT_APP_MASTER_URL=https://master.example.com
   ```

完整配置请参考：`scripts/config/admin-web.env.production`

### CRM PC IM 配置

配置文件：`packages/crm-pc-im/config.json`

**必须修改的配置项：**

1. **websocket.url** - Master 服务器地址
   ```json
   {
     "websocket": {
       "url": "http://192.168.1.100:3000"
     }
   }
   ```

完整配置请参考：`scripts/config/crm-pc-im.config.production.json`

## 🔧 环境变量

可以通过环境变量覆盖部署脚本的默认配置：

```bash
# Master 端口
export MASTER_PORT=3000

# PM2 实例数（cluster 模式）
export PM2_INSTANCES=2

# Admin Web 域名
export ADMIN_DOMAIN="admin.example.com"

# Nginx 端口
export NGINX_PORT=80

# 然后运行部署脚本
bash scripts/deploy-all.sh
```

## 📋 部署后检查清单

### Master 服务器

- [ ] 服务已启动：`pm2 status hiscrm-master`
- [ ] API 可访问：`curl http://localhost:3000/api/v1/health`
- [ ] 日志正常：`pm2 logs hiscrm-master`
- [ ] 数据库已创建：`ls packages/master/data/master.db`
- [ ] .env 配置正确（特别是 ENCRYPTION_KEY 和 CORS_ORIGIN）

### Admin Web

- [ ] Nginx 运行：`sudo systemctl status nginx`
- [ ] 网站可访问：浏览器打开 `http://your-domain`
- [ ] API 代理正常：检查网络请求是否成功
- [ ] WebSocket 连接正常：查看浏览器控制台

### CRM PC IM

- [ ] config.json 配置正确（url 指向生产服务器）
- [ ] 可执行文件已生成：`release/CRM-PC-IM.exe`
- [ ] 客户端可以连接到生产服务器
- [ ] 可以正常接收通知

## 🛠️ 常用管理命令

### PM2 管理

```bash
# 查看所有进程
pm2 status

# 查看 Master 日志
pm2 logs hiscrm-master

# 实时监控
pm2 monit

# 重启 Master
pm2 restart hiscrm-master

# 停止 Master
pm2 stop hiscrm-master

# 删除进程
pm2 delete hiscrm-master

# 保存 PM2 配置
pm2 save

# 查看详细信息
pm2 show hiscrm-master
```

### Nginx 管理

```bash
# 查看状态
sudo systemctl status nginx

# 重启
sudo systemctl restart nginx

# 重新加载配置
sudo systemctl reload nginx

# 测试配置
sudo nginx -t

# 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 查看访问日志
sudo tail -f /var/log/nginx/access.log
```

### 数据库管理

```bash
# 进入数据库
sqlite3 /var/www/hiscrm-im/packages/master/data/master.db

# 查看表
.tables

# 查看 schema
.schema accounts

# 退出
.quit

# 备份数据库
cp /var/www/hiscrm-im/packages/master/data/master.db \
   /backup/master.db.$(date +%Y%m%d)
```

## 🔒 安全建议

1. **修改默认端口**：不要使用默认的 3000 端口
2. **配置防火墙**：只开放必要的端口
3. **使用 HTTPS**：生产环境必须使用 HTTPS
4. **强密码**：ENCRYPTION_KEY 使用强随机字符串
5. **定期备份**：定期备份数据库
6. **日志监控**：定期检查日志，及时发现异常
7. **更新依赖**：定期更新依赖包，修复安全漏洞

## 🌐 配置 HTTPS（Let's Encrypt）

### 1. 安装 Certbot

```bash
# Ubuntu/Debian
sudo apt-get install -y certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install -y certbot python3-certbot-nginx
```

### 2. 获取证书

```bash
sudo certbot --nginx -d admin.example.com
```

### 3. 自动续期

```bash
# 测试续期
sudo certbot renew --dry-run

# Certbot 会自动添加 cron 任务
```

## 📊 性能优化

### Master 服务器

1. **增加 PM2 实例数**（cluster 模式）：
   ```bash
   pm2 scale hiscrm-master 4
   ```

2. **调整数据库 WAL 模式**（已默认启用）

3. **启用性能监控**：
   ```env
   MONITORING_ENABLED=true
   ```

### Nginx

1. **启用 Gzip 压缩**（已在配置中启用）

2. **调整 worker 进程数**：
   编辑 `/etc/nginx/nginx.conf`：
   ```nginx
   worker_processes auto;
   worker_connections 1024;
   ```

3. **启用缓存**：
   ```nginx
   proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m;
   ```

## 🐛 故障排查

### Master 无法启动

1. 检查端口占用：
   ```bash
   sudo netstat -tulpn | grep 3000
   ```

2. 查看 PM2 日志：
   ```bash
   pm2 logs hiscrm-master --lines 100
   ```

3. 检查 .env 配置

### Admin Web 无法访问

1. 检查 Nginx 状态：
   ```bash
   sudo systemctl status nginx
   ```

2. 测试 Nginx 配置：
   ```bash
   sudo nginx -t
   ```

3. 查看 Nginx 日志：
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

### WebSocket 连接失败

1. 检查 Master 是否运行
2. 检查防火墙是否允许端口 3000
3. 检查 CORS 配置
4. 查看浏览器控制台错误信息

### CRM PC IM 无法连接

1. 检查 config.json 中的 url 配置
2. 检查服务器防火墙
3. 测试 Master 服务器是否可访问：
   ```powershell
   curl http://your-server:3000/api/v1/health
   ```

## 📞 技术支持

如有问题，请参考：

- 项目文档：`docs/` 目录
- Master 文档：`docs/02-MASTER-系统文档.md`
- 部署文档：`docs/生产部署指南.md`

## 📝 更新日志

- 2025-01-20：初始版本
  - 添加环境安装脚本
  - 添加一键部署脚本
  - 添加 Master/Admin Web/PC IM 部署脚本
  - 添加生产环境配置模板
