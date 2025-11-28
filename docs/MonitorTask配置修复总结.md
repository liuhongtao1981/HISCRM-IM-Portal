# MonitorTask 配置修复总结

**日期**: 2025-11-28
**修复范围**: MonitorTask 和 LoginDetectionTask 配置读取逻辑

---

## 问题描述

用户报告了以下问题：

1. **配置不生效**: 在 `config.json` 中设置 `commentCrawler.enabled: false`，但评论爬虫仍然运行
2. **两个爬虫同时执行**: MonitorTask 每 30 秒同时调用评论爬虫和私信爬虫
3. **常驻任务没启动**: 实时监控任务 (startRealtimeMonitor) 没有根据配置启动

**用户原话**：
> "还是执行了2个爬虫，常驻任务，没有启动，因为配置文件里没有设置，你就没启动干嘛"

---

## 根本原因分析

### 问题 1: 配置读取错误

**位置**: `packages/worker/src/handlers/monitor-task.js:53-89`

**原因**:
```javascript
// 旧代码：从已删除的环境变量读取
const envMinInterval = parseFloat(process.env.CRAWL_INTERVAL_MIN) || 0.5;
const envMaxInterval = parseFloat(process.env.CRAWL_INTERVAL_MAX) || 0.5;
```

- 环境变量 `CRAWL_INTERVAL_MIN` 和 `CRAWL_INTERVAL_MAX` 已在之前的迁移中删除
- 默认值 0.5 分钟 = 30 秒，导致 MonitorTask 每 30 秒执行一次
- 代码还尝试从 `account.monitoring_config` 读取，但用户明确要求 "这些跟平台有关的参数，不要走数据的配置"

### 问题 2: 无条件调用爬虫

**位置**: `packages/worker/src/handlers/monitor-task.js:205-233`

**原因**:
```javascript
// 旧代码：无条件调用
const [commentResult, dmResult] = await Promise.all([
  this.platformInstance.crawlComments(this.account),
  this.platformInstance.crawlDirectMessages(this.account),
]);
```

- `execute()` 方法无条件调用评论和私信爬虫
- 不检查 `config.crawlers.commentCrawler.enabled` 和 `config.crawlers.dmCrawler.enabled` 标志

### 问题 3: 无条件启动实时监控

**位置**:
- `packages/worker/src/handlers/monitor-task.js:131-140`
- `packages/worker/src/handlers/login-detection-task.js:349-360`

**原因**:
```javascript
// 旧代码：无条件启动
if (platformInstance && typeof platformInstance.startRealtimeMonitor === 'function') {
  await platformInstance.startRealtimeMonitor(this.account);
}
```

- MonitorTask.start() 和 LoginDetectionTask.onLoginStatusChanged() 都无条件调用 startRealtimeMonitor
- 不检查 `commentCrawler.enabled` 配置

---

## 解决方案

### 1. parseMonitoringConfig() - 从平台配置文件读取

**修改前**:
```javascript
parseMonitoringConfig() {
  // 从环境变量读取
  const envMinInterval = parseFloat(process.env.CRAWL_INTERVAL_MIN) || 0.5;
  const envMaxInterval = parseFloat(process.env.CRAWL_INTERVAL_MAX) || 0.5;

  let minInterval = envMinInterval * 60;  // 分钟转秒
  let maxInterval = envMaxInterval * 60;

  // 从 account.monitoring_config 覆盖
  if (this.account.monitoring_config) {
    const config = JSON.parse(this.account.monitoring_config);
    if (config.crawlIntervalMin !== undefined) {
      minInterval = config.crawlIntervalMin * 60;
    }
    if (config.crawlIntervalMax !== undefined) {
      maxInterval = config.crawlIntervalMax * 60;
    }
  }

  this.minInterval = minInterval;
  this.maxInterval = maxInterval;
}
```

**修改后**:
```javascript
parseMonitoringConfig() {
  // 从平台配置文件读取爬虫配置
  const platformInstance = this.platformManager.getPlatform(this.account.platform);
  const crawlersConfig = platformInstance.config.crawlers || {};

  // 读取评论爬虫配置
  const commentCfg = crawlersConfig.commentCrawler || {};

  // 读取间隔配置（秒）
  const minIntervalSec = (commentCfg.interval?.min ?? 60);
  const maxIntervalSec = (commentCfg.interval?.max ?? 600);

  // 保存间隔配置（毫秒）
  this.minInterval = minIntervalSec * 1000;
  this.maxInterval = maxIntervalSec * 1000;

  // 保存启用标志
  this.enableCommentCrawler = commentCfg.enabled ?? true;
  this.enableDMCrawler = (crawlersConfig.dmCrawler || {}).enabled ?? true;

  logger.info(`📋 从平台配置加载 MonitorTask 间隔: ${minIntervalSec}-${maxIntervalSec}秒 (账户: ${this.account.id})`);
  logger.info(`📋 爬虫启用状态 - 评论: ${this.enableCommentCrawler}, 私信: ${this.enableDMCrawler} (账户: ${this.account.id})`);
}
```

