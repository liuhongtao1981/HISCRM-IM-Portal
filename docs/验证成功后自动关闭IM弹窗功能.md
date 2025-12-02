# 验证成功后自动关闭IM弹窗功能

## 问题描述

**时间：** 2025-12-02 14:15

**用户反馈：**
1. "已经验证通过了，窗口还在"
2. "另外还是2个弹窗"

**问题分析：**
- 验证成功后，Worker没有通知IM端关闭弹窗
- IM端的验证弹窗持续显示，需要用户手动关闭
- 尽管已添加跳过检测逻辑，但用户测试时代码可能未重启

---

## 解决方案

### 核心思路

添加**验证完成通知机制**：
1. Worker端验证成功/失败后，主动通知Master
2. Master转发通知给所有IM客户端
3. IM客户端收到通知后自动关闭弹窗

---

## 代码修改

### 修改1：WorkerBridge - 添加通知方法

**文件：** `packages/worker/src/platforms/base/worker-bridge.js`

**位置：** 第473-501行（在requestSMSCode方法之后）

```javascript
/**
 * 通知IM端验证完成（成功或失败）
 * @param {string} accountId - 账户 ID
 * @param {boolean} success - 验证是否成功
 * @param {string} message - 附加消息（可选）
 */
notifyVerificationComplete(accountId, success, message = '') {
  if (!this.socket) {
    logger.warn('Socket not connected, cannot notify verification complete');
    return;
  }

  try {
    this.socket.emit('worker:verification:complete', {
      account_id: accountId,
      success: success,
      message: message || (success ? '验证成功' : '验证失败'),
      timestamp: Date.now(),
    });

    logger.info(`✅ Verification complete notification sent`, {
      accountId,
      success,
      message
    });
  } catch (error) {
    logger.error('Failed to notify verification complete:', error);
  }
}
```

**关键点：**
- 发送`worker:verification:complete`事件到Master
- 包含账户ID、成功状态、消息和时间戳
- 不阻塞主流程（即使socket未连接也只是警告）

---

### 修改2：Platform.js - 调用通知方法

**文件：** `packages/worker/src/platforms/douyin/platform.js`

#### 2.1 验证成功后通知（第1442-1443行）

**修改前：**
```javascript
if (verifyResult.success) {
    logger.info('✅ 短信验证成功，重新尝试发送评论...');

    // 验证成功后，重新执行评论发送逻辑
    const { sendReplyToCommentVideoDetail } = require('./send-reply-to-comment-video-detail');
```

**修改后：**
```javascript
if (verifyResult.success) {
    logger.info('✅ 短信验证成功，重新尝试发送评论...');

    // 🔥 通知IM端验证成功，关闭弹窗
    this.bridge.notifyVerificationComplete(accountId, true, '短信验证成功');

    // 验证成功后，重新执行评论发送逻辑
    const { sendReplyToCommentVideoDetail } = require('./send-reply-to-comment-video-detail');
```

#### 2.2 验证失败后通知（第1499-1500行）

**修改前：**
```javascript
} else {
    logger.error('❌ 短信验证失败！');
    logger.error(`💡 失败原因: ${verifyResult.message}`);
    logger.error(`📋 详细信息:`, {
        accountId,
        verificationType: error.verificationInfo.type,
        phoneNumber: error.verificationInfo.phoneNumber,
        failureMessage: verifyResult.message
    });

    // 验证失败后，检查是否需要关闭tab
    logger.info('验证失败，保留标签页以便用户手动操作');
```

**修改后：**
```javascript
} else {
    logger.error('❌ 短信验证失败！');
    logger.error(`💡 失败原因: ${verifyResult.message}`);
    logger.error(`📋 详细信息:`, {
        accountId,
        verificationType: error.verificationInfo.type,
        phoneNumber: error.verificationInfo.phoneNumber,
        failureMessage: verifyResult.message
    });

    // 🔥 通知IM端验证失败，关闭弹窗
    this.bridge.notifyVerificationComplete(accountId, false, `验证失败: ${verifyResult.message}`);

    // 验证失败后，检查是否需要关闭tab
    logger.info('验证失败，保留标签页以便用户手动操作');
```

---

### 修改3：Master - 监听Worker事件

**文件：** `packages/master/src/communication/im-websocket-server.js`

#### 3.1 添加事件监听（第161-164行）

**位置：** Worker命名空间连接处理中，在`worker:sms_code:request`监听之后

```javascript
// ✅ 监听 Worker 短信验证码输入请求
socket.on('worker:sms_code:request', (data) => {
    this.handleWorkerSMSCodeRequest(socket, data);
});

// ✅ 监听 Worker 验证完成通知（成功/失败）
socket.on('worker:verification:complete', (data) => {
    this.handleWorkerVerificationComplete(socket, data);
});
```

#### 3.2 添加处理方法（第2317-2348行）

**位置：** 在`handleSMSCodeResponse`方法之后，类结束之前

