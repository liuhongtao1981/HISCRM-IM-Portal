# Worker 登录检测问题修复方案

## 用户关键指正

> **用户**: "数据库的状态是 worker 发给 master 的，所以实际登录状态都是 worker 为主导，他是干活的，所以都是他来通知 master"

> **用户**: "master 是调度器，worker 是工作的，worker 检测状态告诉 master，master 更新状态，所以 worker 启动的时候，要先执行登录状态检测，master 收到已登录状态，他会告诉 worker 可以干活了，或者未登录的话，告诉他停下手上的事情把"

## 正确的架构理解 ✅

### 角色定位

| 角色 | 职责 | 权威性 |
|------|------|--------|
| **Worker** | 干活的，检测真实状态 | ⭐ 登录状态的唯一来源 |
| **Master** | 调度器，记录状态，分配任务 | 根据 Worker 报告做决策 |

### 正确的工作流程

```
┌───────────────────────────────────────────────────────┐
│  Worker 启动和状态检测流程                            │
└───────────────────────────────────────────────────────┘

1. Worker 启动
   ↓
2. ⭐ Worker 先执行登录状态检测
   - 启动浏览器（使用保存的 cookies）
   - 访问创作中心页面
   - 检测页面上的元素
   - 判断：已登录 / 未登录
   ↓
3. ⭐ Worker 报告给 Master
   - 如果已登录 → 发送 "logged_in" 状态
   - 如果未登录 → 发送 "not_logged_in" 状态
   ↓
4. Master 更新数据库
   - 保存 Worker 报告的状态
   ↓
5. ⭐ Master 根据状态给 Worker 指令
   - 如果已登录 → "可以开始干活了"（分配监控任务）
   - 如果未登录 → "停下手上的事情"（等待登录）
```

## 问题本质

### 之前的错误理解 ❌

我之前认为：
- Master 在登录成功后更新数据库 `login_status = 'logged_in'`
- Worker 应该从 Master 获取这个状态
- Worker 没有同步配置导致问题

### 正确的理解 ✅

实际上：
- **Worker 是登录状态的唯一权威来源**
- Worker 通过实际检测浏览器状态来判断是否登录
- Worker 把检测结果报告给 Master
- Master 只是记录 Worker 的报告

### 真正的问题

**Worker 的登录检测逻辑判断错误**：

1. Worker 重启后（18:59:31）
2. Worker 启动浏览器（使用保存的 cookies）
3. Worker 访问创作中心页面
4. **Worker 的 `checkLoginStatus()` 判断为"未登录"**（错误！）
5. Worker 报告给 Master："not_logged_in"
6. Master 更新数据库：`login_status = 'not_logged_in'`

**为什么 Worker 判断错误？**

可能的原因：
1. **Cookies 实际上已失效**（尽管文件存在）
2. **页面加载不完全**（检测时页面还在加载中）
3. **检测逻辑有误**（选择器不正确或顺序有问题）
4. **浏览器 Session 没有正确恢复**（PersistentContext 没有加载 cookies）

## 诊断证据

### 1. 数据库状态

```bash
$ node tests/诊断登录检测问题.js

账户 ID: acc-98296c87-2e42-447a-9d8b-8be008ddb6e4
平台用户ID: 1864722759 ✅
登录状态: not_logged_in ❌
最后登录: 2025/10/24 18:39:07
Cookies有效期: 2025/10/31 18:39:07
```

### 2. Storage 文件

```bash
✅ Storage 文件存在
📊 总 Cookies 数量: 56

🔑 关键 Cookies 检查:
    sessionid: ✅ 存在 (有效)
    sid_guard: ✅ 存在 (有效)
    uid_tt: ✅ 存在 (有效)
    sid_tt: ✅ 存在 (有效)
    passport_csrf_token: ✅ 存在 (有效)
```

### 3. Worker 日志

```
18:59:31 - ✓ Registered with master (1 accounts assigned)
19:00:01 - Checking login status for account acc-xxx...
19:00:01 - ✗ Account acc-xxx is NOT logged in
```

**关键问题**：
- Storage 文件有 cookies ✅
- 但 Worker 检测为"未登录" ❌

## 可能的原因分析

### 原因 1：浏览器 Session 未恢复 cookies ⭐

