# 私信 API 端点修正 - 实际网络请求分析

## 时间: 2025-11-05

## 重大发现

通过 MCP 浏览器实际抓取网络请求，发现之前文档中描述的 API 端点 **有误**！

### ❌ 之前的错误假设

```
消息历史 API: /v1/im/message/history
触发时机: 点击会话后
```

### ✅ 实际的 API 端点

```
消息初始化 API: /v2/message/get_by_user_init
触发时机: 点击会话后
域名: https://imapi.snssdk.com
```

---

## 实际网络请求分析

### 测试环境

- 页面: https://creator.douyin.com/creator-micro/data/following/chat
- 当前打开的会话: "叶苏夏"
- 测试时间: 12:56:25 - 12:56:33

### 捕获到的 API 请求

#### 1. 会话列表 API（重复调用）

**API**: `/aweme/v1/creator/im/user_detail/`

**触发频率**: 非常频繁（8 秒内调用 10+ 次）

**触发时机**:
- 页面加载时
- 滚动会话列表时
- 切换会话时

**域名**: `https://creator.douyin.com`

**示例时间戳**:
```
12:56:27
12:56:28
12:56:29
12:56:31
12:56:32
12:56:33
```

**返回数据**: 会话元数据（用户 ID、名称、头像）

---

#### 2. 消息初始化 API ⚠️ **关键发现**

**API**: `/v2/message/get_by_user_init`

**触发频率**: 与会话列表 API 配对出现

**触发时机**:
- ✅ **点击进入会话后立即触发**
- 每次打开会话都会触发一次

**域名**: `https://imapi.snssdk.com` （注意：不同的域名！）

**示例时间戳**:
```
12:56:25  (1403.30ms)
12:56:27  (1285.50ms)
12:56:28  (1202.90ms)
12:56:29  (1212.30ms)
12:56:31  (1275.70ms)
12:56:32  (1265.10ms)
```

**返回数据**: **该会话的完整消息历史** ✅

**请求耗时**: 约 1200-1400ms（较慢，需要等待）

---

#### 3. 未发现的 API

**❌ 未找到**: `/v1/im/message/history`

**结论**: 之前文档中描述的 `/v1/im/message/history` API **不存在**或**未被使用**

---

## 实际的数据流

### 点击会话后的完整流程

```
用户点击会话 "叶苏夏"
  ↓
触发 API 1: GET /aweme/v1/creator/im/user_detail/
  ↓ 返回会话元数据（207ms）
  {
    "user_list": [
      {
        "user_id": "xxx",
        "user": {
          "nickname": "叶苏夏",
          "avatar_thumb": {...}
        }
      }
    ]
  }
  ↓
触发 API 2: GET /v2/message/get_by_user_init  ⚠️ 关键!
  ↓ 返回完整消息历史（1285ms）
  {
    "data": {
      "messages": [
        {
          "id": "msg_xxx",
          "content": "[表情]",
          "sender_id": "xxx",
          "create_time": 1730812345,
          ...
        },
        ...
      ],
      "has_more": false,
      "cursor": "..."
    }
  }
  ↓
页面渲染消息列表
```

---

## 代码修正

### 当前代码中的 API 注册

**位置**: `packages/worker/src/platforms/douyin/platform.js` Line 91-94

```javascript
// 私信相关 API
manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);  // ✅ 正确
manager.register('**/creator/im/user_detail/**', onConversationListAPI);  // ✅ 正确
manager.register('**/v1/im/message/history**', onMessageHistoryAPI);      // ❌ 可能无用
```

### ✅ 好消息：代码已经正确！

我们的代码已经注册了 `/v2/message/get_by_user_init` API，这是正确的！

**回调函数**: `onMessageInitAPI()`

**位置**: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js` Line 106-128

```javascript
/**
 * API 回调：消息初始化
 * 由 platform.js 注册到 APIInterceptorManager
 */
