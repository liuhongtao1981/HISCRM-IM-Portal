# 抖音私信API - Protobuf二进制响应分析

## 时间: 2025-11-05

## API基本信息

### 端点详情

```
URL: https://imapi.snssdk.com/v2/message/get_by_user_init
方法: GET
Content-Type: application/x-protobuf (或 application/octet-stream)
响应格式: Protocol Buffers (二进制)
```

### 实际观测数据

通过MCP浏览器的 Performance API 分析：

```javascript
{
  "url": "https://imapi.snssdk.com/v2/message/get_by_user_init",
  "duration": 1303ms,
  "size": 29868 bytes,
  "type": "xmlhttprequest"
}
```

**触发时机**：
- 页面加载时自动触发
- 观测到6次请求（可能对应不同的会话批次或分页）
- 响应大小: 19KB - 34KB

**不会触发**：
- ❌ 点击会话时
- ❌ 滚动会话列表时
- ❌ 切换Tab（全部/朋友/陌生人/群消息）时

---

## 为什么是Protobuf而不是JSON？

### Protobuf优势

1. **体积更小**：二进制序列化，比JSON小30-50%
2. **传输速度快**：网络传输更高效
3. **解析更快**：无需文本解析，直接转换为对象
4. **反爬保护**：增加逆向难度，减少API滥用

### 抖音的策略

抖音可能在以下情况使用Protobuf：
- ✅ 消息历史（大量数据）
- ✅ 实时聊天（低延迟）
- ❌ 用户信息（小数据量，仍用JSON）
- ❌ 会话列表元数据（用JSON: `/creator/im/user_detail/`）

---

## 浏览器中的限制

### 无法直接访问响应

在浏览器JavaScript中，已完成的XHR/Fetch请求的响应体**无法再次读取**：

```javascript
// ❌ 这不起作用
const resources = performance.getEntriesByType('resource');
const apiRequest = resources.find(r => r.name.includes('get_by_user_init'));
// apiRequest 只有元数据（URL、大小、耗时），没有响应体
```

### 为什么Worker的API拦截器可以？

Worker使用 **Playwright的响应拦截**：

```javascript
// ✅ 这起作用（仅在Playwright中）
page.on('response', async (response) => {
  if (response.url().includes('get_by_user_init')) {
    const buffer = await response.body();  // 可以读取响应体
    // buffer 是原始的Protobuf二进制数据
  }
});
```

**关键差异**：
- 浏览器JS：在响应完成**后**尝试读取 ❌
- Playwright：在响应**到达时**拦截 ✅

---

## Protobuf结构推测

### 已知信息

1. **API名称**: `get_by_user_init` (获取用户初始化消息)
2. **参数推测**:
   ```
   可能的查询参数：
   - conversation_id: 会话ID
   - count: 消息数量
   - cursor: 分页游标
   - aid: 应用ID (抖音创作者平台)
   ```

3. **响应结构推测**:
   ```protobuf
   message GetByUserInitResponse {
     int32 status_code = 1;
     string status_msg = 2;
     MessageData data = 3;
   }

   message MessageData {
     repeated Message messages = 1;
     string cursor = 2;
     bool has_more = 3;
     int64 total = 4;
   }

   message Message {
     string message_id = 1;
     string conversation_id = 2;
     string sender_id = 3;
     string sender_name = 4;
     string content = 5;
     int32 message_type = 6;  // 1=text, 2=image, 3=video, etc.
     int64 created_at = 7;
     int32 direction = 8;  // 1=incoming, 2=outgoing
     // ... 其他字段
   }
   ```

### 如何验证？

#### 方法1: 保存二进制文件并分析

修改Worker代码，保存buffer到文件：

```javascript
// 在 api-interceptor-manager.js 的 parseJSON() 中
if (contentType.includes('protobuf')) {
  const buffer = await response.body();

  // 保存到文件
  const fs = require('fs');
  const filename = `./debug/protobuf_${Date.now()}.bin`;
  fs.writeFileSync(filename, buffer);

  logger.info(`Protobuf saved to: ${filename}`);
}
```

