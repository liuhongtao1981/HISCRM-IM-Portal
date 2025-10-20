#!/bin/bash

# HisCRM-IM 环境设置脚本
# 用于快速生成 .env 和 config.json 配置文件

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║        HisCRM-IM 环境配置向导                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# 检查必要的文件
if [ ! -f ".env.example" ]; then
    echo "❌ 错误: 找不到 .env.example 文件"
    exit 1
fi

if [ ! -f "config.example.json" ]; then
    echo "❌ 错误: 找不到 config.example.json 文件"
    exit 1
fi

# 询问部署环境
echo "选择部署环境:"
echo "  1) 开发环境 (development)"
echo "  2) 测试环境 (staging)"
echo "  3) 生产环境 (production)"
echo ""
read -p "请输入选择 (1-3): " ENV_CHOICE

case $ENV_CHOICE in
    1)
        ENVIRONMENT="development"
        APP_ROOT="./"
        MASTER_HOST="0.0.0.0"
        MASTER_PORT="3000"
        WORKER_MASTER_HOST="localhost"
        WORKER_MASTER_PORT="3000"
        LOG_LEVEL="debug"
        ;;
    2)
        ENVIRONMENT="staging"
        read -p "请输入应用根目录 (默认: /opt/hiscrm-im): " APP_ROOT
        APP_ROOT=${APP_ROOT:-"/opt/hiscrm-im"}
        MASTER_HOST="0.0.0.0"
        MASTER_PORT="3000"
        read -p "请输入 Master 主机名 (默认: localhost): " WORKER_MASTER_HOST
        WORKER_MASTER_HOST=${WORKER_MASTER_HOST:-"localhost"}
        WORKER_MASTER_PORT="3000"
        LOG_LEVEL="info"
        ;;
    3)
        ENVIRONMENT="production"
        read -p "请输入应用根目录 (默认: /opt/hiscrm-im): " APP_ROOT
        APP_ROOT=${APP_ROOT:-"/opt/hiscrm-im"}
        read -p "请输入 Master 绑定地址 (默认: 0.0.0.0): " MASTER_HOST
        MASTER_HOST=${MASTER_HOST:-"0.0.0.0"}
        MASTER_PORT="3000"
        read -p "请输入 Master 主机名 (默认: master): " WORKER_MASTER_HOST
        WORKER_MASTER_HOST=${WORKER_MASTER_HOST:-"master"}
        WORKER_MASTER_PORT="3000"
        LOG_LEVEL="info"
        ;;
    *)
        echo "❌ 无效的选择"
        exit 1
        ;;
esac

# Worker 配置
read -p "请输入 Worker ID (默认: worker-1): " WORKER_ID
WORKER_ID=${WORKER_ID:-"worker-1"}

read -p "请输入 Worker 最大账户数 (默认: 10): " WORKER_MAX_ACCOUNTS
WORKER_MAX_ACCOUNTS=${WORKER_MAX_ACCOUNTS:-"10"}

# 创建 .env 文件
echo ""
echo "📝 生成 .env 文件..."
cp .env.example .env

# 替换 .env 文件中的值
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/^NODE_ENV=.*/NODE_ENV=$ENVIRONMENT/" .env
    sed -i '' "s|^APP_ROOT=.*|APP_ROOT=$APP_ROOT|" .env
    sed -i '' "s/^WORKER_ID=.*/WORKER_ID=$WORKER_ID/" .env
    sed -i '' "s/^LOG_LEVEL=.*/LOG_LEVEL=$LOG_LEVEL/" .env
else
    # Linux
    sed -i "s/^NODE_ENV=.*/NODE_ENV=$ENVIRONMENT/" .env
    sed -i "s|^APP_ROOT=.*|APP_ROOT=$APP_ROOT|" .env
    sed -i "s/^WORKER_ID=.*/WORKER_ID=$WORKER_ID/" .env
    sed -i "s/^LOG_LEVEL=.*/LOG_LEVEL=$LOG_LEVEL/" .env
fi

echo "✅ .env 文件已生成"

# 创建 config.json 文件
echo ""
echo "📝 生成 config.json 文件..."
cp config.example.json config.json

# 生成 config.json 内容
cat > config.json << EOF
{
  "environment": "$ENVIRONMENT",
  "paths": {
    "projectRoot": "$APP_ROOT",
    "master": {
      "data": "$APP_ROOT/data/master",
      "logs": "$APP_ROOT/logs/master"
    },
    "worker": {
      "data": "$APP_ROOT/data/worker",
      "platforms": "$APP_ROOT/packages/worker/src/platforms",
      "logs": "$APP_ROOT/logs/worker"
    }
  },
  "server": {
    "master": {
      "host": "$MASTER_HOST",
      "port": $MASTER_PORT
    }
  },
  "worker": {
    "id": "$WORKER_ID",
    "maxAccounts": $WORKER_MAX_ACCOUNTS,
    "masterHost": "$WORKER_MASTER_HOST",
    "masterPort": $WORKER_MASTER_PORT
  },
  "logging": {
    "level": "$LOG_LEVEL",
    "format": "json"
  }
}
EOF

echo "✅ config.json 文件已生成"

# 显示配置信息
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     配置完成！                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 配置信息摘要:"
echo "  环境: $ENVIRONMENT"
echo "  应用根目录: $APP_ROOT"
echo "  Master: $MASTER_HOST:$MASTER_PORT"
echo "  Worker: $WORKER_ID → $WORKER_MASTER_HOST:$WORKER_MASTER_PORT"
echo "  日志级别: $LOG_LEVEL"
echo ""
echo "📁 生成的文件:"
echo "  • .env"
echo "  • config.json"
echo ""
echo "🚀 后续步骤:"
echo "  1. 审查生成的配置文件 (cat .env && cat config.json)"
echo "  2. 根据需要进行调整"
echo "  3. 启动应用: npm run start:master && npm run start:worker"
echo ""
echo "📚 更多信息:"
echo "  • 查看部署指南: cat .docs/17-部署指南-环境配置系统.md"
echo "  • 查看配置示例: cat config.example.json"
echo ""
