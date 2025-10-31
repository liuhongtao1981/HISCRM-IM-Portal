# 私信会话ID映射问题诊断报告

## 📋 问题描述

PC IM 中显示的私信会话混乱,同一会话中包含多个不同用户的消息。例如"李艳"的会话中出现了"次第花开"、"向阳而生"等其他用户的消息。

## 🔍 根本原因分析

### 问题根源定位

**文件**: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`

**Line 1211-1212**: `generateConversationId()` 函数

```javascript
function generateConversationId(accountId, userIdOrName) {
  // ❌ 问题代码
  if (typeof userIdOrName === 'string' && userIdOrName.startsWith('MS4wLjABAAAA')) {
    return userIdOrName;  // 直接返回 base64 字符串
  }
  // ...
}
```

**原因**: 抖音 API 返回的 `userId` 是 base64 编码字符串(如 `MS4wLjABAAAA7s_CgEi21LWi...`),这个字符串被直接用作 `conversation.id`,然后在 line 805-806 被赋值给所有消息的 `conversation_id`。

### 数据流追踪

1. **API 响应** → 提取 `user_id` (base64 字符串)
2. **Line 303** → `conversation.id = generateConversationId(account.id, userId)`
   - 返回 base64 字符串
3. **Line 305** → `conversation.platform_user_id = userId` (也是 base64 字符串)
4. **Line 806** → `msg.conversation_id = conversation.platform_user_id`
   - ✅ 修复后应该使用纯数字用户 ID

## ✅ 已应用的修复

### 修复 1: 使用 platform_user_id

**文件**: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`
**Line 806**:

```javascript
// ✅ 修复代码
finalMessages.forEach(msg => {
  logger.debug(`[crawlCompleteMessageHistory] 消息 ${msg.platform_message_id} 会话ID: ${msg.conversation_id} -> ${conversation.platform_user_id}`);
  msg.conversation_id = conversation.platform_user_id;  // 使用 platform_user_id
  msg.account_id = account.id;
});
```

### 修复 2: 清除旧快照

已清除 `packages/worker/data/snapshots/` 中的所有旧快照文件,强制 Worker 重新爬取。

## ❌ 修复未生效

### 验证结果

运行 `tests/直接查看Master-DataStore数据.js` 后:

```
总会话数: 10
有问题的会话数: 9
正确率: 10.0%
```

**所有 topicId 仍然是 base64 格式**: `MS4wLjABAAAA...`

### 可能的原因

1. **`platform_user_id` 本身就是 base64 字符串**
   - API 返回的 `userId` 字段值就是 base64 编码
   - 需要确认是否有其他字段包含纯数字用户 ID

2. **数据未重新爬取**
   - Worker 可能从缓存或其他来源加载数据
   - 代码修改未被执行

3. **Master 端转换问题**
   - `im-websocket-server.js` 或 `douyin-data-manager.js` 可能有额外的转换逻辑

## 🔧 下一步诊断

### 方案 1: 检查 API 原始响应

查看抖音 API 返回的原始数据结构,确认是否有纯数字的用户 ID 字段。

**检查位置**:
- `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`
- Line 277-300: API 响应解析逻辑

### 方案 2: 添加详细日志

在关键位置添加日志输出:

```javascript
// Line 305 附近
console.log('=== Conversation Data ===');
console.log('conversation.id:', conversation.id);
console.log('conversation.platform_user_id:', conversation.platform_user_id);
console.log('Original userId from API:', userId);
```

### 方案 3: 使用 senderId 作为 conversationId

对于 **inbound** 消息,发送者 ID 就是对方用户 ID,这个值通常是纯数字。

**修改位置**: Line 806

```javascript
// ✅ 新的修复方案
finalMessages.forEach(msg => {
  // 对于 inbound 消息,使用 senderId
  // 对于 outbound 消息,需要从其他地方获取对方 ID
  if (msg.direction === 'inbound' && msg.platform_sender_id) {
    msg.conversation_id = msg.platform_sender_id;
  } else {
    msg.conversation_id = conversation.platform_user_id;
  }
  msg.account_id = account.id;
});
```

## 📊 测试数据示例

### 问题示例 1: 李艳会话

```
会话 ID: MS4wLjABAAAA7s_CgEi21LWi7hY2roPDpHug-RHN...
消息数: 7
发送者:
  - 李艳（善诚护理服务）: 4 条
  - Me: 1 条
  - 向阳而生: 1 条
  - 次第花开: 1 条  ❌ 不应该出现
```

### 正确示例: 沉年香会话

```
会话 ID: MS4wLjABAAAAgzjGIxQdsGOlWsWZ9-h6lFJbH_SQ...
消息数: 1
发送者:
  - 向阳而生: 1 条  ✅ 正确
```

## 📝 相关文件

- **爬虫**: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`
- **数据映射**: `packages/worker/src/platforms/douyin/douyin-data-manager.js`
- **验证脚本**: `tests/直接查看Master-DataStore数据.js`
- **IM 服务器**: `packages/master/src/communication/im-websocket-server.js`

## 🎯 建议

1. **优先级最高**: 确认 API 响应中是否有纯数字用户 ID 字段
2. **备选方案**: 使用消息的 `senderId` 作为 conversationId (对于 inbound 消息)
3. **最后手段**: 解码 base64 字符串提取用户 ID(如果 base64 包含用户信息)

---

**报告时间**: 2025-10-31 15:12
**状态**: 问题未解决,需要进一步诊断
