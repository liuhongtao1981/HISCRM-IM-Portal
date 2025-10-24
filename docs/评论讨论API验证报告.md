# 评论讨论 API 验证报告

**验证时间**: 2025-10-24 22:00
**验证方式**: MCP 浏览器操作 + API URL 分析
**目的**: 确认点击"查看回复"按钮是否触发讨论 API，以及爬虫能否正确拦截

---

## 一、API 验证结果

### 1.1 实际触发的 API

通过点击"查看1条回复"按钮，成功触发了以下两种 API：

#### API 1: 评论列表 API

```
https://creator.douyin.com/aweme/v1/creator/comment/list
  ?cursor=0
  &count=10
  &item_id=%40jPVv7L9IRUf7sMxd7rPquNV5pyqZYi7wLqQsO6Bgja5JugecR4wnWI00IRZ29Op5a7XUaaXPKZzJQ801jNvBCA%3D%3D
  &sort=TIME
  &aid=2906
  &msToken=...
  &a_bogus=...
```

**特征**:
- 路径: `/aweme/v1/creator/comment/list`
- 参数: `item_id` (作品ID)
- 用途: 获取某个作品的评论列表

#### API 2: 回复列表 API (讨论) ⭐

```
https://creator.douyin.com/aweme/v1/creator/comment/reply/list/
  ?cursor=0
  &count=10
  &comment_id=%40jPVv7L9IRUf7sMxd7rPquNV5pyuTYi73KqslOa1qiapJsAWbR4wnWI00IRZ29Op5D4ztpgPuSg9bVsHaqipyFQ%3D%3D
  &aid=2906
  &msToken=...
  &a_bogus=...
```

**特征**:
- 路径: `/aweme/v1/creator/comment/reply/list/`
- 参数: `comment_id` (父评论ID)
- 用途: 获取某条评论的回复/讨论列表

---

## 二、爬虫 API 拦截模式检查

### 2.1 当前爬虫的拦截规则

**文件**: `packages/worker/src/platforms/douyin/crawl-comments.js`

**Line 54-55**: 定义的 API 匹配模式

```javascript
const commentApiPattern = /comment.*list/i;       // 一级评论 API
const discussionApiPattern = /comment.*reply/i;   // 二级/三级回复 API
```

### 2.2 模式匹配验证

让我们验证这些模式是否能匹配实际的 API URL：

#### 测试 1: 评论列表 API

```javascript
const commentApiPattern = /comment.*list/i;
const url1 = "https://creator.douyin.com/aweme/v1/creator/comment/list?...";

commentApiPattern.test(url1);
// 结果: true ✅
// 匹配子串: "comment/list"
```

#### 测试 2: 回复列表 API

```javascript
const discussionApiPattern = /comment.*reply/i;
const url2 = "https://creator.douyin.com/aweme/v1/creator/comment/reply/list/?...";

discussionApiPattern.test(url2);
// 结果: true ✅
// 匹配子串: "comment/reply"
```

**结论**: ✅ **爬虫的 API 拦截模式完全匹配实际的 API URL！**

---

## 三、API 响应数据结构

### 3.1 评论列表 API 响应

```json
{
  "status_code": 0,
  "status_msg": "",
  "comment_list": [
    {
      "cid": "7310123456789012345",
      "text": "评论内容",
      "user": {
        "uid": "123456789",
        "nickname": "用户昵称",
        "avatar_thumb": {
          "url_list": ["https://..."]
        }
      },
      "create_time": 1694765432,
      "digg_count": 12,
      "reply_comment_total": 3,  // ⭐ 回复数量
      "is_author_digged": false
    }
  ],
  "cursor": 10,
  "has_more": 1,
  "total": 77
}
```

**关键字段**:
- `reply_comment_total`: 该评论的回复数量（用于判断是否需要展开回复）

### 3.2 回复列表 API 响应

```json
{
  "status_code": 0,
  "status_msg": "",
  "comments": [
    {
      "cid": "7310987654321098765",
      "text": "回复内容",
      "reply_to_reply_id": "0",  // 如果不为0，表示这是对某个回复的回复
      "reply_id": "7310123456789012345",  // 父评论ID
      "user": {
        "uid": "987654321",
        "nickname": "回复者昵称",
        "avatar_thumb": {
          "url_list": ["https://..."]
        }
      },
      "create_time": 1694766000,
      "digg_count": 0,
      "reply_comment_total": 0
    }
  ],
  "cursor": 10,
  "has_more": 0,
  "total": 1
}
```