**关键改进**:
- ✅ 从平台配置文件读取：`config.crawlers.commentCrawler.interval`
- ✅ 删除环境变量读取
- ✅ 删除数据库配置覆盖
- ✅ 保存启用标志：`enableCommentCrawler`, `enableDMCrawler`
- ✅ 直接保存为毫秒，避免后续转换

---

### 2. getRandomInterval() - 修复重复乘法 Bug

**修改前**:
```javascript
getRandomInterval() {
  const randomSeconds = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
  return Math.floor(randomSeconds * 1000);  // BUG: 已经是毫秒了
}
```

**修改后**:
```javascript
getRandomInterval() {
  const randomMs = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);
  return Math.floor(randomMs);
}
```

**关键改进**:
- ✅ 删除重复的 `* 1000`（minInterval/maxInterval 已经是毫秒）

---

### 3. execute() - 条件执行爬虫

**修改前**:
```javascript
const [commentResult, dmResult] = await Promise.all([
  // 无条件调用评论爬虫
  this.platformInstance.crawlComments(this.account),
  // 无条件调用私信爬虫
  this.platformInstance.crawlDirectMessages(this.account),
]);
```

**修改后**:
```javascript
// 准备爬虫任务数组
const crawlerTasks = [];

// 1. 爬取评论（如果配置启用）
let commentResult = { comments: [], stats: {} };
if (this.enableCommentCrawler) {
  crawlerTasks.push(
    (async () => {
      try {
        logger.info(`Spider2 (Comments) started for account ${this.account.id}`);
        const result = await this.platformInstance.crawlComments(this.account);
        logger.info(`Spider2 (Comments) completed for account ${this.account.id}`);
        return { type: 'comment', result };
      } catch (error) {
        logger.error(`Spider2 (Comments) failed: ${error.message}`);
        return { type: 'comment', result: { comments: [], stats: {} } };
      }
    })()
  );
} else {
  logger.info(`⏭️  跳过评论爬虫 (commentCrawler.enabled = false)`);
}

// 2. 爬取私信（如果配置启用）
let dmResult = { directMessages: [], conversations: [], stats: {} };
if (this.enableDMCrawler) {
  crawlerTasks.push(
    (async () => {
      try {
        logger.info(`Spider1 (DM) started for account ${this.account.id}`);
        const result = await this.platformInstance.crawlDirectMessages(this.account);
        logger.info(`Spider1 (DM) completed for account ${this.account.id}`);
        return { type: 'dm', result };
      } catch (error) {
        logger.error(`Spider1 (DM) failed: ${error.message}`);
        return { type: 'dm', result: { directMessages: [], conversations: [], stats: {} } };
      }
    })()
  );
} else {
  logger.info(`⏭️  跳过私信爬虫 (dmCrawler.enabled = false)`);
}

// 3. 并行执行启用的爬虫
if (crawlerTasks.length > 0) {
  const results = await Promise.all(crawlerTasks);
  // 分配结果
  results.forEach(({ type, result }) => {
    if (type === 'comment') {
      commentResult = result;
    } else if (type === 'dm') {
      dmResult = result;
    }
  });
}
```

**关键改进**:
- ✅ 检查 `enableCommentCrawler` 再调用 crawlComments
- ✅ 检查 `enableDMCrawler` 再调用 crawlDirectMessages
- ✅ 使用动态 Promise.all，只执行启用的爬虫
- ✅ 添加清晰的日志：`⏭️ 跳过评论/私信爬虫 (配置禁用时)`
- ✅ 错误处理：爬虫失败返回空结果而不是抛出异常

---

### 4. MonitorTask.start() - 条件启动实时监控

**修改前**:
```javascript
// 无条件启动
if (this.account.platform === 'douyin' && typeof platformInstance.startRealtimeMonitor === 'function') {
  await platformInstance.startRealtimeMonitor(this.account);
}
```

