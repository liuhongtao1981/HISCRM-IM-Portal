# 私信回复 API 拦截验证指南

> **日期**: 2025-10-20
> **状态**: 📋 待验证
> **类型**: 网络请求拦截验证
> **参考**: 评论回复 API 已验证 ✅

---

## 概述

私信回复功能的 **DOM 和 ID 提取** 已通过验证 ✅，但还需要验证 **API 请求和响应** 以确保：
1. 实际的 API 端点是什么
2. 请求和响应格式
3. 可能的错误情况

---

## 验证目标

通过 Chrome DevTools 网络拦截验证以下内容：

| 项目 | 目标 | 用途 |
|------|------|------|
| API 端点 | 找到实际的 API 地址 | 后续集成和错误处理 |
| 请求格式 | 记录请求体和参数 | 开发实现参考 |
| 响应格式 | 记录成功/失败响应 | 错误检测逻辑 |
| 错误情况 | 记录可能的错误消息 | 实现错误处理 |

---

## 验证步骤

### 第 1 步: 打开 Chrome DevTools

1. 打开创作者中心私信页面:
   ```
   https://creator.douyin.com/creator-micro/data/following/chat
   ```

2. 按 `F12` 打开 DevTools

3. 点击 **Network** 标签

4. 勾选 **Disable cache** (禁用缓存)

### 第 2 步: 清空网络日志

1. 点击 Network 标签中的 🚫 清空按钮
2. 确保只看到新发起的请求

### 第 3 步: 发送私信回复

1. 在私信列表中选择一条消息

2. 点击 **回复** 按钮

3. 输入测试内容:
   ```
   测试私信回复 - Chrome DevTools 验证 [timestamp]
   ```

4. 点击 **发送** 按钮

### 第 4 步: 在 Network 中查找 API 请求

网络日志中应该会出现几个请求，查找以下特征的请求：

**关键词**:
- `message`
- `send`
- `chat`
- `im`
- `v1`
- `v2`

**过滤方法** (在 Network 过滤框输入):
```
/message
```

### 第 5 步: 记录 API 端点

点击请求，记录以下信息：

#### 5.1 请求 URL
```
POST https://creator.douyin.com/...../api/im/v1/message/send
```

⚠️ **关键**: 记录完整的 URL 和端点路径

#### 5.2 请求头 (Headers)
点击 **Request Headers** 标签：

```javascript
{
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
  // ... 其他标头
}
```

#### 5.3 请求体 (Request Body)
点击 **Payload** 标签：

```javascript
{
  "message": "测试私信回复",
  "receiver_id": "123456789",
  "message_id": "0:1:account_id:timestamp",
  // ... 其他参数
}
```

### 第 6 步: 记录成功响应

网络请求完成后，检查 **Response** 标签：

```javascript
{
  "status_code": 0,
  "status_message": "ok",
  "data": {
    "message_id": "...",
    "timestamp": "...",
    // ... 响应数据
  }
}
```

### 第 7 步: 测试错误情况 (可选)

尝试以下场景来记录错误响应：

#### 场景 1: 发送给已删除的联系人
```
预期错误: "联系人不存在" 或 "用户已删除"
```

#### 场景 2: 发送空消息
```
预期错误: "消息内容不能为空"
```

#### 场景 3: 发送超长消息
```
预期错误: "消息长度超过限制"
```

---

## 参考: 评论回复 API (已验证)

为了对比，以下是 **评论回复 API** 的验证结果:

### 评论回复 API 验证结果 ✅

**请求**:
```
POST /aweme/v1/creator/comment/reply/
Content-Type: application/json

{
  "comment_id": "@j/du7rRFQE76t8pb8r3ttsB2pC6VZiryL60pN6xuiK5hkia...",
  "content": "测试回复 - Chrome DevTools verification 2025-10-20",
  "video_id": "@j/du7rRFQE76t8pb8r3ttsB..."
}
```

**成功响应**:
```json
{
  "status_code": 0,
  "status_message": "success",
  "data": {
    "reply_id": "...",
    "comment_id": "...",
    "timestamp": "...",
    "created_time": "..."
  }
}
```

**错误响应** (被拦截):
```json
{
  "status_code": 1,
  "status_message": "error",
  "error_msg": "私密作品无法评论",
  "error_code": 4001
}
```

### API 格式特点:
- 端点: `/aweme/v1/creator/comment/reply/`
- 方法: POST
- 内容类型: application/json
- 响应中包含 `status_code` 和 `status_message`
- 错误时包含 `error_msg` 和 `error_code`

---

## 预期的私信 API 格式

基于抖音的设计模式，私信 API 可能是这样的格式:

