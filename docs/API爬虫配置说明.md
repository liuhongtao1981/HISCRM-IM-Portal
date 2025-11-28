# API 爬虫配置说明

## 配置文件位置

**环境变量配置**: `packages/worker/.env`

---

## 完整配置参数

### 1. 基础配置

```bash
# 是否启用 API 爬虫
API_CRAWLER_ENABLED=true

# 执行间隔（秒）
API_CRAWLER_INTERVAL=300

# 是否自动启动
API_CRAWLER_AUTO_START=true
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `API_CRAWLER_ENABLED` | Boolean | `true` | 全局开关，关闭后所有账户的 API 爬虫都不会启动 |
| `API_CRAWLER_INTERVAL` | Number | `300` | 执行间隔（秒），5 分钟 = 300 秒 |
| `API_CRAWLER_AUTO_START` | Boolean | `true` | 账户初始化时是否自动启动爬虫 |

### 2. 作品抓取配置

```bash
# 每页作品数量
API_CRAWLER_WORKS_PAGE_SIZE=50

# 最多抓取页数
API_CRAWLER_WORKS_MAX_PAGES=50
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `API_CRAWLER_WORKS_PAGE_SIZE` | Number | `50` | 每次请求获取的作品数量 |
| `API_CRAWLER_WORKS_MAX_PAGES` | Number | `50` | 最多抓取多少页（防止无限循环）|

**计算总作品数**:
```
最多抓取作品数 = API_CRAWLER_WORKS_PAGE_SIZE × API_CRAWLER_WORKS_MAX_PAGES
默认: 50 × 50 = 2500 个作品
```

### 3. 评论抓取配置

```bash
# 是否抓取评论
API_CRAWLER_COMMENTS_ENABLED=true

# 每页评论数量
API_CRAWLER_COMMENTS_PAGE_SIZE=20

# 每个作品最多抓取页数
API_CRAWLER_COMMENTS_MAX_PAGES=25

# 每个作品最多抓取评论数
API_CRAWLER_COMMENTS_MAX_COMMENTS=500
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `API_CRAWLER_COMMENTS_ENABLED` | Boolean | `true` | 是否抓取评论（关闭可节省时间）|
| `API_CRAWLER_COMMENTS_PAGE_SIZE` | Number | `20` | 每次请求获取的评论数量 |
| `API_CRAWLER_COMMENTS_MAX_PAGES` | Number | `25` | 每个作品最多抓取多少页评论 |
| `API_CRAWLER_COMMENTS_MAX_COMMENTS` | Number | `500` | 每个作品最多抓取多少条评论（优先级高于 MAX_PAGES）|

**计算逻辑**:
```javascript
每个作品最多评论数 = Math.min(
    API_CRAWLER_COMMENTS_PAGE_SIZE × API_CRAWLER_COMMENTS_MAX_PAGES,
    API_CRAWLER_COMMENTS_MAX_COMMENTS
)
默认: Math.min(20 × 25, 500) = 500 条
```

### 4. 二级评论抓取配置

```bash
# 是否抓取二级评论
API_CRAWLER_REPLIES_ENABLED=true

# 每页二级评论数量
API_CRAWLER_REPLIES_PAGE_SIZE=20

# 每个一级评论最多抓取页数
API_CRAWLER_REPLIES_MAX_PAGES=5

# 每个一级评论最多抓取数量
API_CRAWLER_REPLIES_MAX_REPLIES=100
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `API_CRAWLER_REPLIES_ENABLED` | Boolean | `true` | 是否抓取二级评论（关闭可节省大量时间）|
| `API_CRAWLER_REPLIES_PAGE_SIZE` | Number | `20` | 每次请求获取的二级评论数量 |
| `API_CRAWLER_REPLIES_MAX_PAGES` | Number | `5` | 每个一级评论最多抓取多少页 |
| `API_CRAWLER_REPLIES_MAX_REPLIES` | Number | `100` | 每个一级评论最多抓取多少条（优先级高于 MAX_PAGES）|

### 5. 延迟配置

