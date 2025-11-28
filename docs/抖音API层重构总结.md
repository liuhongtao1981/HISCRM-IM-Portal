# 抖音 API 层重构总结

## 概述

本次重构将原本分散在多个文件中的抖音 API 调用代码合并为统一的架构，实现了 **API 定义层** 和 **业务逻辑层** 的清晰分离。

**重构时间**: 2025-11-27
**涉及文件**: 4 个核心文件

---

## 重构目标

### 用户需求
> "packages\worker\src\platforms\douyin\api\comment-fetcher.js packages\worker\src\platforms\douyin\api\work-list.js 这俩个应该合并成一个文件比如douyin.js，只定义方法，你这分开很多重复的写法，还不通用"

> "他只是api 的定义，具体实现逻辑放在 packages\worker\src\platforms\douyin\crawler-api.js"

### 核心原则
1. **消除重复代码**：合并 comment-fetcher.js 和 work-list.js 中的重复逻辑
2. **职责分离**：API 定义层只负责 HTTP 请求，业务逻辑层负责分页、重试、数据处理
3. **统一接口**：所有抖音 API 调用通过统一的 DouyinAPI 类

---

## 架构设计

### 分层架构

```
┌─────────────────────────────────────────────┐
│         crawler-api.js (业务逻辑层)          │
│  - 分页循环                                  │
│  - 数据标准化                                │
│  - 批量处理                                  │
│  - 延迟控制                                  │
└─────────────────────────────────────────────┘
                     ↓ 调用
┌─────────────────────────────────────────────┐
│         douyin-api.js (API 定义层)           │
│  - HTTP 请求                                 │
│  - 请求头构建                                │
│  - 参数加密（a_bogus / X-Bogus）             │
│  - 重试机制                                  │
└─────────────────────────────────────────────┘
                     ↓ 调用
┌─────────────────────────────────────────────┐
│           抖音 Web API 端点                  │
│  - 作品列表 API                              │
│  - 一级评论 API                              │
│  - 二级评论 API                              │
└─────────────────────────────────────────────┘
```

---

## 文件变更

### 1. 新增文件

#### `packages/worker/src/platforms/douyin/api/douyin-api.js`

**定位**：统一的抖音 API 封装类

**核心功能**：
- ✅ 统一的请求处理和重试机制
- ✅ 自动处理 Cookie 和 User-Agent
- ✅ 支持参数加密（a_bogus / X-Bogus）
- ✅ 完整的错误处理和日志记录

**API 方法**：
```javascript
class DouyinAPI {
    // 构造函数
    constructor(cookie, userAgent = null, options = {})

    // 通用方法
    _buildHeaders(referer)           // 构建请求头
    _request(url, config)             // 发送 HTTP 请求（带重试）
    _sleep(ms)                        // 延迟函数
    updateCookie(newCookie)           // 更新 Cookie

    // API 端点（单页请求）
    fetchWorkList(cursor, count, status, scene)          // 获取作品列表
    fetchComments(awemeId, cursor, count)                // 获取一级评论
    fetchReplies(itemId, commentId, cursor, count)       // 获取二级评论
}
```

**关键特性**：
- **统一参数**：所有 Web API 共享的 50+ 个浏览器指纹参数
- **自动重试**：默认最多重试 3 次，支持指数退避
- **加密处理**：
  - 作品列表：无需加密
  - 一级评论：使用 `a_bogus` 加密
  - 二级评论：使用 `X-Bogus` 加密（⚠️ 重要区别）

---

### 2. 修改文件

#### `packages/worker/src/platforms/douyin/crawler-api.js`

**变更内容**：

##### 导入更新
```javascript
// 旧导入（已删除）
// const { WorkListAPI } = require('./api/work-list');
// const { generateXBogus } = require('./api/xbogus');
// const { generateABogus } = require('./api/abogus');
// const axios = require('axios');

// 新导入
const { DouyinAPI } = require('./api/douyin-api');
```

##### 初始化更新
```javascript
// 旧代码
this.workListAPI = new WorkListAPI(this.cookie, this.userAgent);

// 新代码
this.douyinAPI = new DouyinAPI(this.cookie, this.userAgent);
```

##### 方法重构

**1️⃣ fetchAllWorks() - 作品列表抓取**

变更：
- ❌ 删除：调用 `this.workListAPI.fetchAllWorks()`（封装的业务逻辑）
- ✅ 新增：手动实现分页循环，调用 `this.douyinAPI.fetchWorkList()` 获取单页数据

