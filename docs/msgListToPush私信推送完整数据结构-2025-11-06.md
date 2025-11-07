# msgListToPush 私信推送完整数据结构

**文档版本**: v1.0
**创建日期**: 2025-11-06
**测试状态**: ✅ 已验证
**重要程度**: ⭐⭐⭐⭐⭐

## 概述

`msgListToPush` 是 `imStore` 中的私信推送缓冲区,类似于 `noticeStore.noticePushList` 用于评论通知。

### 关键发现

✅ **实时捕获**: WebSocket 推送的新私信会立即出现在此数组中
✅ **数据完整**: 包含消息ID、内容、发送者、时间戳等所有关键字段
✅ **无需UI交互**: 无需打开聊天窗口即可获取完整消息数据
✅ **临时缓冲**: 消息推送到DOM后会从数组中清除

---

## 1. 完整字段列表

### 1.1 顶层字段 (19个)

| 字段名 | 类型 | 说明 | 示例值 |
|--------|------|------|--------|
| `serverId` | string | 消息服务器ID | `"7569506616438605362"` |
| `content` | string | 消息内容(JSON字符串) | `"{\"type\":0,\"text\":\"123\"...}"` |
| `sender` | string | 发送者UID(明文) | `"106228603660"` |
| `secSender` | string | 发送者加密ID | `"MS4wLjABAAAA..."` |
| `conversationId` | string | 会话ID | `"0:1:106228603660:3607962860399156"` |
| `conversationShortId` | string | 会话短ID | `"7569477353416573440"` |
| `conversationBizType` | number | 会话业务类型 | `1` |
| `type` | number | 消息类型 | `7` (文本消息) |
| `createdAt` | string (ISO) | 创建时间 | `"2025-11-06T07:11:48.206Z"` |
| `serverStatus` | number | 服务器状态 | `0` |
| `source` | number | 消息来源 | `1` |
| `isOffline` | boolean | 是否离线消息 | `false` |
| `indexInConversation` | object | 会话内索引 | `{low, high, unsigned}` |
| `indexInConversationV2` | object | 会话内索引v2 | `{low, high, unsigned}` |
| `orderInConversation` | object | 会话内顺序 | `{low, high, unsigned}` |
| `version` | object | 版本号 | `{low: 0, high: 0}` |
| `property` | object | 属性对象 | `{}` |
| `ext` | object | 扩展字段(26个子字段) | 见下文 |
| `__internal_ctx` | object | 内部上下文 | SDK配置信息 |

---

## 2. 核心字段详解

### 2.1 content 字段(JSON字符串)

需要使用 `JSON.parse()` 解析:

```javascript
const contentObj = JSON.parse(message.content);
```

**解析后的结构**:

```json
{
  "type": 0,                    // 内容类型: 0=文本
  "instruction_type": 0,
  "item_type_local": -1,
  "text": "123",               // ⭐ 消息文本内容
  "richTextInfos": [],         // 富文本信息
  "is_card": false,            // 是否卡片消息
  "msgHint": "",               // 消息提示
  "aweType": 700,              // AWE类型
  "createdAt": 0
}
```

**关键字段**:
- `text`: 消息文本内容
- `type`: 0=普通文本, 其他值=特殊消息类型
- `richTextInfos`: @提及、表情等富文本信息
- `is_card`: 卡片消息(分享链接、视频等)

---

### 2.2 ext 扩展字段(26个子字段)

```javascript
{
  // 消息追踪
  "s:server_message_create_time": "1762413108265",  // 服务器创建时间戳
  "s:client_message_id": "159d20b8-e253-42a0-963d-54d348fee7ca",  // 客户端消息ID
  "old_client_message_id": "1762413107799",
  "im_sdk_client_send_msg_time": "1762413108154",    // SDK发送时间
  "im_client_send_msg_time": "1762413108135",        // 客户端发送时间
  "s:local_logid": "02176241310818300000000000000000000ffff0aca2ce77d307c",

  // 会话信息
  "a:relation_type": "1:1",              // 关系类型: 1:1=单聊
  "s:is_stranger": "false",              // 是否陌生人
  "a:msg_scene": "1",                    // 消息场景
  "chat_scene": "normal",                // 聊天场景

  // 业务配置
  "a:biz": "douyin",                     // 业务类型
  "s:biz_aid": "1128",                   // 业务AppID
  "s:s_aid": "1128",                     // 源AppID
  "source_aid": "1128",

  // 安全相关
  "s:vcd_shark_decision": "PASS",        // VCD鲨鱼决策
  "s:vcd_shark_detail": "",              // VCD详情
  "im_callback_status_code": "0",        // 回调状态码

  // 同步相关
  "s:sync_2_newdx": "1",                 // 同步到新DX
  "a:sync2dx": "1",

  // 其他配置
  "a:enter_method": "click_message",     // 进入方式
  "a:access": "douyin_main",             // 访问来源
  "s:mode": "0",                         // 模式
  "s:ticket_mode": "0",                  // Ticket模式
  "a:plv": "0",                          // PLV值
  "a:ntp_ready": "2",                    // NTP就绪状态
  "s:saas_sdk": "false"                  // SaaS SDK标识
}
```

