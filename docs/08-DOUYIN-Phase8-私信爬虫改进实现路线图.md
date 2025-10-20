# Phase 8: Douyin 私信爬虫改进实现路线图

**目标**: 完整实现 Douyin 私信爬虫 v2，支持完整消息历史、会话管理、ID 信息提取

**当前状态**: Phase 8 开始 - 数据库模式标准化完成 ✅

---

## 📊 项目进度概览

| 阶段 | 任务 | 状态 | 进度 |
|------|------|------|------|
| **Phase 1-5** | 需求分析 + 开发 | ✅ 完成 | 100% |
| **Phase 6** | 集成测试计划 | ✅ 完成 | 100% |
| **Phase 7** | 私信验证 + 架构分析 | ✅ 完成 | 100% |
| **Phase 8** | 私信爬虫改进实现 | 🚀 进行中 | 20% |
| Phase 9 | 性能优化 | ⏳ 待定 | 0% |
| Phase 10 | 生产部署 | ⏳ 待定 | 0% |

---

## ✅ 已完成的工作 (Phase 8 第 1 步)

### 1. 数据库模式标准化

**提交**: `refactor: 标准化数据库模式字段命名`

**conversations 表更改**:
```sql
-- 旧命名
user_id, user_name, user_avatar, last_message_id

-- 新命名 (platform_ 前缀)
platform_user_id, platform_user_name, platform_user_avatar, platform_message_id
```

**direct_messages 表更改**:
```sql
-- 旧命名
sender_id, sender_name, receiver_id, receiver_name

-- 新命名 (platform_ 前缀)
platform_sender_id, platform_sender_name, platform_receiver_id, platform_receiver_name
```

**设计理由**:
- 与现有 `comments` 表的 `platform_comment_id` 命名规范一致
- 明确标识平台特定字段 vs 系统内部字段
- 为支持多平台做好准备 (future: xiaohongshu, bilibili 等)

**文件更新**:
- ✅ `packages/master/src/database/schema.sql` (conversations + direct_messages)
- ✅ `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js` (所有字段引用)

---

## 🎯 Phase 8 实现任务 (后续工作)

### Phase 8A: 实现虚拟列表消息提取 (1-2 天)

**目标**: 从 Douyin 虚拟列表中提取完整消息数据

**具体任务**:

#### 8A-1: 实现 React Fiber 数据提取
- 文件: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`
- 函数: `extractMessagesFromVirtualList(page)`
- 需要完成:
  - [ ] 优化 React Fiber 树遍历算法
  - [ ] 从 memoizedProps 提取完整消息对象
  - [ ] 处理虚拟列表不同渲染状态
  - [ ] 添加错误处理和日志记录

**当前代码** (行 282-331):
```javascript
async function extractMessagesFromVirtualList(page) {
  return await page.evaluate(() => {
    const messages = [];
    const rows = document.querySelectorAll('[role="listitem"]');

    rows.forEach((row, index) => {
      // 尝试从 React Fiber 提取完整数据
      const fiberNode = Object.keys(row).find(key => key.startsWith('__react'));
      let msgData = {};

      if (fiberNode) {
        const fiber = row[fiberNode];
        if (fiber?.memoizedProps?.data) {
          msgData = fiber.memoizedProps.data;
        }
      }

      // 从 DOM 提取基本信息
      // 合并 DOM + Fiber 数据
      messages.push({ ... });
    });
    return messages;
  });
}
```

**改进方向**:
- 增加 Fiber 树深度搜索 (当前只查找一层)
- 处理多种虚拟列表实现 (ReactVirtualized, react-window 等)
- 提取完整的消息对象 (当前只提取部分字段)

---

#### 8A-2: 实现虚拟列表分页加载
- 文件: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`
- 函数: `crawlCompleteMessageHistory(page, conversation, account, apiResponses)`
- 需要完成:
  - [ ] 优化滚动到顶部的时序
  - [ ] 处理网络延迟和消息加载时间
  - [ ] 实现收敛判断 (何时停止分页)
  - [ ] 添加超时和重试逻辑

**当前代码** (行 230-277):
```javascript
async function crawlCompleteMessageHistory(page, conversation, account, apiResponses) {
  const allMessages = [];
  let previousCount = 0;
  let attempts = 0;
  const maxAttempts = 50;

  while (attempts < maxAttempts) {
    // 向上滚动虚拟列表
    await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]');
      if (grid) grid.scrollTop = 0;
    });

    await page.waitForTimeout(500);

    // 提取当前消息
    const currentMessages = await extractMessagesFromVirtualList(page);

    // 检查是否收敛
    if (currentMessages.length === previousCount) {
      break; // 到达历史底部
    }

    previousCount = currentMessages.length;
    attempts++;
    await page.waitForTimeout(200);
  }

  return messages;
}
```