```javascript
// 旧代码
const allWorks = await this.workListAPI.fetchAllWorks({
    pageSize: this.config.works.pageSize,
    maxPages: this.config.works.maxPages,
});

// 新代码
let allWorks = [];
let cursor = 0;
let hasMore = true;
let pageCount = 0;

while (hasMore && pageCount < maxPages) {
    const data = await this.douyinAPI.fetchWorkList(cursor, pageSize);

    if (data.aweme_list && data.aweme_list.length > 0) {
        allWorks = allWorks.concat(data.aweme_list);
    }

    cursor = data.max_cursor;
    hasMore = data.has_more;
    pageCount++;

    if (hasMore && pageCount < maxPages) {
        await this.sleep(1000);
    }
}
```

**2️⃣ fetchCommentsForWork() - 评论抓取**

变更：
- ❌ 删除：手动构建 axios 请求、参数、URL
- ✅ 新增：调用 `this.douyinAPI.fetchComments()`

```javascript
// 旧代码（35+ 行）
const params = {
    device_platform: 'webapp',
    aid: '6383',
    channel: 'channel_pc_web',
    aweme_id: workId,
    cursor: cursor,
    count: this.config.comments.pageSize,
    item_type: '0',
};

const queryString = new URLSearchParams(params).toString();
const aBogus = generateABogus(queryString, this.userAgent);
const url = `https://www.douyin.com/aweme/v1/web/comment/list/?${queryString}&a_bogus=${aBogus}`;

const response = await axios.get(url, {
    headers: {
        'User-Agent': this.userAgent,
        'Cookie': this.cookie,
        'Referer': 'https://www.douyin.com/',
    },
    timeout: 15000,
});

const data = response.data;
const comments = data.comments || [];

// 新代码（4 行）
const result = await this.douyinAPI.fetchComments(
    workId,
    cursor,
    this.config.comments.pageSize
);

const comments = result.comments || [];
```

**3️⃣ fetchRepliesForComments() - 二级评论抓取**

变更：
- ❌ 删除：手动构建 axios 请求、X-Bogus 加密
- ✅ 新增：调用 `this.douyinAPI.fetchReplies()`

```javascript
// 旧代码（30+ 行）
const params = {
    device_platform: 'webapp',
    aid: '6383',
    channel: 'channel_pc_web',
    item_id: workId,
    comment_id: comment.cid,
    cursor: cursor,
    count: this.config.replies.pageSize,
};

const queryString = new URLSearchParams(params).toString();
const xBogus = generateXBogus(queryString, this.userAgent);
const url = `https://www.douyin.com/aweme/v1/web/comment/list/reply/?${queryString}&X-Bogus=${xBogus}`;

const response = await axios.get(url, { /* ... */ });
const data = response.data;
const replies = data.comments || [];

// 新代码（5 行）
const result = await this.douyinAPI.fetchReplies(
    workId,
    comment.cid,
    cursor,
    this.config.replies.pageSize
);

const replies = result.comments || [];
```

##### 新增业务逻辑方法

从 `work-list.js` 迁移到 `crawler-api.js` 的方法：

```javascript
// 标准化作品数据
normalizeWork(rawWork) { /* ... */ }

// 检测作品类型（视频/图片）
detectWorkType(work) { /* ... */ }

// 解析作品状态（草稿/已发布/审核中等）
parseStatus(statusValue) { /* ... */ }
```

**为什么迁移？**
- 这些是业务逻辑方法，不应该放在纯 API 层
- crawler-api.js 是业务逻辑的正确位置

---

### 3. 废弃文件（保留但不再使用）

#### `packages/worker/src/platforms/douyin/api/comment-fetcher.js`
- **状态**：已被 douyin-api.js 替代
- **建议**：移动到 `_archive/` 目录

#### `packages/worker/src/platforms/douyin/api/work-list.js`
- **状态**：已被 douyin-api.js 替代
- **建议**：移动到 `_archive/` 目录

---

### 4. 配置文件

#### `packages/worker/.env`

新增完整的 API 爬虫配置：

```bash
# ============================================================================
# API 爬虫配置 (DouyinAPICrawler)
# ============================================================================

# 基础配置
API_CRAWLER_ENABLED=true                        # 是否启用 API 爬虫
API_CRAWLER_INTERVAL=300000                     # 执行间隔（毫秒）- 默认 5 分钟
API_CRAWLER_AUTO_START=true                     # 是否自动启动

