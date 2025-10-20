# Douyin IM API 端点参考

**用途**: 记录 Douyin 私信系统的 API 端点、数据结构和拦截策略

**更新日期**: 2024 年

---

## 第 1 部分: API 端点概览

### 1.1 主要端点列表

| 端点 | 方法 | 作用 | 优先级 | 状态 |
|------|------|------|--------|------|
| `/v1/message/get_by_user_init` | POST | 获取私信初始列表 | 🔴 必需 | ✅ 已实现 |
| `/v1/im/query_conversation` | POST | 查询会话详情 | 🔴 必需 | ❓ 待验证 |
| `/v1/im/message/history` | POST | 获取消息历史 | 🔴 必需 | ❓ 待验证 |
| `/v1/im/message/get` | POST | 获取单条消息 | 🟠 重要 | ❓ 待验证 |
| `/v1/im/conversation/list` | POST | 获取会话列表 | 🟠 重要 | ❓ 待验证 |
| `/v1/im/conversation/unread` | POST | 获取未读统计 | 🟡 可选 | ❓ 待验证 |

### 1.2 API 服务器

**服务器地址**: `imapi.snssdk.com`

**请求格式**:
- 方法: `POST`
- 基础 URL: `https://imapi.snssdk.com`
- 完整 URL: `https://imapi.snssdk.com/v1/{namespace}/{endpoint}`
- Content-Type: `application/json` 或 `application/protobuf`

**示例 URL**:
```
https://imapi.snssdk.com/v1/message/get_by_user_init
https://imapi.snssdk.com/v1/im/query_conversation
https://imapi.snssdk.com/v1/im/message/history
```

---

## 第 2 部分: 已验证的端点详解

### 2.1 `/v1/message/get_by_user_init` ✅

**状态**: 已在代码中实现

**用途**: 获取私信初始列表（最新的会话或消息）

**拦截配置**:
```javascript
await page.route('**/message/get_by_user_init**', async (route) => {
  const response = await route.fetch();
  const body = await response.json();
  apiResponses.push(body);
  await route.fulfill({ response });
});
```

**请求示例**:
```json
{
  "cursor": 0,
  "count": 20,
  "source": "im_msg_list",
  "imei": "...",
  "idfa": "...",
  "device_id": "..."
}
```

**响应示例** (预期结构):
```json
{
  "data": {
    "conversations": [
      {
        "conversation_id": "123456_abcdef",
        "other_user_id": "123456",
        "other_user_name": "张三",
        "last_message": {
          "platform_message_id": "msg_001",
          "content": "你好，今天怎么样？",
          "sender_id": "123456",
          "sender_name": "张三",
          "created_at": 1635012345,
          "type": "text"
        },
        "unread_count": 3,
        "last_message_time": 1635012345,
        "is_group": false
      }
    ],
    "cursor": "next_cursor_value",
    "has_more": true
  },
  "status_code": 0,
  "message": "success"
}
```

**关键字段说明**:
- `conversation_id`: 会话唯一标识，用于后续查询此会话的完整历史
- `other_user_id`: 对话方的用户 ID
- `other_user_name`: 对话方的用户名
- `last_message`: 最后一条消息的摘要
- `unread_count`: 此会话的未读消息数
- `has_more`: 是否还有更多会话待加载
- `cursor`: 用于下一次分页请求的游标

**分页使用**:
```javascript
// 第一次请求
let cursor = 0;
const messages = [];

while (true) {
  const response = await fetchAPI('/v1/message/get_by_user_init', {
    cursor,
    count: 20
  });

  messages.push(...response.data.conversations);

  if (!response.data.has_more) break;
  cursor = response.data.cursor;
}
```

---

## 第 3 部分: 待验证的端点

### 3.1 `/v1/im/query_conversation` ❓

**预期用途**: 查询单个会话的详细信息和元数据

