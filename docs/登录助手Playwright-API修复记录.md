# 登录助手 Playwright API 修复记录

## 问题描述

用户在使用 Electron 登录助手进行手动登录时遇到错误：

```
[登录助手] 错误: browserType.launch: Pass userDataDir parameter to
'browserType.launchPersistentContext(userDataDir, options)' instead of
specifying '--user-data-dir' argument
```

## 根本原因

登录助手使用了不推荐的 Playwright API 调用方式：

1. 使用 `chromium.launch()` 启动浏览器
2. 在 `args` 参数中传递 `--user-data-dir` 选项
3. 然后调用 `browser.newContext()` 创建上下文

Playwright 推荐的方式是直接使用 `launchPersistentContext()` 方法，将 `userDataDir` 作为第一个参数传递。

## 修复方案

### 修复前（不推荐的方式）

**文件**: [login-assistant.js](../packages/crm-pc-im/src/main/login-assistant.js)

```javascript
// ❌ 错误的方式
this.activeBrowser = await chromium.launch({
    headless: false,
    args: [
        `--user-data-dir=${this.currentTempDir}`,  // ❌ 不推荐
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check'
    ]
});

this.activeBrowser.on('disconnected', () => {
    this.handleBrowserDisconnected();
});

const context = await this.activeBrowser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent: '...'
});

const page = await context.newPage();
```

### 修复后（推荐的方式）

```javascript
// ✅ 正确的方式：使用 launchPersistentContext
const context = await chromium.launchPersistentContext(this.currentTempDir, {
    headless: false,
    args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check'
    ],
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
});

// 保存 context 引用（用于后续清理）
this.activeBrowser = context;

// 监听浏览器上下文关闭（而非 browser.on('disconnected')）
context.on('close', () => {
    this.handleBrowserDisconnected();
});

// 使用 launchPersistentContext 创建的默认页面
const pages = context.pages();
const page = pages.length > 0 ? pages[0] : await context.newPage();
```

## 主要变更

### 1. 使用 `launchPersistentContext` 代替 `launch` + `newContext`

- **之前**：`chromium.launch()` → `browser.newContext()` → `context.newPage()`
- **现在**：`chromium.launchPersistentContext()` → `context.pages()[0]`

### 2. 移除 `args` 中的 `--user-data-dir`

- **之前**：`args: ['--user-data-dir=/path/to/dir', ...]`
- **现在**：`userDataDir` 作为第一个参数传递

### 3. 合并浏览器配置和上下文配置

所有配置（浏览器参数 + 上下文配置）都在 `launchPersistentContext()` 的第二个参数中指定。

### 4. 事件监听调整

- **之前**：`browser.on('disconnected', ...)`
- **现在**：`context.on('close', ...)`

### 5. 页面获取方式

- **之前**：总是创建新页面 `context.newPage()`
- **现在**：优先使用已有页面 `context.pages()[0]`，如果没有才创建新页面

## 优势

1. **符合最佳实践**：Playwright 官方推荐的 API 使用方式
2. **更高效**：减少一次 `newContext()` 和 `newPage()` 调用
3. **更简洁**：一步完成浏览器和上下文的创建
4. **更稳定**：避免了未来 Playwright 版本中可能弃用旧 API 的风险

## 技术要点

### `launchPersistentContext` vs `launch` + `newContext`

| 特性 | `launch` + `newContext` | `launchPersistentContext` |
|------|------------------------|---------------------------|
| 调用次数 | 2 次（launch + newContext） | 1 次 |
| userDataDir 设置 | 通过 args | 第一个参数 |
| 返回值 | Browser 对象 | BrowserContext 对象 |
| 默认页面 | 需要手动创建 | 自动创建 about:blank |
| 用户数据持久化 | 需要手动配置 | 自动持久化到 userDataDir |

### 何时使用 `launchPersistentContext`

当您需要：
- 持久化用户数据（cookies、localStorage 等）
- 模拟真实浏览器环境
- 手动登录流程（需要保存登录状态）

使用 `launchPersistentContext` 而不是 `launch` + `newContext`。

## 相关文件

- [login-assistant.js](../packages/crm-pc-im/src/main/login-assistant.js#L62-L86) - 登录助手主要逻辑

## 修复日期

2025-11-25

## 参考资料

- [Playwright API: launchPersistentContext](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
- [Playwright Best Practices: User Data Directory](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