# 作品抓取配置
API_CRAWLER_WORKS_PAGE_SIZE=50                  # 每页作品数量
API_CRAWLER_WORKS_MAX_PAGES=50                  # 最多抓取页数

# 评论抓取配置
API_CRAWLER_COMMENTS_ENABLED=true               # 是否抓取评论
API_CRAWLER_COMMENTS_PAGE_SIZE=20               # 每页评论数量
API_CRAWLER_COMMENTS_MAX_PAGES=25               # 每个作品最多抓取页数
API_CRAWLER_COMMENTS_MAX_COMMENTS=500           # 每个作品最多抓取评论数

# 二级评论抓取配置
API_CRAWLER_REPLIES_ENABLED=true                # 是否抓取二级评论
API_CRAWLER_REPLIES_PAGE_SIZE=20                # 每页二级评论数量
API_CRAWLER_REPLIES_MAX_PAGES=5                 # 每个一级评论最多抓取页数
API_CRAWLER_REPLIES_MAX_REPLIES=100             # 每个一级评论最多抓取数量

# 延迟配置
API_CRAWLER_DELAY_BETWEEN_WORKS=2000            # 作品之间的延迟（毫秒）
API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES=1000    # 评论分页之间的延迟（毫秒）
API_CRAWLER_DELAY_BETWEEN_REPLIES=500           # 二级评论之间的延迟（毫秒）
```

---

## 关键修复

### ⚠️ 重要 Bug 修复：X-Bogus vs a_bogus

**问题**：
- 二级评论 API 需要使用 `X-Bogus` 加密参数
- 最初实现错误地使用了 `a_bogus`

**修复**：
```javascript
// 错误实现 ❌
const aBogus = generateABogus(params, this.userAgent);
const url = `${this.endpoints.commentReply}?${queryString}&a_bogus=${aBogus}`;

// 正确实现 ✅
const xBogus = generateXBogus(queryString, this.userAgent);
const url = `${this.endpoints.commentReply}?${queryString}&X-Bogus=${xBogus}`;
```

**影响范围**：
- 文件：`douyin-api.js` 的 `fetchReplies()` 方法
- 严重性：高（导致二级评论 API 请求失败）
- 状态：✅ 已修复

---

## 代码统计

### 代码减少

| 文件 | 旧代码行数 | 新代码行数 | 减少 |
|------|----------|----------|------|
| crawler-api.js (评论抓取) | ~35 行 | ~8 行 | **-27 行** |
| crawler-api.js (回复抓取) | ~30 行 | ~7 行 | **-23 行** |
| **总计** | | | **-50+ 行** |

### 代码复用

**重复代码消除**：
- ✅ 请求头构建：从 3 处 → 1 处（`_buildHeaders()`）
- ✅ 重试逻辑：从 3 处 → 1 处（`_request()`）
- ✅ 错误处理：从 3 处 → 1 处（`_request()`）
- ✅ 延迟函数：从 3 处 → 1 处（`_sleep()`）

---

## 优势总结

### 1. 代码质量
- ✅ **消除重复**：50+ 行重复代码合并为统一实现
- ✅ **职责清晰**：API 层只负责 HTTP 请求，业务层负责分页和数据处理
- ✅ **易于维护**：修改 API 逻辑只需修改一处

### 2. 可扩展性
- ✅ **新增 API**：只需在 DouyinAPI 中添加新方法
- ✅ **修改逻辑**：不影响业务层代码
- ✅ **统一配置**：所有 API 共享配置（超时、重试次数等）

### 3. 错误处理
- ✅ **统一重试机制**：所有 API 自动享有重试能力
- ✅ **完整日志**：所有请求自动记录日志
- ✅ **错误传播**：清晰的错误堆栈

### 4. 性能优化
- ✅ **可配置超时**：默认 15 秒，可自定义
- ✅ **智能重试**：指数退避策略（1x → 2x → 3x delay）
- ✅ **Cookie 复用**：避免重复获取

---

## 使用示例

### 初始化

```javascript
const { DouyinAPI } = require('./api/douyin-api');

const api = new DouyinAPI(cookie, userAgent, {
    timeout: 15000,      // 请求超时
    maxRetries: 3,       // 最大重试次数
    retryDelay: 1000     // 重试延迟（毫秒）
});
```

### 获取作品列表

```javascript
// 获取第一页（20 个作品）
const data = await api.fetchWorkList(0, 20);

