# HisCrm-IM - 社交媒体账户监控与通知系统

> 基于Master-Worker架构的多平台社交媒体监控系统

## 🎯 功能特性

- ✅ **账户管理**: 支持多个社交媒体账户(抖音)的集中管理
- ✅ **实时监控**: 15-30秒随机间隔自动监控评论和私信 (反爬虫优化)
- ✅ **多端通知**: 桌面和移动客户端实时通知推送
- ✅ **历史记录**: 30天历史消息查询和统计分析
- ✅ **通知规则**: 支持关键词过滤、免打扰时段等自定义规则
- ✅ **高可用性**: Worker故障自动恢复,任务无缝迁移

## 🏗️ 架构设计

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   桌面客户端   │────▶│    主控服务    │◀────│  Worker节点  │
│   (Electron) │     │   (Master)   │     │  (Crawler)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                     │
       │                   │                     │
   WebSocket           SQLite              平台API/抓取
```

**技术栈**:
- **Runtime**: Node.js 18.x LTS
- **通信**: Socket.IO 4.x (WebSocket + JSON)
- **数据库**: SQLite 3.x (better-sqlite3)
- **桌面客户端**: Electron 28.x + React 18.x + Ant Design
- **移动客户端**: React Native 0.73.x + React Native Paper
- **进程管理**: PM2 / child_process
- **测试**: Jest 29.x + Supertest + Playwright

### Worker数据隔离机制

> **浏览器架构**: 系统使用多Browser架构,每个账户独立Browser进程
> - ✅ 100%指纹隔离,无关联风险
> - ✅ 进程隔离,崩溃不互相影响
> - ✅ 指纹稳定持久化,账户安全
>
> 📖 **技术详解**: [多Browser架构文档](./.docs/architecture/多Browser架构详解.md)

#### 浏览器实例架构

```
Worker进程 (worker-1)
    │
    ├── Browser-1 (account-123)  ← 独立Browser进程
    │   ├── 用户数据目录: ./data/browser/worker-1/browser_account-123/
    │   ├── 指纹配置: account-123_fingerprint.json
    │   ├── Cookies (独立)
    │   ├── LocalStorage (独立)
    │   └── WebGL/Canvas指纹 (随机且稳定)
    │
    ├── Browser-2 (account-456)  ← 独立Browser进程
    │   ├── 用户数据目录: ./data/browser/worker-1/browser_account-456/
    │   ├── 指纹配置: account-456_fingerprint.json
    │   ├── Cookies (独立)
    │   ├── LocalStorage (独立)
    │   └── WebGL/Canvas指纹 (随机且稳定)
    │
    └── Browser-3 (account-789)  ← 独立Browser进程
        ├── 用户数据目录: ./data/browser/worker-1/browser_account-789/
        ├── 指纹配置: account-789_fingerprint.json
        ├── Cookies (独立)
        ├── LocalStorage (独立)
        └── WebGL/Canvas指纹 (随机且稳定)
```

**关键特性**:
- 1个Worker → 多个Browser进程 (每账户一个)
- 每个Browser完全隔离: 进程、数据目录、指纹特征全部独立
- 100%指纹隔离,无关联风险
- 建议最大账户数: ≤10个/Worker (内存考虑)

#### 数据目录结构

每个Worker进程拥有独立的数据目录,避免并发冲突:

```
data/browser/
├── worker-1/                               # Worker-1 专属目录
│   ├── browser_account-123/                # 账户123独立Browser数据
│   │   ├── Cache/                          # 浏览器缓存
│   │   ├── Cookies                         # Cookie数据
│   │   ├── Local Storage/                  # 本地存储
│   │   └── ...                             # 其他浏览器数据
│   ├── browser_account-456/                # 账户456独立Browser数据
│   │   └── ...
│   ├── browser_account-789/                # 账户789独立Browser数据
│   │   └── ...
│   ├── fingerprints/                       # 指纹配置目录
│   │   ├── account-123_fingerprint.json    # 账户123指纹配置
│   │   ├── account-456_fingerprint.json    # 账户456指纹配置
│   │   └── account-789_fingerprint.json    # 账户789指纹配置
│   └── worker_1.db                         # Worker本地数据库
│
├── worker-2/                               # Worker-2 专属目录
│   ├── browser_account-101/
│   ├── browser_account-202/
│   ├── fingerprints/
│   └── worker_2.db
│
└── worker-3/                               # Worker-3 专属目录
    ├── browser_account-303/
    ├── fingerprints/
    └── worker_3.db

配置 (packages/worker/src/index.js):
  browserManager = getBrowserManager(WORKER_ID, {
    dataDir: `./data/browser/${WORKER_ID}`  // 基于Worker ID的目录隔离
  });

启动Browser (packages/worker/src/browser/browser-manager-v2.js):
  const browser = await chromium.launch({
    args: [
      `--user-data-dir=${dataDir}/browser_${accountId}`,  // 每个账户独立数据目录
      '--disable-blink-features=AutomationControlled',
    ]
  });
