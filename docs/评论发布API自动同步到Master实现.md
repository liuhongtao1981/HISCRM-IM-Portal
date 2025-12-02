# 评论发布API自动同步到Master实现

**文档类型**: ✅ 功能实现 - Worker端API拦截器增强
**创建时间**: 2025-12-02
**功能**: 评论发布成功后，自动将新评论数据同步到Master，确保IM客户端消息列表实时刷新

---

## 背景

### 用户需求

> "我们评论回复的 api 拦截器里，拦截到了，他会附带新评论信息的，我们新的发送信息也同步给 master 这样我们客户端的消息才会刷新"

### 问题

在评论回复功能中，Worker端通过UI操作发送评论后，虽然抖音API返回了新评论的完整数据，但这些数据没有同步到Master，导致：

1. **IM客户端消息列表不会刷新** - 用户看不到自己刚发送的评论
2. **数据不一致** - Worker本地有新评论数据，但Master和客户端没有
3. **需要手动刷新** - 用户必须手动触发爬虫才能看到新评论

### 解决方案

利用已有的 API 拦截器 `onCommentPublishAPI`，在成功发布评论后：
1. 从 `page._accountContext` 获取 DataManager 实例
2. 提取API响应中的新评论数据
3. 使用 `DataManager.batchUpsertComments()` 统一同步到Master
4. Master自动广播给所有IM客户端，实现实时刷新

---

## 实现方案

### 核心思路

参考 `packages/worker/src/platforms/douyin/crawler-contents.js` 的实现方式，通过 `page._accountContext` 访问账号级别的上下文：

```javascript
// ✅ 从 page 对象读取账号上下文（账号级别隔离）
const page = response.frame().page();
const { accountId, dataManager } = page._accountContext || {};
```

**优势**:
- ✅ 与现有架构保持一致
- ✅ 无需工厂函数，代码更简洁
- ✅ 自动获取正确的 DataManager 实例

---

## 代码实现

### 修改：API 拦截器增强

**文件**: `packages/worker/src/platforms/douyin/send-reply-to-comment-video-detail.js`

**位置**: 第 1000-1104 行

#### 关键改动

```javascript
async function onCommentPublishAPI(body, response) {
    const url = response.url();

    if (!url.includes('/comment/publish')) {
        return;
    }

    // ✅ 从 page 对象读取账号上下文（账号级别隔离）
    const page = response.frame().page();
    const { accountId, dataManager } = page._accountContext || {};

    logger.info(`🔍 [API拦截器-视频详情页] 捕获到评论发布请求: ${url}, 账户: ${accountId || 'unknown'}`);

    const statusCode = body.status_code;
    const comment = body.comment;

    if (statusCode === 0 && comment) {
        const isSuccess = comment.status === 7; // status=7 表示已发布

        if (isSuccess) {
            logger.info(`✅ [API] 评论发布成功: cid=${comment.cid}`);
        }

        // ✅ 新增：同步新评论数据到 Master（通过 DataManager）
        if (isSuccess && dataManager) {
            try {
                // 提取请求参数（从请求体获取 aweme_id）
                const request = response.request();
                const postData = request.postDataJSON();

                // 构建完整的评论数据对象（兼容 DouyinDataManager.mapCommentData 格式）
                const newCommentData = {
                    cid: comment.cid,
                    comment_id: comment.cid,
                    text: comment.text,
                    content: comment.text,
                    create_time: comment.create_time,
                    digg_count: comment.digg_count || 0,
                    reply_count: comment.reply_count || 0,
                    user_info: {
                        uid: comment.user?.uid || comment.user?.sec_uid,
                        nickname: comment.user?.nickname || '我',
                        avatar_url: comment.user?.avatar_thumb?.url_list?.[0] || null
                    },
                    // 作品 ID (从请求参数中获取)
                    aweme_id: postData?.aweme_id,
                    item_id: postData?.aweme_id,
                    // 回复关系
                    reply_id: comment.reply_id,
                    reply_to_reply_id: comment.reply_to_reply_id,
                    parent_comment_id: comment.reply_id !== '0' ? comment.reply_id : null,
                    // 其他字段
                    is_pinned: false,
                    is_author: true,  // 自己发布的评论
                    user_digged: 0
                };

                logger.info(`📤 [API] [${accountId}] 同步新评论到 Master: cid=${comment.cid}, aweme_id=${postData?.aweme_id}`);

                // 使用 batchUpsertComments 同步到 Master
                await dataManager.batchUpsertComments([newCommentData]);

                logger.info(`✅ [API] [${accountId}] 新评论已同步到 Master`);
            } catch (syncError) {
                logger.error(`❌ [API] [${accountId}] 同步新评论失败:`, syncError);
            }
        } else if (!dataManager) {
            logger.warn(`⚠️  [API] [${accountId}] DataManager not available, skipping comment sync`);
        }
    }
}
```

