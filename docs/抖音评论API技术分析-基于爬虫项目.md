# 抖音评论 API 技术分析 - 基于 Douyin_TikTok_Download_API 爬虫项目

## 项目概述

**源项目路径**: `packages/Douyin_TikTok_Download_API-main`
**目标**: 利用该项目的评论爬虫实现，提取 API 参数和加密方式，构建独立的评论抓取功能
**分析日期**: 2025-11-27

## 1. 核心 API 端点

### 1.1 一级评论 API

```
URL: https://www.douyin.com/aweme/v1/web/comment/list/
方法: GET
用途: 获取作品的一级评论列表
```

**文件位置**: `crawlers/douyin/web/endpoints.py:133`
```python
POST_COMMENT = f"{DOUYIN_DOMAIN}/aweme/v1/web/comment/list/"
```

### 1.2 二级评论回复 API

```
URL: https://www.douyin.com/aweme/v1/web/comment/list/reply/
方法: GET
用途: 获取某条一级评论的所有回复（二级评论）
```

**文件位置**: `crawlers/douyin/web/endpoints.py:136`
```python
POST_COMMENT_REPLY = f"{DOUYIN_DOMAIN}/aweme/v1/web/comment/list/reply/"
```

## 2. 请求参数详解

### 2.1 基础参数 (BaseRequestModel)

**文件位置**: `crawlers/douyin/web/models.py:8-42`

所有抖音 Web API 请求都需要携带以下基础参数（共 42 个）：

```python
{
    # 平台信息
    "device_platform": "webapp",
    "aid": "6383",
    "channel": "channel_pc_web",
    "pc_client_type": 1,
    "version_code": "290100",
    "version_name": "29.1.0",

    # 浏览器指纹
    "cookie_enabled": "true",
    "screen_width": 1920,
    "screen_height": 1080,
    "browser_language": "zh-CN",
    "browser_platform": "Win32",
    "browser_name": "Chrome",
    "browser_version": "130.0.0.0",
    "browser_online": "true",
    "engine_name": "Blink",
    "engine_version": "130.0.0.0",

    # 系统信息
    "os_name": "Windows",
    "os_version": "10",
    "cpu_core_num": 12,
    "device_memory": 8,
    "platform": "PC",

    # 网络信息
    "downlink": "10",
    "effective_type": "4g",
    "round_trip_time": "0",

    # 其他参数
    "from_user_page": "1",
    "locate_query": "false",
    "need_time_list": "1",
    "pc_libra_divert": "Windows",
    "publish_video_strategy_type": "2",
    "show_live_replay_strategy": "1",
    "time_list_query": "0",
    "whale_cut_token": "",
    "update_version_code": "170400",
    "msToken": "生成的msToken"
}
```

### 2.2 一级评论参数 (PostComments)

**文件位置**: `crawlers/douyin/web/models.py:188-197`

```python
{
    **BaseRequestModel,  # 继承所有基础参数
    "aweme_id": "作品ID",  # 必需
    "cursor": 0,          # 分页游标，默认0
    "count": 20,          # 每页数量，默认20
    "item_type": 0,       # 类型，默认0
    "insert_ids": "",     # 插入ID，默认空
    "whale_cut_token": "",
    "cut_version": 1,
    "rcFT": ""
}
```

### 2.3 二级评论回复参数 (PostCommentsReply)

**文件位置**: `crawlers/douyin/web/models.py:199-205`

```python
{
    **BaseRequestModel,     # 继承所有基础参数
    "item_id": "作品ID",    # 必需
    "comment_id": "评论ID", # 必需（要查询的一级评论ID）
    "cursor": 0,            # 分页游标，默认0
    "count": 20,            # 每页数量，默认20
    "item_type": 0          # 类型，默认0
}
```

## 3. 加密机制

### 3.1 加密算法演进历史

**XBogus → ABogus (2024年6月12日)**

- **XBogus**: 已废弃，生成 `X-Bogus` 参数（`crawlers/douyin/web/xbogus.py`）
- **ABogus**: 当前使用，生成 `a_bogus` 参数（`crawlers/douyin/web/abogus.py`）

### 3.2 ABogus 加密算法

**文件位置**: `crawlers/douyin/web/abogus.py`