**问题**：
- `launchPersistentContext(userDataDir)` 应该会加载 userDataDir 中的 cookies
- 但可能由于某种原因，cookies 没有被正确恢复到浏览器 Session

**验证方法**：
1. 启动浏览器后，立即检查浏览器 cookies
2. 使用 DevTools → Application → Cookies 查看

**如果确认是这个问题，解决方案**：
- 显式地从 storage 文件加载 cookies 到 context
- 使用 `context.addCookies(cookies)` 手动添加

### 原因 2：页面加载时机问题 ⭐⭐

**问题**：
- Worker 在页面完全加载前就进行检测
- 此时登录相关的元素还没有渲染

**验证方法**：
1. 增加等待时间
2. 使用 `waitForSelector()` 等待关键元素
3. 添加更详细的日志，记录每个检测步骤

**如果确认是这个问题，解决方案**：
```javascript
async checkLoginStatus(page) {
  // ⭐ 先等待页面稳定
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  // ⭐ 等待关键元素出现（二者之一）
  try {
    await page.waitForSelector([
      'div.container-vEyGlK',  // 已登录：用户信息容器
      'text=扫码登录',          // 未登录：登录按钮
    ].join(','), { timeout: 10000 });
  } catch (error) {
    logger.warn('Neither login nor user info element appeared - page may not be fully loaded');
  }

  // 继续检测逻辑
  // ...
}
```

### 原因 3：检测逻辑的优先级问题 ⭐⭐⭐

**问题**：
当前代码的检测逻辑（`packages/worker/src/platforms/douyin/platform.js:190-212`）：

```javascript
// ⭐ 优先检查：如果页面上有登录元素，说明未登录
const loginPageIndicators = [
  'text=扫码登录',
  'text=验证码登录',
  'text=密码登录',
  'text=我是创作者',  // ⚠️ 这个可能是问题！
  'text=我是MCN机构',
  'text=需在手机上进行确认',
  '[class*="qrcode"]',
  '[class*="login-qrcode"]',
];

for (const indicator of loginPageIndicators) {
  const element = await page.$(indicator);
  if (element && await element.isVisible()) {
    logger.info(`✗ Found login page indicator: ${indicator} - NOT logged in`);
    return { isLoggedIn: false, status: 'not_logged_in' };
  }
}
```

**可能的问题**：
- `'text=我是创作者'` 这个文本可能在已登录的页面上也存在！
- 或者其他登录指示器在页面加载过程中短暂出现

**解决方案**：
1. 移除可能导致误判的指示器
2. 使用更精确的选择器
3. 增加等待和二次确认机制

```javascript
// ⭐ 改进版：更精确的登录指示器
const loginPageIndicators = [
  'button:has-text("扫码登录")',      // 更精确：按钮包含文本
  'button:has-text("验证码登录")',
  'button:has-text("密码登录")',
  'div.qrcode-container',            // 更精确：二维码容器
  'div.login-qrcode-wrapper',
  'div.login-form',                  // 登录表单
];

// ⭐ 如果找到登录指示器，等待一下再次确认
for (const indicator of loginPageIndicators) {
  const element = await page.$(indicator);
  if (element && await element.isVisible()) {
    // 等待 2 秒，看是否会消失（可能是加载过程中的临时元素）
    await page.waitForTimeout(2000);

    // 二次确认
    const stillThere = await element.isVisible();
    if (stillThere) {
      logger.info(`✗ Confirmed login page indicator: ${indicator} - NOT logged in`);
      return { isLoggedIn: false, status: 'not_logged_in' };
    }
  }
}
```

### 原因 4：检测时机过早 ⭐⭐⭐

**问题**：
Worker 启动后立即进行登录检测，此时浏览器刚启动，页面还在加载。

**当前代码**（`packages/worker/src/index.js`）：
```javascript
// Worker 启动
workerRegistration.register();
// 立即开始监控任务
taskRunner.start();
  ↓
// MonitorTask 启动
MonitorTask.run();
  ↓
// 立即检测登录状态（浏览器刚启动！）
checkLoginStatus();
```

**解决方案**：
1. Worker 启动后，先给浏览器更多时间初始化
2. 首次检测前，确保页面已完全加载

```javascript
// packages/worker/src/index.js

// 启动后等待一段时间再开始任务
logger.info('⏰ Waiting 10 seconds for browser initialization...');
await new Promise(resolve => setTimeout(resolve, 10000));

logger.info('✓ Starting task runner');
taskRunner.start();
```

