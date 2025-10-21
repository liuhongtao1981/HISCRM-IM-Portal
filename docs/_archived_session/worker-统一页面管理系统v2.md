# Worker 统一页面管理系统 v2

**日期**: 2025-10-20
**版本**: v2 (Unified Page Management)
**核心改进**: ✅ 集中式页面池管理，登录页面自动保存供爬虫使用

---

## 🎯 问题与解决

### 旧架构的问题

```javascript
// 登录时创建的页面
async startLogin(options) {
  const page = await context.newPage();  // ❌ 创建页面
  // ... 登录流程 ...
  // ❌ 页面没有被保存！
}

// 爬虫时创建的页面（不同的页面！）
async crawlComments(account) {
  const page = await this.getOrCreatePage(account.id);  // ❌ 创建新页面
  // ❌ 这是与登录时不同的页面
}

// 结果：页面之间没有连贯性
// - 登录时设置的cookies丢失
// - 登录时的权限状态丢失
// - 每次都需要重新初始化
```

**问题根源**：
- 登录时创建的页面没有被保存到任何地方
- 爬虫任务创建新页面，完全独立
- 页面生命周期管理分散在各个地方

### 新架构的解决方案

```javascript
// ✅ 统一的页面管理流程

// 1. 登录时获取页面（自动保存到池中）
async startLogin(options) {
  const page = await this.getAccountPage(accountId);  // ✅ 用 BrowserManager
  // ... 登录流程 ...
  // 🔄 页面自动保存到 accountPages 池中
}

// 2. 爬虫时获取页面（复用登录时的页面）
async crawlComments(account) {
  const page = await this.getOrCreatePage(account.id);  // ✅ 调用统一接口
  // 🎉 获得登录时的同一个页面，含所有权限和cookies
}

// 结果：完整的会话连贯性
// - Cookies 自动保持
// - 权限状态保持
// - 无需重复初始化
```

---

## 🏗️ 架构设计

### 三层架构

```
┌─────────────────────────────────────────────────────┐
│ 业务层 (DouyinPlatform, XiaohongshuPlatform)         │
│ - startLogin()                                       │
│ - crawlComments()                                    │
│ - crawlDirectMessages()                              │
└───────────────┬─────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────┐
│ 平台层 (PlatformBase)                               │
│ - getAccountPage() 统一接口                          │
│ - 委托给 BrowserManager                              │
│ - 添加平台特定的初始化/清理逻辑                     │
└───────────────┬─────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────┐
│ 浏览器管理层 (BrowserManagerV2)                      │
│ - 页面池 (accountPages Map)                          │
│ - 生命周期管理                                       │
│ - 健康检查 (startPageHealthCheck)                    │
│ - 自动恢复 (recoverPage)                             │
│ - 统计信息 (getPageStats)                            │
└─────────────────────────────────────────────────────┘
```

### 数据结构

#### 1. 页面池 (Page Pool)

```javascript
// packages/worker/src/browser/browser-manager-v2.js
class BrowserManagerV2 {
  constructor() {
    // accountId → Page 映射
    this.accountPages = new Map();
    // accountId → { usageCount, createdAt, lastUsedAt }
    this.pageUsageStats = new Map();
    // 定期健康检查
    this.pageHealthCheckInterval = setInterval(..., 30000);
  }
}
```

#### 2. 页面生命周期

```
创建阶段:
  ↓
[getAccountPage] 检查池中是否存在
  ↓
如果不存在：
  ↓
  [createPage] 从上下文创建新页面
  ↓
  [savePageForAccount] 保存到池中
  ↓
使用阶段:
  ↓
多个任务都可以获取同一个页面:
  - startLogin() 创建并保存
  - crawlComments() 获取已存在的页面
  - crawlDirectMessages() 获取已存在的页面
  ↓
监控阶段:
  ↓
[startPageHealthCheck] 每30秒检查一次所有页面:
  - isPageAlive() 检查页面是否已关闭
  - 自动删除死页面
  ↓
恢复阶段:
  ↓
如果页面失败:
  - [recoverPage] 自动恢复
  - 删除旧页面
  - 创建新页面替换
```

---

## 📝 API 接口

### BrowserManager.getAccountPage()

**主要接口 - 所有平台都应该使用这个**

```javascript
/**
 * 获取或创建账户页面
 * @param {string} accountId - 账户 ID
 * @param {Object} options - 选项
 *   - options.reuseExisting - 是否复用已有页面 (默认: true)
 *   - options.recoverOnFailure - 失败时是否自动恢复 (默认: true)
 * @returns {Promise<Page>} Playwright 页面对象
 */
async getAccountPage(accountId, options = {}) {
  // 1. 从池中查找
  let page = this.accountPages.get(accountId);
  if (page && !page.isClosed()) {
    this.recordPageUsage(accountId);
    return page;
  }

  // 2. 创建新页面
  const context = await this.getOrCreateContext(accountId);
  page = await context.newPage();

  // 3. 保存到池中
  this.savePageForAccount(accountId, page);

  // 4. 记录统计信息
  this.recordPageUsage(accountId);

  return page;
}
```

### BrowserManager.isPageAlive()

