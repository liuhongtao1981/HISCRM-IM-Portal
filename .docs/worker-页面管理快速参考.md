# Worker 页面管理快速参考 v2

**快速实现指南 - 5分钟快速了解**

---

## 🚀 最常用的三个方法

### 1️⃣ 获取或创建页面 (最常用)

```javascript
// ✅ 在任何 PlatformBase 子类中使用
const page = await this.getAccountPage(accountId);

// 这个方法会：
// 1. 检查池中是否已有页面
// 2. 如果有且有效，直接返回
// 3. 如果没有，创建新页面并保存到池中
// 4. 自动处理所有生命周期管理
```

### 2️⃣ 自动恢复失败的页面

```javascript
// ✅ 当页面因任何原因失败时
const page = await this.browserManager.recoverPage(accountId, 'closed');

// 这个方法会：
// 1. 删除旧页面（如果存在）
// 2. 强制清理上下文
// 3. 创建并返回新页面
```

### 3️⃣ 查看页面统计信息

```javascript
// ✅ 调试和监控时使用
const stats = this.browserManager.getPageStats();
console.log(stats);
// 输出例如:
// {
//   "acc-123": { alive: true, usageCount: 5, lastUsedAt: 1634567890000 },
//   "acc-456": { alive: false, usageCount: 2, lastUsedAt: 1634567800000 }
// }
```

---

## 💻 实际代码示例

### 示例 1: 登录流程

```javascript
class DouyinPlatform extends PlatformBase {
  async startLogin(options) {
    const { accountId, sessionId, proxy } = options;

    try {
      // ✅ 获取页面 (自动保存到池中)
      const page = await this.getAccountPage(accountId);

      // 导航到登录页
      await page.goto('https://creator.douyin.com/', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // ... 登录逻辑 ...

      return { status: 'success' };
    } catch (error) {
      logger.error(`Login failed: ${error.message}`);
      throw error;
    }
  }
}
```

### 示例 2: 爬虫流程

```javascript
class DouyinPlatform extends PlatformBase {
  async crawlComments(account) {
    try {
      // ✅ 获取页面 (复用登录时的页面)
      const page = await this.getOrCreatePage(account.id);

      // 页面已经登录且有所有权限！
      await page.goto('https://creator.douyin.com/creator-micro/interactive/comment');

      // ... 爬虫逻辑 ...

      return comments;
    } catch (error) {
      logger.error(`Crawl failed: ${error.message}`);
      throw error;
    }
  }
}
```

### 示例 3: 错误恢复

```javascript
class DouyinPlatform extends PlatformBase {
  async crawlWithRecovery(account) {
    try {
      let page = await this.getOrCreatePage(account.id);

      // 尝试操作
      await page.goto('https://...');
      // ... 更多操作 ...

    } catch (error) {
      // 检查是否是页面关闭错误
      if (error.message.includes('Target page, context or browser has been closed')) {
        logger.warn(`Page closed, recovering...`);

        // ✅ 自动恢复
        const page = await this.browserManager.recoverPage(
          account.id,
          'closed'
        );

        // 使用恢复后的页面重试
        await page.goto('https://...');
        // ... 继续操作 ...
      } else {
        throw error;
      }
    }
  }
}
```

---

## 🏗️ 对于新平台开发者

### 添加新平台时

```javascript
// packages/worker/src/platforms/xiaohongshu/platform.js

const PlatformBase = require('../base/platform-base');

class XiaohongshuPlatform extends PlatformBase {
  async startLogin(options) {
    const { accountId, sessionId, proxy } = options;

    // ✅ 直接使用 this.getAccountPage()
    // 无需自己创建或管理页面
    const page = await this.getAccountPage(accountId);

    // ... 登录逻辑 ...
  }

  async crawlComments(account) {
    // ✅ 直接使用 this.getOrCreatePage()
    // 会自动调用 this.getAccountPage()
    const page = await this.getOrCreatePage(account.id);

    // ... 爬虫逻辑 ...
  }
}
```

**关键点**：
- ✅ 总是用 `this.getAccountPage()` 或 `this.getOrCreatePage()`
- ❌ 不要自己调用 `context.newPage()`
- ❌ 不要维护 `this.currentPage` 或其他页面变量

---

## 🐛 调试技巧

### 检查页面是否被复用

```javascript
// 在登录日志中查看
[PlatformBase] Got page for account-123 from unified manager

// 在爬虫日志中查看 (应该显示同一个页面被复用)
[PlatformBase] Got page for account-123 from unified manager  // ✅ 同一个

// 如果每次都是新页面，说明有问题
```

### 查看页面统计