## 修复方案

### 方案 1：增强检测逻辑的健壮性 ⭐⭐⭐（推荐）

**文件**：`packages/worker/src/platforms/douyin/platform.js`

```javascript
/**
 * ⭐ 改进版：检查登录状态（更健壮）
 */
async checkLoginStatus(page, checkMethod = 'auto') {
  try {
    const currentUrl = page.url();
    logger.info(`[checkLoginStatus] 📍 Current URL: ${currentUrl}`);

    // ⭐ 步骤1：等待页面稳定
    logger.info(`[checkLoginStatus] ⏳ Waiting for page to be stable...`);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      logger.warn('[checkLoginStatus] Timeout waiting for networkidle, continuing anyway');
    });

    // ⭐ 步骤2：等待关键元素出现（登录按钮 或 用户信息）
    logger.info(`[checkLoginStatus] ⏳ Waiting for critical elements...`);
    try {
      await page.waitForSelector([
        'div.container-vEyGlK',           // 已登录：用户信息
        'button:has-text("扫码登录")',     // 未登录：登录按钮
        'div.qrcode-container',           // 未登录：二维码
      ].join(','), { timeout: 15000 });
    } catch (error) {
      logger.warn('[checkLoginStatus] No critical elements appeared - page structure may have changed');
    }

    // ⭐ 步骤3：检查登录页面指示器（更精确）
    const loginPageIndicators = [
      { selector: 'button:has-text("扫码登录")', name: '扫码登录按钮' },
      { selector: 'button:has-text("验证码登录")', name: '验证码登录按钮' },
      { selector: 'div.qrcode-container', name: '二维码容器' },
      { selector: 'div.login-form', name: '登录表单' },
    ];

    logger.info(`[checkLoginStatus] 🔍 Checking login page indicators...`);
    for (const { selector, name } of loginPageIndicators) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            // ⭐ 等待2秒后二次确认（排除加载过程中的临时元素）
            logger.info(`[checkLoginStatus] Found ${name}, waiting 2s for confirmation...`);
            await page.waitForTimeout(2000);

            const stillVisible = await element.isVisible().catch(() => false);
            if (stillVisible) {
              logger.info(`✗ [checkLoginStatus] Confirmed ${name} - NOT logged in`);
              return { isLoggedIn: false, status: 'not_logged_in' };
            } else {
              logger.info(`[checkLoginStatus] ${name} disappeared - false positive`);
            }
          }
        }
      } catch (e) {
        logger.debug(`[checkLoginStatus] Error checking ${name}: ${e.message}`);
      }
    }

    // ⭐ 步骤4：检查用户信息容器（已登录的证据）
    logger.info(`[checkLoginStatus] 🔍 Checking user info containers...`);
    const userContainerSelectors = [
      'div.container-vEyGlK',
      'div[class*="container-"]',
    ];

    for (const selector of userContainerSelectors) {
      try {
        const container = await page.$(selector);
        if (container) {
          const isVisible = await container.isVisible();
          if (isVisible) {
            const text = await container.textContent();
            if (text && text.includes('抖音号：')) {
              logger.info(`✅ [checkLoginStatus] Found user info with 抖音号 - logged in`);

              // 提取用户信息
              const userInfo = await this.extractUserInfo(page);
              return { isLoggedIn: true, status: 'logged_in', userInfo };
            }
          }
        }
      } catch (e) {
        logger.debug(`[checkLoginStatus] Error checking container ${selector}: ${e.message}`);
      }
    }

    // ⭐ 步骤5：都没找到，返回无法判断
    logger.warn(`⚠️  [checkLoginStatus] Could not determine login status - assuming NOT logged in`);
    return { isLoggedIn: false, status: 'not_logged_in', uncertain: true };

  } catch (error) {
    logger.error(`[checkLoginStatus] Error during detection:`, error);
    return { isLoggedIn: false, status: 'not_logged_in', error: error.message };
  }
}
```

### 方案 2：Worker 启动延迟 ⭐

**文件**：`packages/worker/src/index.js`