**关键信息**:
- 作者: [@JoeanAmier](https://github.com/JoeanAmier/TikTokDownloader) (GPL v3.0)
- 语言: 纯 Python 实现
- 依赖: `gmssl` 库（SM3 国密哈希算法）

**核心组件**:
```python
class ABogus:
    # 魔术常量
    __version = [1, 0, 1, 5]
    __browser = "1536|742|1536|864|0|0|0|0|1536|864|1536|864|1536|742|24|24|MacIntel"
    __reg = [1937774191, 1226093241, 388252375, ...]

    # 字符串映射表
    __str = {
        "s0": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
        "s1": "Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=",
        ...
    }

    # UA 编码（针对特定 User-Agent 字符串）
    ua_code = [76, 98, 15, 131, 97, 245, 224, 133, ...]  # 长度32

    # 生成 a_bogus
    def get_value(self, params: dict) -> str:
        # 复杂的加密逻辑...
```

### 3.3 BogusManager 工具类

**文件位置**: `crawlers/douyin/web/utils.py:236-304`

```python
class BogusManager:
    # 生成 a_bogus 参数
    @classmethod
    def ab_model_2_endpoint(cls, params: dict, user_agent: str) -> str:
        """
        根据参数字典和 User-Agent 生成 a_bogus

        Args:
            params: 请求参数字典
            user_agent: 浏览器 UA 字符串

        Returns:
            a_bogus: URL 编码后的加密字符串
        """
        ab_value = AB().get_value(params)
        return quote(ab_value, safe='')
```

## 4. Token 生成机制

### 4.1 msToken 生成

**文件位置**: `crawlers/douyin/web/utils.py:78-156`

**策略**: 双重生成策略（真实 + 虚假）

```python
class TokenManager:
    @classmethod
    def gen_real_msToken(cls) -> str:
        """
        通过抖音官方 API 生成真实 msToken
        如果失败，则生成虚假 msToken
        """
        payload = {
            "magic": config["msToken"]["magic"],
            "version": config["msToken"]["version"],
            "dataType": config["msToken"]["dataType"],
            "strData": config["msToken"]["strData"],
            "tspFromClient": get_timestamp()
        }

        # POST 请求抖音 API
        response = client.post(msToken_url, json=payload)
        msToken = response.cookies.get("msToken")

        # 长度校验：120 或 128 字符
        if len(msToken) not in [120, 128]:
            return gen_false_msToken()

        return msToken

    @classmethod
    def gen_false_msToken(cls) -> str:
        """生成 126 位随机字符串 + '=='"""
        return gen_random_str(126) + "=="
```

**msToken 特征**:
- 真实长度: 120 或 128 字符
- 虚假长度: 126 字符 + `==`（总计 128）
- 格式: 随机字母数字组合

### 4.2 其他 Token

```python
# verifyFp 和 s_v_web_id
VerifyFpManager.gen_verify_fp()
# 格式: "verify_" + base36时间戳 + "_" + 36位UUID
# 示例: "verify_lq3d7f_abc123_12345678901234567890123456789012"

# ttwid (通过抖音 API 获取)
TokenManager.gen_ttwid()
```

## 5. 完整请求流程

### 5.1 一级评论抓取

**文件位置**: `crawlers/douyin/web/web_crawler.py:224-234`

```python
async def fetch_video_comments(self, aweme_id: str, cursor: int = 0, count: int = 20):
    # 1. 获取配置的请求头和代理
    kwargs = await self.get_douyin_headers()

    # 2. 创建基础爬虫客户端
    base_crawler = BaseCrawler(
        proxies=kwargs["proxies"],
        crawler_headers=kwargs["headers"]
    )

    async with base_crawler as crawler:
        # 3. 构建参数模型
        params = PostComments(
            aweme_id=aweme_id,
            cursor=cursor,
            count=count
        )

        # 4. 生成 a_bogus（关键步骤）
        params_dict = params.dict()
        params_dict["msToken"] = ''  # 清空 msToken
        a_bogus = BogusManager.ab_model_2_endpoint(
            params_dict,
            kwargs["headers"]["User-Agent"]
        )

        # 5. 构建完整 URL
        endpoint = (
            f"{DouyinAPIEndpoints.POST_COMMENT}"
            f"?{urlencode(params_dict)}"
            f"&a_bogus={a_bogus}"
        )

        # 6. 发送 GET 请求
        response = await crawler.fetch_get_json(endpoint)

    return response
```

### 5.2 二级评论回复抓取

**文件位置**: `crawlers/douyin/web/web_crawler.py:236-246`

```python
async def fetch_video_comments_reply(
    self,
    item_id: str,
    comment_id: str,
    cursor: int = 0,
    count: int = 20
):
    kwargs = await self.get_douyin_headers()
    base_crawler = BaseCrawler(
        proxies=kwargs["proxies"],
        crawler_headers=kwargs["headers"]
    )

    async with base_crawler as crawler:
        # 构建参数
        params = PostCommentsReply(
            item_id=item_id,
            comment_id=comment_id,
            cursor=cursor,
            count=count
        )

        # 生成加密端点（旧方法使用 xb_model_2_endpoint）
        endpoint = BogusManager.xb_model_2_endpoint(
            DouyinAPIEndpoints.POST_COMMENT_REPLY,
            params.dict(),
            kwargs["headers"]["User-Agent"]
        )

        response = await crawler.fetch_get_json(endpoint)

    return response
```

**⚠️ 注意**: 二级评论当前代码仍使用 XBogus，可能需要更新为 ABogus。

## 6. Cookie 和配置管理

### 6.1 配置文件结构

**文件位置**: `crawlers/douyin/web/config.yaml`

```yaml
TokenManager:
  douyin:
    headers:
      Accept-Language: "zh-CN,zh;q=0.9"
      User-Agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ..."
      Referer: "https://www.douyin.com/"
      Cookie: "你的抖音Cookie"

    proxies:
      http: null
      https: null

    msToken:
      url: "https://mssdk-sg.tiktok.com/web/report"
      magic: 538969122
      version: 1
      dataType: 8
      strData: "..."
      User-Agent: "..."

    ttwid:
      url: "https://ttwid.bytedance.com/ttwid/union/register/"
      data: '{"region":"cn","aid":1768,"needFid":false,"service":"www.ixigua.com","migrate_info":{"ticket":"","source":"node"},"cbUrlProtocol":"https","union":true}'
```

### 6.2 Cookie 更新

**文件位置**: `crawlers/douyin/web/web_crawler.py:351-369`

```python
async def update_cookie(self, cookie: str):
    """
    动态更新 Cookie

    1. 更新内存中的配置（立即生效）
    2. 写入配置文件（持久化）
    """
    global config

    # 更新内存
    config["TokenManager"]["douyin"]["headers"]["Cookie"] = cookie

    # 持久化到文件
    with open(f"{path}/config.yaml", 'w', encoding='utf-8') as file:
        yaml.dump(config, file, default_flow_style=False, allow_unicode=True)
```

## 7. 响应数据结构

### 7.1 一级评论响应示例

```json
{
  "status_code": 0,
  "status_msg": "",
  "data": {
    "comments": [
      {
        "cid": "7576919248505750306",  // 评论ID（数字型）
        "text": "评论内容",
        "create_time": 1732694400,
        "digg_count": 123,              // 点赞数
        "reply_comment_total": 5,       // 二级评论数量
        "user": {
          "uid": "用户ID",
          "sec_uid": "MS4wLjAB...",
          "nickname": "用户昵称",
          "avatar_thumb": {
            "url_list": ["头像URL"]
          }
        },
        "reply_id": "0",                // 0表示一级评论
        "reply_to_reply_id": "0"
      }
    ],
    "cursor": 20,                       // 下一页游标
    "has_more": true,                   // 是否还有更多
    "total": 1234                       // 总评论数
  }
}
```

### 7.2 二级评论响应示例

```json
{
  "status_code": 0,
  "data": {
    "comments": [
      {
        "cid": "7577123456789012345",
        "text": "回复内容",
        "create_time": 1732694500,
        "user": { ... },
        "reply_id": "7576919248505750306",     // 回复的一级评论ID
        "reply_to_reply_id": "0",              // 0表示回复一级评论
        "reply_comment": {                     // 被回复的评论信息
          "cid": "7576919248505750306",
          "text": "原评论内容",
          "user": { ... }
        }
      }
    ],
    "cursor": 10,
    "has_more": false
  }
}
```

## 8. 与现有系统集成方案

### 8.1 问题分析

**当前问题**:
1. API 拦截器超时：`**/comment/reply{/,}?**` 模式无法捕获响应
2. 双 ID 系统问题：数字 ID vs 加密 ID (@i/xxx)

**解决方案**: 使用直接 API 调用替代浏览器拦截

### 8.2 集成架构

```
┌─────────────────────────────────────────┐
│  Worker Platform (douyin/platform.js)  │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────▼──────────┐
        │  评论爬虫模块       │
        │  (新建 Node.js 类) │
        └─────────┬──────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌─────────────┐         ┌─────────────┐
│  ABogus.js  │         │  Tokens.js  │
│  (移植算法)  │         │ (msToken等) │
└─────────────┘         └─────────────┘
```

### 8.3 实现步骤

#### 第一阶段：移植核心算法

1. **移植 ABogus 算法**
   - 文件: `packages/worker/src/platforms/douyin/utils/abogus.js`
   - 源代码: Python → JavaScript
   - 依赖: `sm3` 库（可用 `sm-crypto` 或 `js-sm3`）

2. **移植 Token 生成器**
   - 文件: `packages/worker/src/platforms/douyin/utils/tokens.js`
   - 功能: `msToken`、`verifyFp`、`s_v_web_id`

#### 第二阶段：创建评论 API 类

**文件**: `packages/worker/src/platforms/douyin/api/comment-fetcher.js`

```javascript
const axios = require('axios');
const { ABogus } = require('../utils/abogus');
const { TokenManager } = require('../utils/tokens');

class DouyinCommentFetcher {
  constructor(cookie, userAgent) {
    this.cookie = cookie;
    this.userAgent = userAgent || 'Mozilla/5.0 ...';
    this.baseParams = {
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      pc_client_type: 1,
      version_code: '290100',
      version_name: '29.1.0',
      // ... 其他42个基础参数
    };
  }

  /**
   * 获取一级评论
   */
  async fetchComments(awemeId, cursor = 0, count = 20) {
    const params = {
      ...this.baseParams,
      aweme_id: awemeId,
      cursor: cursor,
      count: count,
      item_type: 0,
      msToken: ''
    };

    // 生成 a_bogus
    const aBogus = new ABogus().getValue(params, this.userAgent);

    // 构建 URL
    const queryString = new URLSearchParams(params).toString();
    const url = `https://www.douyin.com/aweme/v1/web/comment/list/?${queryString}&a_bogus=${encodeURIComponent(aBogus)}`;

    // 发送请求
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Referer': 'https://www.douyin.com/',
        'Cookie': this.cookie,
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });

    return response.data;
  }

  /**
   * 获取二级评论回复
   */
  async fetchCommentReplies(itemId, commentId, cursor = 0, count = 20) {
    const params = {
      ...this.baseParams,
      item_id: itemId,
      comment_id: commentId,
      cursor: cursor,
      count: count,
      item_type: 0,
      msToken: ''
    };

    const aBogus = new ABogus().getValue(params, this.userAgent);
    const queryString = new URLSearchParams(params).toString();
    const url = `https://www.douyin.com/aweme/v1/web/comment/list/reply/?${queryString}&a_bogus=${encodeURIComponent(aBogus)}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Referer': 'https://www.douyin.com/',
        'Cookie': this.cookie,
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    });

    return response.data;
  }

  /**
   * 递归获取所有评论（处理分页）
   */
  async fetchAllComments(awemeId, maxCount = 1000) {
    let allComments = [];
    let cursor = 0;
    let hasMore = true;

    while (hasMore && allComments.length < maxCount) {
      const result = await this.fetchComments(awemeId, cursor, 20);

      if (result.status_code === 0) {
        allComments.push(...result.data.comments);
        cursor = result.data.cursor;
        hasMore = result.data.has_more;
      } else {
        throw new Error(`API返回错误: ${result.status_msg}`);
      }

      // 反爬虫：随机延迟 1-3 秒
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    }

    return allComments;
  }
}

module.exports = { DouyinCommentFetcher };
```

#### 第三阶段：集成到 Worker

**修改文件**: `packages/worker/src/platforms/douyin/crawler-comments.js`

```javascript
const { DouyinCommentFetcher } = require('./api/comment-fetcher');

async function crawlComments(accountId, page) {
  // 1. 获取账户的 Cookie
  const cookie = await getAccountCookie(accountId);
  const userAgent = await getAccountUserAgent(accountId);

  // 2. 创建 API 调用器
  const fetcher = new DouyinCommentFetcher(cookie, userAgent);

  // 3. 直接调用 API（替代浏览器操作）
  try {
    const awemeId = '7334525738793618688'; // 示例
    const comments = await fetcher.fetchAllComments(awemeId, 500);

    // 4. 处理评论数据
    for (const comment of comments) {
      // 处理一级评论
      await processComment(comment);

      // 如果有二级评论，也抓取
      if (comment.reply_comment_total > 0) {
        const replies = await fetcher.fetchCommentReplies(
          awemeId,
          comment.cid
        );
        await processReplies(replies);
      }
    }

    return comments;

  } catch (error) {
    logger.error(`评论抓取失败: ${error.message}`);
    throw error;
  }
}
```

## 9. 优势与风险评估

### 9.1 使用 API 调用的优势

✅ **性能提升**
- 无需启动浏览器，内存占用从 200MB → 10MB
- 请求速度快（50ms vs 5s）

✅ **稳定性提升**
- 不依赖 DOM 结构变化
- 不受页面更新影响

✅ **数据完整性**
- 直接获取原始 JSON 数据
- 包含所有字段（ID、时间戳、用户信息等）

✅ **解决双 ID 问题**
- API 返回的 `cid` 就是数字 ID（7576919248505750306）
- 无需 ID 转换和映射

### 9.2 风险与对策

⚠️ **风险1: 算法更新**
- 描述: ABogus 算法可能随时变化
- 对策:
  - 定期检查源项目更新
  - 实现算法版本检测
  - 保留浏览器爬虫作为备用方案

⚠️ **风险2: Cookie 失效**
- 描述: Cookie 可能过期或被封禁
- 对策:
  - 定期更新 Cookie
  - 实现自动登录刷新
  - 使用代理池轮换

⚠️ **风险3: 频率限制**
- 描述: 高频 API 调用可能被限流
- 对策:
  - 随机延迟（1-3秒）
  - 限制并发请求数
  - 分布式部署多个 Worker

⚠️ **风险4: 参数校验升级**
- 描述: 抖音可能增加新的反爬虫参数
- 对策:
  - 监控 API 响应状态码
  - 自动告警机制
  - 快速回退到浏览器方案

## 10. 开发优先级建议

### 阶段一：验证可行性（1-2天）
1. ✅ 分析源项目结构（已完成）
2. 🔲 移植 ABogus 算法到 JavaScript
3. 🔲 编写单元测试验证加密正确性
4. 🔲 手动测试 API 调用（Postman/curl）

### 阶段二：最小可用版本（3-5天）
1. 🔲 实现 `DouyinCommentFetcher` 类
2. 🔲 集成到现有 Worker 爬虫
3. 🔲 添加错误处理和重试机制
4. 🔲 测试一级评论和二级评论抓取

### 阶段三：生产优化（5-7天）
1. 🔲 实现 Cookie 自动更新
2. 🔲 添加代理支持
3. 🔲 实现频率控制和反爬策略
4. 🔲 性能优化和压力测试

### 阶段四：监控和维护（持续）
1. 🔲 添加算法版本检测
2. 🔲 实现自动告警
3. 🔲 定期更新算法库
4. 🔲 备用方案切换机制

## 11. 技术债务与改进方向

### 当前问题
1. 二级评论仍使用废弃的 XBogus（需更新为 ABogus）
2. msToken 生成依赖外部 API（可本地化）
3. User-Agent 硬编码（需与浏览器指纹同步）

### 改进方向
1. 完全本地化 Token 生成
2. 实现动态参数配置
3. 支持多账户并发调用
4. 构建独立的 NPM 包

## 12. 相关资源

### 源项目
- **GitHub**: https://github.com/Evil0ctal/Douyin_TikTok_Download_API
- **License**: Apache 2.0

### 加密算法来源
- **Author**: [@JoeanAmier](https://github.com/JoeanAmier/TikTokDownloader)
- **License**: GPL v3.0
- **注意**: ABogus 代码使用 GPL 协议，商业使用需注意许可证兼容性

### 依赖库
- `axios` - HTTP 客户端
- `sm-crypto` 或 `js-sm3` - SM3 国密哈希算法（JavaScript 实现）
- `yaml` - 配置文件解析（可选）

---

## 总结

通过分析 `Douyin_TikTok_Download_API` 项目，我们完全掌握了抖音评论 API 的调用方式：

1. **两个核心端点**: `/comment/list/` 和 `/comment/list/reply/`
2. **42个基础参数**: 包含设备指纹、浏览器信息等
3. **ABogus 加密算法**: 纯 Python 实现，可移植到 JavaScript
4. **Token 生成机制**: msToken（真实/虚假）、verifyFp、ttwid

**下一步行动**:
1. 将 ABogus Python 代码移植为 JavaScript
2. 创建独立的 `DouyinCommentFetcher` 类
3. 集成到现有 Worker 平台
4. 替换浏览器拦截方案为直接 API 调用

这种方法不仅解决了 API 拦截超时问题，还从根本上解决了双 ID 系统的困扰，因为 API 直接返回数字 ID。