async function onMessageInitAPI(body) {
  if (!body || !body.data || !body.data.messages) return;

  // ✅ 使用 DataManager（如果可用）
  if (globalContext.dataManager && body.data.messages.length > 0) {
    try {
      const messages = globalContext.dataManager.batchUpsertMessages(
        body.data.messages,
        DataSource.API
      );
      logger.info(`✅ [API] 初始化消息 -> DataManager: ${messages.length} 条`);
    } catch (error) {
      logger.error(`[API] 初始化消息处理失败:`, error);
    }
  }

  // 保留旧逻辑用于调试
  apiData.init.push(body);
  logger.debug(`收集到初始化消息: ${body.data.messages.length} 条`);
}
```

---

## 数据存储验证

### apiData 结构

```javascript
apiData = {
  init: [],            // ✅ 存储 /v2/message/get_by_user_init 响应
  conversations: [],   // ✅ 存储 /aweme/v1/creator/im/user_detail/ 响应
  history: [],         // ❌ 可能为空（因为对应的 API 未触发）
  cache: {...}
};
```

### 实际数据来源

| 数据源 | API 端点 | 触发时机 | 包含数据 | 重要性 |
|-------|---------|---------|---------|--------|
| `apiData.init` | `/v2/message/get_by_user_init` | 点击会话 | ✅ **完整消息** | ⭐⭐⭐ 最重要 |
| `apiData.conversations` | `/aweme/v1/creator/im/user_detail/` | 页面加载/滚动 | 会话元数据 | ⭐⭐ 重要 |
| `apiData.history` | `/v1/im/message/history` | ❌ 未触发 | 无数据 | ❌ 可能无用 |

---

## `/v1/im/message/history` 可能的情况

### 情况 1: 仅用于历史消息分页

**假设**: 该 API 仅在滚动加载更多历史消息时触发

**验证**: 需要在消息详情页向上滚动，加载更早的消息

### 情况 2: 已被 `/v2/message/get_by_user_init` 替代

**假设**: 抖音更新了 API，使用 v2 版本替代了 v1

**证据**:
- ✅ v2 API 返回完整消息
- ✅ v2 API 响应时间较长（1200-1400ms）
- ✅ 未观察到 v1 API 被调用

### 情况 3: 用于 WebSocket 实时消息

**假设**: `/v1/im/message/history` 用于 WebSocket 连接后的实时消息推送

**验证**: 需要检查是否有 WebSocket 连接

---

## 修正后的完整数据流

### Phase 1: 会话列表加载

```
页面加载
  ↓
GET /aweme/v1/creator/im/user_detail/
  ↓
apiData.conversations.push(body)
  ↓
提取 41 个会话元数据（不含消息）
```

### Phase 2: 逐个打开会话

```
for (let i = 0; i < 41; i++) {
  // 步骤 1: 滚动到会话 i
  scrollVirtualListToIndex(page, i)

  // 步骤 2: 点击会话 i
  openConversationByIndex(page, conversation, i)

  // 步骤 3: 触发 API（自动）
  ↓
  GET /v2/message/get_by_user_init  ⚠️ 关键
  ↓
  onMessageInitAPI() 被调用
  ↓
  apiData.init.push(body)  ✅ 存储消息
  ↓

  // 步骤 4: 返回会话列表
  page.goBack()
}
```

### Phase 3: 数据合并

```javascript
// 从 apiData.init 提取所有消息
const apiSources = [
  { type: 'init', responses: apiData.init },       // ✅ 主要数据源
  { type: 'history', responses: apiData.history }, // ❌ 可能为空
  { type: 'conversations', responses: apiData.conversations } // 仅元数据
];