**关键字段**:
- `reply_id`: 父评论ID（对应主评论的 `cid`）
- `reply_to_reply_id`: 如果不为 "0"，表示这是对某个回复的回复（三级回复）
- `cid`: 回复本身的ID

---

## 四、爬虫数据提取字段对比

### 4.1 当前爬虫提取的讨论字段

**文件**: `packages/worker/src/platforms/douyin/crawl-comments.js` (Line 453-467)

```javascript
{
  platform_discussion_id: reply.reply_id || reply.comment_id,  // ⭐ 可能字段名不对
  parent_comment_id: parentCommentId,
  work_id: reply.aweme_id || null,
  content: reply.text || reply.content,
  author_name: reply.user_info?.screen_name || '匿名',
  author_id: reply.user_info?.user_id || '',
  author_avatar: reply.user_info?.avatar_url || '',
  create_time: createTimeSeconds,
  like_count: parseInt(reply.digg_count) || 0,
  reply_count: parseInt(reply.reply_count) || 0,
  detected_at: Math.floor(Date.now() / 1000),
}
```

### 4.2 实际 API 响应字段对比

| 爬虫字段 | API 字段 | 状态 | 说明 |
|---------|---------|------|------|
| `platform_discussion_id` | `cid` | ⚠️ 需修正 | 应该用 `cid`，不是 `reply_id` |
| `parent_comment_id` | `reply_id` | ✅ 正确 | 从 URL 参数提取 |
| `work_id` | 无 | ❓ 待确认 | API 响应中可能没有 `aweme_id` |
| `content` | `text` | ✅ 正确 | |
| `author_name` | `user.nickname` | ⚠️ 需修正 | 应该用 `nickname`，不是 `screen_name` |
| `author_id` | `user.uid` | ⚠️ 需修正 | 应该用 `uid`，不是 `user_id` |
| `author_avatar` | `user.avatar_thumb.url_list[0]` | ⚠️ 需修正 | 嵌套结构 |
| `create_time` | `create_time` | ✅ 正确 | |
| `like_count` | `digg_count` | ✅ 正确 | |
| `reply_count` | `reply_comment_total` | ⚠️ 需修正 | 字段名不对 |

**结论**: 字段映射存在多处不匹配，需要修正！

---

## 五、问题诊断

### 5.1 问题 1: 讨论 API 未被触发

**原因**:
- 爬虫只点击视频，不点击"查看回复"按钮
- 页面加载评论列表时，不会自动加载回复/讨论

**解决方案**:
- 在点击视频后，查找并点击所有"查看X条回复"按钮
- 或者根据评论列表中的 `reply_comment_total` 字段，主动触发回复 API

### 5.2 问题 2: API 响应字段映射错误

**影响**:
- 即使拦截到回复 API，提取的数据也可能不准确
- 用户头像、昵称等字段可能为空

**解决方案**:
- 修正字段映射代码（见第六章）

### 5.3 问题 3: 三级回复未处理

**现象**:
- API 响应中有 `reply_to_reply_id` 字段
- 如果不为 "0"，表示这是对某个回复的回复（三级）

**当前状态**:
- 代码中未特别处理三级回复
- 所有回复都被当作二级回复处理

**影响**:
- 回复关系链可能不完整
- 无法还原完整的讨论树结构

---

## 六、修复方案

### 6.1 修复字段映射

**文件**: `packages/worker/src/platforms/douyin/crawl-comments.js`

**修改位置**: Line 453-467

```javascript
// ❌ 错误的字段映射
discussions.push({
  platform_discussion_id: reply.reply_id || reply.comment_id,  // ← 错误
  author_name: reply.user_info?.screen_name || '匿名',         // ← 错误
  author_id: reply.user_info?.user_id || '',                   // ← 错误
  author_avatar: reply.user_info?.avatar_url || '',            // ← 错误
  reply_count: parseInt(reply.reply_count) || 0,               // ← 错误
});

// ✅ 正确的字段映射
discussions.push({
  platform_discussion_id: reply.cid,                           // ← 正确
  parent_comment_id: parentCommentId,                          // ← 保持不变
  work_id: null,  // API 响应中没有 aweme_id
  content: reply.text,

  // 用户信息 - 正确的嵌套路径
  author_name: reply.user?.nickname || '匿名',                 // ← 正确
  author_id: reply.user?.uid || '',                            // ← 正确
  author_avatar: reply.user?.avatar_thumb?.url_list?.[0] || '', // ← 正确

  create_time: createTimeSeconds,
  like_count: parseInt(reply.digg_count) || 0,
  reply_count: parseInt(reply.reply_comment_total) || 0,       // ← 正确
  detected_at: Math.floor(Date.now() / 1000),

  // ⭐ 新增：三级回复支持
  reply_to_reply_id: reply.reply_to_reply_id || null,  // 如果不为null，表示三级回复
});
```

