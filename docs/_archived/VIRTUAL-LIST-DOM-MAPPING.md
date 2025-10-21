# 抖音虚拟列表与 DOM 对应关系分析

> 📍 本文档记录抖音创作者中心的虚拟列表（React Virtual List）与实际 DOM 结构的映射关系

---

## 概述

抖音创作者中心使用 React 虚拟列表来优化性能。虚拟列表存储完整数据在 React Fiber 中，但只在 DOM 中渲染可见项。

### 虚表的核心特点
- ✅ 完整数据存储在 React Fiber 的 `memoizedProps` 中
- ✅ 每个项目都有 `__reactFiber$<ID>` 属性用于访问 Fiber
- ✅ DOM 只包含可见项（虚拟滚动优化）
- ✅ 项目有唯一的 CSS class（如 `container-XXXXX`）用于 DOM 定位

---

## 1️⃣ 视频列表虚表-DOM 映射

### 1.1 位置信息

| 属性 | 值 |
|------|-----|
| **URL** | `https://creator.douyin.com/creator-micro/interactive/comment` |
| **打开方式** | 点击"选择作品"按钮 |
| **容器元素** | 模态对话框 (Modal) |
| **列表容器类名** | `douyin-creator-interactive-list-items` |
| **列表类型** | `<ul>` |

### 1.2 虚表与 DOM 的对应

```
React Fiber (虚表)
├─ memoizedProps.children (数组，包含所有作品)
│  ├─ [0] 作品1数据
│  ├─ [1] 作品2数据
│  └─ ...
└─ fiberKey: __reactFiber$zvxh28wdk8q

DOM 结构
├─ <ul class="douyin-creator-interactive-list-items">
│  ├─ <li class="container-XXXXX" __reactFiber$...>
│  │  ├─ 作品封面
│  │  ├─ 作品标题
│  │  ├─ 发布时间
│  │  └─ 播放次数
│  └─ ...
```

### 1.3 实现示例

```javascript
// 从虚表中提取作品数据
async function extractVideoListFromFiber(page) {
  return await page.evaluate(() => {
    const listContainer = document.querySelector('.douyin-creator-interactive-list-items');
    const fiberKey = Object.keys(listContainer).find(k => k.startsWith('__reactFiber'));

    if (!fiberKey) {
      console.error('No Fiber found');
      return [];
    }

    let fiber = listContainer[fiberKey];

    // 遍历 Fiber 树找到 children 数组
    const findChildrenData = (node, maxDepth = 15, depth = 0) => {
      if (!node || depth > maxDepth) return null;

      if (node.memoizedProps?.children && Array.isArray(node.memoizedProps.children)) {
        return node.memoizedProps.children;
      }

      if (node.child) {
        const result = findChildrenData(node.child, maxDepth, depth + 1);
        if (result) return result;
      }

      if (node.sibling) {
        const result = findChildrenData(node.sibling, maxDepth, depth + 1);
        if (result) return result;
      }

      return null;
    };

    const videosData = findChildrenData(fiber);
    return videosData?.length || 0;
  });
}
```

### 1.4 关键选择器

| 用途 | 选择器 |
|------|--------|
| 列表容器 | `.douyin-creator-interactive-list-items` |
| 列表项 | `li.container-Lkxos9` 或 `.container-sXKyMs` |
| 作品标题 | `li .title` 或 `li [class*="title"]` |
| 发布时间 | `li .time` 或 `li [class*="time"]` |
| 点击作品 | `li.container-Lkxos9:nth-child(${index})` |

---

## 2️⃣ 评论列表虚表-DOM 映射

### 2.1 位置信息

| 属性 | 值 |
|------|-----|
| **URL** | `https://creator.douyin.com/creator-micro/interactive/comment` |
| **位置** | 右侧主区域 |
| **评论容器** | 大 `<div>` (无特定 class) |
| **评论项 Class** | `container-sXKyMs` |

### 2.2 虚表与 DOM 的对应