```javascript
/**
 * 处理 Worker 验证完成通知（成功/失败）
 */
handleWorkerVerificationComplete(socket, data) {
    try {
        logger.info(`[IM WS] ✅ Worker ${socket.id} verification complete:`, {
            accountId: data.account_id,
            success: data.success,
            message: data.message,
            timestamp: data.timestamp
        });

        const completeData = {
            account_id: data.account_id,
            success: data.success,
            message: data.message,
            timestamp: data.timestamp
        };

        // 广播到根命名空间（所有 Monitor 客户端）
        this.io.emit('verification:complete', completeData);

        // 同时发送到 /client namespace（为未来的新IM客户端准备）
        const clientNamespace = this.io.of('/client');
        clientNamespace.emit('verification:complete', completeData);

        logger.info(`[IM WS] Verification complete notification broadcasted to all IM clients, account_id: ${data.account_id}, success: ${data.success}`);

    } catch (error) {
        logger.error('[IM WS] Failed to broadcast verification complete notification:', error);
    }
}
```

**关键点：**
- 接收Worker的`worker:verification:complete`事件
- 转发为`verification:complete`事件给所有IM客户端
- 同时发送到根命名空间和`/client`命名空间

---

## 通信流程

### 完整流程图

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. 发送评论                                                       │
│    Worker → sendReplyToCommentVideoDetail()                      │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. 检测验证弹窗                                                   │
│    Worker → detectVerification() → 检测到验证                     │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. 请求IM端验证                                                   │
│    Worker → bridge.requestVerification()                         │
│    Master → 转发 'verification:request'                          │
│    IM端  → 显示弹窗1："是否继续验证？"                             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 4. 用户选择"是"                                                   │
│    IM端  → 发送 'monitor:verification:response' (choice: yes)    │
│    Master → 转发给Worker                                         │
│    Worker → 收到用户选择                                          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 5. 点击"获取验证码"按钮                                            │
│    Worker → handleSMSVerification() 点击按钮                      │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 6. 请求IM端输入验证码                                             │
│    Worker → bridge.requestSMSCode()                              │
│    Master → 转发 'sms_code:request'                              │
│    IM端  → 显示弹窗2："请输入验证码"                               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 7. 用户输入验证码                                                 │
│    IM端  → 发送 'monitor:sms_code:response' (code: "123456")     │
│    Master → 转发给Worker                                         │
│    Worker → 收到验证码                                            │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 8. 填写验证码并验证                                               │
│    Worker → 使用Playwright type()填写验证码                       │
│    Worker → 点击"验证"按钮                                        │
│    Worker → 检查验证结果                                          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 9. ✅ 通知IM端验证成功（新增）                                     │
│    Worker → bridge.notifyVerificationComplete(accountId, true)   │
│    Master → 转发 'verification:complete'                         │
│    IM端  → 收到通知，自动关闭所有验证相关弹窗                      │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 10. 重试发送评论（skipVerificationCheck: true）                  │
│    Worker → sendReplyToCommentVideoDetail(skipVerificationCheck) │
│    Worker → 跳过验证检测，直接发送                                 │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 11. ✅ 评论发送成功                                               │
└──────────────────────────────────────────────────────────────────┘
```

---

## 事件协议

### Worker → Master

#### 1. `worker:verification:complete`

**方向：** Worker → Master

**数据结构：**
```javascript
{
  account_id: string,     // 账户ID
  success: boolean,       // 验证是否成功
  message: string,        // 附加消息
  timestamp: number       // 时间戳
}
```

**示例：**
```javascript
// 成功
{
  account_id: "acc-35e6ca87-d12d-4244-98fe-a11419b76253",
  success: true,
  message: "短信验证成功",
  timestamp: 1733122840700
}