然后使用工具分析：
```bash
# 安装protobuf工具
npm install -g protobuf-inspector

# 分析二进制文件
protobuf-inspector ./debug/protobuf_xxx.bin
```

#### 方法2: 逆向JS代码

抖音前端必须有Protobuf解析代码，查找：

```javascript
// 在浏览器控制台搜索
// 1. 查找protobuf库
Object.keys(window).filter(k => k.toLowerCase().includes('proto'))

// 2. 查找decode函数
for (let key in window) {
  if (window[key]?.decode || window[key]?.deserialize) {
    console.log(key, window[key]);
  }
}

// 3. 检查webpack模块
if (window.webpackJsonp) {
  // 搜索包含 'protobuf' 的模块
}
```

#### 方法3: 使用protobuf-inspector分析

```bash
# 安装
npm install protobuf-inspector

# Node.js脚本
const pbInspector = require('protobuf-inspector');
const fs = require('fs');

const buffer = fs.readFileSync('./protobuf_xxx.bin');
const decoded = pbInspector(buffer);

console.log(JSON.stringify(decoded, null, 2));
```

---

## 当前解决方案：DOM提取

由于Protobuf解析困难，我们采用DOM提取方案：

### 工作流程

```
页面加载
  ↓
/v2/message/get_by_user_init (Protobuf) ← API拦截器检测
  ↓
{ __isBinary: true } ← 标记为二进制
  ↓
触发 DOM 提取
  ↓
从页面提取17个可见会话
  ↓
入库 DataManager
```

### 优势

- ✅ 无需解析Protobuf
- ✅ 数据即所见，可靠性高
- ✅ 对抖音API变化适应性强

### 局限

- ⚠️ 只能提取可见的17个会话（虚拟列表）
- ⚠️ 只能提取每个会话的最后一条消息
- ⚠️ 需要额外DOM操作（滚动+点击）获取完整历史

---

## 未来改进方向

### 短期：增强DOM提取

实现虚拟列表滚动，提取全部41个会话：

```javascript
for (let i = 0; i < 41; i++) {
  await scrollVirtualListToIndex(page, i);
  await page.waitForTimeout(200);
  const visible = await extractMessagesFromDOM(page);
  allConversations.push(...visible.conversations);
}
```

### 中期：点击提取完整消息

逐个打开会话，提取完整历史：

```javascript
for (let conv of conversations) {
  await clickConversation(page, conv);
  await page.waitForTimeout(500);

  // 从消息详情页提取所有消息
  const messages = await extractMessagesFromDetailPage(page);

  await goBack(page);
}
```

### 长期：Protobuf解析

完全解析二进制响应：

#### 步骤1: 获取.proto定义

选项A：逆向JS代码
```javascript
// 在前端代码中搜索
// 可能的变量名: messageProto, imProto, chatProto
```

选项B：手动分析
```bash
# 使用protobuf-inspector猜测结构
pbInspector protobuf_sample.bin > structure.json
```

选项C：抓包分析
```bash
# 使用Wireshark + Protobuf插件
# 需要先配置proto路径
```

#### 步骤2: 编写解析器

```javascript
// 安装依赖
npm install protobufjs

// 解析代码
const protobuf = require('protobufjs');

async function parseProtobuf(buffer) {
  // 加载.proto定义
  const root = await protobuf.load('douyin_message.proto');
  const MessageResponse = root.lookupType('GetByUserInitResponse');

  // 解析
  const decoded = MessageResponse.decode(buffer);
  const object = MessageResponse.toObject(decoded);

  return object;
}
```

#### 步骤3: 集成到Worker

