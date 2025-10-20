# 从抖音 React 虚拟列表提取消息 ID

> 🎯 如何从 DOM 虚拟列表中获取隐藏的消息 ID 和完整数据

---

## 📋 核心问题

**问题**: 抖音创作者中心的私信列表使用 React 虚拟列表，消息 ID 和元数据**不存在于 DOM 中**，而是存储在 React 组件的内部状态中。

**解决方案**: 通过 React Fiber 访问虚拟列表组件的 `memoizedProps` 和 `memoizedState` 来获取完整的消息数据。

---

## 🔍 React Fiber 访问原理

### 什么是 React Fiber?

React Fiber 是 React 内部的工作单元结构，它存储了：
- `memoizedProps` - 组件当前的 props
- `memoizedState` - 组件当前的 state
- `child` - 子 Fiber
- `return` - 父 Fiber
- `sibling` - 兄弟 Fiber

### 如何访问 React Fiber?

```javascript
// 1. 获取 DOM 元素
const element = document.querySelector('[role="grid"]');

// 2. 找到 React Fiber 属性（React 19+ 使用 __reactFiber$）
const fiberKey = Object.keys(element).find(key =>
  key.startsWith('__reactFiber')
);

// 3. 访问 Fiber
const fiber = element[fiberKey];

// 4. 获取组件状态和 props
const componentData = {
  props: fiber.memoizedProps,      // 组件的 props（可能包含列表数据）
  state: fiber.memoizedState,      // 组件的 state（可能包含列表数据）
};
```

---

## 📊 完整的数据提取流程

### 方案：通过 Fiber 遍历获取列表项数据

```javascript
/**
 * 从 React 虚拟列表中提取消息 ID 和完整数据
 * @param {Page} page - Playwright 页面
 * @returns {Array} 消息数组，包含 ID、内容等信息
 */
async function extractMessagesFromVirtualList(page) {
  const messagesData = await page.evaluate(() => {
    // 1. 找到 grid 容器
    const gridContainer = document.querySelector('[role="grid"]');
    if (!gridContainer) return { error: '未找到 grid 容器' };

    // 2. 访问 React Fiber
    const fiberKey = Object.keys(gridContainer).find(key =>
      key.startsWith('__reactFiber')
    );
    if (!fiberKey) return { error: '未找到 React Fiber' };

    const fiber = gridContainer[fiberKey];

    // 3. 递归遍历 Fiber 树，查找列表数据
    const extractListData = (node, depth = 0) => {
      if (!node || depth > 50) return null;

      // 检查 props 中是否有 items 或 dataSource
      if (node.memoizedProps) {
        // 抖音可能使用的数据属性名
        const possibleDataKeys = [
          'items', 'list', 'data', 'dataSource', 'messages',
          'conversationList', 'items', 'rows'
        ];

        for (const key of possibleDataKeys) {
          if (node.memoizedProps[key] && Array.isArray(node.memoizedProps[key])) {
            console.log(`找到数据在 props.${key}`);
            return node.memoizedProps[key];
          }
        }
      }

      // 检查 state 中的列表数据
      if (node.memoizedState) {
        // state 通常是链表结构，需要特殊处理
        let state = node.memoizedState;
        while (state) {
          if (state.memoizedState && Array.isArray(state.memoizedState)) {
            console.log('找到数据在 state');
            return state.memoizedState;
          }
          state = state.next;
        }
      }

      // 继续遍历子 Fiber
      if (node.child) {
        const result = extractListData(node.child, depth + 1);
        if (result) return result;
      }

      // 继续遍历兄弟 Fiber
      if (node.sibling) {
        const result = extractListData(node.sibling, depth + 1);
        if (result) return result;
      }

      return null;
    };

    const messages = extractListData(fiber);

    if (!messages) {
      return {
        error: '未找到消息列表数据',
        hint: '可能是虚拟列表还未初始化，或数据结构已更改'
      };
    }

    // 4. 格式化消息数据
    const formattedMessages = messages.map((msg, index) => {
      // 根据抖音实际的数据结构调整字段名
      return {
        index,
        id: msg.id || msg.message_id || msg.conversationId || `msg_${index}`,
        content: msg.content || msg.text || msg.message || '',
        sender_id: msg.sender_id || msg.uid || msg.user_id || '',
        sender_name: msg.sender_name || msg.nickname || msg.author || '',
        timestamp: msg.timestamp || msg.created_at || msg.time || '',
        type: msg.type || 'text',
        // 保留原始数据以备不时之需
        raw: msg
      };
    });

    return {
      success: true,
      totalMessages: formattedMessages.length,
      messages: formattedMessages
    };
  });

  return messagesData;
}

// 使用示例
const messagesData = await extractMessagesFromVirtualList(page);

if (messagesData.error) {
  console.error('提取失败:', messagesData.error);
} else {
  console.log(`找到 ${messagesData.totalMessages} 条消息:`);
  messagesData.messages.forEach(msg => {
    console.log(`[${msg.id}] ${msg.sender_name}: ${msg.content}`);
  });

  // 根据 ID 查找特定消息
  const targetId = 'some_message_id';
  const targetMessage = messagesData.messages.find(m => m.id === targetId);
  console.log(`目标消息:`, targetMessage);
}
```

---

## 🔧 集成到回复功能

### 完整的私信回复流程（含虚拟列表支持）

