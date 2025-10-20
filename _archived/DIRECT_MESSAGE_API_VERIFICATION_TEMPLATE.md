# 私信 API 拦截验证结果 - 记录模板

> **验证日期**: [在此填写验证日期]
> **验证者**: [在此填写验证者名称]
> **状态**: 📋 待完成

---

## 基本信息

### API 端点

**完整 URL**:
```
POST https://creator.douyin.com/...
```

**简化路径**:
```
/im/v1/message/send
```

或

```
/chat/v1/message/send
```

或

```
[在此填写实际的路径]
```

### HTTP 方法
```
POST
```

### 响应状态码
```
200
```

---

## 请求格式分析

### 请求头 (Headers)

```javascript
{
  "Content-Type": "application/json",
  "Accept": "application/json",
  "X-Requested-With": "XMLHttpRequest",
  // [在此添加其他请求头]
}
```

### 请求体 (Request Payload)

```javascript
{
  // [在此粘贴完整的请求体]
}
```

**参数说明**:

| 参数名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| [参数1] | string | [说明] | [示例] |
| [参数2] | number | [说明] | [示例] |
| [参数3] | object | [说明] | {} |

---

## 响应格式分析

### 成功响应 (Status 200, status_code 0)

```javascript
{
  // [在此粘贴成功响应体]
}
```

**响应字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| status_code | number | 状态码 (0 = 成功) |
| status_message | string | 状态消息 |
| data | object | 响应数据 |
| data.message_id | string | 发送的消息 ID |
| data.timestamp | number | 时间戳 |

---

## 错误情况分析

### 错误 1: [错误类型] ❌

**触发方式**: [描述如何触发该错误]

**错误响应**:
```javascript
{
  // [粘贴错误响应]
}
```

**错误特征**:
- **Error Code**: [错误代码]
- **Error Message**: [错误消息]
- **HTTP Status**: [HTTP 状态码]

**可能原因**: [分析为什么会出现这个错误]

**在代码中的处理**:
```javascript
if (response.data.error_code === XXX) {
  return {
    success: false,
    status: '[blocked|error]',
    reason: response.data.error_msg
  };
}
```

---

### 错误 2: [错误类型] ❌

**触发方式**: [描述如何触发该错误]

**错误响应**:
```javascript
{
  // [粘贴错误响应]
}
```

**错误特征**:
- **Error Code**: [错误代码]
- **Error Message**: [错误消息]
- **HTTP Status**: [HTTP 状态码]

**可能原因**: [分析为什么会出现这个错误]

**在代码中的处理**:
```javascript
if (response.data.error_code === XXX) {
  return {
    success: false,
    status: '[blocked|error]',
    reason: response.data.error_msg
  };
}
```

---

### 错误 3: [错误类型] ❌

**触发方式**: [描述如何触发该错误]

**错误响应**:
```javascript
{
  // [粘贴错误响应]
}
```

**错误特征**:
- **Error Code**: [错误代码]
- **Error Message**: [错误消息]
- **HTTP Status**: [HTTP 状态码]

**可能原因**: [分析为什么会出现这个错误]

**在代码中的处理**:
```javascript
if (response.data.error_code === XXX) {
  return {
    success: false,
    status: '[blocked|error]',
    reason: response.data.error_msg
  };
}
```

---

## 与评论 API 的对比

### 相似点 ✅

- [ ] 都使用 POST 方法
- [ ] 都使用 application/json 格式
- [ ] 响应格式类似
- [ ] 都有 status_code 字段
- [ ] 都有错误消息字段

### 差异点 ❌

| 项目 | 评论 API | 私信 API |
|------|---------|---------|
| 端点 | `/aweme/v1/creator/comment/reply/` | [填写] |
| 身份验证 | [说明] | [说明] |
| 参数格式 | [说明] | [说明] |
| 错误代码 | [列举] | [列举] |

---

## 错误代码映射表

根据私信 API 的所有错误情况，创建完整的映射表：