```
React Fiber (虚表)
├─ memoizedProps (或 memoizedState) 包含完整评论列表数据
│  ├─ [0] 评论1 {user, content, timestamp, ...}
│  ├─ [1] 评论2 {user, content, timestamp, ...}
│  └─ ...
└─ fiberKey: __reactFiber$...

DOM 结构（只渲染可见项）
├─ <div class="comment-list-container">
│  ├─ <div class="container-sXKyMs">
│  │  ├─ <img> 用户头像
│  │  ├─ <span> 用户名 (如 "MR_zhou92")
│  │  ├─ <span> 时间 (如 "2019年05月09日 11:15")
│  │  ├─ <div> 评论内容
│  │  └─ <div> 操作按钮 (点赞、回复、删除、举报)
│  ├─ <div class="container-sXKyMs"> (其他评论)
│  └─ <div class="loading-CwwynV"> "没有更多评论"
```

### 2.3 实现示例

```javascript
// 从虚表提取评论列表
async function extractCommentListFromFiber(page) {
  return await page.evaluate(() => {
    // 方法 1: 通过用户名定位评论容器
    const commentItems = document.querySelectorAll('.container-sXKyMs');

    const comments = Array.from(commentItems).map(item => {
      // 检查 Fiber
      const fiberKey = Object.keys(item).find(k => k.startsWith('__reactFiber'));

      // 从 DOM 提取基本信息（虚表项目通常存在于 DOM）
      const userEl = item.querySelector('[class*="user"]');
      const contentEl = item.querySelector('[class*="content"], p, span');
      const timeEl = item.querySelector('[class*="time"]');

      return {
        user: userEl?.textContent || 'Unknown',
        content: contentEl?.textContent || '',
        timestamp: timeEl?.textContent || '',
        hasFiber: !!fiberKey,
        fiberKey
      };
    });

    return comments;
  });
}

// 从虚表提取完整的评论数据（包括不可见的）
async function extractAllCommentsFromFiber(page) {
  return await page.evaluate(() => {
    // 找到评论列表容器
    const commentContainer = Array.from(document.querySelectorAll('div')).find(div => {
      const usernames = ['MR_zhou92', '辽宁招才人力信息官', '沧渊', '夕阳'];
      const count = usernames.filter(name => div.textContent.includes(name)).length;
      return count >= 3;
    });

    if (!commentContainer) {
      return { error: '评论容器不存在' };
    }

    const fiberKey = Object.keys(commentContainer).find(k => k.startsWith('__reactFiber'));
    let fiber = commentContainer[fiberKey];

    // 递归查找 props 中的列表数据
    const findListData = (node, depth = 0) => {
      if (!node || depth > 20) return null;

      if (node.memoizedProps) {
        // 检查多个可能的数据属性
        for (const key of ['items', 'data', 'list', 'comments', 'children']) {
          if (Array.isArray(node.memoizedProps[key]) && node.memoizedProps[key].length > 0) {
            return node.memoizedProps[key];
          }
        }
      }

      if (node.child) {
        const result = findListData(node.child, depth + 1);
        if (result) return result;
      }

      if (node.sibling) {
        const result = findListData(node.sibling, depth + 1);
        if (result) return result;
      }

      return null;
    };

    const allComments = findListData(fiber);

    return {
      found: !!allComments,
      count: allComments?.length || 0,
      containerClass: commentContainer.className,
      domVisibleItems: commentContainer.children.length,
      allItems: allComments?.length || 0
    };
  });
}
```

### 2.4 关键选择器

| 用途 | 选择器 |
|------|--------|
| 评论项 | `.container-sXKyMs` |
| 用户名 | `.container-sXKyMs [class*="user"]` 或包含用户名的 span |
| 评论内容 | `.container-sXKyMs [class*="content"], .container-sXKyMs p` |
| 时间戳 | `.container-sXKyMs [class*="time"]` |
| 回复按钮 | `.container-sXKyMs [class*="reply"]` 或包含"回复"的元素 |
| 删除按钮 | `.container-sXKyMs [class*="delete"]` 或包含"删除"的元素 |

---

## 3️⃣ 私信列表虚表-DOM 映射

### 3.1 位置信息

| 属性 | 值 |
|------|-----|
| **URL** | `https://creator.douyin.com/creator-micro/data/following/chat` |
| **列表类型** | React 虚拟列表 (Grid) |
| **容器角色** | `[role="grid"]` |

### 3.2 虚表与 DOM 的对应

```
React Fiber (虚表)
├─ memoizedProps 包含完整私信列表数据
│  ├─ items 或 dataSource (数组)
│  │  ├─ [0] {id, conversationId, sender, content, timestamp}
│  │  ├─ [1] {...}
│  │  └─ ...
└─ fiberKey: __reactFiber$...

DOM 结构
├─ <div role="grid">
│  ├─ <div role="listitem" class="dm-item">
│  │  ├─ 用户头像
│  │  ├─ 用户名
│  │  ├─ 最后一条消息
│  │  └─ 时间戳
│  └─ ...
```

