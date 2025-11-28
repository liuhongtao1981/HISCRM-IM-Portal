# API 爬虫使用指南

## 快速开始

API 爬虫已集成到 `DouyinPlatform` 类中，会在账户初始化时自动启动。

---

## 配置方式

### 方式 1: 环境变量配置（全局默认值）

在 `packages/worker/.env` 文件中配置全局默认值：

```bash
# 基础配置
API_CRAWLER_ENABLED=true
API_CRAWLER_INTERVAL=300000                     # 5 分钟
API_CRAWLER_AUTO_START=true

# 作品抓取配置
API_CRAWLER_WORKS_PAGE_SIZE=50
API_CRAWLER_WORKS_MAX_PAGES=50

# 评论抓取配置
API_CRAWLER_COMMENTS_ENABLED=true
API_CRAWLER_COMMENTS_PAGE_SIZE=20
API_CRAWLER_COMMENTS_MAX_PAGES=25
API_CRAWLER_COMMENTS_MAX_COMMENTS=500

# 二级评论抓取配置
API_CRAWLER_REPLIES_ENABLED=true
API_CRAWLER_REPLIES_PAGE_SIZE=20
API_CRAWLER_REPLIES_MAX_PAGES=5
API_CRAWLER_REPLIES_MAX_REPLIES=100

# 延迟配置
API_CRAWLER_DELAY_BETWEEN_WORKS=2000
API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES=1000
API_CRAWLER_DELAY_BETWEEN_REPLIES=500
```

**说明**:
- 这些配置作为所有账户的默认值
- 修改后需要重启 Worker 进程生效
- 适用于统一管理多个账户的配置

### 方式 2: 数据库配置（账户级别覆盖）

在 `accounts` 表的 `monitoring_config` 字段中配置，可覆盖 .env 中的默认值：

```sql
UPDATE accounts
SET monitoring_config = '{
    "enableAPICrawler": true,
    "apiCrawlerInterval": 600000
}'
WHERE id = 'your-account-id';
```

**说明**:
- 优先级高于 .env 配置
- 可以为每个账户单独配置
- 支持动态更新（无需重启）

### 方式 3: 代码配置

```javascript
const account = {
    id: 'account-123',
    platform: 'douyin',
    monitoring_config: {
        enableAPICrawler: true,
        apiCrawlerInterval: 5 * 60 * 1000,  // 5 分钟
    }
};

const platform = new DouyinPlatform(config, workerBridge, browserManager);
await platform.initialize(account);
```

### 配置优先级

```
代码配置 > 数据库配置 > 环境变量配置 > 默认值
```

---

## 配置参数

### 基础配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enableAPICrawler` | Boolean | `true` | 是否启用 API 爬虫 |
| `apiCrawlerInterval` | Number | `300000` | 执行间隔（毫秒），默认 5 分钟 |
| `apiCrawlerAutoStart` | Boolean | `true` | 是否自动启动 |

### 作品抓取配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiCrawlerWorksPageSize` | Number | `50` | 每页作品数量 |
| `apiCrawlerWorksMaxPages` | Number | `50` | 最多抓取页数 |

### 评论抓取配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiCrawlerCommentsEnabled` | Boolean | `true` | 是否抓取评论 |
| `apiCrawlerCommentsPageSize` | Number | `20` | 每页评论数量 |
| `apiCrawlerCommentsMaxPages` | Number | `25` | 每个作品最多抓取页数 |
| `apiCrawlerCommentsMaxComments` | Number | `500` | 每个作品最多抓取评论数 |

### 二级评论配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiCrawlerRepliesEnabled` | Boolean | `true` | 是否抓取二级评论 |
| `apiCrawlerRepliesPageSize` | Number | `20` | 每页二级评论数量 |
| `apiCrawlerRepliesMaxPages` | Number | `5` | 每个一级评论最多抓取页数 |
| `apiCrawlerRepliesMaxReplies` | Number | `100` | 每个一级评论最多抓取数量 |

### 延迟配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiCrawlerDelayBetweenWorks` | Number | `2000` | 作品之间的延迟（毫秒） |
| `apiCrawlerDelayBetweenCommentPages` | Number | `1000` | 评论分页之间的延迟（毫秒） |
| `apiCrawlerDelayBetweenReplies` | Number | `500` | 二级评论之间的延迟（毫秒） |

---

## 控制方法

### 手动启动

```javascript
await platform.startAPICrawler(accountId);
```

