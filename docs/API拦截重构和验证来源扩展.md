# API 拦截重构和验证来源扩展

**修复时间**: 2025-12-02
**修复类型**: 🔧 代码重构 + 🚀 功能扩展
**影响文件**: 3 个文件

---

## 修复概述

### 1. API 拦截重构

**问题**: `send-reply-to-comment-video-detail.js` 中通过页面注入方式 (`setupAPIInterceptor`) 重复拦截 API，与 `platform.js` 中统一注册的 `onCommentPublishAPI` 产生冲突。

**解决方案**: 删除页面注入的拦截器，改用 Playwright 的 `page.waitForResponse` 等待 API 响应。

---

### 2. 验证来源扩展

**需求**: 为了支持未来多平台、多场景的验证扩展，添加 `source` (验证来源) 和 `platform` (平台标识) 字段。

**解决方案**: 在验证请求消息中添加这两个标识字段，便于 IM 端区分不同场景的验证。

---

## 代码变更详情

### 1. 删除重复的 API 拦截器

#### 文件: `send-reply-to-comment-video-detail.js`

**删除内容**:
- `setupAPIInterceptor()` 函数 (Lines 227-330，约 100 行代码)
- 页面注入的 XHR/Fetch 拦截逻辑

**原因**:
1. 与 `platform.js` 中统一注册的 `onCommentPublishAPI` 重复
2. 页面注入方式不够可靠，且难以维护
3. Playwright 提供了更好的 Response 监听机制

**删除的代码逻辑**:
```javascript
// ❌ 删除：页面注入的拦截器
await page.evaluate(() => {
    window.__commentAPIData = { requests: [], responses: [] };

    // 拦截 XMLHttpRequest
    XMLHttpRequest.prototype.send = function(body) {
        // ... 拦截逻辑
    };

    // 拦截 fetch
    window.fetch = function(...args) {
        // ... 拦截逻辑
    };
});
```

---

### 2. 使用 Playwright Response 监听

#### 修改: `waitForAPIResponse()` 函数

**原实现** (依赖页面注入):
```javascript
async function waitForAPIResponse(page, interceptorData, timeout = 10000) {
    while (Date.now() - startTime < timeout) {
        await page.waitForTimeout(500);

        // ❌ 从页面获取注入的数据
        const capturedData = await page.evaluate(() => {
            return window.__commentAPIData || { requests: [], responses: [] };
        });

        if (capturedData.responses.length > 0) {
            // 处理响应
        }
    }
}
```

**新实现** (使用 Playwright):
```javascript
async function waitForAPIResponse(page, timeout = 10000) {
    try {
        // ✅ 使用 Playwright 的 waitForResponse
        const response = await page.waitForResponse(
            (resp) => resp.url().includes('/comment/publish') && resp.request().method() === 'POST',
            { timeout }
        );

        const status = response.status();
        const responseBody = await response.json();

        // 验证响应
        if (status === 200 && responseBody.status_code === 0) {
            const comment = responseBody.comment;
            if (comment && comment.status === 7) {
                return {
                    success: true,
                    data: {
                        commentId: comment.cid,
                        // ...
                    }
                };
            }
        }
    } catch (timeoutError) {
        return {
            success: false,
            error: '等待API响应超时'
        };
    }
}
```

**改进点**:
1. ✅ 不再依赖页面注入，更可靠
2. ✅ 代码更简洁（从 80 行减少到 70 行）
3. ✅ 与 `onCommentPublishAPI` 使用相同的机制，保持一致性
4. ✅ 自动处理超时，无需轮询

---

#### 修改: 主流程

**原代码**:
```javascript
// ❌ 删除：设置 API 拦截器
logger.info('📍 [步骤2] 设置API拦截器...');
const apiInterceptor = await setupAPIInterceptor(page);
logger.info('📍 [步骤2] ✅ API拦截器已设置');

// ...

// ❌ 删除：传递 interceptorData 参数
const apiResult = await waitForAPIResponse(page, apiInterceptor, 10000);
```

