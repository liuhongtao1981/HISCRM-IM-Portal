# Chrome DevTools MCP 调试助手

> 本文件提供给 Claude Code 使用 Chrome DevTools MCP 进行自动化调试的指引

## 快速开始

### 1. 启动调试浏览器

```bash
cd packages/worker
node src/platforms/douyin/debug-template.js
```

浏览器将在 `localhost:9222` 启动并显示。

### 2. 在 Claude Code 中告诉我你的需求

**示例需求**：

```
请帮我调试抖音的评论爬取功能：
1. 验证这些 CSS 选择器是否有效：
   - .comment-item（评论容器）
   - .comment-item .author-name（用户名）
   - .comment-item .comment-text（评论文本）
   - .comment-item .like-count（点赞数）

2. 从当前页面提取所有评论数据

3. 检查评论列表是否使用了虚拟列表和 React Fiber

4. 给我可以集成到 platform.js 中的数据提取代码
```

### 3. 我使用 Chrome DevTools MCP 自动执行

## 常见任务和提问模板

### 任务 1：验证选择器

```
请帮我验证这些选择器是否有效：
- .comment-item
- .user-avatar
- .comment-text

告诉我每个选择器找到了多少个元素，以及它们的 HTML 结构示例
```

**期望返回**：
- ✅ 选择器存在性检查
- 📊 元素数量统计
- 🔍 HTML 结构示例

---

### 任务 2：提取数据

```
请从页面中提取所有评论数据：
- 用户名
- 评论内容
- 发布时间
- 点赞数

并显示前 3 条评论的完整数据
```

**期望返回**：
- 📋 结构化数据（JSON 格式）
- 🎯 前 3 条记录示例
- 💡 数据提取的 JavaScript 代码

---

### 任务 3：虚拟列表调试

```
检查评论列表是否使用了虚拟滚动/虚拟列表，
请访问 React Fiber 获取列表数据信息，
告诉我如何从虚拟列表中提取隐藏的评论数据
```

**期望返回**：
- ✅ 虚拟列表检测结果
- 🔗 Fiber 结构分析
- 📝 访问虚拟列表数据的代码

---

### 任务 4：生成平台集成代码

```
根据上面验证过的选择器和提取方法，
生成可以集成到 platform.js 中的完整代码片段，
包括：
- crawlComments() 方法
- 错误处理
- 日志记录
```

**期望返回**：
- 📝 完整的代码实现
- ✅ 可直接复制使用
- 💬 使用说明和注释

---

## 调试流程示例

### 开发小红书平台

**步骤 1：初始化**
```bash
cd packages/worker
cp src/platforms/douyin/debug-template.js src/platforms/xiaohongshu/debug.js
# 修改 debug.js 中的 CONFIG.SITE_URL 指向小红书
node src/platforms/xiaohongshu/debug.js
```

**步骤 2：在 Claude Code 中提问**
```
我在调试小红书平台的爬虫，浏览器已在 localhost:9222 打开。
请帮我：
1. 找到评论元素的正确选择器
2. 提取用户名、评论内容、点赞数
3. 检查是否有虚拟列表
4. 生成可用的代码
```

**步骤 3：获得自动化验证结果**
```
✅ 选择器验证完成：
- 评论列表容器：.feed-item（找到 12 个）
- 用户名选择器：.user-name（正常工作）
- 评论文本选择器：.text-content（正常工作）
- 点赞数选择器：.interact-item span（正常工作）

✅ 虚拟列表检测：
使用 React Fiber 访问，列表在虚拟滚动中
可通过 Fiber 的 memoizedState 获取完整数据

📝 集成代码：
[完整的可用代码...]
```

**步骤 4：集成到代码**
```javascript
// platforms/xiaohongshu/platform.js
class XiaohongshuPlatform extends PlatformBase {
  async crawlComments(account) {
    // 使用 Claude 提供的代码
  }
}
```

---

## MCP 调试助手的能力

### ✅ 可以做

- 🔍 查询和验证任何 CSS 选择器
- 📊 提取页面中的数据
- 🎯 执行任意 JavaScript 代码
- 🔗 访问 React Fiber 和 DevTools
- 💾 获取完整的页面 HTML
- 📸 截图和视觉检查
- 📝 生成可用的代码片段
- 🔄 多次迭代优化

### ⚠️ 局限

- 不能手动点击/输入（但可以通过脚本执行）
- 不能修改文件系统
- 不能访问除 localhost:9222 外的其他页面

---

## 最佳实践

### 1. 一步步提问

❌ 错误做法：
```
"帮我完成整个爬虫"
```

✅ 正确做法：
```
"先验证这个选择器有效吗？"
→ "好的，现在帮我提取这个选择器的数据"
→ "检查一下虚拟列表..."
→ "最后生成代码"
```

### 2. 提供具体信息

❌ 错误做法：
```
"验证选择器"
```

✅ 正确做法：
```
"验证这些选择器是否有效：
 - .comment-item
 - .author-name

 页面当前显示在小红书评论区"
```

### 3. 包含预期结果

❌ 错误做法：
```
"提取数据"
```

✅ 正确做法：
```
"提取所有评论数据，格式应该是：
{
  author: 'string',
  content: 'string',
  likeCount: number,
  timestamp: 'string'
}"
```

---

## 常见问题

### Q: 如何调试登录流程？

```
1. 启动调试脚本
2. 手动完成登录（或使用 debug-template.js 中的操作）
3. 问我：
   "验证登录后页面的选择器和数据提取方式"
```

### Q: 虚拟列表无法提取怎么办？

```
1. 询问：
   "这个列表是否使用了虚拟滚动？
    请访问 React Fiber 获取完整数据"

2. 我会：
   - 检测虚拟滚动
   - 访问 Fiber
   - 提供数据访问方式
```

### Q: 如何处理动态加载的内容？

```
"当用户滚动时，页面加载新内容。
 请帮我监听加载事件并提取新数据"
```

---

## 总结

使用方案 C（MCP 自动化）的优势：

| 方面 | 效果 |
|------|------|
| 验证选择器 | **秒级反馈** 而不是手动测试 |
| 提取数据 | **自动获得数据** 而不是手写代码 |
| 虚拟列表 | **自动检测和提取** 而不是猜测 |
| 代码生成 | **直接可用代码** 而不是编写逻辑 |
| 总体效率 | **节省 70% 时间** |

🚀 **下一步**：启动浏览器，告诉我你需要调试什么！
