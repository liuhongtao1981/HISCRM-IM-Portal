# 紧急修复：LoginHandler 未初始化导致 Master 崩溃

**日期**: 2025-11-07
**优先级**: 🔴 **严重（Critical）**
**状态**: ✅ 已修复

---

## 🐛 问题描述

Master 服务在收到 Worker 发送的二维码登录事件时崩溃，报错：

```
Uncaught Exception: Cannot read properties of undefined (reading 'handleQRCodeReady')
at tempHandlers.onLoginQRCodeReady (E:\HISCRM-IM-main\packages\master\src\index.js:561:20)
```

### 崩溃日志

```json
{
  "level": "error",
  "message": "Uncaught Exception: Cannot read properties of undefined (reading 'handleQRCodeReady')",
  "service": "master",
  "stack": "TypeError: Cannot read properties of undefined (reading 'handleQRCodeReady')\n    at tempHandlers.onLoginQRCodeReady (E:\\HISCRM-IM-main\\packages\\master\\src\\index.js:561:20)\n    at Socket.<anonymous> (E:\\HISCRM-IM-main\\packages\\master\\src\\communication\\socket-server.js:64:18)",
  "timestamp": "2025-11-07 13:21:11.084"
}
```

---

## 🔍 根本原因

在 `packages/master/src/index.js` 中：

1. **第 50 行**: 导入了 `LoginHandler` 类
2. **第 149 行**: 声明了全局变量 `loginHandler`（但未初始化）
3. **第 559-584 行**: 代码尝试使用 `loginHandler.handleQRCodeReady()` 等方法
4. **问题**: `loginHandler` **从未被实例化**，导致调用时为 `undefined`

### 错误的代码逻辑

```javascript
// 第 149 行 - 仅声明，未初始化
let loginHandler;

// 第 559 行 - 注释说"在 loginHandler 初始化后"，但实际没有初始化！
// 5.1 添加登录事件处理器（在 loginHandler 初始化后）
tempHandlers.onLoginQRCodeReady = (data) => {
  loginHandler.handleQRCodeReady(data.session_id, data.qr_code_data, data.qr_code_url);
  // ❌ loginHandler 是 undefined！
};
```

---

## ✅ 修复方案

在 `packages/master/src/index.js` 的 `start()` 函数中，添加 `LoginHandler` 的初始化代码。

### 修复位置

**文件**: `packages/master/src/index.js`
**行号**: 560-562（新增）

### 修复代码

```javascript
// 4.5 添加通知推送处理器
tempHandlers.onNotificationPush = async (data, socket) => {
  try {
    await notificationHandler.handleWorkerNotification(data);
  } catch (error) {
    logger.error('Failed to handle notification push:', error);
  }
};

// ⭐ 5. 初始化 LoginHandler（在 Socket.IO 和 namespaces 初始化之后）
loginHandler = new LoginHandler(db, adminNamespace, workerNamespace);
logger.info('Login handler initialized');

// 5.1 添加登录事件处理器（在 loginHandler 初始化后）
tempHandlers.onLoginQRCodeReady = (data) => {
  loginHandler.handleQRCodeReady(data.session_id, data.qr_code_data, data.qr_code_url);
};
```

### 初始化参数

```javascript
new LoginHandler(db, adminNamespace, workerNamespace)
```

- **`db`**: SQLite 数据库实例（用于保存登录会话）
- **`adminNamespace`**: Admin Socket.IO namespace（用于向管理员推送二维码）
- **`workerNamespace`**: Worker Socket.IO namespace（用于与 Worker 通信）

---

## 🧪 验证步骤

### 1. 启动 Master 服务

```bash
cd packages/master
npm start
```

**预期日志**:
```
[master] Login handler initialized
[master] Master Server Started
```

### 2. 启动 Worker 并触发登录

```bash
cd packages/worker
npm start
```

在 Admin UI 中点击"登录账户"，触发二维码登录流程。

### 3. 检查日志

**Master 日志**（应该正常处理，不再崩溃）:
```
[login-handler] Login session created for account xxx
[login-handler] QR code ready for session xxx
```

**不应再看到**:
```
❌ Uncaught Exception: Cannot read properties of undefined
```

---

## 📊 影响范围

### 受影响功能

- ✅ **二维码登录**: 现在可以正常工作
- ✅ **登录成功处理**: `handleLoginSuccess()` 可以正常调用
- ✅ **登录失败处理**: `handleLoginFailed()` 可以正常调用
- ✅ **二维码刷新**: `handleQRCodeRefreshed()` 可以正常调用

