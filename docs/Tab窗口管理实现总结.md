# Tab 窗口管理实现总结

## 实现完成 ✅

根据您的需求，已完成 Tab 窗口管理机制的设计和实现。

## 核心文件

### 1. TabManager 实现
**文件**：`packages/worker/src/browser/tab-manager.js`

**核心功能**：
- ✅ 根据任务类型获取/创建页面
- ✅ 管理持久/非持久窗口
- ✅ 防止浏览器进程退出（保留最后一个窗口）
- ✅ 支持窗口复用/独立管理

### 2. 设计文档
- **最终设计方案**：`docs/Tab窗口管理最终设计方案.md`
- **复用机制设计**：`docs/Tab窗口复用机制设计.md`

### 3. 测试脚本
**文件**：`tests/测试Tab管理机制.js`

## 接口设计

### getPageForTask() - 核心接口

```javascript
const { tabId, page, shouldClose } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.SPIDER_DM,     // 窗口标记
  persistent: true,           // 是否持久窗口
  shareable: false,           // 是否可公用
  forceNew: false,            // 是否强制新窗口
});

// 使用 page 执行任务...

// 根据 shouldClose 决定是否关闭
if (shouldClose) {
  await tabManager.closeTab(accountId, tabId);
}
```

### 参数说明

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `tag` | string | 窗口标记，标识任务类型 | `TabTag.SPIDER_DM` |
| `persistent` | boolean | 是否持久窗口（false = 用完后关闭） | `true` |
| `shareable` | boolean | 是否可以公用（复用已有窗口） | `false` |
| `forceNew` | boolean | 是否强制启用新窗口 | `false` |

### 返回值

| 字段 | 类型 | 说明 |
|------|------|------|
| `tabId` | string | Tab ID，用于后续关闭 |
| `page` | Page | Playwright Page 对象 |
| `shouldClose` | boolean | 任务完成后是否应该关闭此窗口 |

## Tag 标记

```javascript
const TabTag = {
  SPIDER_DM: 'spider_dm',           // 私信蜘蛛（私信 + 会话）
  SPIDER_COMMENT: 'spider_comment', // 评论蜘蛛（评论 + 视频 + 讨论）
  LOGIN: 'login',                   // 登录任务
  LOGIN_CHECK: 'login_check',       // 登录检测
  REPLY_DM: 'reply_dm',             // 私信回复
  REPLY_COMMENT: 'reply_comment',   // 评论回复
  PLACEHOLDER: 'placeholder',       // 占位窗口（自动转换）
};
```

## 使用场景

### 场景 1：蜘蛛任务（持久窗口）

```javascript
// 私信蜘蛛任务
const { page } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.SPIDER_DM,
  persistent: true,    // ✅ 持久窗口，长期运行
  shareable: false,    // 独立窗口
  forceNew: false,     // 如果已存在，复用
});

await page.goto('https://creator.douyin.com/creator-micro/data/following/chat');

// 爬取私信 + 会话
const messages = await crawlMessages(page);
const conversations = await crawlConversations(page);

// ⭐ 持久窗口，不关闭
```

### 场景 2：评论蜘蛛（持久窗口）

```javascript
// 评论蜘蛛任务
const { page } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.SPIDER_COMMENT,
  persistent: true,
  shareable: false,
  forceNew: false,
});

await page.goto('https://creator.douyin.com/creator-micro/interactive/comment');

// 爬取评论 + 视频 + 讨论
const comments = await crawlComments(page);
const videos = await crawlVideos(page);
const discussions = await crawlDiscussions(page);

// ⭐ 持久窗口，不关闭
```

### 场景 3：登录任务（非持久，登录后关闭）

```javascript
// 用户点击登录
const { page, tabId } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.LOGIN,
  persistent: false,   // ❌ 非持久
  shareable: false,
  forceNew: true,      // ✅ 强制新窗口
});

try {
  // 显示二维码
  await page.goto('https://www.douyin.com/passport/web/login');

  // 等待登录成功
  await waitForLoginSuccess(page);

  console.log('✅ 登录成功');

} finally {
  // ⭐ 登录成功后，关闭窗口
  await tabManager.closeTab(accountId, tabId);
}
```