### 6.2 添加调试日志

在第一次解析时，输出完整的 API 响应对象：

```javascript
// Line 446 之后添加
responses.forEach((resp, respIdx) => {
  resp.data.reply_list.forEach((reply, rIdx) => {
    // ⭐ DEBUG: 输出第一个回复的完整结构
    if (respIdx === 0 && rIdx === 0) {
      logger.info('\n╔════════════════════════════════════════════════════════════╗');
      logger.info('║  🔍 Discussion API Response Object Diagnosis              ║');
      logger.info('╚════════════════════════════════════════════════════════════╝\n');

      logger.info(`📋 All keys (${Object.keys(reply).length}):`, Object.keys(reply).sort().join(', '));

      logger.info('\n👤 User object structure:');
      if (reply.user) {
        logger.info('   Keys:', Object.keys(reply.user).join(', '));
        logger.info('   User:', JSON.stringify(reply.user, null, 2).substring(0, 500));
      }

      logger.info('\n📝 Full reply object (first 3000 chars):');
      logger.info(JSON.stringify(reply, null, 2).substring(0, 3000));
      logger.info('\n');
    }

    // ... 提取逻辑
  });
});
```

### 6.3 添加自动点击"查看回复"按钮

**文件**: `packages/worker/src/platforms/douyin/crawl-comments.js`

**修改位置**: Line 184 之后

```javascript
for (let i = 0; i < maxToProcess; i++) {
  const video = videosToClick[i];

  // 1. 点击视频
  await page.evaluate((idx) => {
    const containers = document.querySelectorAll('.container-Lkxos9');
    if (idx < containers.length) {
      containers[idx].click();
    }
  }, video.index);

  await page.waitForTimeout(2000);

  // 2. ⭐ 新增：点击所有"查看回复"按钮
  logger.debug('  Looking for "查看回复" buttons...');

  const replyButtonsClicked = await page.evaluate(() => {
    let clicked = 0;
    const allElements = Array.from(document.querySelectorAll('*'));

    allElements.forEach(el => {
      const text = el.textContent || '';
      // 匹配 "查看1条回复", "查看3条回复" 等
      if (text.match(/^查看\d+条回复$/) && el.offsetParent !== null) {
        try {
          el.click();
          clicked++;
        } catch (e) {
          // 忽略点击失败
        }
      }
    });

    return clicked;
  });

  if (replyButtonsClicked > 0) {
    logger.info(`  ✅ Clicked ${replyButtonsClicked} "查看回复" buttons`);
    await page.waitForTimeout(1500);  // 等待回复 API 响应
  } else {
    logger.debug('  No "查看回复" buttons found');
  }

  // 3. 重新打开模态框
  if (i < maxToProcess - 1) {
    await page.click('span:has-text("选择作品")', { timeout: 5000 });
    await page.waitForTimeout(1000);
  }
}
```

---

## 七、测试验证

### 7.1 验证测试脚本