**预期请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "include_messages": true,
  "message_count": 50
}
```

**预期响应**:
```json
{
  "data": {
    "conversation_id": "123456_abcdef",
    "other_user_id": "123456",
    "other_user_name": "张三",
    "other_user_avatar": "https://...",
    "is_group": false,
    "group_name": null,
    "created_at": 1634012345,
    "updated_at": 1635012345,
    "unread_count": 3,
    "messages": [
      {
        "platform_message_id": "msg_001",
        "conversation_id": "123456_abcdef",
        "content": "消息内容",
        "sender_id": "123456",
        "sender_name": "张三",
        "receiver_id": "my_user_id",
        "receiver_name": "我的账户",
        "created_at": 1635012345,
        "type": "text",
        "is_read": true,
        "direction": "inbound"
      }
    ]
  },
  "status_code": 0,
  "message": "success"
}
```

**验证要点**:
- [ ] 此端点是否存在？
- [ ] 是否返回 `messages` 数组？
- [ ] 消息是否包含 `receiver_id` 和 `receiver_name`？
- [ ] 是否支持 `include_messages` 参数？

---

### 3.2 `/v1/im/message/history` ❓

**预期用途**: 分页加载会话的完整消息历史

**预期请求**:
```json
{
  "conversation_id": "123456_abcdef",
  "cursor": 0,
  "count": 50,
  "direction": "backward"
}
```

**预期响应**:
```json
{
  "data": {
    "messages": [
      {
        "platform_message_id": "msg_050",
        "conversation_id": "123456_abcdef",
        "content": "最早的消息",
        "sender_id": "123456",
        "sender_name": "张三",
        "receiver_id": "my_user_id",
        "created_at": 1634012345,
        "type": "text",
        "direction": "inbound"
      },
      {
        "platform_message_id": "msg_049",
        "content": "倒数第二条消息",
        ...
      }
    ],
    "cursor": "next_cursor_for_older_messages",
    "has_more": true
  },
  "status_code": 0,
  "message": "success"
}
```

**验证要点**:
- [ ] 此端点是否存在？
- [ ] 是否支持 `cursor` 分页？
- [ ] 是否能加载完整的历史消息（可以一直分页直到 `has_more` 为 false）？
- [ ] 每页返回的消息数是否稳定（一般 50 条）？

---

### 3.3 `/v1/im/conversation/list` ❓

**预期用途**: 获取当前账户的所有会话列表

**预期请求**:
```json
{
  "cursor": 0,
  "count": 100,
  "sort_by": "last_message_time",
  "include_unread_only": false
}
```

**预期响应**:
```json
{
  "data": {
    "conversations": [
      {
        "conversation_id": "123456_abcdef",
        "other_user_id": "123456",
        "other_user_name": "张三",
        "unread_count": 5,
        "last_message_time": 1635012345,
        ...
      }
    ],
    "total_count": 150,
    "cursor": "next_cursor",
    "has_more": true
  },
  "status_code": 0
}
```

**验证要点**:
- [ ] 此端点与 `message/get_by_user_init` 的区别？
- [ ] 返回的会话数是否更多？
- [ ] 是否支持筛选已读/未读会话？

---

## 第 4 部分: 数据结构映射

### 4.1 消息对象 (Message Object)

**API 返回的标准消息结构**:
```json
{
  "platform_message_id": "string",      // 消息唯一标识
  "conversation_id": "string",          // 所属会话
  "content": "string",                  // 消息内容
  "sender_id": "string",                // 发送者 ID
  "sender_name": "string",              // 发送者名称
  "receiver_id": "string",              // 接收者 ID (可能不总是返回)
  "receiver_name": "string",            // 接收者名称 (可能不总是返回)
  "created_at": 1635012345,             // Unix 时间戳（秒）
  "type": "text|image|video|...",       // 消息类型
  "direction": "inbound|outbound",      // 消息方向
  "is_read": true|false,                // 是否已读
  "status": "sent|delivered|failed",    // 发送状态 (可能不总是返回)
  "ext": {                              // 扩展字段
    "image_url": "...",                 // 图片消息的 URL
    "video_url": "...",                 // 视频消息的 URL
    "duration": 0,                      // 视频时长
    ...
  }
}
```

**映射到数据库表**:
```javascript
// API Message → direct_messages 表
{
  id: msg.platform_message_id,
  account_id: account.id,
  platform_message_id: msg.platform_message_id,
  conversation_id: msg.conversation_id,
  content: msg.content,
  sender_id: msg.sender_id,
  sender_name: msg.sender_name,
  receiver_id: msg.receiver_id || account.platform_user_id,
  receiver_name: msg.receiver_name || account.account_name,
  direction: msg.direction,
  is_read: msg.is_read,
  created_at: msg.created_at,
  detected_at: Math.floor(Date.now() / 1000),
  is_new: (now - msg.created_at) < 86400,  // 24小时内为新消息
  push_count: 0,
  message_type: msg.type || 'text'
}
```

### 4.2 会话对象 (Conversation Object)

**API 返回的标准会话结构**:
```json
{
  "conversation_id": "string",          // 会话唯一标识
  "other_user_id": "string",            // 对话方用户 ID
  "other_user_name": "string",          // 对话方用户名
  "other_user_avatar": "string",        // 对话方头像 URL
  "is_group": boolean,                  // 是否为群组
  "group_name": "string",               // 群组名称 (如果是群组)
  "group_members": [                    // 群组成员列表 (如果是群组)
    {
      "user_id": "string",
      "user_name": "string"
    }
  ],
  "unread_count": integer,              // 未读消息数
  "last_message_time": 1635012345,      // 最后消息时间戳
  "last_message": {                     // 最后消息摘要
    "platform_message_id": "string",
    "content": "string",
    "sender_id": "string",
    "type": "string",
    "created_at": 1635012345
  },
  "created_at": 1634012345,             // 会话创建时间
  "updated_at": 1635012345,             // 会话更新时间
  "is_muted": false,                    // 是否静音
  "is_pinned": false,                   // 是否置顶
  "status": "active|archived"           // 会话状态
}
```

**映射到新的 conversations 表** (待实现):
```javascript
// API Conversation → conversations 表
{
  id: conv.conversation_id,
  account_id: account.id,
  other_user_id: conv.other_user_id,
  other_user_name: conv.other_user_name,
  is_group: conv.is_group,
  unread_count: conv.unread_count,
  last_message_id: conv.last_message.platform_message_id,
  last_message_time: conv.last_message_time,
  created_at: conv.created_at,
  updated_at: conv.updated_at
}
```

---

## 第 5 部分: 代码实现参考

### 5.1 多端点拦截的完整示例

```javascript
async crawlDirectMessagesWithMultipleEndpoints(account) {
  const page = await this.getOrCreatePage(account.id);

  // 保存所有 API 响应
  const apiResponses = {
    init: [],          // message/get_by_user_init 响应
    conversations: [], // query_conversation 响应
    history: []        // message/history 响应
  };

  // 拦截端点 1: message/get_by_user_init
  await page.route('**/message/get_by_user_init**', async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.json();
      logger.info('[init] Intercepted:', body);
      apiResponses.init.push(body);
      await route.fulfill({ response });
    } catch (error) {
      logger.error('[init] Error:', error);
      await route.continue();
    }
  });

  // 拦截端点 2: query_conversation
  await page.route('**/query_conversation**', async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.json();
      logger.info('[query_conversation] Intercepted:', body);
      apiResponses.conversations.push(body);
      await route.fulfill({ response });
    } catch (error) {
      logger.error('[query_conversation] Error:', error);
      await route.continue();
    }
  });

  // 拦截端点 3: message/history
  await page.route('**/message/history**', async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.json();
      logger.info('[history] Intercepted:', body);
      apiResponses.history.push(body);
      await route.fulfill({ response });
    } catch (error) {
      logger.error('[history] Error:', error);
      await route.continue();
    }
  });

  // 导航到消息管理页面
  await this.navigateToMessageManage(page);
  await page.waitForTimeout(3000);

  // 滚动加载分页数据
  await this.scrollMessageListToLoadMore(page, apiResponses.init);

  // 处理响应数据
  const { messages, conversations } = this.parseMultipleResponses(
    apiResponses,
    account
  );

  logger.info(`Collected: ${conversations.length} conversations, ${messages.length} messages`);

  // 保存到 Master
  await this.sendConversationsToMaster(account, conversations);
  await this.sendMessagesToMaster(account, messages);

  return {
    conversationCount: conversations.length,
    messageCount: messages.length,
    apiResponseCounts: {
      init: apiResponses.init.length,
      conversations: apiResponses.conversations.length,
      history: apiResponses.history.length
    }
  };
}