```javascript
// ⭐ 8. 等待浏览器初始化后再启动任务
logger.info('⏰ Waiting 10 seconds for browser initialization...');
await new Promise(resolve => setTimeout(resolve, 10000));

// 9. 启动任务运行器
logger.info('✓ Starting task runner');
taskRunner.start();
```

### 方案 3：显式加载 Cookies ⭐⭐

**问题**：PersistentContext 可能没有正确加载 cookies

**解决方案**：显式地从 storage 文件加载 cookies

**文件**：`packages/worker/src/browser/browser-manager-v2.js`

```javascript
async launchPersistentContextForAccount(accountId, options = {}) {
  try {
    // ... 现有代码 ...

    // 启动 PersistentContext
    const context = await chromium.launchPersistentContext(userDataDir, launchOptions);

    // ⭐ 新增：显式加载 storage 文件中的 cookies
    const storageFilePath = path.join(this.config.dataDir, `storage-states/${accountId}_storage.json`);
    if (fs.existsSync(storageFilePath)) {
      try {
        const storageData = JSON.parse(fs.readFileSync(storageFilePath, 'utf8'));
        if (storageData.cookies && storageData.cookies.length > 0) {
          await context.addCookies(storageData.cookies);
          logger.info(`✅ Loaded ${storageData.cookies.length} cookies from storage file for ${accountId}`);
        }
      } catch (error) {
        logger.warn(`Failed to load cookies from storage file for ${accountId}:`, error.message);
      }
    }

    // ... 继续现有代码 ...
  } catch (error) {
    logger.error(`Failed to launch persistent context for account ${accountId}:`, error);
    throw error;
  }
}
```

## 测试计划

### 1. 重启 Worker 并观察详细日志

```bash
# 停止 Worker
# 启动 Worker（确保有详细日志）
cd packages/worker && npm start
```

**观察重点**：
- Worker 启动后第一次检测的详细过程
- 页面 URL
- 找到了哪些元素
- 最终判断结果

### 2. 手动验证浏览器 Cookies

```bash
# 启动 Worker 后，立即查看浏览器
# 在 DevTools → Application → Cookies 中检查
# 确认关键 cookies 是否存在：
# - sessionid
# - sid_guard
# - uid_tt
```

### 3. 页面截图和 HTML 保存

修改 `checkLoginStatus()` 添加调试代码：

```javascript
// 在检测前保存截图和 HTML
if (process.env.DEBUG) {
  await page.screenshot({ path: `./debug/login-check-${accountId}.png` });
  const html = await page.content();
  fs.writeFileSync(`./debug/login-check-${accountId}.html`, html);
  logger.info('Saved debug screenshot and HTML');
}
```

### 4. 逐步检测日志

添加详细日志，记录每个检测步骤的结果：

```
[checkLoginStatus] 📍 Current URL: https://creator.douyin.com/
[checkLoginStatus] ⏳ Waiting for page to be stable...
[checkLoginStatus] ✅ Page is stable (networkidle)
[checkLoginStatus] ⏳ Waiting for critical elements...
[checkLoginStatus] ✅ Found critical element: div.container-vEyGlK
[checkLoginStatus] 🔍 Checking login page indicators...
[checkLoginStatus] ⏭️  No login indicators found
[checkLoginStatus] 🔍 Checking user info containers...
[checkLoginStatus] ✅ Found user info with 抖音号 - logged in
```

## 总结

### 核心理解 ✅

1. **Worker 是登录状态的唯一权威来源**
2. Worker 通过实际检测浏览器状态判断登录
3. Master 只是记录 Worker 的报告
4. Master 根据 Worker 报告的状态，决定是否分配任务

### 问题本质 ✅

**不是配置同步问题，而是检测逻辑问题**：
- Worker 的 `checkLoginStatus()` 判断错误
- 导致 Worker 报告错误的状态给 Master
- Master 忠实记录了错误的状态

### 修复方向 ✅

1. **增强检测逻辑的健壮性**（最重要）
   - 等待页面稳定
   - 使用更精确的选择器
   - 二次确认机制

2. **增加启动延迟**
   - 给浏览器更多初始化时间

3. **显式加载 Cookies**
   - 确保 cookies 被正确恢复

4. **详细的调试日志**
   - 记录每个检测步骤
   - 保存截图和 HTML 用于分析

---

**文档时间**：2025-10-24 19:20
**文档作者**：Claude Code
**文档版本**：1.0
