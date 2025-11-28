# API 爬虫启动流程优化

## 修改时间
2025-11-27

## 修改目的
将 API 爬虫的启动流程改为与其他爬虫（实时监控、MonitorTask）一致，由登录检测任务统一管理，确保：
1. 浏览器和Tab已经创建
2. 账户已登录
3. Cookie已准备好

## 修改前的问题
**旧流程**：API 爬虫在账户初始化时就自动启动
```javascript
// platform.js - initializeAPICrawler()
if (config.apiCrawlerAutoStart !== false) {
    await crawler.start();  // ❌ 账户初始化时启动
}
```

**存在的问题**：
- 账户初始化时，浏览器/Tab可能还未创建
- 账户可能还未登录
- Cookie可能还未准备好
- 导致API爬虫执行失败：`无法获取常驻tab`

## 修改后的流程
**新流程**：API 爬虫由登录检测任务启动（与其他爬虫一致）

### 1. 账户初始化阶段（platform.js）
```javascript
// 只创建实例，不自动启动
const crawler = new DouyinAPICrawler(this, account, crawlerConfig);
logger.info(`✅ API 爬虫已创建（等待登录检测启动）`);
this.apiCrawlers.set(account.id, crawler);
```

### 2. 登录检测成功时启动（login-detection-task.js）
```javascript
// onLoginStatusChanged('logged_in')
// 1. 启动爬虫任务（MonitorTask）
// 2. 启动实时监控任务（RealtimeMonitor）
// 3. 启动 API 爬虫（DouyinAPICrawler）⭐ 新增
await platformInstance.startAPICrawler(this.account.id);
logger.info(`✓ API crawler started for account ${this.account.id}`);
```

### 3. 登录失败时停止（login-detection-task.js）
```javascript
// onLoginStatusChanged('not_logged_in')
// 1. 停止爬虫任务（MonitorTask）
// 2. 停止实时监控任务（RealtimeMonitor）
// 3. 停止 API 爬虫（DouyinAPICrawler）⭐ 新增
await platformInstance.stopAPICrawler(this.account.id);
logger.info(`✓ API crawler stopped for account ${this.account.id}`);
```

### 4. Tab清理（login-detection-task.js）
```javascript
// cleanupAllTaskTabs()
const tabsToClose = [
    TabTag.SPIDER_COMMENT,
    TabTag.SPIDER_DM,
    TabTag.REALTIME_MONITOR,
    TabTag.REPLY_COMMENT,
    TabTag.REPLY_DM,
    'api_crawler'  // ⭐ 新增
];
```

## 修改文件清单
1. `packages/worker/src/platforms/douyin/platform.js`
   - 修改 `initializeAPICrawler()` 方法，移除自动启动逻辑

2. `packages/worker/src/handlers/login-detection-task.js`
   - 在 `onLoginStatusChanged('logged_in')` 中添加启动API爬虫
   - 在 `onLoginStatusChanged('not_logged_in')` 中添加停止API爬虫
   - 在 `cleanupAllTaskTabs()` 中添加清理API爬虫tab

3. `packages/worker/src/platforms/douyin/crawler-api.js`
   - 修改 `getPersistentPage()` 方法，使用专门的 'api_crawler' tag
   - 如果tab不存在，自动创建并导航到创作者中心

## 启动时序图
```
账户初始化
    ↓
创建API爬虫实例（不启动）
    ↓
登录检测任务启动
    ↓
【2秒后】首次登录检测
    ↓
检测到已登录？
    ├─ 是 → 启动所有任务（MonitorTask + RealtimeMonitor + APICrawler）
    └─ 否 → 继续检测（每30秒）
         ↓
     检测到已登录 → 启动所有任务
```

## 测试验证
**测试步骤**：
1. 重启Master和Worker服务
2. 观察Worker日志
3. 验证API爬虫在登录检测成功后启动

**预期日志**：
```
✅ API 爬虫已创建（等待登录检测启动）(账户: acc-xxx, 间隔: 30000ms)
⏰ First login check will run in 2s
✓ API crawler started for account acc-xxx
[douyin-crawler-api] ========== 开始API爬取 ==========
```

## 优势
1. **统一管理**：所有任务（MonitorTask、RealtimeMonitor、APICrawler）统一由登录检测启动
2. **确保可用性**：启动时浏览器、Tab、Cookie都已准备好
3. **自动恢复**：登录状态恢复时，API爬虫也会自动重启
4. **清理一致性**：登录失败时，所有任务都会停止并清理

## 后续优化建议
- 可以考虑将API爬虫的健康检查也加入到`checkRealtimeMonitorHealth()`方法中
- 如果API爬虫tab意外关闭，可以自动恢复

---

**文档版本**: v1.0
**最后更新**: 2025-11-27
**维护者**: HISCRM-IM 开发团队
