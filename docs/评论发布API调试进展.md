# 评论发布API调试进展

## 问题概述

尝试直接调用抖音评论发布API (`/aweme/v1/web/comment/publish`)，以替代Playwright页面操作方式。

## 调试历程

### 阶段1：403 Forbidden错误

**现象**：
```
Request failed with status code 403
```

**原因分析**：
- 缺少关键的安全验证headers
- 抖音使用了bd-ticket-guard安全机制

**解决方案**：
1. 分析HAR文件中的请求headers
2. 从Cookie中提取安全相关字段：
   - `bd_ticket_guard_client_data` → 解码后获取多个安全headers
   - `UIFID` → 用户指纹ID
3. 添加了以下headers：
   - `bd-ticket-guard-version`
   - `bd-ticket-guard-iteration-version`
   - `bd-ticket-guard-ree-public-key`
   - `bd-ticket-guard-web-version`
   - `bd-ticket-guard-web-sign-type`
   - `uifid`
   - `x-secsdk-csrf-token`
   - 各种`sec-ch-*`和`sec-fetch-*`headers

**代码修改**：
- 添加 `_extractCookieValue()` 方法：从Cookie中提取指定字段
- 添加 `_parseBdTicketGuardData()` 方法：解析bd-ticket-guard数据
- 添加 `_buildPublishHeaders()` 方法：构建评论发布专用headers
- 更新 `publishComment()` 方法：使用新的headers构建函数

### 阶段2：status_code=8 错误（当前状态）

**现象**：
```json
{
  "comment": null,
  "log_pb": {
    "impr_id": "202512011048282B0A93DDCE794BE05ABD"
  },
  "status_code": 8
}
```

**HTTP状态**：200 OK（说明请求被接受，但业务逻辑返回错误）

**成功点**：
- ✅ 请求不再被拒绝（不是403）
- ✅ 安全headers正确提取和发送
- ✅ a_bogus签名正确
- ✅ HTTP连接成功

**可能的原因**：

根据抖音API的常见错误码，`status_code=8` 可能表示：

1. **频率限制**
   - 评论发送过于频繁
   - 需要等待一定时间

2. **内容审核**
   - 评论内容触发了敏感词过滤
   - 包含违规内容

3. **权限验证**
   - Cookie对应的账户没有评论权限
   - 账户被限制评论

4. **参数错误**
   - `awemeId`、`replyId`等参数可能有误
   - `comment_send_celltime`、`comment_video_celltime`参数可能不合理

5. **验证码要求**
   - 可能需要完成验证码验证
   - 需要额外的安全验证

6. **bd-ticket-guard动态验证**
   - Cookie中的`bd_ticket_guard_client_data`可能已过期
   - 可能需要动态生成（而不是从Cookie提取）

## 测试配置

```javascript
awemeId: '7533516758959820070',    // 作品ID
commentId: '7578702518957261568',  // 要回复的评论ID
text: 'API测试回复 - 10:48:27'      // 评论内容
```

## 下一步建议

### 方案1：分析HAR文件中的成功响应

查看HAR文件中是否包含成功的评论发布响应，对比参数差异。

### 方案2：使用浏览器环境（Playwright）

评论发布可能需要完整的浏览器环境才能正常工作，原因：

1. **动态headers生成**：某些headers可能需要JavaScript动态生成
2. **Cookie同步**：浏览器环境中的Cookie可能包含更多实时状态
3. **环境验证**：抖音可能验证请求来自真实浏览器环境

**实现方式**：
```javascript
// 在Playwright页面中调用评论API
await page.evaluate(async (params) => {
    const response = await fetch('/aweme/v1/web/comment/publish?...', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params)
    });
    return await response.json();
}, { aweme_id, text, reply_id, ... });
```

### 方案3：错误码映射和处理

建立完整的抖音API错误码映射表：

```javascript
const ERROR_CODES = {
    0: '成功',
    8: '评论失败（频率限制/内容审核/权限不足）',
    // ... 其他错误码
};
```

### 方案4：测试简化场景

1. **测试直接评论**（不回复）：
   ```javascript
   await api.publishComment({
       awemeId: '7533516758959820070',
       text: '测试评论'
       // 不传replyId
   });
   ```

2. **测试不同内容**：
   ```javascript
   await api.publishComment({
       awemeId: '7533516758959820070',
       text: '👍',  // 使用简单emoji
       replyId: '7578702518957261568'
   });
   ```

3. **使用最新Cookie**：
   - 重新从浏览器获取Cookie
   - 确保Cookie包含最新的安全token

### 方案5：混合模式（推荐）

结合API和Playwright的优势：

```javascript
async function publishComment(page, params) {
    // 方案A：先尝试API模式（快速）
    try {
        const cookie = await getCookieFromPage(page);
        const api = createDouyinAPI(cookie);
        return await api.publishComment(params);
    } catch (error) {
        if (error.message.includes('status_code=8')) {
            // 方案B：降级到页面操作模式（可靠）
            logger.info('[发布评论] API模式失败，切换到页面操作模式');
            return await publishCommentViaPage(page, params);
        }
        throw error;
    }
}
```

## 技术总结

### 已实现的功能

1. ✅ 评论发布API集成（`douyin-api.js`）
2. ✅ 安全headers提取和构建
3. ✅ a_bogus签名生成
4. ✅ 请求重试机制
5. ✅ Cookie解析工具

### 已知限制

1. ⚠️ status_code=8错误未解决
2. ⚠️ 无法确定是否需要浏览器环境
3. ⚠️ 错误码语义不明确
4. ⚠️ bd-ticket-guard可能需要动态生成

### 代码位置

- API实现：`packages/worker/src/platforms/douyin/api/douyin-api.js`
- 测试脚本：`tests/test-api-now.js`
- Cookie解析：`tests/parse-cookie-headers.js`
- 文档：`docs/API集成-评论发布功能.md`

## 相关文档

- [API集成-评论发布功能.md](./API集成-评论发布功能.md)
- [二级评论回复失败Bug修复报告.md](./二级评论回复失败Bug修复报告.md)
- HAR文件：`tests/reply.har`

---

**创建时间**：2025-12-01 10:50
**状态**：🔄 调试中（已解决403，待解决status_code=8）
**优先级**：中等（API模式是Playwright模式的补充，非阻塞）
