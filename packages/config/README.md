# @hiscrm-im/config

HisCRM-IM 的统一配置管理模块

## 📁 目录结构

```
packages/config/
├── package.json           # npm 包配置
├── index.js              # 配置加载模块
├── .env.example          # 环境变量模板
├── README.md            # 本文件
│
├── config/              # 配置文件示例
│   ├── config.dev.json   # 开发环境配置
│   └── config.prod.json  # 生产环境配置
│
└── scripts/             # 配置工具脚本
    └── setup.js         # 交互式配置生成脚本
```

## 🚀 快速开始

### 方式 1: 使用配置脚本 (推荐)

```bash
cd packages/config
node scripts/setup.js

# 或通过 npm 运行
npm run setup
```

交互式步骤:
1. 选择部署环境 (开发/测试/生产)
2. 输入应用根目录
3. 输入 Worker ID 和其他配置
4. 自动生成 .env 和 config.json

### 方式 2: 手动配置

```bash
# 复制模板
cp .env.example .env
cp config/config.dev.json config.json

# 编辑配置
nano config.json
```

## 📝 配置文件说明

### .env 文件

环境变量配置，优先级最高

```bash
NODE_ENV=production
APP_ROOT=/opt/hiscrm-im
WORKER_ID=worker-1
WORKER_MASTER_HOST=192.168.1.10
```

### config.json 文件

完整的配置文件，优先级次高

```json
{
  "environment": "production",
  "paths": {
    "projectRoot": "/opt/hiscrm-im",
    "worker": {
      "platforms": "/opt/hiscrm-im/platforms"
    }
  }
}
```

## 🔧 配置使用

### 在代码中加载配置

```javascript
// 使用共享库的配置系统
const { PATHS } = require('@hiscrm-im/shared/config/paths');

// 获取平台目录
const platformsDir = PATHS.worker.platforms;
```

### 环境变量优先级

```
环境变量 (最高)
    ↓
config.json
    ↓
代码默认值 (最低)
```

## 📚 相关文档

- [.docs/17-部署指南-环境配置系统.md](../../.docs/17-部署指南-环境配置系统.md)
- [.docs/15-共享路径配置系统.md](../../.docs/15-共享路径配置系统.md)

## 🤝 脚本说明

### setup.js

交互式配置生成脚本

```bash
# 运行脚本
node scripts/setup.js

# 通过 npm 运行
npm run setup

# 指定环境
npm run setup:dev
npm run setup:prod
```

脚本会:
1. 要求选择部署环境
2. 收集必要的配置信息
3. 生成 .env 文件
4. 生成 config.json 文件
5. 显示配置摘要

## ✅ 配置检查

启动应用后，检查日志是否包含:

```
[PATHS] 已加载配置文件: /opt/hiscrm/config.json
[PATHS] 配置信息:
  项目根目录: /opt/hiscrm-im
  Worker 平台: /opt/hiscrm-im/platforms
  Master 数据: /data/hiscrm/master
```

---

**完成日期**: 2025-10-20
**版本**: 1.0.0
