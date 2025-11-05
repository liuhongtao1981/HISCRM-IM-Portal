# 私信爬虫DOM提取0会话问题 - 诊断报告

## 时间: 2025-11-05 13:53

## 问题描述

从Master日志中发现，私信爬虫虽然成功检测到Protobuf二进制响应并切换到DOM提取模式，但是DOM提取返回了**0个会话和0条消息**。

## 日志分析

### ✅ 成功的部分

1. **Protobuf检测成功**
```
⚠️ [API] get_by_user_init 返回二进制Protobuf响应
   URL: https://imapi.snssdk.com/v2/message/get_by_user_init
   Content-Type: application/x-protobuf
   Buffer size: 236465 bytes (10次请求，175KB-268KB)
```

2. **API会话列表提取成功**
```
[extractConversationsList] ✅ Extracted 220 conversations from API
```

3. **DataManager入库成功**
```
"conversations":{"total":40,"new":0,"updated":40}
```

### ❌ 失败的部分

**DOM滚动提取完全失败**：
```
[DOM提取-滚动] 目标会话数: 220
[DOM提取-滚动] 处理批次 0-9
[DOM提取] 成功提取 0 个会话, 0 条消息预览
[DOM提取-滚动] 批次 0-9: 提取 0 个, 累计唯一 0 个

[DOM提取-滚动] 处理批次 10-19
[DOM提取] 成功提取 0 个会话, 0 条消息预览
[DOM提取-滚动] 批次 10-19: 提取 0 个, 累计唯一 0 个

[DOM提取-滚动] 没有新会话，提前结束滚动
[DOM提取-滚动] ✅ 完成！共提取 0 个唯一会话, 0 条消息
```

## 可能的原因

### 1. 选择器问题

`extractVisibleConversations()` 使用的选择器可能在当前页面失效：

```javascript
// 当前使用的选择器
const listItems = document.querySelectorAll('[role="listitem"]');
const nameEl = item.querySelector('[cursor="pointer"]');
```

**问题**：
- 抖音可能更新了HTML结构
- 虚拟列表滚动后，`role="listitem"` 可能被移除或改变
- `cursor="pointer"` 可能不是用户名元素的稳定属性

### 2. 页面加载时机问题

```javascript
[DEBUG] Current page URL: about:blank
[DEBUG] Navigating from about:blank to chat page...
[DEBUG] ✅ Navigation completed  // 仅200ms后
[Phase 8] Navigated to message page
```

**问题**：
- 导航完成不代表React已渲染完成
- 虚拟列表可能需要额外时间才能渲染DOM
- 当前只等待2秒（`waitForTimeout(2000)`）

### 3. 滚动等待时间不足

```javascript
// 滚动后只等待200ms
await page.waitForTimeout(200);
```

**问题**：
- React虚拟列表重新渲染可能需要更长时间
- 抖音可能有防爬延迟加载机制

### 4. 虚拟列表容器错误

**假设**：如果我们滚动的不是正确的容器，会导致DOM没有更新。

当前滚动逻辑：
```javascript
const virtualList =
  document.querySelector('.ReactVirtualized__Grid') ||
  document.querySelector('.ReactVirtualized__List') ||
  document.querySelector('[class*="virtual"]');
```

## 诊断步骤

### 诊断脚本已创建

文件：[tests/debug-dom-extraction-issue.js](../tests/debug-dom-extraction-issue.js)

这个脚本将测试：
1. 原始选择器是否能找到元素
2. 查找可能的替代选择器
3. 检查虚拟列表容器信息
4. 分析会话元素的实际HTML结构
5. 测试新选择器的提取效果
6. 滚动后重新测试选择器

### 运行诊断

```bash
cd e:/HISCRM-IM-main
node tests/debug-dom-extraction-issue.js
```

**需要手动操作**：
1. 扫码登录
2. 导航到私信管理页面
3. 等待60秒让脚本自动诊断

## 推测的修复方案

### 方案1: 修复选择器（最可能）

如果 `[role="listitem"]` 失效，使用备选方案：

