# 评论API修复报告 - X-Bogus加密

## 问题描述

在测试中发现：
- 作品统计API显示某些作品有评论（comment_count > 0）
- 但调用评论API时返回0条评论
- 用户确认统计数据正确，问题出在评论API实现

## 根本原因

**评论API使用了错误的加密方法**

### 错误的实现（BEFORE）

```javascript
async fetchComments(awemeId, cursor = 0, count = 20) {
    const params = {
        ...this.webBaseParams,
        aweme_id: awemeId,
        cursor: cursor,
        count: count,
        // ...
    };

    // ❌ 错误：使用 a_bogus 加密
    const aBogus = generateABogus(params, this.userAgent);
    const url = `${this.endpoints.commentList}?${new URLSearchParams(params).toString()}&a_bogus=${encodeURIComponent(aBogus)}`;

    const result = await this._request(url, {
        headers: this._buildHeaders()
    });

    return result.data || {};
}
```

### 正确的实现（AFTER）

```javascript
async fetchComments(awemeId, cursor = 0, count = 20) {
    const params = {
        ...this.webBaseParams,
        aweme_id: awemeId,
        cursor: cursor,
        count: count,
        // ...
    };

    // 生成查询字符串
    const queryString = new URLSearchParams(params).toString();

    // ✅ 正确：使用 X-Bogus 加密（一级评论 API 也使用 X-Bogus）
    const xBogus = generateXBogus(queryString, this.userAgent);
    const url = `${this.endpoints.commentList}?${queryString}&X-Bogus=${encodeURIComponent(xBogus)}`;

    logger.debug(`[一级评论] 请求: awemeId=${awemeId}, cursor=${cursor}`);

    const result = await this._request(url, {
        headers: this._buildHeaders()
    });

    logger.debug(`[一级评论] ✅ 获取 ${result.data?.comments?.length || 0} 条评论`);
    return result.data || {};
}
```

## 发现过程

### 1. 分析原版Python实现

检查了 `packages/Douyin_TikTok_Download_API-main` 中的原版实现：

**文件**：`crawlers/douyin/web/web_crawler.py`（第225-234行）

```python
async def fetch_video_comments(self, aweme_id: str, cursor: int = 0, count: int = 20):
    kwargs = await self.get_douyin_headers()
    base_crawler = BaseCrawler(proxies=kwargs["proxies"], crawler_headers=kwargs["headers"])
    async with base_crawler as crawler:
        params = PostComments(aweme_id=aweme_id, cursor=cursor, count=count)
        # 关键：使用 xb_model_2_endpoint（X-Bogus）
        endpoint = BogusManager.xb_model_2_endpoint(
            DouyinAPIEndpoints.POST_COMMENT, params.dict(), kwargs["headers"]["User-Agent"]
        )
        response = await crawler.fetch_get_json(endpoint)
    return response
```

### 2. 对比加密方法

| API类型 | 端点 | 原实现 | 现实现（修复前） | 现实现（修复后） |
|---------|------|--------|-----------------|-----------------|
| 作品列表 | `/janus/douyin/creator/pc/work_list` | 无加密参数 | 无加密参数 ✅ | 无加密参数 ✅ |
| 一级评论 | `/aweme/v1/web/comment/list/` | **X-Bogus** | ❌ a_bogus | ✅ **X-Bogus** |
| 二级评论 | `/aweme/v1/web/comment/list/reply/` | **X-Bogus** | ✅ X-Bogus | ✅ X-Bogus |

## 修复内容

### 修改文件

`packages/worker/src/platforms/douyin/api/douyin-api.js`

### 修改行数

第206-234行（`fetchComments` 方法）

### 主要变更

1. **移除**: `generateABogus()` 调用
2. **添加**: 生成查询字符串 `queryString`
3. **添加**: `generateXBogus(queryString, this.userAgent)` 调用
4. **修改**: URL构建方式，使用 `X-Bogus` 参数替代 `a_bogus`
5. **添加**: 调试日志输出

## 修复验证

### 代码层面验证 ✅

- ✅ 与原版Python实现对比，确认使用X-Bogus是正确的
- ✅ 修改后的代码与`fetchReplies`方法一致（都使用X-Bogus）
- ✅ 代码逻辑正确，参数传递正确

### 运行时验证 ⏳

由于测试环境Cookie已过期（status_code=8），无法进行完整的运行时验证。

**建议验证步骤**：
1. 使用有效的登录账户运行Worker
2. 选择一个确认有评论的作品进行测试
3. 检查日志中的评论抓取结果

## 技术要点

### X-Bogus vs a_bogus

| 加密方法 | 用途 | 算法来源 |
|----------|------|----------|
| **a_bogus** | 作品列表等无评论相关API | `abogus.js` |
| **X-Bogus** | 评论、回复等社交互动API | `xbogus.js` |

### X-Bogus生成原理

1. 对User-Agent进行RC4加密
2. Base64编码后MD5哈希
3. 对URL参数进行多轮MD5加密
4. 组合时间戳和固定常量
5. 通过XOR计算校验值
6. 再次RC4加密并编码为特殊Base64格式

**实现文件**：`packages/worker/src/platforms/douyin/api/xbogus.js`

## API端点总结

### 一级评论API

```
GET https://www.douyin.com/aweme/v1/web/comment/list/
```

**必需参数**：
- `device_platform=webapp`
- `aid=6383`
- `aweme_id={视频ID}`
- `cursor={分页游标}`
- `count={每页数量}`
- `X-Bogus={生成的加密值}` ← **关键！**

**响应格式**：
```json
{
  "status_code": 0,
  "data": {
    "comments": [...],
    "cursor": 20,
    "has_more": true
  }
}
```

### 二级评论API

```
GET https://www.douyin.com/aweme/v1/web/comment/list/reply/
```

**必需参数**：
- `device_platform=webapp`
- `aid=6383`
- `item_id={视频ID}`
- `comment_id={一级评论ID}`
- `cursor={分页游标}`
- `count={每页数量}`
- `X-Bogus={生成的加密值}` ← **关键！**

## 影响范围

### 受影响功能

- ✅ 一级评论抓取（`crawler-comments.js`）
- ✅ 二级评论抓取（`crawler-comments.js`）
- ✅ API爬虫完整性测试

### 不受影响功能

- ✅ 作品列表抓取
- ✅ 私信抓取
- ✅ Fiber数据提取

## 后续工作

1. **验证修复**：使用有效Cookie进行完整测试
2. **监控运行**：观察实际爬虫运行中的评论抓取效果
3. **性能优化**：如需要，可以缓存X-Bogus计算结果

## 结论

评论API的问题已定位并修复。核心原因是使用了错误的加密方法（a_bogus vs X-Bogus）。修复后的代码与原版Python实现一致，理论上应该能够正常工作。

需要使用有效的登录Cookie进行最终验证。

---

**修复时间**：2025-11-27
**修复工程师**：Claude (AI Assistant)
**参考实现**：packages/Douyin_TikTok_Download_API-main