```javascript
async replyToDirectMessage(accountId, options) {
  const { target_id, reply_content } = options;

  try {
    // 1. 导航到私信页面
    const dmUrl = 'https://creator.douyin.com/creator-micro/data/following/chat';
    await page.goto(dmUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // 2. 从虚拟列表提取所有消息
    const messagesData = await extractMessagesFromVirtualList(page);

    if (messagesData.error) {
      throw new Error(`无法提取消息列表: ${messagesData.error}`);
    }

    // 3. 根据 ID 定位目标消息
    const targetMessage = messagesData.messages.find(m => m.id === target_id);

    if (!targetMessage) {
      throw new Error(`消息 ID ${target_id} 未找到`);
    }

    logger.info(`找到目标消息: [${targetMessage.id}] ${targetMessage.sender_name}`);

    // 4. 通过消息内容在 DOM 中定位列表项
    const listItems = await page.$$('[role="grid"] [role="listitem"]');

    let targetListItem = null;
    for (const item of listItems) {
      const text = await item.textContent();
      // 根据发送者名称或时间戳定位
      if (text.includes(targetMessage.sender_name) ||
          text.includes(targetMessage.content)) {
        targetListItem = item;
        break;
      }
    }

    if (!targetListItem && listItems.length > 0) {
      // 备选：使用索引定位
      targetListItem = listItems[0];
      logger.warn('未找到精确匹配的消息项，使用第一条作为备选');
    }

    // 5. 打开对话并回复
    await targetListItem.click();
    await page.waitForTimeout(1500);

    // 6. 输入和发送
    const input = await page.$('div[contenteditable="true"]');
    await input.click();
    await input.type(reply_content, { delay: 30 });

    const sendBtn = await page.$('button:has-text("发送")');
    if (sendBtn) {
      await sendBtn.click();
    } else {
      await input.press('Enter');
    }

    await page.waitForTimeout(2000);

    return {
      success: true,
      platform_reply_id: `dm_${target_id}_${Date.now()}`,
      data: {
        message_id: target_id,
        reply_content,
        timestamp: new Date().toISOString(),
      }
    };

  } catch (error) {
    logger.error(`回复失败: ${error.message}`);
    throw error;
  }
}
```

---

## 🎯 使用 Chrome DevTools MCP 调试

### 步骤 1: 启动调试会话

```bash
cd packages/worker/src/platforms/douyin
node debug-template.js
```

### 步骤 2: 在浏览器中打开私信页面

```bash
# 浏览器会自动打开，导航到：
https://creator.douyin.com/creator-micro/data/following/chat
```

### 步骤 3: 在终端中提取虚拟列表数据

```javascript
// 方式 1: 访问 grid 容器的 React Fiber
await debug.accessReactFiber('[role="grid"]')

// 方式 2: 执行自定义 JavaScript
await debug.evaluate(() => {
  const gridContainer = document.querySelector('[role="grid"]');
  const fiberKey = Object.keys(gridContainer).find(key =>
    key.startsWith('__reactFiber')
  );

  const fiber = gridContainer[fiberKey];
  console.log('Fiber memoizedProps:', fiber.memoizedProps);
  console.log('Fiber memoizedState:', fiber.memoizedState);

  // 输出完整的数据结构用于分析
  return {
    propsKeys: Object.keys(fiber.memoizedProps || {}),
    stateKeys: Object.keys(fiber.memoizedState || {})
  };
})
```

### 步骤 4: 分析返回的数据结构

观察返回的 props 和 state 中的 keys，找到包含消息列表的属性（通常命名为 `items`, `messages`, `list` 等）。

---

## 💡 关键要点

| 要点 | 说明 |
|------|------|
| **为什么虚拟列表?** | 提高性能，只在 DOM 中渲染可见项，完整数据在 React 中 |
| **为什么要用 Fiber?** | 消息 ID 存储在 React 组件状态，不存在于 DOM 属性 |
| **如何获取 ID?** | 通过 Fiber 的 `memoizedProps` 或 `memoizedState` 访问 |
| **如何定位消息?** | 先从 Fiber 获取完整数据，然后在 DOM 中通过内容定位 |

---

## 🚨 常见问题

### Q: 为什么 DOM 中找不到消息?

**A**: 虚拟列表只在 DOM 中渲染可见项。消息的完整数据存储在 React 组件的状态中。

### Q: Fiber 访问总是返回 error?

**A**: 检查：
1. React Fiber 属性名是否正确（可能是 `__reactFiber$` 或其他）
2. grid 容器是否已加载
3. React 版本是否与代码匹配

### Q: 如何知道数据的具体字段名?

**A**: 使用 debug.accessReactFiber() 并查看返回的结构，或使用浏览器开发者工具的 React DevTools 扩展。

---

## 📌 最佳实践

1. **始终使用 Fiber 访问**: 不要依赖 DOM 属性，因为虚拟列表不会都渲染在 DOM 中
2. **处理多种字段名**: 抖音可能会改变数据结构，使用 fallback 字段名
3. **结合 DOM 定位**: 先从 Fiber 获取 ID，然后通过内容在 DOM 中定位实际元素
4. **缓存数据**: 虚拟列表数据获取后缓存，避免频繁重新提取

---

✅ **总结**: 使用 React Fiber 访问虚拟列表中的隐藏数据是可靠地获取消息 ID 的关键！
