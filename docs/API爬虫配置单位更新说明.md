# API 爬虫配置单位更新说明

## 更新概述

**更新时间**: 2025-11-27
**影响范围**: API 爬虫配置参数

为了与其他配置保持一致（LOGIN_CHECK_INTERVAL 使用秒，CRAWL_INTERVAL 使用分钟），将 `API_CRAWLER_INTERVAL` 配置从**毫秒**改为**秒**，使配置更加直观和用户友好。

---

## 配置变更

### 环境变量（.env 文件）

#### 主要变更：API_CRAWLER_INTERVAL

```bash
# 旧配置（毫秒）
API_CRAWLER_INTERVAL=300000  # 5 分钟 = 300000 毫秒

# 新配置（秒）✅
API_CRAWLER_INTERVAL=300     # 5 分钟 = 300 秒
```

#### 保持不变：延迟配置

以下延迟配置仍然使用毫秒（因为值通常较小）：

```bash
API_CRAWLER_DELAY_BETWEEN_WORKS=2000            # 毫秒（2 秒）
API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES=1000    # 毫秒（1 秒）
API_CRAWLER_DELAY_BETWEEN_REPLIES=500           # 毫秒（0.5 秒）
```

---

## 代码变更

### 文件：`packages/worker/src/platforms/douyin/platform.js`

#### 新增环境变量读取逻辑

```javascript
parseMonitoringConfig(account) {
    // 从环境变量读取 API 爬虫配置
    const envApiCrawlerConfig = {
        enableAPICrawler: process.env.API_CRAWLER_ENABLED === 'true',
        apiCrawlerAutoStart: process.env.API_CRAWLER_AUTO_START !== 'false',
        // 🔥 秒 → 毫秒 转换
        apiCrawlerInterval: (parseInt(process.env.API_CRAWLER_INTERVAL) || 300) * 1000,

        // 作品抓取配置
        apiCrawlerWorksPageSize: parseInt(process.env.API_CRAWLER_WORKS_PAGE_SIZE) || 50,
        apiCrawlerWorksMaxPages: parseInt(process.env.API_CRAWLER_WORKS_MAX_PAGES) || 50,

        // 评论抓取配置
        apiCrawlerCommentsEnabled: process.env.API_CRAWLER_COMMENTS_ENABLED !== 'false',
        apiCrawlerCommentsPageSize: parseInt(process.env.API_CRAWLER_COMMENTS_PAGE_SIZE) || 20,
        apiCrawlerCommentsMaxPages: parseInt(process.env.API_CRAWLER_COMMENTS_MAX_PAGES) || 25,
        apiCrawlerCommentsMaxComments: parseInt(process.env.API_CRAWLER_COMMENTS_MAX_COMMENTS) || 500,

        // 二级评论抓取配置
        apiCrawlerRepliesEnabled: process.env.API_CRAWLER_REPLIES_ENABLED !== 'false',
        apiCrawlerRepliesPageSize: parseInt(process.env.API_CRAWLER_REPLIES_PAGE_SIZE) || 20,
        apiCrawlerRepliesMaxPages: parseInt(process.env.API_CRAWLER_REPLIES_MAX_PAGES) || 5,
        apiCrawlerRepliesMaxReplies: parseInt(process.env.API_CRAWLER_REPLIES_MAX_REPLIES) || 100,

        // 延迟配置（保持毫秒）
        apiCrawlerDelayBetweenWorks: parseInt(process.env.API_CRAWLER_DELAY_BETWEEN_WORKS) || 2000,
        apiCrawlerDelayBetweenCommentPages: parseInt(process.env.API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES) || 1000,
        apiCrawlerDelayBetweenReplies: parseInt(process.env.API_CRAWLER_DELAY_BETWEEN_REPLIES) || 500,
    };

    // 默认配置（合并环境变量配置）
    const defaultConfig = {
        enableRealtimeMonitor: true,
        crawlIntervalMin: 0.5,
        crawlIntervalMax: 0.5,
        ...envApiCrawlerConfig,  // 🔥 从环境变量读取
    };

    // ... 其他代码
}
```

#### 关键特性

1. **自动单位转换**：环境变量中的秒自动转换为毫秒
2. **完整支持**：支持读取所有 17 个 API_CRAWLER 环境变量
3. **向后兼容**：数据库中的 `monitoring_config` 仍然使用毫秒（直接赋值，无需转换）

---

## 配置优先级

```
数据库配置（毫秒）> 环境变量配置（秒 → 毫秒）> 代码默认值（毫秒）
```

### 示例

```bash
# .env 文件（秒）
API_CRAWLER_INTERVAL=300  # 5 分钟 → 转换为 300000 毫秒

# 数据库 monitoring_config（毫秒）
{
    "apiCrawlerInterval": 600000  # 10 分钟（直接使用，不转换）
}

# 结果
该账户使用 600000 毫秒（10 分钟）- 数据库配置优先
```

---

## 配置对照表

### 常用间隔配置