#### 核心要点

1. **获取上下文**: 通过 `page._accountContext` 获取 `accountId` 和 `dataManager`
2. **提取作品ID**: 从请求参数 `postData.aweme_id` 获取作品ID
3. **数据映射**: 构建符合 `DouyinDataManager.mapCommentData` 格式的对象
4. **自动同步**: 调用 `dataManager.batchUpsertComments()` 触发同步
5. **错误处理**: 完善的日志和降级处理

---

## 数据流程

### 完整流程图

```
┌──────────────────────────────────────────────────────────┐
│          评论发布自动同步完整流程                          │
└──────────────────────────────────────────────────────────┘

1️⃣ 用户在IM端触发评论回复
   ↓
   IM Client → emit('monitor:reply')

2️⃣ Master接收并转发到Worker
   ↓
   Master → Worker → sendReplyToCommentVideoDetail()

3️⃣ Worker执行评论发送（UI操作）
   ↓
   点击"发送"按钮

4️⃣ 抖音API响应（自动拦截）
   ↓
   POST /aweme/v1/web/comment/publish
   Response: { status_code: 0, comment: {...} }

5️⃣ API拦截器自动同步
   ↓
   onCommentPublishAPI()
   ├─ 从 page._accountContext 获取 dataManager
   ├─ 提取新评论数据
   ├─ 构建标准格式对象
   └─ dataManager.batchUpsertComments([...])
       ├─ DouyinDataManager.mapCommentData()
       ├─ 保存到本地缓存
       └─ dataPusher.pushComments() → Master

6️⃣ Master接收并广播
   ↓
   Master 保存到数据库 → 广播到 IM Client

7️⃣ IM客户端实时刷新
   ↓
   on('monitor:new_message_hint') → 更新消息列表 ✅
```

---

## 数据格式

### API 响应原始格式

```json
{
  "status_code": 0,
  "comment": {
    "cid": "7578755020364956451",
    "status": 7,
    "text": "测试回复内容",
    "create_time": 1733140800000,
    "reply_id": "7545801600418300735",
    "reply_to_reply_id": "7546608049843897130",
    "digg_count": 0,
    "reply_count": 0,
    "user": {
      "uid": "MS4wLjABAAAA...",
      "nickname": "我的昵称",
      "avatar_thumb": {
        "url_list": ["https://p3.douyinpic.com/..."]
      }
    }
  }
}
```

### 转换为 DataManager 格式

```javascript
const newCommentData = {
    // 评论 ID
    cid: "7578755020364956451",
    comment_id: "7578755020364956451",

    // 评论内容
    text: "测试回复内容",
    content: "测试回复内容",

    // 时间和统计
    create_time: 1733140800000,
    digg_count: 0,
    reply_count: 0,

    // 用户信息
    user_info: {
        uid: "MS4wLjABAAAA...",
        nickname: "我的昵称",
        avatar_url: "https://p3.douyinpic.com/..."
    },

    // 作品 ID（从请求参数提取）
    aweme_id: "7571732586456812800",
    item_id: "7571732586456812800",

    // 回复关系
    reply_id: "7545801600418300735",
    reply_to_reply_id: "7546608049843897130",
    parent_comment_id: "7545801600418300735",

    // 标记
    is_pinned: false,
    is_author: true,
    user_digged: 0
};
```

---

## 测试场景

### 场景 1: 一级评论发布

**操作**: IM端发送一级评论

**预期日志** (Worker):
```
[douyin-platform] 🔍 [API拦截器-视频详情页] 捕获到评论发布请求: ..., 账户: account_123
[douyin-platform] ✅ [API] 评论发布成功: cid=7578755020364956451
[douyin-platform] 📤 [API] [account_123] 同步新评论到 Master: cid=7578755020364956451, aweme_id=7571732586456812800
[douyin-data:account_123] 🔔 检测到新评论，触发立即推送
[douyin-platform] ✅ [API] [account_123] 新评论已同步到 Master
```

**验证**:
- ✅ IM客户端自动刷新，显示新评论
- ✅ Master数据库中有新记录
- ✅ 无需手动触发爬虫

---

### 场景 2: 二级/三级回复发布

**操作**: IM端回复评论