**新代码**:
```javascript
// ✅ 简化：API 拦截器由 platform.js 统一管理
logger.info('📍 [步骤2] API拦截器已由平台统一管理');

// ...

// ✅ 简化：不再需要 interceptorData 参数
const apiResult = await waitForAPIResponse(page, 10000);
```

---

### 3. 添加验证来源标识

#### 文件: `send-reply-to-comment-video-detail.js`

**修改**: `verificationError.verificationInfo` 对象

```javascript
const verificationError = new Error('VERIFICATION_REQUIRED');
verificationError.code = 'VERIFICATION_REQUIRED';
verificationError.verificationInfo = {
    source: 'douyin_comment_reply',  // ⭐ 新增：验证来源
    platform: 'douyin',              // ⭐ 新增：平台标识
    type: verificationResult.type,
    phoneNumber: verificationResult.phoneNumber,
    message: verificationResult.message,
    hasSendSMSButton: verificationResult.hasSendSMSButton,
    hasQRCodeOption: verificationResult.hasQRCodeOption,
    accountId,
    awemeId,
    commentLevel,
    replyContent
};
```

**字段说明**:
- `source`: 验证来源，格式 `{platform}_{operation}_{detail}`
  - 当前值: `'douyin_comment_reply'` (抖音评论回复)
  - 未来扩展: `'douyin_dm_send'`, `'douyin_login'`, `'xiaohongshu_comment_reply'` 等
- `platform`: 平台标识
  - 当前值: `'douyin'` (抖音)
  - 未来扩展: `'xiaohongshu'`, `'weibo'`, `'wechat'` 等

---

#### 文件: `worker-bridge.js`

**修改**: `requestVerification()` 方法

```javascript
async requestVerification(accountId, verificationInfo, onUserChoice) {
    // ...

    this.socket.emit('worker:verification:request', {
        request_id: requestId,
        account_id: accountId,
        source: verificationInfo.source || 'unknown',        // ⭐ 新增
        platform: verificationInfo.platform || 'unknown',    // ⭐ 新增
        verification_type: verificationInfo.type,
        message: verificationInfo.message,
        phone_number: verificationInfo.phoneNumber,
        has_sms_button: verificationInfo.hasSendSMSButton,
        has_qrcode_option: verificationInfo.hasQRCodeOption,
        context: {
            aweme_id: verificationInfo.awemeId,
            comment_level: verificationInfo.commentLevel,
            reply_content: verificationInfo.replyContent
        },
        timestamp: Date.now(),
    });

    logger.info(`Verification request sent for account ${accountId}, source: ${verificationInfo.source}, platform: ${verificationInfo.platform}, type: ${verificationInfo.type}`);
}
```

**日志输出示例**:
```
Verification request sent for account acc-xxx, source: douyin_comment_reply, platform: douyin, type: sms
```

---

#### 文件: `socket-server.js` (Master 端)

**修改**: Worker 验证请求监听器

```javascript
socket.on('worker:verification:request', async (data) => {
    logger.info(`Worker ${socket.id} verification request:`, {
        requestId: data.request_id,
        accountId: data.account_id,
        source: data.source,              // ⭐ 新增日志
        platform: data.platform,          // ⭐ 新增日志
        verificationType: data.verification_type,
        phoneNumber: data.phone_number
    });

    try {
        const clientNamespace = io.of('/client');
        clientNamespace.emit('verification:request', {
            request_id: data.request_id,
            account_id: data.account_id,
            source: data.source,            // ⭐ 转发给 IM 端
            platform: data.platform,        // ⭐ 转发给 IM 端
            verification_type: data.verification_type,
            message: data.message,
            phone_number: data.phone_number,
            has_sms_button: data.has_sms_button,
            has_qrcode_option: data.has_qrcode_option,
            context: data.context,
            timestamp: data.timestamp
        });

        logger.info(`Verification request forwarded to IM client, request_id: ${data.request_id}, source: ${data.source}, platform: ${data.platform}`);
    } catch (error) {
        logger.error('Failed to forward verification request:', error);
    }
});
```