```javascript
// 在 api-interceptor-manager.js 中
if (contentType.includes('protobuf')) {
  const buffer = await response.body();

  try {
    // 尝试解析Protobuf
    const parsed = await parseProtobuf(buffer);

    return {
      __wasProtobuf: true,
      data: parsed.data,
      messages: parsed.data?.messages || []
    };

  } catch (err) {
    // 解析失败，fallback到DOM提取
    logger.warn('Protobuf解析失败，使用DOM提取');
    return { __isBinary: true, __buffer: buffer };
  }
}
```

---

## Protobuf逆向工具推荐

### 1. protobuf-inspector (推荐)

```bash
npm install -g protobuf-inspector

# 使用
protobuf-inspector input.bin > output.json
```

**优势**：
- 自动推测字段类型
- 输出JSON格式
- 无需.proto定义

**局限**：
- 字段名是 `1`, `2`, `3` 而不是 `message_id`, `content`
- 需要手动映射字段含义

### 2. Wireshark + Protobuf Plugin

配置步骤：
1. 抓取HTTPS流量（需要安装CA证书）
2. 安装Protobuf解析插件
3. 配置.proto文件路径
4. 过滤 `imapi.snssdk.com` 的请求

### 3. Burp Suite + Protobuf Decoder

适合安全研究人员：
- 拦截并修改Protobuf请求
- 自动推测schema
- 支持重放攻击测试

### 4. 手动分析

```javascript
// 读取二进制文件
const fs = require('fs');
const buffer = fs.readFileSync('protobuf_sample.bin');

// 查看前100字节（十六进制）
console.log(buffer.slice(0, 100).toString('hex'));

// 查找可读字符串
const strings = [];
let current = '';
for (let byte of buffer) {
  if (byte >= 32 && byte <= 126) {  // 可打印ASCII
    current += String.fromCharCode(byte);
  } else if (current.length > 3) {
    strings.push(current);
    current = '';
  }
}
console.log('Found strings:', strings);
```

这可以帮助识别：
- 字段名（如果未混淆）
- 消息文本内容
- 用户名
- URL

---

## 实际案例：类似项目

### TikTok API逆向

GitHub项目: `davidteather/TikTok-Api`

**方法**：
- 逆向TikTok移动端APK
- 提取.proto文件
- 使用jadx反编译查找Protobuf调用

### 微信Protobuf

项目: `greycodee/wechat-backup`

**方法**：
- 从微信PC端提取mmproto.dll
- 反编译找到Protobuf schema
- 编写Python解析器

### 抖音类似尝试

目前没有公开的完整方案，但有以下线索：
- 抖音前端使用webpack打包
- Protobuf库可能内嵌在bundle中
- 搜索 `decode`, `deserialize`, `proto` 等关键字

---

## 总结

### ✅ 已确认

1. API返回Protobuf二进制格式
2. 响应大小: 19-34KB
3. 页面加载时触发6次
4. 浏览器JS无法直接访问响应
5. Worker可通过Playwright拦截

### 🔧 当前方案

- API拦截器检测二进制响应
- 自动切换到DOM提取模式
- 从页面提取可见的会话和消息

### 🚀 未来改进

1. **短期**：滚动虚拟列表提取全部会话
2. **中期**：点击会话提取完整历史
3. **长期**：逆向并解析Protobuf二进制

---

## 相关资源

### 文档
- [Protobuf官方文档](https://developers.google.com/protocol-buffers)
- [protobufjs库文档](https://github.com/protobufjs/protobuf.js)

### 工具
- [protobuf-inspector](https://www.npmjs.com/package/protobuf-inspector)
- [Wireshark Protobuf Plugin](https://wiki.wireshark.org/Protobuf)
- [Burp Suite](https://portswigger.net/burp)

### 逆向案例
- [TikTok-Api逆向过程](https://github.com/davidteather/TikTok-Api/wiki/Unofficial-API-Documentation)
- [微信Protobuf分析](https://github.com/greycodee/wechat-backup)

---

**文档时间**: 2025-11-05
**版本**: v1.0
**状态**: 分析完成，待逆向工程