```javascript
// 在 Worker 进程中添加调试代码
setInterval(() => {
  const stats = this.browserManager.getPageStats();
  console.log('[DEBUG] Page Stats:', JSON.stringify(stats, null, 2));
}, 60000);  // 每分钟打印一次
```

### 查看页面池内容

```javascript
// 在 Browser Manager 中
console.log('Page Pool:', {
  size: this.accountPages.size,
  accounts: Array.from(this.accountPages.keys()),
  stats: this.getPageStats()
});
```

### 查看健康检查日志

```bash
# 启动 Worker 后查看日志中的健康检查
tail -f packages/worker/logs/browser-manager-v2.log | grep "HealthCheck"

# 应该看到类似:
# [HealthCheck] Checking 3 pages...
# [HealthCheck] Page for acc-123 is alive
# [HealthCheck] Page for acc-456 is alive
# [HealthCheck] Total healthy pages: 3
```

---

## ⚙️ 配置选项

### getAccountPage() 选项

```javascript
// 基础使用 (推荐)
const page = await this.getAccountPage(accountId);

// 自定义选项
const page = await this.getAccountPage(accountId, {
  reuseExisting: true,      // 是否复用已有页面 (默认: true)
  recoverOnFailure: true,   // 失败时是否自动恢复 (默认: true)
});

// 强制创建新页面 (不推荐，除非有特殊原因)
const page = await this.getAccountPage(accountId, {
  reuseExisting: false  // ❌ 避免使用
});
```

### 健康检查配置

```javascript
// 在 BrowserManager 初始化时
this.startPageHealthCheck(30000);  // 检查间隔 (毫秒)

// 默认 30 秒检查一次
// 如果需要更频繁的检查:
this.startPageHealthCheck(10000);  // 10 秒

// 停止健康检查 (关闭时)
this.stopPageHealthCheck();
```

---

## 📋 常见问题

### Q: 为什么我的爬虫每次都创建新页面？

**A**: 检查你是否使用了 `this.getOrCreatePage()` 或 `this.getAccountPage()`

```javascript
// ❌ 错误: 自己创建
const page = await context.newPage();

// ✅ 正确: 使用统一接口
const page = await this.getOrCreatePage(accountId);
```

### Q: 页面在爬虫中关闭了怎么办？

**A**: 使用 `recoverPage()` 自动恢复

```javascript
try {
  const page = await this.getAccountPage(accountId);
  await page.goto('https://...');
} catch (error) {
  if (error.message.includes('has been closed')) {
    // 自动恢复
    const page = await this.browserManager.recoverPage(accountId);
    await page.goto('https://...');
  }
}
```

### Q: 多个爬虫任务可以同时使用同一个页面吗？

**A**: 不推荐。应该按顺序执行或为不同任务使用不同账户

```javascript
// ❌ 不推荐 (可能导致冲突)
await Promise.all([
  crawlComments(account1),
  crawlDirectMessages(account1)  // 同一个account，同一个page
]);

// ✅ 推荐 (按顺序执行)
await crawlComments(account1);
await crawlDirectMessages(account1);

// ✅ 推荐 (不同账户)
await Promise.all([
  crawlComments(account1),
  crawlDirectMessages(account2)
]);
```

### Q: 如何完全关闭一个账户的页面？

**A**: 平台清理时自动处理，或手动调用

```javascript
// 平台清理时自动处理
async cleanup(accountId) {
  // BrowserManager 会自动清理页面
  await super.cleanup(accountId);
}

// 手动强制关闭 (不推荐，除非必要)
const page = this.browserManager.getExistingPage(accountId);
if (page && !page.isClosed()) {
  await page.close();
  this.browserManager.accountPages.delete(accountId);
}
```

---

## ✅ 迁移清单 (从旧架构)

如果你正在从旧架构迁移现有代码，检查这些项目：

- [ ] 移除所有 `this.currentPage` 声明
- [ ] 移除所有 `await context.newPage()` 调用
- [ ] 用 `this.getOrCreatePage(accountId)` 替换页面创建
- [ ] 移除手动的页面保存逻辑
- [ ] 移除平台级的页面健康检查
- [ ] 简化平台的清理逻辑
- [ ] 测试登录 → 爬虫流程的完整性
- [ ] 验证爬虫是否能获得登录时的权限

---

## 📞 技术支持

遇到问题？

1. **检查日志**: `tail -f packages/worker/logs/browser-manager-v2.log`
2. **启用调试**: 查看 `[DEBUG]` 日志以获取更多细节
3. **查看文档**: [worker-统一页面管理系统v2.md](./worker-统一页面管理系统v2.md)
4. **查看源代码**: [browser-manager-v2.js](../packages/worker/src/browser/browser-manager-v2.js)

---

**最后更新**: 2025-10-20
**版本**: v2.0 (Unified Page Management)

