# 手动登录功能 Worker 处理修复记录

## 问题描述

在修复了 Master 的手动登录处理逻辑后，测试发现 Worker 在收到 Master 的重启消息时出现了方法调用错误。

**错误日志**：
```
📥 [手动登录] 收到账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 的存储状态更新
[手动登录] 账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 重启失败: platformManager.getPlatformInstance is not a function
[手动登录] 账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 重启失败: browserManager.getBrowser is not a function
```

## 根本原因

Worker 的 `MASTER_UPDATE_ACCOUNT_STORAGE` 消息处理器中存在两个方法调用错误：

### 错误 1：platformManager 方法名错误

**文件**：[packages/worker/src/index.js](../packages/worker/src/index.js#L209)

**错误代码**：
```javascript
const platformInstance = platformManager.getPlatformInstance(platform); // ❌ 方法不存在
```

**问题分析**：
- `PlatformManager` 类中的方法名是 `getPlatform()`，而不是 `getPlatformInstance()`
- 参见 [packages/worker/src/platform-manager.js](../packages/worker/src/platform-manager.js#L79-L88)

### 错误 2：browserManager 不存在 getBrowser 方法

**文件**：[packages/worker/src/index.js](../packages/worker/src/index.js#L220)

**错误代码**：
```javascript
const browser = browserManager.getBrowser(accountId); // ❌ 方法不存在
if (browser) {
  await browserManager.closeBrowser(accountId);
}
```

**问题分析**：
- `BrowserManagerV2` 类没有 `getBrowser()` 方法
- 应该直接调用 `closeBrowser()`，它内部会处理浏览器不存在的情况
- 参见 [packages/worker/src/browser/browser-manager-v2.js](../packages/worker/src/browser/browser-manager-v2.js) 的方法列表

## 修复方案

### 修复 1：更正 platformManager 方法名

**文件**：[packages/worker/src/index.js](../packages/worker/src/index.js#L209)

**修复前**：
```javascript
const platformInstance = platformManager.getPlatformInstance(platform);
```

**修复后**：
```javascript
const platformInstance = platformManager.getPlatform(platform);
```

### 修复 2：移除不必要的 getBrowser 检查

**文件**：[packages/worker/src/index.js](../packages/worker/src/index.js#L220-L225)

**修复前**：
```javascript
// 2. 关闭并重新初始化浏览器，使用新的存储状态
const browser = browserManager.getBrowser(accountId);
if (browser) {
  await browserManager.closeBrowser(accountId);
  logger.info(`[手动登录] 已关闭账户 ${accountId} 的旧浏览器`);
}
```

**修复后**：
```javascript
// 2. 关闭并重新初始化浏览器，使用新的存储状态
try {
  await browserManager.closeBrowser(accountId);
  logger.info(`[手动登录] 已关闭账户 ${accountId} 的旧浏览器`);
} catch (error) {
  logger.warn(`[手动登录] 关闭浏览器失败（可能已关闭）:`, error.message);
}
```

**改进点**：
- 移除了不存在的 `getBrowser()` 方法调用
- 直接调用 `closeBrowser()`（内部会检查浏览器是否存在）
- 使用 try-catch 处理可能的异常

## 完整的手动登录流程

### Electron → Master → Worker 完整流程

```
1. Electron 登录助手检测到登录成功
   ├─ 监测 URL 跳转到创作中心
   ├─ 获取 storageState（Playwright API）
   └─ 发送 Socket.IO 消息到 Master /client 命名空间
       消息类型: client:manual-login-success
       数据: { accountId, platform, storageState, timestamp }
   ↓
2. Master 处理 onManualLoginSuccess
   ├─ 检查账户存在性（accountsDAO.findById）
   ├─ 更新数据库 storage_state
   ├─ 获取 assigned_worker_id
   ├─ 发送 master:update-account-storage 到 Worker ✅
   └─ 发送 client:manual-login-success:ack 到客户端
   ↓
3. Worker 收到 master:update-account-storage 消息
   ├─ 停止账户监控（platformManager.getPlatform().stopMonitoring）✅
   ├─ 关闭旧浏览器（browserManager.closeBrowser）✅
   ├─ 从已初始化集合中移除账户
   ├─ 重新加载账户配置
   ├─ 转换 storageState 格式为 credentials 格式
   ├─ 重新初始化浏览器（accountInitializer.initializeAccount）
   ├─ 重新启动监控
   └─ 发送 worker:account-restarted 确认
   ↓
4. Worker 上报账户状态
   worker:account:status
   { login_status: 'logged_in', worker_status: 'online' }
   ↓
5. IM 客户端显示
   头像彩色 + 绿色状态点
```

## 相关 API 文档

### PlatformManager 可用方法

**文件**：[packages/worker/src/platform-manager.js](../packages/worker/src/platform-manager.js)

```javascript
class PlatformManager {
  async loadPlatforms()
  getPlatform(platformName)                    // ✅ 正确方法名
  getSupportedPlatforms()
  getPlatformConfig(platformName)
  getAllPlatformCapabilities()
  isPlatformSupported(platformName)
  async createAccountContext(accountId, platformName, proxyConfig)
  getAccountContext(accountId, platformName)
  async cleanup()
}
```

### BrowserManagerV2 可用方法

**文件**：[packages/worker/src/browser/browser-manager-v2.js](../packages/worker/src/browser/browser-manager-v2.js)

```javascript
class BrowserManagerV2 {
  async launchBrowserForAccount(accountId, options = {})
  async isBrowserContextValid(accountId)
  async forceCleanupContext(accountId)
  async launchPersistentContextForAccount(accountId, options = {})
  async createContextForAccount(accountId, options = {})
  async applyFingerprintScripts(context, fingerprint)
  async applyAntiDetection(context)
  async saveStorageState(accountId)
  async newPage(accountId, options = {})
  async getSpiderPage(accountId, spiderType = 'spider1')
  async getTemporaryPage(accountId)
  async closeTemporaryPage(accountId, page)
  async getAccountPage(accountId, options = {})
  async isPageAlive(accountId)
  async recoverPage(accountId, reason)
  async closeContext(accountId, saveState = true)
  async closeBrowser(accountId)                // ✅ 直接调用，无需先检查
  async closeAll()
}
```

**注意**：
- ❌ 没有 `getBrowser()` 方法
- ✅ 直接调用 `closeBrowser()`，它内部会处理浏览器不存在的情况

## 测试验证

### 测试脚本

**文件**：[test_manual_login_real.js](../test_manual_login_real.js)

使用真实账户 ID 测试 Master → Worker 完整流程。

### 测试步骤

1. 确保 Master 和 Worker 都在运行
2. 运行测试脚本：
   ```bash
   node test_manual_login_real.js
   ```

### 预期结果

**Master 确认**：
```
[测试] ✅ 收到 Master 确认:
   - accountId: acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1
   - success: true
   - workerId: worker1
   - timestamp: 2025/11/25 13:42:41
```

**Worker 日志**（修复后）：
```
📥 [手动登录] 收到账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 的存储状态更新
[手动登录] 已停止账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 的监控
[手动登录] 已关闭账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 的旧浏览器
[手动登录] 已从已初始化集合中移除账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1
[手动登录] 设置 3 个 cookies 到账户配置
[手动登录] 账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 浏览器已使用新存储状态重新初始化
[手动登录] 账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 监控已重新启动
[手动登录] ✅ 账户 acc-2be36e29-9b29-470f-bd60-8d85ae49b8e1 重启完成
```

## 技术要点

### 1. 方法名一致性

在调用类的方法时，始终参考类的实际定义，避免凭记忆或猜测方法名。

**最佳实践**：
```bash
# 快速查找类的所有方法
grep "^\s*async\?\s\+\w\+\s*(" packages/worker/src/platform-manager.js
grep "^\s*async\?\s\+\w\+\s*(" packages/worker/src/browser/browser-manager-v2.js
```

### 2. 错误处理策略

对于可能失败但不影响主流程的操作，使用 try-catch 进行保护：

```javascript
// ✅ 好的做法
try {
  await browserManager.closeBrowser(accountId);
  logger.info(`浏览器已关闭`);
} catch (error) {
  logger.warn(`浏览器关闭失败（可能已关闭）:`, error.message);
}

// ❌ 不好的做法
const browser = browserManager.getBrowser(accountId); // 方法不存在
if (browser) {
  await browserManager.closeBrowser(accountId);
}
```

### 3. 异步操作顺序

Worker 重启账户的正确顺序：

1. 停止监控（避免监控任务干扰）
2. 关闭浏览器（释放资源）
3. 从已初始化集合中移除（允许重新初始化）
4. 重新加载配置
5. 转换数据格式
6. 重新初始化浏览器
7. 重新启动监控
8. 发送确认消息

## 相关文件

- [packages/worker/src/index.js](../packages/worker/src/index.js#L203-L285) - Worker 主入口，MASTER_UPDATE_ACCOUNT_STORAGE handler
- [packages/worker/src/platform-manager.js](../packages/worker/src/platform-manager.js#L79-L88) - PlatformManager.getPlatform 方法
- [packages/worker/src/browser/browser-manager-v2.js](../packages/worker/src/browser/browser-manager-v2.js) - BrowserManagerV2 API
- [packages/worker/src/handlers/account-initializer.js](../packages/worker/src/handlers/account-initializer.js) - AccountInitializer 类
- [packages/master/src/index.js](../packages/master/src/index.js#L650-L719) - Master onManualLoginSuccess handler
- [test_manual_login_real.js](../test_manual_login_real.js) - 测试脚本
- [手动登录功能Master处理修复记录.md](./手动登录功能Master处理修复记录.md) - Master 侧的修复记录

## 修复日期

2025-11-25

## 总结

**问题**：Worker 的 `MASTER_UPDATE_ACCOUNT_STORAGE` handler 存在两处方法调用错误：
1. `platformManager.getPlatformInstance()` 应为 `getPlatform()`
2. `browserManager.getBrowser()` 方法不存在，应直接调用 `closeBrowser()`

**修复**：
1. 更正方法名为 `getPlatform()`
2. 移除 `getBrowser()` 检查，直接调用 `closeBrowser()` 并用 try-catch 包裹

**验证**：
- 测试脚本确认 Master → Worker 通信正常
- 需要重启 Worker 应用修复后的代码

**下一步**：
- 重启 Master/Worker 进程
- 使用真实 Electron 客户端测试完整的手动登录流程
- 验证账户在 IM 客户端中显示为在线状态（彩色头像 + 绿点）