**修改后**:
```javascript
// ⭐ 启动实时监控（如果平台支持且配置启用）
// 注意：实时监控 (startRealtimeMonitor) 对应 commentCrawler 配置
if (this.account.platform === 'douyin' && typeof platformInstance.startRealtimeMonitor === 'function') {
  if (this.enableCommentCrawler) {
    try {
      logger.info(`🚀 启动实时监控 (账户: ${this.account.id})...`);
      await platformInstance.startRealtimeMonitor(this.account);
      logger.info(`✅ 实时监控已启动 (账户: ${this.account.id})`);
    } catch (error) {
      logger.error(`⚠️  实时监控启动失败 (账户: ${this.account.id}):`, error);
    }
  } else {
    logger.info(`⏭️  跳过实时监控 (commentCrawler.enabled = false)`);
  }
}
```

**关键改进**:
- ✅ 检查 `enableCommentCrawler` 再启动实时监控
- ✅ 添加清晰的日志：`⏭️ 跳过实时监控 (配置禁用时)`

---

### 5. LoginDetectionTask.onLoginStatusChanged() - 条件启动实时监控

**修改前**:
```javascript
// 无条件启动
if (platformInstance && typeof platformInstance.startRealtimeMonitor === 'function') {
  await platformInstance.startRealtimeMonitor(this.account);
}
```

**修改后**:
```javascript
// 2. 启动实时监控任务（常驻任务）- 需要检查配置是否启用
if (this.platformManager) {
  const platformInstance = this.platformManager.getPlatform(this.account.platform);
  if (platformInstance && typeof platformInstance.startRealtimeMonitor === 'function') {
    // 检查 commentCrawler 配置是否启用
    const crawlersConfig = platformInstance.config.crawlers || {};
    const commentCfg = crawlersConfig.commentCrawler || {};
    const enableCommentCrawler = commentCfg.enabled ?? true;

    if (enableCommentCrawler) {
      try {
        await platformInstance.startRealtimeMonitor(this.account);
        logger.info(`✓ Realtime monitor started for account ${this.account.id}`);
      } catch (error) {
        logger.warn(`Failed to start realtime monitor: ${error.message}`);
      }
    } else {
      logger.info(`⏭️  跳过实时监控 (commentCrawler.enabled = false)`);
    }
  }
}
```

**关键改进**:
- ✅ 从平台配置读取 `commentCrawler.enabled`
- ✅ 检查配置再启动实时监控
- ✅ 添加清晰的日志

---

## 配置优先级

**新的配置优先级**:
```
平台配置文件 (config.json) > 所有其他来源
```

**配置来源对比**:

| 配置来源 | 旧版本 | 新版本 |
|---------|--------|--------|
| 环境变量 (.env) | ✅ 使用 | ❌ 不使用 |
| 数据库 (account.monitoring_config) | ✅ 覆盖 | ❌ 不使用 |
| 平台配置文件 (config.json) | ⚠️ 未使用 | ✅ 唯一来源 |

---

## 测试场景

### 场景 1: commentCrawler 禁用

**配置**:
```json
{
  "crawlers": {
    "commentCrawler": {
      "enabled": false,
      "interval": { "min": 60, "max": 600 }
    }
  }
}
```

**预期行为**:
- ✅ MonitorTask 不调用 crawlComments
- ✅ 不启动实时监控 (startRealtimeMonitor)
- ✅ 日志显示：`⏭️ 跳过评论爬虫 (commentCrawler.enabled = false)`
- ✅ 日志显示：`⏭️ 跳过实时监控 (commentCrawler.enabled = false)`

### 场景 2: dmCrawler 禁用

**配置**:
```json
{
  "crawlers": {
    "dmCrawler": {
      "enabled": false,
      "interval": { "min": 60, "max": 600 }
    }
  }
}
```

**预期行为**:
- ✅ MonitorTask 不调用 crawlDirectMessages
- ✅ 日志显示：`⏭️ 跳过私信爬虫 (dmCrawler.enabled = false)`

### 场景 3: 自定义间隔

**配置**:
```json
{
  "crawlers": {
    "commentCrawler": {
      "enabled": true,
      "interval": { "min": 120, "max": 300 }
    }
  }
}
```

**预期行为**:
- ✅ MonitorTask 每 120-300 秒（2-5 分钟）执行一次
- ✅ 日志显示：`📋 从平台配置加载 MonitorTask 间隔: 120-300秒`

### 场景 4: 默认配置

**配置**:
```json
{
  "crawlers": {
    "commentCrawler": {
      "enabled": true,
      "interval": { "min": 60, "max": 600 }
    }
  }
}
```

