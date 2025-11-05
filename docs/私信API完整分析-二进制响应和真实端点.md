# 私信 API 完整分析 - 二进制响应和真实端点

## 时间: 2025-11-05

## 用户发现

> "我看到实际上他请求的是 https://imapi.snssdk.com/v1/message/get_by_conversation"

> "/v2/message/get_by_user_init 这个是二进制流的，你尝试下看看能解析出内容么"

## 核心发现

### 1. 实际的 API 端点（从 F12 观察）

| API 端点 | 域名 | 数据格式 | 用途 |
|---------|------|---------|------|
| `/v2/message/get_by_user_init` | `imapi.snssdk.com` | **二进制流** | 点击会话时获取初始消息 |
| `/v1/message/get_by_conversation` | `imapi.snssdk.com` | ？ | 会话详情/消息历史 ⚠️ 新发现 |
| `/aweme/v1/creator/im/user_detail/` | `creator.douyin.com` | JSON | 会话列表元数据 |

### 2. 二进制响应问题

**当前代码问题**:

`api-interceptor-manager.js` Line 87-98:

```javascript
async parseJSON(response) {
  try {
    return await response.json();  // ❌ 二进制流无法解析为 JSON
  } catch {
    try {
      const text = await response.text();
      return JSON.parse(text);     // ❌ 二进制流转 text 也失败
    } catch {
      return null;                 // ❌ 返回 null，导致回调函数收到空数据
    }
  }
}
```

**结果**:
- `onMessageInitAPI(body)` 收到的 `body` 是 `null`
- 无法提取消息数据
- `apiData.init` 数组始终为空

---

## 二进制数据格式分析

### 可能的格式

1. **Protocol Buffers (Protobuf)**
   - 抖音/字节跳动广泛使用
   - 需要 `.proto` 定义文件才能解析
   - 高效的二进制序列化格式

2. **MessagePack**
   - 类似 JSON 但更紧凑
   - 可以无需定义直接解析

3. **自定义二进制格式**
   - 需要逆向分析
   - 可能加密或压缩

### 识别方法

检查响应头：

```javascript
const contentType = response.headers()['content-type'];
// 可能的值:
// - 'application/x-protobuf'
// - 'application/octet-stream'
// - 'application/x-msgpack'
```

---

## 解决方案

### 方案 1: 修改 APIInterceptorManager 支持二进制

**修改**: `packages/worker/src/platforms/base/api-interceptor-manager.js`

```javascript
/**
 * 解析响应（支持 JSON 和二进制）
 */
async parseResponse(response) {
  const contentType = response.headers()['content-type'] || '';

  // 1. 尝试 JSON
  if (contentType.includes('json')) {
    try {
      return await response.json();
    } catch (error) {
      logger.warn(`Failed to parse JSON: ${error.message}`);
    }
  }

  // 2. 二进制/Protobuf
  if (contentType.includes('protobuf') || contentType.includes('octet-stream')) {
    try {
      const buffer = await response.body();  // 获取原始二进制
      return {
        __binary: true,
        buffer: buffer,
        contentType: contentType,
        url: response.url()
      };
    } catch (error) {
      logger.error(`Failed to get binary buffer: ${error.message}`);
    }
  }

  // 3. 降级：尝试 JSON 解析
  try {
    return await response.json();
  } catch {
    try {
      const text = await response.text();
      return JSON.parse(text);
    } catch {
      // 4. 最后：返回原始文本
      try {
        const text = await response.text();
        return { __text: true, content: text };
      } catch {
        return null;
      }
    }
  }
}
```

**使用**:

```javascript
// 在 enable() 中
const body = await this.parseResponse(response);  // 改用新方法

// 调用处理器时传入 response 对象
for (const handler of handlers) {
  try {
    await handler(body, response);  // ← response 对象也传入
  } catch (error) {
    logger.error(`Handler failed for ${pattern}:`, error);
  }
}
```

