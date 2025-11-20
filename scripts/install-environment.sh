#!/bin/bash
# ============================================
# HisCRM-IM 生产环境安装脚本
# ============================================
# 此脚本将安装所有必需的依赖和工具
# 适用于：Ubuntu 20.04/22.04, Debian 11+, CentOS 8+
# ============================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}HisCRM-IM 生产环境安装脚本${NC}"
echo -e "${GREEN}============================================${NC}"

# 检测操作系统
echo -e "${YELLOW}检测操作系统...${NC}"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
    echo -e "${GREEN}✓ 操作系统: $OS $VERSION${NC}"
else
    echo -e "${RED}无法检测操作系统${NC}"
    exit 1
fi

# 更新系统包
echo -e "${YELLOW}更新系统包...${NC}"
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    sudo apt-get update
    sudo apt-get upgrade -y
elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
    sudo yum update -y
fi
echo -e "${GREEN}✓ 系统包更新完成${NC}"

# 安装基础工具
echo -e "${YELLOW}安装基础工具...${NC}"
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    sudo apt-get install -y curl wget git build-essential
elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
    sudo yum install -y curl wget git gcc-c++ make
fi
echo -e "${GREEN}✓ 基础工具安装完成${NC}"

# 安装 Node.js 18.x LTS
echo -e "${YELLOW}安装 Node.js 18.x LTS...${NC}"
if ! command -v node &> /dev/null || [ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 18 ]; then
    echo -e "${YELLOW}正在安装 Node.js...${NC}"

    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    fi

    echo -e "${GREEN}✓ Node.js 安装完成: $(node -v)${NC}"
else
    echo -e "${GREEN}✓ Node.js 已安装: $(node -v)${NC}"
fi

# 安装 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm 未安装${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm 版本: $(npm -v)${NC}"

# 安装 PM2
echo -e "${YELLOW}安装 PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    echo -e "${GREEN}✓ PM2 安装完成: $(pm2 -v)${NC}"
else
    echo -e "${GREEN}✓ PM2 已安装: $(pm2 -v)${NC}"
fi

# 安装 Nginx
echo -e "${YELLOW}安装 Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        sudo apt-get install -y nginx
    elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
        sudo yum install -y nginx
    fi
    echo -e "${GREEN}✓ Nginx 安装完成: $(nginx -v 2>&1 | cut -d'/' -f2)${NC}"
else
    echo -e "${GREEN}✓ Nginx 已安装: $(nginx -v 2>&1 | cut -d'/' -f2)${NC}"
fi

# 启动并启用 Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 安装 SQLite3
echo -e "${YELLOW}安装 SQLite3...${NC}"
if ! command -v sqlite3 &> /dev/null; then
    if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
        sudo apt-get install -y sqlite3 libsqlite3-dev
    elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
        sudo yum install -y sqlite sqlite-devel
    fi
    echo -e "${GREEN}✓ SQLite3 安装完成: $(sqlite3 --version | cut -d' ' -f1)${NC}"
else
    echo -e "${GREEN}✓ SQLite3 已安装: $(sqlite3 --version | cut -d' ' -f1)${NC}"
fi

# 安装 Playwright 依赖（用于 Worker）
echo -e "${YELLOW}安装 Playwright 系统依赖...${NC}"
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    sudo apt-get install -y \
        libnss3 \
        libatk-bridge2.0-0 \
        libdrm2 \
        libxkbcommon0 \
        libgbm1 \
        libasound2 \
        libxshmfence1 \
        fonts-noto-color-emoji \
        fonts-liberation
elif [[ "$OS" == "centos" || "$OS" == "rhel" ]]; then
    sudo yum install -y \
        nss \
        atk \
        libdrm \
        libxkbcommon \
        mesa-libgbm \
        alsa-lib
fi
echo -e "${GREEN}✓ Playwright 依赖安装完成${NC}"

# 配置防火墙
echo -e "${YELLOW}配置防火墙...${NC}"
if command -v ufw &> /dev/null; then
    # Ubuntu/Debian 使用 ufw
    sudo ufw allow 22/tcp    # SSH
    sudo ufw allow 80/tcp    # HTTP
    sudo ufw allow 443/tcp   # HTTPS
    sudo ufw allow 3000/tcp  # Master Server
    echo -e "${YELLOW}防火墙规则已添加，请手动启用: sudo ufw enable${NC}"
elif command -v firewall-cmd &> /dev/null; then
    # CentOS/RHEL 使用 firewalld
    sudo firewall-cmd --permanent --add-service=ssh
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --permanent --add-port=3000/tcp
    sudo firewall-cmd --reload
    echo -e "${GREEN}✓ 防火墙配置完成${NC}"
else
    echo -e "${YELLOW}未检测到防火墙，请手动配置端口 22, 80, 443, 3000${NC}"
fi

# 创建应用目录
echo -e "${YELLOW}创建应用目录...${NC}"
sudo mkdir -p /var/www/hiscrm-im
sudo chown -R $USER:$USER /var/www/hiscrm-im
echo -e "${GREEN}✓ 应用目录已创建: /var/www/hiscrm-im${NC}"

# 创建日志目录
sudo mkdir -p /var/log/hiscrm-im
sudo chown -R $USER:$USER /var/log/hiscrm-im
echo -e "${GREEN}✓ 日志目录已创建: /var/log/hiscrm-im${NC}"

# 设置 PM2 开机自启
echo -e "${YELLOW}配置 PM2 开机自启...${NC}"
pm2 startup systemd -u $USER --hp $HOME
echo -e "${GREEN}✓ PM2 开机自启配置完成${NC}"

# 显示系统信息
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}环境安装完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "${BLUE}系统信息:${NC}"
echo "  操作系统: $OS $VERSION"
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"
echo "  PM2: $(pm2 -v)"
echo "  Nginx: $(nginx -v 2>&1 | cut -d'/' -f2)"
echo "  SQLite3: $(sqlite3 --version | cut -d' ' -f1)"
echo ""
echo -e "${BLUE}目录结构:${NC}"
echo "  应用目录: /var/www/hiscrm-im"
echo "  日志目录: /var/log/hiscrm-im"
echo ""
echo -e "${YELLOW}下一步:${NC}"
echo "  1. 上传代码到 /var/www/hiscrm-im"
echo "  2. 配置环境变量（参考 scripts/config/ 目录）"
echo "  3. 运行部署脚本："
echo "     - Master: bash scripts/deploy-master.sh"
echo "     - Admin Web: bash scripts/deploy-admin-web.sh"
echo ""
