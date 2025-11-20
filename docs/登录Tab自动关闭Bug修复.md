# 登录 Tab 自动关闭 Bug 修复

## 问题描述

登录成功后，登录 Tab 没有自动关闭，导致浏览器中有两个标签页（PLACEHOLDER + 登录 Tab）。

## 根本原因

系统使用 TabManager 管理 Tab 生命周期，登录页面创建时设置为 `persistent=false`（非持久化），理论上调用 `release()` 后应该自动关闭。

**问题出在**：[platform.js:182-214](e:\HISCRM-IM-main\packages\worker\src\platforms\douyin\platform.js#L182-L214)

### 调用链分析

1. `worker/index.js` → `handleLoginRequest()`
2. → `platform.js` → `startLogin()`
3. → Line 131-136: 创建登录页面 `getPageForTask(..., {persistent: false})`，获取 `release` 函数
4. → Line 160-181: **已登录分支** - 调用 `release()` ✅
5. → Line 182-214: **未登录分支** - 调用 `handleQRCodeLogin()` → `waitForLogin()`
6. → 登录成功后 `waitForLogin()` 发送通知并 return
7. → **Bug**: `startLogin()` 直接 return，没有调用 `release()` ❌

### 代码比对

**修复前**（只有已登录分支调用 release）：

```javascript
if (loginStatus.isLoggedIn) {
    // ✅ 已登录
    await release();  // 正确关闭
    return { status: 'success', userInfo };
} else {
    // ❌ 未登录 - 二维码登录
    return await this.handleQRCodeLogin(...);  // 返回后没有 release！
}
```

**修复后**（两个分支都调用 release）：

```javascript
if (loginStatus.isLoggedIn) {
    // ✅ 已登录
    await release();
    return { status: 'success', userInfo };
} else {
    // ✅ 未登录 - 二维码登录
    const loginResult = await this.handleQRCodeLogin(...);

    // ✅ 登录成功后释放登录窗口
    await release();
    return loginResult;
}
```

## 修复方案

### 修改文件

[packages/worker/src/platforms/douyin/platform.js](e:\HISCRM-IM-main\packages\worker\src\platforms\douyin\platform.js)

### 修改内容

1. **登录成功后调用 release()** (Line 216-220)
   ```javascript
   // ✅ 登录成功后释放登录窗口（非持久化窗口会自动关闭）
   logger.info('Releasing login window after successful login...');
   await release();
   logger.info('✅ Login window released (will be auto-closed)');
   ```

2. **登录失败时也调用 release()** (Line 224-230)
   ```javascript
   } catch (error) {
       // 确保登录页面被关闭 - 使用 release()
       try {
           logger.warn('Login failed, releasing login window...');
           await release();
       } catch (e) {
           logger.warn('Failed to release login tab:', e.message);
       }
       throw error;
   }
   ```

## TabManager 工作原理

### persistent 参数

- **`persistent = true`**: 持久化窗口，调用 `release()` 不关闭（如 PLACEHOLDER、REALTIME_MONITOR）
- **`persistent = false`**: 非持久化窗口，调用 `release()` 后**自动关闭**（如 LOGIN、REPLY）

### getPageForTask 返回值

```javascript
const { page, release, tabId } = await tabManager.getPageForTask(accountId, {
    tag: TabTag.LOGIN,
    persistent: false,  // 非持久化
    shareable: true,
    forceNew: false
});
```

- `page`: Playwright Page 对象
- `release`: 释放函数，调用后非持久化窗口会自动关闭
- `tabId`: Tab ID

### release() 内部实现

```javascript
async releaseTab(accountId, tabId) {
    const tab = this.getTab(accountId, tabId);

    if (!tab.persistent) {
        // 非持久窗口：立即关闭
        await this.closeTab(accountId, tabId);
    } else {
        // 持久窗口：不做任何操作
    }
}
```

## 系统中的 Tab 类型

| Tab 类型 | persistent | 生命周期 |
|---------|-----------|---------|
| PLACEHOLDER | true | 持久化，账户初始化时创建 |
| LOGIN | **false** | **登录成功后自动关闭** |
| REALTIME_MONITOR | true | 持久化，登录成功后启动 |
| SPIDER_DM | false | 任务完成后关闭 |
| SPIDER_COMMENT | false | 任务完成后关闭 |
| REPLY_DM | false | 回复完成后关闭 |
| REPLY_COMMENT | false | 回复完成后关闭 |

## 日志输出示例

### 修复后的正常日志

```
[douyin-platform] Starting Douyin login for account acc-xxx
[TabManager] ✨ Created new tab tab-4 for login, persistent=false
[douyin-platform] Login method detected: qrcode
[platform-base] [Login Monitor] Login successful for account acc-xxx
[douyin-platform] Releasing login window after successful login...
[TabManager] 🗑️ Releasing non-persistent tab tab-4 (tag=login)
[TabManager] ✅ Tab tab-4 closed successfully
[douyin-platform] ✅ Login window released (will be auto-closed)
```

## 测试验证

### 测试步骤

1. 启动 Master 和 Worker
2. 通过 Admin Web 或 API 发起账号登录
3. 扫码完成登录
4. 观察浏览器标签页

### 预期结果

- 登录成功后，浏览器只剩下 **1 个标签页**（PLACEHOLDER Tab）
- 登录 Tab 自动关闭
- 日志中显示 "✅ Login window released"

## 相关文件

- [packages/worker/src/platforms/douyin/platform.js](e:\HISCRM-IM-main\packages\worker\src\platforms\douyin\platform.js) - 登录流程入口
- [packages/worker/src/platforms/base/platform-base.js](e:\HISCRM-IM-main\packages\worker\src\platforms\base\platform-base.js) - waitForLogin 登录监控
- [packages/worker/src/browser/tab-manager.js](e:\HISCRM-IM-main\packages\worker\src\browser\tab-manager.js) - Tab 管理器
- [docs/登录Tab自动关闭方案.md](e:\HISCRM-IM-main\docs\登录Tab自动关闭方案.md) - 原始设计文档

## 历史记录

- **2025-11-20**: 发现并修复登录 Tab 不关闭的 bug
- **问题**: 二维码登录成功后没有调用 `release()`
- **修复**: 在登录成功和失败两个分支都添加 `release()` 调用