**预期行为**:
- ✅ MonitorTask 每 60-600 秒（1-10 分钟）执行一次
- ✅ 同时执行评论和私信爬虫
- ✅ 启动实时监控

---

## 文件变更汇总

### 修改的文件

1. **packages/worker/src/handlers/monitor-task.js**
   - `parseMonitoringConfig()`: 40 行删除，27 行新增
   - `getRandomInterval()`: 2 行修改
   - `execute()`: 33 行删除，62 行新增
   - `start()`: 9 行删除，15 行新增
   - **总计**: 106 行新增，79 行删除

2. **packages/worker/src/handlers/login-detection-task.js**
   - `onLoginStatusChanged()`: 12 行删除，22 行新增

### 相关文件

以下文件在之前的修复中已更新，无需再次修改：

1. ✅ `packages/worker/src/platforms/douyin/platform.js` - 已删除 account.monitoring_config 覆盖
2. ✅ `packages/worker/.env` - 已删除爬虫配置环境变量
3. ✅ `packages/worker/src/platforms/douyin/config.json` - 平台配置文件

---

## 验证步骤

### 1. 重启 Worker

```bash
# 停止所有 Worker 进程
cmd.exe /c "taskkill /F /IM node.exe"

# 启动 Worker
cd packages/worker && npm start
```

### 2. 检查日志

启动后应该看到：

```
📋 从平台配置加载 MonitorTask 间隔: 60-600秒 (账户: xxx)
📋 爬虫启用状态 - 评论: false, 私信: true (账户: xxx)
⏭️  跳过评论爬虫 (commentCrawler.enabled = false)
⏭️  跳过实时监控 (commentCrawler.enabled = false)
```

### 3. 验证浏览器行为

- ✅ 不应该打开评论管理页面（`tag=spider_comment`）
- ✅ 应该打开私信页面（如果 dmCrawler.enabled = true）

### 4. 验证 MonitorTask 间隔

```bash
# 观察日志中的 MonitorTask 执行间隔
# 应该是 60-600 秒，而不是 30 秒
```

---

## 清理数据库配置（可选）

如果之前在数据库中设置了账户级别的 `monitoring_config`，可以使用以下 SQL 清空：

```sql
-- 清空所有账户的 monitoring_config 字段
UPDATE accounts SET monitoring_config = NULL;
```

参考文档：`tests/清空账户监控配置.sql`

---

## 相关文档

- [抖音平台爬虫配置说明](./抖音平台爬虫配置说明.md)
- [爬虫配置优先级说明](./爬虫配置优先级说明.md)
- [API爬虫使用指南](./API爬虫使用指南.md)

---

## 总结

### 修复前的问题

1. ❌ MonitorTask 从已删除的环境变量读取配置
2. ❌ MonitorTask 每 30 秒执行一次（默认值）
3. ❌ 无条件调用评论和私信爬虫，不检查配置
4. ❌ 无条件启动实时监控，不检查配置
5. ❌ 用户无法通过 config.json 控制爬虫行为

### 修复后的改进

1. ✅ MonitorTask 从平台配置文件读取配置
2. ✅ 默认间隔 60-600 秒（可在 config.json 配置）
3. ✅ 检查配置再调用爬虫，支持独立启用/禁用
4. ✅ 检查配置再启动实时监控
5. ✅ 用户通过 config.json 完全控制爬虫行为
6. ✅ 配置优先级清晰：config.json > 所有其他来源
7. ✅ 日志清晰，易于调试

### 配置示例

**仅使用私信爬虫**:
```json
{
  "crawlers": {
    "commentCrawler": { "enabled": false },
    "dmCrawler": { "enabled": true, "interval": { "min": 60, "max": 600 } },
    "apiCrawler": { "enabled": false }
  }
}
```

**仅使用 API 爬虫**:
```json
{
  "crawlers": {
    "commentCrawler": { "enabled": false },
    "dmCrawler": { "enabled": false },
    "apiCrawler": { "enabled": true, "autoStart": true, "interval": 120 }
  }
}
```

**全部启用**:
```json
{
  "crawlers": {
    "commentCrawler": { "enabled": true, "interval": { "min": 120, "max": 300 } },
    "dmCrawler": { "enabled": true, "interval": { "min": 60, "max": 600 } },
    "apiCrawler": { "enabled": true, "autoStart": true, "interval": 120 }
  }
}
```

---

**修复完成时间**: 2025-11-28
**提交哈希**: `47daafd`
**修改文件数**: 2
**新增代码行**: 106
**删除代码行**: 79