**检查页面健康状态**

```javascript
/**
 * 检查页面是否仍然有效
 * @param {Page} page - 页面对象
 * @returns {boolean} 页面是否有效
 */
isPageAlive(page) {
  if (!page) return false;
  if (page.isClosed()) return false;
  // 可以扩展更多检查 (如: 浏览器是否崩溃)
  return true;
}
```

### BrowserManager.recoverPage()

**页面失败自动恢复**

```javascript
/**
 * 恢复失败的页面
 * @param {string} accountId - 账户 ID
 * @param {string} reason - 失败原因 (如: 'closed', 'crashed')
 * @returns {Promise<Page>} 恢复后的页面
 */
async recoverPage(accountId, reason = 'unknown') {
  logger.warn(`[Recovery] Recovering page for ${accountId}, reason: ${reason}`);

  // 1. 删除旧页面
  this.accountPages.delete(accountId);

  // 2. 强制清理上下文
  const context = this.accountContexts.get(accountId);
  if (context) {
    try {
      const pages = await context.pages();
      for (const p of pages) {
        await p.close();
      }
    } catch (error) {
      // 忽略清理错误
    }
  }

  // 3. 创建新页面
  return await this.getAccountPage(accountId);
}
```

### BrowserManager.startPageHealthCheck()

**定期健康检查 - 自动清理死页面**

```javascript
/**
 * 启动页面健康检查
 * 每隔指定时间检查一次所有页面的健康状况
 * 自动删除已关闭的页面
 * @param {number} interval - 检查间隔 (毫秒, 默认: 30000)
 */
startPageHealthCheck(interval = 30000) {
  this.pageHealthCheckInterval = setInterval(() => {
    const allAccounts = Array.from(this.accountPages.keys());

    for (const accountId of allAccounts) {
      const page = this.accountPages.get(accountId);

      if (!this.isPageAlive(page)) {
        logger.warn(`[HealthCheck] Page for ${accountId} is dead, removing from pool`);
        this.accountPages.delete(accountId);
      }
    }
  }, interval);
}
```

### BrowserManager.getPageStats()

**获取页面统计信息**

```javascript
/**
 * 获取所有页面的统计信息
 * @returns {Object} 页面统计数据
 */
getPageStats() {
  const stats = {};

  for (const [accountId, page] of this.accountPages) {
    const usage = this.pageUsageStats.get(accountId) || {};
    stats[accountId] = {
      alive: this.isPageAlive(page),
      usageCount: usage.usageCount || 0,
      createdAt: usage.createdAt,
      lastUsedAt: usage.lastUsedAt,
    };
  }

  return stats;
}
```

---

## 🔄 使用流程

### 登录流程

```
1. Admin 请求登录
   ↓
2. Master 发送 master:login:start 到 Worker
   ↓
3. Worker.DouyinPlatform.startLogin() 被调用
   ↓
4. 调用 this.getAccountPage(accountId)
   ↓
5. PlatformBase.getAccountPage() 调用 browserManager.getAccountPage()
   ↓
6. BrowserManager:
   - 检查 accountPages[accountId] 是否存在
   - 如果不存在，创建新页面
   - 保存到 accountPages[accountId]
   ↓
7. 页面获得后：
   - 导航到抖音登录页
   - 检测二维码/短信
   - 等待用户扫码/输入验证码
   - 验证登录成功
   ↓
8. 页面仍在池中，等待爬虫使用
   ↓
9. 返回成功状态到 Admin
```

### 爬虫流程

```
1. Master 分配爬虫任务给 Worker
   ↓
2. Worker 启动爬虫任务 (MonitorTask)
   ↓
3. DouyinPlatform.crawlComments() 被调用
   ↓
4. 调用 this.getOrCreatePage(accountId)
   ↓
5. DouyinPlatform.getOrCreatePage() 调用 super.getAccountPage()
   ↓
6. PlatformBase.getAccountPage() 调用 browserManager.getAccountPage()
   ↓
7. BrowserManager:
   - 检查 accountPages[accountId] 是否存在 ✅
   - 如果存在且有效，直接返回 (避免创建新页面)
   - 页面含有登录时设置的所有 cookies 和权限
   ↓
8. 使用页面爬虫：
   - 导航到评论页面
   - API 拦截获取评论
   - 提取数据
   ↓
9. 返回结果到 Master
```

---

## 💡 核心优势

### 1. 会话连贯性

```javascript
// 登录时的所有信息都保持
登录 → 设置 cookies、权限、用户状态
  ↓
爬虫 → 使用同一个页面，所有信息都在
  ↓
✅ 无需重复登录或重新设置状态
```

### 2. 自动恢复

```javascript
// 页面崩溃时自动恢复
爬虫任务运行中
  ↓
页面意外关闭
  ↓
❌ 错误被捕获
  ↓
🔄 BrowserManager.recoverPage() 自动恢复
  ↓
✅ 任务继续运行
```

### 3. 内存高效