**日志输出示例**:
```
Worker {socket_id} verification request: { requestId, accountId, source: 'douyin_comment_reply', platform: 'douyin', ... }
Verification request forwarded to IM client, request_id: verify_acc-xxx_xxx, source: douyin_comment_reply, platform: douyin
```

---

## API 拦截架构对比

### 修改前（重复拦截）

```
评论发布流程
  ↓
点击发送按钮
  ↓
[页面注入拦截器] ← setupAPIInterceptor (重复1)
  ├─ XHR 拦截
  ├─ Fetch 拦截
  └─ window.__commentAPIData
  ↓
抖音服务器
  ↓
[Playwright 拦截器] ← onCommentPublishAPI (重复2)
  └─ APIInterceptorManager
  ↓
waitForAPIResponse 从 window.__commentAPIData 读取
```

**问题**:
- ❌ 两个拦截器重复拦截同一个 API
- ❌ 页面注入方式不够可靠
- ❌ 维护两套拦截逻辑

---

### 修改后（统一拦截）

```
评论发布流程
  ↓
点击发送按钮
  ↓
抖音服务器
  ↓
[Playwright 拦截器] ← onCommentPublishAPI (统一)
  └─ APIInterceptorManager.register('**/comment/publish**')
  ↓
waitForAPIResponse 使用 page.waitForResponse
```

**优势**:
- ✅ 单一拦截器，避免重复
- ✅ 使用 Playwright 原生机制，更可靠
- ✅ 代码更简洁，易维护

---

## 消息格式变更

### Worker → Master (`worker:verification:request`)

**新增字段**:
```json
{
  "request_id": "verify_acc-xxx_1701511234567",
  "account_id": "acc-xxx",
  "source": "douyin_comment_reply",     // ⭐ 新增
  "platform": "douyin",                  // ⭐ 新增
  "verification_type": "sms",
  "message": "为确保是本人操作抖音账号...",
  "phone_number": "198******35",
  "has_sms_button": true,
  "has_qrcode_option": true,
  "context": { ... },
  "timestamp": 1701511234567
}
```

### Master → IM 端 (`verification:request`)

**新增字段**:
```json
{
  "request_id": "verify_acc-xxx_1701511234567",
  "account_id": "acc-xxx",
  "source": "douyin_comment_reply",     // ⭐ 新增
  "platform": "douyin",                  // ⭐ 新增
  "verification_type": "sms",
  "message": "为确保是本人操作抖音账号...",
  // ... 其他字段
}
```

---

## IM 端集成建议

### 1. 根据来源显示不同标题

```javascript
socket.on('verification:request', (data) => {
  const { source, platform, message } = data;

  const title = getVerificationTitle(source);
  const icon = getPlatformIcon(platform);

  showVerificationDialog({
    title: `${icon} ${title}`,
    message,
    ...data
  });
});

function getVerificationTitle(source) {
  const titles = {
    'douyin_comment_reply': '抖音评论验证',
    'douyin_dm_send': '抖音私信验证',
    'douyin_login': '抖音登录验证',
    'xiaohongshu_comment_reply': '小红书评论验证',
    // ... 更多
  };
  return titles[source] || '验证提示';
}

function getPlatformIcon(platform) {
  const icons = {
    'douyin': '🎵',
    'xiaohongshu': '📕',
    'weibo': '📰',
    // ... 更多
  };
  return icons[platform] || '⚠️';
}
```

### 2. 统计不同来源的验证频率

```javascript
const verificationStats = {};

socket.on('verification:request', (data) => {
  const { source } = data;

  // 统计
  verificationStats[source] = (verificationStats[source] || 0) + 1;

  console.log('验证统计:', verificationStats);
  // 输出: { douyin_comment_reply: 5, douyin_dm_send: 2 }
});
```

