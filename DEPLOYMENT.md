# HisCRM-IM 部署指南

> 快速部署 HisCRM-IM 系统

## 📦 配置管理

HisCRM-IM 使用 **packages/config** 模块管理所有配置

### 快速开始

#### 方式 1: 自动化配置 (推荐)

```bash
cd packages/config
node scripts/setup.js

# 或使用 npm
npm run setup
```

交互式配置流程:
1. 选择部署环境 (开发/测试/生产)
2. 输入应用根目录
3. 输入其他必要信息
4. 自动生成 .env 和 config.json

#### 方式 2: 手动配置

```bash
# 进入配置目录
cd packages/config

# 复制模板
cp .env.example .env
cp config/config.dev.json config.json

# 编辑配置
nano config.json
nano .env
```

## 🏗️ 文件结构

```
packages/config/          # 配置管理模块
├── package.json         # npm 包配置
├── index.js            # 配置加载函数
├── .env.example        # 环境变量模板
├── .gitignore          # git 忽略文件
├── README.md           # 模块文档
│
├── config/             # 配置示例
│   ├── config.dev.json  # 开发环境配置
│   └── config.prod.json # 生产环境配置
│
└── scripts/            # 配置工具
    └── setup.js        # 自动配置脚本
```

## 🚀 部署场景

### 开发环境

```bash
# 直接运行，使用默认配置
npm run dev
```

### 生产环境

```bash
# 1. 生成配置
cd packages/config
npm run setup:prod

# 2. 启动应用
npm run start:master
npm run start:worker
```

### Docker 部署

```bash
# 使用环境变量
docker-compose up -d
```

## 📝 配置优先级

```
1. 环境变量 (APP_ROOT, CONFIG_FILE, ...)  - 最高优先级
2. config.json 配置文件                    - 中优先级
3. 代码默认配置                            - 最低优先级
```

## 📚 相关文档

- [.docs/17-部署指南-环境配置系统.md](.docs/17-部署指南-环境配置系统.md) - 详细部署指南
- [packages/config/README.md](packages/config/README.md) - 配置模块文档
- [CONFIG_SYSTEM_SUMMARY.md](CONFIG_SYSTEM_SUMMARY.md) - 配置系统总结

## ✅ 验证部署

启动后检查日志:

```
[PATHS] 已加载配置文件: config.json
[PATHS] 配置信息:
  项目根目录: /opt/hiscrm-im
  Worker 平台: /opt/hiscrm-im/platforms
```

---

更多详情请查看 [.docs/17-部署指南-环境配置系统.md](.docs/17-部署指南-环境配置系统.md)