**改进方向**:
- 添加智能延迟 (根据消息数量动态调整等待时间)
- 实现收敛判断优化 (不仅比较数量，还要比较内容 hash)
- 添加平台特定的分页指示器检测 (如 `has_more` 标志)

---

### Phase 8B: 实现 API 拦截和数据整合 (1-2 天)

**目标**: 从多个 API 端点拦截数据，整合完整的消息对象

**具体任务**:

#### 8B-1: 增强 API 拦截器
- 文件: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`
- 函数: `setupAPIInterceptors(page, apiResponses)`
- 需要完成:
  - [ ] 验证 3 个 API 端点 (init, conversations, history)
  - [ ] 解析响应数据结构
  - [ ] 实现响应数据缓存和去重
  - [ ] 添加 API 错误处理

**当前拦截的 API 端点**:
1. `/v2/message/get_by_user_init` - 私信初始化
2. `/v1/stranger/get_conversation_list` - 会话列表
3. `/v1/im/message/history` - 消息历史

**预期响应结构**:
```javascript
// /v2/message/get_by_user_init 示例
{
  data: {
    messages: [
      {
        id: "msg_123456",
        content: "消息内容",
        sender_id: "user_111",
        receiver_id: "user_222",
        timestamp: 1692806400,
        ...
      }
    ]
  }
}
```

---

#### 8B-2: 实现完整对象合并
- 文件: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`
- 函数: `extractCompleteMessageObjects(messages, apiResponses)`
- 需要完成:
  - [ ] 从多个来源合并消息数据
  - [ ] 实现字段优先级策略 (API 数据优先于 DOM 数据)
  - [ ] 处理数据冲突和缺失字段
  - [ ] 验证完整性 (所有必需字段已填充)

**当前代码** (行 336-386):
```javascript
function extractCompleteMessageObjects(messages, apiResponses) {
  const completeMessages = [];
  const messageMap = new Map();

  // 首先从 API 响应中提取消息
  apiResponses.init.forEach(response => {
    if (response.data?.messages) {
      response.data.messages.forEach(msg => {
        messageMap.set(msg.platform_message_id, { ...msg, source: 'api_init' });
      });
    }
  });

  // 合并 DOM 数据和 API 数据
  messages.forEach(msg => {
    let completeMsg = { ...msg };
    if (messageMap.has(msg.platform_message_id)) {
      const apiData = messageMap.get(msg.platform_message_id);
      completeMsg = { ...completeMsg, ...apiData };
    }
    completeMessages.push(completeMsg);
  });

  return completeMessages;
}
```

**改进方向**:
- 实现三层优先级: API > WebSocket > DOM
- 添加数据完整性验证
- 实现消息去重和时间排序

---

### Phase 8C: 集成会话管理 (1 天)

**目标**: 完整实现会话表的数据存储和查询

**具体任务**:

#### 8C-1: 创建会话 DAO
- 文件: `packages/master/src/database/daos/conversation-dao.js` (新建)
- 需要完成:
  - [ ] `createConversation(data)` - 创建会话
  - [ ] `updateConversation(id, data)` - 更新会话
  - [ ] `getConversationsByAccount(accountId)` - 查询账户下的会话
  - [ ] `getConversationWithMessages(conversationId)` - 获取会话和消息

**数据模型**:
```javascript
const conversation = {
  id: "conv_...",
  account_id: "account_123",
  platform_user_id: "user_456",
  platform_user_name: "用户名",
  platform_user_avatar: "https://...",
  is_group: false,
  unread_count: 0,
  platform_message_id: "msg_789",     // 最后一条消息
  last_message_time: 1692806400,
  last_message_content: "最后一条消息内容",
  created_at: 1692806400,
  updated_at: 1692806400
};
```

---

#### 8C-2: 更新直接消息 DAO
- 文件: `packages/master/src/database/daos/direct-message-dao.js` (现有)
- 需要修改:
  - [ ] 添加 `conversation_id` 参数处理
  - [ ] 添加 `createOrUpdateMessage()` 方法 (upsert)
  - [ ] 添加查询方法支持按会话查询
  - [ ] 更新字段名称 (platform_sender_id 等)

---

#### 8C-3: 实现消息保存逻辑
- 文件: `packages/worker/src/handlers/monitor-task.js`
- 需要修改:
  - [ ] 在监控任务中调用新的私信爬虫
  - [ ] 保存会话数据到数据库
  - [ ] 保存消息数据到数据库
  - [ ] 处理数据去重

---

### Phase 8D: 集成测试 (1-2 天)