### 停止

```javascript
await platform.stopAPICrawler(accountId);
```

### 暂停

```javascript
platform.pauseAPICrawler(accountId);
```

### 恢复

```javascript
platform.resumeAPICrawler(accountId);
```

### 查询状态

```javascript
const stats = platform.getAPICrawlerStatus(accountId);
console.log(stats);
```

**返回格式**:
```javascript
{
    isRunning: true,
    isPaused: false,
    lastRun: 1732694400000,
    lastSuccess: 1732694400000,
    lastError: null,
    totalRuns: 15,
    successRuns: 15,
    failedRuns: 0,
    totalWorks: 120,
    totalComments: 850,
    totalReplies: 320,
    config: { /* 配置详情 */ }
}
```

---

## 使用场景

### 场景 1: 小账户（定时同步）

```javascript
{
    enableAPICrawler: true,
    apiCrawlerInterval: 5 * 60 * 1000,  // 5 分钟
    apiCrawlerCommentsMaxPages: 10,
    apiCrawlerRepliesEnabled: true,
}
```

**适用于**:
- 作品数 < 100
- 评论量较少
- 需要实时同步

### 场景 2: 中等账户（平衡模式）

```javascript
{
    enableAPICrawler: true,
    apiCrawlerInterval: 10 * 60 * 1000,  // 10 分钟
    apiCrawlerWorksPageSize: 50,
    apiCrawlerCommentsMaxPages: 25,
    apiCrawlerRepliesMaxPages: 5,
}
```

**适用于**:
- 作品数 100-1000
- 评论量适中
- 定期更新即可

### 场景 3: 大账户（节约资源）

```javascript
{
    enableAPICrawler: true,
    apiCrawlerInterval: 30 * 60 * 1000,  // 30 分钟
    apiCrawlerWorksMaxPages: 100,
    apiCrawlerCommentsMaxPages: 50,
    apiCrawlerRepliesEnabled: false,  // 关闭二级评论
}
```

**适用于**:
- 作品数 > 1000
- 评论量巨大
- 只需定期统计

### 场景 4: 仅作品统计

```javascript
{
    enableAPICrawler: true,
    apiCrawlerInterval: 60 * 60 * 1000,  // 1 小时
    apiCrawlerCommentsEnabled: false,    // 不抓取评论
    apiCrawlerRepliesEnabled: false,     // 不抓取二级评论
}
```

**适用于**:
- 只关心作品播放量、点赞数等统计
- 不需要评论数据

---

## 常见问题

### Q1: 如何调整抓取频率？

**A**: 修改 `apiCrawlerInterval` 参数（单位：毫秒）

```javascript
// 1 分钟
apiCrawlerInterval: 60 * 1000

// 5 分钟（推荐）
apiCrawlerInterval: 5 * 60 * 1000

// 30 分钟
apiCrawlerInterval: 30 * 60 * 1000
```

⚠️ **注意**: 不建议低于 1 分钟，避免触发抖音限流。

### Q2: 如何禁用 API 爬虫？

**A**: 设置 `enableAPICrawler: false`

```javascript
{
    enableAPICrawler: false
}
```

### Q3: Cookie 失效怎么办？

**A**: API 爬虫会自动从常驻 Tab 获取最新 Cookie。如果登录失效，爬虫会自动暂停，等待重新登录。

### Q4: 如何只抓取评论，不抓取二级评论？

**A**: 设置 `apiCrawlerRepliesEnabled: false`

```javascript
{
    apiCrawlerCommentsEnabled: true,
    apiCrawlerRepliesEnabled: false
}
```

### Q5: 如何限制单个作品的评论数量？

**A**: 设置 `apiCrawlerCommentsMaxComments`

```javascript
{
    apiCrawlerCommentsMaxComments: 100  // 每个作品最多 100 条评论
}
```

### Q6: 爬虫会与浏览器爬虫冲突吗？

**A**: 不会。API 爬虫和浏览器爬虫可以并行运行：
- **API 爬虫**: 定时后台同步（轻量级）
- **浏览器爬虫**: 手动触发或首次抓取（完整数据）

DataManager 会自动去重，不会产生重复数据。

---

## 性能建议

### 1. 合理设置间隔

| 账户规模 | 推荐间隔 |
|---------|---------|
| 小账户（< 100 作品） | 5 分钟 |
| 中等账户（100-1000） | 10-15 分钟 |
| 大账户（> 1000） | 30-60 分钟 |

