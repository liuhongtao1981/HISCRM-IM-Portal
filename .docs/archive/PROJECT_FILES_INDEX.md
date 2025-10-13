# 项目文件索引

快速查找项目中的关键文件

---

## 📁 核心代码文件

### 错误处理模块
- **packages/shared/utils/error-handler.js** (242行)
  - ErrorTypes: 18种错误类型定义
  - ErrorClassifier: 智能错误分类器
  - LoginError: 自定义错误类
  - ErrorStrategy: 错误处理策略

- **packages/shared/utils/retry-strategy.js** (163行)
  - RetryStrategy: 重试策略类
  - 指数退避算法 + 随机抖动
  - RetryProfiles: 5种预定义配置

### 代理管理
- **packages/worker/src/browser/proxy-manager.js** (255行)
  - ProxyManager: 代理管理器
  - checkProxyHealth: 健康检查
  - createContextWithFallback: 三级降级策略

### 登录处理 (已修改)
- **packages/worker/src/browser/douyin-login-handler.js** (+150行)
  - 集成错误处理和重试
  - 实现二维码刷新
  - 集成代理降级

### Master 端 (已修改)
- **packages/master/src/communication/socket-server.js** (+10行)
  - 添加 qrcode:refreshed 事件监听

- **packages/master/src/index.js** (+10行)
  - 添加 onLoginQRCodeRefreshed 处理器

- **packages/master/src/login/login-handler.js** (+40行)
  - handleQRCodeRefreshed() 方法
  - handleLoginFailed() 支持 error_type

---

## 📖 文档文件

### 用户文档
- **SYSTEM_USAGE_GUIDE.md** (1500+行) - 系统使用完整指南
  - 系统架构
  - 快速启动
  - 账号登录流程
  - 代理配置
  - 监控运维
  - API 文档
  - 故障排查
  - FAQ

- **QUICKSTART.md** (300+行) - 5分钟快速开始
  - 环境检查
  - 安装启动
  - 测试登录
  - 功能验证

### 技术文档
- **ERROR_HANDLING_IMPLEMENTATION_COMPLETE.md** (1100+行) - 实施完成报告
  - Task A: 错误处理实现
  - Task B: 二维码刷新实现
  - Task C: 代理降级实现
  - 测试建议
  - 监控指标

- **TESTING_COMPLETE.md** (500+行) - 测试报告
  - 测试结果
  - 功能验证清单
  - 已知问题
  - 性能评估

- **WORK_SUMMARY.md** (400+行) - 工作完成总结
  - 任务概览
  - 代码统计
  - 核心功能
  - 测试结果
  - 交接说明

- **PROJECT_FILES_INDEX.md** (本文件) - 文件索引

### 历史文档
- **ERROR_HANDLING_OPTIMIZATION.md** - 原始优化方案
- **PROXY_INTEGRATION_COMPLETE.md** - 代理集成报告
- **PHASE_REAL_5_COMPLETE.md** - Phase 5 完成报告

---

## 🧪 测试文件

- **test-error-handling.js** (250+行) - 自动化测试脚本
  - Test 1: 正常登录流程
  - Test 2: 网络超时重试
  - Test 3: 错误分类
  - Test 4: 重试策略
  - Test 5: ProxyManager 结构

---

## 📂 配置文件

### Master 配置
- **packages/master/src/config.js**
  - PORT: 3000
  - WORKER_HEARTBEAT_TIMEOUT: 30s
  - LOGIN_SESSION_TIMEOUT: 5min
  - QR_CODE_LIFETIME: 150s

### Worker 配置
- **packages/worker/src/config.js**
  - MASTER_URL: http://localhost:3000
  - BROWSER_HEADLESS: true
  - HEARTBEAT_INTERVAL: 10s
  - RETRY_MAX_ATTEMPTS: 3

---

## 📊 数据库文件

### Master 数据库
- **packages/master/data/master.db**
  - accounts (账号表)
  - workers (Worker节点表)
  - login_sessions (登录会话表)
  - comments (评论表)
  - direct_messages (私信表)
  - notifications (通知队列表)
  - proxies (代理服务器表)

### 数据库脚本
- **packages/master/src/database/schema.sql** - 原始 schema
- **packages/master/src/database/schema-v2.sql** - 扩展 schema (含代理表)
- **packages/master/src/database/migrate-proxy.sql** - 代理迁移脚本

---

## 🎯 快速定位

### 我想...

**查看错误类型定义**
→ `packages/shared/utils/error-handler.js` (line 11-46)

**查看重试策略实现**
→ `packages/shared/utils/retry-strategy.js` (line 15-130)

**查看代理降级逻辑**
→ `packages/worker/src/browser/proxy-manager.js` (line 100-200)

**查看二维码刷新实现**
→ `packages/worker/src/browser/douyin-login-handler.js` (line 353-417)

**了解如何使用系统**
→ `QUICKSTART.md` 或 `SYSTEM_USAGE_GUIDE.md`

**查看测试结果**
→ `TESTING_COMPLETE.md`

**了解实现细节**
→ `ERROR_HANDLING_IMPLEMENTATION_COMPLETE.md`

**查看 API 文档**
→ `SYSTEM_USAGE_GUIDE.md` (API 文档章节)

**排查故障**
→ `SYSTEM_USAGE_GUIDE.md` (故障排查章节)

---

## 📝 文件大小统计

```
代码文件:
  error-handler.js:        ~8 KB
  retry-strategy.js:       ~6 KB
  proxy-manager.js:        ~10 KB
  douyin-login-handler.js: ~5 KB (修改)
  其他修改:                 ~2 KB
  ─────────────────────────────
  总计:                    ~31 KB

文档文件:
  SYSTEM_USAGE_GUIDE.md:   ~80 KB
  ERROR_HANDLING_IMPLEMENTATION_COMPLETE.md: ~60 KB
  TESTING_COMPLETE.md:     ~30 KB
  WORK_SUMMARY.md:         ~25 KB
  QUICKSTART.md:           ~15 KB
  其他文档:                ~20 KB
  ─────────────────────────────
  总计:                    ~230 KB

测试文件:
  test-error-handling.js:  ~10 KB
```

---

## 🔍 搜索技巧

### 查找错误类型使用位置
```bash
grep -r "ErrorTypes\." packages/
```

### 查找重试策略使用位置
```bash
grep -r "RetryStrategy\|RetryProfiles" packages/
```

### 查找代理相关代码
```bash
grep -r "ProxyManager\|proxyManager" packages/
```

### 查找二维码刷新相关代码
```bash
grep -r "refreshQRCode\|qrCodeRefresh" packages/
```

---

## 📦 依赖关系

```
error-handler.js  ←─┐
                    ├─ douyin-login-handler.js
retry-strategy.js ←─┘

proxy-manager.js  ←─── douyin-login-handler.js

douyin-login-handler.js ──→ socket-server.js ──→ index.js ──→ login-handler.js
```

---

**最后更新**: 2025-10-12
**维护者**: 开发团队
