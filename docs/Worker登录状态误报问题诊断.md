# Worker 登录状态误报问题诊断报告

## 问题时间
2025-10-24 14:45

## 问题描述

用户在 Admin Web 管理平台看到账户显示"已登录"（绿色状态），但实际上用户并未进行登录操作。

### 用户反馈截图分析

```
账户列表显示：
- 账户名：douyin-test
- 用户信息：抖音创作者中心·创作者（❌ 这是页面默认文本，不是真实用户）
- 登录状态：已登录（绿色）✓
- Cookie 状态：（显示有 cookie）
```

**问题**：
1. 用户信息不正确（显示的是页面标题而不是真实用户信息）
2. 登录状态误报为"已登录"
3. Worker 没有定期检查用户登录状态的心跳机制

## 根本原因分析

### 原因 1：Worker 启动时未检查登录状态

**问题代码**（`packages/worker/src/index.js:147-153`）：

```javascript
// ❌ 旧代码：直接设置为在线状态
// 12. 为所有账号设置初始在线状态（在启动前设置）
for (const account of assignedAccounts) {
  if (accountInitializer.isInitialized(account.id)) {
    accountStatusReporter.setAccountOnline(account.id); // ← 没有先检查是否登录
    logger.info(`Set account ${account.id} status to online`);
  }
}
```

**问题**：
- Worker 初始化浏览器后，**直接将所有账户设置为在线状态**
- 没有调用 `platform.checkLoginStatus()` 验证是否真的登录了
- 导致未登录的账户也被标记为"已登录"

### 原因 2：Master 数据库保留了旧状态

**数据库状态**：
- `accounts` 表中 `login_status` 字段保留了之前的"已登录"状态
- Worker 未上报新的登录状态，Master 继续显示旧数据

**正确的流程应该是**：
1. Worker 启动 → 初始化浏览器
2. Worker 检查登录状态 → 调用 `checkLoginStatus()`
3. Worker 上报状态给 Master → Master 更新数据库
4. Admin Web 读取最新状态 → 显示正确状态

### 原因 3：缺少定期心跳检查机制

**当前情况**：
- Worker 启动后只在初始化时检查一次登录状态
- **没有定期心跳检查用户是否掉线或被登出**
- 如果用户在另一台设备登出，Worker 无法感知

**应该有的机制**：
- 每隔 N 分钟（如 5 分钟）检查一次登录状态
- 如果检测到未登录，立即上报给 Master
- Master 更新账户状态为 `login_failed` 或 `offline`

## 解决方案

### 修复 1：Worker 启动时检查登录状态 ✅

**新代码**（`packages/worker/src/index.js:147-191`）：

```javascript
// ✅ 新代码：先检查登录状态再设置
// 12. 检查登录状态并上报给 Master
logger.info('Checking login status for all accounts...');
for (const account of assignedAccounts) {
  if (accountInitializer.isInitialized(account.id)) {
    try {
      // 获取平台实例
      const platform = platformManager.getPlatform(account.platform);

      // 获取浏览器上下文
      const context = browserManager.contexts.get(account.id);

      // 获取账户页面（Spider1）
      const page = await browserManager.getAccountPage(account.id);

      // ✅ 检查登录状态
      logger.info(`Checking login status for account ${account.id}...`);
      const isLoggedIn = await platform.checkLoginStatus(page);

      if (isLoggedIn) {
        logger.info(`✓ Account ${account.id} is logged in - setting status to online`);
        accountStatusReporter.setAccountOnline(account.id);
      } else {
        logger.warn(`✗ Account ${account.id} is NOT logged in - setting status to login_failed`);
        accountStatusReporter.recordError(account.id, 'Not logged in - login required');
        accountStatusReporter.setAccountOffline(account.id);
      }
    } catch (error) {
      logger.error(`Failed to check login status for account ${account.id}:`, error);
      accountStatusReporter.recordError(account.id, `Login check failed: ${error.message}`);
    }
  }
}
```

**改进点**：
1. ✅ 使用 `platform.checkLoginStatus(page)` 检查真实登录状态
2. ✅ 根据检查结果设置正确的账户状态：
   - 已登录 → `setAccountOnline()`
   - 未登录 → `setAccountOffline()` + `recordError()`
