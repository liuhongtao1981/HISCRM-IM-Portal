# 抖音平台实现技术细节

## 📋 目录

1. [登录实现](#登录实现)
2. [评论爬取](#评论爬取)
3. [私信爬取](#私信爬取)
4. [增量检测](#增量检测)
5. [故障排除](#故障排除)

---

## 登录实现

### 核心特性

抖音登录采用**智能检测 + 多方式支持**的方案：

- ✅ 已登录状态检测（URL/DOM 双重判断）
- ✅ 二维码登录（优先方式）
- ✅ 手机短信验证码登录（备选方式）
- ✅ 账户级浏览器隔离（独立指纹）

### 1.1 检测登录方式

**文件**: `packages/worker/src/platforms/douyin/platform.js` (行 141-250)

**优先级**：
1. **已登录** - 检查 URL 和 DOM 中的用户信息
2. **二维码** - 多选择器检测二维码元素
3. **短信验证码** - 检测手机号输入框
4. **未知** - 抛出错误

```javascript
async detectLoginMethod(page) {
  // 1. 检查 URL：/creator-micro/home 说明已登录
  const currentUrl = page.url();
  if (currentUrl.includes('/creator-micro/home')) {
    return { type: 'logged_in' };
  }

  // 2. 检查 DOM：用户头像/导航栏
  const userElements = [
    '.user-avatar',
    '.avatar-icon',
    '[class*="user-info"]',
    '.nav-user'
  ];

  for (const selector of userElements) {
    if (await page.$(selector)) {
      return { type: 'logged_in' };
    }
  }

  // 3. 检查二维码（多个选择器）
  const qrCodeSelectors = [
    'img[class*="qrcode"]',
    'img[alt*="二维码"]',
    '.qrcode-image img',
    '.login-qrcode img',
    'canvas[class*="qrcode"]'
  ];

  for (const selector of qrCodeSelectors) {
    const element = await page.$(selector);
    if (element) {
      return {
        type: 'qrcode',
        selector: selector,
        expirySelector: '.qrcode-expiry, [class*="expiry"]'
      };
    }
  }

  // 4. 如果看不到二维码，尝试点击"二维码登录"按钮
  const qrSwitchBtn = await page.$('text=二维码登录');
  if (qrSwitchBtn) {
    await qrSwitchBtn.click();
    await page.waitForTimeout(1000);
    // 重新检查二维码
    for (const selector of qrCodeSelectors) {
      if (await page.$(selector)) {
        return { type: 'qrcode', selector };
      }
    }
  }

  // 5. 检查手机短信登录
  const phoneInput = await page.$('input[placeholder*="手机号"]');
  if (phoneInput) {
    return {
      type: 'sms',
      phoneSelector: 'input[placeholder*="手机号"]',
      codeSelector: 'input[placeholder*="验证码"]',
      getSMSButtonSelector: 'button:has-text("获取验证码")',
      loginButtonSelector: 'button:has-text("登录")'
    };
  }

  return { type: 'unknown' };
}
```

### 1.2 二维码登录流程

**使用 PlatformBase.handleQRCodeLogin()** (继承方法)

```javascript
// 在 startLogin() 中调用
if (loginMethod.type === 'qrcode') {
  return await this.handleQRCodeLogin(page, accountId, sessionId, {
    qrSelector: loginMethod.selector,
    expirySelector: loginMethod.expirySelector,
    timeout: 300000,           // 5分钟超时
    checkInterval: 2000,       // 每2秒检查一次
    qrRefreshInterval: 3000    // 二维码刷新检查间隔
  });
}
```

**handleQRCodeLogin() 工作原理**：

1. 等待二维码加载
2. 提取二维码截图（Base64）
3. 发送给 Master → 显示在 Admin-Web
4. 用户用微信/支付宝/抖音扫描
5. 心跳轮询检测登录状态（每2秒）
6. 检测二维码是否变化（证明已扫码）
7. 登录成功 → 保存 Cookie 和指纹

### 1.3 手机短信验证码登录

**使用 PlatformBase.handleSMSLogin()** (继承方法)

```javascript
if (loginMethod.type === 'sms') {
  return await this.handleSMSLogin(page, accountId, sessionId, {
    phoneSelector: loginMethod.phoneSelector,
    codeSelector: loginMethod.codeSelector,
    getSMSButtonSelector: loginMethod.getSMSButtonSelector,
    loginButtonSelector: loginMethod.loginButtonSelector
  });
}
```

**SMS 登录流程**：

1. 填入手机号 → 点击"获取验证码"
2. 等待用户输入验证码（通过 `waitForUserInput()` 方法）
3. 用户在 Admin-Web 中输入验证码
4. Worker 接收验证码 → 填入表单
5. 点击登录按钮
6. 等待登录成功

### 1.4 提取用户信息

**文件**: `packages/worker/src/platforms/douyin/platform.js` (行 474-541)

```javascript
async extractUserInfo(page) {
  // 登录后提取用户基本信息
  // 数据来源：首页导航栏和个人资料

  const userInfo = await page.evaluate(() => {
    // 1. 头像
    let avatar = null;
    const avatarImg = document.querySelector('.user-avatar img, .avatar-icon img');
    if (avatarImg) {
      avatar = avatarImg.src;
    }

    // 2. 用户昵称
    let nickname = '';
    const nicknameEl = document.querySelector('[class*="nickname"], .user-name');
    if (nicknameEl) {
      nickname = nicknameEl.textContent.trim();
    }

    // 3. 抖音号（从 URL 或页面提取）
    let douyinId = '';
    const douyinIdEl = document.querySelector('[class*="douyin-id"], .user-id');
    if (douyinIdEl) {
      douyinId = douyinIdEl.textContent.trim();
    }

    // 4. 粉丝数 & 关注数
    let followers = '0', following = '0';
    const fansElement = document.querySelector('#guide_home_fans [class*="number"]');
    if (fansElement) followers = fansElement.textContent.trim();

    const followingElement = document.querySelector('#guide_home_following [class*="number"]');
    if (followingElement) following = followingElement.textContent.trim();

    return {
      avatar,
      nickname,
      uid: douyinId,
      douyin_id: douyinId,
      followers,
      following
    };
  });

  return userInfo;
}
```

**返回数据结构**:
```javascript
{
  avatar: "https://...",           // 头像 URL
  nickname: "账号昵称",            // 显示名称
  uid: "douyin_id",                // 抖音号
  douyin_id: "douyin_id",          // 抖音号（同上，冗余）
  followers: "1.2w",               // 粉丝数
  following: "523"                 // 关注数
}
```

---

## 评论爬取

### 核心策略

抖音评论爬取采用 **API 拦截 + DOM 回退** 的混合方案：

1. **优先使用 API 拦截** - 获取结构化数据，准确性高
2. **DOM 回退** - 如果 API 未触发，从页面元素提取

### 2.1 页面导航

**评论管理页面 URL**:
```
https://creator.douyin.com/creator-micro/interactive/comment
```

**导航代码**:
```javascript
await page.goto(
  'https://creator.douyin.com/creator-micro/interactive/comment',
  { waitUntil: 'networkidle', timeout: 30000 }
);
await page.waitForTimeout(2000);  // 等待页面完全加载
```

### 2.2 API 拦截策略

**文件**: `packages/worker/src/platforms/douyin/platform.js` (行 551-650)

```javascript
async crawlComments(account, options = {}) {
  const page = await this.getOrCreatePage(account.id);

  const allApiResponses = [];
  const commentApiPattern = /comment.*list/i;

  // 监听所有网络响应
  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    // 检查是否为评论 API
    if (commentApiPattern.test(url) && contentType.includes('application/json')) {
      try {
        const json = await response.json();

        // 验证是否包含评论数据
        if (json.comment_info_list && Array.isArray(json.comment_info_list)) {
          allApiResponses.push({
            timestamp: Date.now(),
            url: url,
            item_id: this.extractItemId(url),
            cursor: this.extractCursor(url),
            data: json
          });

          logger.debug(
            `Intercepted: ${json.comment_info_list.length} comments, ` +
            `has_more=${json.has_more}`
          );
        }
      } catch (error) {
        // JSON 解析失败，忽略
      }
    }
  });

  // 导航并等待数据加载
  await page.goto('https://creator.douyin.com/.../comment', {
    waitUntil: 'networkidle'
  });

  // 滚动页面触发更多 API 请求
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });
    await page.waitForTimeout(1000);
  }

  // 解析 API 响应数据
  const comments = this.parseCommentsFromAPI(allApiResponses);

  // 如果 API 未返回数据，回退到 DOM 提取
  if (comments.length === 0) {
    logger.warn('No comments from API, falling back to DOM extraction');
    return await this.extractCommentsByDOM(page);
  }

  return comments;
}
```

### 2.3 API 数据解析

**API 响应格式**:
```javascript
{
  comment_info_list: [
    {
      id: "评论ID",
      aweme_id: "作品ID",
      text: "评论内容",
      create_time: 1234567890,
      user: {
        id: "用户ID",
        nickname: "用户昵称",
        avatar_larger: { url_list: ["头像URL"] }
      },
      digg_count: 10,  // 点赞数
      reply_comment_count: 2  // 回复数
    }
  ],
  has_more: true,  // 是否还有更多
  cursor: "next_cursor_value"
}
```

**解析函数**:
```javascript
parseCommentsFromAPI(allApiResponses) {
  const comments = [];
  const seenIds = new Set();  // 去重

  for (const response of allApiResponses) {
    const { data } = response;

    if (data.comment_info_list) {
      for (const item of data.comment_info_list) {
        // 防止重复
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        comments.push({
          id: item.id,
          content: item.text,
          author_name: item.user?.nickname || '',
          author_id: item.user?.id || '',
          post_id: item.aweme_id,
          like_count: item.digg_count || 0,
          reply_count: item.reply_comment_count || 0,
          detected_at: Math.floor(Date.now() / 1000),
          created_at: item.create_time
        });
      }
    }
  }

  logger.info(`Parsed ${comments.length} comments from API`);
  return comments;
}
```

### 2.4 DOM 回退提取

```javascript
async extractCommentsByDOM(page) {
  const comments = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="comment-item"]');
    return Array.from(items).map(item => ({
      id: item.getAttribute('data-id') || Date.now().toString(),
      content: item.querySelector('[class*="comment-text"]')?.textContent || '',
      author_name: item.querySelector('[class*="author"]')?.textContent || '',
      author_id: item.getAttribute('data-author-id') || '',
      like_count: parseInt(
        item.querySelector('[class*="like-count"]')?.textContent || '0'
      ),
      detected_at: Math.floor(Date.now() / 1000)
    })).filter(c => c.content && c.author_name);
  });

  logger.info(`Extracted ${comments.length} comments from DOM`);
  return comments;
}
```

---

## 私信爬取

### 私信页面导航

**私信管理页面 URL**:
```
https://creator.douyin.com/creator-micro/data/following/chat
```

**导航代码**:
```javascript
await page.goto(
  'https://creator.douyin.com/creator-micro/data/following/chat',
  { waitUntil: 'networkidle', timeout: 30000 }
);
```

### 3.1 私信 API 拦截

**API 模式**: `/message/get_by_user_init` 或 `/message/query`

```javascript
async crawlDirectMessages(account, options = {}) {
  const page = await this.getOrCreatePage(account.id);

  const allApiResponses = [];
  const messageApiPattern = /message\/(get_by_user_init|query)/i;

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';

    if (messageApiPattern.test(url) && contentType.includes('application/json')) {
      try {
        const json = await response.json();

        if (json.user_message_list || json.messages) {
          allApiResponses.push({
            timestamp: Date.now(),
            url: url,
            data: json
          });

          logger.debug(`Intercepted ${json.user_message_list?.length || 0} messages`);
        }
      } catch (error) {
        // 忽略解析错误
      }
    }
  });

  // 导航到私信页面
  await page.goto('https://creator.douyin.com/.../chat', {
    waitUntil: 'networkidle'
  });

  // 滚动触发加载
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(800);
  }

  const messages = this.parseMessagesFromAPI(allApiResponses);

  if (messages.length === 0) {
    logger.warn('No messages from API, falling back to DOM extraction');
    return await this.extractMessagesByDOM(page);
  }

  return messages;
}
```

### 3.2 私信数据结构

```javascript
{
  user_message_list: [
    {
      id: "消息ID",
      to_user_id: "接收者ID",
      from_user_id: "发送者ID",
      content: "消息内容",
      create_time: 1234567890,
      user: {
        id: "用户ID",
        nickname: "用户昵称"
      },
      status: 0  // 0: 未读, 1: 已读
    }
  ]
}
```

**解析函数**:
```javascript
parseMessagesFromAPI(allApiResponses) {
  const messages = [];
  const seenIds = new Set();

  for (const response of allApiResponses) {
    const { data } = response;

    const msgList = data.user_message_list || data.messages || [];

    for (const item of msgList) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);

      messages.push({
        id: item.id,
        content: item.content,
        sender_name: item.user?.nickname || '',
        sender_id: item.user?.id || item.from_user_id || '',
        receiver_id: item.to_user_id || '',
        direction: 'inbound',  // 接收的私信
        is_read: item.status === 1,
        detected_at: Math.floor(Date.now() / 1000),
        created_at: item.create_time
      });
    }
  }

  logger.info(`Parsed ${messages.length} direct messages from API`);
  return messages;
}
```

### 3.3 React 虚拟列表提取（DOM 回退）

⚠️ **重要**：抖音私信使用 **ReactVirtualized 虚拟列表**渲染，API 可能不触发。此时需要从 React 组件中直接提取数据。

#### 方案概述

抖音私信列表虽然使用 React 渲染，但 React Fiber 对象通过 `__reactFiber$` 属性仍然可以访问。从 Fiber 对象中可以获取真实的 item 数据，包括：

- ✅ **真实时间戳** (`createdTime`) - 而非相对时间
- ✅ **真实 ID** (`item.id`, `item.shortId`)
- ✅ **完整消息内容** (`item.content.text`)
- ✅ **发送者 ID** (`item.coreInfo.owner`)
- ✅ **元数据** (`isGroupChat`, `isStrangerChat` 等)

#### React Fiber 数据结构

```javascript
// 从虚拟列表中获得的真实 item 对象
{
  // 会话和消息 ID
  id: "0:1:2823198018634728:2851498123342840",
  shortId: 7561661276397519406,

  // 真实时间戳（JavaScript Date 对象）
  createdTime: "Thu Oct 16 2025 11:48:07 GMT+0800 (中国标准时间)",

  // 消息内容（完整，不截断）
  content: {
    createdAt: 0,
    is_card: false,
    msgHint: '',
    aweType: 700,
    text: '你好，有什么可以帮您的？',  // ← 完整文本
    richTextInfos: []
  },

  // 发送者信息
  secUid: "MS4wLjABAAAAGngm...",
  coreInfo: {
    owner: 2851498123342840,  // ← 真实发送者 ID
    name: '',
    desc: '',
    participant: { /* 参与者信息 */ }
  },

  // 元数据
  isGroupChat: false,
  isStrangerChat: false,
  isMember: true,
  bizType: 0,
  ticket: '...',
  participantCount: 2
}
```

#### 实现代码

```javascript
async extractDirectMessagesFromReact(page) {
  // 从 React 虚拟列表中提取消息
  // 使用 Fiber 访问真实的 item 对象

  const messages = await page.evaluate(() => {
    // 1. 找到虚拟列表的内部容器
    const innerContainer = document.querySelector(
      '.ReactVirtualized__Grid__innerScrollContainer'
    );

    if (!innerContainer) {
      console.warn('Virtual list container not found');
      return [];
    }

    const messageList = [];

    // 2. 遍历虚拟列表中的每一行
    Array.from(innerContainer.children).forEach((row, idx) => {
      try {
        // 3. 访问 React Fiber
        const fiberKey = Object.keys(row).find(
          k => k.startsWith('__reactFiber')
        );

        if (!fiberKey) {
          console.warn(`No Fiber found for row ${idx}`);
          return;
        }

        const fiber = row[fiberKey];

        // 4. 获取原始 item 对象（在 memoizedProps 中）
        const item = fiber.child?.memoizedProps?.item;

        if (!item) {
          console.warn(`No item data for row ${idx}`);
          return;
        }

        // 5. 直接提取真实数据
        const message = {
          // 使用真实 ID
          platform_message_id: item.id || item.shortId?.toString(),

          // 使用真实时间戳
          created_at: item.createdTime
            ? new Date(item.createdTime).getTime() / 1000
            : Math.floor(Date.now() / 1000),

          // 完整消息内容
          content: item.content?.text || '',

          // 发送者信息（从 participant 或 coreInfo 提取）
          sender_name: item.coreInfo?.participant?.nickname || '',
          sender_id: item.coreInfo?.owner?.toString() || '',

          // 元数据
          direction: 'inbound',
          is_group_chat: item.isGroupChat || false,
          is_stranger_chat: item.isStrangerChat || false,

          detected_at: Math.floor(Date.now() / 1000)
        };

        messageList.push(message);

      } catch (error) {
        console.error(`Error extracting message at row ${idx}:`, error.message);
        // 继续处理下一行
      }
    });

    return messageList;
  });

  logger.info(
    `Extracted ${messages.length} messages from React virtual list`
  );
  return messages;
}
```

#### 调用流程

```javascript
async crawlDirectMessages(account, options = {}) {
  const page = await this.getOrCreatePage(account.id);

  // 导航到私信页面
  await page.goto('https://creator.douyin.com/creator-micro/data/following/chat', {
    waitUntil: 'networkidle'
  });

  // 滚动触发虚拟列表加载
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);
  }

  // 策略 1：优先尝试 API 拦截
  const apiMessages = await this.tryExtractViaAPI(page);
  if (apiMessages.length > 0) {
    logger.info('Using API-intercepted messages');
    return apiMessages;
  }

  // 策略 2：回退到 React Fiber 提取
  logger.info('API failed, falling back to React Fiber extraction');
  const reactMessages = await this.extractDirectMessagesFromReact(page);

  if (reactMessages.length > 0) {
    return reactMessages;
  }

  // 策略 3：最后回退到 DOM 文本提取
  logger.info('React Fiber failed, falling back to DOM text extraction');
  return await this.extractDirectMessagesFromDOM(page);
}
```

#### 数据对比

| 字段 | DOM 文本提取 | React Fiber 提取 | 备注 |
|------|------------|----------------|------|
| **消息ID** | ❌ 无 | ✅ `item.id` | Fiber 优势 |
| **时间戳** | ⚠️ 相对时间 | ✅ 真实Unix | **重大差异** |
| **消息内容** | ⚠️ 截断 | ✅ 完整 | Fiber 优势 |
| **发送者ID** | ❌ 无 | ✅ `item.coreInfo.owner` | Fiber 优势 |
| **群组信息** | ❌ 无 | ✅ `item.isGroupChat` | Fiber 优势 |

---

## 增量检测

### 4.1 工作原理

抖音增量检测系统追踪评论变化，避免重复通知：

```
首次爬取: [评论1, 评论2, 评论3] → 保存到数据库
第二次爬取: [评论1, 评论2, 评论3, 评论4, 评论5]
  ↓
检测差异: [评论4, 评论5] 是新数据 → 通知用户
  ↓
保存状态: is_new=1 标记新评论
```

### 4.2 增量比对逻辑

**文件**: `packages/worker/src/services/incremental-crawl-service.js`

```javascript
detectNewComments(crawledComments, existingComments) {
  // 构建已有评论的ID集合
  const existingIds = new Set(existingComments.map(c => c.id));

  // 找出新评论
  const newComments = crawledComments.filter(
    comment => !existingIds.has(comment.id)
  );

  // 统计信息
  const stats = {
    total_crawled: crawledComments.length,
    new_comments: newComments.length,
    existing_comments: existingComments.length,
    change_count: crawledComments.length - existingComments.length
  };

  logger.info(
    `Incremental detection: ${newComments.length} new, ` +
    `${stats.existing_comments} existing`
  );

  return {
    new_comments: newComments,
    stats: stats,
    should_notify: newComments.length > 0
  };
}
```

### 4.3 数据库字段

**comments 表**:
```sql
-- 新增字段（用于增量检测）
ALTER TABLE comments ADD COLUMN (
  is_new INTEGER DEFAULT 1,        -- 1: 新评论, 0: 已处理
  first_detected_at INTEGER,       -- 首次发现时间
  post_cover TEXT,                 -- 作品封面
  like_count INTEGER DEFAULT 0,    -- 点赞数
  reply_count INTEGER DEFAULT 0    -- 回复数
);
```

---

## 故障排除

### 登录问题

| 问题 | 原因 | 解决方案 |
|-----|------|--------|
| 二维码检测失败 | 页面加载不完全 | 增加 waitUntil 超时；检查网络 |
| 二维码过期 | 用户未及时扫描 | 增加超时时间；重新开始登录 |
| 短信验证码超时 | 网络延迟 | 增加 timeout；检查手机号输入 |
| Cookie 保存失败 | 权限问题 | 检查文件系统权限；清空缓存 |

### 爬虫问题

| 问题 | 原因 | 解决方案 |
|-----|------|--------|
| 评论为空 | API 未触发 | 增加滚动次数；检查 URL 正确性 |
| 数据不完整 | 页面动态渲染 | 增加等待时间；使用 waitForSelector |
| 重复数据 | 缓存问题 | 检查去重逻辑；清空浏览器缓存 |
| 频率过高被封 | 请求太快 | 增加随机延迟；调整监控间隔 |

### 调试技巧

```javascript
// 1. 保存调试截图
await this.takeScreenshot(accountId, 'debug_' + Date.now() + '.png');

// 2. 打印页面 HTML
const html = await page.content();
logger.info('Page HTML:', html.substring(0, 500));

// 3. 检查元素是否存在
const exists = await page.$('[class*="comment"]');
logger.info('Comment elements found:', !!exists);

// 4. 等待特定元素
await page.waitForSelector('[class*="comment-item"]', { timeout: 10000 });

// 5. 获取所有 URL
const responses = [];
page.on('response', (r) => responses.push(r.url()));
```

---

## 常见问题

### Q1: 如何添加新的登录方式？
**A**: 在 `detectLoginMethod()` 中添加新的检测逻辑，然后在 `startLogin()` 中调用对应的处理方法。

### Q2: 如何优化爬虫速度？
**A**:
- 减少滚动次数
- 使用并行页面处理
- 增加 API 拦截的超时
- 预加载常用页面

### Q3: Cookie 和指纹如何工作？
**A**:
- Cookie 保存认证状态（SessionID、Token 等）
- 指纹模拟真实用户（WebGL、Canvas、UA 等）
- 两者结合提高成功率

### Q4: 如何处理账户被限流？
**A**:
- 增加监控间隔（15-30秒随机）
- 轮换代理 IP
- 添加随机延迟和操作
- 检查 Cookie 是否过期

---

## 🎓 技术要点总结

### 登录流程要点

#### 关键技术
- **多层检测** - 同时检查 URL、DOM 元素和选择器，提高准确性
- **选择器容错** - 使用多个备选选择器，兼容不同的页面版本
- **心跳轮询** - 每 2 秒检测一次登录状态，支持 5 分钟超时
- **二维码刷新** - 监听二维码变化（证明已扫码），每 3 秒检查一次

#### 最佳实践
```javascript
// ✅ 好的做法
const selectors = [
  'img[class*="qrcode"]',      // 多个选择器
  'img[alt*="二维码"]',
  '.qrcode-image img'
];

// ❌ 避免
const selector = 'img.qrcode'; // 单一选择器易失败
```

---

### 爬虫策略要点

#### 三层数据获取策略

**优先级**:
```
API 拦截 (最优)
  ↓ 失败
React Fiber (次优，数据最完整)
  ↓ 失败
DOM 文本 (备选，可能丢失数据)
```

#### 为什么 API 拦截最优？
- ✅ 结构化 JSON 数据，直接解析
- ✅ 不受 DOM 渲染变化影响
- ✅ 包含所有字段（ID、时间戳等）
- ❌ 需要正确的 URL 匹配和等待

#### React Fiber 的优势
- ✅ 获取真实时间戳（`createdTime`）
- ✅ 完整的消息 ID （`item.id`、`item.shortId`）
- ✅ 发送者 ID（`item.coreInfo.owner`）
- ✅ 群组信息（`isGroupChat` 等元数据）
- ⚠️ 需要理解 React 内部结构

#### DOM 文本提取的局限
- ⚠️ 只能获取相对时间（"星期四"、"10-14"）
- ⚠️ 消息内容可能被截断
- ⚠️ 无法获取 ID 和发送者 ID
- ✅ 最后的保底方案

---

### React 虚拟列表提取技术

#### 核心原理

```javascript
// React Fiber 访问路径
DOM 元素 → __reactFiber$ 属性 → Fiber 对象 → memoizedProps → item 对象

// 代码实现
const fiberKey = Object.keys(row).find(k => k.startsWith('__reactFiber'));
const fiber = row[fiberKey];
const item = fiber.child?.memoizedProps?.item;
```

#### 关键洞察

1. **虚拟列表原理** - 只渲染可见行，滚动时动态更新
2. **Fiber 访问** - 即使 DevTools Hook 未暴露，仍可通过 `__reactFiber$` 访问
3. **真实数据** - memoizedProps 中的 item 是完整的原始对象
4. **容错处理** - 需要检查 Fiber 存在和 item 数据完整性

#### 实施建议

```javascript
// ✅ 安全的提取方式
const fiberKey = Object.keys(row).find(k => k.startsWith('__reactFiber'));
if (!fiberKey) return null;  // 处理不存在的情况

const fiber = row[fiberKey];
if (!fiber?.child?.memoizedProps) return null;  // 使用可选链

const item = fiber.child.memoizedProps.item;
if (!item) return null;  // 验证 item 存在

// 使用 item 数据...
```

---

### 数据完整性要点

#### 时间戳处理

| 来源 | 格式 | 准确性 | 使用场景 |
|------|------|--------|--------|
| **API** | Unix 时间戳 | ✅ 精确 | 首选 |
| **React Fiber** | JavaScript Date | ✅ 精确 | 次选 |
| **DOM 文本** | 相对时间 | ⚠️ 需转换 | 备选 |

#### 数据去重

```javascript
// ✅ 使用 Set 追踪已见 ID
const seenIds = new Set();

for (const item of items) {
  if (seenIds.has(item.id)) continue;  // 跳过重复
  seenIds.add(item.id);
  processItem(item);
}
```

#### 增量检测的关键

```javascript
// 比对新旧数据
const oldIds = new Set(existingData.map(d => d.id));
const newData = currentData.filter(d => !oldIds.has(d.id));

// 只推送新数据
if (newData.length > 0) {
  await notify(newData);
}
```

---

### 反爬虫对抗要点

#### 常见限制和应对

| 问题 | 原因 | 解决方案 |
|------|------|--------|
| 频繁 403 错误 | 请求过于频繁 | 增加随机延迟（2-5秒） |
| 二维码超时 | 检测到自动化 | 增加真实操作（滚动、等待） |
| Cookie 过期 | 认证失效 | 定期检查和刷新 Cookie |
| IP 被封 | 同一 IP 请求过多 | 轮换代理、分散请求 |

#### 最佳实践

```javascript
// ✅ 好的做法
// 1. 随机延迟
await page.waitForTimeout(Math.random() * 3000 + 2000);

// 2. 真实操作
await page.evaluate(() => window.scrollBy(0, Math.random() * 300 + 100));

// 3. 间隔监控
const interval = Math.random() * 15000 + 15000;  // 15-30秒

// 4. UA 和指纹
const fingerprint = await loadFingerprint(accountId);
// 使用指纹的 UA、WebGL、Canvas 特征

// 5. Cookie 管理
await saveCookies(accountId);  // 持久化认证
```

---

### 性能优化要点

#### 滚动和加载

```javascript
// ⚠️ 避免太多滚动（容易被检测）
for (let i = 0; i < 3; i++) {  // 3 次足够
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(1000);
}

// ✅ 根据页面大小动态滚动
const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
const times = Math.ceil(scrollHeight / 500);  // 计算需要滚动次数
```

#### 页面等待

```javascript
// ⚠️ 硬等待容易超时
await page.waitForTimeout(5000);  // 不好

// ✅ 等待实际元素出现
await page.waitForSelector('.comment-item', { timeout: 10000 });

// ✅ 等待网络空闲
await page.goto(url, { waitUntil: 'networkidle' });
```

#### 并行处理

```javascript
// ⚠️ 串行处理太慢
for (const account of accounts) {
  await crawlAccount(account);  // 一个一个
}

// ✅ 并行处理（但要限制并发数）
const results = await Promise.all(
  accounts.map(a => crawlAccount(a))
);

// ✅ 更安全：使用 Promise.allSettled
const results = await Promise.allSettled(
  accounts.map(a => crawlAccount(a))
);
```

---

### 错误处理要点

#### 分类处理不同错误

```javascript
try {
  await crawlComments(account);
} catch (error) {
  // 1. 网络错误 - 重试
  if (error.message.includes('net::ERR')) {
    await retry(crawlComments, account);
  }

  // 2. 超时错误 - 放宽超时或跳过
  if (error.message.includes('Timeout')) {
    logger.warn('Timeout, skipping...');
    return [];
  }

  // 3. 元素不存在 - 使用备选策略
  if (error.message.includes('not found')) {
    return await fallbackExtraction(page);
  }

  // 4. 其他错误 - 记录并上报
  logger.error('Unexpected error:', error);
  await reportError(error);
}
```

#### 重试策略

```javascript
// ✅ 指数退避
async function retry(fn, arg, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn(arg);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
      await page.waitForTimeout(delay);
    }
  }
}
```

---

### 调试和监控要点

#### 关键日志点

```javascript
// 1. 进入关键函数
logger.info(`Starting [operation] for account ${accountId}`);

// 2. 状态变化
logger.info(`[status changed]: ${oldStatus} → ${newStatus}`);

// 3. 数据里程碑
logger.info(`Extracted ${items.length} items, expected ${total}`);

// 4. 警告
logger.warn(`API intercept failed, falling back to DOM extraction`);

// 5. 错误
logger.error(`Operation failed:`, error);
```

#### 调试技巧

```javascript
// 1. 保存截图用于分析
await this.takeScreenshot(accountId, `debug_${operation}_${Date.now()}.png`);

// 2. 导出页面 HTML
const html = await page.content();
fs.writeFileSync(`debug_${accountId}.html`, html);

// 3. 记录所有网络请求
const requests = [];
page.on('request', r => requests.push(r.url()));
// 之后分析 requests

// 4. 监控性能
const startTime = Date.now();
const result = await operation();
const duration = Date.now() - startTime;
logger.info(`Operation took ${duration}ms`);
```

---

### 架构设计要点

#### 为什么使用 PlatformBase？

```javascript
// ✅ 好的做法：继承 PlatformBase
class DouyinPlatform extends PlatformBase {
  async crawlComments(account) {
    const context = await this.getAccountContext(account.id);
    const page = await context.newPage();
    // ... 爬虫逻辑
  }
}

// 优势：
// 1. 代码复用（登录、通信、存储）
// 2. 统一接口（可扩展到多平台）
// 3. 账户隔离（独立 Browser、指纹）
// 4. 资源管理（自动清理）
```

#### 多平台扩展的关键

```javascript
// 1. 平台无关的操作 → 放在 PlatformBase
// 2. 平台特定的操作 → 放在 DouyinPlatform
// 3. 配置参数 → 放在 config.json

// 新平台只需实现：
// - initialize()
// - startLogin()
// - crawlComments()
// - crawlDirectMessages()
// - cleanup()
```

---

## 参考资源

- 归档文档: `_archived/抖音爬虫实现说明.md`
- 归档文档: `_archived/增量抓取实现指南.md`
- 归档文档: `_archived/抖音创作者中心登录功能实施完成报告.md`
- 归档文档: `_archived/REACT_DM_EXTRACTION_SOLUTION.md`
- 归档文档: `_archived/REACT_ITEM_OBJECT_EXTRACTION.md`
- 代码文件: `packages/worker/src/platforms/douyin/platform.js`
- 基类文件: `packages/worker/src/platforms/base/platform-base.js`
- 时间解析: `packages/shared/utils/time-parser.js`