### 2. 限制分页数量

- 作品分页: 根据总作品数设置 `apiCrawlerWorksMaxPages`
- 评论分页: 热门作品评论多，可适当增加 `apiCrawlerCommentsMaxPages`
- 二级评论: 如果不重要可关闭 `apiCrawlerRepliesEnabled`

### 3. 控制延迟

- **作品之间**: 2000ms（防止频繁请求）
- **评论分页**: 1000ms（平衡速度和安全）
- **二级评论**: 500ms（数量少，可快速处理）

---

## 日志监控

### 启动日志

```
初始化 API 爬虫 (账户: account-123)
✅ API 爬虫已自动启动 (账户: account-123, 间隔: 300000ms)
✅ API 爬虫初始化成功 (账户: account-123)
```

### 运行日志

```
⏰ [API爬虫] 开始执行任务 (账户: account-123)
  - 已运行次数: 15, 成功: 15, 失败: 0

📥 [作品列表] 获取到 25 个作品
   - 当前页: 25, 总计: 25

💬 [评论] 作品 7576912411052100870 - 获取到 15 条评论
   - 页码: 1, 总计: 15

💬 [二级评论] 评论 7572250319850095397 - 获取到 8 条回复
   - 页码: 1, 总计: 8

✅ [API爬虫] 任务完成 (账户: account-123)
   - 作品: 25, 评论: 350, 二级评论: 120
   - 耗时: 45.2 秒
```

### 错误日志

```
❌ [API爬虫] 任务失败 (账户: account-123)
   - 错误: Cookie 失效
   - 建议: 检查登录状态
```

---

## 故障排除

### 问题 1: 爬虫不执行

**可能原因**:
1. `enableAPICrawler` 设置为 `false`
2. 账户未登录
3. 爬虫已暂停

**解决方法**:
```javascript
// 检查配置
const config = platform.parseMonitoringConfig(account);
console.log('API爬虫启用:', config.enableAPICrawler);

// 检查状态
const stats = platform.getAPICrawlerStatus(account.id);
console.log('运行状态:', stats);

// 手动启动
if (!stats || !stats.isRunning) {
    await platform.startAPICrawler(account.id);
}
```

### 问题 2: Cookie 失效

**现象**: 日志显示"Cookie 失效"或"登录状态异常"

**解决方法**:
1. 重新登录账户
2. 爬虫会自动从新登录的 Tab 获取 Cookie
3. 手动恢复爬虫：`platform.resumeAPICrawler(accountId)`

### 问题 3: 数据重复

**原因**: API 爬虫和浏览器爬虫同时运行

**说明**: 这是正常的。DataManager 会自动去重，不会插入重复数据到数据库。

### 问题 4: 抓取速度慢

**优化方法**:
1. 减少分页数量：`apiCrawlerCommentsMaxPages`
2. 关闭二级评论：`apiCrawlerRepliesEnabled: false`
3. 减少延迟（谨慎）：`apiCrawlerDelayBetweenCommentPages`

---

## 最佳实践

### 1. 首次使用

```javascript
// 第一次使用时，用浏览器爬虫获取完整数据
await platform.crawlComments(account);

// 然后启用 API 爬虫进行增量更新
{
    enableAPICrawler: true,
    apiCrawlerInterval: 10 * 60 * 1000
}
```

### 2. 生产环境

```javascript
{
    enableAPICrawler: true,
    apiCrawlerInterval: 15 * 60 * 1000,  // 15 分钟
    apiCrawlerAutoStart: true,
    apiCrawlerCommentsMaxPages: 25,
    apiCrawlerRepliesEnabled: true,
    apiCrawlerDelayBetweenWorks: 2000,
}
```

### 3. 测试环境

```javascript
{
    enableAPICrawler: true,
    apiCrawlerInterval: 1 * 60 * 1000,   // 1 分钟
    apiCrawlerAutoStart: false,          // 手动控制
    apiCrawlerWorksPageSize: 10,
    apiCrawlerCommentsMaxPages: 5,
    apiCrawlerRepliesEnabled: false,
}
```

---

## 相关文档

- [API爬虫集成实现总结](./API爬虫集成实现总结.md)
- [作品统计功能实现总结](./作品统计功能实现总结.md)
- [X-Bogus算法Bug修复报告](./X-Bogus算法Bug修复报告.md)

---

**文档版本**: v1.0
**最后更新**: 2025-11-27
**维护者**: HISCRM-IM 开发团队
