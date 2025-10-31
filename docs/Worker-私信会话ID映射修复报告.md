# Worker 私信会话 ID 映射修复报告

**日期**: 2025-10-31
**问题**: PC IM 中私信消息混乱，不同用户的消息出现在错误的会话中
**严重程度**: 🔴 严重

---

## 问题描述

### 症状

在 PC IM (CRM-PC-IM) 中查看私信时，发现以下严重问题：

1. **李艳（善诚护理服务）** 的会话中混入了：
   - 向阳而生的消息
   - 次第花开的消息

2. **沉年香** 的会话中显示的消息实际来自：
   - Tommy（3条）
   - 向阳而生（3条）
   - 王大牛（1条）
   - **而且所有消息的 topicId 都是 Tommy 的会话 ID！**

3. **几乎所有私信会话都混乱**：10个私信会话中有8个出现了多个不同用户的消息

---

## 根本原因

### 代码问题

**文件**: `packages/worker/src/platforms/douyin/douyin-data-manager.js`

**问题代码** (line 73):

```javascript
conversationId: String(douyinData.conversation_id),  // ❌ 如果 API 没有此字段，变成 "undefined"
```

**问题分析**：

1. 抖音 API 返回的消息数据中，**有些消息没有 `conversation_id` 字段**
2. 当 `douyinData.conversation_id` 为 `undefined` 时，`String(undefined)` 返回 `"undefined"`
3. 所有缺少 `conversation_id` 的消息都被赋予相同的值 `"undefined"`
4. 导致不同用户的消息被错误地归类到同一个会话中

---

## 修复方案

### 核心思路

当 API 数据缺少 `conversation_id` 时，根据消息方向（incoming/outgoing）和发送者/接收者 ID 推断正确的会话 ID：

- **收到的消息** (incoming): `conversation_id` = 发送者的 `user_id`
- **发出的消息** (outgoing): `conversation_id` = 接收者的 `user_id`

### 修复代码

```javascript
mapMessageData(douyinData) {
  // 发送者和接收者 ID
  const senderId = String(douyinData.sender_id || douyinData.from_user_id);
  const recipientId = String(douyinData.recipient_id || douyinData.to_user_id);

  // ✅ 修复：如果消息数据没有 conversation_id，则通过发送者/接收者 ID 推断
  let conversationId = douyinData.conversation_id;

  if (!conversationId || conversationId === 'undefined') {
    const direction = douyinData.direction || 'incoming';

    if (direction === 'incoming') {
      conversationId = senderId;  // 收到的消息：用发送者 ID
    } else {
      conversationId = recipientId;  // 发出的消息：用接收者 ID
    }
  }

  return {
    messageId: String(douyinData.message_id || douyinData.msg_id || `msg_${Date.now()}`),
    conversationId: String(conversationId),  // ✅ 总是有正确的 conversation_id
    // ...
  };
}
```

---

## 验证步骤

### 1. 清理旧数据

由于数据库中已存在错误数据，需要清理：

```bash
cd packages/master
npm run clean:db
```

### 2. 重启服务

```bash
cd packages/master
npm start  # 会自动启动 Worker
```

### 3. 验证修复

运行验证脚本：

```bash
node tests/检查私信会话ID映射.js
```

**期望结果**：每个会话只有一个非客服的发送者

### 4. PC IM 界面验证

1. 打开 PC IM: http://localhost:5173
2. 切换到"私信"Tab
3. 点击任意会话
4. 确认只显示该会话对方用户的消息

---

## 总结

| 项目 | 内容 |
|------|------|
| **问题** | Worker 爬取私信时 conversation_id 映射错误 |
| **根本原因** | API 数据缺少 conversation_id 字段，使用 `String(undefined)` 导致错误 |
| **修复方案** | 根据消息方向和发送者/接收者 ID 推断正确的 conversation_id |
| **修改文件** | `packages/worker/src/platforms/douyin/douyin-data-manager.js` |
| **状态** | ✅ 代码已修复，需清理数据库后重新爬取验证 |
