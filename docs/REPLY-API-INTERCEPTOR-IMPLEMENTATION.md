# 回复功能 API 拦截验证实现

> 📍 本文档记录为回复功能添加 API 拦截验证的实现

---

## 问题

**原始方法的局限**:
- 只通过 DOM 检查错误消息来判断回复是否成功
- 无法确认 API 是否真的接收了回复
- 无法获取服务器返回的 `reply_id`
- 容易误判（DOM 中可能没有实时的错误提示）

---

## 解决方案：API 拦截验证

### 架构设计

```
用户点击发送
    ↓
发送 HTTP 请求到 /aweme/v1/creator/comment/reply/
    ↓
【新增】MCP 拦截 API 响应 ← API 拦截器
    ↓
检查 status_code 和 reply_id
    ↓
返回成功结果（包含真实的 reply_id）
```

### 验证流程

#### 第 1 步：设置 API 拦截器

```javascript
// 在页面导航后立即设置
const apiResponses = {
  replySuccess: null,
  replyError: null
};

const apiInterceptHandler = async (response) => {
  const url = response.url();
  const status = response.status();

  // 匹配回复 API
  if (url.includes('comment/reply') && status === 200) {
    try {
      const json = await response.json();

      // 检查返回的状态
      if (json.status_code === 0 || json.data?.reply_id) {
        apiResponses.replySuccess = {
          timestamp: Date.now(),
          url,
          status,
          data: json
        };
        logger.debug(`✅ Reply API success: reply_id=${json.data?.reply_id}`);
      } else if (json.status_code !== 0) {
        apiResponses.replyError = {
          timestamp: Date.now(),
          url,
          status,
          status_code: json.status_code,
          error_msg: json.error_msg || json.message,
          data: json
        };
        logger.warn(`❌ Reply API error: ${json.error_msg}`);
      }
    } catch (e) {
      logger.debug('Failed to parse reply API response');
    }
  }
};

page.on('response', apiInterceptHandler);
```

#### 第 2 步：发送回复并等待 API 响应

```javascript
// 1. 点击发送按钮
await submitBtn.click();

// 2. 等待 API 响应（最多 5 秒）
let waitCount = 0;
const maxWait = 50; // 50 × 100ms = 5 秒

while (
  !apiResponses.replySuccess &&
  !apiResponses.replyError &&
  waitCount < maxWait
) {
  await page.waitForTimeout(100);
  waitCount++;
}
```

#### 第 3 步：根据 API 响应返回结果

```javascript
// 如果 API 返回成功
if (apiResponses.replySuccess) {
  return {
    success: true,
    platform_reply_id: apiResponses.replySuccess.data?.data?.reply_id,
    data: {
      comment_id: target_id,
      reply_content,
      api_status_code: apiResponses.replySuccess.data?.status_code,
      api_response: apiResponses.replySuccess.data,
      timestamp: new Date().toISOString(),
    },
  };
}

// 如果 API 返回错误
if (apiResponses.replyError) {
  return {
    success: false,
    status: 'blocked',
    reason: apiResponses.replyError.error_msg,
    data: {
      comment_id: target_id,
      reply_content,
      api_status_code: apiResponses.replyError.status_code,
      api_error_msg: apiResponses.replyError.error_msg,
      timestamp: new Date().toISOString(),
    },
  };
}

// 如果没有拦截到 API 响应（回退到 DOM 检查）
// 这作为备选方案，确保在网络问题时仍能处理
```

---

## API 规范

### 回复 API 端点

| 属性 | 值 |
|------|-----|
| **URL** | `POST /aweme/v1/creator/comment/reply/` |
| **服务器** | `creator.douyin.com` |
| **协议** | HTTPS |

### 成功响应示例

```json
{
  "status_code": 0,
  "data": {
    "reply_id": "7432506851234567890",
    "create_time": 1697856000,
    "author_id": "12345678",
    "content": "这是一条回复"
  },
  "message": "success"
}
```

### 错误响应示例

```json
{
  "status_code": -1,
  "error_msg": "回复过于频繁，请稍后再试",
  "data": null
}
```

