# Worker 启动登录检测缺失问题

## 用户反馈

> "目前第一次打开并没有进行登录状态检测"
> "页面不对"
> "他应该访问创作中心去检测"

## 问题现象

Worker 启动后：
1. ❌ 没有打开浏览器
2. ❌ 没有访问创作中心页面（creator.douyin.com）
3. ❌ 没有执行登录状态检测
4. ❌ 直接报告 Master："not_logged_in"

Master 日志显示：
```
18:59:31 - Worker worker1 registered (1 accounts assigned)
19:00:01 - Worker worker1 报告状态: login_status=not_logged_in
19:01:01 - Worker worker1 报告状态: login_status=not_logged_in
...（每分钟重复）
```

## 根本原因

### 当前代码逻辑

**文件**：`packages/worker/src/handlers/monitor-task.js`

```javascript
async run() {
  try {
    // ❌ 问题1：先检查 platform_user_id，如果没有就直接返回
    if (!this.account.platform_user_id) {
      logger.warn(`Account ${this.account.id} missing platform_user_id - please login first`);

      // 直接报告未登录，不尝试检测
      this.accountStatusReporter.updateAccountStatus(this.account.id, {
        worker_status: 'offline',
        login_status: 'not_logged_in'
      });

      return; // ❌ 直接返回，不会启动浏览器检测
    }

    // ⏭️ 只有当 platform_user_id 存在时，才会走到这里
    // 打开浏览器，访问创作中心，检测登录状态
    const page = await this.browserManager.getAccountPage(this.account.id, {
      purpose: 'monitor',
      reuseExisting: true
    });

    // 检查登录状态
    const loginStatus = await this.platformInstance.checkLoginStatus(page);

    if (!loginStatus.isLoggedIn) {
      // 检测到未登录
      this.accountStatusReporter.updateAccountStatus(this.account.id, {
        login_status: 'not_logged_in'
      });
      return;
    }

    // 登录通过，继续爬取
    // ...
  } catch (error) {
    logger.error('MonitorTask run error:', error);
  }
}
```

### 问题分析

**恶性循环**：

```
1. Worker 启动，加载账户配置
   ├─ 数据库 login_status: 'not_logged_in'
   └─ 数据库 platform_user_id: '1864722759'（有值）

2. MonitorTask.run() 执行
   ├─ 检查：this.account.platform_user_id 存在 ✅
   └─ 继续执行

3. ⚠️ 但如果 platform_user_id 不存在（例如新账户）:
   ├─ 直接返回，不启动浏览器 ❌
   ├─ 不访问创作中心页面 ❌
   ├─ 不执行登录检测 ❌
   └─ 直接报告："not_logged_in" ❌
```

**问题的核心**：
- Worker **不应该**根据 `platform_user_id` 是否存在来决定是否检测
- Worker **应该**总是启动浏览器，访问创作中心，实际检测登录状态
- `platform_user_id` 只是登录成功后保存的元数据，**不是登录状态本身**

## 正确的逻辑

### Worker 启动后应该做什么

```
┌────────────────────────────────────────────────┐
│  Worker 正确的启动流程                         │
└────────────────────────────────────────────────┘

1. Worker 启动
   ↓
2. 加载分配的账户配置
   - 从 Master 获取账户列表
   - 初始化 TaskRunner
   ↓
3. ⭐ 对每个账户，立即执行登录状态检测
   ├─ 启动浏览器（PersistentContext）
   ├─ 访问创作中心页面（creator.douyin.com）
   ├─ 等待页面加载完成
   ├─ 检测页面元素
   └─ 判断：已登录 / 未登录
   ↓
4. ⭐ 报告检测结果给 Master
   - 如果已登录 → login_status='logged_in'
   - 如果未登录 → login_status='not_logged_in'
   ↓
5. ⭐ Master 根据状态分配任务
   - 已登录 → 开始监控任务
   - 未登录 → 等待用户登录
```

## 修复方案

### 方案 1：Worker 启动时主动检测 ⭐⭐⭐（推荐）

**新增文件**：`packages/worker/src/handlers/initial-login-check.js`