### 方案 2: 在回调函数中处理二进制

**修改**: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`

```javascript
/**
 * API 回调：消息初始化（支持二进制）
 */
async function onMessageInitAPI(body, response) {
  // 检查是否为二进制响应
  if (body && body.__binary) {
    logger.info(`[API] 收到二进制响应: ${body.url}`);
    logger.info(`[API] Content-Type: ${body.contentType}`);

    // 尝试解析 Protobuf
    try {
      const decoded = await decodeProtobuf(body.buffer);
      if (decoded && decoded.data && decoded.data.messages) {
        logger.info(`✅ [API] 解码成功: ${decoded.data.messages.length} 条消息`);

        // 使用解码后的数据
        if (globalContext.dataManager) {
          const messages = globalContext.dataManager.batchUpsertMessages(
            decoded.data.messages,
            DataSource.API
          );
          logger.info(`✅ [API] 初始化消息 -> DataManager: ${messages.length} 条`);
        }

        apiData.init.push(decoded);
        return;
      }
    } catch (error) {
      logger.error(`[API] Protobuf 解码失败:`, error);
    }

    // 如果解码失败，记录原始数据
    logger.warn(`⚠️ [API] 无法解析二进制数据，跳过`);
    return;
  }

  // JSON 响应处理（原有逻辑）
  if (!body || !body.data || !body.data.messages) return;

  // ... 原有代码 ...
}
```

### 方案 3: 使用 Playwright 的 har 文件捕获

**捕获二进制数据**:

```javascript
// 在爬虫开始前
const context = await page.context();
await context.tracing.start({
  screenshots: true,
  snapshots: true,
  sources: true
});

// 爬虫执行...

// 保存 trace
await context.tracing.stop({
  path: `./data/traces/douyin-${accountId}-${Date.now()}.zip`
});
```

**从 trace 文件提取数据**:
- 使用 `playwright show-trace trace.zip`
- 在 Network 面板中查看二进制响应
- 导出为 HAR 文件

### 方案 4: 直接从 DOM 提取（降级方案）

如果二进制解析困难，从 React Fiber 或 DOM 提取数据：

```javascript
// 在消息详情页
const messages = await page.evaluate(() => {
  // 方法 1: 从 React Fiber 提取
  const messageElements = document.querySelectorAll('.message-item');
  return Array.from(messageElements).map(el => {
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    if (fiberKey) {
      const fiber = el[fiberKey];
      const data = fiber.return?.return?.memoizedProps;
      return {
        id: data.message_id,
        content: data.content,
        sender_id: data.sender_id,
        create_time: data.create_time
      };
    }
    return null;
  }).filter(Boolean);
});
```

---

## 关于 `/v1/message/get_by_conversation`

您提到看到了这个 API。让我们验证它的存在和用途：

### 可能的触发场景

1. **滚动加载更多历史消息**
   - 当前打开会话后，向上滚动
   - 加载更早的消息

2. **实时消息更新**
   - 通过 WebSocket 连接后
   - 定期轮询新消息

3. **会话切换**
   - 从会话列表点击不同的会话
   - 获取特定会话的消息

### 验证方法

**方法 1: 在当前打开的会话中滚动**

```javascript
// 在 MCP 浏览器中执行
await page.evaluate(() => {
  const messageContainer = document.querySelector('.message-list-container');
  if (messageContainer) {
    // 滚动到顶部，触发加载更多
    messageContainer.scrollTop = 0;
  }
});

// 等待 2 秒
await page.waitForTimeout(2000);

// 检查新的 API 请求
const resources = window.performance.getEntriesByType('resource');
const newAPIs = resources
  .filter(r => r.name.includes('get_by_conversation'))
  .map(r => r.name);