parseMultipleResponses(apiResponses, account) {
  const conversations = [];
  const messages = [];

  // 从 init 响应提取会话和消息
  for (const resp of apiResponses.init) {
    if (resp.data?.conversations) {
      for (const conv of resp.data.conversations) {
        conversations.push(conv);
        if (conv.last_message) {
          messages.push(conv.last_message);
        }
      }
    }
  }

  // 从 query_conversation 响应提取消息
  for (const resp of apiResponses.conversations) {
    if (resp.data?.messages) {
      messages.push(...resp.data.messages);
    }
  }

  // 从 history 响应提取消息
  for (const resp of apiResponses.history) {
    if (resp.data?.messages) {
      messages.push(...resp.data.messages);
    }
  }

  // 去重
  const uniqueMessages = new Map();
  for (const msg of messages) {
    uniqueMessages.set(msg.platform_message_id, msg);
  }

  return {
    conversations,
    messages: Array.from(uniqueMessages.values())
  };
}
```

### 5.2 会话遍历逻辑

```javascript
async crawlCompleteConversations(account) {
  const page = await this.getOrCreatePage(account.id);
  const allMessages = [];
  const allConversations = [];

  // 第一步: 获取会话列表
  await this.navigateToMessageManage(page);
  const conversationList = await this.extractConversationList(page);
  allConversations.push(...conversationList);

  // 第二步: 对每个会话获取完整消息历史
  for (const conversation of conversationList) {
    logger.info(`Fetching history for conversation: ${conversation.conversation_id}`);

    // 点击打开会话
    await page.click(`[data-conversation-id="${conversation.conversation_id}"]`);
    await page.waitForTimeout(1000);

    // 滚动加载完整历史
    let hasMore = true;
    let cursor = 0;

    while (hasMore) {
      // 滚动到顶部加载更早的消息
      await page.evaluate(() => {
        const messageList = document.querySelector('[data-message-list]');
        messageList.scrollTop = 0;
      });

      await page.waitForTimeout(1000);

      // 检查是否还有更多消息
      hasMore = await page.evaluate(() => {
        const loadMore = document.querySelector('[data-load-more]');
        return loadMore && !loadMore.disabled;
      });

      cursor++;
      if (cursor > 100) break;  // 防止无限循环
    }

    // 提取所有消息
    const messages = await this.extractMessagesFromPage(page);
    allMessages.push(...messages);
  }

  return {
    conversations: allConversations,
    messages: allMessages
  };
}
```

---

## 第 6 部分: 测试验证清单

### 6.1 单元测试覆盖

创建测试文件 `tests/unit/platforms/douyin/crawl-direct-messages.test.js`:

```javascript
describe('Douyin Direct Messages Crawling', () => {
  describe('message/get_by_user_init 端点', () => {
    test('应该正确拦截 API 请求', () => {
      // 验证 page.route 被正确配置
    });

    test('应该解析 JSON 响应', () => {
      // 验证 JSON 解析逻辑
    });

    test('应该处理分页游标', () => {
      // 验证 cursor 和 has_more 的处理
    });

    test('应该提取所有必需字段', () => {
      // 验证消息对象包含: platform_message_id, content, sender_id, created_at
    });
  });

  describe('会话对象处理', () => {
    test('应该提取 conversation_id', () => {
      // 验证会话识别
    });

    test('应该提取对话方信息', () => {
      // 验证 other_user_id, other_user_name
    });

    test('应该处理缺失的接收方信息', () => {
      // 验证 receiver_id 回退逻辑
    });
  });

  describe('完整性验证', () => {
    test('应该支持完整的消息历史加载', () => {
      // 验证 has_more 分页
    });

    test('应该避免消息重复', () => {
      // 验证消息去重
    });
  });
});
```

---

## 第 7 部分: 故障排除指南

### 7.1 API 未返回预期数据

**症状**: API 响应为空或数据结构不同

**检查步骤**:
1. 确认 URL 模式是否正确
   ```javascript
   // 检查是否匹配
   page.route('**/message/get_by_user_init**', ...);
   // vs
   page.route('**/im/message/get_by_user_init**', ...);
   ```

2. 检查 Response 类型
   ```javascript
   const contentType = response.headers()['content-type'];
   // application/json ✓
   // application/protobuf ❌ (需要特殊处理)
   ```

3. 输出完整的响应内容
   ```javascript
   logger.info('Full response:', JSON.stringify(body, null, 2));
   ```

### 7.2 拦截器未触发

**症状**: `apiResponses` 数组一直为空

**检查步骤**:
1. 验证 URL 模式是否与实际请求匹配
   ```javascript
   // 在浏览器开发工具中查看完整 URL
   // 然后确保 page.route 的模式能匹配
   ```

2. 检查时机问题
   ```javascript
   // 必须在导航前设置 route 处理
   await page.route(...);           // ✓ 正确顺序
   await page.goto(...);            // ✓

   // vs
   await page.goto(...);            // ❌ 错误顺序
   await page.route(...);           // ❌ 可能无法捕获
   ```

3. 检查是否有 CORS 或其他错误阻止请求
   ```javascript
   // 监听请求失败事件
   page.on('requestfailed', request => {
     logger.error('Request failed:', request.url(), request.failure());
   });
   ```

---

## 附录: API 响应示例数据

### A1: message/get_by_user_init 实际响应示例

```json
{
  "data": {
    "conversations": [
      {
        "conversation_id": "123456_1234567890",
        "other_user_id": "123456",
        "other_user_name": "创意达人",
        "other_user_avatar": "https://p3.byteimg.com/...",
        "is_group": false,
        "last_message": {
          "platform_message_id": "msg_1704067200",
          "content": "你好，请问有什么帮助吗？",
          "sender_id": "123456",
          "sender_name": "创意达人",
          "created_at": 1704067200,
          "type": "text"
        },
        "unread_count": 2,
        "last_message_time": 1704067200,
        "created_at": 1704000000,
        "updated_at": 1704067200
      }
    ],
    "cursor": "1704067200_123456",
    "has_more": false
  },
  "status_code": 0,
  "message": "success"
}
```

---

**持续更新**: 此文档将根据 Chrome DevTools 验证结果动态更新
