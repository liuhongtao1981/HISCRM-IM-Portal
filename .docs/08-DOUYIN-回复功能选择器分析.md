# 抖音回复功能选择器分析

> 📍 这份文档记录抖音评论和私信回复功能的 DOM 结构和选择器分析

---

## 目录

1. [评论回复功能](#评论回复功能)
2. [私信回复功能](#私信回复功能)
3. [选择器验证方法](#选择器验证方法)
4. [常见问题](#常见问题)

---

## 评论回复功能

### 场景 1：视频评论回复

#### 页面结构分析

抖音视频页面的评论区域结构：

```html
<!-- 评论容器 -->
<div class="comment-container">
  <!-- 单个评论 -->
  <div class="comment-item" data-comment-id="xxx">
    <!-- 评论头部：用户信息 -->
    <div class="comment-header">
      <img class="user-avatar" src="..." />
      <span class="user-name">用户名</span>
      <span class="comment-time">2小时前</span>
    </div>

    <!-- 评论内容 -->
    <div class="comment-content">
      <p class="comment-text">评论文本内容</p>
    </div>

    <!-- 评论操作栏 -->
    <div class="comment-actions">
      <span class="like-count">赞(100)</span>
      <span class="reply-btn" data-target-id="xxx">
        回复
      </span>
    </div>
  </div>
</div>
```

#### 核心选择器

| 功能 | 选择器 | 备注 |
|------|--------|------|
| 评论列表 | `.comment-container, [class*="comment-list"]` | 寻找评论容器 |
| 单条评论 | `.comment-item, [data-comment-id]` | 评论项目 |
| 回复按钮 | `.reply-btn, [class*="reply"], button:contains("回复")` | 点击打开回复框 |
| 回复输入框 | `input[placeholder*="回复"], textarea[class*="reply"]` | 输入回复内容 |
| 发送按钮 | `button[type="submit"], [class*="submit"], button:contains("发送")` | 提交回复 |

#### 实现步骤

**Step 1: 定位评论**
```javascript
// 方式 1: 通过数据属性定位
const commentElement = page.$(`[data-comment-id="${commentId}"]`);

// 方式 2: 通过文本内容定位
const commentElement = page.$(`text="${commentText}"`);

// 方式 3: 通过索引定位
const comments = page.$$('.comment-item');
const commentElement = comments[commentIndex];
```

**Step 2: 点击回复按钮**
```javascript
// 找到评论对应的回复按钮
const replyBtn = await commentElement.$('[class*="reply"]');
await replyBtn.click();

// 等待回复框出现
await page.waitForSelector('input[placeholder*="回复"], textarea');
```

**Step 3: 输入回复内容**
```javascript
// 找到回复输入框
const replyInput = await page.$('input[placeholder*="回复"], textarea');

// 输入内容
await replyInput.fill(replyContent);
```

**Step 4: 提交回复**
```javascript
// 找到发送按钮
const submitBtn = await page.$('button[type="submit"], button:contains("发送")');
await submitBtn.click();

// 等待回复成功提示
await page.waitForSelector('[class*="success"], [class*="tip"]');
```

#### 可能的变异

抖音可能在不同页面显示不同的评论样式：

1. **视频详情页** - 大评论框，可直接展开
2. **视频列表页** - 小评论框，需要点击打开详情
3. **直播评论** - 实时滚动评论，需要定位准确

---

## 私信回复功能

### 场景 2：直播间私信回复

#### 页面结构分析

直播间私信界面结构：

```html
<!-- 私信列表容器 -->
<div class="dm-container">
  <!-- 虚拟列表 (React) -->
  <div class="dm-list" data-react-fiber="true">
    <!-- 单条私信 -->
    <div class="dm-item" data-message-id="xxx">
      <div class="dm-header">
        <span class="sender-name">发送者</span>
        <span class="dm-time">14:30</span>
      </div>
      <div class="dm-content">
        <p class="dm-text">私信内容</p>
      </div>
      <div class="dm-actions">
        <button class="reply-btn">回复</button>
      </div>
    </div>
  </div>
</div>

<!-- 私信输入框 -->
<div class="dm-reply-container">
  <textarea class="dm-input" placeholder="输入回复..."></textarea>
  <button class="dm-send-btn">发送</button>
</div>
```

#### 核心选择器

| 功能 | 选择器 | 备注 |
|------|--------|------|
| 私信列表 | `.dm-list, [class*="message-list"]` | 虚拟列表容器 |
| 单条私信 | `.dm-item, [data-message-id]` | 私信项目 |
| 回复输入框 | `textarea.dm-input, input[placeholder*="回复"]` | 输入回复内容 |
| 发送按钮 | `.dm-send-btn, button:contains("发送")` | 提交回复 |

#### 虚拟列表处理

由于直播间私信使用 React 虚拟列表，处理方式有所不同：

**方式 A: 通过 React Fiber 访问**
```javascript
// 获取虚拟列表容器
const listContainer = page.$('.dm-list');

// 访问 React Fiber（需要在浏览器上下文中执行）
const messages = await page.evaluate(() => {
  const container = document.querySelector('.dm-list');
  const fiber = container.__reactFiber$;
  // 遍历 Fiber 节点获取消息列表
  return extractMessagesFromFiber(fiber);
});
```

**方式 B: 通过滚动加载**
```javascript
// 滚动到目标私信
const dmItem = page.$(`[data-message-id="${messageId}"]`);
await dmItem.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);

// 点击回复
const replyBtn = await dmItem.$('button.reply-btn');
await replyBtn.click();
```

**方式 C: 通过 API 直接获取**
```javascript
// 监听网络请求获取私信内容
const responseData = await page.waitForResponse(
  response => response.url().includes('/message/list')
);
const messages = await responseData.json();
```

---

## 选择器验证方法

### 使用 Chrome DevTools MCP 验证

1. **启动调试会话**
```bash
cd packages/worker/src/platforms/douyin
node debug-template.js
```

2. **在浏览器中操作**
   - 打开抖音视频或直播
   - 完成登录
   - 打开评论或私信

3. **在终端中测试选择器**
```javascript
// 测试评论容器
qa('[class*="comment"]')

// 测试回复按钮
qa('[class*="reply"]')

// 测试输入框
qa('textarea, input')

// 测试虚拟列表
qa('[data-react-fiber]')

// 执行 JavaScript 提取数据
e(() => {
  const comments = document.querySelectorAll('[data-comment-id]');
  return Array.from(comments).map(c => ({
    id: c.dataset.commentId,
    text: c.textContent
  }));
})
```

### 常见的选择器模式

```javascript
// 属性选择器
[data-comment-id]          // 数据属性
[class*="comment"]         // 类名包含
[placeholder*="回复"]      // 占位符包含
input[type="text"]         // 标签 + 类型

// 伪类选择器
button:has-text("回复")    // 文本匹配
:nth-child(2)             // 索引选择
:visible                  // 可见性

// 组合选择器
.comment-item .reply-btn  // 后代选择器
.comment-item > button    // 子元素选择器
.comment-item, .dm-item   // 多元素选择
```

---

## 常见问题

### Q1: 如何处理动态类名？

A: 使用属性选择器匹配动态类的部分名称：
```javascript
// ❌ 不推荐（易失效）
'.byted-6x_g9c_wrap__message'

// ✅ 推荐（使用模式匹配）
'[class*="message"], [class*="comment"]'
```

### Q2: 虚拟列表中的元素找不到怎么办？

A: 虚拟列表只渲染可见元素，需要先滚动：
```javascript
// 先滚动到目标位置
const target = page.$(`[data-id="${id}"]`);
await target.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);  // 等待渲染

// 然后再操作
await target.click();
```

### Q3: 如何区分不同类型的回复（楼主、其他用户）？

A: 通过数据属性或 CSS 类区分：
```javascript
// 检查是否是楼主的回复
const isAuthorReply = await element.$('.author-reply-badge');

// 检查回复链关系
const replyToId = element.getAttribute('data-reply-to');
```

### Q4: 选择器在登录后失效怎么办？

A: 抖音可能会根据登录状态改变 DOM 结构，需要重新验证：
1. 在新的登录账户上重新验证选择器
2. 创建多套备选选择器
3. 使用 XPath 作为备选方案

```javascript
// 主选择器
let element = await page.$('[class*="reply-btn"]');

// 备选选择器
if (!element) {
  element = await page.$('xpath=//button[contains(text(), "回复")]');
}
```

---

## 下一步

- [ ] 在实际抖音账户上验证所有选择器
- [ ] 创建 debug-reply-selectors.js 调试脚本
- [ ] 为不同类型的评论创建适配器
- [ ] 为虚拟列表创建通用访问方法
- [ ] 编写完整的错误处理逻辑

---

**版本**: 1.0 | **最后更新**: 2025-10-20 | **状态**: 📋 设计完成，等待实现

🎯 建议：下一步使用 Chrome DevTools MCP 在真实抖音页面上验证这些选择器！
