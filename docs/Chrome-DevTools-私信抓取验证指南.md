# Chrome DevTools 私信抓取验证指南

**目的**: 使用 Chrome DevTools 验证 Douyin 私信抓取的完整性，确定是否需要实现历史消息和会话表的支持

**关键问题**:
1. ✅ 当前实现是否能抓取所有私信消息，还是只能抓取当前页面的消息？
2. ❓ 是否存在历史消息（conversation history）无法访问的问题？
3. ❓ 是否需要为每个会话单独请求完整消息历史？
4. ❓ 数据库是否需要新增 `conversations` 表来完整记录会话元数据？

---

## 第 1 部分: 当前实现分析

### 1.1 现有代码结构

**文件**: `packages/worker/src/platforms/douyin/platform.js` (行 1001-1140)

**当前抓取流程**:
```
Step 1: 获取或创建页面
   ↓
Step 2: 设置 API 拦截器 (message/get_by_user_init)
   ↓
Step 3: 导航到私信管理页面 (creator.douyin.com/.../message)
   ↓
Step 4: 等待页面加载 (3秒)
   ↓
Step 5: 滚动私信列表分页
   ↓
Step 6: 从 API 响应解析消息
   ↓
Step 7: 回退到 DOM 提取（如果无 API 数据）
   ↓
Step 8: 添加账户字段
   ↓
Step 9: 发送数据到 Master
```

### 1.2 API 拦截器配置

**拦截的 URL 模式**:
```javascript
await page.route('**/message/get_by_user_init**', async (route) => {
  // 捕获 JSON 响应
  const body = await response.json();
  apiResponses.push(body);
});
```

**问题分析**:
- ✅ 拦截 `message/get_by_user_init` 端点
- ⚠️ 只在初始加载 + 滚动时捕获
- ❌ 未拦截 `query_conversation` 或 `message/history` 端点
- ❌ 未实现打开单个会话查看完整历史

### 1.3 当前提取的数据字段

**从 API 响应中提取的字段**:
```javascript
{
  id: msg.platform_message_id,
  account_id: account.id,
  platform_user_id: account.platform_user_id,
  platform_message_id: "...",
  content: "消息内容",
  sender_name: "发送者名称",
  sender_id: "发送者ID",
  direction: "inbound|outbound",  // 如果可用
  is_read: false,
  created_at: 1635012345,         // Unix时间戳
  is_new: boolean,
  push_count: 0
}
```

**缺失的字段**:
- ❌ `conversation_id` - 会话唯一标识
- ❌ `other_user_id` - 对话方用户ID
- ❌ `other_user_name` - 对话方用户名
- ❌ `is_group` - 是否为群组
- ❌ `unread_count` - 未读消息计数
- ❌ `last_message_time` - 最后一条消息时间

### 1.4 当前数据库结构

**表**: `direct_messages` (schema.sql 行 57-71)

```sql
CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform_message_id TEXT,
  content TEXT NOT NULL,
  sender_name TEXT,
  sender_id TEXT,
  direction TEXT NOT NULL,
  is_read BOOLEAN DEFAULT 0,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  is_new BOOLEAN DEFAULT 1,
  push_count INTEGER DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id)
);
```

**缺失的关系**:
- ❌ 无 `conversations` 表
- ❌ 无 `conversation_id` 列
- ❌ 无会话元数据 (其他参与者, 最后活动时间等)
- ❌ 无消息-会话关系建立

---

## 第 2 部分: Chrome DevTools 验证步骤

### 2.1 准备工作

1. **登录 Douyin 创作者账户**
   - 访问: https://creator.douyin.com/
   - 确保已登录并完全加载

2. **打开 Chrome DevTools**
   - 快捷键: `F12` 或 `Ctrl+Shift+I`
   - 切换到 **Network** 标签页

3. **清空网络日志**
   - 点击左上角的清除按钮（或 `Ctrl+L`）
   - 确保开始时没有历史记录

### 2.2 验证步骤 1: 初始私信列表加载

**步骤**:
1. 在 DevTools Network 标签页中设置过滤:
   - 输入 `imapi.snssdk.com` 进行过滤

2. 导航到私信管理页面:
   - 访问: https://creator.douyin.com/creator-micro/message

3. 等待页面完全加载（观察网络请求完成）

4. **查看请求列表**:
   - 寻找以下端点:
     * `message/get_by_user_init` ✓ (应该存在)
     * `query_conversation` ❓ (检查是否存在)
     * `message/history` ❓ (检查是否存在)

5. **点击 `message/get_by_user_init` 请求**:
   - 选择 **Response** 标签页
   - 记录返回的消息数量

