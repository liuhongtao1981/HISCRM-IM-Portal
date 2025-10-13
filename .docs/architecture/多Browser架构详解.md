# 多Browser实例架构设计文档

**版本**: 2.0.0
**架构**: 每账户独立Browser实例
**最后更新**: 2025-10-13

---

## 📋 目录

- [架构概述](#架构概述)
- [核心特性](#核心特性)
- [数据隔离](#数据隔离)
- [指纹管理](#指纹管理)
- [使用指南](#使用指南)
- [性能考虑](#性能考虑)

---

## 架构概述

### 设计原则

**最高级别的指纹隔离** - 每个账户使用完全独立的Browser进程

### 架构图

```
Worker-1 进程
│
├── Browser-1 (独立进程)
│   ├── 账户: account-123
│   ├── 用户数据目录: ./data/browser/browser_account-123/
│   ├── 指纹配置: account-123_fingerprint.json (稳定)
│   ├── Storage State: account-123_state.json
│   └── Context-1
│       ├── WebGL指纹: NVIDIA GTX 1660 Ti
│       ├── Canvas指纹: 6a3f2e...
│       ├── CPU核心: 8核
│       ├── 屏幕: 1920x1080
│       └── User-Agent: Chrome/120.0...
│
├── Browser-2 (独立进程)
│   ├── 账户: account-456
│   ├── 用户数据目录: ./data/browser/browser_account-456/
│   ├── 指纹配置: account-456_fingerprint.json (稳定)
│   ├── Storage State: account-456_state.json
│   └── Context-1
│       ├── WebGL指纹: Intel UHD Graphics 630
│       ├── Canvas指纹: 9b4d1c...
│       ├── CPU核心: 12核
│       ├── 屏幕: 2560x1440
│       └── User-Agent: Chrome/119.0...
│
└── Browser-3 (独立进程)
    ├── 账户: account-789
    ├── 用户数据目录: ./data/browser/browser_account-789/
    ├── 指纹配置: account-789_fingerprint.json (稳定)
    ├── Storage State: account-789_state.json
    └── Context-1
        ├── WebGL指纹: AMD Radeon RX 580
        ├── Canvas指纹: 2c7e9f...
        ├── CPU核心: 16核
        ├── 屏幕: 3840x2160
        └── User-Agent: Chrome/118.0...
```

---

## 核心特性

### 1. 完全独立的Browser进程

每个账户启动独立的Chromium进程:

```javascript
// 每个账户独立的Browser实例
const browser1 = await chromium.launch({
  args: ['--user-data-dir=./data/browser/browser_account-123']
});

const browser2 = await chromium.launch({
  args: ['--user-data-dir=./data/browser/browser_account-456']
});

// 结果: 两个完全独立的Chrome进程
```

**优势**:
- ✅ 100%指纹隔离 - GPU、Canvas、Audio等所有指纹完全独立
- ✅ 进程隔离 - 一个Browser崩溃不影响其他
- ✅ 资源隔离 - 内存、缓存完全独立

---

### 2. 稳定的指纹特征

#### 指纹配置持久化

```javascript
// 首次创建账户 - 生成指纹配置
{
  "accountId": "account-123",
  "createdAt": 1697184000000,
  "userAgent": "Mozilla/5.0 ... Chrome/120.0.6099.109 ...",
  "viewport": { "width": 1920, "height": 1080 },
  "webgl": {
    "vendor": "NVIDIA Corporation",
    "renderer": "ANGLE (NVIDIA GeForce GTX 1660 Ti)"
  },
  "hardware": {
    "cores": 8,
    "memory": 16
  },
  "screen": {
    "width": 1920,
    "height": 1080,
    "colorDepth": 24,
    "pixelRatio": 1
  }
  // ... 更多配置
}

// 保存到: ./data/browser/fingerprints/account-123_fingerprint.json
```

**一致性保证**:
- ✅ 使用accountId作为随机种子
- ✅ 首次生成后永久保存
- ✅ 每次启动使用相同配置
- ✅ 不会因重启而改变指纹

---

### 3. 数据完全隔离

#### 目录结构

```
data/browser/
├── worker-1/                         # Worker级隔离
│   │
│   ├── fingerprints/                 # 指纹配置目录
│   │   ├── account-123_fingerprint.json
│   │   ├── account-456_fingerprint.json
│   │   └── account-789_fingerprint.json
│   │
│   ├── browser_account-123/          # Browser-1 用户数据目录
│   │   ├── Default/
│   │   │   ├── Cookies
│   │   │   ├── Local Storage/
│   │   │   ├── Session Storage/
│   │   │   ├── IndexedDB/
│   │   │   ├── Cache/
│   │   │   └── ... (所有Chrome数据)
│   │   └── ... (其他Chrome配置)
│   │
│   ├── browser_account-456/          # Browser-2 用户数据目录
│   │   └── ... (完全独立)
│   │
│   ├── browser_account-789/          # Browser-3 用户数据目录
│   │   └── ... (完全独立)
│   │
│   ├── account-123_state.json        # Storage State备份
│   ├── account-456_state.json
│   ├── account-789_state.json
│   │
│   └── worker_1.db                   # Worker数据库
```

---

## 数据隔离

### 隔离层级对比

| 隔离类型 | 旧架构 (1 Browser) | 新架构 (多 Browser) |
|---------|-------------------|-------------------|
| **进程隔离** | ❌ 共享进程 | ✅ 独立进程 |
| **用户数据** | ❌ 共享目录 | ✅ 独立目录 |
| **WebGL指纹** | ❌ 共享 | ✅ 完全独立 |
| **Canvas指纹** | ❌ 共享 | ✅ 完全独立 |
| **Audio指纹** | ❌ 共享 | ✅ 完全独立 |
| **Cookies** | ✅ 独立 | ✅ 独立 |
| **LocalStorage** | ✅ 独立 | ✅ 独立 |
| **Memory** | ❌ 共享堆 | ✅ 独立堆 |
| **CPU** | ❌ 共享 | ✅ 独立调度 |

**结论**: 新架构实现100%的指纹隔离!

---

## 指纹管理

### 指纹生成策略

#### 1. 一致性随机化

```javascript
// 使用accountId作为种子
const seed = hashString(accountId);  // account-123 → 固定种子值
const random = seededRandom(seed);   // 可重现的随机数生成器

// 生成指纹配置
const config = {
  userAgent: randomUserAgent(random),      // 相同accountId总是生成相同UA
  webgl: {
    vendor: randomWebGLVendor(random),     // 相同accountId总是生成相同GPU
    renderer: randomWebGLRenderer(random),
  },
  // ...
};
```

**优势**:
- ✅ 同一账户指纹稳定(不会频繁变化触发风控)
- ✅ 不同账户指纹不同(实现隔离)
- ✅ 可重现(便于调试和问题追踪)

---

#### 2. 指纹特征列表

| 特征类型 | 随机化方式 | 稳定性 | 示例值 |
|---------|-----------|-------|--------|
| **User-Agent** | 从3个Chrome版本选择 | ✅ 稳定 | Chrome/120.0.6099.109 |
| **Viewport** | 从4种分辨率选择 | ✅ 稳定 | 1920x1080 |
| **WebGL Vendor** | 从4个厂商选择 | ✅ 稳定 | NVIDIA Corporation |
| **WebGL Renderer** | 从4个GPU选择 | ✅ 稳定 | GTX 1660 Ti |
| **Canvas噪声** | 随机3字符 | ✅ 稳定 | AbC |
| **CPU核心数** | 从5个选项选择 | ✅ 稳定 | 8核 |
| **设备内存** | 从4个选项选择 | ✅ 稳定 | 16GB |
| **屏幕宽度** | 从5个选项选择 | ✅ 稳定 | 1920 |
| **屏幕高度** | 从5个选项选择 | ✅ 稳定 | 1080 |
| **颜色深度** | 24或30 | ✅ 稳定 | 24 |
| **像素比** | 1/1.25/1.5/2 | ✅ 稳定 | 1 |
| **语言** | 从4个选择 | ✅ 稳定 | zh-CN |
| **时区** | 从4个选择 | ✅ 稳定 | Asia/Shanghai |
| **电池电量** | 0.25-0.75 | ✅ 稳定 | 0.63 |
| **充电状态** | 随机布尔 | ✅ 稳定 | true |

**总计**: 15+种指纹特征,全部基于accountId稳定生成

---

#### 3. 指纹持久化

```javascript
// 指纹配置文件: account-123_fingerprint.json
{
  "accountId": "account-123",
  "createdAt": 1697184000000,  // 首次创建时间
  "userAgent": "...",
  "viewport": {...},
  "webgl": {...},
  // ... 所有配置
}

// 加载流程:
// 1. 检查是否存在已保存的配置
if (existsFingerprintConfig(accountId)) {
  config = loadFingerprintConfig(accountId);  // 使用已有配置
} else {
  config = generateFingerprintConfig(accountId);  // 生成新配置
  saveFingerprintConfig(accountId, config);       // 保存到磁盘
}
```

**持久化位置**:
- `./data/browser/worker-{id}/fingerprints/{accountId}_fingerprint.json`

---

## 使用指南

### 基本用法

```javascript
const BrowserManagerV2 = require('./browser-manager-v2');

// 1. 初始化管理器
const browserManager = new BrowserManagerV2(WORKER_ID, {
  headless: true,
  dataDir: `./data/browser/worker-${WORKER_ID}`
});

// 2. 为账户创建Browser和Context
const page1 = await browserManager.newPage('account-123', {
  proxy: { server: 'http://proxy1.com:8080' }  // 可选: 账户1使用代理A
});

const page2 = await browserManager.newPage('account-456', {
  proxy: { server: 'http://proxy2.com:8080' }  // 可选: 账户2使用代理B
});

const page3 = await browserManager.newPage('account-789');  // 账户3直连

// 3. 使用页面
await page1.goto('https://www.douyin.com');
await page2.goto('https://www.douyin.com');
await page3.goto('https://www.douyin.com');

// 4. 保存Storage State
await browserManager.saveStorageState('account-123');

// 5. 关闭
await browserManager.closeBrowser('account-123');
await browserManager.closeAll();  // 关闭所有
```

---

### 指纹验证

```javascript
// 查看账户的指纹配置
const fingerprint = browserManager.getOrCreateFingerprintConfig('account-123');

console.log('指纹配置:', JSON.stringify(fingerprint, null, 2));

// 输出:
{
  "accountId": "account-123",
  "createdAt": 1697184000000,
  "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  "viewport": { "width": 1920, "height": 1080 },
  "webgl": {
    "vendor": "NVIDIA Corporation",
    "renderer": "ANGLE (NVIDIA GeForce GTX 1660 Ti)"
  },
  "hardware": { "cores": 8, "memory": 16 },
  "screen": {
    "width": 1920,
    "height": 1080,
    "colorDepth": 24,
    "pixelRatio": 1
  }
}
```

---

### 统计信息

```javascript
const stats = browserManager.getStats();

console.log(stats);
// 输出:
{
  totalBrowsers: 3,
  totalContexts: 3,
  browsers: [
    {
      accountId: 'account-123',
      isConnected: true,
      pages: 1
    },
    {
      accountId: 'account-456',
      isConnected: true,
      pages: 1
    },
    {
      accountId: 'account-789',
      isConnected: true,
      pages: 2
    }
  ]
}
```

---

## 性能考虑

### 资源消耗对比

| 指标 | 单Browser架构 | 多Browser架构 | 差异 |
|------|--------------|--------------|------|
| **内存占用** | 10账户 ≈ 300MB | 10账户 ≈ 2GB | +1.7GB |
| **CPU占用** | 低 | 中等 | +20-30% |
| **启动时间** | 5秒 × 1 = 5秒 | 5秒 × 10 = 50秒 | +45秒 |
| **磁盘占用** | ~100MB | ~500MB | +400MB |
| **指纹隔离** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 完美 |

---

### 优化建议

#### 1. 按需启动

```javascript
// ❌ 不推荐: 一次性启动所有Browser
for (const account of accounts) {
  await browserManager.newPage(account.id);
}

// ✅ 推荐: 按需启动
async function monitorAccount(accountId) {
  // 只在需要时启动
  const page = await browserManager.newPage(accountId);
  // 监控完成后关闭
  await browserManager.closeBrowser(accountId);
}
```

---

#### 2. 延迟启动

```javascript
// 不要同时启动所有Browser,错开启动时间
for (let i = 0; i < accounts.length; i++) {
  await browserManager.newPage(accounts[i].id);
  await delay(2000);  // 延迟2秒再启动下一个
}
```

---

#### 3. 资源限制

```javascript
// 限制同时运行的Browser数量
const MAX_CONCURRENT_BROWSERS = 5;

if (browserManager.browsers.size >= MAX_CONCURRENT_BROWSERS) {
  // 关闭最旧的Browser
  const oldestAccountId = getOldestAccount();
  await browserManager.closeBrowser(oldestAccountId);
}
```

---

#### 4. 定期清理

```javascript
// 定期清理长时间未使用的Browser
setInterval(async () => {
  const stats = browserManager.getStats();

  for (const browser of stats.browsers) {
    if (browser.pages === 0) {
      // 没有活动页面,可以关闭
      await browserManager.closeBrowser(browser.accountId);
    }
  }
}, 10 * 60 * 1000);  // 每10分钟检查一次
```

---

## 迁移指南

### 从单Browser架构迁移

#### 步骤1: 更新导入

```javascript
// 旧代码
const BrowserManager = require('./browser/browser-manager');

// 新代码
const BrowserManager = require('./browser/browser-manager-v2');
```

#### 步骤2: API保持兼容

```javascript
// API基本保持一致,无需大改
const browserManager = new BrowserManager(WORKER_ID, config);
const page = await browserManager.newPage(accountId);
```

#### 步骤3: 清理旧数据(可选)

```bash
# 删除旧的单Browser用户数据目录
rm -rf ./data/browser/worker-1/Default/

# 保留指纹配置和Storage State
# (会自动迁移到新架构)
```

---

## 最佳实践

### 1. 何时使用多Browser架构?

✅ **推荐场景**:
- 需要最高级别的指纹隔离
- 每个账户有独立的代理IP
- 账户数量 ≤ 10个 (资源充足)
- 对性能要求不高

⚠️ **不推荐场景**:
- 账户数量 > 20个 (内存不足)
- 服务器资源有限 (< 4GB RAM)
- 需要快速启动 (单Browser更快)

---

### 2. 监控Browser健康

```javascript
// 定期检查Browser状态
setInterval(() => {
  const stats = browserManager.getStats();

  for (const browser of stats.browsers) {
    if (!browser.isConnected) {
      logger.warn(`Browser disconnected for account ${browser.accountId}`);
      // 自动重启
      browserManager.closeBrowser(browser.accountId);
      browserManager.newPage(browser.accountId);
    }
  }
}, 30000);  // 每30秒检查
```

---

### 3. 优雅关闭

```javascript
// 捕获退出信号
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing browsers...');

  // 保存所有Storage State
  for (const accountId of browserManager.contexts.keys()) {
    await browserManager.saveStorageState(accountId);
  }

  // 关闭所有Browser
  await browserManager.closeAll();

  process.exit(0);
});
```

---

## 测试验证

### 指纹隔离测试

```javascript
// 测试脚本
async function testFingerprintIsolation() {
  const browserManager = new BrowserManager(WORKER_ID);

  // 创建3个账户的页面
  const page1 = await browserManager.newPage('account-1');
  const page2 = await browserManager.newPage('account-2');
  const page3 = await browserManager.newPage('account-3');

  // 访问指纹检测网站
  const url = 'https://fingerprint.com/demo/';

  await page1.goto(url);
  await page2.goto(url);
  await page3.goto(url);

  // 等待检测完成
  await page1.waitForTimeout(5000);
  await page2.waitForTimeout(5000);
  await page3.waitForTimeout(5000);

  // 获取visitor ID
  const id1 = await page1.evaluate(() => document.querySelector('.visitor-id').textContent);
  const id2 = await page2.evaluate(() => document.querySelector('.visitor-id').textContent);
  const id3 = await page3.evaluate(() => document.querySelector('.visitor-id').textContent);

  console.log('Account 1 Visitor ID:', id1);
  console.log('Account 2 Visitor ID:', id2);
  console.log('Account 3 Visitor ID:', id3);

  // 验证: 3个ID应该完全不同
  assert(id1 !== id2);
  assert(id2 !== id3);
  assert(id1 !== id3);

  console.log('✅ Fingerprint isolation test passed!');

  await browserManager.closeAll();
}
```

**预期结果**: 3个账户产生3个完全不同的visitor ID!

---

## 相关文档

- [BrowserManager V2 实现](./packages/worker/src/browser/browser-manager-v2.js)
- [单Browser架构文档](./BROWSER_FINGERPRINT.md)
- [README - Worker数据隔离](./README.md#worker数据隔离机制)

---

**文档版本**: 2.0.0
**最后更新**: 2025-10-13
**维护者**: 开发团队
