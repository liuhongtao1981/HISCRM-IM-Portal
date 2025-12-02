# API集成 - 评论发布功能

## 概述

从HAR文件中提取了抖音的评论发布API，并集成到 `douyin-api.js` 中，提供了统一的评论/回复发布接口。

## API详情

### 端点

```
POST https://www.douyin.com/aweme/v1/web/comment/publish
```

### URL参数（自动生成）

基于 `webBaseParams` 自动生成，包括：
- `device_platform=webapp`
- `aid=6383`
- `channel=channel_pc_web`
- `version_code=290100`
- `app_name=aweme`
- `enter_from=recommend`
- `previous_page=recommend`
- ... 等浏览器指纹参数
- `a_bogus=<动态生成>`

### POST数据（application/x-www-form-urlencoded）

#### 一级评论（直接评论）

```
aweme_id=7533516758959820070
comment_send_celltime=13635
comment_video_celltime=134156
one_level_comment_rank=-1
paste_edit_method=non_paste
text=大家好
text_extra=[]
```

#### 二级评论（回复一级评论）

```
aweme_id=7533516758959820070
comment_send_celltime=6030
comment_video_celltime=124323
one_level_comment_rank=1
paste_edit_method=non_paste
reply_id=7578702518957261568   ← 关键：回复的一级评论ID
text=你好
text_extra=[]
```

### 关键参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `aweme_id` | string | 作品ID（必需） |
| `text` | string | 评论内容（必需） |
| `reply_id` | string | 回复的一级评论ID（二级评论时必需） |
| `one_level_comment_rank` | number | `-1`=一级评论, `1`=二级评论 |
| `comment_send_celltime` | number | 发送耗时（毫秒），模拟真实用户 |
| `comment_video_celltime` | number | 视频播放时长（毫秒），模拟真实用户 |
| `paste_edit_method` | string | 固定值 `non_paste` |
| `text_extra` | string | 固定值 `[]`（JSON数组字符串） |

### 响应格式

成功响应（`status_code: 0`）：

```json
{
  "status_code": 0,
  "comment": {
    "cid": "7578705577178661658",
    "create_time": 1764555278,
    "text": "你好 ",
    "text_extra": [],
    "digg_count": 0,
    "reply_comment": [...],
    "reply_id": "0",
    "status": 1,
    "label_text": "作者",
    "label_type": 1,
    "user": {
      "uid": "93033167895",
      "nickname": "临终关怀志愿者宝哥",
      "avatar_thumb": {...}
    }
  }
}
```

失败响应：

```json
{
  "status_code": 非0,
  "status_msg": "错误信息"
}
```

## 代码集成

### 在 `douyin-api.js` 中的实现

```javascript
/**
 * 发布评论或回复
 * @param {Object} params - 发布参数
 * @param {string} params.awemeId - 作品ID
 * @param {string} params.text - 评论内容
 * @param {string} [params.replyId] - 回复的评论ID（一级评论ID，用于发布二级回复）
 * @param {number} [params.commentSendCelltime] - 评论发送耗时（毫秒）
 * @param {number} [params.commentVideoCelltime] - 视频播放耗时（毫秒）
 * @returns {Promise<Object>} 发布结果 { comment, ... }
 */
async publishComment({
    awemeId,
    text,
    replyId = null,
    commentSendCelltime = 5000,
    commentVideoCelltime = 120000
}) {
    // 构建URL参数
    const urlParams = {
        ...this.webBaseParams,
        app_name: 'aweme',
        enter_from: 'recommend',
        previous_page: 'recommend'
    };

    const queryString = new URLSearchParams(urlParams).toString();

    // 生成 a_bogus
    const aBogus = generateABogus(queryString, this.userAgent);
    const url = `${this.endpoints.commentPublish}?${queryString}&a_bogus=${encodeURIComponent(aBogus)}`;

    // 构建POST数据
    const postData = new URLSearchParams({
        aweme_id: awemeId,
        comment_send_celltime: Math.floor(commentSendCelltime),
        comment_video_celltime: Math.floor(commentVideoCelltime),
        one_level_comment_rank: replyId ? 1 : -1,
        paste_edit_method: 'non_paste',
        text: text,
        text_extra: '[]'
    });

    // 如果是回复一级评论，添加 reply_id
    if (replyId) {
        postData.append('reply_id', replyId);
    }

    logger.info(`[发布评论] ${replyId ? '回复评论 ' + replyId : '直接评论'}: "${text.substring(0, 20)}..."`);

    const result = await this._request(url, {
        method: 'POST',
        headers: {
            ...this._buildHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        data: postData.toString()
    });

    logger.info(`[发布评论] ✅ 成功，评论ID: ${result.comment?.cid}`);
    return result;
}
```

