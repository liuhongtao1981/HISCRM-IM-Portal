# 私信消息提取调试指南

## 问题描述

系统在抓取抖音私信时，虽然可以成功导航到 `https://creator.douyin.com/creator-micro/data/following/chat` 私信管理页面，但**无法正确提取会话列表中的消息**。

## 根本原因

### 原始问题

`crawl-direct-messages-v2.js` 中的 `extractConversationsList()` 函数使用的选择器 `[role="listitem"]` 可能:
1. **选择器不匹配**: 实际页面使用的 HTML 结构与选择器不符
2. **选择错误的元素**: 可能找到的是消息项而非会话项
3. **虚拟列表问题**: 虚拟列表加载不完整导致元素找不到

### 页面结构分析

抖音私信页面使用虚拟列表(virtual list)技术，包含:
- **会话列表容器**: `[role="grid"]` 或 `[role="list"]`
- **会话项**: `[role="listitem"]` (需要正确的父容器)
- **消息内容**: 嵌套在会话项中

## 解决方案

### 1. 改进的 `extractConversationsList()` 函数

**新特性:**
- ✅ 页面结构自动分析（调试第 1 步）
- ✅ 多选择器回退机制（调试第 2 步）
- ✅ 详细日志记录每一步过程
- ✅ 元素有效性验证

**选择器尝试顺序:**
```javascript
[
  '[role="grid"] [role="listitem"]',    // 优先: Grid 内的列表项
  '[role="list"] [role="listitem"]',    // 备选: List 内的列表项
  '[role="listitem"]',                   // 直接列表项
  '[class*="conversation-item"]',        // Class 选择器
  'li'                                   // 最后备选: 标准 LI 元素
]
```

**日志输出示例:**
```
[extractConversationsList] Page analysis: {"listContainers":[{"selector":"[role=\"grid\"]","count":1}],"itemCounts":{"[role=\"listitem\"]":15}}
[extractConversationsList] Found 15 items with selector: [role="grid"] [role="listitem"]
[extractConversationsList] Successfully extracted 15 conversations from 15 elements
```

### 2. 改进的 `openConversation()` 函数

**新特性:**
- ✅ 多种查找方式(精确匹配 → 模糊匹配 → 循环查找)
- ✅ 详细的调试信息
- ✅ 错误恢复机制

**查找步骤:**
1. 按文本精确查找
2. 按前 3 个字符模糊查找
3. 遍历所有会话元素查找匹配项

## 调试步骤

### 1. 启用详细日志

设置环境变量或日志级别为 `debug`:
```bash
LOG_LEVEL=debug npm start:worker
```

### 2. 检查页面分析输出

查看日志中的页面分析结果:
```
Page analysis: {
  listContainers: [
    {
      selector: "[role=\"grid\"]",
      count: 1,
      firstElementClass: "...",
      firstElementRole: "grid"
    }
  ],
  itemCounts: {
    "[role=\"listitem\"]": 15
  }
}
```

**问题诊断:**
- `listContainers` 为空 → 页面没有期望的容器结构
- `itemCounts` 为空 → 没有找到任何列表项

### 3. 常见问题和解决方案

#### 问题 1: 找不到会话元素

**症状:** `⚠️ No conversation elements found with any selector`

**可能原因:**
- 页面加载不完整（导航超时）
- Douyin 修改了页面结构
- 列表项在虚拟滚动区域内尚未加载

**解决方案:**
```javascript
// 增加等待时间
await page.waitForTimeout(3000);  // 改为 5000ms

// 或尝试滚动加载虚拟列表
await page.evaluate(() => {
  const grid = document.querySelector('[role="grid"]');
  if (grid) grid.scrollTop = 100;  // 触发虚拟列表加载
});
```

#### 问题 2: 找到元素但内容为空

**症状:** `Skipping empty element at index X`

**可能原因:**
- 虚拟列表占位符（占位的 DOM 节点，无实际内容）
- 网络延迟导致内容未加载

**解决方案:**
```javascript
// 增加内容等待
await page.waitForFunction(
  () => document.querySelectorAll('[role="listitem"]').length > 0 &&
         Array.from(document.querySelectorAll('[role="listitem"]'))
           .some(el => el.textContent.trim().length > 2)
);
```

#### 问题 3: 打开会话失败

**症状:** `❌ Failed to open conversation: [username] - element not found`

**可能原因:**
- 会话项结构变化
- 用户名包含特殊字符不能用于 locator 选择器

**解决方案:**
```javascript
// 使用转义和模糊匹配
const escapedName = conversation.platform_user_name.replace(/"/g, '\\"');
const element = await page.locator(`text=/${escapedName}/`).first();
```

## 新增 API 拦截端点

脚本已配置拦截以下 API 获取完整的会话和消息数据:

```javascript
{
  pattern: '**/v1/stranger/get_conversation_list**',
  type: 'conversations',
  description: '会话列表 API'
},
{
  pattern: '**/v1/im/query_conversation**',
  type: 'query',
  description: '会话查询 API (备选)'
},
{
  pattern: '**/v2/message/get_by_user_init**',
  type: 'init',
  description: '消息初始化 API'
},
{
  pattern: '**/v1/im/message/history**',
  type: 'history',
  description: '消息历史 API'
}
```

## 测试方法

### 单元测试

创建 `packages/worker/test/crawl-direct-messages.test.js`:

```javascript
const { crawlDirectMessagesV2 } = require('../src/platforms/douyin/crawl-direct-messages-v2');

describe('Crawl Direct Messages V2', () => {
  it('should extract conversations from page', async () => {
    // 模拟 Playwright Page 对象
    const mockPage = { /* ... */ };

    const result = await crawlDirectMessagesV2(mockPage, mockAccount);

    expect(result.conversations).toBeDefined();
    expect(result.conversations.length).toBeGreaterThan(0);
  });
});
```

### 手动测试

1. 启动 Master + Worker
2. 登录一个账户
3. 监控日志输出:
   ```bash
   tail -f packages/worker/logs/worker.log | grep "extractConversationsList"
   ```
4. 检查数据库是否正确保存:
   ```bash
   sqlite3 packages/master/data/master.db "SELECT * FROM conversations LIMIT 5;"
   ```

## 性能考虑

- **虚拟列表加载**: 需要足够的等待时间让虚拟列表加载所有项
- **元素检查**: 避免频繁的 DOM 查询，批量获取再处理
- **超时设置**: 根据网络情况调整超时值

## 参考文件

- **主文件**: [crawl-direct-messages-v2.js](../packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js)
- **日志输出**: [worker.log](../packages/worker/logs/worker.log)
- **数据库**: [master.db](../packages/master/data/master.db) - 表: `conversations`, `direct_messages`

## 后续改进

- [ ] 使用 API 拦截获取的数据作为主要源，DOM 解析作为备选
- [ ] 实现本地缓存机制避免重复爬取
- [ ] 添加图片/头像下载功能
- [ ] 支持消息分页加载优化