### 场景 4：登录检测（智能复用）

```javascript
// 场景 4.1：有登录任务窗口
const loginTab = tabManager.findTabByTag(accountId, TabTag.LOGIN);

if (loginTab) {
  // ✅ 复用登录窗口进行检测
  const { page } = await tabManager.getPageForTask(accountId, {
    tag: TabTag.LOGIN,
    shareable: true,   // ✅ 可以公用登录窗口
    forceNew: false,
  });

  const isLoggedIn = await checkLoginStatus(page);

  // ⚠️ 不关闭窗口（因为是登录任务的窗口）
}

// 场景 4.2：没有登录任务窗口
else {
  // ✅ 启动新窗口检测
  const { page, tabId, shouldClose } = await tabManager.getPageForTask(accountId, {
    tag: TabTag.LOGIN_CHECK,
    persistent: false,
    shareable: false,
    forceNew: true,
  });

  await page.goto('https://creator.douyin.com/');
  const isLoggedIn = await checkLoginStatus(page);

  // ⭐ 检测完成后关闭窗口
  if (shouldClose) {
    await tabManager.closeTab(accountId, tabId);
  }
}
```

### 场景 5：回复任务（非持久，完成后关闭）

```javascript
// 私信回复
const { page, tabId } = await tabManager.getPageForTask(accountId, {
  tag: TabTag.REPLY_DM,
  persistent: false,   // ❌ 非持久
  shareable: false,
  forceNew: true,      // ✅ 每次新窗口
});

try {
  // 发送私信回复
  await page.goto(`https://creator.douyin.com/im/${conversationId}`);
  await page.fill('textarea', replyText);
  await page.click('button[type="submit"]');

  console.log('✅ 回复发送成功');

} finally {
  // ⭐ 运行结束后关闭
  await tabManager.closeTab(accountId, tabId);
}
```

## 保护机制

### 1. 保留最后一个窗口

```javascript
// 关闭窗口时自动检查
await tabManager.closeTab(accountId, tabId);

// 内部逻辑：
if (accountTabs.size <= 1) {
  // ⚠️ 最后一个窗口，不能关闭
  console.warn('Cannot close last tab - would exit browser');

  // ⭐ 转换为占位窗口
  tab.tag = TabTag.PLACEHOLDER;
  tab.persistent = true;

  return false; // 不关闭
}

// 正常关闭
await tab.page.close();
```

### 2. 占位窗口清理

```javascript
// 当有持久窗口（蜘蛛任务）启动后，自动清理占位窗口
await tabManager.cleanupPlaceholder(accountId);

// 内部逻辑：
// - 统计持久窗口数量（不包括占位窗口）
// - 如果有至少 1 个持久窗口，关闭占位窗口
// - 防止无用窗口占用资源
```

## Tab 生命周期

```
浏览器启动
   ↓
创建默认 Tab（占位）
   ↓
┌──────────────────────────────────────┐
│  私信蜘蛛启动                         │
│  tag: SPIDER_DM                      │
│  persistent: true                    │
│  → 长期运行，不关闭                   │
└──────────────────────────────────────┘
   ↓
┌──────────────────────────────────────┐
│  评论蜘蛛启动                         │
│  tag: SPIDER_COMMENT                 │
│  persistent: true                    │
│  → 长期运行，不关闭                   │
└──────────────────────────────────────┘
   ↓
清理占位 Tab（因为有 2 个持久窗口）
   ↓
┌──────────────────────────────────────┐
│  需要回复评论                         │
│  tag: REPLY_COMMENT                  │
│  persistent: false                   │
│  → 创建新窗口                         │
│  → 执行回复                           │
│  → 关闭窗口                           │
└──────────────────────────────────────┘
   ↓