console.log('Found get_by_conversation APIs:', newAPIs);
```

**方法 2: 检查是否有 WebSocket 连接**

```javascript
// 检查 WebSocket
const ws = await page.evaluate(() => {
  // 查找全局的 WebSocket 实例
  if (window.WebSocket && window.WebSocket.prototype) {
    return 'WebSocket available';
  }
  return null;
});
```

---

## 注册新的 API 端点

### 更新代码

**位置**: `packages/worker/src/platforms/douyin/platform.js` Line 92-94

**修改后**:

```javascript
// 私信相关 API
manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);
manager.register('**/v1/message/get_by_conversation**', onMessageConversationAPI);  // ✅ 新增
manager.register('**/creator/im/user_detail/**', onConversationListAPI);
manager.register('**/v1/im/message/history**', onMessageHistoryAPI);  // 保留（可能未使用）
```

### 新增回调函数

**位置**: `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`

```javascript
/**
 * API 回调：会话消息（新发现的端点）
 * 由 platform.js 注册到 APIInterceptorManager
 * API: /v1/message/get_by_conversation
 */
async function onMessageConversationAPI(body, response) {
  logger.info(`[API] /v1/message/get_by_conversation 被触发`);

  // 检查是否为二进制
  if (body && body.__binary) {
    logger.info(`[API] 收到二进制响应，长度: ${body.buffer.length} 字节`);

    // 尝试解析
    try {
      const decoded = await decodeProtobuf(body.buffer);
      if (decoded && decoded.messages) {
        logger.info(`✅ [API] 解码成功: ${decoded.messages.length} 条消息`);

        // 存储到 apiData
        apiData.history.push(decoded);

        // 使用 DataManager
        if (globalContext.dataManager) {
          globalContext.dataManager.batchUpsertMessages(
            decoded.messages,
            DataSource.API
          );
        }

        return;
      }
    } catch (error) {
      logger.error(`[API] 解码失败:`, error);
    }
  }

  // JSON 响应
  if (body && body.messages) {
    logger.info(`✅ [API] JSON 响应: ${body.messages.length} 条消息`);
    apiData.history.push(body);

    if (globalContext.dataManager) {
      globalContext.dataManager.batchUpsertMessages(
        body.messages,
        DataSource.API
      );
    }
  }
}
```

**导出函数**:

```javascript
module.exports = {
  // API 回调函数
  onMessageInitAPI,
  onConversationListAPI,
  onMessageHistoryAPI,
  onMessageConversationAPI,  // ✅ 新增

  // 爬取函数
  crawlDirectMessagesV2,

  // 全局上下文
  globalContext,
  apiData
};
```

---

## Protobuf 解码实现

### 方案 A: 使用 protobufjs（推荐）

**安装依赖**:

```bash
cd packages/worker
npm install protobufjs
```

**实现解码器**:

```javascript
const protobuf = require('protobufjs');

/**
 * 解码 Protobuf 二进制数据（通用方法）
 * @param {Buffer} buffer - 二进制数据
 * @returns {Object} 解码后的对象
 */
async function decodeProtobuf(buffer) {
  try {
    // 方法 1: 动态解码（无需 .proto 文件）
    // protobufjs 可以尝试自动推断结构
    const reader = protobuf.Reader.create(buffer);

    // 读取字段
    const result = {};
    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      const field = tag >>> 3;
      const wireType = tag & 7;

      switch (wireType) {
        case 0: // varint
          result[`field_${field}`] = reader.int64();
          break;
        case 1: // fixed64
          result[`field_${field}`] = reader.fixed64();
          break;
        case 2: // length-delimited (string, bytes, embedded messages)
          const bytes = reader.bytes();

          // 尝试解析为字符串
          try {
            result[`field_${field}`] = bytes.toString('utf8');
          } catch {
            // 可能是嵌套的 message
            result[`field_${field}`] = bytes;
          }
          break;
        case 5: // fixed32
          result[`field_${field}`] = reader.fixed32();
          break;
        default:
          reader.skipType(wireType);
      }
    }

    return result;
  } catch (error) {
    logger.error(`Protobuf 解码失败:`, error);
    return null;
  }
}
```

### 方案 B: 从浏览器中提取 .proto 定义

**步骤**:

1. 在 F12 中找到 Protobuf 编译后的 JavaScript 文件
2. 搜索 `proto3` 或 `syntax = "proto3"`
3. 提取 `.proto` 定义文件
4. 使用 protobufjs 加载定义

**示例**:

```javascript
const root = await protobuf.load('douyin-im.proto');
const MessageList = root.lookupType('douyin.im.MessageList');