---

### 2.3 __internal_ctx 内部上下文

包含完整的 IM SDK 配置信息:

```javascript
{
  "initResult": 3,
  "cachedToken": "hash.c5HoZ01OzCIHEf4onMplz18dQLj6HxZvl8gHzaZboFw=",
  "id": "22328782-bdbf-49ef-9383-1e84754ca651",
  "config": {},
  "option": {
    "appId": 6383,
    "userId": "3607962860399156",      // 当前登录用户ID
    "deviceId": "7563144483933275675",  // 设备ID
    "biz": "douyin_web",
    "apiUrl": "https://imapi.douyin.com",
    "frontierUrl": "wss://frontier-im.douyin.com/ws/v2",  // WebSocket地址
    "devicePlatform": "douyin_pc",
    "timeout": 30000,
    "pullInterval": 120000,             // 拉取间隔
    "debug": true,
    "webSocketLevel": 1,
    "sdkType": "im-web-sdk"
    // ... 更多配置
  }
}
```

---

## 3. 工作机制

### 3.1 数据流程

```
WebSocket推送
    ↓
msgListToPush数组 (临时缓冲)
    ↓
React组件渲染到DOM
    ↓
数组清空 (等待下一次推送)
```

### 3.2 生命周期

1. **推送阶段**: WebSocket收到新消息 → 立即添加到 `msgListToPush`
2. **缓冲阶段**: 消息暂存在数组中(几十毫秒到几秒)
3. **渲染阶段**: React读取数组并渲染到聊天列表
4. **清空阶段**: 渲染完成后数组被清空
5. **循环**: 等待下一次推送

### 3.3 时间窗口

- **捕获窗口**: 非常短暂(通常 < 1秒)
- **推荐监控频率**: 500ms - 1000ms
- **错过概率**: 如果监控间隔 > 2秒,可能错过消息

---

## 4. 实时监控方案

### 4.1 轮询监控(推荐)

```javascript
// 每秒检查一次
setInterval(() => {
  const imStore = extractImStore();
  const msgListToPush = imStore.msgListToPush || [];

  if (msgListToPush.length > 0) {
    msgListToPush.forEach(msg => {
      const content = JSON.parse(msg.content);

      console.log('新私信:', {
        消息ID: msg.serverId,
        发送者UID: msg.sender,
        发送者加密ID: msg.secSender,
        消息文本: content.text,
        会话ID: msg.conversationId,
        时间: msg.createdAt,
        是否离线: msg.isOffline
      });

      // 推送到服务器
      sendToServer({
        type: 'direct_message',
        messageId: msg.serverId,
        fromUserId: msg.sender,
        fromUserSecId: msg.secSender,
        content: content.text,
        conversationId: msg.conversationId,
        timestamp: msg.createdAt
      });
    });
  }
}, 1000);
```

### 4.2 React Fiber提取函数

```javascript
function extractImStore() {
  // 方法1: 从IM入口按钮提取
  const imButton = document.querySelector('[data-e2e="im-entry"]');
  if (imButton) {
    const fiberKey = Object.keys(imButton).find(k => k.startsWith('__reactFiber'));
    if (fiberKey) {
      let fiber = imButton[fiberKey];
      let depth = 0;

      while (fiber && depth < 30) {
        if (fiber.memoizedProps?.imStore) {
          return fiber.memoizedProps.imStore;
        }
        fiber = fiber.return;
        depth++;
      }
    }
  }

  // 方法2: 遍历元素查找
  const elements = document.querySelectorAll('*');
  for (let i = 0; i < Math.min(elements.length, 500); i++) {
    const el = elements[i];
    const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) continue;

    let fiber = el[fiberKey];
    let depth = 0;

    while (fiber && depth < 20) {
      if (fiber.memoizedProps?.imStore) {
        return fiber.memoizedProps.imStore;
      }
      fiber = fiber.return;
      depth++;
    }
  }

  return null;
}
```

---

## 5. 与其他数据源对比

### 5.1 三种数据源比较