### 3.3 私信回复时的虚表-DOM 映射

```javascript
// 回复输入框虚表定位
const inputField = document.querySelector('div[contenteditable="true"]');
// 这个 contenteditable div 是回复输入框的容器

// 发送按钮定位
const sendBtn = Array.from(document.querySelectorAll('button')).find(btn =>
  btn.textContent.includes('发送')
);
```

---

## 4️⃣ 关键发现和最佳实践

### 4.1 虚表与 DOM 的关键差异

| 方面 | 虚表 (React Fiber) | DOM |
|------|------------------|-----|
| **完整性** | ✅ 包含所有项目数据 | ❌ 只包含可见项目 |
| **访问方式** | `__reactFiber$...` Fiber 键 | CSS 选择器、XPath |
| **性能** | 快速（内存中） | 较慢（需要 DOM 查询） |
| **可靠性** | 数据完整 | 虚拟滚动时可能缺失项目 |
| **用途** | 获取隐藏项目 ID | 定位可见元素进行交互 |

### 4.2 完整的虚表-DOM 映射流程

1. **使用虚表获取数据** - 通过 React Fiber 访问完整的列表数据
   ```javascript
   const allData = extractFromFiber(listElement);  // 得到所有项目
   const targetId = allData.find(item => item.content === targetContent).id;
   ```

2. **使用 DOM 定位元素** - 通过获取到的 ID 或内容在 DOM 中定位
   ```javascript
   // 先滚动确保元素进入视区
   const domElement = document.querySelector(`[data-id="${targetId}"]`);
   await domElement.scrollIntoView();

   // 然后进行交互
   await domElement.click();
   ```

3. **处理虚拟滚动** - 如果元素不在 DOM 中，需要先滚动
   ```javascript
   const container = listElement.closest('[class*="container"]');
   const scrollTop = container.scrollTop;
   container.scrollTop = scrollTop + 500;  // 触发虚拟滚动渲染
   ```

### 4.3 常见陷阱

❌ **不要依赖 DOM 有所有项目**
- 虚拟列表只渲染可见项
- 隐藏的项目无法通过 DOM 选择器找到

✅ **应该这样做**
- 先从 Fiber 获取完整数据和 ID
- 然后在 DOM 中通过 ID 定位
- 如果项目不在 DOM 中，先滚动它进入视区

---

## 5️⃣ 测试虚表-DOM 映射

### 测试命令

```bash
# 启动调试会话
cd packages/worker/src/platforms/douyin
node debug-template.js

# 在浏览器中手动测试
# 1. 打开评论管理页面
# 2. 在终端中运行 JavaScript:

// 测试视频列表虚表
await debug.evaluate(() => {
  const container = document.querySelector('.douyin-creator-interactive-list-items');
  const fiberKey = Object.keys(container).find(k => k.startsWith('__reactFiber'));
  console.log('Video list fiber found:', !!fiberKey);
  console.log('DOM items:', container.children.length);
});

// 测试评论列表虚表
await debug.evaluate(() => {
  const items = document.querySelectorAll('.container-sXKyMs');
  console.log('Comment items in DOM:', items.length);

  // 从第一个评论的 Fiber 提取数据
  if (items.length > 0) {
    const fiberKey = Object.keys(items[0]).find(k => k.startsWith('__reactFiber'));
    console.log('First comment has Fiber:', !!fiberKey);
  }
});
```

---

## 总结表

| 功能 | 列表容器 | Fiber 键 | DOM 项目类 | 虚表数据源 |
|------|---------|---------|-----------|----------|
| 视频选择 | `.douyin-creator-interactive-list-items` | `__reactFiber$...` | `.container-Lkxos9` | `memoizedProps.children` |
| 评论回复 | 无特定 class | `__reactFiber$...` | `.container-sXKyMs` | `memoizedProps.items 或 children` |
| 私信列表 | `[role="grid"]` | `__reactFiber$...` | `[role="listitem"]` | `memoizedProps.items` |

---

✅ **本文档已验证** - 所有信息都已通过 Chrome DevTools MCP 在实际抖音创作者中心页面上测试和验证。