// 解码
const message = MessageList.decode(buffer);
const object = MessageList.toObject(message);

console.log(object);
// {
//   messages: [
//     { id: 'xxx', content: 'xxx', sender_id: 'xxx', ... },
//     ...
//   ]
// }
```

---

## 完整的数据流（更新）

### 实际触发的 API

```
页面加载
  ↓
GET /aweme/v1/creator/im/user_detail/
  ↓ 返回会话列表（JSON）
  {
    "user_list": [...]  ✅
  }
  ↓
点击会话
  ↓
GET /v2/message/get_by_user_init  ⚠️ 二进制 Protobuf
  ↓ 返回消息列表（二进制）
  <binary data>  ❌ 当前代码无法解析
  ↓
（可能）滚动消息列表
  ↓
GET /v1/message/get_by_conversation  ⚠️ 新发现
  ↓ 返回更多消息
  ？（需要验证）
```

---

## 行动计划

### 立即可做（无需解析二进制）

1. **注册 `/v1/message/get_by_conversation` API**
   - 添加到 `platform.js`
   - 创建回调函数
   - 验证是否触发

2. **修改 API 拦截器**
   - 支持二进制响应
   - 传递 `response` 对象到回调

3. **添加日志**
   - 记录所有 API 触发
   - 输出响应类型（JSON/Binary）
   - 保存二进制数据到文件以便分析

### 中期方案（需要逆向）

1. **解析 Protobuf**
   - 提取 `.proto` 定义
   - 实现解码器
   - 验证数据结构

2. **测试完整流程**
   - 点击 41 个会话
   - 捕获所有 API 响应
   - 验证消息提取

### 降级方案（如果二进制难以解析）

1. **从 DOM 提取**
   - 使用 React Fiber
   - 直接读取页面元素
   - 优先级: API > DOM

2. **使用 HAR 文件**
   - Playwright tracing
   - 手动分析二进制
   - 离线解码

---

## 总结

### 关键发现

1. ✅ `/v2/message/get_by_user_init` 确实存在，但**返回二进制**
2. ✅ `/v1/message/get_by_conversation` 是**新发现的端点**
3. ❌ 当前代码无法解析二进制响应
4. ❌ `apiData.init` 可能始终为空（因为返回 null）

### 为什么爬虫返回 0 消息？

**根本原因**:

1. 点击会话触发 `/v2/message/get_by_user_init`
2. API 返回二进制 Protobuf 数据
3. `parseJSON()` 无法解析，返回 `null`
4. `onMessageInitAPI(body)` 收到 `body = null`
5. `if (!body || !body.data || !body.data.messages) return;` ← 直接返回
6. `apiData.init` 为空，无消息数据

**另外**:

- 虚拟列表滚动问题仍然存在
- 但即使解决滚动，二进制解析问题也会导致 0 消息

### 下一步

1. **最优先**: 修改 API 拦截器支持二进制
2. **次优先**: 注册 `/v1/message/get_by_conversation` 并验证
3. **备选**: 实现 Protobuf 解码器
4. **降级**: 从 DOM/React Fiber 提取数据

### 相关文件

- `packages/worker/src/platforms/base/api-interceptor-manager.js` - 需要修改
- `packages/worker/src/platforms/douyin/platform.js` - 添加新 API
- `packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js` - 处理二进制