### 2.3 验证步骤 2: 滚动加载分页数据

**步骤**:
1. 继续监听 Network 请求
2. 在私信列表中滚动到底部
3. 观察新出现的请求:
   - 是否触发新的 `message/get_by_user_init` 请求？
   - 是否返回新的消息数据？

4. **记录**:
   - 第一次请求返回的消息数: `_____`
   - 滚动后新增请求数: `_____`
   - 每次请求返回的消息数: `_____`

5. **问题**:
   - 是否所有历史消息都已加载，或仅加载了最近的消息？

### 2.4 验证步骤 3: 查看单个会话详情

**步骤**:
1. 在私信列表中，**点击一个会话** 打开详情
2. 监听 Network 请求，记录发起的新请求:
   - 寻找 `query_conversation` 或 `message/history` 端点
   - 检查是否有额外的 API 调用

3. **点击 Response 标签**:
   - 查看返回的数据结构
   - 注意是否包含完整的会话和消息历史

4. **滚动消息历史**:
   - 在会话详情中向上滚动
   - 观察是否触发新的 API 请求加载更早的消息
   - 是否所有历史消息都能被加载？

### 2.5 验证步骤 4: API 请求细节分析

对于每个关键 API 端点，进行以下检查:

#### 端点 A: `message/get_by_user_init`

**点击请求** → **Request 标签**:
```
Method: POST
Headers:
  - Content-Type: application/json 或 application/protobuf

Payload 示例:
{
  "cursor": 0,
  "count": 20,
  ...其他参数
}
```

**点击请求** → **Response 标签**:
```javascript
{
  "data": {
    "conversations": [  // 或 "messages"
      {
        "conversation_id": "...",           // ✓ 检查是否存在
        "other_user_id": "...",             // ❓ 检查是否存在
        "other_user_name": "...",           // ❓ 检查是否存在
        "last_message": {
          "platform_message_id": "...",
          "content": "...",
          "created_at": 1635012345,
          "sender_id": "..."
        },
        "unread_count": 5,                  // ❓ 检查是否存在
        "last_message_time": 1635012345,    // ❓ 检查是否存在
        ...
      }
    ]
  },
  "cursor": "...",  // 用于分页
  "has_more": true
}
```

**关键问题**:
- [ ] 响应中是否包含 `conversation_id` 字段？
- [ ] 是否包含对话方用户信息 (`other_user_id`, `other_user_name`)？
- [ ] `has_more` 字段是否表示还有更多会话待加载？
- [ ] 每次请求返回的消息/会话数量是多少？

#### 端点 B: `query_conversation` (如果存在)

**如果看到此端点**:

**点击请求** → **Payload**:
```javascript
{
  "conversation_id": "...",
  // 可能还有其他参数
}
```

**点击请求** → **Response**:
```javascript
{
  "data": {
    "conversation_id": "...",
    "messages": [
      {
        "platform_message_id": "...",
        "content": "...",
        "sender_id": "...",
        "sender_name": "...",
        "created_at": 1635012345,
        ...
      }
    ]
  }
}
```

**记录**:
- [ ] 此端点是否返回完整的会话信息？
- [ ] 消息数量是否多于 `message/get_by_user_init` 的最新消息？
- [ ] 是否包含完整的消息历史？

#### 端点 C: `message/history` (如果存在)

**点击请求** → **Payload**:
```javascript
{
  "conversation_id": "...",
  "cursor": 0,
  "count": 50,
  ...
}
```

**点击请求** → **Response**:
```javascript
{
  "data": {
    "messages": [
      // 历史消息数组
    ]
  },
  "has_more": true,
  "cursor": "..."
}
```

**记录**:
- [ ] 此端点是否支持历史消息的分页加载？
- [ ] `has_more` 是否指示还有更早的消息？
- [ ] 是否能通过 `cursor` 分页加载全部历史？

---

## 第 3 部分: 数据完整性检查清单

### 3.1 消息字段完整性 ✓/❌

按照以下清单检查 API 响应中是否存在必要字段:

| 字段名 | 类型 | 必需 | 已有 | 说明 |
|--------|------|------|------|------|
| `platform_message_id` | string | ✓ | ✓ | 消息唯一标识 |
| `conversation_id` | string | ✓ | ❌ | 会话唯一标识 |
| `content` | string | ✓ | ✓ | 消息内容 |
| `sender_id` | string | ✓ | ✓ | 发送者 ID |
| `sender_name` | string | ✓ | ✓ | 发送者名称 |
| `receiver_id` | string | ✓ | ❌ | 接收者 ID |
| `receiver_name` | string | ✓ | ❌ | 接收者名称 |
| `created_at` | integer | ✓ | ✓ | 创建时间戳 |
| `direction` | string | ✓ | ⚠️ | 消息方向 (inbound/outbound) |
| `is_read` | boolean | ✓ | ✓ | 是否已读 |
| `message_type` | string | ✓ | ❌ | 消息类型 (text/image/video等) |