```javascript
/**
 * 初始登录状态检测
 *
 * Worker 启动后，对每个账户执行一次登录状态检测
 * 不依赖 platform_user_id，总是打开浏览器实际检测
 */

const logger = require('../utils/logger')('InitialLoginCheck');

class InitialLoginCheck {
  constructor(browserManager, accountStatusReporter) {
    this.browserManager = browserManager;
    this.accountStatusReporter = accountStatusReporter;
  }

  /**
   * ⭐ 执行初始登录检测
   * @param {Object} account - 账户对象
   * @param {Object} platformInstance - 平台实例
   * @returns {Object} { isLoggedIn, userInfo }
   */
  async check(account, platformInstance) {
    try {
      logger.info(`🔍 Starting initial login check for account ${account.id}...`);

      // 1. 启动浏览器（使用保存的 cookies）
      logger.info(`📂 Launching browser with saved cookies for ${account.id}...`);
      const page = await this.browserManager.getAccountPage(account.id, {
        purpose: 'login-check',
        reuseExisting: false  // 确保是新的干净页面
      });

      // 2. 访问创作中心页面
      logger.info(`🌐 Navigating to creator center for ${account.id}...`);
      await page.goto('https://creator.douyin.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // 3. 等待页面稳定
      logger.info(`⏳ Waiting for page to stabilize for ${account.id}...`);
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
        logger.warn('Timeout waiting for networkidle, continuing anyway');
      });

      // 额外等待 3 秒，确保动态内容加载
      await page.waitForTimeout(3000);

      // 4. 执行登录状态检测
      logger.info(`🔍 Checking login status for ${account.id}...`);
      const loginStatus = await platformInstance.checkLoginStatus(page);

      // 5. 报告结果给 Master
      if (loginStatus.isLoggedIn) {
        logger.info(`✅ Account ${account.id} is logged in`);

        this.accountStatusReporter.updateAccountStatus(account.id, {
          login_status: 'logged_in',
          worker_status: 'online'
        });

        return {
          isLoggedIn: true,
          userInfo: loginStatus.userInfo
        };
      } else {
        logger.info(`❌ Account ${account.id} is NOT logged in`);

        this.accountStatusReporter.updateAccountStatus(account.id, {
          login_status: 'not_logged_in',
          worker_status: 'offline'
        });

        return {
          isLoggedIn: false
        };
      }

    } catch (error) {
      logger.error(`Failed to check initial login status for ${account.id}:`, error);

      // 检测失败，保守地报告为未登录
      this.accountStatusReporter.updateAccountStatus(account.id, {
        login_status: 'not_logged_in',
        worker_status: 'offline'
      });

      return {
        isLoggedIn: false,
        error: error.message
      };
    }
  }
}

module.exports = InitialLoginCheck;
```

**修改文件**：`packages/worker/src/index.js`

```javascript
const InitialLoginCheck = require('./handlers/initial-login-check');

// ... 现有代码 ...

// 8. ⭐ 执行初始登录状态检测
logger.info('🔍 Step 8: Performing initial login status check...');
logger.info('-'.repeat(80));

const initialLoginCheck = new InitialLoginCheck(browserManager, accountStatusReporter);

for (const account of assignedAccounts) {
  logger.info(`Checking login status for account ${account.id} (${account.account_name})...`);

  try {
    // 获取平台实例
    const platformInstance = platformManager.getPlatform(account.platform);
    if (!platformInstance) {
      logger.warn(`Platform ${account.platform} not supported, skipping login check`);
      continue;
    }

    // 执行初始登录检测
    const checkResult = await initialLoginCheck.check(account, platformInstance);

    if (checkResult.isLoggedIn) {
      logger.info(`✅ Account ${account.id} logged in successfully`);

      // 如果有 userInfo，更新账户缓存
      if (checkResult.userInfo && checkResult.userInfo.douyin_id) {
        account.platform_user_id = checkResult.userInfo.douyin_id;
        accountsCache.set(account.id, account);
        logger.info(`Updated platform_user_id for ${account.id}: ${account.platform_user_id}`);
      }
    } else {
      logger.info(`❌ Account ${account.id} is not logged in`);
    }

  } catch (error) {
    logger.error(`Failed to check login for account ${account.id}:`, error);
  }
}

logger.info('✓ Initial login status check completed');
logger.info('');

// 9. 启动任务运行器（只有已登录的账户才会执行任务）
logger.info('✓ Starting task runner');
taskRunner.start();
```

### 方案 2：移除 platform_user_id 的前置检查 ⭐⭐

