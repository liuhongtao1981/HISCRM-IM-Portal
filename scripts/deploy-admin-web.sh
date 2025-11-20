#!/bin/bash
# ============================================
# HisCRM-IM Admin Web 生产部署脚本
# ============================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
APP_NAME="hiscrm-admin-web"
APP_DIR="/var/www/hiscrm-im"
ADMIN_DIR="${APP_DIR}/packages/admin-web"
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
WEB_ROOT="/var/www/html/hiscrm-admin"
DOMAIN="${ADMIN_DOMAIN:-localhost}"
PORT="${NGINX_PORT:-80}"

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}开始部署 HisCRM-IM Admin Web${NC}"
echo -e "${GREEN}============================================${NC}"

# 检查 Node.js 版本
echo -e "${YELLOW}检查 Node.js 版本...${NC}"
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}错误: 需要 Node.js 18 或更高版本，当前版本: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js 版本检查通过: $(node -v)${NC}"

# 检查 Nginx 是否安装
echo -e "${YELLOW}检查 Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}Nginx 未安装，正在安装...${NC}"
    sudo apt-get update
    sudo apt-get install -y nginx
fi
echo -e "${GREEN}✓ Nginx 已安装: $(nginx -v 2>&1 | cut -d'/' -f2)${NC}"

# 检查项目代码是否存在
if [ ! -d "${ADMIN_DIR}" ]; then
    echo -e "${RED}错误: Admin Web 代码不存在，请先上传代码到 ${ADMIN_DIR}${NC}"
    exit 1
fi

# 进入 Admin Web 目录
cd ${ADMIN_DIR}

# 检查或创建 .env 文件
if [ ! -f "${ADMIN_DIR}/.env" ]; then
    echo -e "${YELLOW}创建 .env 文件...${NC}"
    cat > ${ADMIN_DIR}/.env <<EOF
# Master API URL (通过 Nginx 代理)
REACT_APP_API_URL=/api/v1

# Master WebSocket URL
REACT_APP_MASTER_URL=http://${DOMAIN}:3000
EOF
    echo -e "${GREEN}✓ .env 文件已创建${NC}"
    echo -e "${YELLOW}请根据需要修改 ${ADMIN_DIR}/.env${NC}"
fi

# 安装依赖
echo -e "${YELLOW}安装依赖...${NC}"
npm ci --production
echo -e "${GREEN}✓ 依赖安装完成${NC}"

# 构建生产版本
echo -e "${YELLOW}构建生产版本...${NC}"
npm run build
echo -e "${GREEN}✓ 构建完成${NC}"

# 创建 Web 根目录
echo -e "${YELLOW}创建 Web 根目录...${NC}"
sudo mkdir -p ${WEB_ROOT}
echo -e "${GREEN}✓ Web 根目录已创建: ${WEB_ROOT}${NC}"

# 复制构建产物到 Web 根目录
echo -e "${YELLOW}复制构建产物...${NC}"
sudo rm -rf ${WEB_ROOT}/*
sudo cp -r ${ADMIN_DIR}/build/* ${WEB_ROOT}/
sudo chown -R www-data:www-data ${WEB_ROOT}
echo -e "${GREEN}✓ 构建产物已复制到 ${WEB_ROOT}${NC}"

# 创建 Nginx 配置文件
echo -e "${YELLOW}配置 Nginx...${NC}"
sudo tee ${NGINX_CONF_DIR}/${APP_NAME} > /dev/null <<EOF
# HisCRM-IM Admin Web Nginx 配置
server {
    listen ${PORT};
    server_name ${DOMAIN};

    # 静态文件根目录
    root ${WEB_ROOT};
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss
               application/json application/javascript;

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 代理到 Master 服务器
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Socket.IO WebSocket 代理
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # React Router 支持（所有路由返回 index.html）
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
EOF

# 启用站点配置
if [ -L "${NGINX_ENABLED_DIR}/${APP_NAME}" ]; then
    sudo rm ${NGINX_ENABLED_DIR}/${APP_NAME}
fi
sudo ln -s ${NGINX_CONF_DIR}/${APP_NAME} ${NGINX_ENABLED_DIR}/${APP_NAME}

# 测试 Nginx 配置
echo -e "${YELLOW}测试 Nginx 配置...${NC}"
sudo nginx -t

# 重启 Nginx
echo -e "${YELLOW}重启 Nginx...${NC}"
sudo systemctl restart nginx

# 启用 Nginx 开机自启
sudo systemctl enable nginx

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}部署完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "${YELLOW}访问地址: http://${DOMAIN}:${PORT}${NC}"
echo -e "${YELLOW}Web 根目录: ${WEB_ROOT}${NC}"
echo -e "${YELLOW}Nginx 配置: ${NGINX_CONF_DIR}/${APP_NAME}${NC}"
echo ""
echo -e "${YELLOW}常用命令:${NC}"
echo "  重启 Nginx: sudo systemctl restart nginx"
echo "  查看状态: sudo systemctl status nginx"
echo "  查看日志: sudo tail -f /var/log/nginx/error.log"
echo "  测试配置: sudo nginx -t"
echo ""
echo -e "${YELLOW}注意事项:${NC}"
echo "  1. 如需配置 HTTPS，请使用 Let's Encrypt 或其他 SSL 证书"
echo "  2. 确保防火墙允许端口 ${PORT}"
echo "  3. 确保 Master 服务器在 localhost:3000 运行"
echo ""