### 使用示例

#### 示例1：发布一级评论

```javascript
const { createDouyinAPI } = require('./douyin-api');

const api = createDouyinAPI(cookie);

const result = await api.publishComment({
    awemeId: '7533516758959820070',
    text: '这是一条测试评论'
});

console.log('评论ID:', result.comment.cid);
```

#### 示例2：回复一级评论（发布二级评论）

```javascript
const result = await api.publishComment({
    awemeId: '7533516758959820070',
    text: '这是一条测试回复',
    replyId: '7578702518957261568'  // 要回复的一级评论ID
});

console.log('回复ID:', result.comment.cid);
```

## 与现有回复功能的对比

### 原有方法（send-reply-to-comment.js）

- **方式**：Playwright 页面操作
- **流程**：
  1. 滚动查找评论容器
  2. 点击回复按钮
  3. 输入文本
  4. 点击发送按钮
- **优点**：模拟真实用户操作
- **缺点**：
  - 速度慢（需要等待DOM渲染）
  - 不稳定（页面结构变化会导致失败）
  - 资源消耗大（需要浏览器实例）
  - 需要找到评论才能回复（虚拟列表问题）

### 新方法（API直接调用）

- **方式**：HTTP API 调用
- **流程**：
  1. 构建请求参数
  2. 生成a_bogus签名
  3. 发送POST请求
- **优点**：
  - 速度快（直接API调用）
  - 稳定（不依赖页面结构）
  - 资源消耗小（无需浏览器）
  - 不需要查找评论（只需评论ID）
- **缺点**：
  - 需要正确的签名算法（a_bogus）
  - 可能触发频率限制

## 集成到 send-reply-to-comment.js

建议在 `send-reply-to-comment.js` 中添加API模式作为备选方案：

```javascript
async function replyToComment(page, {
    commentId,
    commentContent,
    authorName,
    secUid,
    awemeId,
    replyContent,
    useAPI = false  // 新增选项：是否使用API模式
}) {
    if (useAPI && awemeId) {
        // API 模式：直接调用发布API
        logger.info('🔌 [API模式] 使用评论发布API');

        // 从页面获取 Cookie
        const cookies = await page.context().cookies();
        const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // 创建API实例
        const api = createDouyinAPI(cookie);

        // 发布回复
        const result = await api.publishComment({
            awemeId: awemeId,
            text: replyContent,
            replyId: commentId
        });

        logger.info(`✅ [API模式] 回复成功，ID: ${result.comment.cid}`);
        return { success: true, commentId: result.comment.cid };

    } else {
        // 原有的页面操作模式
        logger.info('🖱️  [页面模式] 使用Playwright操作');
        // ... 原有逻辑
    }
}
```

## 测试

测试脚本：[tests/test-publish-comment-api.js](../tests/test-publish-comment-api.js)

```bash
# 运行测试（需要先填入Cookie）
node tests/test-publish-comment-api.js
```

## 安全注意事项

1. **Cookie保护**：Cookie包含敏感信息，不要泄露
2. **频率限制**：避免过快发送请求，建议间隔 2-5 秒
3. **签名有效期**：a_bogus签名可能有时效性，失败时重新生成
4. **内容审核**：评论内容会经过审核，敏感词会导致失败

## 未来优化

1. **自动降级**：API失败时自动切换到页面操作模式
2. **智能重试**：根据错误类型决定重试策略
3. **批量发送**：支持批量发送评论（注意频率限制）
4. **错误码映射**：建立完整的status_code错误码映射表

---

**创建时间**: 2025-12-01
**版本**: v1.0
**状态**: ✅ 已完成