```javascript
// 一个账户 = 一个页面（而不是多个）
登录: 创建 1 个页面 ✅
爬虫A: 复用同一个页面 ✅
爬虫B: 复用同一个页面 ✅

// vs 旧方案
登录: 创建 1 个页面
爬虫A: 创建 1 个新页面 (浪费)
爬虫B: 创建 1 个新页面 (浪费)
// 结果: 3 个页面 (浪费内存)
```

### 4. 无需平台特定逻辑

```javascript
// 所有平台都统一使用
class DouyinPlatform extends PlatformBase {
  async startLogin() {
    const page = await this.getAccountPage(accountId);  // ✅ 统一
  }
  async crawlComments() {
    const page = await this.getOrCreatePage(accountId);  // ✅ 统一
  }
}

class XiaohongshuPlatform extends PlatformBase {
  async startLogin() {
    const page = await this.getAccountPage(accountId);  // ✅ 统一
  }
  // ... 其他方法也都一样
}
```

---

## 🧪 测试清单

### 单元测试

- [ ] `getAccountPage()` 创建页面
- [ ] `getAccountPage()` 复用已有页面
- [ ] `isPageAlive()` 检测有效页面
- [ ] `isPageAlive()` 检测已关闭页面
- [ ] `recoverPage()` 自动恢复失败页面
- [ ] `startPageHealthCheck()` 定期清理
- [ ] `getPageStats()` 返回正确统计

### 集成测试

- [ ] 登录流程创建页面
- [ ] 登录成功后页面在池中
- [ ] 爬虫任务复用登录时的页面
- [ ] 爬虫获得登录时的所有权限
- [ ] 页面意外关闭时自动恢复
- [ ] 多个爬虫任务共享同一个页面

### 手动测试

```bash
# 启动 Worker
npm run start:worker

# 在 Admin Web 执行登录
1. 打开 Admin Web
2. 点击 "启动登录"
3. 扫码完成登录
4. 检查日志: 应该看到 "[PlatformBase] Got page for account-xxx from unified manager"

# 触发爬虫任务
1. 确认账号已登录
2. 启动爬虫监控
3. 检查日志:
   - 应该看到 "[PlatformBase] Got page for account-xxx from unified manager"
   - 应该显示 "复用已有页面" 或类似信息
4. 验证爬虫成功执行

# 检查页面统计
在 Worker 代码中临时添加:
const stats = this.browserManager.getPageStats();
console.log('Page Stats:', stats);
// 应该看到所有活跃账户的页面统计
```

---

## 📊 架构对比

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| **页面创建** | 登录1个 + 爬虫多个 | 所有操作共享1个 |
| **内存占用** | 高 (N个页面) | 低 (1个页面/账户) |
| **会话连贯** | ❌ 每次需重新初始化 | ✅ 自动保持状态 |
| **自动恢复** | ❌ 需手动处理 | ✅ 自动恢复 |
| **代码分散** | ❌ 每个平台自己管理 | ✅ 统一在 BrowserManager |
| **健康监控** | ❌ 无 | ✅ 定期健康检查 |
| **扩展性** | 差 (难以添加新平台) | 好 (新平台直接继承) |

---

## 🔐 错误恢复机制

### 页面关闭时的恢复

```javascript
// 爬虫任务中
try {
  const page = await this.getAccountPage(accountId);
  await page.goto('https://...');  // ❌ 页面已关闭，抛出错误
} catch (error) {
  if (error.message.includes('Target page, context or browser has been closed')) {
    // 自动恢复
    const page = await this.browserManager.recoverPage(accountId, 'closed');
    // 继续执行
    await page.goto('https://...');  // ✅ 新页面，继续
  }
}
```

### 健康检查自动清理

```javascript
// 后台每30秒运行一次
startPageHealthCheck() {
  setInterval(() => {
    for (const [accountId, page] of this.accountPages) {
      if (page.isClosed()) {
        // 自动删除
        logger.warn(`Page for ${accountId} is dead, removing`);
        this.accountPages.delete(accountId);
      }
    }
  }, 30000);
}

// 下次 getAccountPage() 调用会创建新页面
```

---

## 📚 相关文档

- [browser-manager-v2.js](../../packages/worker/src/browser/browser-manager-v2.js) - BrowserManager 实现
- [platform-base.js](../../packages/worker/src/platforms/base/platform-base.js) - 平台基类，包含 `getAccountPage()`
- [douyin/platform.js](../../packages/worker/src/platforms/douyin/platform.js) - Douyin 平台实现示例
- [二维码检测最终方案-v3完整base64.md](.docs/二维码检测最终方案-v3完整base64.md) - QR 码检测实时化方案

---

## 🎉 总结

**统一页面管理系统 v2** 是完整的浏览器资源管理解决方案：

✅ **集中管理** - BrowserManager 是唯一真理来源
✅ **自动保存** - 登录时的页面自动保存到池中
✅ **智能复用** - 爬虫自动获得已登录的页面
✅ **自动恢复** - 页面崩溃时自动恢复
✅ **健康监控** - 定期检查并清理死页面
✅ **无需平台特定逻辑** - 所有平台都使用统一接口

**结果**：
- 会话自动连贯
- 内存占用大幅降低
- 代码更加清晰
- 扩展性显著提高
- 系统更加稳定可靠