### 3.2 会话元数据检查 ✓/❌

检查是否需要新建 `conversations` 表来记录会话级别的元数据:

| 字段名 | 类型 | 说明 | 优先级 |
|--------|------|------|--------|
| `conversation_id` | string | 会话唯一标识 | 🔴 必需 |
| `account_id` | string | 所属账户 | 🔴 必需 |
| `other_user_id` | string | 对话方用户 ID | 🔴 必需 |
| `other_user_name` | string | 对话方用户名 | 🟠 重要 |
| `is_group` | boolean | 是否为群组 | 🟠 重要 |
| `unread_count` | integer | 未读消息数 | 🟠 重要 |
| `last_message_id` | string | 最后消息 ID | 🟡 可选 |
| `last_message_time` | integer | 最后消息时间 | 🟡 可选 |
| `created_at` | integer | 创建时间 | 🟡 可选 |
| `updated_at` | integer | 更新时间 | 🟡 可选 |

### 3.3 历史消息覆盖检查

在 Chrome DevTools **Application** 标签页中查看 LocalStorage/SessionStorage:

1. 打开 **DevTools** → **Application** 标签
2. 展开 **LocalStorage** → 选择 `https://creator.douyin.com`
3. 搜索键名包含 `message`, `conversation`, `chat` 的项目
4. 查看缓存的消息数量:
   - 单次加载: `_____` 条消息
   - 完整历史: `_____` 条消息 (如果能确定)

---

## 第 4 部分: 数据流完整性评估

### 4.1 当前流程的缺口

根据验证结果，评估以下问题:

**问题 1: 消息完整性**
```
当前代码是否能获取全部历史消息？
  ☐ 是 - 已通过 message/get_by_user_init 端点
  ☐ 否 - 需要额外实现 query_conversation/message/history 端点
  ☐ 部分 - 只能获取最近的 X 条消息
```

**问题 2: 会话识别**
```
是否能准确识别每个会话及其对话方？
  ☐ 是 - API 返回 conversation_id 和 other_user 信息
  ☐ 否 - 缺少会话级别的元数据
  ☐ 部分 - 某些信息散落在不同的 API 响应中
```

**问题 3: 会话表需求**
```
是否需要新增 conversations 表？
  ☐ 必需 - 会话信息复杂，需要规范化存储
  ☐ 可选 - 当前 direct_messages 足以支持需求
  ☐ 待定 - 需要与上层需求 (Master/Admin) 沟通
```

**问题 4: 历史消息覆盖**
```
能否实现"闭环"(完整覆盖所有历史消息)？
  ☐ 可以 - 通过分页/循环加载 API 端点
  ☐ 有限制 - 时间限制 (如只能获取最近 30 天)
  ☐ 不可能 - Douyin 平台有硬性限制
```

### 4.2 架构流程图

**当前流程** (消息级):
```
Page Load
  ↓ (API: message/get_by_user_init)
Message List Page
  ↓ (Scroll pagination)
Initial Load Messages
  ↓
Master (1001+ 条消息)
```

**完整流程** (会话 + 消息级) - 需要实现:
```
Page Load
  ↓ (API: query_conversation)
Conversation List
  ↓ (Foreach conversation)
  ├─ (API: message/history)
  ├─ Message History (Per Conversation)
  ├─ More pagination?
  └─ All Messages
  ↓
Master (Complete history)
```

---

## 第 5 部分: 验证结果记录表

### 5.1 填写这个表格

请在验证后填写以下信息:

```markdown
## 验证日期: ____年____月____日

### API 端点检查

| 端点 | 存在 | 返回消息数 | 支持分页 | 备注 |
|------|------|----------|--------|------|
| message/get_by_user_init | ☐ | ___ | ☐ | |
| query_conversation | ☐ | ___ | ☐ | |
| message/history | ☐ | ___ | ☐ | |
| 其他: ____________ | ☐ | ___ | ☐ | |

### 数据字段验证

- [ ] 响应包含 `conversation_id`
- [ ] 响应包含 `other_user_id` / `other_user_name`
- [ ] 响应包含消息方向 (`direction`)
- [ ] 支持完整的历史消息加载

### 完整性评估结果

- 当前实现完整性: **___ %**
- 缺失功能:
  - [ ] 会话识别 (conversation_id)
  - [ ] 对话方信息 (other_user_id/name)
  - [ ] 历史消息加载
  - [ ] 消息类型区分 (text/image等)

### 建议方案

**Phase 8 工作项**:
- [ ] 新增 `conversations` 表
- [ ] 实现 `query_conversation` 端点拦截
- [ ] 实现会话遍历 + 消息历史加载
- [ ] 更新 `direct_messages` 表结构
- [ ] 实现完整的消息-会话关联
```