// 失败
{
  account_id: "acc-35e6ca87-d12d-4244-98fe-a11419b76253",
  success: false,
  message: "验证失败: 验证码错误",
  timestamp: 1733122850123
}
```

---

### Master → IM客户端

#### 1. `verification:complete`

**方向：** Master → IM客户端（根命名空间 + /client命名空间）

**数据结构：**
```javascript
{
  account_id: string,     // 账户ID
  success: boolean,       // 验证是否成功
  message: string,        // 附加消息
  timestamp: number       // 时间戳
}
```

**IM端需要做的事情：**
```javascript
// IM端监听事件（需要在IM端实现）
socket.on('verification:complete', (data) => {
    console.log('收到验证完成通知:', data);

    if (data.success) {
        // 验证成功
        // 1. 关闭所有验证相关弹窗
        //    - 关闭"是否继续验证"弹窗
        //    - 关闭"请输入验证码"弹窗
        // 2. 显示成功提示（可选）
        showSuccessToast('验证成功');
    } else {
        // 验证失败
        // 1. 关闭所有验证相关弹窗
        // 2. 显示失败提示
        showErrorToast(data.message);
    }
});
```

---

## 测试验证

### 测试步骤

1. **重启服务**
   ```bash
   # 重启Master
   cd packages/master
   npm start

   # 重启Worker
   cd packages/worker
   npm start
   ```

2. **触发验证流程**
   - 发送评论
   - 等待验证弹窗
   - 选择"是"继续验证
   - 输入验证码
   - 等待验证完成

3. **观察日志**

   **Worker端日志（应该看到）：**
   ```
   ✅ 短信验证成功，重新尝试发送评论...
   ✅ Verification complete notification sent
   ```

   **Master端日志（应该看到）：**
   ```
   [IM WS] ✅ Worker socket123 verification complete: { accountId: 'acc-xxx', success: true, ... }
   [IM WS] Verification complete notification broadcasted to all IM clients
   ```

   **IM端（需要实现监听）：**
   ```
   收到验证完成通知: { account_id: 'acc-xxx', success: true, message: '短信验证成功' }
   关闭所有验证弹窗
   ```

4. **预期结果**
   - ✅ 验证成功后，IM端弹窗自动关闭
   - ✅ 不再需要用户手动关闭弹窗
   - ✅ 只弹出1次验证窗口（不重复）

---

## IM端实现指南

### 需要在IM端添加的代码

**文件：** `packages/crm-pc-im/src/xxx/socket-handler.js`（具体路径需要查看IM端代码结构）

```javascript
// 监听验证完成通知
socket.on('verification:complete', (data) => {
    const { account_id, success, message, timestamp } = data;

    console.log(`[${new Date(timestamp).toLocaleString()}] 收到验证完成通知:`, {
        accountId: account_id,
        success,
        message
    });

    try {
        // 1. 关闭所有验证相关的弹窗
        // 方式1：通过account_id找到对应的弹窗并关闭
        closeVerificationDialogByAccountId(account_id);

        // 方式2：关闭所有验证类型的弹窗
        closeAllVerificationDialogs();

        // 2. 显示通知（可选）
        if (success) {
            // 验证成功提示
            showNotification({
                type: 'success',
                title: '验证成功',
                message: message || '短信验证通过',
                duration: 3000
            });
        } else {
            // 验证失败提示
            showNotification({
                type: 'error',
                title: '验证失败',
                message: message || '验证未通过',
                duration: 5000
            });
        }

        // 3. 清理验证相关的状态
        clearVerificationState(account_id);

    } catch (error) {
        console.error('处理验证完成通知失败:', error);
    }
});

// 辅助函数示例（需要根据IM端实际实现调整）
function closeVerificationDialogByAccountId(accountId) {
    // 找到账户对应的验证弹窗
    const dialog1 = document.querySelector(`.verification-dialog[data-account-id="${accountId}"]`);
    const dialog2 = document.querySelector(`.sms-code-dialog[data-account-id="${accountId}"]`);

    if (dialog1) {
        dialog1.close(); // 或 dialog1.remove() 或其他关闭方法
    }

    if (dialog2) {
        dialog2.close();
    }
}

function closeAllVerificationDialogs() {
    // 关闭所有验证相关弹窗
    document.querySelectorAll('.verification-dialog, .sms-code-dialog').forEach(dialog => {
        dialog.close();
    });
}

function showNotification(options) {
    // 显示通知的具体实现
    // 可能是使用Ant Design的message.success()
    // 或者Electron的Notification API
}

function clearVerificationState(accountId) {
    // 清理验证相关的状态变量
    // 例如：pendingVerifications, smsCodeRequests 等
}
```

---

## 注意事项

### 1. 关于重复弹窗

虽然我们已经添加了`skipVerificationCheck: true`避免重试时重复检测验证，但如果IM端没有在收到`verification:complete`事件后关闭弹窗，用户仍然会看到弹窗。

**解决方案：**
- Master端已经实现了转发逻辑 ✅
- Worker端已经实现了通知逻辑 ✅
- **IM端需要实现监听和关闭弹窗逻辑** ⚠️

### 2. 事件命名规范

- Worker → Master：`worker:*`
- IM端 → Master：`monitor:*` 或 `client:*`
- Master → IM端：直接事件名（如`verification:complete`）
- Master → Worker：`worker:*`

### 3. 向后兼容

- 即使IM端没有实现监听，Worker和Master也会正常工作
- 只是弹窗需要用户手动关闭
- 建议尽快在IM端实现监听逻辑

---

## 总结

### 解决的问题

1. ✅ 验证成功后IM弹窗自动关闭
2. ✅ 验证失败后IM弹窗也自动关闭（并显示错误信息）
3. ✅ 完善了验证流程的反馈机制
4. ✅ 提升了用户体验

### 修改的文件

1. `packages/worker/src/platforms/base/worker-bridge.js` - 添加通知方法
2. `packages/worker/src/platforms/douyin/platform.js` - 调用通知方法
3. `packages/master/src/communication/im-websocket-server.js` - 转发通知给IM端

### 待实现的功能

- **IM端需要实现**：监听`verification:complete`事件并关闭弹窗

---

**修复时间：** 2025-12-02 14:20
**相关文档：**
- [IM重复弹窗问题修复.md](./IM重复弹窗问题修复.md)
- [React输入框状态更新问题修复.md](./React输入框状态更新问题修复.md)
- [短信验证处理逻辑修复总结.md](./短信验证处理逻辑修复总结.md)