apiSources.forEach(source => {
  source.responses.forEach(response => {
    if (response.data?.messages) {
      // 提取消息
      response.data.messages.forEach(msg => {
        messageMap.set(msg.id, msg);
      });
    }
  });
});
```

---

## 关键结论

### ✅ 正确的理解

1. **消息 API**: `/v2/message/get_by_user_init` （不是 `/v1/im/message/history`）
2. **触发时机**: 点击进入会话后立即触发
3. **代码状态**: **已经正确注册和处理** ✅
4. **数据来源**: `apiData.init[]` 包含所有消息

### ❌ 之前的误解

1. ~~消息 API 是 `/v1/im/message/history`~~ （未观察到）
2. ~~需要滚动消息列表才触发~~ （点击即触发）
3. ~~apiData.history 是主要数据源~~ （应该是 apiData.init）

### 🤔 待验证的问题

1. **`/v1/im/message/history` 何时触发？**
   - 可能仅在滚动加载更多历史消息时
   - 可能已被弃用

2. **`apiData.history` 是否始终为空？**
   - 需要在实际运行中验证
   - 如果为空，可以移除相关代码

3. **WebSocket 是否也推送消息？**
   - 需要检查 WebSocket 连接
   - 可能用于实时新消息推送

---

## 代码验证建议

### 1. 检查 API 拦截器日志

运行爬虫后，检查日志输出：

```bash
# 应该看到:
✅ [API] 初始化消息 -> DataManager: X 条
# 来自 onMessageInitAPI()

# 检查是否有:
✅ [API] 历史消息 -> DataManager: X 条
# 来自 onMessageHistoryAPI()
```

### 2. 检查 apiData 内容

在 `crawl-direct-messages-v2.js` Line 234 添加详细日志：

```javascript
logger.info(`[DEBUG] API数据详细状态:`);
logger.info(`  - apiData.init: ${apiData.init.length} 个响应`);
logger.info(`  - apiData.conversations: ${apiData.conversations.length} 个响应`);
logger.info(`  - apiData.history: ${apiData.history.length} 个响应`);

// 详细内容
if (apiData.init.length > 0) {
  const totalMessages = apiData.init.reduce((sum, resp) => {
    return sum + (resp.data?.messages?.length || 0);
  }, 0);
  logger.info(`  - apiData.init 总消息数: ${totalMessages}`);
}
```

### 3. 验证消息提取

在 `mergeAPIandDOMMessages()` 函数中添加日志：

```javascript
logger.info(`[mergeAPIandDOMMessages] 数据源统计:`);
logger.info(`  - init 响应: ${apiData.init.length}`);
logger.info(`  - history 响应: ${apiData.history.length}`);
logger.info(`  - 从 API 提取的消息: ${messageMap.size}`);
```

---

## 更新文档

需要更新以下文档中的错误信息：

1. **`docs/私信消息API数据提取机制分析.md`**
   - 修正 API 端点名称
   - 更新数据流图
   - 修正优先级说明

2. **`docs/私信爬虫0消息问题-根本原因和完整修复方案.md`**
   - 修正 API 端点名称
   - 更新预期效果

3. **代码注释**
   - `packages/worker/src/platforms/douyin/platform.js` Line 94
   - 添加说明 `/v1/im/message/history` 的实际用途

---

## 总结

### 用户的敏锐观察 ✅

您在 F12 中没有看到 `/v1/im/message/history`，这个观察**完全正确**！

### 实际情况

- ✅ 消息 API 是 `/v2/message/get_by_user_init`
- ✅ 代码已经正确处理
- ✅ `apiData.init` 是主要数据源
- ❌ `/v1/im/message/history` 可能未使用或仅用于特定场景

### 核心解决方案不变

虚拟列表滚动 + 点击会话的方案仍然正确：
1. 滚动到目标会话
2. 点击会话（触发 `/v2/message/get_by_user_init`）
3. API 拦截器自动捕获
4. 从 `apiData.init` 提取消息

### 下一步

1. ✅ 实施虚拟列表滚动方案
2. ✅ 验证 `apiData.init` 包含所有消息
3. 🔍 确认 `apiData.history` 是否始终为空
4. 📝 更新文档中的 API 端点名称