---

## 第 6 部分: 建议的改进方向

### 6.1 Phase 8 工作计划 (基于验证结果)

**前置条件**: 完成上述 Chrome DevTools 验证

**工作项 1: 数据库结构升级**
```sql
-- 新增 conversations 表
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,                    -- conversation_id from API
  account_id TEXT NOT NULL,
  other_user_id TEXT NOT NULL,
  other_user_name TEXT,
  is_group BOOLEAN DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  last_message_id TEXT,
  last_message_time INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- 修改 direct_messages 表
ALTER TABLE direct_messages ADD COLUMN conversation_id TEXT;
ALTER TABLE direct_messages ADD COLUMN receiver_id TEXT;
ALTER TABLE direct_messages ADD COLUMN receiver_name TEXT;
ALTER TABLE direct_messages ADD COLUMN message_type TEXT DEFAULT 'text';
CREATE INDEX idx_dm_conversation ON direct_messages(conversation_id);
```

**工作项 2: 新增 API 拦截**
```javascript
// 在 crawlDirectMessages 中添加:
await page.route('**/query_conversation**', async (route) => {
  const response = await route.fetch();
  const body = await response.json();
  conversationResponses.push(body);
  await route.fulfill({ response });
});

await page.route('**/message/history**', async (route) => {
  const response = await route.fetch();
  const body = await response.json();
  historyResponses.push(body);
  await route.fulfill({ response });
});
```

**工作项 3: 实现会话遍历逻辑**
```javascript
async crawlCompleteDirectMessages(account) {
  // 1. 获取会话列表
  const conversations = await this.getConversationList(page);

  // 2. 对每个会话获取完整消息历史
  for (const conversation of conversations) {
    const messages = await this.getConversationHistory(
      page,
      conversation.id
    );
    // 保存会话 + 消息
    await this.saveConversation(account, conversation);
    await this.saveMessages(account, messages, conversation.id);
  }

  return {
    conversationsCount: conversations.length,
    messagesCount: totalMessages
  };
}
```

**工作项 4: 更新 Master 侧处理**
- 更新消息表结构验证
- 支持会话级别的查询
- 更新通知系统 (按会话分组)

### 6.2 验证通过的快速实现路径

如果验证表明:
- ✅ API 已支持完整的消息历史加载
- ✅ 无需额外的会话遍历

**则可快速实现**:
```javascript
// 只需更新现有 parseMessagesFromAPI():
const messages = this.parseMessagesFromAPI(apiResponses);

// 添加 conversation_id 字段映射
const messagesWithConversation = messages.map(msg => ({
  ...msg,
  conversation_id: msg.conversation_id || generateConversationId(msg),
  receiver_id: account.platform_user_id,  // 从对话方推断
  receiver_name: account.account_name,
}));
```

---

## 第 7 部分: 关键疑问汇总

| # | 疑问 | 验证方法 | 预期答案 |
|----|------|--------|--------|
| 1 | 当前 API 是否支持历史消息加载？ | Chrome DevTools → Network | ✓ 或 ❌ |
| 2 | 是否需要打开单个会话查看完整历史？ | 点击会话 → 观察新请求 | ✓ 或 ❌ |
| 3 | 消息是否已有 `conversation_id`？ | Response 检查 | ✓ 或 ❌ |
| 4 | 是否需要新建 `conversations` 表？ | 基于问题 1-3 的答案 | 是 或 否 |
| 5 | 能否实现消息 100% 闭环覆盖？ | 分页测试 + 时间范围检查 | 可以 或 有限制 |

---

## 使用说明

1. **按照第 2 部分的步骤** 在浏览器中进行验证
2. **记录每一步的观察** 到 DevTools 中
3. **填写第 5 部分的结果记录表**
4. **基于验证结果** 决定 Phase 8 的具体工作内容
5. **如有疑问** 参考第 7 部分的疑问汇总

---

**下一步**: 按照此指南进行 Chrome DevTools 验证，收集 API 响应数据，确定是否需要实现会话表和历史消息加载功能。