```
端点: /im/v1/message/send 或 /chat/v1/message/send
方法: POST
请求体:
{
  "receiver_id": "...",     // 接收者ID
  "message": "...",         // 消息内容
  "message_id": "...",      // 消息ID（可选）
  // ... 其他参数
}

响应:
{
  "status_code": 0,
  "status_message": "success",
  "data": { ... }
}
```

---

## 记录模板

当你完成验证时，请填写以下信息：

```markdown
## 私信 API 验证结果

### 基本信息
- **API 端点**: [记录完整的 URL]
- **请求方法**: POST
- **响应状态**: 200

### 请求格式
```javascript
{
  // 填写请求体结构
}
```

### 成功响应
```javascript
{
  // 填写成功响应格式
}
```

### 错误情况

#### 错误 1: [错误类型]
```javascript
// 错误响应
```

#### 错误 2: [错误类型]
```javascript
// 错误响应
```

### 关键发现
- [发现 1]
- [发现 2]
- [发现 3]
```

---

## 工具建议

### 使用 Chrome DevTools 拦截

**方法 1: 通过 Network 标签** (推荐，简单)
1. 打开 Network 标签
2. 执行操作
3. 查看请求和响应

**方法 2: 通过 Console** (高级)
```javascript
// 拦截所有 fetch 请求
const originalFetch = fetch;
window.fetch = function(...args) {
  console.log('Fetch request:', args[0], args[1]);
  return originalFetch.apply(this, args);
};
```

**方法 3: 通过 MCP (推荐快速)**
```javascript
// 使用 Claude Code 的 MCP 工具来验证 API
// 自动化拦截和记录
```

---

## 后续步骤

### 一旦获得 API 信息后:

1. **更新 platform.js**
   ```javascript
   async replyToDirectMessage(accountId, options) {
     // 使用实际的 API 端点
     const response = await fetch(
       'https://creator.douyin.com/actual/api/endpoint',
       { ... }
     );
   }
   ```

2. **实现错误检测**
   ```javascript
   if (response.data.status_code !== 0) {
     return {
       success: false,
       status: 'blocked',
       reason: response.data.error_msg
     };
   }
   ```

3. **添加到单元测试**
   ```javascript
   test('Should detect blocked direct message', () => {
     // 使用实际的 API 端点进行测试
   });
   ```

---

## 常见问题

### Q1: 如果没有看到 API 请求怎么办？

**A**:
1. 确保 Network 标签已清空
2. 确保 "Disable cache" 已勾选
3. 检查是否是 WebSocket 连接 (查看 WS 标签)
4. 尝试在控制台中查看 `fetch` 或 `XMLHttpRequest` 调用

### Q2: 看到了多个请求，哪个是发送消息的？

**A**:
1. 查找 **响应状态为 200-201** 的请求
2. 查找 **包含消息内容** 的请求体
3. 通常最后一个相关的请求就是发送请求

### Q3: 如何确认错误响应？

**A**:
1. 查看 **Response Body**
2. 查找 `error`、`error_code`、`error_msg` 等字段
3. 查找 `status_code !== 0` 的情况

---

## 完成检查清单

- [ ] 打开创作者中心私信页面
- [ ] 打开 Chrome DevTools Network 标签
- [ ] 清空网络日志
- [ ] 发送一条私信
- [ ] 找到 API 请求
- [ ] 记录请求 URL
- [ ] 记录请求头
- [ ] 记录请求体
- [ ] 记录响应格式
- [ ] 测试错误情况 (可选)
- [ ] 填写验证结果模板
- [ ] 提交验证结果

---

## 预期输出

完成后，应该有以下文档：

```
DIRECT_MESSAGE_API_VERIFICATION_RESULT.md
  ├─ API 端点定义
  ├─ 请求/响应格式
  ├─ 错误代码映射
  ├─ 实现建议
  └─ 与评论 API 的对比
```

---

## 参考资源

- 📖 [COMMENT_REPLY_DEVELOPMENT_GUIDE.md](./COMMENT_REPLY_DEVELOPMENT_GUIDE.md) - 评论回复开发指南
- 📋 [CHROME_DEVTOOLS_VERIFICATION_REPORT.md](./CHROME_DEVTOOLS_VERIFICATION_REPORT.md) - 元素验证报告
- 🔗 [ERROR_HANDLING_IMPLEMENTATION_SUMMARY.md](./ERROR_HANDLING_IMPLEMENTATION_SUMMARY.md) - 错误处理设计

---

**📌 状态**: 等待手动验证
**⏱️ 预计时间**: 15-20 分钟
**✅ 优先级**: P0 (评论回复之后立即进行)