### 受影响版本

- **所有版本**: 此 bug 自引入 `LoginHandler` 以来一直存在（因为从未初始化过）

---

## 🔧 相关代码

### LoginHandler 类定义

**文件**: `packages/master/src/login/login-handler.js`

```javascript
class LoginHandler {
  /**
   * @param {Database} db - SQLite 数据库实例
   * @param {Object} adminNamespace - Admin Socket.IO namespace
   * @param {Object} workerNamespace - Worker Socket.IO namespace（可选）
   */
  constructor(db, adminNamespace, workerNamespace = null) {
    this.db = db;
    this.adminNamespace = adminNamespace;
    this.workerNamespace = workerNamespace;

    // 登录会话缓存 (sessionId -> session)
    this.sessions = new Map();
  }

  // 方法:
  // - createLoginSession()
  // - handleQRCodeReady()
  // - handleLoginSuccess()
  // - handleLoginFailed()
  // - handleQRCodeRefreshed()
  // - cleanupExpiredSessions()
}
```

### 登录事件处理器

**文件**: `packages/master/src/index.js`（修复后）

```javascript
// 5.1 添加登录事件处理器（在 loginHandler 初始化后）
tempHandlers.onLoginQRCodeReady = (data) => {
  loginHandler.handleQRCodeReady(data.session_id, data.qr_code_data, data.qr_code_url);
};

tempHandlers.onLoginSuccess = (data) => {
  const realAccountId = data.user_info ? (data.user_info.uid || data.user_info.douyin_id) : null;

  loginHandler.handleLoginSuccess(
    data.session_id,
    data.cookies,
    data.cookies_valid_until,
    realAccountId,
    data.user_info,
    data.fingerprint
  );
};

tempHandlers.onLoginFailed = (data) => {
  loginHandler.handleLoginFailed(data.session_id, data.error_message, data.error_type);
};

tempHandlers.onLoginQRCodeRefreshed = (data) => {
  loginHandler.handleQRCodeRefreshed(data.session_id, data.qr_code_data, data.refresh_count);
};
```

---

## 🎯 为什么这个 Bug 之前没被发现？

1. **登录功能很少使用**: 大部分账户已经登录，不需要重新扫码
2. **Worker 未主动触发登录**: 测试时可能没有触发完整的登录流程
3. **代码审查遗漏**: 注释写着"在 loginHandler 初始化后"，但实际没有初始化代码

---

## 🛡️ 预防措施

### 1. 添加启动自检

在 `start()` 函数末尾添加：

```javascript
// 自检: 确保关键组件已初始化
const criticalComponents = {
  db,
  workerRegistry,
  sessionManager,
  loginHandler,        // ⭐ 关键组件
  notificationHandler,
  heartbeatMonitor,
  taskScheduler
};

for (const [name, component] of Object.entries(criticalComponents)) {
  if (!component) {
    throw new Error(`Critical component not initialized: ${name}`);
  }
}
logger.info('✅ All critical components initialized successfully');
```

### 2. 添加单元测试

```javascript
// tests/test-master-initialization.js
describe('Master 初始化测试', () => {
  test('LoginHandler 应该被正确初始化', async () => {
    // 启动 Master
    const master = await startMaster();

    // 验证 loginHandler 存在
    expect(master.loginHandler).toBeDefined();
    expect(typeof master.loginHandler.handleQRCodeReady).toBe('function');

    // 清理
    await master.shutdown();
  });
});
```

### 3. 使用 TypeScript

如果使用 TypeScript，编译器会在编译时发现 `loginHandler` 未初始化的问题：

```typescript
let loginHandler: LoginHandler; // 声明但未初始化

// 使用时会报错
loginHandler.handleQRCodeReady(); // ❌ Error: Variable 'loginHandler' is used before being assigned
```

---

## 📝 总结

### 修复内容

- ✅ 在 `packages/master/src/index.js:560-562` 添加 `LoginHandler` 初始化代码
- ✅ 修复后 Master 不再因登录事件崩溃

### 修改文件

- `packages/master/src/index.js`（1 处修改，新增 3 行）

### 测试结果

- ✅ Master 启动成功
- ✅ 登录事件处理正常
- ✅ 无未捕获异常

---

**修复人**: Claude Code
**审查状态**: 待审查
**部署建议**: 立即部署到生产环境
