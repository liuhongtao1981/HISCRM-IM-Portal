# PC-IM 评论显示问题修复报告

## 问题描述

用户在 PC IM 界面中点击作品时，评论内容区域显示为空，没有显示评论消息列表。

## 问题排查过程

### 1. 验证 Master 数据

首先检查 Master DataStore 中是否有数据：

```bash
node tests/检查有评论的主题.js
```

**结果**：✅ Master DataStore 包含正确的数据
- 17 个主题有消息
- 消息包含 `messageCategory: 'comment'` 和 `isHandled: false` 字段
- 示例数据：发送者"苏苏"，内容"在哪里"

### 2. 验证 Master API 返回

创建测试脚本模拟 PC IM 的完整请求流程：

```bash
node tests/完整的PC-IM流程测试.js
```

**结果**：✅ Master API 返回完全正确
- 连接成功 ✓
- 注册成功 ✓
- 收到频道列表 ✓
- 收到主题列表 ✓
- 收到消息列表 ✓
- 消息包含 `messageCategory` 字段 ✓
- 消息包含 `isHandled` 字段 ✓

### 3. 发现根本原因

检查 Master 返回的数据格式发现关键问题：

```json
{
  "id": "7566864433692459826",
  "fromName": "苏苏",
  "content": "在哪里",
  "type": "comment",
  "messageCategory": "comment",
  "replyToId": "0",          // ❌ 问题所在！
  "isHandled": false
}
```

**问题分析**：

在 PC IM 前端代码中，评论Tab下的消息渲染逻辑为：

```typescript
// packages/crm-pc-im/src/pages/MonitorPage.tsx:770-772
const mainMessages = activeTab === 'private'
  ? filteredMessages
  : filteredMessages.filter(msg => !msg.replyToId)  // ❌ 这里会过滤掉 replyToId: "0" 的消息
```

JavaScript 中：
- `!"0"` → `false` （非空字符串是 truthy）
- 所以 `replyToId: "0"` 的消息会被过滤掉，不会显示！

**正确的数据格式应该是**：
```json
{
  "replyToId": null  // ✅ 顶级评论应该是 null，而不是 "0"
}
```

## 修复方案

修改 Master IM WebSocket 服务器中的数据转换逻辑：

**文件**：`packages/master/src/communication/im-websocket-server.js`

**修改位置**：第 371-374 行

**修改前**：
```javascript
messages.push({
  id: comment.commentId,
  // ...
  replyToId: comment.parentCommentId || null,  // ❌ 会保留 "0"
  // ...
});
```

**修改后**：
```javascript
// 处理 parentCommentId: "0" 表示顶级评论(没有父评论)
const parentId = comment.parentCommentId;
// 将 "0", 0, null, undefined, "" 都转换为 null
const replyToId = (!parentId || parentId === '0' || parentId === 0) ? null : parentId;

messages.push({
  id: comment.commentId,
  // ...
  replyToId: replyToId,  // ✅ "0" 会被转换为 null
  // ...
});
```

## 验证结果

修复后，消息格式应该是：

```json
{
  "id": "7566864433692459826",
  "fromName": "苏苏",
  "content": "在哪里",
  "type": "comment",
  "messageCategory": "comment",
  "replyToId": null,  // ✅ 已修复
  "timestamp": 1761798515,
  "isHandled": false
}
```

PC IM 前端的过滤逻辑：
```typescript
filteredMessages.filter(msg => !msg.replyToId)
// !null → true ✓  消息会被显示
```

## 修复状态

- [x] 识别问题根因
- [x] 修改 Master 代码
- [ ] 重启 Master 服务（需要停止旧进程）
- [ ] 在 PC IM 中验证显示效果

## 下一步操作

1. 停止占用 3000 端口的旧 Master 进程（PID: 13492）
2. 启动新的 Master 服务
3. 在 PC IM 中点击有评论的作品
4. 验证评论消息正常显示

## 相关文件

- **修复文件**：`packages/master/src/communication/im-websocket-server.js`
- **测试脚本**：
  - `tests/完整的PC-IM流程测试.js` - 完整流程测试
  - `tests/模拟PC-IM请求评论.js` - 评论请求测试
  - `tests/检查有评论的主题.js` - 数据验证

## 技术细节

### 数据流程

```
Worker DataStore → Master IM WebSocket → PC IM 前端
```

### 数据转换点

在 Master IM WebSocket 的 `getMessagesFromDataStore` 方法中：

1. **输入**：DataStore 中的评论数据（`parentCommentId: "0"` 表示顶级评论）
2. **转换**：将 `"0"` 转换为 `null`（表示没有父评论）
3. **输出**：PC IM 可以正确识别的消息格式

### 前端过滤逻辑

PC IM 在评论Tab下会将消息分为两类：
- **主消息**：`!msg.replyToId` 为 true 的消息（顶级评论）
- **讨论回复**：`msg.replyToId` 不为空的消息（回复评论）

因此，顶级评论的 `replyToId` 必须是 falsy 值（null、undefined、false、0、""），而不能是 truthy 值（如非空字符串 "0"）。

## 总结

问题的根本原因是数据格式不匹配：
- Worker 使用 `"0"` 表示顶级评论
- PC IM 期望 `null` 表示顶级评论

通过在 Master IM WebSocket 中添加数据转换逻辑，将 `"0"` 统一转换为 `null`，实现了数据格式的兼容性，解决了评论显示问题。