┌──────────────────────────────────────┐
│  用户点击登录                         │
│  tag: LOGIN                          │
│  persistent: false                   │
│  → 创建新窗口                         │
│  → 显示二维码                         │
│  → 登录成功                           │
│  → 关闭窗口                           │
└──────────────────────────────────────┘
   ↓
继续正常运行（2 个持久窗口）
```

## 测试方法

### 运行测试脚本

```bash
cd E:\HISCRM-IM-main
node tests/测试Tab管理机制.js
```

### 测试场景

测试脚本会依次测试以下场景：

1. ✅ 创建蜘蛛任务窗口（持久）
2. ✅ 创建回复任务窗口（非持久，完成后关闭）
3. ✅ 创建登录任务窗口（非持久）
4. ✅ 登录检测复用登录窗口
5. ✅ 登录成功后关闭登录窗口
6. ✅ 登录检测创建新窗口（无登录窗口时）
7. ✅ 检测完成后关闭检测窗口
8. ✅ 保留最后一个窗口（转换为占位窗口）
9. ✅ 打印 Tab 统计信息

### 预期结果

```
📊 Account test-account-1 has 1 tab:
   🔒 PERSISTENT tab-2: tag=placeholder, age=30s
```

## 集成到 Worker

### 步骤 1：初始化 TabManager

**文件**：`packages/worker/src/index.js`

```javascript
const { TabManager } = require('./browser/tab-manager');

// 创建 TabManager
const tabManager = new TabManager(browserManager);

// 传递给平台实例
const platformInstance = new DouyinPlatform(account, browserManager, tabManager);
```

### 步骤 2：修改爬虫代码

**文件**：`packages/worker/src/platforms/douyin/crawl-direct-messages-v2.js`

```javascript
async crawl() {
  // ⭐ 使用 TabManager 获取页面
  const { page } = await this.tabManager.getPageForTask(this.account.id, {
    tag: TabTag.SPIDER_DM,
    persistent: true,
    shareable: false,
    forceNew: false,
  });

  // 导航到私信页面
  if (!page.url().includes('following/chat')) {
    await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
  }

  // 爬取数据
  const messages = await this.extractMessages(page);

  // ⭐ 持久窗口，不关闭
  return messages;
}
```

### 步骤 3：修改登录代码

**文件**：`packages/worker/src/platforms/douyin/platform.js`

```javascript
async startLogin(accountId) {
  const { page, tabId } = await this.tabManager.getPageForTask(accountId, {
    tag: TabTag.LOGIN,
    persistent: false,
    shareable: false,
    forceNew: true,
  });

  try {
    await page.goto('https://www.douyin.com/passport/web/login');
    await this.waitForLoginSuccess(page);
    logger.info('✅ Login successful');

  } finally {
    // ⭐ 登录成功后关闭窗口
    await this.tabManager.closeTab(accountId, tabId);
  }
}
```

## 优势总结

### 1. 资源优化 ✅
- 每个账户固定 2 个持久窗口（私信 + 评论）
- 临时任务用完即关闭
- 占位窗口自动清理

### 2. 灵活性 ✅
- 通过参数控制窗口行为
- 支持持久/非持久
- 支持公用/独立
- 支持强制新建/复用

### 3. 安全性 ✅
- 自动保留最后一个窗口
- 防止浏览器进程意外退出
- 占位窗口机制

### 4. 代码简洁 ✅
```javascript
// 统一接口，自动管理
const { page, tabId, shouldClose } = await tabManager.getPageForTask(accountId, options);
// 使用 page...
if (shouldClose) await tabManager.closeTab(accountId, tabId);
```

### 5. 智能复用 ✅
- 登录检测优先复用登录窗口
- 蜘蛛任务复用已有窗口
- 回复任务独立创建

---

**文档时间**：2025-10-24 19:50
**文档作者**：Claude Code
**文档版本**：1.0