---

## 向后兼容性

### Worker 端

如果旧版本的 Worker 未提供 `source` 或 `platform` 字段，使用默认值：

```javascript
source: verificationInfo.source || 'unknown',
platform: verificationInfo.platform || 'unknown',
```

### IM 端

IM 端应检查这两个字段是否存在：

```javascript
socket.on('verification:request', (data) => {
  const source = data.source || 'unknown';
  const platform = data.platform || 'unknown';

  if (source === 'unknown') {
    console.warn('Unknown verification source, using default UI');
  }

  showVerificationDialog(data);
});
```

---

## 未来扩展示例

### 1. 抖音私信发送验证

```javascript
// Worker 端
const verificationError = new Error('VERIFICATION_REQUIRED');
verificationError.verificationInfo = {
  source: 'douyin_dm_send',      // 私信发送
  platform: 'douyin',
  type: 'sms',
  message: '频繁发送私信，请验证身份',
  // ...
};
```

### 2. 小红书评论回复验证

```javascript
// Worker 端
const verificationError = new Error('VERIFICATION_REQUIRED');
verificationError.verificationInfo = {
  source: 'xiaohongshu_comment_reply',  // 小红书评论
  platform: 'xiaohongshu',
  type: 'qrcode',
  message: '请使用小红书APP扫描二维码',
  // ...
};
```

### 3. 抖音登录验证

```javascript
// Worker 端
const verificationError = new Error('VERIFICATION_REQUIRED');
verificationError.verificationInfo = {
  source: 'douyin_login',        // 登录验证
  platform: 'douyin',
  type: 'qrcode',
  message: '请扫描二维码登录',
  // ...
};
```

---

## 测试建议

### 1. API 拦截测试

```bash
# 1. 启动 Worker
cd packages/worker
npm start

# 2. 触发评论发送
# 预期：
# - 日志显示 "API拦截器已由平台统一管理"
# - 不再显示 "API拦截器注入成功"
# - waitForAPIResponse 正常获取响应
```

### 2. 验证来源测试

```bash
# 1. 触发验证
# 预期日志：
Worker {socket_id} verification request: { source: 'douyin_comment_reply', platform: 'douyin', ... }
Verification request forwarded to IM client, source: douyin_comment_reply, platform: douyin
```

---

## 相关文档

- [验证来源标识规范.md](./验证来源标识规范.md) - 验证来源和平台标识定义
- [抖音评论验证检测功能实现.md](./抖音评论验证检测功能实现.md) - 验证检测实现
- [IM端验证弹窗集成指南.md](./IM端验证弹窗集成指南.md) - IM 端集成指南

---

## 总结

### 完成的改进

1. ✅ **删除重复的 API 拦截器**
   - 删除页面注入的 `setupAPIInterceptor` 函数
   - 改用 Playwright 的 `page.waitForResponse`
   - 代码减少约 100 行

2. ✅ **添加验证来源标识**
   - Worker 端添加 `source` 和 `platform` 字段
   - Master 端转发这两个字段
   - 创建验证来源规范文档

3. ✅ **改进日志输出**
   - 所有验证相关日志包含 `source` 和 `platform` 信息
   - 便于追踪和调试

### 改进效果

- 🎯 **代码更简洁** - 删除重复代码，统一 API 拦截机制
- 🎯 **更易维护** - 单一拦截器，避免逻辑分散
- 🎯 **更易扩展** - 验证来源标识支持未来多平台扩展
- 🎯 **更好的可追踪性** - 详细的日志输出，便于问题排查

---

**修复时间**: 2025-12-02
**代码变更**: 3 个文件
**删除代码**: 约 100 行 (setupAPIInterceptor)
**新增字段**: 2 个 (source, platform)
**功能状态**: ✅ 已完成，待测试验证