**预期**:
- ✅ 正确识别评论层级（level=2 或 level=3）
- ✅ reply_id 和 parent_comment_id 正确设置
- ✅ IM客户端显示在正确的回复链中

---

### 场景 3: DataManager 不可用（降级）

**操作**: DataManager 初始化失败时发送评论

**预期日志**:
```
[douyin-platform] ✅ [API] 评论发布成功: cid=...
[douyin-platform] ⚠️  [API] [account_123] DataManager not available, skipping comment sync
```

**验证**:
- ✅ 评论依然发送成功
- ✅ 不会因为 DataManager 缺失而报错
- ✅ 只是不会自动同步（降级处理）

---

## 代码统计

### 变更统计

| 文件 | 修改类型 | 行数 | 说明 |
|------|---------|------|------|
| `send-reply-to-comment-video-detail.js` | 新增 | +50 | 数据同步逻辑 |
| `send-reply-to-comment-video-detail.js` | 修改 | ~5 | 获取上下文 |
| **总计** | - | **~55** | **约55行代码变更** |

### 关键代码段

```javascript
// 从 page 对象读取账号上下文
const page = response.frame().page();
const { accountId, dataManager } = page._accountContext || {};

// 同步新评论到 Master
if (isSuccess && dataManager) {
    const newCommentData = { /* ... */ };
    await dataManager.batchUpsertComments([newCommentData]);
}
```

---

## 优势分析

### 1. 架构一致性

- ✅ **与现有代码保持一致** - 使用与 `crawler-contents.js` 相同的模式
- ✅ **无需额外参数** - 不需要工厂函数或额外的上下文传递
- ✅ **自动隔离** - 账号级别的上下文自动隔离

### 2. 实时性

- ✅ **即时同步** - 评论发布成功后立即同步，无延迟
- ✅ **无需轮询** - 不需要定时爬虫，减少资源消耗
- ✅ **即时刷新** - IM客户端实时看到新评论

### 3. 数据完整性

- ✅ **单一数据源** - API 响应是最准确的数据来源
- ✅ **完整字段** - API 返回的评论数据包含所有字段
- ✅ **无需补充** - 不需要额外请求获取缺失字段

### 4. 容错机制

- ✅ **降级处理** - DataManager 不可用时仍可发送评论
- ✅ **错误隔离** - 同步失败不影响评论发送成功
- ✅ **日志完整** - 所有错误都有详细日志记录

---

## 技术亮点

### 1. 上下文获取模式

**问题**: API 拦截器需要访问账户相关的上下文（accountId、dataManager）

**解决**: 通过 `page._accountContext` 获取上下文

```javascript
const page = response.frame().page();
const { accountId, dataManager } = page._accountContext || {};
```

**优势**:
- 与现有架构一致（参考 `crawler-contents.js`）
- 无需额外参数传递
- 自动获取正确的实例

---

### 2. 请求参数提取

**问题**: API 响应中没有 `aweme_id`（作品ID）

**解决**: 从 Playwright Response 的 Request 中提取 POST 参数

```javascript
const request = response.request();
const postData = request.postDataJSON();
const awemeId = postData?.aweme_id;
```

---

### 3. 数据格式兼容

**问题**: API 响应格式与 DataManager 期望格式不完全一致

**解决**: 构建兼容对象，提供多个字段名

```javascript
const newCommentData = {
    cid: comment.cid,
    comment_id: comment.cid,  // 兼容字段
    text: comment.text,
    content: comment.text,    // 兼容字段
    // ...
};
```

---

## 总结

### 实现成果

✅ **自动同步** - 评论发布成功后自动同步到Master
✅ **实时刷新** - IM客户端实时显示新评论
✅ **数据一致** - Worker、Master、Client 三端数据保持一致
✅ **架构统一** - 使用 `page._accountContext` 与现有代码保持一致
✅ **容错降级** - DataManager 不可用时不影响评论发送功能

### 关键指标

- **代码变更量**: 约 55 行
- **新增功能点**: 1 个（API 拦截器自动同步）
- **影响模块**: 1 个（`send-reply-to-comment-video-detail.js`）
- **测试场景**: 3 个（一级评论、二级/三级回复、降级处理）

### 技术价值

1. **上下文获取模式** - 使用 `page._accountContext` 保持架构一致性
2. **数据驱动** - 从 API 响应提取数据，保证数据准确性
3. **自动化** - 无需额外触发，评论发布即同步
4. **可维护性** - 代码简洁，与现有模式保持一致

---

**文档版本**: v2.0
**最后更新**: 2025-12-02
**维护者**: Worker 平台团队