**修改文件**：`packages/worker/src/handlers/monitor-task.js`

```javascript
async run() {
  try {
    logger.info(`[MonitorTask] Running monitoring task for account ${this.account.id}`);

    // ❌ 删除这段代码：
    // if (!this.account.platform_user_id) {
    //   return;
    // }

    // ⭐ 改为：总是启动浏览器，实际检测
    const page = await this.browserManager.getAccountPage(this.account.id, {
      purpose: 'monitor',
      reuseExisting: true
    });

    // ⭐ 确保页面在创作中心
    if (!page.url().includes('creator.douyin.com')) {
      logger.info('Page not on creator center, navigating...');
      await page.goto('https://creator.douyin.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await page.waitForTimeout(2000);
    }

    // 检查登录状态
    const loginStatus = await this.platformInstance.checkLoginStatus(page);

    if (!loginStatus.isLoggedIn) {
      logger.info(`Account ${this.account.id} is NOT logged in, pausing monitoring`);

      this.accountStatusReporter.updateAccountStatus(this.account.id, {
        login_status: 'not_logged_in',
        worker_status: 'offline'
      });

      return;
    }

    // 已登录，更新状态
    this.accountStatusReporter.updateAccountStatus(this.account.id, {
      login_status: 'logged_in',
      worker_status: 'online'
    });

    // 继续爬取任务
    // ...

  } catch (error) {
    logger.error('MonitorTask run error:', error);
  }
}
```

## 推荐方案

**方案 1（初始登录检测）+ 方案 2（移除前置检查）**

### 为什么需要方案 1？

- Worker 启动后**立即**知道每个账户的登录状态
- Master 可以**立即**决定是否分配任务
- 用户可以**立即**看到哪些账户需要登录

### 为什么需要方案 2？

- 即使 `platform_user_id` 缺失，Worker 也能检测登录状态
- 避免"有 cookies 但因为缺 platform_user_id 而不检测"的问题
- 让 Worker 真正成为"登录状态的权威来源"

## 实现步骤

1. **创建 initial-login-check.js**
   - 新增初始登录检测模块

2. **修改 index.js**
   - Worker 启动后，对每个账户执行初始登录检测
   - 报告结果给 Master

3. **修改 monitor-task.js**
   - 移除 `platform_user_id` 的前置检查
   - 总是启动浏览器，访问创作中心，实际检测

4. **增强 checkLoginStatus()**
   - 等待页面稳定
   - 使用更精确的选择器
   - 添加详细日志

5. **测试验证**
   - 重启 Worker
   - 观察初始登录检测过程
   - 确认浏览器打开并访问创作中心
   - 确认正确检测登录状态

## 预期效果

### 修复前 ❌

```
Worker 启动
   ↓
加载账户配置（platform_user_id: 1864722759）
   ↓
MonitorTask.run()
   ├─ 检查 platform_user_id 存在 ✅
   ├─ 但 login_status: 'not_logged_in' ❌
   └─ 直接返回，不执行任务
```

### 修复后 ✅

```
Worker 启动
   ↓
加载账户配置
   ↓
⭐ 执行初始登录检测
   ├─ 启动浏览器
   ├─ 访问 creator.douyin.com
   ├─ 等待页面加载
   ├─ 检测登录状态
   └─ 报告给 Master: 'logged_in' ✅
   ↓
Master 更新数据库: login_status='logged_in'
   ↓
TaskRunner 开始监控任务
   ├─ MonitorTask.run()
   ├─ 检测登录状态：已登录 ✅
   └─ 执行爬取任务 ✅
```

## 总结

### 问题本质

- Worker 没有在启动时执行登录状态检测
- Worker 依赖 `platform_user_id` 来判断是否需要检测
- 导致有 cookies 的账户也被判定为未登录

### 修复方向

1. **Worker 启动时主动检测**（方案 1）
   - 立即知道登录状态
   - Master 可以立即分配任务

2. **总是实际检测**（方案 2）
   - 不依赖 `platform_user_id`
   - 启动浏览器，访问创作中心，检测页面

3. **增强检测逻辑**
   - 等待页面稳定
   - 精确的选择器
   - 详细的日志

---

**文档时间**：2025-10-24 19:20
**文档作者**：Claude Code
**文档版本**：1.0