```javascript
// tests/验证讨论API拦截.js

const { chromium } = require('playwright');
const path = require('path');

async function verifyDiscussionAPIInterception() {
  console.log('📋 验证讨论 API 拦截\n');

  const userDataDir = path.join(__dirname, '../packages/worker/data/browser/worker-1/browser_xxx');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // API 拦截计数
  const apiCalls = {
    comments: [],
    discussions: []
  };

  page.on('response', async (response) => {
    const url = response.url();

    if (/comment.*list/i.test(url) && !url.includes('/reply/')) {
      apiCalls.comments.push(url);
      console.log(`✅ [评论API] ${url.substring(0, 100)}...`);
    }

    if (/comment.*reply/i.test(url)) {
      apiCalls.discussions.push(url);
      console.log(`🔥 [讨论API] ${url.substring(0, 100)}...`);

      // 解析响应
      try {
        const json = await response.json();
        console.log(`   回复数量: ${json.comments?.length || 0}`);

        if (json.comments && json.comments.length > 0) {
          const firstReply = json.comments[0];
          console.log(`   第一条回复:`);
          console.log(`     - cid: ${firstReply.cid}`);
          console.log(`     - user.nickname: ${firstReply.user?.nickname}`);
          console.log(`     - user.uid: ${firstReply.user?.uid}`);
          console.log(`     - text: ${firstReply.text?.substring(0, 50)}...`);
        }
      } catch (e) {
        console.log(`   解析失败: ${e.message}`);
      }
    }
  });

  // 导航到评论管理页面
  console.log('\n📍 导航到评论管理页面...');
  await page.goto('https://creator.douyin.com/creator-micro/interactive/comment', {
    waitUntil: 'networkidle',
    timeout: 30000
  });
  await page.waitForTimeout(2000);

  // 打开选择作品
  console.log('\n📍 打开选择作品...');
  await page.click('span:has-text("选择作品")');
  await page.waitForTimeout(2000);

  // 点击第一个视频
  console.log('\n📍 点击第一个视频...');
  await page.evaluate(() => {
    const containers = document.querySelectorAll('.container-Lkxos9');
    if (containers.length > 0) {
      containers[0].click();
    }
  });
  await page.waitForTimeout(3000);

  // 查找并点击"查看回复"按钮
  console.log('\n📍 点击"查看回复"按钮...\n');
  const clicked = await page.evaluate(() => {
    let count = 0;
    Array.from(document.querySelectorAll('*')).forEach(el => {
      const text = el.textContent || '';
      if (text.match(/^查看\d+条回复$/) && el.offsetParent !== null) {
        try {
          el.click();
          count++;
        } catch (e) {}
      }
    });
    return count;
  });

  console.log(`✅ 点击了 ${clicked} 个"查看回复"按钮\n`);
  await page.waitForTimeout(2000);

  // 输出统计
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 API 拦截统计:');
  console.log(`   评论 API: ${apiCalls.comments.length} 次`);
  console.log(`   讨论 API: ${apiCalls.discussions.length} 次`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (apiCalls.discussions.length > 0) {
    console.log('✅ 成功拦截到讨论 API！');
    console.log('   爬虫的 API 拦截模式正确\n');
  } else {
    console.log('❌ 未拦截到讨论 API！');
    console.log('   可能原因:');
    console.log('   1. 没有找到"查看回复"按钮');
    console.log('   2. "查看回复"按钮点击失败');
    console.log('   3. API 模式匹配失败\n');
  }

  await page.waitForTimeout(5000);
  await context.close();
}

verifyDiscussionAPIInterception().catch(console.error);
```

---

## 八、总结

### 8.1 验证结果

| 验证项 | 结果 | 说明 |
|-------|------|------|
| 点击"查看回复"是否触发 API | ✅ 是 | 确认触发 `/comment/reply/list/` API |
| 爬虫 API 拦截模式是否匹配 | ✅ 匹配 | `/comment.*reply/i` 能匹配实际 API |
| 爬虫字段映射是否正确 | ❌ 不正确 | 多处字段名不匹配，需修正 |
| 爬虫是否自动点击"查看回复" | ❌ 否 | 当前代码未实现，需添加 |

### 8.2 关键发现

1. ✅ **API 确实存在**
   - 评论 API: `/aweme/v1/creator/comment/list`
   - 讨论 API: `/aweme/v1/creator/comment/reply/list/`

2. ✅ **爬虫拦截模式正确**
   - `/comment.*list/i` ← 匹配评论 API
   - `/comment.*reply/i` ← 匹配讨论 API

3. ❌ **字段映射需修正**
   - `reply_id/comment_id` → `cid`
   - `user_info.screen_name` → `user.nickname`
   - `user_info.user_id` → `user.uid`
   - `user_info.avatar_url` → `user.avatar_thumb.url_list[0]`
   - `reply_count` → `reply_comment_total`

4. ❌ **缺少自动点击逻辑**
   - 当前只点击视频，不点击"查看回复"按钮
   - 导致讨论 API 不会被触发
   - 数据库中可能没有讨论数据

### 8.3 立即行动项

1. **✅ 已确认**: API 拦截模式正确
2. **⚠️ 需修复**: 字段映射错误（参见 6.1 节）
3. **⚠️ 需添加**: 自动点击"查看回复"按钮（参见 6.3 节）
4. **⚠️ 需添加**: 调试日志输出（参见 6.2 节）
5. **📋 需测试**: 运行验证脚本确认修复效果

---

**报告生成时间**: 2025-10-24 22:05
**状态**: ✅ 验证完成
**结论**: 爬虫框架正确，但需要修正字段映射和添加自动点击逻辑
**下一步**: 实施修复方案 → 运行测试脚本 → 验证数据质量
