# 评论回复API拦截器集成总结

## 📝 任务说明

将评论回复的API拦截器从错误的 `page.on('response')` 模式改为正确的全局注册模式（`registerAPIHandlers`），与其他爬虫任务保持一致。

## ✅ 完成的修改

### 1. `send-reply-to-comment.js` - 添加API回调函数

**位置**: [send-reply-to-comment.js:16-86](packages/worker/src/platforms/douyin/send-reply-to-comment.js#L16-L86)

**新增内容**:
- **API 数据存储** (`apiData`): 存储 API 拦截的回复结果
- **API 回调函数** (`onCommentReplyAPI`): 处理评论回复 API 响应

```javascript
// ==================== API 数据存储 ====================
const apiData = {
    replyResults: []  // 存储评论回复的API响应
};

// ==================== API 回调函数 ====================
async function onCommentReplyAPI(body, response) {
    const url = response.url();

    // 排除列表接口（reply/list 是查询回复列表的接口，不是发送回复的接口）
    if (url.includes('/comment/reply/list')) {
        return;
    }

    // 检查响应结构
    if (!body || body.status_code === undefined) {
        logger.warn(`⚠️  [API] 评论回复响应无效`);
        return;
    }

    const statusCode = body.status_code;
    const statusMsg = body.status_msg || '';
    const commentInfo = body.comment_info;

    if (statusCode === 0 && commentInfo) {
        // 成功
        logger.info(`✅ [API] 评论回复成功: comment_id=${commentInfo.comment_id}`);
        apiData.replyResults.push({
            timestamp: Date.now(),
            url,
            success: true,
            statusCode,
            statusMsg,
            commentId: commentInfo.comment_id,
            data: body
        });
    } else if (statusCode !== 0) {
        // 失败
        logger.warn(`❌ [API] 评论回复失败: ${statusMsg} (status_code=${statusCode})`);
        apiData.replyResults.push({
            timestamp: Date.now(),
            url,
            success: false,
            statusCode,
            statusMsg,
            errorMsg: statusMsg || '未知错误',
            data: body
        });
    }
}
```

**导出**:
```javascript
module.exports = {
    sendReplyToComment,
    onCommentReplyAPI  // 导出给 platform.js 注册使用
};
```

### 2. `send-reply-to-comment.js` - 更新验证函数

**位置**: [send-reply-to-comment.js:518-603](packages/worker/src/platforms/douyin/send-reply-to-comment.js#L518-L603)

**改进**: 优先使用 API 验证，DOM 验证作为备选

```javascript
async function verifyReplySuccess(page) {
    logger.debug('验证回复结果');

    try {
        // 1. 优先检查 API 验证结果
        if (apiData.replyResults.length > 0) {
            const latestResult = apiData.replyResults[apiData.replyResults.length - 1];

            if (latestResult.success) {
                logger.info('✅ API 验证: 回复成功');
                return {
                    success: true,
                    message: `API验证成功: ${latestResult.statusMsg || '回复已发送'}`,
                    source: 'api',
                    data: latestResult
                };
            } else {
                logger.warn('⚠️ API 验证: 回复失败');
                return {
                    success: false,
                    message: `API验证失败: ${latestResult.errorMsg}`,
                    source: 'api',
                    data: latestResult
                };
            }
        }

        // 2. API 无结果，使用 DOM 验证作为备选
        logger.debug('API 无结果，使用 DOM 验证');
        // ... DOM 验证逻辑 ...
    } catch (error) {
        logger.error(`验证回复结果失败: ${error.message}`);
        return { success: false, message: error.message, source: 'error' };
    }
}
```

### 3. `send-reply-to-comment.js` - 初始化API数据

**位置**: [send-reply-to-comment.js:114-115](packages/worker/src/platforms/douyin/send-reply-to-comment.js#L114-L115)

在每次发送回复时清空之前的 API 数据：

```javascript
async function sendReplyToComment(page, options) {
    // ...
    try {
        // 清空之前的 API 数据
        apiData.replyResults = [];
        // ...
    }
}
```

### 4. `platform.js` - 导入API回调函数

**位置**: [platform.js:28](packages/worker/src/platforms/douyin/platform.js#L28)

```javascript
// 导入回复功能模块
const { sendReplyToComment, onCommentReplyAPI } = require('./send-reply-to-comment');
```

### 5. `platform.js` - 注册API拦截器

**位置**: [platform.js:101-102](packages/worker/src/platforms/douyin/platform.js#L101-L102)

在 `registerAPIHandlers` 方法中添加注册：

```javascript
async registerAPIHandlers(manager, accountId) {
    logger.info(`Registering API handlers for account ${accountId}`);

    // 作品相关 API
    manager.register('**/aweme/v1/creator/item/list{/,}?**', onWorksListAPI);
    manager.register('**/aweme/v1/web/aweme/detail/**', onWorkDetailAPI);

    // 评论相关 API
    manager.register('**/comment/list/select/**', onCommentsListAPI);
    manager.register('**/comment/reply/list/**', onDiscussionsListAPI);
    manager.register('**/aweme/v1/web/notice/detail/**', onNoticeDetailAPI);

    // 评论回复 API（回调函数内部会排除 /comment/reply/list 列表接口）
    manager.register('**/comment/reply{/,}?**', onCommentReplyAPI);  // ✅ 新增

    // 私信相关 API
    manager.register('**/v2/message/get_by_user_init**', onMessageInitAPI);
    manager.register('**/creator/im/user_detail/**', onConversationListAPI);
    manager.register('**/v1/im/message/history**', onMessageHistoryAPI);

    logger.info(`✅ API handlers registered (9 total) for account ${accountId}`);
}
```

### 6. `platform.js` - 删除错误的方法

**删除**: 之前添加的 `setupReplyAPIInterceptor(page)` 方法（lines 114-211）

❌ **错误写法** (已删除):
```javascript
setupReplyAPIInterceptor(page) {
    // 使用 page.on('response') 注入拦截器
    page.on('response', apiInterceptHandler);
    // ...
}
```

## 🔑 技术要点

### 1. 全局API注册模式 vs 局部注入

**❌ 错误方式** (局部注入):
```javascript
// 在单个页面上注入
setupReplyAPIInterceptor(page) {
    page.on('response', (response) => {
        // 处理响应
    });
}
```

**✅ 正确方式** (全局注册):
```javascript
// 在 platform.js 的 registerAPIHandlers 中统一注册
async registerAPIHandlers(manager, accountId) {
    manager.register('**/comment/reply{/,}?**', onCommentReplyAPI);
}

// 回调函数在独立模块中定义
async function onCommentReplyAPI(body, response) {
    // 处理响应
}
```

### 2. API 模式匹配

- **Pattern**: `**/comment/reply{/,}?**`
  - 匹配: `/comment/reply`, `/comment/reply/`
  - 不匹配: `/comment/reply/list`（在回调函数内部排除）

- **排除列表接口**: 在回调函数内部检查
  ```javascript
  if (url.includes('/comment/reply/list')) {
      return;  // 跳过列表接口
  }
  ```

### 3. 验证优先级

1. **优先**: API 验证（准确，实时）
2. **备选**: DOM 验证（提示消息）
3. **兜底**: 输入框清空检查

### 4. API 响应结构

**成功响应**:
```json
{
  "status_code": 0,
  "status_msg": "",
  "comment_info": {
    "comment_id": "7566864433692459826",
    "text": "回复内容",
    "create_time": 1762409752,
    ...
  }
}
```

**失败响应**:
```json
{
  "status_code": 8,
  "status_msg": "评论失败，请稍后重试",
  ...
}
```

## 📊 架构对比

### 旧架构（错误）

```
replyToComment()
  └─> setupReplyAPIInterceptor(page)  ❌ 局部注入
       └─> page.on('response', ...)
```

### 新架构（正确）

```
DouyinPlatform
  └─> registerAPIHandlers(manager, accountId)  ✅ 全局注册
       └─> manager.register('pattern', onCommentReplyAPI)
            └─> onCommentReplyAPI(body, response)
                 └─> apiData.replyResults.push(...)

replyToComment()
  └─> sendReplyToComment(page, options)
       └─> verifyReplySuccess(page)
            └─> 检查 apiData.replyResults  ✅ 使用全局数据
```

## 🧪 测试验证

运行测试脚本验证 API 拦截器是否工作：

```bash
# 回复作品
node tests/replyToCommentById.js --port 9222 --text "测试回复作品"

# 回复评论
node tests/replyToCommentById.js --port 9222 --commentId=7566864433692459826 --text "测试回复评论"
```

**预期日志**:
```
✅ [MATCH] **/comment/reply{/,}?** -> https://creator.douyin.com/.../comment/reply
✅ [API] 评论回复成功: comment_id=7566864433692459826
✅ API 验证: 回复成功
```

## ✅ 验证清单

- [x] `onCommentReplyAPI` 函数已添加到 `send-reply-to-comment.js`
- [x] `onCommentReplyAPI` 已导出
- [x] `onCommentReplyAPI` 已在 `platform.js` 中导入
- [x] API pattern 已在 `registerAPIHandlers` 中注册
- [x] 列表接口已在回调函数内部排除
- [x] `verifyReplySuccess` 优先使用 API 验证
- [x] `apiData` 在每次回复时清空
- [x] 错误的 `setupReplyAPIInterceptor` 方法已删除
- [x] 注册总数已更新为 9

## 📚 相关文档

- [评论回复功能重构总结.md](./评论回复功能重构总结.md)
- [05-DOUYIN-平台实现技术细节.md](./05-DOUYIN-平台实现技术细节.md)
- [07-DOUYIN-消息回复功能技术总结.md](./07-DOUYIN-消息回复功能技术总结.md)

## 📝 总结

### 核心改进

1. ✅ **统一架构**: 评论回复 API 拦截器现在与其他爬虫任务使用相同的全局注册模式
2. ✅ **准确验证**: 优先使用 API 验证，比 DOM 验证更准确可靠
3. ✅ **代码清晰**: API 回调函数在独立模块中定义，职责明确
4. ✅ **易于维护**: 所有 API 拦截器在 `registerAPIHandlers` 中统一管理

### 技术亮点

- 使用 `minimatch` 进行 glob 模式匹配
- 回调函数内部排除不需要的接口
- 优先使用 API 验证，DOM 验证作为备选
- 模块化设计，职责清晰

---

**完成时间**: 2025-01-12
**版本**: v2.1