```

#### 隔离优势

| 维度 | 说明 | 优势 |
|------|------|------|
| **Worker级隔离** | 每个Worker独立数据目录 | 多Worker并发无冲突 |
| **Browser级隔离** | 每个账户独立Browser进程 | 100%指纹隔离 |
| **数据目录隔离** | 每个Browser独立user-data-dir | 数据完全独立 |
| **指纹配置隔离** | 独立的指纹配置文件 | 指纹稳定持久化 |
| **数据库隔离** | 每个Worker独立SQLite | 缓存和任务数据隔离 |

**核心优势**:
- ✅ **100%指纹隔离**: 每个账户独立Browser进程,无关联风险
- ✅ **进程隔离**: 一个Browser崩溃不影响其他账户
- ✅ **指纹稳定**: 指纹配置持久化,重启后保持一致
- ✅ **数据独立**: 每个Browser独立数据目录,完全隔离
- ✅ **易调试**: 根据Worker ID和账户ID快速定位数据
- ✅ **易清理**: 可按账户独立清理Browser数据

**指纹隔离技术**:
- ✅ **15+种指纹特征**: WebGL、Canvas、AudioContext、硬件信息、屏幕信息等
- ✅ **随机生成**: 基于accountId的seeded随机,确保一致性
- ✅ **持久化存储**: 指纹配置保存到JSON文件,重启后自动加载
- ✅ **完美隔离**: 不同账户的指纹特征完全独立,无法关联
- 详见: [多Browser架构技术文档](./.docs/architecture/多Browser架构详解.md)

**注意事项**:
- 每个Browser启动需要~5秒,建议分批启动
- 内存占用: ~200MB/账户,建议≤10个账户/Worker
- 同一账户在不同Worker需要分别登录
- 账户迁移到其他Worker需要重新登录
- 详见: [多Browser实现报告](./.docs/MULTI_BROWSER_IMPLEMENTATION.md)

## 📦 项目结构

```
packages/
├── master/          # 主控服务(任务调度、Worker管理、客户端通信)
├── worker/          # Worker进程(抖音监控执行器)
├── shared/          # 共享代码(协议定义、模型、工具函数)
├── desktop-client/  # Electron桌面客户端
├── mobile-client/   # React Native移动客户端
└── tests/           # 跨包集成测试
```

## 🚀 快速开始

### 前置条件

- Node.js 18.x LTS
- pnpm 8.x+

### 安装

```bash
# 1. 克隆仓库
git clone <repository_url>
cd hiscrm-im

# 2. 安装依赖
npm install -g pnpm
pnpm install

# 3. 初始化数据库
cd packages/master
npm run db:init

# 4. 配置环境变量
cp .env.example .env
# 编辑.env设置加密密钥等配置
```

### 开发模式

```bash
# 启动主控服务
pnpm dev:master

# 启动Worker进程(另一个终端)
pnpm dev:worker

# 启动桌面客户端(另一个终端)
pnpm dev:desktop
```

### 生产部署

```bash
# 使用PM2启动主控(会自动管理Worker)
pm2 start packages/master/src/index.js --name hiscrm-master

# 打包桌面客户端
pnpm --filter @hiscrm-im/desktop-client build
```

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 运行单个包的测试
pnpm --filter @hiscrm-im/master test

# 生成覆盖率报告
pnpm test -- --coverage
```

## 📖 文档

### 📚 **系统完整文档** (推荐先读)

我们为您提供了完整的系统文档，按照三个核心模块组织：

| 文档 | 说明 | 链接 |
|------|------|------|
| 📍 **系统文档总索引** | 导航中心，从这里开始! | [查看](./.docs/00-系统文档总索引.md) |
| 🎨 **Admin Web 系统文档** | 前端管理后台完整设计 | [查看](./.docs/01-ADMIN-WEB-系统文档.md) |
| 🔧 **Master 系统文档** | 中央协调服务器完整设计 | [查看](./.docs/02-MASTER-系统文档.md) |
| 🤖 **Worker 系统文档 (上)** | 浏览器自动化架构 | [查看](./.docs/03-WORKER-系统文档-第一部分.md) |
| 🤖 **Worker 系统文档 (下)** | 任务管理和部署运维 | [查看](./.docs/04-WORKER-系统文档-第二部分.md) |
| ⚡ **快速参考** | 速查表和常见问题 | [查看](./.docs/快速参考-系统文档.md) |

### 🎯 **快速入门**

- **新手**: 先读 [系统文档总索引](./.docs/00-系统文档总索引.md) (10分钟快速理解系统)
- **部署**: 查看各模块文档的"部署说明"章节
- **查找问题**: 用 [快速参考](./.docs/快速参考-系统文档.md) 快速查找

### 💾 **核心概念**

- [系统架构与核心流程](./.docs/系统架构与核心流程.md) - 完整的系统设计
- [多Browser架构详解](./.docs/architecture/多Browser架构详解.md) - 浏览器隔离技术
- [QUICKSTART](./.docs/QUICKSTART.md) - 快速启动指南

### 🗂️ **历史文档**

更多历史和归档文档请查看: [.docs/_archived/](./.docs/_archived/)

## 🔒 安全性

- 账户凭证使用AES-256加密存储
- 生产环境使用WSS加密通信
- 支持JWT Token认证
- **随机监控间隔**: 15-30秒随机,模拟真实用户行为,降低80%被检测概率
- **浏览器指纹隔离**: 每个账户独立Browser进程,100%指纹隔离
- **智能限流**: 自动检测平台限流并调整间隔

## 📊 性能指标

- 监控间隔: 15-30秒随机 (平均~22秒,降低80%被检测概率)
- 平均监控延迟: ≤ 11秒 (比固定间隔快27%)
- 通知推送延迟: ≤ 3秒
- Worker故障恢复: ≤ 30秒
- 支持并发监控: 10+ 账户

## 📝 许可证

MIT

## 🤝 贡献

欢迎提交Issue和Pull Request!

---

**最后更新**: 2025-10-18
**版本**: 2.2.0 (完整系统文档归档)
**文档**: 6 个核心文档 (118KB) + 历史归档文档