| 间隔 | 秒（.env） | 毫秒（代码/数据库） | 说明 |
|------|-----------|-------------------|------|
| 30 秒 | 30 | 30000 | 测试用 |
| 1 分钟 | 60 | 60000 | 快速监控 |
| 5 分钟 | 300 | 300000 | **默认值**，推荐小账户 |
| 10 分钟 | 600 | 600000 | 推荐中等账户 |
| 30 分钟 | 1800 | 1800000 | 推荐大账户 |
| 1 小时 | 3600 | 3600000 | 仅统计场景 |

### 其他配置（保持不变）

| 配置 | 单位 | 说明 |
|------|------|------|
| `API_CRAWLER_WORKS_PAGE_SIZE` | 数量 | 每页作品数量 |
| `API_CRAWLER_WORKS_MAX_PAGES` | 数量 | 最多抓取页数 |
| `API_CRAWLER_COMMENTS_PAGE_SIZE` | 数量 | 每页评论数量 |
| `API_CRAWLER_COMMENTS_MAX_PAGES` | 数量 | 每个作品最多抓取页数 |
| `API_CRAWLER_COMMENTS_MAX_COMMENTS` | 数量 | 每个作品最多抓取评论数 |
| `API_CRAWLER_DELAY_BETWEEN_WORKS` | **毫秒** | 作品之间的延迟 |
| `API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES` | **毫秒** | 评论分页之间的延迟 |
| `API_CRAWLER_DELAY_BETWEEN_REPLIES` | **毫秒** | 二级评论之间的延迟 |

---

## 推荐配置

### 测试环境（快速验证）

```bash
API_CRAWLER_INTERVAL=30              # 30 秒
API_CRAWLER_WORKS_MAX_PAGES=2        # 只抓 2 页
API_CRAWLER_COMMENTS_MAX_PAGES=2     # 每作品只抓 2 页评论
API_CRAWLER_REPLIES_MAX_PAGES=2      # 每评论只抓 2 页回复
```

### 生产环境（小账户 < 100 作品）

```bash
API_CRAWLER_INTERVAL=300             # 5 分钟
API_CRAWLER_WORKS_MAX_PAGES=10
API_CRAWLER_COMMENTS_MAX_PAGES=10
API_CRAWLER_REPLIES_ENABLED=true
```

### 生产环境（中等账户 100-1000 作品）

```bash
API_CRAWLER_INTERVAL=600             # 10 分钟
API_CRAWLER_WORKS_MAX_PAGES=20
API_CRAWLER_COMMENTS_MAX_PAGES=25
API_CRAWLER_REPLIES_MAX_PAGES=5
```

### 生产环境（大账户 > 1000 作品）

```bash
API_CRAWLER_INTERVAL=1800            # 30 分钟
API_CRAWLER_WORKS_MAX_PAGES=50
API_CRAWLER_COMMENTS_MAX_PAGES=50
API_CRAWLER_REPLIES_ENABLED=false    # 关闭二级评论
```

---

## 迁移指南

### 对于现有部署

**1. 更新环境变量（.env 文件）**

```bash
# 旧配置
# API_CRAWLER_INTERVAL=300000

# 新配置 ✅
API_CRAWLER_INTERVAL=300
```

**2. 数据库配置无需修改**

数据库中的 `monitoring_config` 字段保持不变（仍然使用毫秒）：

```json
{
    "apiCrawlerInterval": 600000  // 保持不变，代码会直接使用
}
```

**3. 重启 Worker 进程**

```bash
pm2 restart hiscrm-worker
```

### 对于新部署

直接使用新的配置格式（秒）即可，无需任何额外操作。

---

## 常见问题

### Q1: 为什么延迟配置还是使用毫秒？

**A**: 延迟配置的值通常较小（200-2000ms），使用毫秒更精确且更符合使用习惯。

### Q2: 数据库中的 `apiCrawlerInterval` 需要修改吗？

**A**: 不需要。数据库中的值直接赋给内部变量，仍然使用毫秒。只有环境变量使用秒（会自动转换）。

### Q3: 我之前用毫秒配置的，会出问题吗？

**A**: 会。如果你的 .env 文件中 `API_CRAWLER_INTERVAL=300000`，更新代码后会被解释为 300000 秒（83.3 小时），导致爬虫几乎不执行。

**解决方法**：将 .env 中的值改为秒，例如 `API_CRAWLER_INTERVAL=300`。

### Q4: 如何验证配置生效？

**A**: 查看 Worker 启动日志：

```
✅ API 爬虫已自动启动 (账户: account-123, 间隔: 300000ms)
```

如果看到 `300000ms`（5分钟），说明配置正确。

---

## 相关文档

- [API爬虫使用指南](./API爬虫使用指南.md)
- [API爬虫配置说明](./API爬虫配置说明.md)
- [抖音API层重构总结](./抖音API层重构总结.md)

---

**文档版本**: v1.0
**最后更新**: 2025-11-27
**维护者**: HISCRM-IM 开发团队