```bash
# 作品之间的延迟（毫秒）
API_CRAWLER_DELAY_BETWEEN_WORKS=2000

# 评论分页之间的延迟（毫秒）
API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES=1000

# 二级评论之间的延迟（毫秒）
API_CRAWLER_DELAY_BETWEEN_REPLIES=500
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `API_CRAWLER_DELAY_BETWEEN_WORKS` | Number | `2000` | 处理作品之间的等待时间（防止频繁请求）|
| `API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES` | Number | `1000` | 评论分页请求之间的等待时间 |
| `API_CRAWLER_DELAY_BETWEEN_REPLIES` | Number | `500` | 二级评论请求之间的等待时间 |

**重要**: 延迟是防抓取的关键，不建议设置低于默认值。

---

## 配置优先级

### 1. 环境变量 (.env)

**作用范围**: 所有账户的默认值

**修改生效**: 需要重启 Worker 进程

**配置位置**: `packages/worker/.env`

### 2. 数据库配置 (monitoring_config)

**作用范围**: 单个账户

**修改生效**: 立即生效（无需重启）

**配置位置**: `accounts` 表的 `monitoring_config` 字段

**配置格式**:
```json
{
    "apiCrawlerInterval": 600000,
    "apiCrawlerCommentsMaxPages": 10
}
```

### 3. 优先级规则

```
数据库配置 > 环境变量配置 > 代码默认值
```

**示例**:
```bash
# .env 文件
API_CRAWLER_INTERVAL=300  # 5 分钟

# 数据库 (account-123)
monitoring_config = '{"apiCrawlerInterval": 600000}'  # 10 分钟

# 结果
account-123 使用 10 分钟间隔（数据库配置优先）
其他账户使用 5 分钟间隔（.env 默认值）
```

---

## 配置映射关系

### 环境变量 → 代码配置

| 环境变量 | 代码配置字段 | 数据库字段 |
|---------|-------------|-----------|
| `API_CRAWLER_ENABLED` | `enableAPICrawler` | `enableAPICrawler` |
| `API_CRAWLER_INTERVAL` | `apiCrawlerInterval` | `apiCrawlerInterval` |
| `API_CRAWLER_AUTO_START` | `apiCrawlerAutoStart` | `apiCrawlerAutoStart` |
| `API_CRAWLER_WORKS_PAGE_SIZE` | `apiCrawlerWorksPageSize` | `apiCrawlerWorksPageSize` |
| `API_CRAWLER_WORKS_MAX_PAGES` | `apiCrawlerWorksMaxPages` | `apiCrawlerWorksMaxPages` |
| `API_CRAWLER_COMMENTS_ENABLED` | `apiCrawlerCommentsEnabled` | `apiCrawlerCommentsEnabled` |
| `API_CRAWLER_COMMENTS_PAGE_SIZE` | `apiCrawlerCommentsPageSize` | `apiCrawlerCommentsPageSize` |
| `API_CRAWLER_COMMENTS_MAX_PAGES` | `apiCrawlerCommentsMaxPages` | `apiCrawlerCommentsMaxPages` |
| `API_CRAWLER_COMMENTS_MAX_COMMENTS` | `apiCrawlerCommentsMaxComments` | `apiCrawlerCommentsMaxComments` |
| `API_CRAWLER_REPLIES_ENABLED` | `apiCrawlerRepliesEnabled` | `apiCrawlerRepliesEnabled` |
| `API_CRAWLER_REPLIES_PAGE_SIZE` | `apiCrawlerRepliesPageSize` | `apiCrawlerRepliesPageSize` |
| `API_CRAWLER_REPLIES_MAX_PAGES` | `apiCrawlerRepliesMaxPages` | `apiCrawlerRepliesMaxPages` |
| `API_CRAWLER_REPLIES_MAX_REPLIES` | `apiCrawlerRepliesMaxReplies` | `apiCrawlerRepliesMaxReplies` |
| `API_CRAWLER_DELAY_BETWEEN_WORKS` | `apiCrawlerDelayBetweenWorks` | `apiCrawlerDelayBetweenWorks` |
| `API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES` | `apiCrawlerDelayBetweenCommentPages` | `apiCrawlerDelayBetweenCommentPages` |
| `API_CRAWLER_DELAY_BETWEEN_REPLIES` | `apiCrawlerDelayBetweenReplies` | `apiCrawlerDelayBetweenReplies` |

---

## 推荐配置

### 场景 1: 小账户（< 100 作品）

**`.env` 配置**:
```bash
API_CRAWLER_INTERVAL=300000                     # 5 分钟
API_CRAWLER_WORKS_MAX_PAGES=10
API_CRAWLER_COMMENTS_MAX_PAGES=10
API_CRAWLER_REPLIES_ENABLED=true
```

**预计耗时**: 每次 20-30 秒

### 场景 2: 中等账户（100-1000 作品）

**`.env` 配置**:
```bash
API_CRAWLER_INTERVAL=600  # 10 分钟
API_CRAWLER_WORKS_MAX_PAGES=20
API_CRAWLER_COMMENTS_MAX_PAGES=25
API_CRAWLER_REPLIES_MAX_PAGES=5
```

**预计耗时**: 每次 1-2 分钟

### 场景 3: 大账户（> 1000 作品）

**`.env` 配置**:
```bash
API_CRAWLER_INTERVAL=1800  # 30 分钟
API_CRAWLER_WORKS_MAX_PAGES=50
API_CRAWLER_COMMENTS_MAX_PAGES=50
API_CRAWLER_REPLIES_ENABLED=false               # 关闭二级评论
```

**预计耗时**: 每次 3-5 分钟

### 场景 4: 仅作品统计

**`.env` 配置**:
```bash
API_CRAWLER_INTERVAL=3600  # 1 小时
API_CRAWLER_COMMENTS_ENABLED=false              # 不抓取评论
API_CRAWLER_REPLIES_ENABLED=false               # 不抓取二级评论
```

**预计耗时**: 每次 5-10 秒

---

## 性能影响

### 1. 间隔时间

| 间隔 | 影响 | 推荐场景 |
|------|------|---------|
| 1 分钟 | 高频请求，可能触发限流 | ⚠️ 不推荐 |
| 5 分钟 | 平衡性能和实时性 | ✅ 小账户 |
| 10 分钟 | 适中，推荐使用 | ✅ 中等账户 |
| 30 分钟 | 低频，节省资源 | ✅ 大账户 |
| 1 小时 | 仅定期同步 | ✅ 统计场景 |

### 2. 分页数量

**作品分页**:
```
50 个/页 × 50 页 = 2500 个作品
预计请求时间: 5-10 秒
```

**评论分页**:
```
20 条/页 × 25 页 × 100 个作品 = 50000 条评论
预计请求时间: 30-60 秒
```

**二级评论**:
```
20 条/页 × 5 页 × 500 条一级评论 = 50000 条二级评论
预计请求时间: 20-40 秒
```

### 3. 延迟设置

**总延迟时间计算**:
```
总延迟 = 作品延迟 × 作品数 + 评论延迟 × 评论页数 + 回复延迟 × 回复数

