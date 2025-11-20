# 登录 Tab 自动关闭方案

## 问题

登录成功后，登录 Tab 没有自动关闭，导致浏览器中有两个创作中心标签页。

## 解决方案

使用 TabManager 的 `persistent` 参数来管理 Tab 生命周期。

## 实现方式

### 1. 创建登录 Tab 时设置为非持久

```javascript
// packages/worker/src/platforms/douyin/login-handler.js

const { TabTag } = require('../../browser/tab-manager');
const result = await this.browserManager.tabManager.getPageForTask(accountId, {
  tag: TabTag.LOGIN,
  persistent: false,  // ✅ 非持久窗口，使用完毕后会自动关闭
  shareable: false,
  forceNew: true
});

session.page = result.page;
session.tabId = result.tabId;
session.releaseTab = result.release;  // ✅ 保存 release 函数
```

### 2. 登录成功后调用 release() 方法

```javascript
async cleanupSession(accountId, closeContext = true) {
  const session = this.loginSessions.get(accountId);
  if (!session) return;

  // ✅ 通过 TabManager 释放登录 Tab
  if (session.releaseTab) {
    await session.releaseTab();  // 非持久窗口会自动关闭
  }
}
```

## TabManager 工作原理

### persistent 参数

- **`persistent = true`**：持久窗口，保持打开（如 PLACEHOLDER、REALTIME_MONITOR）
- **`persistent = false`**：非持久窗口，调用 `release()` 后自动关闭（如 LOGIN、REPLY）

### release() 方法

```javascript
async releaseTab(accountId, tabId) {
  const tab = this.getTab(accountId, tabId);

  if (!tab.persistent) {
    // 非持久窗口：立即关闭
    logger.info(`🗑️ Releasing non-persistent tab ${tabId}`);
    await this.closeTab(accountId, tabId);
  } else {
    // 持久窗口：不做任何操作
    logger.debug(`🔒 Persistent tab ${tabId} - release ignored`);
  }
}
```

## 系统中的 Tab 类型

| Tab 类型 | persistent | 生命周期 |
|---------|-----------|---------|
| PLACEHOLDER | true | 持久化，账户初始化时创建 |
| LOGIN | false | 登录成功后自动关闭 |
| REALTIME_MONITOR | true | 持久化，登录成功后启动 |
| SPIDER_DM | false | 任务完成后关闭 |
| SPIDER_COMMENT | false | 任务完成后关闭 |
| REPLY_DM | false | 回复完成后关闭 |
| REPLY_COMMENT | false | 回复完成后关闭 |

## 日志输出

### 创建登录 Tab
```
[douyin-login] ✅ Login page created via TabManager: tabId=tab-123
[TabManager] ✨ Created new tab tab-123 for login, persistent=false
```

### 登录成功，释放 Tab
```
[douyin-login] ✅ Login successful for account acc_456
[douyin-login] Releasing login tab for account acc_456 via TabManager
[TabManager] 🗑️ Releasing non-persistent tab tab-123 (tag=login)
[TabManager] ✅ Tab tab-123 closed successfully
[douyin-login] ✓ Login tab released for account acc_456
```

## 优势

1. **自动化**：无需手动关闭页面，TabManager 自动管理
2. **统一**：所有 Tab 使用同一套管理机制
3. **安全**：TabManager 确保不会关闭最后一个窗口（防止浏览器退出）
4. **可追踪**：所有 Tab 都注册在 TabManager 中，易于调试

## 降级方案

如果 TabManager 创建失败，代码会降级到手动创建页面：

```javascript
try {
  // 优先使用 TabManager
  const result = await this.browserManager.tabManager.getPageForTask(...);
  page = result.page;
  releaseTab = result.release;
} catch (tabError) {
  // 降级：手动创建页面
  logger.warn(`Failed to create via TabManager, falling back...`);
  page = await this.browserManager.newPage(accountId, {});
}

// 清理时
if (session.releaseTab) {
  await session.releaseTab();  // 使用 TabManager
} else {
  await session.page.close();  // 手动关闭
}
```

## 相关文件

- `packages/worker/src/browser/tab-manager.js` - Tab 管理器
- `packages/worker/src/platforms/douyin/login-handler.js` - 登录处理器

## 测试验证

登录成功后，浏览器应该只剩下 1 个标签页（PLACEHOLDER Tab），登录 Tab 自动关闭。
