#!/bin/bash
# ============================================
# HisCRM-IM Master 服务器生产部署脚本
# ============================================

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
APP_NAME="hiscrm-master"
APP_DIR="/var/www/hiscrm-im"
MASTER_DIR="${APP_DIR}/packages/master"
NODE_ENV="production"
PORT="${MASTER_PORT:-3000}"
PM2_INSTANCES="${PM2_INSTANCES:-1}"

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}开始部署 HisCRM-IM Master 服务器${NC}"
echo -e "${GREEN}============================================${NC}"

# 检查 Node.js 版本
echo -e "${YELLOW}检查 Node.js 版本...${NC}"
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}错误: 需要 Node.js 18 或更高版本，当前版本: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js 版本检查通过: $(node -v)${NC}"

# 检查 PM2 是否安装
echo -e "${YELLOW}检查 PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2 未安装，正在安装...${NC}"
    npm install -g pm2
fi
echo -e "${GREEN}✓ PM2 已安装: $(pm2 -v)${NC}"

# 创建应用目录
echo -e "${YELLOW}创建应用目录...${NC}"
sudo mkdir -p ${APP_DIR}
sudo chown -R $USER:$USER ${APP_DIR}
echo -e "${GREEN}✓ 应用目录已创建: ${APP_DIR}${NC}"

# 检查项目代码是否存在
if [ ! -d "${APP_DIR}/packages" ]; then
    echo -e "${RED}错误: 项目代码不存在，请先上传代码到 ${APP_DIR}${NC}"
    exit 1
fi

# 进入 Master 目录
cd ${MASTER_DIR}

# 安装依赖
echo -e "${YELLOW}安装 Master 依赖...${NC}"
npm ci --production
echo -e "${GREEN}✓ 依赖安装完成${NC}"

# 安装共享模块
echo -e "${YELLOW}安装共享模块...${NC}"
cd ${APP_DIR}/packages/shared
npm ci --production
cd ${MASTER_DIR}
echo -e "${GREEN}✓ 共享模块安装完成${NC}"

# 检查 .env 文件
if [ ! -f "${MASTER_DIR}/.env" ]; then
    echo -e "${YELLOW}警告: .env 文件不存在，将从 .env.example 复制${NC}"
    if [ -f "${MASTER_DIR}/.env.example" ]; then
        cp ${MASTER_DIR}/.env.example ${MASTER_DIR}/.env
        echo -e "${YELLOW}请编辑 ${MASTER_DIR}/.env 配置生产环境参数${NC}"
    else
        echo -e "${RED}错误: .env.example 文件也不存在${NC}"
        exit 1
    fi
fi

# 创建数据目录
echo -e "${YELLOW}创建数据目录...${NC}"
mkdir -p ${MASTER_DIR}/data
mkdir -p ${MASTER_DIR}/logs
echo -e "${GREEN}✓ 数据目录已创建${NC}"

# 检查数据库文件
if [ ! -f "${MASTER_DIR}/data/master.db" ]; then
    echo -e "${YELLOW}数据库文件不存在，将在首次启动时自动创建${NC}"
fi

# 停止旧的 PM2 进程
echo -e "${YELLOW}停止旧的 PM2 进程...${NC}"
pm2 stop ${APP_NAME} 2>/dev/null || true
pm2 delete ${APP_NAME} 2>/dev/null || true
echo -e "${GREEN}✓ 旧进程已停止${NC}"

# 使用 PM2 启动应用
echo -e "${YELLOW}使用 PM2 启动应用...${NC}"
pm2 start src/index.js \
    --name ${APP_NAME} \
    --instances ${PM2_INSTANCES} \
    --exec-mode cluster \
    --max-memory-restart 500M \
    --env NODE_ENV=${NODE_ENV} \
    --log ${MASTER_DIR}/logs/pm2.log \
    --error ${MASTER_DIR}/logs/pm2-error.log \
    --out ${MASTER_DIR}/logs/pm2-out.log

echo -e "${GREEN}✓ Master 服务已启动${NC}"

# 保存 PM2 配置
pm2 save

# 设置 PM2 开机自启
pm2 startup systemd -u $USER --hp $HOME

# 显示状态
echo -e "${YELLOW}查看服务状态...${NC}"
pm2 status

# 显示日志提示
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}部署完成！${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "${YELLOW}端口: ${PORT}${NC}"
echo -e "${YELLOW}环境: ${NODE_ENV}${NC}"
echo -e "${YELLOW}实例数: ${PM2_INSTANCES}${NC}"
echo ""
echo -e "${YELLOW}常用命令:${NC}"
echo "  查看状态: pm2 status"
echo "  查看日志: pm2 logs ${APP_NAME}"
echo "  重启服务: pm2 restart ${APP_NAME}"
echo "  停止服务: pm2 stop ${APP_NAME}"
echo "  查看监控: pm2 monit"
echo ""
echo -e "${YELLOW}配置文件位置:${NC}"
echo "  环境变量: ${MASTER_DIR}/.env"
echo "  应用日志: ${MASTER_DIR}/logs/"
echo "  数据库: ${MASTER_DIR}/data/master.db"
echo ""