---

## 改进点对比

### 原始方法 vs 新方法

| 方面 | 原始方法 | 新方法 |
|------|---------|--------|
| **验证方式** | DOM 错误检查 | API 响应拦截 + 备选 DOM 检查 |
| **准确性** | 中等（可能误判） | 高（来自服务器确认） |
| **reply_id** | 自生成（可能重复） | 服务器返回（唯一） |
| **错误信息** | 页面显示的文本 | 服务器返回的结构化错误 |
| **延迟** | ~2 秒等待 | ~100ms-5 秒 |
| **网络问题** | 失败 | 有备选方案 |

### 日志示例

**成功情况**:
```
Setting up API interceptor for reply validation
API interceptor enabled for reply tracking
Waiting for reply API response...
✅ Intercepted reply API response {
  url: "https://creator.douyin.com/aweme/v1/creator/comment/reply/",
  status: 200,
  responseKeys: ["status_code", "data", "message"]
}
Reply API success: reply_id=7432506851234567890
✅ Reply API response success {
  commentId: "target_id_xxx",
  apiData: { status_code: 0, data: { reply_id: "..." } }
}
```

**备选 DOM 检查**:
```
No reply API response intercepted, falling back to DOM error check
Reply submitted successfully (fallback: no errors detected)
```

---

## 实现细节

### 文件位置

`packages/worker/src/platforms/douyin/platform.js`

### 修改部分

1. **第 2380-2430 行**: 添加 API 拦截器设置
2. **第 2726-2877 行**: 修改回复验证逻辑

### 关键变量

```javascript
const apiResponses = {
  replySuccess: null,  // 成功响应存储位置
  replyError: null     // 错误响应存储位置
};
```

### 拦截条件

- `url.includes('comment/reply')` - 匹配回复 API 端点
- `status === 200` - 只处理 HTTP 200 响应
- `json.status_code === 0 || json.data?.reply_id` - 服务器返回成功
- `json.status_code !== 0` - 服务器返回错误

---

## 测试场景

### 场景 1：成功回复

```
预期: API 返回 status_code=0 和 reply_id
实际: ✅ 拦截到成功响应
结果: 返回 success=true，platform_reply_id 为服务器返回值
```

### 场景 2：频率限制

```
预期: API 返回 status_code=-1，error_msg="回复过于频繁"
实际: ✅ 拦截到错误响应
结果: 返回 success=false，status='blocked'
```

### 场景 3：网络延迟

```
预期: API 响应延迟超过 5 秒
实际: 等待超时，退回到 DOM 检查
结果: 使用备选方案继续处理
```

### 场景 4：API 未触发

```
预期: 页面加载但 API 未调用（罕见）
实际: 等待 5 秒超时
结果: 使用 DOM 检查作为最后备选
```

---

## 优势

✅ **更可靠**
- 直接从服务器获取反馈，而不依赖 DOM 状态

✅ **更准确**
- 获取真实的 `reply_id`，避免自生成 ID 的重复问题

✅ **更详细**
- 获取结构化的错误信息，便于后续处理

✅ **容错设计**
- 有备选方案（DOM 检查），防止网络问题导致完全失败

✅ **可观测性**
- 详细的日志记录，便于调试

---

## 后续改进

### 建议 1：拦截私信回复 API

类似的改进可以应用到私信回复功能，拦截 `/v1/message/send` API。

### 建议 2：缓存 API 端点

```javascript
const REPLY_API_PATTERNS = {
  comment: 'comment/reply',
  directMessage: '/v1/message/send'
};
```

### 建议 3：重试机制

如果 API 返回错误，可以添加智能重试逻辑：

```javascript
if (apiResponses.replyError) {
  const shouldRetry = isTemporaryError(apiResponses.replyError.status_code);
  if (shouldRetry) {
    // 等待后重试
  }
}
```

---

## 总结

API 拦截验证为回复功能提供了更可靠的成功确认机制，同时保留了 DOM 检查作为备选方案，确保在各种网络条件下都能正常工作。