console.log(`获取到 ${data.aweme_list.length} 个作品`);
console.log(`还有更多: ${data.has_more}`);
console.log(`下一页游标: ${data.max_cursor}`);
```

### 获取评论

```javascript
// 获取作品的第一页评论（20 条）
const result = await api.fetchComments('7576912411052100870', 0, 20);

console.log(`获取到 ${result.comments.length} 条评论`);
console.log(`还有更多: ${result.has_more}`);
```

### 获取二级评论

```javascript
// 获取某条评论的回复
const result = await api.fetchReplies(
    '7576912411052100870',  // 作品 ID
    '7572250319850095397',  // 评论 ID
    0,                       // 游标
    20                       // 每页数量
);

console.log(`获取到 ${result.comments.length} 条回复`);
```

### 更新 Cookie

```javascript
// 当 Cookie 过期时，动态更新
api.updateCookie(newCookie);
```

---

## 测试建议

### 单元测试

```javascript
describe('DouyinAPI', () => {
    let api;

    beforeEach(() => {
        api = new DouyinAPI(mockCookie, mockUserAgent);
    });

    test('fetchWorkList 应返回作品列表', async () => {
        const data = await api.fetchWorkList(0, 20);
        expect(data).toHaveProperty('aweme_list');
        expect(data).toHaveProperty('has_more');
    });

    test('fetchComments 应返回评论列表', async () => {
        const result = await api.fetchComments('test-aweme-id', 0, 20);
        expect(result).toHaveProperty('comments');
        expect(result).toHaveProperty('cursor');
    });

    test('fetchReplies 应使用 X-Bogus 加密', async () => {
        const result = await api.fetchReplies('item-id', 'comment-id', 0, 20);
        expect(result).toHaveProperty('comments');
        // 验证 URL 包含 X-Bogus 参数
    });
});
```

### 集成测试

```javascript
describe('Crawler API Integration', () => {
    test('应能完整抓取作品、评论和回复', async () => {
        const crawler = new DouyinAPICrawler(account, platform);
        await crawler.initialize();

        const stats = await crawler.runOnce();

        expect(stats.totalWorks).toBeGreaterThan(0);
        expect(stats.totalComments).toBeGreaterThan(0);
        expect(stats.totalReplies).toBeGreaterThan(0);
    });
});
```

---

## 迁移检查清单

- [x] 创建 `douyin-api.js` 统一 API 类
- [x] 实现 `fetchWorkList()` 方法
- [x] 实现 `fetchComments()` 方法（使用 a_bogus）
- [x] 实现 `fetchReplies()` 方法（使用 X-Bogus）⚠️
- [x] 修复 `fetchReplies()` 的加密方式
- [x] 更新 `crawler-api.js` 导入
- [x] 重构 `fetchAllWorks()` 使用新 API
- [x] 重构 `fetchCommentsForWork()` 使用新 API
- [x] 重构 `fetchRepliesForComments()` 使用新 API
- [x] 迁移业务逻辑方法（normalizeWork 等）
- [x] 移除旧的依赖导入（axios, generateABogus, generateXBogus）
- [x] 验证没有遗留引用
- [x] 更新 .env 配置文件
- [x] 创建重构总结文档

---

## 后续工作

### 1. 文件归档
```bash
# 移动废弃文件到归档目录
mkdir -p packages/worker/src/platforms/douyin/api/_archive
mv packages/worker/src/platforms/douyin/api/comment-fetcher.js packages/worker/src/platforms/douyin/api/_archive/
mv packages/worker/src/platforms/douyin/api/work-list.js packages/worker/src/platforms/douyin/api/_archive/
```

### 2. 测试验证
- [ ] 单元测试：DouyinAPI 类的各个方法
- [ ] 集成测试：完整的爬虫流程
- [ ] 性能测试：大量数据抓取（1000+ 作品）
- [ ] 错误测试：Cookie 失效、网络错误、API 限流

### 3. 文档更新
- [x] 创建本重构总结文档
- [ ] 更新 API 使用指南
- [ ] 更新开发者文档

### 4. 代码审查
- [ ] 代码质量检查（ESLint）
- [ ] 性能分析（内存、CPU）
- [ ] 安全审查（凭证处理）

---

## 相关文档

- [API爬虫集成实现总结](./API爬虫集成实现总结.md)
- [API爬虫使用指南](./API爬虫使用指南.md)
- [API爬虫配置说明](./API爬虫配置说明.md)
- [抖音评论API技术分析](./抖音评论API技术分析-基于爬虫项目.md)

---

**文档版本**: v1.0
**最后更新**: 2025-11-27
**维护者**: HISCRM-IM 开发团队