```javascript
async function extractVisibleConversations(page) {
  const result = await page.evaluate(() => {
    const conversations = [];
    const messages = [];

    // 方法1: 通过虚拟列表的innerScrollContainer
    const innerContainer = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
    if (innerContainer) {
      const items = Array.from(innerContainer.children);

      items.forEach((item, index) => {
        // 提取所有文本
        const allTexts = Array.from(item.querySelectorAll('div, span'))
          .map(el => el.textContent?.trim())
          .filter(t => t && t.length > 0 && t.length < 200);

        // 第一个较长的非日期文本可能是用户名
        const userName = allTexts.find(t =>
          t.length > 2 &&
          !t.match(/^\d{2}-\d{2}$/) &&
          !t.includes('昨天') &&
          !t.includes('星期')
        );

        if (userName) {
          // 查找最后一条消息（排除用户名和时间）
          const messageTexts = allTexts.filter(text =>
            text !== userName &&
            !text.match(/^\d{2}-\d{2}$/) &&
            !text.includes('昨天') &&
            !text.includes('星期') &&
            text !== '置顶' &&
            text !== '已读' &&
            text !== '删除'
          );

          const lastMessage = messageTexts[messageTexts.length - 1];

          conversations.push({ userName, lastMessage, index });

          if (lastMessage) {
            messages.push({
              conversationId: `conv_${index}`,
              content: lastMessage,
              userName,
              index
            });
          }
        }
      });
    }

    return { conversations, messages, totalItems: conversations.length };
  });

  return result;
}
```

### 方案2: 增加等待时间

```javascript
async function extractMessagesFromDOM(page, scrollToLoadAll = false, totalConversations = 0) {
  // ... 滚动逻辑

  // 滚动到批次起始位置
  await scrollVirtualListToIndex(page, batchStart);

  // 增加等待时间：200ms → 500ms
  await page.waitForTimeout(500);

  // 提取当前可见的会话
  const visible = await extractVisibleConversations(page);

  // ...
}
```

### 方案3: 等待元素出现

使用 `waitForSelector` 替代固定延迟：

```javascript
async function scrollVirtualListToIndex(page, targetIndex, estimatedItemHeight = 80) {
  // ... 滚动逻辑

  virtualList.scrollTop = targetScrollTop;

  // 等待元素出现（替代固定延迟）
  try {
    await page.waitForSelector('[role="listitem"], .ReactVirtualized__Grid__innerScrollContainer > div', {
      state: 'visible',
      timeout: 1000
    });
  } catch {
    // 如果超时，继续执行（可能元素已存在）
  }

  return true;
}
```

### 方案4: 页面加载后增加等待

```javascript
// 在 crawlDirectMessagesV2() 主函数中

// 导航到私信页面
await page.goto('https://creator.douyin.com/im/chat?enter_from=...');

// 当前：等待2秒
await page.waitForTimeout(2000);

// 修复：等待虚拟列表出现
await page.waitForSelector('.ReactVirtualized__Grid', {
  state: 'visible',
  timeout: 10000
});

// 额外等待React渲染完成
await page.waitForTimeout(3000);

logger.info('[Phase 8] Navigated to message page and waited for virtual list');
```

## 验证步骤

修复后需要验证：

1. **运行诊断脚本**，确认新选择器能找到元素
2. **修改代码**，应用修复方案
3. **重启Worker**，触发爬虫
4. **检查日志**，确认DOM提取不再返回0个会话
5. **验证数据**，检查DataManager中的消息数量

### 预期日志输出

```
[DOM提取-滚动] 目标会话数: 220
[DOM提取-滚动] 处理批次 0-9
[DOM提取] 成功提取 17 个会话, 17 条消息预览  ✅
[DOM提取-滚动] 批次 0-9: 提取 17 个, 累计唯一 17 个  ✅

[DOM提取-滚动] 处理批次 10-19
[DOM提取] 成功提取 17 个会话, 17 条消息预览  ✅
[DOM提取-滚动] 批次 10-19: 提取 17 个, 累计唯一 27 个  ✅

[DOM提取-滚动] 处理批次 20-29
[DOM提取] 成功提取 17 个会话, 17 条消息预览  ✅
[DOM提取-滚动] 批次 20-29: 提取 14 个, 累计唯一 41 个  ✅

[DOM提取-滚动] ✅ 完成！共提取 41 个唯一会话, 41 条消息
```

## 下一步行动

1. **立即运行诊断脚本** → 找出正确的选择器
2. **根据诊断结果选择修复方案** → 修改代码
3. **重启Worker验证** → 确认修复成功
4. **更新文档** → 记录最终修复方案

---

## 补充信息

### 当前代码位置

- DOM提取函数：[packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js:247-332](../packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js)
- 滚动函数：[packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js:100-153](../packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js)
- 主流程：[packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js:508-563](../packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js)

### 相关日志文件

- Worker日志：`packages/worker/logs/crawl-direct-messages-v2.log`
- 任务运行日志：`packages/worker/logs/monitor-task.log`
- Master日志：查看后台Bash进程 `c348de`

---

**文档时间**: 2025-11-05 13:53
**状态**: 问题已诊断，等待运行诊断脚本确认根本原因
**优先级**: 🔴 高 - 阻塞虚拟列表滚动提取功能