示例（100 个作品）:
= 2000ms × 100 + 1000ms × 2500 + 500ms × 500
= 200秒 + 2500秒 + 250秒
= 2950秒 ≈ 49 分钟

实际可能更少（并非所有作品都有评论）
```

---

## 配置修改指南

### 修改 .env 配置

1. 编辑 `packages/worker/.env` 文件
2. 修改相应参数
3. 重启 Worker 进程

```bash
# 停止 Worker
pm2 stop hiscrm-worker

# 启动 Worker
pm2 start hiscrm-worker

# 或重启
pm2 restart hiscrm-worker
```

### 修改数据库配置

```sql
-- 为单个账户配置
UPDATE accounts
SET monitoring_config = JSON_SET(
    COALESCE(monitoring_config, '{}'),
    '$.apiCrawlerInterval', 600000,
    '$.apiCrawlerCommentsMaxPages', 10
)
WHERE id = 'account-123';

-- 批量配置（所有抖音账户）
UPDATE accounts
SET monitoring_config = JSON_SET(
    COALESCE(monitoring_config, '{}'),
    '$.apiCrawlerInterval', 600000
)
WHERE platform = 'douyin';
```

**无需重启**，下次爬虫执行时自动生效。

---

## 故障排查

### 问题 1: 配置不生效

**检查步骤**:
```bash
# 1. 确认 .env 文件已修改
cat packages/worker/.env | grep API_CRAWLER

# 2. 确认 Worker 已重启
pm2 logs hiscrm-worker | grep "API 爬虫"

# 3. 检查数据库配置
SELECT monitoring_config FROM accounts WHERE id = 'account-123';
```

### 问题 2: 爬虫未启动

**可能原因**:
1. `API_CRAWLER_ENABLED=false`
2. `API_CRAWLER_AUTO_START=false`
3. 数据库中配置了 `enableAPICrawler: false`

**解决方法**:
```bash
# 检查 .env
grep API_CRAWLER_ENABLED packages/worker/.env

# 手动启动
await platform.startAPICrawler(accountId);
```

### 问题 3: 执行过慢

**优化建议**:
1. 减少分页数量：`API_CRAWLER_COMMENTS_MAX_PAGES`
2. 关闭二级评论：`API_CRAWLER_REPLIES_ENABLED=false`
3. 增加间隔：`API_CRAWLER_INTERVAL=1800`（30 分钟）
4. 减少延迟（谨慎）：`API_CRAWLER_DELAY_BETWEEN_COMMENT_PAGES=500`

---

## 相关文档

- [API爬虫使用指南](./API爬虫使用指南.md)
- [API爬虫集成实现总结](./API爬虫集成实现总结.md)
- [API爬虫完整实现总结](./API爬虫完整实现总结.md)

---

**文档版本**: v1.0
**最后更新**: 2025-11-27
**维护者**: HISCRM-IM 开发团队