| 错误代码 | 错误消息 | 状态 | 说明 |
|---------|----------|------|------|
| 0 | success | ✅ success | 成功 |
| 1 | [消息] | ❌ failed | [说明] |
| 2 | [消息] | ❌ blocked | [说明] |
| 3 | [消息] | ❌ error | [说明] |
| ... | ... | ... | ... |

---

## 实现建议

### 在 platform.js 中的实现

```javascript
async replyToDirectMessage(accountId, options) {
  const { target_id, reply_content, context, browserManager } = options;

  try {
    const page = await browserManager.getPage(accountId);

    // 1. 导航到私信页面
    await page.goto('[私信页面URL]', { waitUntil: 'networkidle2' });

    // 2. 找到目标消息
    // ... [消息查找逻辑，基于已验证的方法]

    // 3. 点击回复按钮
    // ... [回复按钮点击]

    // 4. 输入内容并发送
    // ... [输入和发送]

    // 5. 发出 API 请求 (通过网页自动发送)
    // 或者直接调用 API:
    const response = await page.evaluate(async (content, messageId) => {
      return fetch('[实际的 API 端点]', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // [其他必要的请求头]
        },
        body: JSON.stringify({
          message: content,
          message_id: messageId,
          // [其他必要的参数]
        })
      }).then(r => r.json());
    }, reply_content, target_id);

    // 6. 检查响应
    if (response.status_code === 0) {
      // 成功
      return {
        success: true,
        platform_reply_id: response.data.message_id,
        data: { ... }
      };
    } else if (response.status_code === [错误代码]) {
      // 被拦截
      return {
        success: false,
        status: 'blocked',
        reason: response.error_msg
      };
    } else {
      // 其他错误
      throw new Error(response.error_msg);
    }

  } catch (error) {
    throw error;
  }
}
```

---

## 测试用例

### Unit Test 示例

```javascript
test('Should send direct message successfully', async () => {
  const result = await platform.replyToDirectMessage('account-id', {
    target_id: '0:1:106228603660:1810217601082548',
    reply_content: '测试私信',
    context: {},
    browserManager
  });

  expect(result.success).toBe(true);
  expect(result.platform_reply_id).toBeDefined();
});

test('Should detect blocked direct message', async () => {
  // [设置条件触发错误]

  const result = await platform.replyToDirectMessage('account-id', {
    target_id: '[某个被拦截的消息]',
    reply_content: '测试',
    context: {},
    browserManager
  });

  expect(result.success).toBe(false);
  expect(result.status).toBe('blocked');
  expect(result.reason).toBeDefined();
});
```

---

## 关键发现

### 1. 🔍 API 设计模式

[描述私信 API 遵循的设计模式]

### 2. 📊 参数映射关系

[描述参数如何映射]

### 3. ⚠️ 特殊情况处理

[列举需要特殊处理的情况]

### 4. 🔐 安全性考虑

[描述是否需要特殊的安全处理]

---

## 与现有代码的兼容性

### 与 ReplyExecutor 的兼容性

当前的 `ReplyExecutor` 期望以下返回格式：

```javascript
{
  success: true/false,
  platform_reply_id: string,  // 成功时
  status: 'blocked'|'error',  // 失败时
  reason: string,             // 失败原因
  data: object
}
```

**兼容性检查**:
- [ ] 成功格式匹配
- [ ] 失败格式匹配
- [ ] 错误代码能正确映射到 'blocked'/'error'
- [ ] reason 字段能从 API 错误消息中提取

---

## 后续任务

完成此验证后的后续步骤：

1. [ ] 更新 `replyToDirectMessage()` 实现
2. [ ] 编写单元测试
3. [ ] 编写集成测试
4. [ ] 测试环境验证
5. [ ] 生产环境灰度发布

---

## 签名

- **验证完成时间**: _______________
- **验证者**: _______________
- **审核者**: _______________
- **审核完成时间**: _______________

---

## 附注

[在此添加任何其他需要记录的信息]