| 特性 | msgListToPush | converSationListOrigin | API拦截 |
|------|---------------|------------------------|---------|
| **实时性** | ⭐⭐⭐⭐⭐ 最快 | ⭐⭐⭐⭐ 快 | ⭐⭐⭐⭐⭐ 最快 |
| **数据完整性** | ⭐⭐⭐⭐⭐ 完整 | ⭐⭐⭐⭐ 较完整 | ⭐⭐⭐⭐⭐ 完整 |
| **捕获难度** | ⭐⭐⭐ 中等(时间窗口短) | ⭐⭐⭐⭐⭐ 容易 | ⭐⭐ 困难(需拦截) |
| **稳定性** | ⭐⭐⭐⭐ 稳定 | ⭐⭐⭐⭐⭐ 非常稳定 | ⭐⭐⭐ 较稳定 |
| **历史消息** | ❌ 仅实时 | ✅ 最后一条 | ❌ 仅实时 |
| **用户信息** | ⚠️ 仅UID | ✅ 完整用户信息 | ⚠️ 看API |

### 5.2 推荐方案

**混合方案(最佳)**:

```javascript
// 主方案: msgListToPush (实时捕获新消息)
setInterval(() => {
  const msgListToPush = imStore.msgListToPush || [];
  if (msgListToPush.length > 0) {
    handleNewMessages(msgListToPush);
  }
}, 1000);

// 备用方案: converSationListOrigin (补充用户信息)
function enrichMessageWithUserInfo(message) {
  const conversation = imStore.converSationListOrigin.find(
    conv => conv.conversationId === message.conversationId
  );

  if (conversation) {
    return {
      ...message,
      userInfo: {
        nickname: conversation.participant?.nickname,
        avatar: conversation.participant?.avatarThumb?.url_list[0],
        followStatus: conversation.participant?.follow_status
      }
    };
  }

  return message;
}
```

---

## 6. 常见问题(FAQ)

### Q1: msgListToPush 为什么经常是空数组?

**A**: 因为它是临时缓冲区,消息渲染后立即清空。需要高频监控(建议1秒间隔)才能捕获。

---

### Q2: 如何确保不漏消息?

**A**: 采用三重保障:
1. msgListToPush 轮询(1秒间隔)
2. converSationListOrigin 对比未读数
3. WebSocket 拦截作为最后保障

---

### Q3: content 字段是什么格式?

**A**: JSON字符串,需要 `JSON.parse(message.content)` 解析才能获取 `text` 等字段。

---

### Q4: 如何获取发送者的昵称和头像?

**A**: msgListToPush 只有 `sender` (UID) 和 `secSender`,需要从 `converSationListOrigin` 中查找对应的会话来补充用户信息。

---

### Q5: 消息类型(type字段)有哪些值?

**A**: 常见类型:
- `7`: 普通文本消息
- 其他值: 需要进一步测试(图片、视频、卡片等)

---

## 7. 测试验证数据

### 7.1 测试环境

- **测试时间**: 2025-11-06 15:11:47
- **测试方法**: 发送文本消息 "123"
- **捕获结果**: ✅ 成功捕获

### 7.2 完整测试数据

```json
{
  "serverId": "7569506616438605362",
  "type": 7,
  "sender": "106228603660",
  "secSender": "MS4wLjABAAAAhQl-Xyl8opYFwpzFnm93Zt9Rp9H-1C40VCZ4y5YLnDk",
  "conversationId": "0:1:106228603660:3607962860399156",
  "conversationShortId": "7569477353416573440",
  "conversationBizType": 1,
  "content": "{\"type\":0,\"instruction_type\":0,\"item_type_local\":-1,\"richTextInfos\":[],\"text\":\"123\",\"createdAt\":0,\"is_card\":false,\"msgHint\":\"\",\"aweType\":700}",
  "createdAt": "2025-11-06T07:11:48.206Z",
  "serverStatus": 0,
  "source": 1,
  "isOffline": false,
  "indexInConversation": {
    "low": -814605360,
    "high": 389409,
    "unsigned": false
  },
  "indexInConversationV2": {
    "low": 13,
    "high": 0,
    "unsigned": false
  },
  "orderInConversation": {
    "low": 1438426240,
    "high": 389409810,
    "unsigned": false
  },
  "version": {
    "low": 0,
    "high": 0,
    "unsigned": false
  },
  "property": {},
  "ext": {
    "s:ticket_mode": "0",
    "a:plv": "0",
    "a:enter_method": "click_message",
    "a:msg_scene": "1",
    "a:relation_type": "1:1",
    "a:ntp_ready": "2",
    "s:is_stranger": "false",
    "a:access": "douyin_main",
    "s:mode": "0",
    "s:s_aid": "1128",
    "source_aid": "1128",
    "s:sync_2_newdx": "1",
    "a:biz": "douyin",
    "s:biz_aid": "1128",
    "im_callback_status_code": "0",
    "s:vcd_shark_decision": "PASS",
    "s:server_message_create_time": "1762413108265",
    "a:sync2dx": "1",
    "s:vcd_shark_detail": "",
    "s:client_message_id": "159d20b8-e253-42a0-963d-54d348fee7ca",
    "old_client_message_id": "1762413107799",
    "im_sdk_client_send_msg_time": "1762413108154",
    "chat_scene": "normal",
    "s:saas_sdk": "false",
    "im_client_send_msg_time": "1762413108135",
    "s:local_logid": "02176241310818300000000000000000000ffff0aca2ce77d307c"
  }
}
```