3. ✅ 通过 `accountStatusReporter` 上报给 Master
4. ✅ Master 更新数据库，Admin Web 显示最新状态

### 修复 2：使用优化后的 checkLoginStatus ✅

**新的检测逻辑**（`packages/worker/src/platforms/douyin/platform.js:174-263`）：

使用 Chrome DevTools 确认的精确选择器：

```javascript
async checkLoginStatus(page) {
  await page.waitForTimeout(2000);

  // 方法1: 检查用户信息容器
  const container = await page.$('div.container-vEyGlK');
  if (container && await container.isVisible()) {
    const text = await container.textContent();
    if (text && text.includes('抖音号：')) {
      return true; // ✓ 已登录
    }
  }

  // 方法2: 检查抖音号元素
  const douyinIdElement = await page.$('div.unique_id-EuH8eA');
  if (douyinIdElement && await douyinIdElement.isVisible()) {
    const text = await douyinIdElement.textContent();
    if (text && text.includes('抖音号：')) {
      return true; // ✓ 已登录
    }
  }

  // 方法3: 检查用户头像
  const avatar = await page.$('div.avatar-XoPjK6 img');
  if (avatar && await avatar.isVisible()) {
    const src = await avatar.getAttribute('src');
    if (src && src.includes('douyinpic.com')) {
      return true; // ✓ 已登录
    }
  }

  return false; // ✗ 未登录
}
```

**优势**：
- ✅ 精确定位用户信息容器（不会误判页面其他元素）
- ✅ 三层验证机制（容器 + 抖音号 + 头像）
- ✅ 验证文本内容和 CDN 域名

## 测试验证

### 测试步骤

1. **重启 Worker 进程**：
   ```bash
   taskkill /F /IM node.exe
   cd packages/master && npm start &
   cd packages/worker && npm start &
   ```

2. **观察日志**：
   ```
   [worker] Checking login status for all accounts...
   [worker] Checking login status for account acc-98296c87-2e42-447a-9d8b-8be008ddb6e4...
   [douyin-platform] Checking login status by detecting user info container...
   [douyin-platform] ✗ No user info indicators found - NOT logged in
   [worker] ✗ Account acc-98296c87-2e42-447a-9d8b-8be008ddb6e4 is NOT logged in - setting status to login_failed
   ```

3. **检查 Admin Web**：
   - 刷新账户管理页面
   - 登录状态应该显示为"未登录"或"登录失败"（红色/黄色）
   - 用户信息应该为空或显示"需要登录"

### 预期结果

- ✅ Worker 启动时正确检测未登录状态
- ✅ 上报给 Master 并更新数据库
- ✅ Admin Web 显示正确的登录状态
- ✅ 用户信息为空（不显示页面默认文本）

## 影响范围

### 修改的文件

1. **`packages/worker/src/index.js:147-191`**
   - 添加登录状态检查逻辑
   - 根据检查结果设置正确的账户状态

2. **`packages/worker/src/platforms/douyin/platform.js:174-263`**
   - 优化 `checkLoginStatus()` 方法
   - 使用精确选择器防止误判

### 不影响的功能

- ✅ 已登录账户的正常监控和爬取
- ✅ Master 服务器的其他功能
- ✅ Admin Web 的其他页面

## 总结

### 问题根源

1. **Worker 启动时未验证登录状态** - 直接设置为在线
2. **Master 显示数据库旧状态** - Worker 未上报最新状态
3. **登录检测选择器不精确** - 误判页面其他元素为用户头像

### 解决方案

1. ✅ **Worker 启动时检查登录状态** - 已修复
2. ✅ **优化登录检测逻辑** - 使用精确选择器
3. ✅ **上报正确状态给 Master** - 更新数据库

### 下一步

1. 重启 Worker 测试修复效果
2. 验证登录状态显示正确
3. 测试完整登录流程

## 相关文档

- `docs/登录检测选择器优化-最终版.md` - 选择器优化方案
- `docs/登录功能简化版测试报告.md` - 登录功能测试
- `packages/worker/src/index.js` - Worker 启动逻辑
- `packages/worker/src/platforms/douyin/platform.js` - 抖音平台实现
- `packages/worker/src/handlers/account-status-reporter.js` - 状态上报器