**目标**: 创建完整的集成测试，验证私信爬虫的功能

**具体任务**:

#### 8D-1: 创建端到端集成测试
- 文件: `tests/integration/douyin-dm-crawl-v2.test.js` (新建)
- 测试场景:
  - [ ] 完整消息历史加载
  - [ ] 会话提取正确性
  - [ ] ID 信息完整性
  - [ ] 数据库存储正确性
  - [ ] 错误处理和重试

**测试用例示例**:
```javascript
describe('Douyin DM Crawl v2', () => {
  test('should load complete message history', async () => {
    // 1. 启动页面和拦截
    // 2. 导航到私信页面
    // 3. 调用 crawlDirectMessagesV2()
    // 4. 验证返回的消息数量和内容
    // 5. 验证会话信息完整性
    // 6. 验证 ID 信息 (platform_message_id, platform_sender_id 等)
  });

  test('should extract complete message objects with all IDs', async () => {
    // 验证每条消息包含所有必需字段
  });

  test('should save conversations and messages to database', async () => {
    // 验证数据库中的会话和消息
  });
});
```

---

#### 8D-2: 创建 API 拦截测试
- 文件: `tests/integration/douyin-api-interception.test.js` (新建)
- 测试内容:
  - [ ] 验证 API 端点被正确拦截
  - [ ] 验证响应数据结构
  - [ ] 验证数据合并逻辑

---

### Phase 8E: 文档和优化 (1 天)

**具体任务**:

#### 8E-1: 更新技术文档
- [ ] 更新 API 端点参考文档
- [ ] 添加虚拟列表提取指南
- [ ] 记录数据流程图

#### 8E-2: 性能优化
- [ ] 优化内存使用 (避免大型消息数组)
- [ ] 实现增量更新 (只爬取新消息)
- [ ] 添加缓存机制

---

## 📝 实现优先级

### 优先级 1 (必需) 🔴
- [x] 数据库模式标准化 (Phase 8A 前置条件)
- [ ] React Fiber 消息提取 (Phase 8A-1)
- [ ] 虚拟列表分页 (Phase 8A-2)
- [ ] API 拦截器 (Phase 8B-1)
- [ ] 完整对象合并 (Phase 8B-2)

### 优先级 2 (重要) 🟠
- [ ] 会话 DAO (Phase 8C-1)
- [ ] 集成测试 (Phase 8D-1)
- [ ] 数据库保存逻辑 (Phase 8C-3)

### 优先级 3 (可选) 🟡
- [ ] 文档更新 (Phase 8E-1)
- [ ] 性能优化 (Phase 8E-2)

---

## 🔗 相关文件和参考

**核心实现文件**:
- `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js` - 主实现
- `packages/master/src/database/schema.sql` - 数据库模式
- `packages/master/src/database/daos/` - 数据访问层

**参考文档**:
- [07-DOUYIN-消息回复功能技术总结.md](07-DOUYIN-消息回复功能技术总结.md) - 技术架构
- [Douyin-IM-API端点参考.md](Douyin-IM-API端点参考.md) - API 端点文档
- [Chrome-DevTools-私信抓取验证指南.md](Chrome-DevTools-私信抓取验证指南.md) - 验证指南

**相关代码**:
- `packages/worker/src/platforms/base/platform-base.js` - 平台基类
- `packages/worker/src/handlers/monitor-task.js` - 监控任务
- `packages/master/src/database/daos/direct-message-dao.js` - 消息 DAO

---

## 📊 时间估算

| 阶段 | 任务 | 时间 | 状态 |
|------|------|------|------|
| 8A | 虚拟列表提取 | 1-2 天 | ⏳ 待开始 |
| 8B | API 拦截整合 | 1-2 天 | ⏳ 待开始 |
| 8C | 会话管理 | 1 天 | ⏳ 待开始 |
| 8D | 集成测试 | 1-2 天 | ⏳ 待开始 |
| 8E | 文档优化 | 1 天 | ⏳ 待开始 |
| **总计** | **Phase 8** | **5-8 天** | 🚀 **进行中** |

---

## 🎯 下一步行动

### 立即开始 (今天)
1. 实现 React Fiber 消息提取优化 (Phase 8A-1)
2. 完善虚拟列表分页逻辑 (Phase 8A-2)

### 后续 (明天)
3. 增强 API 拦截器 (Phase 8B-1)
4. 实现完整对象合并 (Phase 8B-2)

### 后天
5. 创建会话 DAO (Phase 8C-1)
6. 实现集成测试 (Phase 8D-1)

---

**创建时间**: 2024 年 12 月

**最后更新**: 实现计划完成

**下一更新**: Phase 8A 完成后