---

## 8. 实际应用示例

### 8.1 完整监控系统

```javascript
class DouyinMessageMonitor {
  constructor() {
    this.lastMsgCount = 0;
    this.processedMessageIds = new Set();
  }

  start() {
    setInterval(() => {
      this.checkNewMessages();
    }, 1000);
  }

  checkNewMessages() {
    const imStore = this.extractImStore();
    if (!imStore) return;

    const msgListToPush = imStore.msgListToPush || [];

    msgListToPush.forEach(msg => {
      // 防止重复处理
      if (this.processedMessageIds.has(msg.serverId)) {
        return;
      }

      this.processedMessageIds.add(msg.serverId);

      // 解析内容
      const content = JSON.parse(msg.content);

      // 补充用户信息
      const conversation = imStore.converSationListOrigin.find(
        conv => conv.conversationId === msg.conversationId
      );

      const messageData = {
        // 基本信息
        messageId: msg.serverId,
        content: content.text,
        timestamp: msg.createdAt,

        // 发送者信息
        fromUserId: msg.sender,
        fromUserSecId: msg.secSender,
        fromUserNickname: conversation?.participant?.nickname || '未知',
        fromUserAvatar: conversation?.participant?.avatarThumb?.url_list[0],

        // 会话信息
        conversationId: msg.conversationId,
        conversationShortId: msg.conversationShortId,

        // 状态
        isOffline: msg.isOffline,
        type: msg.type
      };

      // 推送到服务器
      this.sendToServer(messageData);

      console.log('新私信:', messageData);
    });
  }

  extractImStore() {
    // ... (同上)
  }

  sendToServer(data) {
    fetch('/api/douyin/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }
}

// 启动监控
const monitor = new DouyinMessageMonitor();
monitor.start();
```

---

## 9. 与 noticePushList 对比总结

### 9.1 相似点

✅ 都是临时推送缓冲区
✅ 都包含完整数据
✅ 都需要高频轮询
✅ 都在渲染后清空

### 9.2 差异点

| 特性 | msgListToPush (私信) | noticePushList (评论) |
|------|---------------------|----------------------|
| **位置** | imStore | noticeStore |
| **数据来源** | IM WebSocket | 通知WebSocket |
| **content格式** | JSON字符串(需解析) | 直接对象 |
| **用户信息** | 仅UID | 完整用户对象 |
| **会话信息** | ✅ 包含 | ❌ 不包含 |

---

## 10. 总结

### 10.1 核心价值

🎯 **msgListToPush = 私信的 noticePushList**

- 无需打开聊天窗口
- 无需拦截WebSocket
- 纯React Fiber提取
- 数据100%完整

### 10.2 推荐方案

**统一监控系统**:

```javascript
// 同时监控私信和评论
setInterval(() => {
  // 私信监控
  const msgListToPush = imStore.msgListToPush || [];
  handleMessages(msgListToPush);

  // 评论监控
  const noticePushList = noticeStore.noticePushList || [];
  handleComments(noticePushList);
}, 1000);
```

### 10.3 数据完整度

- ✅ 消息ID: 100%
- ✅ 消息内容: 100%
- ✅ 发送者UID: 100%
- ✅ 发送者加密ID: 100%
- ✅ 会话ID: 100%
- ✅ 时间戳: 100%
- ⚠️ 发送者昵称: 需从会话列表补充
- ⚠️ 发送者头像: 需从会话列表补充

---

## 11. 下一步计划

1. ✅ 验证 msgListToPush 可行性
2. 📝 创建统一监控系统(msgListToPush + noticePushList)
3. 🔄 更新主文档添加 msgListToPush 章节
4. 🧪 测试其他消息类型(图片、视频、卡片)
5. 📊 性能优化和错误处理

---

**文档状态**: ✅ 已完成
**测试状态**: ✅ 已验证
**实施状态**: 🔄 待集成到生产系统
