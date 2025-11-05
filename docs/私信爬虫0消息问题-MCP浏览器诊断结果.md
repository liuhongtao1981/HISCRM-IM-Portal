# 私信爬虫 0 消息问题 - MCP 浏览器诊断结果

## 时间: 2025-11-05 10:20

## 诊断目标

使用 Playwright MCP 控制的浏览器手动验证抖音私信页面的 DOM 结构，确认选择器是否正确。

## 诊断过程

### 1. 启动 MCP 浏览器并导航到抖音私信页面

✅ 成功导航到: `https://creator.douyin.com/creator-micro/data/following/chat`

### 2. 检查会话列表选择器

**发现的会话列表结构**:
```yaml
- grid "grid" [ref=e176]:
  - rowgroup [ref=e177]:
    - listitem [ref=e179]  ← 会话1
    - listitem [ref=e196]  ← 会话2
    - listitem [ref=e213]  ← 会话3
    ...
```

**选择器验证结果**:
- `[role="list-item"]`: **33 个** ✅ (正确！)
- `[role="grid"]`: **4 个** ✅

**结论**: 代码中使用的 `page.locator('[role="list-item"]')` 是**正确的**。

### 3. 点击第一个会话验证打开逻辑

✅ 成功点击会话 "实在人"，右侧显示消息列表。

### 4. 验证 `isChatOpen` 检测逻辑

使用 `page.evaluate()` 测试修复后的验证逻辑：

```javascript
{
  // 方法1: 检查右侧消息容器
  method1_box_content: true ✅,

  // 方法2: 检查虚拟列表
  method2_grid: true ✅,
  method2_list: false,
  method2_result: true ✅,

  // 方法3: 检查消息输入框
  method3_placeholder: false,
  method3_message: false,
  method3_textarea: false,
  method3_result: false,

  // 方法4: 原有的宽泛检查
  method4_message_class: true ✅,
  method4_chat_class: true ✅,
  method4_url: false,
  method4_result: true ✅,

  // 最终结果
  isChatOpen: true ✅
}
```

**结论**: 验证逻辑**完全正确**，会话打开后应该能够通过验证。

### 5. 原有验证逻辑也能工作

```javascript
{
  'class*=message': 36 ✅,
  'class*=chat': 10 ✅,
  'url_includes_chat': false
}
```

**重要发现**: 原有的验证逻辑 (`[class*="message"]` 和 `[class*="chat"]`) **也能匹配成功**！

## 根本原因分析

### Worker 报错的真正原因

根据错误日志时间间隔分析：

```
09:57:05 → 09:57:35 = 30秒
09:57:35 → 09:58:06 = 30秒
09:58:06 → 09:58:36 = 30秒
...
```

**每次失败间隔正好 30 秒** → 这是 Playwright `click()` 的默认超时时间！

### 问题定位: Line 749

```javascript
// 第 2 步: 点击指定索引的对话元素
const element = allConversations[conversationIndex];
logger.debug(`[openConversationByIndex] Step 2: Clicking conversation at index ${conversationIndex}`);

await element.click();  // ← 这里超时失败（30秒）
await page.waitForTimeout(1500);
```

### 可能的失败原因

#### 1. 元素不可点击 (最可能)

虚拟列表在滚动过程中会重新渲染，导致：
- 元素引用失效
- 元素被移除/重新创建
- 元素位置变化

#### 2. 抖音反爬机制

检测到快速点击行为，阻止了点击事件。

#### 3. 会话列表数量问题

**关键发现**:
- MCP 浏览器中看到 **16 个会话**（滚动后可能更多）
- 错误日志显示正好失败了 **16 个会话**
- Worker 提取到 **174 个会话**（来自 API）

**矛盾点**: Worker 尝试打开 174 个会话，但 DOM 中只有约 16 个可见的 `listitem` 元素（虚拟列表）。

当 `conversationIndex >= 16` 时，`allConversations[conversationIndex]` 会是 `undefined`，导致点击失败！

## 验证发现的矛盾

让我重新检查代码 Line 740-742：

```javascript
if (conversationIndex < 0 || conversationIndex >= allConversations.length) {
  logger.warn(`[openConversationByIndex] Invalid conversation index: ${conversationIndex} (total: ${allConversations.length})`);
  return false;
}
```

这个检查**应该可以捕获索引越界**，但是：

1. 如果 `allConversations.length = 16`
2. Worker 尝试打开第 17 个会话 (`conversationIndex = 16`)
3. 检查会通过 (因为 `16 >= 16` 为 false)
4. `allConversations[16]` 是 `undefined`
5. `await undefined.click()` 抛出异常

**等等！检查逻辑有 bug**:
```javascript
conversationIndex >= allConversations.length  // ← 应该是这个
```

但代码中是 `>=`，所以索引 16 应该被拒绝。让我重新检查...

实际上，如果 `conversationIndex = 16` 且 `allConversations.length = 16`：
- `16 >= 16` 为 `true`
- 应该返回 `false`

所以检查逻辑是**正确的**。

## 新的怀疑: 虚拟列表刷新问题

可能的情况：

1. `extractConversationsList()` 提取到 174 个会话（来自 API 拦截）
2. 开始遍历这 174 个会话
3. 对于每个会话，调用 `openConversationByIndex(page, conversation, index)`
4. `index = 0` 时，`allConversations.length = 16`，点击成功
5. 返回会话列表后，虚拟列表可能重新渲染
6. `index = 1` 时，重新获取 `allConversations`，但数量可能变化
7. 或者点击时元素正在被虚拟列表移除

## 修复方案

### 方案1: 使用会话名称而不是索引

不使用 `conversationIndex`，而是通过会话名称定位：

```javascript
const element = await page.locator(`[role="list-item"]:has-text("${conversation.platform_user_name}")`).first();
await element.click();
```

**优点**: 不依赖索引，更稳定
**缺点**: 重复名称会有问题

### 方案2: 滚动到会话可见区域

在点击前，先滚动到会话位置：

```javascript
await element.scrollIntoViewIfNeeded();
await element.click({ timeout: 10000 });
```

### 方案3: 降低并发度

不要一次处理 174 个会话，而是：
- 只处理前 N 个会话
- 或者分批处理

### 方案4: 直接使用 API 数据

如果 API 拦截已经包含消息数据，就不需要点击打开会话。

## 下一步行动

1. **重启 Worker** 加载修复后的代码（已添加详细日志）
2. **查看新的日志输出**，确认：
   - `allConversations.length` 是多少
   - `conversationIndex` 是多少
   - 是否是索引越界导致的
3. **根据日志结果选择修复方案**

## 结论

✅ **选择器是正确的** - 无需修改
✅ **验证逻辑是正确的** - 修复后的代码应该可以工作
❌ **问题在于点击操作** - `element.click()` 超时失败（30秒）
⚠️ **可能的根本原因** - 虚拟列表刷新导致元素引用失效

**关键**: Worker 需要重启以加载新代码，查看详细的调试日志才能确定最终原因。
