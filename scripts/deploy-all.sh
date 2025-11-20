#!/bin/bash
# ============================================
# HisCRM-IM 一键部署脚本
# ============================================
# 此脚本将自动部署 Master 和 Admin Web
# 确保在运行前已经执行过 install-environment.sh
# ============================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/var/www/hiscrm-im"
MASTER_PORT="${MASTER_PORT:-3000}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-localhost}"
NGINX_PORT="${NGINX_PORT:-80}"

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}HisCRM-IM 一键部署脚本${NC}"
echo -e "${GREEN}============================================${NC}"

# 检查是否以 root 或 sudo 运行
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}警告: 请不要以 root 用户运行此脚本${NC}"
    echo -e "${YELLOW}建议使用普通用户并在需要时输入 sudo 密码${NC}"
    read -p "是否继续? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 显示配置信息
echo -e "${BLUE}部署配置:${NC}"
echo "  应用目录: $APP_DIR"
echo "  Master 端口: $MASTER_PORT"
echo "  Admin 域名: $ADMIN_DOMAIN"
echo "  Nginx 端口: $NGINX_PORT"
echo ""

# 确认部署
read -p "确认以上配置并开始部署? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}部署已取消${NC}"
    exit 0
fi

# 检查必要的命令
echo -e "${YELLOW}检查系统依赖...${NC}"
MISSING_DEPS=0

for cmd in node npm pm2 nginx git; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}✗ 缺少命令: $cmd${NC}"
        MISSING_DEPS=1
    else
        echo -e "${GREEN}✓ $cmd 已安装${NC}"
    fi
done

if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "${RED}错误: 缺少必要的依赖${NC}"
    echo -e "${YELLOW}请先运行: bash scripts/install-environment.sh${NC}"
    exit 1
fi

# 检查应用目录
if [ ! -d "$APP_DIR" ]; then
    echo -e "${YELLOW}应用目录不存在，正在创建...${NC}"
    sudo mkdir -p $APP_DIR
    sudo chown -R $USER:$USER $APP_DIR
fi

# 进入应用目录
cd $APP_DIR

# 检查是否有代码
if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: 应用目录中没有代码${NC}"
    echo -e "${YELLOW}请先上传代码到 $APP_DIR${NC}"
    exit 1
fi

# 安装根依赖
echo -e "${YELLOW}安装项目依赖...${NC}"
npm install
echo -e "${GREEN}✓ 根依赖安装完成${NC}"

# 安装所有 packages 的依赖
echo -e "${YELLOW}安装所有 packages 的依赖...${NC}"
npm run install:packages || {
    echo -e "${YELLOW}install:packages 脚本不存在，手动安装...${NC}"

    # 安装 shared
    cd packages/shared
    npm install
    cd ../..

    # 安装 master
    cd packages/master
    npm install
    cd ../..

    # 安装 admin-web
    cd packages/admin-web
    npm install
    cd ../..
}
echo -e "${GREEN}✓ 所有依赖安装完成${NC}"

# 配置环境变量
echo -e "${YELLOW}配置环境变量...${NC}"

# Master .env
if [ ! -f "packages/master/.env" ]; then
    if [ -f "$SCRIPT_DIR/config/master.env.production" ]; then
        cp $SCRIPT_DIR/config/master.env.production packages/master/.env
        echo -e "${YELLOW}已从模板创建 Master .env 文件${NC}"
        echo -e "${RED}[重要] 请编辑 packages/master/.env 修改配置${NC}"
        echo -e "${YELLOW}特别是 ENCRYPTION_KEY 和 CORS_ORIGIN${NC}"

        read -p "是否现在编辑 Master .env? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ${EDITOR:-nano} packages/master/.env
        fi
    else
        echo -e "${RED}错误: 找不到 Master 配置模板${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Master .env 已存在${NC}"
fi

# Admin Web .env
if [ ! -f "packages/admin-web/.env" ]; then
    if [ -f "$SCRIPT_DIR/config/admin-web.env.production" ]; then
        cp $SCRIPT_DIR/config/admin-web.env.production packages/admin-web/.env

        # 替换域名
        sed -i "s|http://localhost:3000|http://${ADMIN_DOMAIN}:${MASTER_PORT}|g" packages/admin-web/.env

        echo -e "${GREEN}✓ Admin Web .env 已创建${NC}"
    else
        echo -e "${RED}错误: 找不到 Admin Web 配置模板${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ Admin Web .env 已存在${NC}"
fi

# 部署 Master
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}部署 Master 服务器...${NC}"
echo -e "${GREEN}============================================${NC}"

if [ -f "$SCRIPT_DIR/deploy-master.sh" ]; then
    bash $SCRIPT_DIR/deploy-master.sh
else
    echo -e "${RED}错误: 找不到 deploy-master.sh${NC}"
    exit 1
fi

# 等待 Master 启动
echo -e "${YELLOW}等待 Master 服务启动...${NC}"
sleep 5

# 检查 Master 是否运行
if pm2 list | grep -q "hiscrm-master"; then
    echo -e "${GREEN}✓ Master 服务已启动${NC}"
else
    echo -e "${RED}错误: Master 服务启动失败${NC}"
    pm2 logs hiscrm-master --lines 50
    exit 1
fi

# 部署 Admin Web
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}部署 Admin Web...${NC}"
echo -e "${GREEN}============================================${NC}"

if [ -f "$SCRIPT_DIR/deploy-admin-web.sh" ]; then
    bash $SCRIPT_DIR/deploy-admin-web.sh
else
    echo -e "${RED}错误: 找不到 deploy-admin-web.sh${NC}"
    exit 1
fi

# 检查服务状态
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}部署完成！检查服务状态...${NC}"
echo -e "${GREEN}============================================${NC}"

# 检查 Master
echo -e "${YELLOW}Master 服务状态:${NC}"
pm2 status hiscrm-master

# 检查 Nginx
echo -e "${YELLOW}Nginx 状态:${NC}"
sudo systemctl status nginx --no-pager | head -n 10

# 测试 Master API
echo -e "${YELLOW}测试 Master API...${NC}"
if curl -f http://localhost:${MASTER_PORT}/api/v1/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Master API 响应正常${NC}"
else
    echo -e "${YELLOW}⚠ Master API 可能未启动，请检查日志${NC}"
fi

# 显示访问信息
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}部署成功！${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${BLUE}访问地址:${NC}"
echo "  Admin Web: http://${ADMIN_DOMAIN}:${NGINX_PORT}"
echo "  Master API: http://${ADMIN_DOMAIN}:${MASTER_PORT}"
echo ""
echo -e "${BLUE}管理命令:${NC}"
echo "  查看 Master 日志: pm2 logs hiscrm-master"
echo "  重启 Master: pm2 restart hiscrm-master"
echo "  查看 Nginx 日志: sudo tail -f /var/log/nginx/error.log"
echo "  重启 Nginx: sudo systemctl restart nginx"
echo ""
echo -e "${YELLOW}重要提示:${NC}"
echo "  1. 请检查并修改 packages/master/.env 中的配置"
echo "  2. 特别是 ENCRYPTION_KEY 和 CORS_ORIGIN"
echo "  3. 修改配置后需要重启: pm2 restart hiscrm-master"
echo "  4. 如需部署 Worker，请参考文档手动部署"
echo "  5. 如需配置 HTTPS，请使用 Let's Encrypt 或其他证书"
echo ""
